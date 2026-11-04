// Shapes inline in a line (#1406): a chip's box under its words and a
// colour swatch in the holder its run leaves, as the canvas and the PDF
// paint them (`canvas-backend/chip.ts`, `swatch.ts`): the fill, then the
// outline stroked inside the edge. Drawn from the item's lines, in its
// unturned frame, turned with the item.

import type { DisplayLine, DisplayRect, DisplayRun } from '../../paint/displayList/types.js';
import { swatchGeometry } from '../../paint/swatchShape.js';
import { turnedBox, turnPoint } from './drawing.js';
import { rectRuns, ruleRun } from './shapes.js';
import type { WriterContext } from './types.js';

type Centre = { x: number; y: number };

/** A box filled and stroked inside its edge, radius `r` at its outer edge. */
function boxRuns(ctx: WriterContext, r: DisplayRect, radius: number, fill: string | undefined, stroke: string | undefined, strokeW: number, centre: Centre, rotate: number | undefined): string[] {
  const half = stroke && strokeW > 0 ? strokeW / 2 : 0;
  // A centred DrawingML stroke on the box inset by half its width covers
  // the edge band; the fill under its inner half is hidden as on canvas.
  const inner = { x: r.x + half, y: r.y + half, width: Math.max(0, r.width - 2 * half), height: Math.max(0, r.height - 2 * half) };
  const rect = turnedBox(half ? inner : r, centre, rotate);
  return rectRuns(ctx, {
    kind: 'rect', rect,
    ...(fill ? { fill } : {}),
    ...(half ? { stroke, strokeWidthPx: strokeW } : {}),
    ...(radius - half > 0 ? { radius: radius - half } : {}),
    ...(rotate ? { rotate } : {}),
  });
}

/** The shapes of a chip run (its box) on `line`. */
function chipRuns(ctx: WriterContext, run: DisplayRun, line: DisplayLine, centre: Centre, rotate: number | undefined): string[] {
  const b = run.inline?.box;
  if (!b) return [];
  const baseline = line.baseline;
  const r: DisplayRect = { x: run.x + b.dx, y: baseline - b.ascent, width: b.width, height: b.ascent + b.descent };
  if (b.underline) {
    if (!b.stroke || !b.strokeWidthPx) return b.fill ? boxRuns(ctx, r, b.radius ?? 0, b.fill, undefined, 0, centre, rotate) : [];
    const y = r.y + r.height - b.strokeWidthPx / 2;
    const p = turnPoint({ x: r.x, y }, centre, rotate ?? 0);
    const q = turnPoint({ x: r.x + r.width, y }, centre, rotate ?? 0);
    const dash = b.underline === 'dotted' ? [b.strokeWidthPx, b.strokeWidthPx * 2.2] : b.underline === 'dashed' ? [b.strokeWidthPx * 3, b.strokeWidthPx * 2] : undefined;
    const out = b.fill ? boxRuns(ctx, r, b.radius ?? 0, b.fill, undefined, 0, centre, rotate) : [];
    out.push(ruleRun(ctx, { kind: 'rule', x1: p.x, y1: p.y, x2: q.x, y2: q.y, color: b.stroke, widthPx: b.strokeWidthPx, ...(dash ? { dash } : {}) }));
    return out;
  }
  if (!b.fill && !b.stroke) return [];
  return boxRuns(ctx, r, b.radius ?? 0, b.fill, b.stroke, b.strokeWidthPx ?? 0, centre, rotate);
}

/** The square of a swatch run on `line` (an inline symbol draws nothing). */
function swatchRuns(ctx: WriterContext, run: DisplayRun, line: DisplayLine, centre: Centre, rotate: number | undefined): string[] {
  const sw = run.inline?.swatch;
  if (!sw || sw.icon) return [];
  const g = swatchGeometry(
    { ...(sw.side !== undefined ? { side: sw.side } : {}), ...(sw.borderWidth !== undefined ? { borderWidth: sw.borderWidth } : {}), ...(sw.radius !== undefined ? { radius: sw.radius } : {}) },
    run.x, line.baseline - (run.baselineShift ?? 0), run.width, run.rtl === true,
  );
  return boxRuns(ctx, { x: g.x, y: g.y, width: g.side, height: g.side }, g.radius, sw.color, sw.ink, g.stroke, centre, rotate);
}

/** The chip boxes of `lines` (drawn before their text, under it). */
export function chipBoxRuns(ctx: WriterContext, lines: readonly DisplayLine[], centre: Centre, rotate: number | undefined): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (line.vertical) continue;
    for (const run of line.runs) if (run.inline?.kind === 'chip') out.push(...chipRuns(ctx, run, line, centre, rotate));
  }
  return out;
}

/** The swatches of `lines` (drawn over the holders their runs leave). */
export function swatchShapeRuns(ctx: WriterContext, lines: readonly DisplayLine[], centre: Centre, rotate: number | undefined): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (line.vertical) continue;
    for (const run of line.runs) if (run.inline?.kind === 'swatch') out.push(...swatchRuns(ctx, run, line, centre, rotate));
  }
  return out;
}
