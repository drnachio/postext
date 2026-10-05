/**
 * Chinese annotations in the PDF (#193, #194, #195): the marks the layout
 * set on a line (`VDTLine.marks`) drawn as vector artifacts (`Artifact
 * /Layout`, so copied text stays clean), a ruby base's reading and a
 * warichu note's rows as text. In a tagged render the reading goes in an
 * `RT` element beside its base's `RB` under one `Ruby`, and a note's rows
 * in the `WT` of a `Warichu`, in reading order (upper row first). Geometry
 * is the layout's, in the flow frame of the line: on a vertical page it is
 * drawn inside the page's flow transform, as the text is.
 */

import {
  appendBezierCurve,
  closePath,
  fill,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  setFillingColor,
  setLineWidth,
  setStrokingColor,
  stroke,
  type Color,
  type PDFFont,
  type PDFOperator,
} from 'pdf-lib';
import type { VDTAnnotationRun, VDTLine, VDTLineMark, VDTLineSegment, VDTRuby, VDTWarichu } from 'postext';
import { parseFontString } from '../fontString';
import type { FontCache } from '../fontCache';
import { type PageCtx, alphaOf, alphaStateOp, colorFromHex, drawTextPx } from './primitives';
import { tagArtifact, tagContent, type StructElem } from './tagging';

/** A sesame dot (﹅): a lens `size` long and 0.3 of it wide,
 *  leaning a third of a right angle (as the canvas draws it). Two
 *  quadratic curves, each `[start, control, end]`. On a vertical page
 *  (`vertical`) the lens turns a quarter turn back against the flow's, so
 *  it stands on the sheet as in horizontal text: U+FE45 has no vertical
 *  form. */
function sesameCurves(size: number, vertical: boolean): { x: number; y: number }[][] {
  const l = size / 2;
  const w = size * 0.6;
  const a = -Math.PI / 6 - (vertical ? Math.PI / 2 : 0);
  const rot = (x: number, y: number) => ({ x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) });
  return [
    [rot(0, -l), rot(w, 0), rot(0, l)],
    [rot(0, l), rot(-w, 0), rot(0, -l)],
  ];
}

/** A circle as four cubic curves around `(cx, cy)` (pt). */
function circleOps(cx: number, cy: number, r: number): PDFOperator[] {
  const k = 0.5522847498 * r;
  return [
    moveTo(cx + r, cy),
    appendBezierCurve(cx + r, cy + k, cx + k, cy + r, cx, cy + r),
    appendBezierCurve(cx - k, cy + r, cx - r, cy + k, cx - r, cy),
    appendBezierCurve(cx - r, cy - k, cx - k, cy - r, cx, cy - r),
    appendBezierCurve(cx + k, cy - r, cx + r, cy - k, cx + r, cy),
    closePath(),
  ];
}

/** The operators of one mark (pt, the page's frame), filled or stroked. */
function markOps(ctx: PageCtx, m: VDTLineMark, xPx: number, yPx: number): { ops: PDFOperator[]; filled: boolean } {
  const { scale, pageHeightPt } = ctx;
  const X = (px: number) => px * scale;
  const Y = (px: number) => pageHeightPt - px * scale;
  const cx = xPx + m.x;
  const cy = yPx + m.y;
  switch (m.kind) {
    case 'dot':
    case 'circle': {
      const r = (m.size ?? 0) / 2;
      return { ops: circleOps(X(cx), Y(cy), (m.open ? Math.max(0, r - m.thickness / 2) : r) * scale), filled: !m.open };
    }
    case 'sesame': {
      const [a, b] = sesameCurves(m.size ?? 0, !!ctx.vertical);
      const P = (q: { x: number; y: number }) => ({ x: X(cx + q.x), y: Y(cy + q.y) });
      const cubic = (p0: { x: number; y: number }, q: { x: number; y: number }, p2: { x: number; y: number }): PDFOperator => {
        const c1 = { x: p0.x + (2 / 3) * (q.x - p0.x), y: p0.y + (2 / 3) * (q.y - p0.y) };
        const c2 = { x: p2.x + (2 / 3) * (q.x - p2.x), y: p2.y + (2 / 3) * (q.y - p2.y) };
        return appendBezierCurve(c1.x, c1.y, c2.x, c2.y, p2.x, p2.y);
      };
      const a0 = P(a![0]!);
      return {
        ops: [moveTo(a0.x, a0.y), cubic(a0, P(a![1]!), P(a![2]!)), cubic(P(b![0]!), P(b![1]!), P(b![2]!)), closePath()],
        filled: !m.open,
      };
    }
    case 'line':
      return { ops: [moveTo(X(cx), Y(cy)), lineTo(X(cx + (m.length ?? 0)), Y(cy))], filled: false };
    case 'double': {
      const half = (m.gap ?? 0) / 2;
      const end = cx + (m.length ?? 0);
      return {
        ops: [moveTo(X(cx), Y(cy - half)), lineTo(X(end), Y(cy - half)), moveTo(X(cx), Y(cy + half)), lineTo(X(end), Y(cy + half))],
        filled: false,
      };
    }
    case 'dotted': {
      // The dots of the line (as the canvas sets them, `dottedCentres`).
      const size = m.size ?? 0;
      const span = Math.max(0, (m.length ?? 0) - size);
      const gap = m.gap ?? 0;
      const count = gap > 0 ? Math.round(span / gap) : 0;
      const ops: PDFOperator[] = [];
      for (let i = 0; i <= count; i++) {
        const x = cx + size / 2 + (count > 0 ? (span * i) / count : span / 2);
        ops.push(...circleOps(X(x), Y(cy), (size / 2) * scale));
      }
      return { ops, filled: true };
    }
    case 'wavy': {
      const length = m.length ?? 0;
      const wl = m.wavelength ?? 4;
      const amp = (m.amplitude ?? 1) / 2;
      const steps = Math.max(2, Math.ceil((length / wl) * 12));
      const ops: PDFOperator[] = [];
      for (let i = 0; i <= steps; i++) {
        const s = (length * i) / steps;
        const x = X(cx + s);
        const y = Y(cy + amp * Math.sin((2 * Math.PI * s) / wl));
        ops.push(i === 0 ? moveTo(x, y) : lineTo(x, y));
      }
      return { ops, filled: false };
    }
  }
}

