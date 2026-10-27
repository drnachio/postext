// Swatches, filled rectangles, lines, clips and rounded outlines, and
// chip boxes (#1276: split out of primitives.ts).
import { type Color, BlendMode, pushGraphicsState, setFillingColor, rectangle, fill, popGraphicsState, setStrokingColor, setLineWidth, moveTo, lineTo, stroke, clip, endPath, PDFOperator, appendBezierCurve, closePath, setDashPattern, setLineCap, LineCapStyle } from 'pdf-lib';
import type { SwatchGeometry, RoundedOutline, VDTChip } from 'postext';
import type { PageCtx } from '../primitives.js';
import { colorFromHex, alphaOf, opt, alphaStateOp } from './color.js';

/** Inline colour swatch (`:swatch{…}`): a square of `sidePx` on the
 *  baseline, filled with `fill` (hex) when resolved and outlined in `ink`. */
export function drawSwatchPx(
  ctx: PageCtx,
  xPx: number,
  baselinePx: number,
  sidePx: number,
  fill: string | undefined,
  ink: Color,
): void {
  const { scale, pageHeightPt } = ctx;
  const strokePx = Math.max(0.5, sidePx * 0.06);
  const x = (xPx + strokePx / 2) * scale;
  const y = pageHeightPt - (baselinePx - strokePx / 2) * scale;
  const side = (sidePx - strokePx) * scale;
  const fillColor = fill ? colorFromHex(fill, ctx.colorSpace) : undefined;
  const fillAlpha = alphaOf(fillColor);
  const inkAlpha = alphaOf(ink);
  ctx.page.drawRectangle({
    x,
    y,
    width: side,
    height: side,
    ...(fillColor ? { color: fillColor } : {}),
    borderColor: ink,
    borderWidth: Math.max(0.01, strokePx * scale),
    ...(fillColor && fillAlpha < 1 ? { opacity: fillAlpha } : {}),
    ...(inkAlpha < 1 ? { borderOpacity: inkAlpha } : {}),
  });
}

/** A swatch with a shape of its own (#1104, see `swatchGeometry`): the
 *  fill, then the outline stroked inside the square's edge, both with
 *  rounded corners. */
export function drawShapedSwatchPx(ctx: PageCtx, g: SwatchGeometry, fill: string | undefined, ink: Color): void {
  const r = g.radius;
  if (fill) fillOutlinePx(ctx, { x: g.x, y: g.y, width: g.side, height: g.side, radii: [r, r, r, r] }, colorFromHex(fill, ctx.colorSpace));
  if (g.stroke > 0) {
    const half = g.stroke / 2;
    const ri = Math.max(0, r - half);
    strokeOutlinePx(ctx, { x: g.x + half, y: g.y + half, width: g.side - g.stroke, height: g.side - g.stroke, radii: [ri, ri, ri, ri] }, ink, g.stroke);
  }
}

export function fillRectPx(
  ctx: PageCtx,
  xPx: number,
  yPx: number,
  wPx: number,
  hPx: number,
  color: Color,
  blendMode?: BlendMode,
): void {
  const { scale, pageHeightPt } = ctx;
  const x = xPx * scale;
  const y = pageHeightPt - (yPx + hPx) * scale;
  const width = wPx * scale;
  const height = hPx * scale;
  const alpha = alphaOf(color);
  if (alpha < 1 && !blendMode) {
    ctx.page.pushOperators(
      pushGraphicsState(),
      ...opt(alphaStateOp(ctx, alpha)),
      setFillingColor(color),
      rectangle(x, y, width, height),
      fill(),
      popGraphicsState(),
    );
    return;
  }
  ctx.page.drawRectangle({
    x,
    y,
    width,
    height,
    color,
    ...(blendMode ? { blendMode } : {}),
    ...(alpha < 1 ? { opacity: alpha } : {}),
  });
}

/** Fill several rectangles (px) in one colour with a single fill operation:
 *  the viewer rasterises them as one shape, so rectangles that abut or
 *  overlap leave no seam between them. */
