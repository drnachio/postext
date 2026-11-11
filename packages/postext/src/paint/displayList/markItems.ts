// The highlight marks of a line as display items (`:mark[…]`, #888, and
// the opacity, rough edge and line `markStyles` gained in #1488), unplaced:
// the same outlines the canvas and the PDF trace (`marks/markGeometry.ts`),
// relative to the line as `VDTLine.highlights` and `VDTLine.marks` are.
//
// The display list carries no transparency (the formatted Word document
// draws none): a translucent band is given as the colour it prints over
// white paper, as a PDF/X-1a sets it. Over a box's fill or a
// picture it comes out lighter than in the canvas and a digital PDF.

import type { VDTLine, VDTLineMark } from '../../vdt.js';
import type { DisplayItem } from './types.js';
import { bandOutline, dashedPieces, type OutlineCommand } from '../../marks/markGeometry.js';
import { dottedCentres, wavePoints } from '../../canvas-backend/annotations.js';

type Shape = Extract<DisplayItem, { kind: 'rule' | 'rect' | 'path' }>;
type PathCommand = Extract<DisplayItem, { kind: 'path' }>['subpaths'][number][number];

/** `#rrggbb` at `opacity` over white paper. Anything that is not a six
 *  digit hex colour is given back as it is. */
export function overPaper(color: string, opacity: number): string {
  if (!(opacity < 1) || !/^#[0-9a-fA-F]{6}$/.test(color)) return color;
  const a = Math.max(0, opacity);
  const channel = (i: number): string => Math.round(parseInt(color.slice(i, i + 2), 16) * a + 255 * (1 - a)).toString(16).padStart(2, '0');
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

function pathOf(outline: readonly OutlineCommand[]): PathCommand[] {
  return outline.map((c): PathCommand => (c.op === 'Q' ? { op: 'Q', x1: c.cx, y1: c.cy, x: c.x, y: c.y } : c));
}

function boundsOf(points: readonly { x: number; y: number }[]): { x: number; y: number; width: number; height: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of points) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** A line's highlight bands, painted under its text: a rectangle, or the
 *  rough outline as a path. */
export function highlightShapes(line: VDTLine): Shape[] {
  return (line.highlights ?? []).map((h): Shape => {
    const fill = overPaper(h.color, h.opacity ?? 1);
    const x = line.bbox.x + h.x;
    const y = line.baseline + h.y;
    if (h.rough) {
      const outline = bandOutline(h, line.bbox.x, line.baseline);
      const points = outline.flatMap((c) => (c.op === 'Z' ? [] : [{ x: c.x, y: c.y }]));
      return { kind: 'path', bbox: boundsOf(points), subpaths: [pathOf(outline)], fill };
    }
    return {
      kind: 'rect',
      rect: { x, y, width: h.width, height: h.height },
      fill,
      ...(h.radiusLeft || h.radiusRight ? { radius: Math.max(h.radiusLeft, h.radiusRight) } : {}),
    };
  });
}

/** One mark line (`markLine`) as the canvas draws it. */
function markLineShapes(m: VDTLineMark, x0: number, y0: number, ink: string): Shape[] {
  const length = m.length ?? 0;
  if (!(length > 0)) return [];
  const x = x0 + m.x;
  const y = y0 + m.y;
  const rule = (dy: number, x1 = x, x2 = x + length): Shape => ({ kind: 'rule', x1, y1: y + dy, x2, y2: y + dy, color: ink, widthPx: m.thickness });
  switch (m.kind) {
    case 'double': {
      const half = (m.gap ?? m.thickness * 2) / 2;
      return [rule(-half), rule(half)];
    }
    case 'dashed':
      return dashedPieces(m, x0).map((p) => rule(0, p.x, p.x + p.length));
    case 'dotted': {
      // Round dots: a path of circles, as the canvas fills them.
      const r = (m.size ?? m.thickness) / 2;
      const k = 0.5523 * r;
      const subpaths = dottedCentres(m, x0).map((cx): PathCommand[] => [
        { op: 'M', x: cx + r, y },
        { op: 'C', x1: cx + r, y1: y + k, x2: cx + k, y2: y + r, x: cx, y: y + r },
        { op: 'C', x1: cx - k, y1: y + r, x2: cx - r, y2: y + k, x: cx - r, y },
        { op: 'C', x1: cx - r, y1: y - k, x2: cx - k, y2: y - r, x: cx, y: y - r },
        { op: 'C', x1: cx + k, y1: y - r, x2: cx + r, y2: y - k, x: cx + r, y },
        { op: 'Z' },
      ]);
      return subpaths.length > 0 ? [{ kind: 'path', bbox: { x, y: y - r, width: length, height: 2 * r }, subpaths, fill: ink }] : [];
    }
    case 'wavy': {
      const points = wavePoints(m, x0, y0);
      const subpath = points.map((p, i): PathCommand => ({ op: i === 0 ? 'M' : 'L', x: p.x, y: p.y }));
      return [{ kind: 'path', bbox: boundsOf(points), subpaths: [subpath], stroke: { color: ink, widthPx: m.thickness, join: 'round', cap: 'round' } }];
    }
    default:
      return [rule(0)];
  }
}

/** The lines of the highlight marks on a line (`markStyles[].line`),
 *  painted over its text in `color` unless a line has its own. Other
 *  marks of the line (Chinese emphasis dots, strikethrough lines) reach a
 *  writer through the runs, not here. */
export function markLineItems(line: VDTLine, color: string): Shape[] {
  const out: Shape[] = [];
  for (const m of line.marks ?? []) {
    if (m.markLine) out.push(...markLineShapes(m, line.bbox.x, line.baseline, m.color ?? color));
  }
  return out;
}
