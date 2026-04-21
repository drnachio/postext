import type { VDTDocument, VDTPage, VDTColumn, BoundingBox } from '../vdt';
import { dimensionToPx } from '../units';

export function renderBaselineGrid(
  ctx: CanvasRenderingContext2D,
  contentArea: BoundingBox,
  baselineIncrement: number,
  color: string,
  lineWidth: number,
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;

  // Draw one baseline per line that actually fits in the content area.
  // Must match the placement logic: Math.floor(height / lineHeight) lines.
  const maxLines = Math.floor(contentArea.height / baselineIncrement);
  let y = contentArea.y + baselineIncrement * 0.8;
  const right = contentArea.x + contentArea.width;

  for (let i = 0; i < maxLines; i++) {
    ctx.beginPath();
    ctx.moveTo(contentArea.x, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    y += baselineIncrement;
  }

  ctx.restore();
}

export function renderColumnRule(
  ctx: CanvasRenderingContext2D,
  columns: VDTColumn[],
  color: string,
  lineWidth: number,
): void {
  if (columns.length < 2) return;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;

  for (let i = 0; i < columns.length - 1; i++) {
    const left = columns[i]!.bbox;
    const right = columns[i + 1]!.bbox;
    const x = (left.x + left.width + right.x) / 2;
    const top = Math.min(left.y, right.y);
    const bottom = Math.max(left.y + left.height, right.y + right.height);

    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
  }

  ctx.restore();
}

export function renderCutLines(
  ctx: CanvasRenderingContext2D,
  page: VDTPage,
  doc: VDTDocument,
): void {
  const { cutLines, dpi } = doc.config.page;
  if (!cutLines.enabled) return;

  const bleedPx = dimensionToPx(cutLines.bleed, dpi);
  const markOffsetPx = dimensionToPx(cutLines.markOffset, dpi);
  const markLengthPx = dimensionToPx(cutLines.markLength, dpi);
  const markWidthPx = dimensionToPx(cutLines.markWidth, dpi);
  const totalExpansion = bleedPx + markOffsetPx + markLengthPx;

  // Trim rect (the final page after cutting)
  const trimX = totalExpansion;
  const trimY = totalExpansion;
  const trimW = page.width - totalExpansion * 2;
  const trimH = page.height - totalExpansion * 2;

  ctx.save();
  ctx.strokeStyle = cutLines.color.hex;
  ctx.lineWidth = markWidthPx;

  // Each corner has two perpendicular marks.
  // Marks start at markOffset outside the trim edge and extend markLength further out.
  const corners = [
    { x: trimX, y: trimY },                    // top-left
    { x: trimX + trimW, y: trimY },            // top-right
    { x: trimX, y: trimY + trimH },            // bottom-left
    { x: trimX + trimW, y: trimY + trimH },    // bottom-right
  ];

  for (const corner of corners) {
    const isLeft = corner.x === trimX;
    const isTop = corner.y === trimY;

    // Horizontal mark
    const hDir = isLeft ? -1 : 1;
    const hStart = corner.x + hDir * markOffsetPx;
    const hEnd = corner.x + hDir * (markOffsetPx + markLengthPx);
    ctx.beginPath();
    ctx.moveTo(hStart, corner.y);
    ctx.lineTo(hEnd, corner.y);
    ctx.stroke();

    // Vertical mark
    const vDir = isTop ? -1 : 1;
    const vStart = corner.y + vDir * markOffsetPx;
    const vEnd = corner.y + vDir * (markOffsetPx + markLengthPx);
    ctx.beginPath();
    ctx.moveTo(corner.x, vStart);
    ctx.lineTo(corner.x, vEnd);
    ctx.stroke();
  }

  ctx.restore();
}

export function computeContentArea(page: VDTPage, doc: VDTDocument): BoundingBox {
  const { dpi, margins } = doc.config.page;

  // We can derive content area from page dimensions and margins
  // (same logic as pipeline, but we recalculate from resolved config)
  const pxPerCm = dpi / 2.54;
  const marginTop = margins.top.unit === 'cm' ? margins.top.value * pxPerCm : margins.top.value;
  const marginLeft = margins.left.unit === 'cm' ? margins.left.value * pxPerCm : margins.left.value;

  // Use the first column's bbox to infer content area bounds
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