export function fillRectsPx(
  ctx: PageCtx,
  rects: readonly { x: number; y: number; width: number; height: number }[],
  color: Color,
): void {
  if (rects.length === 0) return;
  const { scale, pageHeightPt } = ctx;
  const alpha = alphaOf(color);
  ctx.page.pushOperators(
    pushGraphicsState(),
    ...(alpha < 1 ? opt(alphaStateOp(ctx, alpha)) : []),
    setFillingColor(color),
    ...rects.map((r) => rectangle(r.x * scale, pageHeightPt - (r.y + r.height) * scale, r.width * scale, r.height * scale)),
    fill(),
    popGraphicsState(),
  );
}

export function drawLinePx(
  ctx: PageCtx,
  x1Px: number,
  y1Px: number,
  x2Px: number,
  y2Px: number,
  color: Color,
  thicknessPx: number,
): void {
  const { scale, pageHeightPt } = ctx;
  const alpha = alphaOf(color);
  if (alpha < 1) {
    ctx.page.pushOperators(
      pushGraphicsState(),
      ...opt(alphaStateOp(ctx, 1, alpha)),
      setStrokingColor(color),
      setLineWidth(Math.max(0.01, thicknessPx * scale)),
      moveTo(x1Px * scale, pageHeightPt - y1Px * scale),
      lineTo(x2Px * scale, pageHeightPt - y2Px * scale),
      stroke(),
      popGraphicsState(),
    );
    return;
  }
  ctx.page.drawLine({
    start: { x: x1Px * scale, y: pageHeightPt - y1Px * scale },
    end: { x: x2Px * scale, y: pageHeightPt - y2Px * scale },
    color,
    thickness: Math.max(0.01, thicknessPx * scale),
  });
}

export function pushClipRect(
  ctx: PageCtx,
  xPx: number,
  yPx: number,
  wPx: number,
  hPx: number,
): void {
  const { scale, pageHeightPt } = ctx;
  const x = xPx * scale;
  const y = pageHeightPt - (yPx + hPx) * scale;
  const width = wPx * scale;
  const height = hPx * scale;
  // Marked content must nest inside the graphics state it was opened in.
  ctx.tags?.close();
  ctx.page.pushOperators(
    pushGraphicsState(),
    rectangle(x, y, width, height),
    clip(),
    endPath(),
  );
}

export function popClip(ctx: PageCtx): void {
  ctx.tags?.close();
  ctx.page.pushOperators(popGraphicsState());
}

/** Bézier handle length of a quarter circle, as a fraction of its radius. */
const KAPPA = 0.5522847498;

/** Path operators tracing a rounded outline given in px (top-down), in the
 *  points of the current frame. Corners of radius 0 stay square. */
function roundedOutlineOps(ctx: PageCtx, o: RoundedOutline): PDFOperator[] {
  const { scale, pageHeightPt } = ctx;
  const X = (px: number) => px * scale;
  const Y = (py: number) => pageHeightPt - py * scale;
  const { x, y, width: w, height: h } = o;
  const [tl, tr, br, bl] = o.radii;
  const k = KAPPA;
  const ops: PDFOperator[] = [moveTo(X(x + tl), Y(y)), lineTo(X(x + w - tr), Y(y))];
  if (tr > 0) ops.push(appendBezierCurve(X(x + w - tr + tr * k), Y(y), X(x + w), Y(y + tr - tr * k), X(x + w), Y(y + tr)));
  ops.push(lineTo(X(x + w), Y(y + h - br)));
  if (br > 0) ops.push(appendBezierCurve(X(x + w), Y(y + h - br + br * k), X(x + w - br + br * k), Y(y + h), X(x + w - br), Y(y + h)));
  ops.push(lineTo(X(x + bl), Y(y + h)));
  if (bl > 0) ops.push(appendBezierCurve(X(x + bl - bl * k), Y(y + h), X(x), Y(y + h - bl + bl * k), X(x), Y(y + h - bl)));
  ops.push(lineTo(X(x), Y(y + tl)));
  if (tl > 0) ops.push(appendBezierCurve(X(x), Y(y + tl - tl * k), X(x + tl - tl * k), Y(y), X(x + tl), Y(y)));
  ops.push(closePath());
  return ops;
}

