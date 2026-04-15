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
