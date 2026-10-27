import { type VDTLine, createBoundingBox, type VDTPage, type ResolvedConfig, type BoundingBox, createVDTPage, verticalFlowFrame, mirroredFlowFrame, createVDTColumn, type VDTDocument, type VDTColumn, type VDTBlock } from '../../vdt.js';
import { settleColumnWraps } from '../floats/textWrap.js';
import type { HeadingBreakParity } from '../../types.js';
import { computeColumnBboxes, hasFloatSideColumn } from '../config.js';
import { contentAreaForPage, flowPageMirrored, type PageMetrics, pageMirrored, mirrorContentArea, sheetRectToFlow, widthLessEndIndent } from './buildHelpers.js';
import { dimensionToPx } from '../../units.js';
import { measuringVertically } from '../../measure/vertical.js';
import { shiftLineX } from '../../measure/rtl/bidiLines.js';

export { bandColumns, sideColumnOf, sideColumns, sideUsedBottom, currentBand, isBandLevel, bandUsedBottom, closeBandAndInsertSpan, closeBandAt } from './placement/bands.js';

export interface PlacementCursor {
  pageIndex: number;
  columnIndex: number;
}

export function resetLinePositions(
  lines: VDTLine[],
  lineHeightPx: number,
): VDTLine[] {
  // A vertical line keeps the baseline it was measured with, which centres
  // its characters in the line box (`lineBaselineOffset`).
  const vertical = measuringVertically();
  return lines.map((line, i) => ({
    ...line,
    bbox: createBoundingBox(line.bbox.x, i * lineHeightPx, line.bbox.width, lineHeightPx),
    baseline: i * lineHeightPx + (vertical ? line.baseline - line.bbox.y : lineHeightPx * 0.8),
  }));
}

/** The layout each page's columns were cut with: the document's, or a
 *  styled section's own (`deriveSectionGeometryConfig`). */
const pageLayouts = new WeakMap<VDTPage, ResolvedConfig['layout']>();

/** The layout `page` was created with (see `createPageWithColumns`). */
export function pageLayoutOf(page: VDTPage): ResolvedConfig['layout'] | undefined {
  return pageLayouts.get(page);
}

export function createPageWithColumns(
  pageIndex: number,
  resolved: ResolvedConfig,
  contentArea: BoundingBox,
  pageWidthPx: number,
  pageHeightPx: number,
  pageIndexOffset = 0,
): VDTPage {
  // `contentArea` is the recto (odd-page) area; mirrored margins swap the
  // inner/outer margins on the pages facing the other way (`pageMirrored`).
  // `pageIndex` is the page's position in `doc.pages`, so page number =
  // index + 1 (+ the pages before a continued document). `pageWidthPx` /
  // `pageHeightPx` are the sheet's; a vertical layout's `contentArea` is in
  // the flow frame, and the page carries that frame (`page.flow`); so is a
  // right-to-left document's, whose pages carry the mirrored frame.
  const pageArea = contentAreaForPage({ contentArea, pageWidthPx }, resolved, pageIndex, pageIndexOffset);
  const page = createVDTPage(pageIndex, pageWidthPx, pageHeightPx, pageArea);
  if (resolved.layout.writingMode === 'vertical-rl') page.flow = verticalFlowFrame(pageWidthPx, pageHeightPx);
  else if (resolved.direction === 'rtl') page.flow = mirroredFlowFrame(pageWidthPx);
  // The columns are cut in the flow, where an `'outer'` side column follows
  // the flow's parity (`flowPageMirrored`).
  const colBboxes = computeColumnBboxes(pageArea, resolved, flowPageMirrored(resolved, page, pageIndexOffset));
  const sideIndex = hasFloatSideColumn(resolved) ? colBboxes.length - 1 : -1;
  for (let i = 0; i < colBboxes.length; i++) {
    const col = createVDTColumn(i, colBboxes[i]!);
    if (i === sideIndex) col.kind = 'side';
    page.columns.push(col);
  }
  pageLayouts.set(page, resolved.layout);
  return page;
}

