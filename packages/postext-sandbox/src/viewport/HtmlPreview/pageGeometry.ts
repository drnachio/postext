import type { LayoutType } from 'postext';

export interface PageGeometryInput {
  /** Viewer width available to pages, padding excluded. */
  innerViewportW: number;
  /** Gap the viewer leaves between two consecutive pages. */
  columnGapPx: number;
  /** Gutter between the text columns of one page (double / one-and-a-half). */
  gutterPx: number;
  /** Main text column width that gives the configured measure. */
  targetColumnPx: number;
  layoutType: LayoutType;
  /** Side column share of the page width in one-and-a-half layouts. */
  sideFraction: number;
}

export interface PageGeometry {
  pageWidthPx: number;
  /** Text columns the viewer shows at once. In a double layout an odd count
   *  means the last visible column belongs to a page that is only half in
   *  view; the reader scrolls page by page all the same. */
  visibleColumns: number;
}

const MIN_COLUMN_PX = 40;

/** Multi-column geometry: the number of visible text columns whose width is
 *  closest to the target measure, not the most that fit. A double-column
 *  document keeps its two-column pages (page-span floats, gutters, parity
 *  all as the engine lays them out), but the viewer may show three of its
 *  columns rather than stretching two or squeezing four when three is the
 *  nearest fit. Closeness is proportional (a column 20% too wide and one
 *  20% too narrow are equally off). */
export function pickPageGeometry(input: PageGeometryInput): PageGeometry {
  const { innerViewportW, columnGapPx, gutterPx, targetColumnPx, layoutType, sideFraction } = input;
  const target = Math.max(targetColumnPx, 1);
  let best: { pageWidthPx: number; columns: number; error: number } | null = null;

  for (let n = 1; n <= 64; n++) {
    let columnPx: number;
    let pageWidthPx: number;
    if (layoutType === 'double') {
      // n columns: floor(n/2) gutters inside fully visible pages, plus a
      // gap before each page after the first (ceil(n/2) pages in view).
      const pagesInView = Math.ceil(n / 2);
      columnPx =
        (innerViewportW - Math.floor(n / 2) * gutterPx - (pagesInView - 1) * columnGapPx) / n;
      pageWidthPx = columnPx * 2 + gutterPx;
    } else {
      pageWidthPx = (innerViewportW - (n - 1) * columnGapPx) / n;
      columnPx =
        layoutType === 'oneAndHalf'
          ? pageWidthPx * Math.max(1 - sideFraction, 0.5) - gutterPx
          : pageWidthPx;
    }
    if (columnPx < MIN_COLUMN_PX) break;
    const error = Math.abs(Math.log(columnPx / target));
    if (best && error >= best.error) break; // widths only shrink from here
    best = { pageWidthPx, columns: n, error };
  }

  if (!best) {
    // Nothing reaches a readable column: one page, as wide as the viewer.
    return { pageWidthPx: Math.max(Math.floor(innerViewportW), 80), visibleColumns: 1 };
  }
  return {
    pageWidthPx: Math.max(Math.floor(best.pageWidthPx), 80),
    visibleColumns: best.columns,
  };
}
