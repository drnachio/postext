/// <reference lib="webworker" />

import { renderToPdf } from '../pdf-backend';
import type { PdfRequestMessage, PdfResponseMessage } from './protocol';

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

function post(msg: PdfResponseMessage, transfer?: Transferable[]): void {
  if (transfer && transfer.length > 0) ctx.postMessage(msg, transfer);
  else ctx.postMessage(msg);
}

let nextAskId = 1;
const asks = new Map<number, { resolve: (bytes: Uint8Array | null) => void; reject: (err: Error) => void }>();

type Question =
  | { kind: 'font'; family: string; weight: number; style: 'normal' | 'italic' }
  | { kind: 'rasterize'; svg: string; widthPx: number; heightPx: number };

/** Ask the host for something only it can do; resolves with its answer. */
function ask(question: Question): Promise<Uint8Array | null> {
  const askId = nextAskId++;
  return new Promise((resolve, reject) => {
    asks.set(askId, { resolve, reject });
    post({ ...question, askId });
  });
}

ctx.addEventListener('message', async (event: MessageEvent<PdfRequestMessage>) => {
  const msg = event.data;
  switch (msg.kind) {
    case 'answer': {
      const pending = asks.get(msg.askId);
      if (!pending) return;
      asks.delete(msg.askId);
      if (msg.error) pending.reject(new Error(msg.error));
      else pending.resolve(msg.bytes);
      return;
    }
    case 'render': {
      const bytesById = new Map(msg.resourceBytes);
      try {
        const bytes = await renderToPdf(msg.docs, {
          ...msg.settings,
          fontProvider: async (family, weight, style) => {
            const answer = await ask({ kind: 'font', family, weight, style });
            if (!answer) throw new Error(`postext-pdf: no bytes for font ${family} ${weight} ${style}`);
            return answer;
          },
          rasterizeSvg: (svg, widthPx, heightPx) => ask({ kind: 'rasterize', svg, widthPx, heightPx }).catch(() => null),
          resourceBytes: (fileId) => bytesById.get(fileId),
          onProgress: (progress) => post({ kind: 'progress', id: msg.id, progress }),
        });
        post({ kind: 'rendered', id: msg.id, bytes }, [bytes.buffer]);
      } catch (err) {
        post({
          kind: 'error',
          id: msg.id,
          message: err instanceof Error ? err.message : String(err),
          ...(err instanceof Error && err.stack ? { stack: err.stack } : {}),
        });
      }
      return;
    }
    case 'dispose': {
      ctx.close();
      return;
    }
  }
});
