export { LOCALE_TO_HYPHENATION } from '../../controls/hyphenation';

export type ViewMode = 'single' | 'spread';
export type FitMode = 'none' | 'width' | 'height';

export interface GeomSnapshot {
  pageCount: number;
  pageWidthPx: number;
  pageHeightPx: number;
  displayWidth: number;
  displayHeight: number;
  viewMode: ViewMode;
}

export const PAGE_PADDING = 32;
export const PAGE_GAP = 24;

/**
 * Groups pages into rows for display.
 * Single mode: one page per row.
 * Spread mode: page 0 alone (on the right, like a book recto),
 * then pairs [1,2], [3,4], ... Last unpaired page goes on the left.
 */
/** Rows of page indices for the viewer. A spread pairs a verso (left,
 *  even page number) with the recto after it, so a document whose first
 *  page is a recto — page 1 of a book, or a chapter continued after an
 *  even number of pages — starts with that page alone; one whose first
 *  page is a verso fills both slots of the first row. `firstPageRecto`
 *  says which (a self-contained document opens on a recto). */
export function groupPagesIntoRows(pageCount: number, viewMode: ViewMode, firstPageRecto = true): number[][] {
  if (viewMode === 'single') {
    return Array.from({ length: pageCount }, (_, i) => [i]);
  }
  const rows: number[][] = [];
  let i = 0;
  if (pageCount > 0 && firstPageRecto) rows.push([i++]);
  for (; i < pageCount; i += 2) {
    if (i + 1 < pageCount) {
      rows.push([i, i + 1]);
    } else {
      rows.push([i]);
    }
  }
  return rows;
}
