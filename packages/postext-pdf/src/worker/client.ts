import type { VDTDocument } from 'postext';
import type { PdfFontProvider } from '../fontCache';
import type { RenderToPdfOptions } from '../pdf-backend';
import { rasterizeSvgWithDom, type SvgRasterizer } from '../pdf-backend/renderResourceBlock';
import type { PdfRequestMessage, PdfResponseMessage } from './protocol';

export type { RenderProgress } from '../pdf-backend';

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

export interface PdfWorkerHandle {
  /** Render on the worker. Fonts and SVG rasters are fetched on this
   *  thread when the worker asks (it cannot reach the document's fonts or
   *  decode SVG); everything else — text, vector figures, the structure
   *  tree, the file itself — is written off the main thread. */
  render(docs: VDTDocument | VDTDocument[], options: PdfWorkerRenderOptions): Promise<Uint8Array>;
  dispose(): void;
}

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

export function createPdfWorker(options?: CreatePdfWorkerOptions): PdfWorkerHandle {
  const worker = options?.worker
    ?? new Worker(new URL('./pdf.worker.js', import.meta.url), { type: 'module' });
  let nextId = 1;
  let disposed = false;
  const pending = new Map<number, Pending>();
  // One render at a time: the worker's questions go to the render in flight.
  let current: Pending | null = null;

  const send = (msg: PdfRequestMessage, transfer?: Transferable[]): void => {
    if (disposed) throw new Error('PDF worker has been disposed');
    if (transfer && transfer.length > 0) worker.postMessage(msg, transfer);
    else worker.postMessage(msg);
  };

  const answer = async (askId: number, job: () => Promise<Uint8Array | null>): Promise<void> => {
    try {
      const bytes = await job();
      // A copy: the provider may keep the original in a cache.
      const copy = bytes ? bytes.slice() : null;
      send({ kind: 'answer', askId, bytes: copy }, copy ? [copy.buffer] : undefined);
    } catch (err) {
      send({ kind: 'answer', askId, bytes: null, error: err instanceof Error ? err.message : String(err) });
    }
  };

  worker.addEventListener('message', (event: MessageEvent<PdfResponseMessage>) => {
    const msg = event.data;
    switch (msg.kind) {
      case 'font': {
        const job = current;
        void answer(msg.askId, () => (job ? job.options.fontProvider(msg.family, msg.weight, msg.style) : Promise.resolve(null)));
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
      case 'rendered': {
        const entry = pending.get(msg.id);
        pending.delete(msg.id);
        if (current === entry) current = null;
        entry?.resolve(msg.bytes);
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
    for (const entry of pending.values()) entry.reject(new Error(event.message || 'PDF worker error'));
    pending.clear();
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
        const { pageNegative, outlines, colorSpace, accessible } = renderOptions;
        try {
          send({ kind: 'render', id, docs, settings: { pageNegative, outlines, colorSpace, accessible }, resourceBytes }, [...buffers]);
        } catch (err) {
          pending.delete(id);
          current = null;
          reject(err);
        }
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      try { worker.postMessage({ kind: 'dispose' } satisfies PdfRequestMessage); } catch { /* ignore */ }
      worker.terminate();
      for (const entry of pending.values()) entry.reject(new DOMException('Worker disposed', 'AbortError'));
      pending.clear();
      current = null;
    },
  };
}
