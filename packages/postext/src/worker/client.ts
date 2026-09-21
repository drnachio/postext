import type { PostextContent, PostextConfig } from '../types';
import type { VDTDocument } from '../vdt';
import type { BuildProgress } from '../pipeline/build';

export type { BuildProgress } from '../pipeline/build';
import type { BuildStats, FontPayload, RequestMessage, ResponseMessage } from './protocol';

export type { BuildStats, FontPayload } from './protocol';
export type { BuildPassInfo } from '../pipeline/build';

export interface BuildOptions {
  signal?: AbortSignal;
  /** Called as the worker's placement advances (throttled by the worker). */
  onProgress?: (progress: BuildProgress) => void;
  /** Called with the finished build's pass timings, right before it resolves. */
  onStats?: (stats: BuildStats) => void;
  /** Fingerprint of `content.resources`. Consecutive builds with the same
   *  key ship the list once; the worker keeps it (see the protocol). */
  resourcesKey?: string;
  /** Fingerprint of the whole build; the worker answers a repeat from its
   *  document cache (see the protocol). */
  cacheKey?: string;
}

export interface LayoutWorkerHandle {
  registerFonts(faces: FontPayload[]): Promise<void>;
  /** Drop every face whose family matches one of `families` from the worker's
   *  face set so the next `registerFonts` for that family takes effect
   *  instead of being deduped against a stale face. */
  unregisterFonts(families: string[]): Promise<void>;
  build(
    content: PostextContent,
    config?: PostextConfig,
    opts?: BuildOptions,
  ): Promise<VDTDocument>;
  dispose(): void;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: unknown) => void;
  onAbort?: () => void;
  onProgress?: (progress: BuildProgress) => void;
  onStats?: (stats: BuildStats) => void;
}

export interface CreateLayoutWorkerOptions {
  /**
   * Allows consumers to provide their own Worker instance. Useful for build
   * tooling that needs to control the worker URL resolution.
   */
  worker?: Worker;
}

export function createLayoutWorker(
  options?: CreateLayoutWorkerOptions,
): LayoutWorkerHandle {
  const worker = options?.worker
    ?? new Worker(new URL('./layout.worker.js', import.meta.url), { type: 'module' });

  let nextId = 1;
  let disposed = false;
  const pending = new Map<number, Pending>();
  /** Fingerprint of the resource list the worker holds (messages are
   *  handled in order, so once sent it is there for every later build). */
  let sentResourcesKey: string | null = null;

  worker.addEventListener('message', (event: MessageEvent<ResponseMessage>) => {
    const msg = event.data;
    const entry = pending.get(msg.id);
    if (!entry) return;
    switch (msg.kind) {
      case 'progress':
        entry.onProgress?.(msg.progress);
        return;
      case 'built':
        pending.delete(msg.id);
        entry.onStats?.(msg.stats);
        entry.resolve(msg.doc);
        return;
      case 'fontsRegistered':
        pending.delete(msg.id);
        entry.resolve(undefined);
        return;
      case 'fontsUnregistered':
        pending.delete(msg.id);
        entry.resolve(undefined);
        return;
      case 'cancelled':
        pending.delete(msg.id);
        entry.reject(new DOMException('Build cancelled', 'AbortError'));
        return;
      case 'error':
        pending.delete(msg.id);
        entry.reject(Object.assign(new Error(msg.message), { stack: msg.stack }));
        return;
    }
  });

  worker.addEventListener('error', (event) => {
    for (const entry of pending.values()) {
      entry.reject(new Error(event.message || 'Worker error'));
    }
    pending.clear();
  });

  function send(msg: RequestMessage, transfer?: Transferable[]): void {
    if (disposed) throw new Error('Layout worker has been disposed');
    if (transfer && transfer.length > 0) worker.postMessage(msg, transfer);
    else worker.postMessage(msg);
  }

  return {
    registerFonts(faces) {
      const id = nextId++;
      return new Promise<void>((resolve, reject) => {
        pending.set(id, {
          resolve: () => resolve(),
          reject,
        });
        send(
          { kind: 'registerFonts', id, faces },
          faces.map((f) => f.buffer),
        );
      });
    },
    unregisterFonts(families) {
      const id = nextId++;
      return new Promise<void>((resolve, reject) => {
        pending.set(id, {
          resolve: () => resolve(),
          reject,
        });
        send({ kind: 'unregisterFonts', id, families });
      });
    },
    build(content, config, opts) {
      const id = nextId++;
      return new Promise<VDTDocument>((resolve, reject) => {
        if (opts?.signal?.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        // Abort settles the promise right away and forgets the id: the
        // worker is asked to stop, but whatever it still posts for this
        // build (a `built` it could not interrupt) is dropped on arrival
        // instead of resolving a caller that moved on.
        const onAbort = () => {
          if (!pending.has(id)) return;
          pending.delete(id);
          try { send({ kind: 'cancel', id }); } catch { /* disposed */ }
          reject(new DOMException('Aborted', 'AbortError'));
        };
        if (opts?.signal) {
          opts.signal.addEventListener('abort', onAbort, { once: true });
        }
        pending.set(id, {
          resolve: (v) => resolve(v as VDTDocument),
          reject: (err) => {
            opts?.signal?.removeEventListener('abort', onAbort);
            reject(err);
          },
          onAbort,
          onProgress: opts?.onProgress,
          onStats: opts?.onStats,
        });
        let payload = content;
        const resourcesKey = opts?.resourcesKey;
        if (resourcesKey && content.resources) {
          if (sentResourcesKey === resourcesKey) payload = { ...content, resources: undefined };
          else sentResourcesKey = resourcesKey;
        }
        send({ kind: 'build', id, content: payload, config, resourcesKey, cacheKey: opts?.cacheKey });
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      try { worker.postMessage({ kind: 'dispose' } satisfies RequestMessage); } catch { /* ignore */ }
      worker.terminate();
      for (const entry of pending.values()) {
        entry.reject(new DOMException('Worker disposed', 'AbortError'));
      }
      pending.clear();
    },
  };
}
