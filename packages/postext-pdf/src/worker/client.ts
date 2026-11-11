/**
 * `postext-pdf/worker`: write PDFs on a worker.
 * `createPdfWorker().render(doc, options)` takes what `renderToPdf` takes and
 * returns the same bytes, with the page left free while the book renders.
 *
 * @module
 */

import type { VDTDocument } from 'postext';
import { declarationOf, type PdfFontProvider } from '../fontCache.js';
import type { RenderToPdfOptions } from '../pdf-backend/index.js';
import { sourceBase } from '../harfbuzz.js';
import { rasterizeSvgWithDom, type SvgRasterizer } from '../pdf-backend/blocks/renderResourceBlock.js';
import type { PdfRequestMessage, PdfResponseMessage } from './protocol.js';
import type { PrintPdfReport } from '../print/inspectPdf.js';

export type { PrintPdfReport, PrintPdfFont, PrintPdfRgbUse } from '../print/inspectPdf.js';

export type {
  PdfWarning,
  PdfFontWarning,
  PdfFontFallbackWarning,
  PdfMissingGlyphWarning,
  PdfVariableFontWarning,
  PdfCffEmbeddedWholeWarning,
  RenderProgress,
} from '../pdf-backend/index.js';

/** Options of a render on the worker: those of `renderToPdf`, with image
 *  bytes, SVG rasterizing and fonts in the form that crosses to the worker. */
export interface PdfWorkerRenderOptions extends Omit<RenderToPdfOptions, 'resourceBytes' | 'rasterizeSvg'> {
  /** Resource bytes by file id. Their buffers are transferred: pass copies
   *  if the caller keeps them. */
  resourceBytes?: Map<string, Uint8Array>;
  /** How the host rasterises an SVG for the worker; the document's `Image`
   *  by default. */
  rasterizeSvg?: SvgRasterizer;
  /** Called with the finished document's font provider results too. */
  fontProvider: PdfFontProvider;
}

/** A running PDF worker: `render` a document on it, `dispose` to end it. */
export interface PdfWorkerHandle {
  /** Render on the worker. Fonts and SVG rasters are fetched on this
   *  thread when the worker asks (it cannot reach the document's fonts or
   *  decode SVG); everything else — text, vector figures, the structure
   *  tree, the file itself — is written off the main thread. */
  render(docs: VDTDocument | VDTDocument[], options: PdfWorkerRenderOptions): Promise<Uint8Array>;
  /** Read a finished PDF back on the worker (`inspectPrintPdf`: boxes,
   *  fonts, inks, PDF/X); undefined when it cannot be read. The bytes are
   *  copied, so the caller keeps its own. */
  inspect(bytes: Uint8Array): Promise<PrintPdfReport | undefined>;
  dispose(): void;
}

/** Options of `createPdfWorker`. */
export interface CreatePdfWorkerOptions {
  /** A Worker of the caller's own, for build tooling that controls the
   *  worker URL. */
  worker?: Worker;
}

interface Pending {
  resolve: (bytes: Uint8Array) => void;
  reject: (err: unknown) => void;
  options: PdfWorkerRenderOptions;
}

/** Start a worker that writes PDFs, so that the page stays free while a book
 *  renders. */
