import {
  createBoundingBox,
  createVDTPage,
  createVDTColumn,
  type BoundingBox,
  type ResolvedConfig,
  type VDTDocument,
  type VDTBlock,
  type VDTLine,
  type VDTPage,
  type VDTColumn,
} from '../vdt';
import type { HeadingBreakParity } from '../types';
import { computeColumnBboxes } from './config';
import { contentAreaForPage, mirrorContentArea, type PageMetrics } from './buildHelpers';
import { dimensionToPx } from '../units';

export interface PlacementCursor {
  pageIndex: number;
  columnIndex: number;
}

export function resetLinePositions(
  lines: VDTLine[],
  lineHeightPx: number,
): VDTLine[] {
  return lines.map((line, i) => ({
    ...line,
    bbox: createBoundingBox(line.bbox.x, i * lineHeightPx, line.bbox.width, lineHeightPx),
    baseline: i * lineHeightPx + lineHeightPx * 0.8,
  }));
}

export function createPageWithColumns(
  pageIndex: number,
  resolved: ResolvedConfig,
  contentArea: BoundingBox,
  pageWidthPx: number,
  pageHeightPx: number,
): VDTPage {
  // `contentArea` is the recto (odd-page) area; mirrored margins swap the
  // inner/outer margins on even pages. `pageIndex` is the page's position in
  // `doc.pages`, so page number = index + 1.
  const pageArea = contentAreaForPage({ contentArea, pageWidthPx }, resolved, pageIndex);
  const page = createVDTPage(pageIndex, pageWidthPx, pageHeightPx, pageArea);
  const colBboxes = computeColumnBboxes(pageArea, resolved);
  for (let i = 0; i < colBboxes.length; i++) {
    page.columns.push(createVDTColumn(i, colBboxes[i]!));
  }
  return page;
}

/** Turn a freshly opened (empty) page into a part-divider page: a single
 *  body column inset from the trim box by `parts.margins` (mirrored on even
 *  pages when `parts.margins.mirror` is on), `page.contentArea` set to that
 *  area, `partInfo` stamped and the role fixed to `'part'`. The opener
 *  design is laid out later by `buildHeadersAndFooters` against the full
 *  trim box and never reserves body space. */
export function createPartPage(
  page: VDTPage,
  metrics: Pick<PageMetrics, 'trimBox' | 'pageWidthPx'>,
  resolved: ResolvedConfig,
  info: { number: string; title: string; titleSourceStart?: number; titleSourceEnd?: number },
): VDTPage {
  const dpi = resolved.page.dpi;
  const m = resolved.parts.margins;
  const trim = metrics.trimBox;
  const top = dimensionToPx(m.top, dpi);
  const bottom = dimensionToPx(m.bottom, dpi);
  const left = dimensionToPx(m.left, dpi);
  const right = dimensionToPx(m.right, dpi);
  let area = createBoundingBox(
    trim.x + left,
    trim.y + top,
    Math.max(0, trim.width - left - right),
    Math.max(0, trim.height - top - bottom),
  );
  const isEvenPage = (page.index + 1) % 2 === 0;
  if (m.mirror && isEvenPage) area = mirrorContentArea(area, metrics.pageWidthPx);
  page.contentArea = area;
  page.columns = [createVDTColumn(0, area)];
  page.partInfo = {
    number: info.number,
    title: info.title,
    titleSourceStart: info.titleSourceStart,
    titleSourceEnd: info.titleSourceEnd,
  };
  page.role = 'part';
  return page;
}

export function currentColumn(doc: VDTDocument, cursor: PlacementCursor): VDTColumn {
  return doc.pages[cursor.pageIndex]!.columns[cursor.columnIndex]!;
}

/** Whether any column of the page — text or span — holds a placed block.
 *  Floats live outside the columns and do not count. */
export function pageHasContent(page: VDTPage): boolean {
  return page.columns.some((c) => c.blocks.length > 0);
}