/** Draw the marks of a line (`VDTLine.marks`) as artifacts, in `ink`
 *  unless a mark has its own colour. */
export function paintLineMarks(ctx: PageCtx, line: VDTLine, ink: Color): void {
  const marks = line.marks;
  if (!marks || marks.length === 0) return;
  tagArtifact(ctx, { type: 'Layout' });
  for (const m of marks) {
    const color = m.color ? colorFromHex(m.color, ctx.colorSpace) : ink;
    const { ops, filled } = markOps(ctx, m, line.bbox.x, line.baseline);
    const alpha = alphaOf(color);
    const gs = alpha < 1 ? alphaStateOp(ctx, filled ? alpha : 1, filled ? 1 : alpha) : null;
    ctx.page.pushOperators(
      pushGraphicsState(),
      ...(gs ? [gs] : []),
      filled ? setFillingColor(color) : setStrokingColor(color),
      ...(filled ? [] : [setLineWidth(Math.max(0.01, m.thickness * ctx.scale))]),
      ...ops,
      filled ? fill() : stroke(),
      popGraphicsState(),
    );
  }
}

/** Paint text runs from `x` on `baseline` (px) in `colorHex`, each in its
 *  run's face (the block's when the cache has none). On a vertical page
 *  they go down the column through the vertical painter, a zhuyin tone
 *  mark standing upright in its cell (`VDTAnnotationRun.upright`). */
function paintRuns(
  ctx: PageCtx,
  runs: readonly VDTAnnotationRun[],
  x: number,
  baseline: number,
  colorHex: string,
  fontCache: FontCache,
  fallback: PDFFont,
): void {
  for (const run of runs) {
    const font = fontCache.get(run.fontString) ?? fallback;
    const size = parseFontString(run.fontString)?.sizePx ?? 0;
    if (!(size > 0)) continue;
    drawTextPx(ctx, run.text, x + run.dx, baseline + run.dy, font, size, colorFromHex(run.color ?? colorHex, ctx.colorSpace), undefined, undefined, run.upright && ctx.vertical ? 'upright' : undefined);
  }
}

/**
 * Paint a ruby base's reading from the base's `x`. In a tagged render,
 * `ruby` is the base's `Ruby` element: the reading goes in its `RT`.
 */
export function paintRuby(
  ctx: PageCtx,
  ruby: VDTRuby,
  x: number,
  baseline: number,
  textHex: string,
  fontCache: FontCache,
  fallback: PDFFont,
  elem: StructElem | undefined,
): void {
  if (elem) tagContent(ctx, elem.child('RT'));
  else tagArtifact(ctx, { type: 'Layout' });
  paintRuns(ctx, ruby.runs, x, baseline, ruby.color ?? textHex, fontCache, fallback);
}

/**
 * Paint a warichu note's rows from its segment's `x`, the upper row first.
 * In a tagged render they go in the `WT` of a `Warichu` under `elem`.
 */
export function paintWarichu(
  ctx: PageCtx,
  warichu: VDTWarichu,
  x: number,
  baseline: number,
  textHex: string,
  fontCache: FontCache,
  fallback: PDFFont,
  elem: StructElem | undefined,
): void {
  if (elem) tagContent(ctx, elem.child('Warichu').child('WT'));
  paintRuns(ctx, warichu.runs, x, baseline, warichu.color ?? textHex, fontCache, fallback);
}

/**
 * Paint a footnote marker set in the line gap (`VDTLineSegment.sideMarker`,
 * JLReq §4.2.3) from its segment's `x`. It is the marker's text: in a
 * tagged render it joins the content the caller tagged (the marker's
 * `Link`).
 */
export function paintSideMarker(
  ctx: PageCtx,
  marker: NonNullable<VDTLineSegment['sideMarker']>,
  x: number,
  baseline: number,
  textHex: string,
  fontCache: FontCache,
  fallback: PDFFont,
): void {
  paintRuns(ctx, marker.runs, x, baseline, textHex, fontCache, fallback);
}
