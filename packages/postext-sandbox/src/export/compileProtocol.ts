// The messages between the page and the compile worker (#1526).

import type { CompiledBook, CompileProgress, CompileRequest } from './compileBook.js';

/** What the worker asks of the page: an SVG as a bitmap, for the PDF or
 *  for the EPUB's cover, which the worker paints itself (#1548). */
export interface CompileAsk {
  type: 'ask';
  id: number;
  question: { kind: 'rasterize'; svgText: string; widthPx: number; heightPx: number };
}

/** Page to worker. */
export type CompileRequestMessage =
  | { type: 'compile'; request: CompileRequest }
  | { type: 'answer'; id: number; value: unknown };

/** Worker to page. */
export type CompileReply =
  | CompileAsk
  | { type: 'progress'; progress: CompileProgress }
  | { type: 'done'; book: CompiledBook }
  | { type: 'error'; message: string };
