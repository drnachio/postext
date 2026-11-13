// The page's side of the compile worker (#1526): it starts the worker,
// passes its progress on, answers what it asks and ends it on cancel.

import { rasterizeSvgWithDom } from 'postext-pdf';
import type { CompiledBook, CompileProgress, CompileRequest } from './compileBook.js';
import type { CompileAsk, CompileReply, CompileRequestMessage } from './compileProtocol.js';

/** Thrown (as an AbortError) when a compilation is cancelled. */
export const compileCancelled = (): DOMException => new DOMException('The compilation was cancelled', 'AbortError');

/** What the worker asks, answered on the page: an SVG as a bitmap (an
 *  `<img>` decodes SVG, a worker cannot). The EPUB's cover is not asked
 *  for: the worker paints it with the compiled book's faces (#1548), and
 *  the open book's fonts on the page are never used for another book. */
export async function answerCompileAsk(question: CompileAsk['question']): Promise<unknown> {
  return rasterizeSvgWithDom(question.svgText, question.widthPx, question.heightPx);
}

/** Compile a book on a worker of its own. Rejects with an AbortError when
 *  `signal` aborts, the worker (and the layout worker it started) ended at
 *  once. */
export function compileOnWorker(
  request: CompileRequest,
  { onProgress, signal }: { onProgress: (progress: CompileProgress) => void; signal: AbortSignal },
): Promise<CompiledBook> {
  return new Promise<CompiledBook>((resolve, reject) => {
    if (signal.aborted) {
      reject(compileCancelled());
      return;
    }
    const worker = new Worker(new URL('./compile.worker.js', import.meta.url), { type: 'module' });
    const post = (message: CompileRequestMessage) => worker.postMessage(message);
    const end = () => {
      worker.terminate();
      signal.removeEventListener('abort', abort);
    };
    const abort = () => {
      end();
      reject(compileCancelled());
    };
    signal.addEventListener('abort', abort, { once: true });
    worker.onerror = (event) => {
      end();
      reject(new Error(event.message || 'The compile worker failed'));
    };
    worker.onmessage = (event: MessageEvent<CompileReply>) => {
      const message = event.data;
      switch (message.type) {
        case 'progress':
          onProgress(message.progress);
          return;
        case 'ask':
          void answerCompileAsk(message.question)
            .catch(() => null)
            .then((value) => { if (!signal.aborted) post({ type: 'answer', id: message.id, value }); });
          return;
        case 'done':
          end();
          resolve(message.book);
          return;
        case 'error':
          end();
          reject(new Error(message.message));
      }
    };
    post({ type: 'compile', request });
  });
}
