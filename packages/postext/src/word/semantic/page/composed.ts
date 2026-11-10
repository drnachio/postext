// Running heads on composed pages (#1444). A page template can print no
// header or no footer (`header: false`, a cover); the engine then sets
// none on that page. In Word a page's running heads are its section's, so
// a composed page whose template prints other heads than the pages before
// it opens a section of its own, as do the pages after it, and that
// section's header or footer is left empty.

import type { ContentBlock } from '../../../parse/types.js';
import type { WriterContext } from '../context.js';
import { templateOf } from '../media/frames.js';

/** What a page prints of the running heads: header and footer. */
export interface HeadsShown {
  header: boolean;
  footer: boolean;
}

const ALL: HeadsShown = { header: true, footer: true };

/** The running heads a composed page `b` prints (its template's); every
 *  head for any other block. */
export function headsShown(ctx: WriterContext, b: ContentBlock | undefined): HeadsShown {
  if (b?.type !== 'containerStart' || b.containerName !== 'composedPage') return ALL;
  const template = templateOf(ctx, b.composedPage?.template ?? b.containerAttrs?.template);
  if (!template) return ALL;
  return { header: template.header !== false, footer: template.footer !== false };
}

/** Whether a page of block `b` prints other running heads than a page of
 *  `prev` (a composed page then opens a section of its own). */
export function headsChange(ctx: WriterContext, prev: ContentBlock | undefined, b: ContentBlock | undefined): boolean {
  const a = headsShown(ctx, prev);
  const c = headsShown(ctx, b);
  return a.header !== c.header || a.footer !== c.footer;
}

/** Whether `b` is a composed page (a page of its own). */
export const isComposedPage = (b: ContentBlock | undefined): boolean => b?.type === 'containerStart' && b.containerName === 'composedPage';