export function createPdfWorker(options?: CreatePdfWorkerOptions): PdfWorkerHandle {
  const worker = options?.worker
    ?? new Worker(new URL('./pdf.worker.js', import.meta.url), { type: 'module' });
  let nextId = 1;
  let disposed = false;
  const pending = new Map<number, Pending>();
  // One render at a time: the worker's questions go to the render in flight.
  let current: Pending | null = null;
  const inspections = new Map<number, { resolve: (report: PrintPdfReport | undefined) => void; reject: (err: unknown) => void }>();

  const send = (msg: PdfRequestMessage, transfer?: Transferable[]): void => {
    if (disposed) throw new Error('PDF worker has been disposed');
    if (transfer && transfer.length > 0) worker.postMessage(msg, transfer);
    else worker.postMessage(msg);
  };

  const answer = async (askId: number, job: () => Promise<Uint8Array | Uint8Array[] | null>): Promise<void> => {
    try {
      const bytes = await job();
      // The handle was disposed while the job ran (the render cancelled, the
      // viewer closed): nobody waits for this answer any more (#1433).
      if (disposed) return;
      // Copies: the provider may keep the originals in a cache. What a
      // font file says of itself goes beside them, since a copy drops it.
      const copy = Array.isArray(bytes) ? bytes.map((b) => b.slice()) : bytes ? bytes.slice() : null;
      const buffers = Array.isArray(copy) ? copy.map((b) => b.buffer) : copy ? [copy.buffer] : undefined;
      const declared = (Array.isArray(bytes) ? bytes : bytes ? [bytes] : []).map((b) => declarationOf(b) ?? null);
      send({ kind: 'answer', askId, bytes: copy, ...(declared.some((d) => d !== null) ? { declared } : {}) }, buffers);
    } catch (err) {
      if (disposed) return;
      send({ kind: 'answer', askId, bytes: null, error: err instanceof Error ? err.message : String(err) });
    }
  };

  worker.addEventListener('message', (event: MessageEvent<PdfResponseMessage>) => {
    const msg = event.data;
    switch (msg.kind) {
      case 'font': {
        const job = current;
        const request = msg.codePoints ? { codePoints: new Set(msg.codePoints) } : undefined;
        void answer(msg.askId, () => (job ? job.options.fontProvider(msg.family, msg.weight, msg.style, request) : Promise.resolve(null)));
        return;
      }
      case 'rasterize': {
        const job = current;
        const rasterize = job?.options.rasterizeSvg ?? rasterizeSvgWithDom;
        void answer(msg.askId, () => rasterize(msg.svg, msg.widthPx, msg.heightPx));
        return;
      }
      case 'progress': {
        pending.get(msg.id)?.options.onProgress?.(msg.progress);
        return;
      }
      case 'warning': {
        const onWarning = pending.get(msg.id)?.options.onWarning;
        if (onWarning) onWarning(msg.warning);
        else if ('message' in msg.warning) console.warn(msg.warning.message);
        return;
      }
      case 'rendered': {
        const entry = pending.get(msg.id);
        pending.delete(msg.id);
        if (current === entry) current = null;
        entry?.resolve(msg.bytes);
        return;
      }
      case 'inspected': {
        const entry = inspections.get(msg.id);
        inspections.delete(msg.id);
        entry?.resolve(msg.report);
        return;
      }
      case 'error': {
        const entry = pending.get(msg.id);
        pending.delete(msg.id);
        if (current === entry) current = null;
        entry?.reject(Object.assign(new Error(msg.message), msg.stack ? { stack: msg.stack } : {}));
        return;
      }
    }
  });

  worker.addEventListener('error', (event) => {
    for (const entry of [...pending.values(), ...inspections.values()]) entry.reject(new Error(event.message || 'PDF worker error'));
    pending.clear();
    inspections.clear();
    current = null;
  });

  return {
    render(input, renderOptions) {
      const docs = Array.isArray(input) ? input : [input];
      const id = nextId++;
      return new Promise<Uint8Array>((resolve, reject) => {
        const entry: Pending = { resolve, reject, options: renderOptions };
        pending.set(id, entry);
        current = entry;
        const resourceBytes = [...(renderOptions.resourceBytes ?? new Map<string, Uint8Array>())];
        const buffers = new Set<ArrayBuffer>();
        for (const [, bytes] of resourceBytes) {
          if (bytes.buffer instanceof ArrayBuffer) buffers.add(bytes.buffer);
        }
        const { forms, pageNegative, outlines, colorSpace, accessible, baselineGrid, print, profileBaseUrl } = renderOptions;
        // The profile is copied, like the HarfBuzz bytes below; a relative
        // base URL resolves against this page.
        const outputProfile = renderOptions.outputProfile?.slice();
        const profileBase = profileBaseUrl ? new URL(profileBaseUrl, sourceBase()).href : undefined;
        // A URL goes as its string, resolved against this page (the worker's
        // own location is its script); bytes are copied, so the
        // caller's buffer stays usable for the next render.
        const wasm = renderOptions.harfbuzzWasm;
        const harfbuzzWasm = wasm === undefined ? undefined
          : typeof wasm === 'string' || wasm instanceof URL ? new URL(wasm, sourceBase()).href
          : ArrayBuffer.isView(wasm) ? new Uint8Array(wasm.buffer, wasm.byteOffset, wasm.byteLength).slice()
          : wasm.slice(0);
        try {
          send({ kind: 'render', id, docs, settings: {
              pageNegative, outlines, colorSpace, accessible, baselineGrid,
              ...(forms ? { forms } : {}),
              ...(print ? { print } : {}),
              ...(outputProfile ? { outputProfile } : {}),
              ...(profileBase ? { profileBaseUrl: profileBase } : {}),
              ...(harfbuzzWasm ? { harfbuzzWasm } : {}),
            }, resourceBytes }, [...buffers]);
        } catch (err) {
          pending.delete(id);
          current = null;
          reject(err);
        }
      });
    },
    inspect(bytes) {
      const id = nextId++;
      return new Promise<PrintPdfReport | undefined>((resolve, reject) => {
        inspections.set(id, { resolve, reject });
        const copy = bytes.slice();
        try {
          send({ kind: 'inspect', id, bytes: copy }, [copy.buffer]);
        } catch (err) {
          inspections.delete(id);
          reject(err);
        }
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      try { worker.postMessage({ kind: 'dispose' } satisfies PdfRequestMessage); } catch { /* ignore */ }
      worker.terminate();
      for (const entry of [...pending.values(), ...inspections.values()]) entry.reject(new DOMException('Worker disposed', 'AbortError'));
      pending.clear();
      inspections.clear();
      current = null;
    },
  };
}
