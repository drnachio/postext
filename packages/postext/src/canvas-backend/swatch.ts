/**
 * Inline colour swatch (`:swatch{color="…"}`): a square the size of a
 * capital sitting on the baseline, filled with the swatch colour and
 * outlined in the text colour so a pale fill still reads against the paper.
 * Shared by the body-text and resource-block painters. A swatch segment
 * may carry an inline symbol instead (`:icon[alt]{…}`, #1058), painted by
 * {@link paintInlineIcon}.
 */

import type { VDTInlineIcon, VDTSwatch } from '../vdt.js';
import { hasSwatchShape, swatchGeometry, type SwatchGeometry } from '../paint/swatchShape.js';
import { iconLineDash, inlineIconBox } from '../measure/inlineIcon.js';
import { drawResourceImage } from './renderResourceBlock.js';
import { restoreContext, saveContext } from './contextState.js';
import { fillContextText } from './contextText.js';

export function paintSwatch(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseline: number,
  side: number,
  fill: string | undefined,
  ink: string,
): void {
  const y = baseline - side;
  saveContext(ctx);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, side, side);
  }
  const stroke = Math.max(0.5, side * 0.06);
  ctx.strokeStyle = ink;
  ctx.lineWidth = stroke;
  ctx.strokeRect(x + stroke / 2, y + stroke / 2, side - stroke, side - stroke);
  restoreContext(ctx);
}

/**
 * An inline symbol (`:icon[alt]{…}`, #1058) on the segment at `x`: a
 * resource's picture fitted to its box (tinted when it has a colour; an
 * empty outline while the resource is unknown or not decoded), a glyph set
 * in its own face on the baseline, or a line sample stroked across the box
 * at half its height. `ink` is the text's colour. A picture and a glyph go
 * through `drawImage` / `fillText`, which a mirrored page's flow turns back
 * (`mirrorFrame.ts`).
 */
export function paintInlineIcon(ctx: CanvasRenderingContext2D, icon: VDTInlineIcon, x: number, baseline: number, ink: string): void {
  const box = inlineIconBox(icon, x, baseline);
  saveContext(ctx);
  if (icon.kind === 'glyph' && icon.glyph && icon.fontString) {
    ctx.font = icon.fontString;
    ctx.fillStyle = icon.color ?? ink;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    fillContextText(ctx, icon.glyph, box.x, box.baseline);
  } else if (icon.kind === 'line') {
    ctx.strokeStyle = icon.color ?? ink;
    ctx.lineWidth = icon.strokePx ?? 1;
    ctx.lineCap = icon.line === 'dotted' ? 'round' : 'butt';
    ctx.setLineDash(iconLineDash(icon) ?? []);
    ctx.beginPath();
    ctx.moveTo(box.x, box.strokeY);
    ctx.lineTo(box.x + box.width, box.strokeY);
    ctx.stroke();
  } else if (!icon.fileId || !drawResourceImage(ctx, icon.fileId, box.x, box.y, box.width, box.height, { inkHex: null, ...(icon.svg !== undefined ? { svg: icon.svg } : {}), ...(icon.color ? { tint: icon.color } : {}) }, icon.resourceId)) {
    const stroke = Math.max(0.5, box.height * 0.06);
    ctx.strokeStyle = ink;
    ctx.lineWidth = stroke;
    ctx.strokeRect(box.x + stroke / 2, box.y + stroke / 2, box.width - stroke, box.height - stroke);
  }
  restoreContext(ctx);
}

/** A `'swatch'` segment of `width` at `x`: its symbol when it carries one
 *  (#1058), else the colour swatch, with its own shape when it has one
 *  (#1104). `rtl`: the segment is set right to left (the gap after the
 *  square is on its left). */
export function paintSwatchSegment(
  ctx: CanvasRenderingContext2D,
  swatch: VDTSwatch | undefined,
  x: number,
  baseline: number,
  width: number,
  ink: string,
  rtl = false,
): void {
  if (swatch?.icon) paintInlineIcon(ctx, swatch.icon, x, baseline, ink);
  else if (swatch && hasSwatchShape(swatch)) paintShapedSwatch(ctx, swatchGeometry(swatch, x, baseline, width, rtl), swatch.color, swatch.borderColor ?? ink);
  else paintSwatch(ctx, x, baseline, width, swatch?.color, ink);
}

/** A swatch with a shape of its own (#1104): the fill, then the outline
 *  stroked inside the square's edge, both with rounded corners. */
function paintShapedSwatch(ctx: CanvasRenderingContext2D, g: SwatchGeometry, fill: string | undefined, ink: string): void {
  saveContext(ctx);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    roundedSquare(ctx, g.x, g.y, g.side, g.radius);
    ctx.fill();
  }
  if (g.stroke > 0) {
    const half = g.stroke / 2;
    ctx.strokeStyle = ink;
    ctx.lineWidth = g.stroke;
    ctx.beginPath();
    roundedSquare(ctx, g.x + half, g.y + half, g.side - g.stroke, Math.max(0, g.radius - half));
    ctx.stroke();
  }
  restoreContext(ctx);
}

function roundedSquare(ctx: CanvasRenderingContext2D, x: number, y: number, side: number, r: number): void {
  if (r <= 0) {
    ctx.rect(x, y, side, side);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + side, y, x + side, y + side, r);
  ctx.arcTo(x + side, y + side, x, y + side, r);
  ctx.arcTo(x, y + side, x, y, r);
  ctx.arcTo(x, y, x + side, y, r);
  ctx.closePath();
}
