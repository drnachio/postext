/**
 * The settings that belong to a book as a whole, apart from the design of
 * any part of it (#1521, #1523). Chapter styles and design templates read
 * the same lists, so the two never disagree about what a design is.
 */

import type { PostextConfig } from '../types.js';
import type { PageConfig } from '../types/page.js';

/** Page settings with one value for the whole book: the trim, the
 *  resolution, the cut lines and the binding. A chapter style keeps the
 *  book's; the margins, the ground colour, the baseline grid and the page
 *  numbering may change from one chapter to the next. */
export const BOOK_PAGE_KEYS = ['sizePreset', 'width', 'height', 'dpi', 'cutLines', 'binding'] as const satisfies readonly (keyof PageConfig)[];

/** Top-level settings a chapter style cannot change: the book has one
 *  language and writing direction, one set of registered fonts and resource
 *  types, one print production and PDF, one set of viewers and checks. */
export const BOOK_WIDE_KEYS = [
  'locale', 'direction', 'numerals', 'customFonts', 'symbolFont', 'resourceTypes',
  'print', 'pdfGeneration', 'htmlViewer', 'canvasViewer', 'folio', 'dieCuts',
  'debug', 'checks', 'contrast', 'chapterStyles', 'composedViewerLeaf',
] as const satisfies readonly (keyof PostextConfig)[];

/** Top-level settings that are the book's own and never part of its
 *  design: a design template neither takes them from the book it is saved
 *  from nor sets them on the book it is applied to. */
export const BOOK_OWN_KEYS = [
  'locale', 'direction', 'numerals', 'resourceTypes', 'debug', 'checks', 'composedViewerLeaf',
] as const satisfies readonly (keyof PostextConfig)[];

export type BookWideKey = (typeof BOOK_WIDE_KEYS)[number];
export type BookOwnKey = (typeof BOOK_OWN_KEYS)[number];

const WIDE = new Set<string>(BOOK_WIDE_KEYS);
const OWN = new Set<string>(BOOK_OWN_KEYS);
const PAGE = new Set<string>(BOOK_PAGE_KEYS);

/** Whether a chapter style may not set `key` (a top-level key). */
export function isBookWideKey(key: string): key is BookWideKey {
  return WIDE.has(key);
}

/** Whether `key` (a top-level key) is the book's own, never its design. */
export function isBookOwnKey(key: string): key is BookOwnKey {
  return OWN.has(key);
}

/** Whether `key` of `page` has one value for the whole book. */
export function isBookPageKey(key: string): boolean {
  return PAGE.has(key);
}
