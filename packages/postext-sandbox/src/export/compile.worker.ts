/// <reference lib="webworker" />
// The Books panel's compiler (#1526): a book laid out and written in a
// realm of its own, so its fonts, its layout worker and its caches are not
// the open book's (see `compileBook.ts`). What only the page can do is
// asked of it (`compileClient.ts`).

import { setFigureStyleFamilies } from 'postext';
import type { EpubCover } from 'postext-epub';
import { takesFigureFeatures } from '../controls/fonts/systemFonts.js';
import { compileBook } from './compileBook.js';
import type { CompileAsk, CompileReply, CompileRequestMessage } from './compileProtocol.js';

declare const self: DedicatedWorkerGlobalScope;

// As in the layout worker: a style's figures leave a face only the system
// has as it is.
setFigureStyleFamilies((family) => takesFigureFeatures(family, (self as unknown as { fonts?: Iterable<{ family: string }> }).fonts));

let nextAsk = 1;
const waiting = new Map<number, { resolve: (value: unknown) => void }>();

/** Ask the page and wait for its answer (null when it cannot help). */
function ask<T>(question: CompileAsk['question']): Promise<T | null> {
  const id = nextAsk++;
  return new Promise<T | null>((resolve) => {
    waiting.set(id, { resolve: resolve as (value: unknown) => void });
    self.postMessage({ type: 'ask', id, question } satisfies CompileReply);
  });
}

self.onmessage = async (event: MessageEvent<CompileRequestMessage>) => {
  const message = event.data;
  if (message.type === 'answer') {
    waiting.get(message.id)?.resolve(message.value);
    waiting.delete(message.id);
    return;
  }
  try {
    const book = await compileBook(message.request, {
      onProgress: (progress) => self.postMessage({ type: 'progress', progress } satisfies CompileReply),
      rasterizeSvg: (svgText, widthPx, heightPx) => ask<Uint8Array>({ kind: 'rasterize', svgText, widthPx, heightPx }),
      paintCover: (first, title, source) => ask<EpubCover>({ kind: 'cover', first, title, ...source }),
    });
    self.postMessage({ type: 'done', book } satisfies CompileReply, [book.bytes.buffer]);
  } catch (err) {
    self.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) } satisfies CompileReply);
  }
};
