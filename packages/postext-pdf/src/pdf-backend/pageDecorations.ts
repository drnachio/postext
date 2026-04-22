import type { VDTDocument, VDTPage, VDTColumn, BoundingBox } from 'postext';
import { dimensionToPx } from 'postext';
import { type PageCtx, drawLinePx, colorFromHex } from './primitives';

export function renderBaselineGrid(
  ctx: PageCtx,
  contentArea: BoundingBox,
  baselineIncrement: number,
  colorHex: string,
  lineWidthPx: number,
): void {
  const color = colorFromHex(colorHex, ctx.colorSpace);
  const maxLines = Math.floor(contentArea.height / baselineIncrement);
  let y = contentArea.y + baselineIncrement * 0.8;
  const right = contentArea.x + contentArea.width;
  for (let i = 0; i < maxLines; i++) {
    drawLinePx(ctx, contentArea.x, y, right, y, color, lineWidthPx);
    y += baselineIncrement;
  }
}

export function renderColumnRule(
  ctx: PageCtx,
  columns: VDTColumn[],
  colorHex: string,
  lineWidthPx: number,
): void {
  if (columns.length < 2) return;
  const color = colorFromHex(colorHex, ctx.colorSpace);
  for (let i = 0; i < columns.length - 1; i++) {
    const left = columns[i]!.bbox;
    const right = columns[i + 1]!.bbox;
    const x = (left.x + left.width + right.x) / 2;
    const top = Math.min(left.y, right.y);
    const bottom = Math.max(left.y + left.height, right.y + right.height);
    drawLinePx(ctx, x, top, x, bottom, color, lineWidthPx);
  }
}

export function renderCutLines(ctx: PageCtx, page: VDTPage, doc: VDTDocument): void {
  const { cutLines, dpi } = doc.config.page;
  if (!cutLines.enabled) return;
  const bleedPx = dimensionToPx(cutLines.bleed, dpi);
  const markOffsetPx = dimensionToPx(cutLines.markOffset, dpi);
  const markLengthPx = dimensionToPx(cutLines.markLength, dpi);
  const markWidthPx = dimensionToPx(cutLines.markWidth, dpi);
  const totalExpansion = bleedPx + markOffsetPx + markLengthPx;
  const trimX = totalExpansion;
  const trimY = totalExpansion;
  const trimW = page.width - totalExpansion * 2;
  const trimH = page.height - totalExpansion * 2;
  const color = colorFromHex(cutLines.color.hex, ctx.colorSpace);

  const corners = [
    { x: trimX, y: trimY },
    { x: trimX + trimW, y: trimY },
    { x: trimX, y: trimY + trimH },
    { x: trimX + trimW, y: trimY + trimH },
  ];

  for (const corner of corners) {
    const isLeft = corner.x === trimX;
    const isTop = corner.y === trimY;
    const hDir = isLeft ? -1 : 1;
    const hStart = corner.x + hDir * markOffsetPx;
    const hEnd = corner.x + hDir * (markOffsetPx + markLengthPx);
    drawLinePx(ctx, hStart, corner.y, hEnd, corner.y, color, markWidthPx);
    const vDir = isTop ? -1 : 1;
    const vStart = corner.y + vDir * markOffsetPx;
    const vEnd = corner.y + vDir * (markOffsetPx + markLengthPx);
    drawLinePx(ctx, corner.x, vStart, corner.x, vEnd, color, markWidthPx);
  }
}

export function computeContentArea(page: VDTPage, doc: VDTDocument): BoundingBox {
  const { dpi, margins } = doc.config.page;
  const pxPerCm = dpi / 2.54;
  const marginTop = margins.top.unit === 'cm' ? margins.top.value * pxPerCm : margins.top.value;
  const marginLeft = margins.left.unit === 'cm' ? margins.left.value * pxPerCm : margins.left.value;
  if (page.columns.length > 0) {
    const firstCol = page.columns[0]!;
    const lastCol = page.columns[page.columns.length - 1]!;
    return {
      x: firstCol.bbox.x,
      y: firstCol.bbox.y,
      width: (lastCol.bbox.x + lastCol.bbox.width) - firstCol.bbox.x,
      height: firstCol.bbox.height,
    };
  }
  return { x: marginLeft, y: marginTop, width: 0, height: 0 };
}
