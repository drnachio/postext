/**
 * The vector design block (`VDTDesignPathBlock`, DESIGN §12.1, #1055) in
 * PDF: its outline as `m l c h` (a quadratic curve as the cubic it is),
 * filled (`f` / `f*`), stroked (`S`) or both (`B` / `B*`) with its width,
 * dash (`d`), cap (`J`) and join (`j`), then each marker on top: a dot
 * filled as a circle of four cubics, an arrow as a triangle, a ring
 * (#1079) as the circle stroked in its width, a bar (#1079) as a segment
 * stroked in its width. A colour's alpha goes through the shared ExtGState.
 */
import {
  appendBezierCurve,
  closePath,
  fill,
  LineCapStyle,
  LineJoinStyle,
  lineTo,
  moveTo,
  PDFOperator,
  PDFOperatorNames,
  popGraphicsState,
  pushGraphicsState,
  setDashPattern,
  setFillingColor,
  setLineCap,
  setLineJoin,
  setLineWidth,
  setStrokingColor,
  stroke,
  fillAndStroke,
} from 'pdf-lib';
import { pathMarkerOutline, quadToCubic, type VDTDesignPathBlock, type VDTPathCommand } from 'postext';
import { alphaOf, alphaStateOp, colorFromHex, opt, type PageCtx } from './primitives.js';

const CAPS: Record<NonNullable<NonNullable<VDTDesignPathBlock['stroke']>['cap']>, LineCapStyle> = {
  butt: LineCapStyle.Butt,
  round: LineCapStyle.Round,
  square: LineCapStyle.Projecting,
};
const JOINS: Record<NonNullable<NonNullable<VDTDesignPathBlock['stroke']>['join']>, LineJoinStyle> = {
  miter: LineJoinStyle.Miter,
  round: LineJoinStyle.Round,
  bevel: LineJoinStyle.Bevel,
};

/** The magic number of a quarter circle drawn as one cubic. */
const KAPPA = 0.5522847498;

/** The operators tracing `subpaths` (page px) in PDF user space. */
function traceOps(ctx: PageCtx, subpaths: readonly (readonly VDTPathCommand[])[]): PDFOperator[] {
  const { scale, pageHeightPt: h } = ctx;
  const X = (x: number) => x * scale;
  const Y = (y: number) => h - y * scale;
  const out: PDFOperator[] = [];
  for (const sp of subpaths) {
    let x = 0;
    let y = 0;
    for (const c of sp) {
      switch (c.op) {
        case 'M':
          out.push(moveTo(X(c.x), Y(c.y)));
          break;
        case 'L':
          out.push(lineTo(X(c.x), Y(c.y)));
          break;
        case 'C':
          out.push(appendBezierCurve(X(c.x1), Y(c.y1), X(c.x2), Y(c.y2), X(c.x), Y(c.y)));
          break;
        case 'Q': {
          const k = quadToCubic(x, y, c);
          out.push(appendBezierCurve(X(k.x1), Y(k.y1), X(k.x2), Y(k.y2), X(k.x), Y(k.y)));
          break;
        }
        case 'Z':
          out.push(closePath());
          continue;
      }
      x = c.x;
      y = c.y;
    }
  }
  return out;
}

/** Paint a path block (see the module comment). */
export function renderPathBlock(ctx: PageCtx, block: VDTDesignPathBlock): void {
  const stroked = block.stroke && block.stroke.widthPx > 0 ? block.stroke : undefined;
  const filled = block.fill;
  if ((filled || stroked) && block.subpaths.length > 0) {
    const fillColor = filled ? colorFromHex(filled, ctx.colorSpace) : undefined;
    const strokeColor = stroked ? colorFromHex(stroked.color, ctx.colorSpace) : undefined;
    const evenOdd = block.fillRule === 'evenodd';
    const paint = fillColor && strokeColor
      ? (evenOdd ? PDFOperator.of(PDFOperatorNames.FillEvenOddAndStroke) : fillAndStroke())
      : fillColor
        ? (evenOdd ? PDFOperator.of(PDFOperatorNames.FillEvenOdd) : fill())
        : stroke();
    const ops: PDFOperator[] = [pushGraphicsState()];
    ops.push(...opt(alphaStateOp(ctx, fillColor ? alphaOf(fillColor) : 1, strokeColor ? alphaOf(strokeColor) : 1)));
    if (fillColor) ops.push(setFillingColor(fillColor));
    if (stroked && strokeColor) {
      ops.push(setStrokingColor(strokeColor), setLineWidth(Math.max(0.01, stroked.widthPx * ctx.scale)));
      if (stroked.cap && stroked.cap !== 'butt') ops.push(setLineCap(CAPS[stroked.cap]));
      if (stroked.join && stroked.join !== 'miter') ops.push(setLineJoin(JOINS[stroked.join]));
      if (stroked.dash && stroked.dash.length > 0) ops.push(setDashPattern(stroked.dash.map((d) => d * ctx.scale), 0));
    }
    ops.push(...traceOps(ctx, block.subpaths), paint, popGraphicsState());
    ctx.page.pushOperators(...ops);
  }
  for (const m of block.markers ?? []) {
    const color = colorFromHex(m.color, ctx.colorSpace);
    const o = pathMarkerOutline(m);
    let outline: VDTPathCommand[];
    if (o.kind === 'bar') {
      ctx.page.pushOperators(
        pushGraphicsState(),
        ...opt(alphaStateOp(ctx, 1, alphaOf(color))),
        setStrokingColor(color),
        setLineWidth(Math.max(0.01, o.widthPx * ctx.scale)),
        ...traceOps(ctx, [[{ op: 'M', ...o.points[0] }, { op: 'L', ...o.points[1] }]]),
        stroke(),
        popGraphicsState(),
      );
      continue;
    }
    if (o.kind === 'dot' || o.kind === 'ring') {
      const { cx, cy, r } = o;
      const k = r * KAPPA;
      outline = [
        { op: 'M', x: cx + r, y: cy },
        { op: 'C', x1: cx + r, y1: cy + k, x2: cx + k, y2: cy + r, x: cx, y: cy + r },
        { op: 'C', x1: cx - k, y1: cy + r, x2: cx - r, y2: cy + k, x: cx - r, y: cy },
        { op: 'C', x1: cx - r, y1: cy - k, x2: cx - k, y2: cy - r, x: cx, y: cy - r },
        { op: 'C', x1: cx + k, y1: cy - r, x2: cx + r, y2: cy - k, x: cx + r, y: cy },
        { op: 'Z' },
      ];
    } else {
      const [a, b, c] = o.points;
      outline = [{ op: 'M', ...a }, { op: 'L', ...b }, { op: 'L', ...c }, { op: 'Z' }];
    }
    if (o.kind === 'ring') {
      ctx.page.pushOperators(
        pushGraphicsState(),
        ...opt(alphaStateOp(ctx, 1, alphaOf(color))),
        setStrokingColor(color),
        setLineWidth(Math.max(0.01, o.widthPx * ctx.scale)),
        ...traceOps(ctx, [outline]),
        stroke(),
        popGraphicsState(),
      );
      continue;
    }
    ctx.page.pushOperators(
      pushGraphicsState(),
      ...opt(alphaStateOp(ctx, alphaOf(color))),
      setFillingColor(color),
      ...traceOps(ctx, [outline]),
      fill(),
      popGraphicsState(),
    );
  }
}
