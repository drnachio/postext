// Column bands: the text and side columns of a band, how much of them is
// used, and closing a band at a cut for a page-span block (#1278: split out
// of placement.ts).
import { type VDTPage, type VDTColumn, type VDTBlock, createVDTColumn, createBoundingBox } from '../../../vdt.js';
import { type PlacementCursor, placeBlockInColumn } from '../placement.js';

// ---------------------------------------------------------------------------
// Column bands (page-span blocks, stage 1)
//
// `page.columns` stays a flat array in reading order. A page-span inline
// block occupies its own full-width column (`kind: 'span'`); the text
// columns of the band it interrupts are closed at the cut line and a fresh
// band of text columns (`band + 1`) is appended below it with the same
// x / width and the same bottom as the closed band. Column indices are
// monotonic — columns are only ever appended — so `block.columnIndex` keeps
// addressing `page.columns[i]` and renderers need no drawing changes: each
// column clips to its own bbox.
// ---------------------------------------------------------------------------

/** Text columns of `band` in reading order (span and side columns
 *  excluded). */
export function bandColumns(page: VDTPage, band: number): VDTColumn[] {
  return page.columns.filter((c) => c.kind !== 'span' && c.kind !== 'side' && (c.band ?? 0) === band);
}

/** The float-only side column of `band`, if the page has one (a
 *  one-and-a-half layout with `sideColumnRole: 'floats'`; part pages and
 *  single / double layouts have none). */
export function sideColumnOf(page: VDTPage, band: number): VDTColumn | undefined {
  return page.columns.find((c) => c.kind === 'side' && (c.band ?? 0) === band);
}

/** Every float-only side column of the page, band by band. */
export function sideColumns(page: VDTPage): VDTColumn[] {
  return page.columns.filter((c) => c.kind === 'side');
}

/** Bottom of what a side column already holds (absolute y): the top of
 *  the column when it is still empty, else the foot of the last stacked
 *  float — where the next `span: 'side'` float goes. */
export function sideUsedBottom(col: VDTColumn): number {
  return col.bbox.y + (col.bbox.height - col.availableHeight);
}

/** Band the cursor's column belongs to (`0` for the plain single-band page). */
export function currentBand(page: VDTPage, cursor: PlacementCursor): number {
  return page.columns[cursor.columnIndex]?.band ?? 0;
}

/** True when every column of the band has consumed the same height (within
 *  0.5px) — the page top, right after an opener heading (which reserves its
 *  band in every column), right after another span block, or right after a
 *  top float band. Used height = `bbox.height − availableHeight`. */
export function isBandLevel(cols: readonly VDTColumn[]): boolean {
  if (cols.length === 0) return false;
  const usedBottom = (c: VDTColumn): number => c.bbox.y + (c.bbox.height - c.availableHeight);
  const b0 = usedBottom(cols[0]!);
  return cols.every((c) => Math.abs(usedBottom(c) - b0) <= 0.5);
}

/** Lowest used bottom (absolute y) across the band's columns — where a
 *  full-width block can start without covering placed content. */
export function bandUsedBottom(cols: readonly VDTColumn[]): number {
  let bottom = -Infinity;
  for (const c of cols) {
    bottom = Math.max(bottom, c.bbox.y + (c.bbox.height - c.availableHeight));
  }
  return bottom;
}

/**
 * Close the band formed by `cols` at `cutY`, insert a full-width span column
 * holding `block` right below the cut, and open a fresh band of text columns
 * under it. The band's columns are clamped to `cutY` — a column whose top
 * already sits at the cut becomes zero-height — and keep only the slack
 * between their used bottom and the cut in `availableHeight` (zero when the
 * band is level on the grid; whole lines when a band cap cut the band with
 * its last column short, so column balancing can still fill them). The span
 * column is `{ kind: 'span', band }` at `contentArea.x / width`, `needPx`
 * tall (the block plus its spacing, already rounded to the grid by the
 * caller); `block` is placed inside it at `spacingBefore` below the cut with
 * height `blockHeight` (default: the rest of the band), so `block.pageIndex`
 * / `columnIndex` address the span column.
 *
 * The new text columns (`band + 1`) copy each closed column's x / width and
 * keep its original bottom (so a bottom float band reserved on one column
 * still constrains its successor). A column with no room left (bottom
 * within 0.5px of the new band's top) is not created; when none is, the
 * cursor stays on the span column — which is full — so the next placement
 * advances to a new page. Otherwise the cursor moves to the first new
 * column. Returns the span column.
 */
