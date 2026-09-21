/**
 * Inline colour swatch (`:swatch{color="…"}`): a square the size of a
 * capital sitting on the baseline, filled with the swatch colour and
 * outlined in the text colour so a pale fill still reads against the paper.
 * Shared by the body-text and resource-block painters.
 */
export function paintSwatch(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseline: number,
  side: number,
  fill: string | undefined,
  ink: string,
): void {
  const y = baseline - side;
  ctx.save();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, side, side);
  }
  const stroke = Math.max(0.5, side * 0.06);
  ctx.strokeStyle = ink;
  ctx.lineWidth = stroke;
  ctx.strokeRect(x + stroke / 2, y + stroke / 2, side - stroke, side - stroke);
  ctx.restore();
}