/** Push a graphics state clipped to a rounded outline (px); undo with
 *  {@link popClip}. */
export function pushClipOutline(ctx: PageCtx, o: RoundedOutline): void {
  ctx.tags?.close();
  ctx.page.pushOperators(pushGraphicsState(), ...roundedOutlineOps(ctx, o), clip(), endPath());
}

/** Fill a rounded outline (px). */
export function fillOutlinePx(ctx: PageCtx, o: RoundedOutline, color: Color): void {
  ctx.page.pushOperators(
    pushGraphicsState(),
    ...opt(alphaStateOp(ctx, alphaOf(color))),
    setFillingColor(color),
    ...roundedOutlineOps(ctx, o),
    fill(),
    popGraphicsState(),
  );
}

/** The box of an inline chip (`:chip[…]`) whose segment starts at `xPx` on
 *  a line of baseline `baselinePx`: the fill, then the outline stroked
 *  inside the box edge (the text runs are painted by the caller). */
export function drawChipBoxPx(ctx: PageCtx, chip: VDTChip, xPx: number, baselinePx: number): void {
  const x = xPx + chip.marginLeft;
  const y = baselinePx - chip.ascent;
  const h = chip.ascent + chip.descent;
  const r = chip.borderRadius;
  if (chip.background) {
    fillOutlinePx(ctx, { x, y, width: chip.boxWidth, height: h, radii: [r, r, r, r] }, colorFromHex(chip.background, ctx.colorSpace));
  }
  if (chip.underline && chip.borderColor && chip.borderWidth > 0) {
    // A blank to write on (#1227): a line under the box only.
    const { scale, pageHeightPt } = ctx;
    const w = chip.borderWidth;
    const ly = pageHeightPt - (y + h - w / 2) * scale;
    const color = colorFromHex(chip.borderColor, ctx.colorSpace);
    const dash = chip.underline === 'dotted' ? [0.01 * scale, w * 2.2 * scale] : chip.underline === 'dashed' ? [w * 3 * scale, w * 2 * scale] : undefined;
    ctx.page.pushOperators(
      pushGraphicsState(),
      ...opt(alphaStateOp(ctx, 1, alphaOf(color))),
      setStrokingColor(color),
      setLineWidth(Math.max(0.01, w * scale)),
      ...(dash ? [setDashPattern(dash, 0)] : []),
      ...(chip.underline === 'dotted' ? [setLineCap(LineCapStyle.Round)] : []),
      moveTo(x * scale, ly),
      lineTo((x + chip.boxWidth) * scale, ly),
      stroke(),
      popGraphicsState(),
    );
  } else if (chip.borderColor && chip.borderWidth > 0) {
    const half = chip.borderWidth / 2;
    const ri = Math.max(0, r - half);
    strokeOutlinePx(
      ctx,
      { x: x + half, y: y + half, width: chip.boxWidth - chip.borderWidth, height: h - chip.borderWidth, radii: [ri, ri, ri, ri] },
      colorFromHex(chip.borderColor, ctx.colorSpace),
      chip.borderWidth,
    );
  }
}

/** Stroke a rounded outline (px) `thicknessPx` wide, centred on it. */
export function strokeOutlinePx(ctx: PageCtx, o: RoundedOutline, color: Color, thicknessPx: number): void {
  ctx.page.pushOperators(
    pushGraphicsState(),
    ...opt(alphaStateOp(ctx, 1, alphaOf(color))),
    setStrokingColor(color),
    setLineWidth(Math.max(0.01, thicknessPx * ctx.scale)),
    ...roundedOutlineOps(ctx, o),
    stroke(),
    popGraphicsState(),
  );
}