export function closeBandAndInsertSpan(
  page: VDTPage,
  cols: readonly VDTColumn[],
  cutY: number,
  block: VDTBlock,
  needPx: number,
  cursor: PlacementCursor,
  spacingBefore = 0,
  blockHeight = needPx - spacingBefore,
): VDTColumn {
  const band = cols[0]?.band ?? 0;
  const bottoms = cols.map((c) => c.bbox.y + c.bbox.height);
  for (const c of cols) {
    const used = c.bbox.height - c.availableHeight;
    c.band = band;
    c.bbox.height = Math.max(0, cutY - c.bbox.y);
    c.availableHeight = Math.max(0, c.bbox.height - used);
  }

  const spanCol = createVDTColumn(
    page.columns.length,
    createBoundingBox(page.contentArea.x, cutY, page.contentArea.width, needPx),
  );
  spanCol.kind = 'span';
  spanCol.band = band;
  page.columns.push(spanCol);
  cursor.pageIndex = page.index;
  cursor.columnIndex = spanCol.index;
  if (spacingBefore > 0) spanCol.availableHeight -= spacingBefore;
  placeBlockInColumn(block, blockHeight, spanCol, cursor);
  spanCol.availableHeight = 0;

  const newTop = cutY + needPx;
  let firstNew: VDTColumn | undefined;
  cols.forEach((c, i) => {
    const height = bottoms[i]! - newTop;
    if (height < 0.5) return;
    const next = createVDTColumn(
      page.columns.length,
      createBoundingBox(c.bbox.x, newTop, c.bbox.width, height),
    );
    next.band = band + 1;
    page.columns.push(next);
    if (!firstNew) firstNew = next;
  });
  if (firstNew) cursor.columnIndex = firstNew.index;
  // The float-only side column is cut like the text columns: the span
  // block crosses it too. Its stack keeps what it holds above the cut and
  // goes on in a fresh side column under the span block.
  const side = sideColumnOf(page, band);
  if (side) {
    const sideBottom = side.bbox.y + side.bbox.height;
    const used = side.bbox.height - side.availableHeight;
    side.bbox.height = Math.max(0, cutY - side.bbox.y);
    side.availableHeight = Math.max(0, side.bbox.height - used);
    const height = sideBottom - newTop;
    if (height >= 0.5) {
      const next = createVDTColumn(
        page.columns.length,
        createBoundingBox(side.bbox.x, newTop, side.bbox.width, height),
      );
      next.kind = 'side';
      next.band = band + 1;
      page.columns.push(next);
    }
  }
  return spanCol;
}

/**
 * Close the band formed by `cols` at `cutY` and open a fresh band of text
 * columns (`band + 1`) starting at `newTop` (at or under the cut), as
 * {@link closeBandAndInsertSpan} does, with no span column between them:
 * what opens the new band (a page-span heading opened mid-page, #539)
 * spans the page from its first column. The closed columns keep the slack
 * between their used bottom and the cut; the new ones copy each closed
 * column's x / width and keep its bottom. The cursor moves to the first new
 * column. Returns false, changing nothing, when no column would have room
 * under `newTop`.
 */
export function closeBandAt(
  page: VDTPage,
  cols: readonly VDTColumn[],
  cutY: number,
  newTop: number,
  cursor: PlacementCursor,
): boolean {
  const bottoms = cols.map((c) => c.bbox.y + c.bbox.height);
  if (!bottoms.some((b) => b - newTop >= 0.5)) return false;
  const band = cols[0]?.band ?? 0;
  for (const c of cols) {
    const used = c.bbox.height - c.availableHeight;
    c.band = band;
    c.bbox.height = Math.max(0, cutY - c.bbox.y);
    c.availableHeight = Math.max(0, c.bbox.height - used);
  }
  let firstNew: VDTColumn | undefined;
  cols.forEach((c, i) => {
    const height = bottoms[i]! - newTop;
    if (height < 0.5) return;
    const next = createVDTColumn(page.columns.length, createBoundingBox(c.bbox.x, newTop, c.bbox.width, height));
    next.band = band + 1;
    page.columns.push(next);
    if (!firstNew) firstNew = next;
  });
  cursor.pageIndex = page.index;
  cursor.columnIndex = firstNew!.index;
  const side = sideColumnOf(page, band);
  if (side) {
    const sideBottom = side.bbox.y + side.bbox.height;
    const used = side.bbox.height - side.availableHeight;
    side.bbox.height = Math.max(0, cutY - side.bbox.y);
    side.availableHeight = Math.max(0, side.bbox.height - used);
    const height = sideBottom - newTop;
    if (height >= 0.5) {
      const next = createVDTColumn(page.columns.length, createBoundingBox(side.bbox.x, newTop, side.bbox.width, height));
      next.kind = 'side';
      next.band = band + 1;
      page.columns.push(next);
    }
  }
  return true;
}