/** Turn a freshly opened (empty) page into a part-divider page: a single
 *  body column inset from the trim box by `parts.margins` (mirrored on the
 *  pages `pageMirrored` names when `parts.margins.mirror` is on),
 *  `page.contentArea` set to that area, `partInfo` stamped and the role
 *  fixed to `'part'`. The opener design is laid out later by
 *  `buildHeadersAndFooters` against the full trim box and never reserves
 *  body space. The margins keep their names on the sheet, as the page
 *  margins do: the area is cut from the physical trim box, mirrored there
 *  and, on a vertical page, turned into the flow frame (a vertical
 *  document's part page is vertical too; a right-to-left document's is
 *  mirrored). */
export function createPartPage(
  page: VDTPage,
  metrics: Pick<PageMetrics, 'physical' | 'pageWidthPx'> & Partial<Pick<PageMetrics, 'vertical' | 'mirrored' | 'pageHeightPx'>>,
  resolved: ResolvedConfig,
  info: { number: string; title: string; palette?: Record<string, string>; titleSourceStart?: number; titleSourceEnd?: number },
  pageIndexOffset = 0,
): VDTPage {
  const dpi = resolved.page.dpi;
  const m = resolved.parts.margins;
  const vertical = metrics.vertical === true;
  const mirrored = !vertical && metrics.mirrored === true;
  const trim = metrics.physical.trimBox;
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
  if (pageMirrored(resolved, page.index, pageIndexOffset, m.mirror)) area = mirrorContentArea(area, metrics.pageWidthPx);
  if (vertical) area = sheetRectToFlow(area, metrics.pageWidthPx);
  else if (mirrored) area = mirrorContentArea(area, metrics.pageWidthPx);
  page.contentArea = area;
  if (vertical) page.flow = verticalFlowFrame(page.width, page.height);
  else if (mirrored) page.flow = mirroredFlowFrame(page.width);
  else delete page.flow;
  page.columns = [createVDTColumn(0, area)];
  page.partInfo = {
    number: info.number,
    title: info.title,
    ...(info.palette && Object.keys(info.palette).length > 0 ? { palette: info.palette } : {}),
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

/** Whether the page holds anything at all — column content, floats or a
 *  comic page (a page carrying only a drained float band is occupied: the
 *  next chapter must not open on it). */
export function pageIsOccupied(page: VDTPage): boolean {
  return pageHasContent(page) || (page.floats?.length ?? 0) > 0 || page.comic !== undefined || page.composed !== undefined;
}

/** The next column of `page` after `columnIndex` that takes body text, or
 *  -1: the flow skips float-only side columns, which never take any. */
export function nextFlowColumn(page: VDTPage, columnIndex: number): number {
  let next = columnIndex + 1;
  while (next < page.columns.length && page.columns[next]!.kind === 'side') next++;
  return next < page.columns.length ? next : -1;
}

/** Whether column `col` can take a line of text `minRoomPx` high: not a
 *  float-only side column, and not one the floats placed so far have
 *  filled (a table that takes a whole column of a datasheet). */
function takesText(col: VDTColumn, minRoomPx: number): boolean {
  return col.kind !== 'side' && col.availableHeight >= minRoomPx - 0.01;
}

/**
 * Whether the text that leaves column `columnIndex` of `page` goes on to
 * another page: no later column of the page takes a line `minRoomPx` high.
 * The guard of `bodyText.hyphenateAcrossColumns: 'withinPage'` (#701) reads
 * it. It is the test {@link advanceToNextColumn} makes (it skips side
 * columns and opens a page after the last column), and it also counts out
 * a column with no room left, which the flow would enter only to leave.
 */
export function columnClosesPage(page: VDTPage, columnIndex: number, minRoomPx = 0): boolean {
  return flowColumnsAfter(page, columnIndex, minRoomPx) === 0;
}

/** How many columns of `page` after `columnIndex` take a line of text
 *  `minRoomPx` high. */
export function flowColumnsAfter(page: VDTPage, columnIndex: number, minRoomPx = 0): number {
  let count = 0;
  for (let i = columnIndex + 1; i < page.columns.length; i++) if (takesText(page.columns[i]!, minRoomPx)) count++;
  return count;
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
  // The column the flow leaves keeps the room of what text wrapped round
  // in it (#627): it ends under the picture, or at the top of one at its
  // foot.
  const leaving = page.columns[cursor.columnIndex];
  if (leaving) settleColumnWraps(leaving);
  // The flow skips float-only side columns: they never take body text.
  const next = nextFlowColumn(page, cursor.columnIndex);
  if (next >= 0) {
    cursor.columnIndex = next;
  } else {
    // New page
    const newPage = createPageWithColumns(
      doc.pages.length,
      resolved,
      contentArea,
      pageWidthPx,
      pageHeightPx,
      doc.pageIndexOffset ?? 0,
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
  const pageIndexOffset = doc.pageIndexOffset ?? 0;
  // Document-start exception: when the first block of the document is a
  // heading with `breakBefore` (or the source opens with a `:::pagebreak`),
  // we're still sitting on page 0 with nothing placed yet. Skip parity
  // and force logic entirely — there's no previous content to separate
  // from, and padding would only create a spurious blank opening page.
  // A continued document (a chapter laid out after the pages before it)
  // has that previous content, so it pads exactly as it would mid-book.
  if (cursor.pageIndex === 0 && pageIndexOffset === 0) {
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
    const pageNumber = curPage.index + pageIndexOffset + 1;
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
/** Tolerance for "does this block fit" checks against a column's free
 *  height, absorbing floating-point drift between grid multiples: a line
 *  pitch that is no whole number of pixels (29 pt at 150 dpi is 60.41666…
 *  px) leaves the running sums of grid lines about 1e-13 px off (#635).
 *  Every comparison of a free height with a needed one takes it. */
export const FIT_EPS = 0.01;

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
  /** Called with each page the block opens, before it is placed there (the
   *  flow's float flush, see `advanceToNextColumn`). */
  onNewPage?: (page: VDTPage) => void,
): number {
  let col = currentColumn(doc, cursor);

  // Advance to the next column/page when the group does not fit and the
  // current column already holds content — or is empty with no room at all
  // (a band cap cutting right under a float band). A group taller than a
  // full column is placed anyway (no mid-split for v1) once it lands in an
  // empty column that has room. Bounded: a fresh page always has room.
  let guard = 0;
  for (;;) {
    const available = col.availableHeight - (col.blocks.length === 0 ? 0 : spacingBefore);
    // A hair of tolerance: the trailing-callout lever pushes a box flush
    // with its column's last grid slot, and that "exact" room differs from
    // the free height by floating-point noise.
    if (groupHeight <= available + FIT_EPS) break;
    // An empty column cut short — under an opener band, a float — is no
    // place to overflow from when a whole column would hold the group: it
    // moves on, as a box does (#288: an upright figure on a vertical page,
    // as long as the flow is tall, ran off the sheet beside an opener).
    const fitsFreshColumn = groupHeight <= contentArea.height + FIT_EPS;
    if (col.blocks.length === 0 && col.availableHeight >= 0.5 && !fitsFreshColumn) break;
    if (guard++ >= 8) break;
    advanceToNextColumn(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx, onNewPage);
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
  block.bbox = createBoundingBox(col.bbox.x, y, widthLessEndIndent(block, col.bbox.width), blockHeight);
  block.pageIndex = cursor.pageIndex;
  block.columnIndex = cursor.columnIndex;

  // Offset all line bboxes to absolute page coordinates
  for (const line of block.lines) {
    shiftLineX(line, col.bbox.x);
    line.bbox.y += y;
    line.baseline += y;
  }

  col.blocks.push(block);
  col.availableHeight -= blockHeight;
}
