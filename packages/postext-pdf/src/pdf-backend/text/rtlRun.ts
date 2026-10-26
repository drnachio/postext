import type { Color, PDFFont } from 'pdf-lib';
import { mirroredChar } from 'postext';
import { joinsLetters, needsComplexShaping } from '../complexShaping.js';
import { type PageCtx, type TextOutline, drawTextPx, setTrackingPx } from './primitives.js';

/**
 * A run of a design text or a chip flagged `rtl`: shaped right to left as
 * one run (HarfBuzz mirrors its brackets). A run that holds a letter of a
 * joining script is set untracked: Arabic letters are never spaced apart,
 * and the measurer left such a text untracked. Any other run keeps the
 * tracking it was measured with, a Hebrew one included (#703; up to
 * postext 1.27 every right-to-left run lost it). A run with no
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
  const tracking = joinsLetters(text) ? ctx.trackingPx ?? 0 : 0;
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
