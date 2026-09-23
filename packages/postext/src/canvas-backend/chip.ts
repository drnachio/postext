import type { VDTChip, VDTChipRun } from '../vdt';

/** Trace a rounded rect (radius already clamped to half the box). */
function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  if (r <= 0) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/**
 * Inline chip (`:chip[…]`): the box — fill, then the outline stroked inside
 * its edge — and the text runs on the line's baseline. `x` is the segment's
 * left edge (the box starts after its gap margin); `inkFor` gives a run's
 * colour when the chip style sets none. Shared by the body-text and
 * resource-block painters.
 */
export function paintChip(
  ctx: CanvasRenderingContext2D,
  chip: VDTChip,
  x: number,
  baseline: number,
  inkFor: (run: VDTChipRun) => string,
): void {
  const bx = x + chip.marginLeft;
  const top = baseline - chip.ascent;
  const h = chip.ascent + chip.descent;
  ctx.save();
  if (chip.background) {
    roundedRectPath(ctx, bx, top, chip.boxWidth, h, chip.borderRadius);
    ctx.fillStyle = chip.background;
    ctx.fill();
  }
  if (chip.borderColor && chip.borderWidth > 0) {
    const half = chip.borderWidth / 2;
    roundedRectPath(ctx, bx + half, top + half, chip.boxWidth - chip.borderWidth, h - chip.borderWidth, Math.max(0, chip.borderRadius - half));
    ctx.strokeStyle = chip.borderColor;
    ctx.lineWidth = chip.borderWidth;
    ctx.stroke();
  }
  ctx.textBaseline = 'alphabetic';
  let tx = bx + chip.borderWidth + chip.paddingX;
  for (const run of chip.runs) {
    ctx.font = run.fontString;
    ctx.fillStyle = chip.color ?? inkFor(run);
    ctx.fillText(run.text, tx, baseline + (run.baselineShift ?? 0));
    tx += run.width;
  }
  ctx.restore();
}
