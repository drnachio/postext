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
  const page = createVDTPage(pageIndex, pageWidthPx, pageHeightPx);
  const colBboxes = computeColumnBboxes(contentArea, resolved);
  for (let i = 0; i < colBboxes.length; i++) {
    page.columns.push(createVDTColumn(i, colBboxes[i]!));
  }
  return page;
}

export function currentColumn(doc: VDTDocument, cursor: PlacementCursor): VDTColumn {
  return doc.pages[cursor.pageIndex]!.columns[cursor.columnIndex]!;
}

export function advanceToNextColumn(
  doc: VDTDocument,
  cursor: PlacementCursor,
  resolved: ResolvedConfig,
  contentArea: BoundingBox,
  pageWidthPx: number,
  pageHeightPx: number,
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
): void {
  const curPage = doc.pages[cursor.pageIndex]!;
  const curPageEmpty = curPage.columns.every((c) => c.blocks.length === 0);
  if (curPageEmpty) return;
  const startPageIndex = cursor.pageIndex;
  do {
    advanceToNextColumn(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx);
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
 * Place a resource block (image / svg / table + caption) keeping it together as
 * one atomic unit (issue #49 §7 — Placement). Resources never split mid-content
 * for v1: if the group's combined height fits the remaining column space it is
 * placed there; otherwise the cursor advances to the next column/page (without
 * emitting a leading blank page when the current column is empty), and the
 * resource is force-placed there even when it exceeds a single column's height.
 *
 * `spacingBefore` is consumed from the target column's available height before
 * placement (collapsed against the previous block's bottom margin by the
 * caller). Returns the height actually reserved for the block.
 */
export function placeResourceBlock(
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
