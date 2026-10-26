import type { VDTTextDots } from '../vdt.js';
import { textDots } from '../paint/textDots.js';
import { counterFlipBox } from './mirrorFrame.js';
import { languageOf, letterSpacingOf, restoreContext, saveContext } from './contextState.js';

/**
 * Paint `text` at `(x, y)` as dots to trace (#1017), as `fillText` would
 * place it: the context's font, fill colour, direction, alignment,
 * tracking and language. On a mirrored page the dots are turned back about
 * the run's box, as its glyphs would be. Returns `false`, painting
 * nothing, where the dots cannot be drawn (no canvas to read the letters
 * from): the caller fills the text.
 */
export function fillTextDots(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, dots: VDTTextDots): boolean {
  const rtl = 'direction' in ctx && ctx.direction === 'rtl';
  const found = textDots({ text, font: ctx.font, spacingPx: dots.spacingPx, letterSpacingPx: letterSpacingOf(ctx), rtl, lang: languageOf(ctx) });
  if (!found) return false;
  const { points, width } = found;
  const align = ctx.textAlign;
  const fromRight = align === 'right' || (align === 'start' && rtl) || (align === 'end' && !rtl);
  const left = align === 'center' ? x - width / 2 : fromRight ? x - width : x;
  const r = dots.sizePx / 2;
  counterFlipBox(ctx, left, width, () => {
    saveContext(ctx);
    ctx.beginPath();
    for (let i = 0; i < points.length; i += 2) {
      const px = left + points[i]!;
      const py = y + points[i + 1]!;
      ctx.moveTo(px + r, py);
      ctx.arc(px, py, r, 0, 2 * Math.PI);
    }
    ctx.fill();
    restoreContext(ctx);
  });
  return true;
}
