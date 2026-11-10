// Geometry: sheet px on the page to pt on the spread, path points, a
// box's transform and outline.

import type { DisplayLine, DisplayRect, DisplayRun } from '../paint/displayList/types.js';
import { num } from './parts.js';
import type { Writer } from './writer.js';

export interface Pt {
  x: number;
  y: number;
}

export const toSpread = (w: Writer, x: number, y: number): Pt => ({ x: (x - w.ox) * w.k, y: (y - w.oy) * w.k - w.pageH / 2 });

export const pp = (a: Pt, l: Pt = a, r: Pt = a): string =>
  `<PathPointType Anchor="${num(a.x)} ${num(a.y)}" LeftDirection="${num(l.x)} ${num(l.y)}" RightDirection="${num(r.x)} ${num(r.y)}"/>`;

export function pathGeometry(paths: { points: string[]; open: boolean }[]): string {
  return `<Properties><PathGeometry>${paths.map((p) => `<GeometryPathType PathOpen="${p.open}"><PathPointArray>${p.points.join('')}</PathPointArray></GeometryPathType>`).join('')}</PathGeometry></Properties>`;
}

/** A box `r` (sheet px) turned `rotate`° clockwise about its centre: its
 *  item transform and its outline in its own frame (centred, pt). */
export function boxGeometry(w: Writer, r: DisplayRect, rotate = 0): { transform: string; geometry: string; width: number; height: number } {
  const c = toSpread(w, r.x + r.width / 2, r.y + r.height / 2);
  const hw = (r.width * w.k) / 2;
  const hh = (r.height * w.k) / 2;
  const t = (rotate * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const transform = `${num(cos)} ${num(sin)} ${num(-sin)} ${num(cos)} ${num(c.x)} ${num(c.y)}`;
  const points = [pp({ x: -hw, y: -hh }), pp({ x: -hw, y: hh }), pp({ x: hw, y: hh }), pp({ x: hw, y: -hh })];
  return { transform, geometry: pathGeometry([{ points, open: false }]), width: hw * 2, height: hh * 2 };
}

export function opacityXml(opacity: number): string {
  return opacity < 1 ? `<TransparencySetting><BlendingSetting Opacity="${num(opacity * 100)}"/></TransparencySetting>` : '';
}

/** The sheet box of a chip whose box starts on `run` of `line`. */
export function chipRect(run: DisplayRun, line: DisplayLine): DisplayRect | undefined {
  const b = run.inline?.kind === 'chip' ? run.inline.box : undefined;
  return b ? { x: run.x + b.dx, y: line.baseline - b.ascent, width: b.width, height: b.ascent + b.descent } : undefined;
}

export const union = (rects: DisplayRect[]): DisplayRect => {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.width));
  const bottom = Math.max(...rects.map((r) => r.y + r.height));
  return { x, y, width: right - x, height: bottom - y };
};
