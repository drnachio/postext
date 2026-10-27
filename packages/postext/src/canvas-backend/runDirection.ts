import { joiningScriptIn } from '../measure/rtl/joining.js';
import { letterSpacingOf, setLetterSpacing } from './contextState.js';

/**
 * Painting one right-to-left run of a design text or a chip on the canvas
 * (`VDTDesignTextRun.rtl`, `VDTChipRun.rtl`).
 *
 * The page paints with `direction = 'ltr'` (see `renderPageToCanvas`), so a
 * run of Arabic letters alone already shapes right to left, but its
 * neutral characters (brackets, a full stop at its end) would be ordered
 * and mirrored as in a left-to-right paragraph. A run flagged `rtl` is
 * painted with the context set right to left and aligned on its left edge,
 * so it lands in the box the layout measured. A run that holds a letter of
 * a joining script (`text`) is painted with no tracking: Arabic letters
 * are never spaced apart, and the measurer left such a text untracked
 * (`measure/rtl/joining.ts`). A Hebrew run keeps the tracking it was measured
 * with (#703; up to postext 1.27 every right-to-left run lost it). Inside
 * a mirrored flow the frame's `fillText` interception reads the same
 * direction and alignment, so the run is turned back about the same box.
 */

/** Run `paint` with the context set to paint a right-to-left run from its
 *  left edge when `rtl`, its tracking lifted when `text`, the run's, holds
 *  a letter of a joining script; just run it otherwise. */
export function paintRunInDirection(ctx: CanvasRenderingContext2D, rtl: boolean | undefined, paint: () => void, text: string): void {
  if (!rtl || !('direction' in ctx)) {
    paint();
    return;
  }
  const direction = ctx.direction;
  const align = ctx.textAlign;
  // The tracking to lift and put back: the backend's own record of it
  // (`contextState.ts`), since the context does not tell inside a saved
  // state.
  const spacing = joiningScriptIn(text) ? letterSpacingOf(ctx) : 0;
  ctx.direction = 'rtl';
  ctx.textAlign = 'left';
  if (spacing !== 0) setLetterSpacing(ctx, 0);
  try {
    paint();
  } finally {
    ctx.direction = direction;
    ctx.textAlign = align;
    if (spacing !== 0) setLetterSpacing(ctx, spacing);
  }
}

/** The indices of `n` runs in paint order: `order` when it lists them all,
 *  else 0 … n − 1. */
export function runPaintOrder(order: readonly number[] | undefined, n: number): readonly number[] {
  if (order && order.length === n) return order;
  return Array.from({ length: n }, (_, i) => i);
}
