import type { Color, PDFFont } from 'pdf-lib';
import { mirroredChar } from 'postext';
import { needsComplexShaping } from '../complexShaping';
import { type PageCtx, type TextOutline, drawTextPx, setTrackingPx } from './primitives';

/**
 * A run of a design text or a chip flagged `rtl`: shaped right to left as
 * one run, untracked (HarfBuzz mirrors its brackets). A run with no
 * right-to-left letter (brackets or a full stop alone at a right-to-left
 * level) is painted in visual order with its mirrored characters swapped
 * (UAX #9 L4), its logical text kept for extraction: the fontkit path sets
 * such text left to right.
 */
export function drawRightToLeftRun(
  ctx: PageCtx,
  text: string,
  xPx: number,
  baselinePx: number,
  font: PDFFont,
  sizePx: number,
  color: Color,
  outline?: TextOutline,
): void {
  const tracking = ctx.trackingPx ?? 0;
  if (tracking !== 0) setTrackingPx(ctx, 0);
  try {
    // Right-to-left letters: HarfBuzz, or fontkit's own shaping when the
    // document did not load it.
    if (needsComplexShaping(text)) {
      drawTextPx(ctx, text, xPx, baselinePx, font, sizePx, color, outline, undefined, undefined, 'rtl');
      return;
    }
    const visual = Array.from(text).reverse().map(mirroredChar).join('');
    drawTextPx(ctx, visual, xPx, baselinePx, font, sizePx, color, outline, text);
  } finally {
    if (tracking !== 0) setTrackingPx(ctx, tracking);
  }
}