/** Whether the page holds anything at all — column content or floats (a
 *  page carrying only a drained float band is occupied: the next chapter
 *  must not open on it). */
export function pageIsOccupied(page: VDTPage): boolean {
  return pageHasContent(page) || (page.floats?.length ?? 0) > 0;
}

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

/** Text columns of `band` in reading order (span columns excluded). */
export function bandColumns(page: VDTPage, band: number): VDTColumn[] {
  return page.columns.filter((c) => c.kind !== 'span' && (c.band ?? 0) === band);
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
  const used0 = cols[0]!.bbox.height - cols[0]!.availableHeight;
  return cols.every((c) => Math.abs((c.bbox.height - c.availableHeight) - used0) <= 0.5);
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
  return spanCol;
}

export function advanceToNextColumn(
  doc: VDTDocument,
  cursor: PlacementCursor,
  resolved: ResolvedConfig,
  contentArea: BoundingBox,
  pageWidthPx: number,
  pageHeightPx: number,
  onNewPage?: (page: VDTPage) => void,
): void {
  const page = doc.pages[cursor.pageIndex]!;
  if (cursor.columnIndex < page.columns.length - 1) {
    cursor.columnIndex++;
  } else {
    // New page
    const newPage = createPageWithColumns(
      doc.pages.length,
      resolved,
      contentArea,
      pageWidthPx,
      pageHeightPx,
    );
    doc.pages.push(newPage);
    cursor.pageIndex = newPage.index;
    cursor.columnIndex = 0;
    // Let the caller reserve float bands at the top/bottom of the freshly
    // opened page before any content flows into it. Only the content-flow
    // advances pass this hook — parity / force-blank pages never receive
    // floats because `enforcePageParity` calls this without `onNewPage`.
    onNewPage?.(newPage);
  }
}

/** Advance `cursor` forward until it points to the first column of a new
 *  page. No-op when the current page is empty (nothing placed yet) — avoids
 *  emitting a blank leading page when a `:::pagebreak` directive lands
 *  before any content. */
export function advanceToNextPageBoundary(
  doc: VDTDocument,
  cursor: PlacementCursor,
  resolved: ResolvedConfig,
  contentArea: BoundingBox,
  pageWidthPx: number,
  pageHeightPx: number,
  onNewPage?: (page: VDTPage) => void,
): void {
  // Span columns hold their block like any other column, so a page whose
  // only content is a page-span block counts as non-empty here; so does a
  // page holding only float bands (a drained chapter's leftover figures).
  if (!pageIsOccupied(doc.pages[cursor.pageIndex]!)) return;
  const startPageIndex = cursor.pageIndex;
  do {
    advanceToNextColumn(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx, onNewPage);
  } while (cursor.pageIndex === startPageIndex);
}

/** After a forced page break, make sure the page we're sitting on has the
 *  requested parity. If not, flag the current page as a blank-for-parity
 *  placeholder and advance to the next page. Repeats until parity matches
 *  (at most one extra page in practice). Parity uses `pageIndex + 1`
 *  (page 1 = odd) — the same convention as header/footer parity.
 *
 *  For the `always-*` modes, one mandatory blank page is inserted first
 *  (flagged as `blankForForce`, belonging to the previous chapter) before
 *  the parity check runs. This guarantees at least one separator page
 *  between the previous content and the new chapter, regardless of
 *  whether the natural next page already matched the requested parity. */
