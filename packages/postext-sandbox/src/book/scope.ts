// How much of a book the canvas and the HTML preview lay out. A long book
// (紅樓夢: 120 chapters, some 1,800 pages) is never laid out whole there:
// every chapter's document would be built and kept at once. Pure.

import type { LayoutScope } from './types';

/** The most chapters a book may have for the canvas and the HTML preview
 *  to show it whole. The PDF can still take a longer book whole. */
export const WHOLE_BOOK_MAX_CHAPTERS = 80;

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
