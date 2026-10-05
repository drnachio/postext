// Write EPUB files on a worker: `createEpubWorker().render(docs, options)`
// takes what `renderToEpub` takes and returns the same bytes, with the
// page itself left free while the book is written.

import type { VDTDocument } from 'postext';
import { placedFileIds } from '../shared/assets';
import type { EpubResourceBytes, EpubSource, RenderToEpubOptions } from '../types';
import type { EpubRequestMessage, EpubResourcePayload, EpubResponseMessage } from './protocol';
import { cdnWorkerEntryUrl } from './entryUrl';

export type { EpubResourcePayload } from './protocol';
export type { EpubProgress, EpubWarning, EpubLayout, EpubMetadata, EpubFontFile, EpubCover } from '../types';

export interface EpubWorkerRenderOptions extends Omit<RenderToEpubOptions, 'resourceBytes'> {
  /** Picture bytes: a map by `fileId`, or the provider `renderToEpub`
   *  takes, asked on this thread for every picture the pages place before
   *  the worker starts (the worker cannot reach the host's stores). */
  resourceBytes?: EpubResourceBytes | ReadonlyMap<string, EpubResourcePayload>;
}

export interface EpubWorkerHandle {
  /** Write the book on the worker. The buffers of the fonts, the pictures
   *  and the cover are transferred, not copied: the caller's views of them
   *  are empty afterwards, so pass copies of bytes it keeps. Aborting the
   *  signal rejects at once with an `AbortError` and stops the worker. */
  render(docs: EpubSource, options: EpubWorkerRenderOptions): Promise<Uint8Array>;
  dispose(): void;
}

export interface CreateEpubWorkerOptions {
  /** A worker of the caller's own (build tooling that controls the worker
   *  URL), or a function that makes one. With a function, an aborted render
   *  ends the worker at once and the next render starts a fresh one; a
   *  given worker is only asked to stop. */
  worker?: Worker | (() => Worker);
  /**
   * URL of the worker entry module (`postext-epub/worker/entry`) to start,
   * when it is not the file next to this module — a copy on your server,
   * or a CDN build such as `https://esm.sh/postext-epub@0.1.1/worker/entry`.
   * A URL on another origin is started through a same-origin blob module
   * that imports it (a worker script must be same-origin; the CDN must
   * allow CORS). Ignored when `worker` is given. Loaded from esm.sh, the
   * client finds the CDN's entry by itself.
   */
  url?: string | URL;
}

/** A failure of the worker itself (it could not load or it crashed), as
 *  opposed to an error of the render: the caller may write the book on
 *  its own thread instead. */
export class EpubWorkerError extends Error {
  override name = 'EpubWorkerError';
}

interface Pending {
  resolve: (bytes: Uint8Array) => void;
  reject: (err: unknown) => void;
  options: EpubWorkerRenderOptions;
  worker: Worker;
}

const abortError = (signal: AbortSignal | undefined): unknown =>
  signal?.reason ?? new DOMException('The EPUB render was aborted', 'AbortError');

/** The pictures' bytes as the worker receives them: every `fileId` the
 *  pages place, asked of the provider once (a map is taken as it is). */
export async function gatherResourceBytes(
  docs: EpubSource,
  source: EpubWorkerRenderOptions['resourceBytes'],
): Promise<[string, EpubResourcePayload][]> {
  if (!source) return [];
  if (typeof source !== 'function') return [...source];
  const fileIds = [...new Set(docs.flatMap(placedFileIds))];
  const found = await Promise.all(fileIds.map(async (fileId) => [fileId, await source(fileId)] as const));
  return found.filter((entry): entry is [string, EpubResourcePayload] => entry[1] !== undefined);
}

/** The buffers to transfer with a request: those of the fonts, the
 *  pictures and the cover, each once. */
export function transferablesOf(options: Pick<EpubWorkerRenderOptions, 'fonts' | 'cover'>, resources: readonly [string, EpubResourcePayload][]): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>();
  const add = (bytes: Uint8Array | undefined) => {
    if (bytes && bytes.buffer instanceof ArrayBuffer && bytes.buffer.byteLength > 0) buffers.add(bytes.buffer);
  };
  for (const font of options.fonts ?? []) add(font.bytes);
  for (const [, payload] of resources) add(payload.bytes);
  add(options.cover?.bytes);
  return [...buffers];
}

function pageLocation(): { origin?: string; href?: string } | undefined {
  return (globalThis as { location?: { origin?: string; href?: string } }).location;
}

/** Start a module worker at `url`, wrapped in a same-origin blob module when
 *  the page is on another origin. */
function startModuleWorker(url: string, pageOrigin: string | undefined): { worker: Worker; objectUrl?: string } {
  if (pageOrigin === undefined || new URL(url).origin === pageOrigin) {
    return { worker: new Worker(url, { type: 'module' }) };
  }
  const objectUrl = URL.createObjectURL(new Blob([`import ${JSON.stringify(url)};\n`], { type: 'text/javascript' }));
  return { worker: new Worker(objectUrl, { type: 'module' }), objectUrl };
}

