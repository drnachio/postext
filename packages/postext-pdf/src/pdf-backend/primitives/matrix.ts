// Transformation matrices of a page: push and pop, quarter turns,
// mirrors, frames and points and rectangles carried through them
// (#1276: split out of primitives.ts).
import { pushGraphicsState, concatTransformationMatrix, popGraphicsState } from 'pdf-lib';
import type { PageCtx } from '../primitives.js';

/** A PDF transformation matrix `[a b c d e f]` (`x' = a·x + c·y + e`,
 *  `y' = b·x + d·y + f`). */
export type PdfMatrix = [number, number, number, number, number, number];

/** Apply `m` to a point. */
export function applyMatrix(m: PdfMatrix, x: number, y: number): { x: number; y: number } {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

/** Push a graphics state with `m` concatenated onto the CTM. Everything
 *  drawn until {@link popTransform} goes through it. */
export function pushTransform(ctx: PageCtx, m: PdfMatrix): void {
  ctx.tags?.close();
  ctx.page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...m));
}

export function popTransform(ctx: PageCtx): void {
  ctx.tags?.close();
  ctx.page.pushOperators(popGraphicsState());
}

/** The quarter-turn matrix of a turned frame (`VDTResourceRotation`, or
 *  a vertical page's flow, `VDTFlowFrame.rotation`) in the backend's
 *  points, y up: a frame whose `*Px` helpers flip y against the page
 *  height, as the page's own do. */
export function quarterTurnMatrix(
  rot: { direction: 'cw' | 'ccw'; originX: number; originY: number },
  scale: number,
  pageHeightPt: number,
): PdfMatrix {
  return rot.direction === 'ccw'
    ? [0, 1, -1, 0, rot.originX * scale + pageHeightPt, pageHeightPt - rot.originY * scale]
    : [0, -1, 1, 0, rot.originX * scale - pageHeightPt, pageHeightPt - rot.originY * scale];
}

/** The matrix of a right-to-left page's flow (`VDTMirroredFlowFrame`,
 *  `mirror.originX` px) in the backend's points: the flow turned over the
 *  sheet's vertical axis, `x` → `originX − x`. */
export function mirrorMatrix(originX: number, scale: number): PdfMatrix {
  return [-1, 0, 0, 1, originX * scale, 0];
}

/** Paint what `paint` draws turned back about the horizontal extent
 *  `[leftPx, leftPx + widthPx]` of the current frame, on a mirrored page
 *  (`ctx.mirror`): a picture or a formula lands where the mirrored layout
 *  put its box and reads unmirrored. Elsewhere it just paints. */
export function counterFlipPx(ctx: PageCtx, leftPx: number, widthPx: number, paint: () => void): void {
  if (!ctx.mirror) {
    paint();
    return;
  }
  const s = ctx.scale;
  // The transform closes the open marked content (#900): the picture or
  // formula is painted in the element (or artifact) it was routed to, and
  // so is what its painter draws after it.
  const open = ctx.tags?.current ?? null;
  pushTransform(ctx, [-1, 0, 0, 1, (2 * leftPx + widthPx) * s, 0]);
  ctx.tags?.resume(open);
  ctx.mirror = false;
  try {
    paint();
  } finally {
    ctx.mirror = true;
    popTransform(ctx);
    ctx.tags?.resume(open);
  }
}

/** `inner` then `outer`: the matrix that maps a point of `inner`'s frame
 *  through both. */
export function composeMatrix(inner: PdfMatrix, outer: PdfMatrix): PdfMatrix {
  return [
    inner[0] * outer[0] + inner[1] * outer[2],
    inner[0] * outer[1] + inner[1] * outer[3],
    inner[2] * outer[0] + inner[3] * outer[2],
    inner[2] * outer[1] + inner[3] * outer[3],
    inner[4] * outer[0] + inner[5] * outer[2] + outer[4],
    inner[4] * outer[1] + inner[5] * outer[3] + outer[5],
  ];
}

/** Enter a frame: `m` concatenated onto the CTM ({@link pushTransform}),
 *  and the rects and points computed inside it mapped onto the page
 *  through it and every frame around it (`ctx.mapRectPt`,
 *  {@link mapPointPt}). Frames nest; {@link popFrame} leaves the last. */
export function pushFrame(ctx: PageCtx, m: PdfMatrix): void {
  pushTransform(ctx, m);
  const frames = ctx.frames ?? (ctx.frames = []);
  const outer = frames[frames.length - 1];
  const composed = outer ? composeMatrix(m, outer) : m;
  frames.push(composed);
  ctx.mapRectPt = (r) => mapRectThrough(composed, r);
}

/** Leave the frame {@link pushFrame} entered last. */
export function popFrame(ctx: PageCtx): void {
  popTransform(ctx);
  const frames = ctx.frames;
  frames?.pop();
  const outer = frames?.[frames.length - 1];
  if (outer) ctx.mapRectPt = (r) => mapRectThrough(outer, r);
  else {
    delete ctx.mapRectPt;
    delete ctx.frames;
  }
}

/** A point `(x, y)` in points of the current frame, on the page. */
export function mapPointPt(ctx: PageCtx, x: number, y: number): { x: number; y: number } {
  const m = ctx.frames?.[ctx.frames.length - 1];
  return m ? applyMatrix(m, x, y) : { x, y };
}

/** The rect map of the frame around the current one (the page's for a
 *  block turned inside a vertical page's flow), or undefined on the
 *  page. */
export function outerRectMap(ctx: PageCtx): PageCtx['mapRectPt'] {
  const frames = ctx.frames;
  const outer = frames && frames.length > 1 ? frames[frames.length - 2] : undefined;
  return outer ? (r) => mapRectThrough(outer, r) : undefined;
}

/** Map a rect `[x1, y1, x2, y2]` through `m`: the box its four corners
 *  cover, min / max (a frame turned by any angle, #910, covers more than
 *  the box of two opposite corners). */
export function mapRectThrough(m: PdfMatrix, rect: [number, number, number, number]): [number, number, number, number] {
  const pts = [
    applyMatrix(m, rect[0], rect[1]),
    applyMatrix(m, rect[2], rect[1]),
    applyMatrix(m, rect[0], rect[3]),
    applyMatrix(m, rect[2], rect[3]),
  ];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
