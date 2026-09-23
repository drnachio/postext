import type { BoundingBox, LayoutType, VDTBlock, VDTDocument, VDTPage } from 'postext';

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

/** Move a float and everything drawn inside it `dy` down the page. The
 *  geometry a renderer reads is part block-relative and part absolute — a
 *  figure's body sits inside its block, its caption lines and caption bar do
 *  not — so every absolute field travels. */
function shiftBlockY(block: VDTBlock, dy: number): void {
  block.bbox.y += dy;
  for (const line of block.lines) {
    line.bbox.y += dy;
    line.baseline += dy;
  }
  if (block.bulletY !== undefined) block.bulletY += dy;
  const rb = block.resourceBlock;
  if (rb) {
    for (const ln of [...rb.captionLines, ...rb.noteLines, ...(rb.continuesLines ?? [])]) {
      ln.bbox.y += dy;
      ln.baseline += dy;
    }
    if (rb.captionBar) rb.captionBar.rect.y += dy;
    if (rb.rotation) rb.rotation.originY += dy;
    for (const cell of rb.table?.cells ?? []) {
      cell.rect.y += dy;
      if (cell.image) cell.image.rect.y += dy;
      for (const cl of cell.lines) {
        cl.bbox.y += dy;
        cl.baseline += dy;
      }
    }
  }
  const overlay = block.designOverlay;
  if (overlay) {
    overlay.bbox.y += dy;
    for (const b of overlay.blocks) {
      b.bbox.y += dy;
      if (b.kind === 'text') for (const l of b.lines) l.baselineY += dy;
    }
  }
}

/** Bottom of everything a page holds in its columns (its opener band
 *  included); floats are left out — see {@link liftStrandedFloats}. */
function columnContentBottom(page: VDTPage): number {
  let bottom = 0;
  const take = (box: BoundingBox): void => {
    bottom = Math.max(bottom, box.y + box.height);
  };
  for (const col of page.columns) {
    for (const block of col.blocks) {
      if (block.hidden) continue;
      take(block.bbox);
      for (const ob of block.designOverlay?.blocks ?? []) take(ob.bbox);
    }
  }
  for (const ob of page.openerBand?.blocks ?? []) take(ob.bbox);
  return bottom;
}

/** Bring floats that were parked past the end of the text back under it.
 *
 *  Vertical scroll lays out on one very tall page, and a float the engine
 *  placed in its foot band — a chapter's tail ornament, a figure that found
 *  no earlier slot — lands at the bottom of that page: thousands of pixels
 *  of nothing, and the reader stops there believing the book ended. A scroll
 *  has no foot to speak of, so they follow the text instead, keeping their
 *  arrangement (a floated callout and its content move together). */
function liftStrandedFloats(page: VDTPage, gapPx: number): void {
  const floats = page.floats ?? [];
  if (floats.length === 0) return;
  const bottom = columnContentBottom(page);
  const stranded = floats.filter((f) => f.bbox.y >= bottom);
  if (stranded.length === 0) return;
  let top = Infinity;
  for (const f of stranded) top = Math.min(top, f.bbox.y);
  const dy = bottom + gapPx - top;
  if (dy >= 0) return;
  for (const f of stranded) shiftBlockY(f, dy);
}

/** Shrink every page of `doc` to what it holds, plus `padPx` of air.
 *
 *  Single-scroll mode lays out on one very tall page so the text never runs
 *  out of room, but a break that opens a second one — a part divider, a
 *  chapter that starts a page of its own — would otherwise leave a screenful
 *  of nothing between them: the page keeps its full height whatever it
 *  holds. On a scroll surface a page is only a scroll unit, so it may hug
 *  its content. Mutates the document (the viewer owns it). */
export function fitPagesToContent(doc: VDTDocument, padPx: number): void {
  for (const page of doc.pages) {
    liftStrandedFloats(page, padPx);
    let bottom = 0;
    const take = (box: BoundingBox): void => {
      bottom = Math.max(bottom, box.y + box.height);
    };
    for (const col of page.columns) {
      for (const block of col.blocks) {
        if (block.hidden) continue;
        take(block.bbox);
        for (const ob of block.designOverlay?.blocks ?? []) take(ob.bbox);
      }
    }
    for (const float of page.floats ?? []) take(float.bbox);
    for (const ob of page.openerBand?.blocks ?? []) take(ob.bbox);
    page.height = Math.max(Math.ceil(bottom + padPx), 1);
  }
}

/** Width of the single page vertical scroll lays out on: the measure itself
 *  for a one- or two-column document (which flattens to one column here),
 *  and for a one-and-a-half book the width whose main column comes out at
 *  the measure — its side column then rides in the margin beside the text,
 *  as it does on the leaf. Never wider than the viewer. */
export function singleScrollPageWidthPx(input: {
  innerViewportW: number;
  targetColumnPx: number;
  gutterPx: number;
  layoutType: LayoutType;
  sideFraction: number;
}): number {
  const { innerViewportW, targetColumnPx, gutterPx, layoutType, sideFraction } = input;
  const wanted = layoutType === 'oneAndHalf'
    ? (targetColumnPx + gutterPx) / Math.max(1 - sideFraction, 0.5)
    : targetColumnPx;
  return Math.max(Math.floor(Math.min(wanted, innerViewportW)), 80);
}

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
