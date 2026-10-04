/**
 * Painting one right-to-left run of a design text or a chip on the canvas
 * (`VDTDesignTextRun.rtl`, `VDTChipRun.rtl`).
 *
 * The page paints with `direction = 'ltr'` (see `renderPageToCanvas`), so a
 * run of Arabic letters alone already shapes right to left, but its
 * neutral characters (brackets, a full stop at its end) would be ordered
 * and mirrored as in a left-to-right paragraph. A run flagged `rtl` is
 * painted with the context set right to left and aligned on its left edge,
 * so it lands in the box the layout measured, and with no tracking: Arabic
 * letters are never spaced apart. Inside a mirrored flow the frame's
 * `fillText` interception reads the same direction and alignment, so the
 * run is turned back about the same box.
 */

/** Run `paint` with the context set to paint a right-to-left run from its
 *  left edge when `rtl`; just run it otherwise. */
export function paintRunInDirection(ctx: CanvasRenderingContext2D, rtl: boolean | undefined, paint: () => void): void {
  if (!rtl || !('direction' in ctx)) {
    paint();
    return;
  }
  const direction = ctx.direction;
  const align = ctx.textAlign;
  const spacing = 'letterSpacing' in ctx ? ctx.letterSpacing : undefined;
  ctx.direction = 'rtl';
  ctx.textAlign = 'left';
  if (spacing !== undefined && spacing !== '0px') ctx.letterSpacing = '0px';
  try {
    paint();
  } finally {
    ctx.direction = direction;
    ctx.textAlign = align;
    if (spacing !== undefined && spacing !== '0px') ctx.letterSpacing = spacing;
  }
}

/** The indices of `n` runs in paint order: `order` when it lists them all,
 *  else 0 … n − 1. */
export function runPaintOrder(order: readonly number[] | undefined, n: number): readonly number[] {
  if (order && order.length === n) return order;
  return Array.from({ length: n }, (_, i) => i);
}
