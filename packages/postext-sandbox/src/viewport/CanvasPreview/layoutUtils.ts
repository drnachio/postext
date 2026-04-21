import type { HyphenationLocale } from 'postext';

export const LOCALE_TO_HYPHENATION: Record<string, HyphenationLocale> = {
  en: 'en-us', es: 'es', fr: 'fr', de: 'de', it: 'it', pt: 'pt', ca: 'ca', nl: 'nl',
};

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
export function groupPagesIntoRows(pageCount: number, viewMode: ViewMode): number[][] {
  if (viewMode === 'single') {
    return Array.from({ length: pageCount }, (_, i) => [i]);
  }
  const rows: number[][] = [];
  if (pageCount > 0) rows.push([0]);
  for (let i = 1; i < pageCount; i += 2) {
    if (i + 1 < pageCount) {
      rows.push([i, i + 1]);
    } else {
      rows.push([i]);
    }
  }
  return rows;
}