function spawnEpubWorker(url: string | URL | undefined): { worker: Worker; objectUrl?: string } {
  const location = pageLocation();
  const pageOrigin = location?.origin && location.origin !== 'null' ? location.origin : undefined;
  if (url !== undefined) return startModuleWorker(new URL(String(url), location?.href).href, pageOrigin);
  // Loaded from a CDN (esm.sh): the file next to this module is not served
  // there, and would be cross-origin anyway; start the CDN's worker entry.
  const cdnEntry = cdnWorkerEntryUrl(import.meta.url, pageOrigin);
  if (cdnEntry) return startModuleWorker(cdnEntry, pageOrigin);
  // Bundlers (Vite, webpack, Next.js) recognise this exact expression and
  // emit the worker as a chunk of its own: keep it inline.
  return { worker: new Worker(new URL('./epub.worker.js', import.meta.url), { type: 'module' }) };
}

export function createEpubWorker(options?: CreateEpubWorkerOptions): EpubWorkerHandle {
  const given = options?.worker;
  /** The blob wrapper's URL, revoked once the worker has answered (it has
   *  loaded the module by then), failed or is disposed. */
  let objectUrl: string | undefined;
  const releaseObjectUrl = () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = undefined;
  };
  const spawn = (): Worker => {
    releaseObjectUrl();
    const spawned = spawnEpubWorker(options?.url);
    objectUrl = spawned.objectUrl;
    return spawned.worker;
  };
  const make = typeof given === 'function' ? given : given ? null : spawn;
  let worker: Worker | null = null;
  let nextId = 1;
  let disposed = false;
  const pending = new Map<number, Pending>();

  const settle = (id: number): Pending | undefined => {
    const entry = pending.get(id);
    pending.delete(id);
    return entry;
  };

  const listen = (w: Worker): void => {
    w.addEventListener('message', (event: MessageEvent<EpubResponseMessage>) => {
      releaseObjectUrl();
      const msg = event.data;
      switch (msg.kind) {
        case 'progress':
          pending.get(msg.id)?.options.onProgress?.(msg.progress);
          return;
        case 'warning':
          pending.get(msg.id)?.options.onWarning?.(msg.warning);
          return;
        case 'rendered':
          settle(msg.id)?.resolve(msg.bytes);
          return;
        case 'error': {
          const entry = settle(msg.id);
          if (!entry) return;
          if (msg.aborted) entry.reject(abortError(entry.options.signal));
          else entry.reject(Object.assign(new Error(msg.message), msg.stack ? { stack: msg.stack } : {}));
          return;
        }
      }
    });
    w.addEventListener('error', (event) => {
      // A script that fails to load or throws at the top level.
      event.preventDefault();
      releaseObjectUrl();
      fail(w, new EpubWorkerError(event.message || 'EPUB worker error'));
    });
    w.addEventListener('messageerror', () => fail(w, new EpubWorkerError('EPUB worker could not read a message')));
  };

  /** Reject every render on `w` and let the next render start afresh. */
  const fail = (w: Worker, err: unknown): void => {
    for (const [id, entry] of pending) {
      if (entry.worker !== w) continue;
      pending.delete(id);
      entry.reject(err);
    }
    if (worker === w && make) {
      w.terminate();
      worker = null;
    }
  };

  const current = (): Worker => {
    if (disposed) throw new Error('EPUB worker has been disposed');
    if (!worker) {
      try {
        worker = make!();
      } catch (err) {
        // No module workers here, or a policy forbids the script.
        throw new EpubWorkerError(err instanceof Error ? err.message : String(err));
      }
      listen(worker);
    }
    return worker;
  };
  if (typeof given === 'object') {
    worker = given;
    listen(given);
  }

  return {
    async render(input, renderOptions) {
      const docs: VDTDocument[] = [...input];
      const { signal } = renderOptions;
      signal?.throwIfAborted();
      const resourceBytes = await gatherResourceBytes(docs, renderOptions.resourceBytes);
      signal?.throwIfAborted();
      const w = current();
      const id = nextId++;
      return new Promise<Uint8Array>((resolve, reject) => {
        const entry: Pending = { resolve, reject, options: renderOptions, worker: w };
        pending.set(id, entry);
        const onAbort = () => {
          if (!pending.has(id)) return;
          pending.delete(id);
          reject(abortError(signal));
          try { w.postMessage({ kind: 'cancel', id } satisfies EpubRequestMessage); } catch { /* ended */ }
          // The writer checks its signal between steps, which a long
          // synchronous stretch delays: a worker of our own is ended now,
          // unless another render is using it.
          if (make && worker === w && ![...pending.values()].some((p) => p.worker === w)) {
            w.terminate();
            worker = null;
          }
        };
        signal?.addEventListener('abort', onAbort, { once: true });
        const done = () => signal?.removeEventListener('abort', onAbort);
        entry.resolve = (bytes) => { done(); resolve(bytes); };
        entry.reject = (err) => { done(); reject(err); };
        const { layout, metadata, fonts, cover } = renderOptions;
        const message: EpubRequestMessage = {
          kind: 'render',
          id,
          docs,
          settings: { layout, metadata, ...(fonts ? { fonts } : {}), ...(cover ? { cover } : {}) },
          resourceBytes,
        };
        try {
          w.postMessage(message, transferablesOf(renderOptions, resourceBytes));
        } catch (err) {
          pending.delete(id);
          entry.reject(err);
        }
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      releaseObjectUrl();
      const w = worker;
      worker = null;
      if (w) {
        try { w.postMessage({ kind: 'dispose' } satisfies EpubRequestMessage); } catch { /* ended */ }
        w.terminate();
      }
      for (const entry of pending.values()) entry.reject(new DOMException('Worker disposed', 'AbortError'));
      pending.clear();
    },
  };
}