export function enforcePageParity(
  doc: VDTDocument,
  cursor: PlacementCursor,
  resolved: ResolvedConfig,
  contentArea: BoundingBox,
  pageWidthPx: number,
  pageHeightPx: number,
  parity: HeadingBreakParity,
): void {
  if (parity === 'any') return;
  // Document-start exception: when the first block of the document is a
  // heading with `breakBefore` (or the source opens with a `:::pagebreak`),
  // we're still sitting on page 0 with nothing placed yet. Skip parity
  // and force logic entirely — there's no previous content to separate
  // from, and padding would only create a spurious blank opening page.
  if (cursor.pageIndex === 0) {
    const firstPage = doc.pages[0];
    if (firstPage && firstPage.columns.every((c) => c.blocks.length === 0)) {
      return;
    }
  }
  const alwaysForce = parity === 'always-odd' || parity === 'always-even';
  const targetParity: 'odd' | 'even' =
    parity === 'always-odd' ? 'odd'
    : parity === 'always-even' ? 'even'
    : parity;
  if (alwaysForce) {
    doc.pages[cursor.pageIndex]!.blankForForce = true;
    const startPageIndex = cursor.pageIndex;
    do {
      advanceToNextColumn(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx);
    } while (cursor.pageIndex === startPageIndex);
  }
  while (true) {
    const curPage = doc.pages[cursor.pageIndex]!;
    const pageNumber = curPage.index + 1;
    const isOdd = pageNumber % 2 === 1;
    const ok = targetParity === 'odd' ? isOdd : !isOdd;
    if (ok) return;
    curPage.blankForParity = true;
    const startPageIndex = cursor.pageIndex;
    do {
      advanceToNextColumn(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx);
    } while (cursor.pageIndex === startPageIndex);
  }
}

/**
 * Place an atomic block — a resource group (image / svg / table + caption,
 * issue #49 §7) or a callout frame — keeping it together as one unit. Atomic
 * blocks never split mid-content for v1: if the group's combined height fits
 * the remaining column space it is placed there; otherwise the cursor advances
 * to the next column/page (without emitting a leading blank page when the
 * current column is empty), and the block is force-placed there even when it
 * exceeds a single column's height.
 *
 * `spacingBefore` is consumed from the target column's available height before
 * placement (collapsed against the previous block's bottom margin by the
 * caller). Returns the height actually reserved for the block.
 */
export function placeAtomicBlock(
  block: VDTBlock,
  groupHeight: number,
  spacingBefore: number,
  cursor: PlacementCursor,
  doc: VDTDocument,
  resolved: ResolvedConfig,
  contentArea: BoundingBox,
  pageWidthPx: number,
  pageHeightPx: number,
): number {
  let col = currentColumn(doc, cursor);
  const isFirstInColumn = col.blocks.length === 0;
  const effectiveSpacing = isFirstInColumn ? 0 : spacingBefore;
  const available = col.availableHeight - effectiveSpacing;

  // Advance to the next column/page when the group does not fit and the current
  // column already holds content. A group taller than a full column is placed
  // anyway (no mid-split for v1) once it lands in an empty column.
  if (groupHeight > available && col.blocks.length > 0) {
    advanceToNextColumn(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx);
    col = currentColumn(doc, cursor);
  }

  const consumeSpacing = col.blocks.length === 0 ? 0 : spacingBefore;
  if (consumeSpacing > 0) col.availableHeight -= consumeSpacing;
  placeBlockInColumn(block, groupHeight, col, cursor);
  return groupHeight;
}

/** @deprecated Use {@link placeAtomicBlock}. */
export const placeResourceBlock = placeAtomicBlock;

export function placeBlockInColumn(
  block: VDTBlock,
  blockHeight: number,
  col: VDTColumn,
  cursor: PlacementCursor,
): void {
  const y = col.bbox.y + (col.bbox.height - col.availableHeight);
  block.bbox = createBoundingBox(col.bbox.x, y, col.bbox.width, blockHeight);
  block.pageIndex = cursor.pageIndex;
  block.columnIndex = cursor.columnIndex;

  // Offset all line bboxes to absolute page coordinates
  for (const line of block.lines) {
    line.bbox.x += col.bbox.x;
    line.bbox.y += y;
    line.baseline += y;
  }

  col.blocks.push(block);
  col.availableHeight -= blockHeight;
}
