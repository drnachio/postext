// How much of a book the canvas and the HTML preview lay out. Laid out
// whole, every chapter's document is built and kept at once: 紅樓夢 (129
// chapters, some 2,000 pages) takes about 25 s and 100 MB on the canvas,
// which it opens on. Past the limit a book is shown a chapter at a time.
// Pure.

import type { LayoutScope } from './types';

/** The most chapters a book may have for the canvas and the HTML preview
 *  to show it whole. The PDF can still take a longer book whole. */
export const WHOLE_BOOK_MAX_CHAPTERS = 200;

/** Whether a book of `chapterCount` chapters may be shown whole. */
export function wholeBookAllowed(chapterCount: number): boolean {
  return chapterCount <= WHOLE_BOOK_MAX_CHAPTERS;
}

/** The canvas scope a book gets: the one it asks for, except that a book
 *  over {@link WHOLE_BOOK_MAX_CHAPTERS} chapters is shown a chapter at a
 *  time. */
export function effectiveCanvasScope(scope: LayoutScope | undefined, chapterCount: number): LayoutScope {
  return scope === 'book' && wholeBookAllowed(chapterCount) ? 'book' : 'chapter';
}
