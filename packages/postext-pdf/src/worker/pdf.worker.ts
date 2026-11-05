/// <reference lib="webworker" />

/**
 * `postext-pdf/worker/entry`: the worker behind `createPdfWorker`. Bundlers
 * that resolve `new Worker(new URL(…, import.meta.url))` pick it up from the
 * client; hosts that build their own worker import this module.
 *
 * @module
 */

import { renderToPdf } from '../pdf-backend/index.js';
import { declaredFontFile } from '../fontCache.js';
import type { PdfRequestMessage, PdfResponseMessage } from './protocol.js';

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

function post(msg: PdfResponseMessage, transfer?: Transferable[]): void {
  if (transfer && transfer.length > 0) ctx.postMessage(msg, transfer);
  else ctx.postMessage(msg);
}

let nextAskId = 1;
type Answer = Uint8Array | Uint8Array[] | null;

const asks = new Map<number, { resolve: (bytes: Answer) => void; reject: (err: Error) => void }>();

type Question =
  | { kind: 'font'; family: string; weight: number; style: 'normal' | 'italic'; codePoints?: number[] }
  | { kind: 'rasterize'; svg: string; widthPx: number; heightPx: number };

/** Ask the host for something only it can do; resolves with its answer. */
function ask(question: Question): Promise<Answer> {
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
      else if (msg.declared) {
        // Each file takes back what it said of itself on the host.
        const declared = msg.declared;
        const files = (Array.isArray(msg.bytes) ? msg.bytes : msg.bytes ? [msg.bytes] : []).map((bytes, i) => (declared[i] ? declaredFontFile(bytes, declared[i]) : bytes));
        pending.resolve(Array.isArray(msg.bytes) ? files : files[0] ?? null);
      } else pending.resolve(msg.bytes);
      return;
    }
    case 'render': {
      const bytesById = new Map(msg.resourceBytes);
      try {
        const bytes = await renderToPdf(msg.docs, {
          ...msg.settings,
          fontProvider: async (family, weight, style, request) => {
            const codePoints = request ? [...request.codePoints] : undefined;
            const answer = await ask({ kind: 'font', family, weight, style, ...(codePoints ? { codePoints } : {}) });
            if (!answer || (Array.isArray(answer) && answer.length === 0)) throw new Error(`postext-pdf: no bytes for font ${family} ${weight} ${style}`);
            return answer;
          },
          rasterizeSvg: async (svg, widthPx, heightPx) => {
            const answer = await ask({ kind: 'rasterize', svg, widthPx, heightPx }).catch(() => null);
            return answer instanceof Uint8Array ? answer : null;
          },
          resourceBytes: (fileId) => bytesById.get(fileId),
          onProgress: (progress) => post({ kind: 'progress', id: msg.id, progress }),
          onWarning: (warning) => post({ kind: 'warning', id: msg.id, warning }),
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
