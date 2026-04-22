import type { PostextContent, PostextConfig } from '../types';
import type { VDTDocument } from '../vdt';
import type { FontPayload, RequestMessage, ResponseMessage } from './protocol';

export type { FontPayload } from './protocol';

export interface BuildOptions {
  signal?: AbortSignal;
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

  worker.addEventListener('message', (event: MessageEvent<ResponseMessage>) => {
    const msg = event.data;
    const entry = pending.get(msg.id);
    if (!entry) return;
    switch (msg.kind) {
      case 'built':
        pending.delete(msg.id);
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
        const onAbort = () => {
          if (!pending.has(id)) return;
          send({ kind: 'cancel', id });
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
        });
        send({ kind: 'build', id, content, config });
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
