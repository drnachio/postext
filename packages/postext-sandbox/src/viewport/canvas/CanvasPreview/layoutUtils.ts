export { defaultDocumentLocale } from '../../../controls/language/hyphenation.js';

export type ViewMode = 'single' | 'spread';
export type FitMode = 'none' | 'width' | 'height';

export interface GeomSnapshot {
  pageCount: number;
  pageWidthPx: number;
  pageHeightPx: number;
  displayWidth: number;
  displayHeight: number;
  viewMode: ViewMode;
  /** The spine side: a right-bound book reverses its spread rows (#1074). */
  binding: 'left' | 'right';
  /** Page 0 is a recto: it decides which pages share a spread (#1074). */
  firstRecto: boolean;
}

/** Whether the page rows built for `prev` still fit `next`: only the size on
 *  screen may differ. A language switch keeps the page count and size but
 *  can turn the binding or the recto parity (EN ↔ zh vertical, #1074). */
export function sameStructure(prev: GeomSnapshot | null, next: GeomSnapshot): boolean {
  return !!prev
    && prev.pageCount === next.pageCount
    && prev.pageWidthPx === next.pageWidthPx
    && prev.pageHeightPx === next.pageHeightPx
    && prev.viewMode === next.viewMode
    && prev.binding === next.binding
    && prev.firstRecto === next.firstRecto;
}

export const PAGE_PADDING = 32;

/** The space around the pages on screen, in pixels (`canvasViewer`, #1002):
 *  between the two pages of a row, and between one row and the next. */
export interface PageGaps {
  pageGap: number;
  rowGap: number;
}

/** The gaps a book gets when it sets none. */
export const DEFAULT_PAGE_GAPS: PageGaps = { pageGap: 24, rowGap: 24 };

/** Width of the column holding the rows: the pages of a row, the gap
 *  between them and the padding at both sides. */
export function innerRowWidth(displayWidth: number, pagesPerRow: number, pageGap: number): number {
  return displayWidth * pagesPerRow + pageGap * (pagesPerRow - 1) + PAGE_PADDING * 2;
}

/** Padding above and below row `rowIdx` of `totalRows`. The first row
 *  starts at the frame's padding and the last ends at it; between two rows
 *  the gap is split, the lower half on the bottom of the upper row, so the
 *  rows keep whole pixels and the space between them is exactly `rowGap`. */
export function rowPadding(rowIdx: number, totalRows: number, rowGap: number): { top: number; bottom: number } {
  return {
    top: rowIdx === 0 ? PAGE_PADDING : Math.floor(rowGap / 2),
    bottom: rowIdx === totalRows - 1 ? PAGE_PADDING : Math.ceil(rowGap / 2),
  };
}

/** Width of one page when the window is filled by a row of `pagesPerRow`
 *  pages (the frame's padding and the gap between the pages left out). */
export function fitRowPageWidth(containerW: number, pagesPerRow: number, pageGap: number): number {
  return (containerW - PAGE_PADDING * 2 - pageGap * (pagesPerRow - 1)) / pagesPerRow;
}

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
