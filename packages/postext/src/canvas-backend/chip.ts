import type { VDTChip, VDTChipRun } from '../vdt.js';
import { joiningScriptIn } from '../measure/rtl/joining.js';
import { paintRunInDirection, runPaintOrder } from './runDirection.js';
import { letterSpacingOf, restoreContext, saveContext, setLetterSpacing } from './contextState.js';
import { fillContextText } from './contextText.js';
import { fillTextDots } from './textDots.js';
import { paintChipReadings } from './annotations.js';

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
/** The dash pattern of a chip's underline (#1227): dots one stroke wide
 *  with round caps, two strokes apart; dashes three strokes long. */
export function chipUnderlineDash(kind: 'solid' | 'dotted' | 'dashed', width: number): number[] | undefined {
  if (kind === 'dotted') return [0.01, width * 2.2];
  if (kind === 'dashed') return [width * 3, width * 2];
  return undefined;
}

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
  saveContext(ctx);
  if (chip.background) {
    roundedRectPath(ctx, bx, top, chip.boxWidth, h, chip.borderRadius);
    ctx.fillStyle = chip.background;
    ctx.fill();
  }
  if (chip.underline && chip.borderColor && chip.borderWidth > 0) {
    // A blank to write on (#1227): a line under the box only.
    const y = top + h - chip.borderWidth / 2;
    ctx.beginPath();
    ctx.moveTo(bx, y);
    ctx.lineTo(bx + chip.boxWidth, y);
    ctx.strokeStyle = chip.borderColor;
    ctx.lineWidth = chip.borderWidth;
    const dash = chipUnderlineDash(chip.underline, chip.borderWidth);
    if (dash) {
      ctx.setLineDash(dash);
      if (chip.underline === 'dotted') ctx.lineCap = 'round';
    }
    ctx.stroke();
  } else if (chip.borderColor && chip.borderWidth > 0) {
    const half = chip.borderWidth / 2;
    roundedRectPath(ctx, bx + half, top + half, chip.boxWidth - chip.borderWidth, h - chip.borderWidth, Math.max(0, chip.borderRadius - half));
    ctx.strokeStyle = chip.borderColor;
    ctx.lineWidth = chip.borderWidth;
    ctx.stroke();
  }
  // The readings of its ruby words, over a blank too (#1244).
  if (chip.readings && chip.runs[0]) paintChipReadings(ctx, chip.readings, bx, baseline, inkFor(chip.runs[0]));
  // A blank's answer is laid out, never painted (#1227).
  if (chip.blank) {
    restoreContext(ctx);
    return;
  }
  ctx.textBaseline = 'alphabetic';
  let tx = bx + chip.borderWidth + chip.paddingX;
  // The block's tracking, which a run of a joining script (measured
  // untracked, `measure/rtl/joining.ts`) is painted without. It is asked of
  // the backend, not of the context: read here, inside the state just
  // saved, `ctx.letterSpacing` is `""` (see `contextState.ts`).
  const spacing = letterSpacingOf(ctx);
  // The runs in the chip's paint order, each in its own direction.
  for (const i of runPaintOrder(chip.order, chip.runs.length)) {
    const run = chip.runs[i]!;
    ctx.font = run.fontString;
    ctx.fillStyle = chip.color ?? inkFor(run);
    const untracked = spacing !== 0 && joiningScriptIn(run.text);
    if (untracked) setLetterSpacing(ctx, 0);
    const runX = tx;
    const runY = baseline + (run.baselineShift ?? 0);
    // Letters to trace (#1017): dots, else the glyphs filled.
    paintRunInDirection(ctx, run.rtl, () => {
      if (!chip.dotted || !fillTextDots(ctx, run.text, runX, runY, chip.dotted)) fillContextText(ctx, run.text, runX, runY);
    }, run.text);
    if (untracked) setLetterSpacing(ctx, spacing);
    tx += run.width;
  }
  restoreContext(ctx);
}
