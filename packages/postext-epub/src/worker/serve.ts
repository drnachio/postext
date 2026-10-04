// The worker side of `createEpubWorker`: answers render requests on a
// message port (the worker's global scope, or a MessagePort in tests).

import { renderToEpub } from '../index';
import type { EpubRequestMessage, EpubResponseMessage } from './protocol';

/** What the worker needs of its scope. */
export interface EpubWorkerPort {
  postMessage(message: EpubResponseMessage, transfer: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<EpubRequestMessage>) => void): void;
  close(): void;
}

/** Write the books asked for on `port`, one `renderToEpub` per request,
 *  with progress and warnings posted as they happen. */
export function serveEpubRequests(port: EpubWorkerPort): void {
  const running = new Map<number, AbortController>();
  const post = (msg: EpubResponseMessage, transfer: Transferable[] = []): void => port.postMessage(msg, transfer);

  port.addEventListener('message', async (event) => {
    const msg = event.data;
    switch (msg.kind) {
      case 'render': {
        const controller = new AbortController();
        running.set(msg.id, controller);
        const bytesById = new Map(msg.resourceBytes);
        try {
          const bytes = await renderToEpub(msg.docs, {
            ...msg.settings,
            resourceBytes: (fileId) => bytesById.get(fileId),
            onProgress: (progress) => post({ kind: 'progress', id: msg.id, progress }),
            onWarning: (warning) => post({ kind: 'warning', id: msg.id, warning }),
            signal: controller.signal,
          });
          post({ kind: 'rendered', id: msg.id, bytes }, [bytes.buffer]);
        } catch (err) {
          post({
            kind: 'error',
            id: msg.id,
            message: err instanceof Error ? err.message : String(err),
            ...(err instanceof Error && err.stack ? { stack: err.stack } : {}),
            ...(controller.signal.aborted ? { aborted: true } : {}),
          });
        } finally {
          running.delete(msg.id);
        }
        return;
      }
      case 'cancel': {
        running.get(msg.id)?.abort();
        return;
      }
      case 'dispose': {
        for (const controller of running.values()) controller.abort();
        port.close();
        return;
      }
    }
  });
}
