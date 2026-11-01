// A general SVG path as polylines, and the area its stroke covers (#1371).
//
// MathJax strokes some notations as a `<path fill="none">`: the bracket and
// bar of `\enclose{longdiv}`, the angle of `\enclose{phasorangle}`; and a
// `rect` with `rx` (`\enclose{roundedbox}`) is a rounded outline. The
// painters only fill, so the stroke is flattened here into polygons (its
// segments, joins and caps), all wound the same way so a nonzero fill draws
// their union. Everything is in the path's own user space: the caller bakes
// the transform in afterwards.

import { transformPath, type AffineMatrix } from './pathTransform.js';

export type Pt = readonly [number, number];
export interface Polyline { pts: Pt[]; closed: boolean }

/** A matrix equal to the identity but not the `IDENTITY` constant, which
 *  `transformPath` returns untouched: through it a path comes back in
 *  absolute M/L/C/Q/A/Z commands only. */
const ABSOLUTE: AffineMatrix = [1, 0, 0, 1, 0, 0];

const CURVE_STEPS = 16;
const CIRCLE_STEPS = 24;

/** The points of an elliptical arc (SVG 1.1 F.6.5), the start left out. */
function arcPoints(
  x1: number, y1: number, rxIn: number, ryIn: number, rotDeg: number,
  large: boolean, sweep: boolean, x2: number, y2: number,
): Pt[] {
  let rx = Math.abs(rxIn), ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) return [[x2, y2]];
  const phi = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) { rx *= Math.sqrt(lambda); ry *= Math.sqrt(lambda); }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let k = Math.sqrt(Math.max(0, num / den));
  if (large === sweep) k = -k;
  const cxp = (k * rx * y1p) / ry;
  const cyp = (-k * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number): number =>
    Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  else if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(2, Math.ceil(Math.abs(dt) / (Math.PI / 16)));
  const out: Pt[] = [];
  for (let i = 1; i <= n; i++) {
    const t = t1 + (dt * i) / n;
    const ex = rx * Math.cos(t), ey = ry * Math.sin(t);
    out.push(i === n ? [x2, y2] : [cos * ex - sin * ey + cx, sin * ex + cos * ey + cy]);
  }
  return out;
}

/** A path's subpaths as polylines, its curves and arcs flattened. */
export function flattenPath(d: string): Polyline[] {
  const abs = transformPath(d, ABSOLUTE);
  const subs: Polyline[] = [];
  let cur: Polyline | null = null;
  let x = 0, y = 0;
  const add = (p: Pt): void => {
    if (!cur) { cur = { pts: [[x, y]], closed: false }; subs.push(cur); }
    cur.pts.push(p);
    [x, y] = p;
  };
  for (const cmd of abs.match(/[MLCQAZ][^MLCQAZ]*/g) ?? []) {
    const op = cmd[0]!;
    const a = (cmd.slice(1).match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
    if (op === 'M') {
      [x, y] = [a[0]!, a[1]!];
      cur = { pts: [[x, y]], closed: false };
      subs.push(cur);
    } else if (op === 'L') {
      add([a[0]!, a[1]!]);
    } else if (op === 'C') {
      const [x0, y0] = [x, y];
      for (let i = 1; i <= CURVE_STEPS; i++) {
        const t = i / CURVE_STEPS, u = 1 - t;
        add([
          u * u * u * x0 + 3 * u * u * t * a[0]! + 3 * u * t * t * a[2]! + t * t * t * a[4]!,
          u * u * u * y0 + 3 * u * u * t * a[1]! + 3 * u * t * t * a[3]! + t * t * t * a[5]!,
        ]);
      }
    } else if (op === 'Q') {
      const [x0, y0] = [x, y];
      for (let i = 1; i <= CURVE_STEPS; i++) {
        const t = i / CURVE_STEPS, u = 1 - t;
        add([u * u * x0 + 2 * u * t * a[0]! + t * t * a[2]!, u * u * y0 + 2 * u * t * a[1]! + t * t * a[3]!]);
      }
    } else if (op === 'A') {
      for (const p of arcPoints(x, y, a[0]!, a[1]!, a[2]!, a[3] !== 0, a[4] !== 0, a[5]!, a[6]!)) add(p);
    } else if (op === 'Z' && cur) {
      const c: Polyline = cur;
      c.closed = true;
      [x, y] = c.pts[0]!;
      cur = null;
    }
  }
  return subs;
}

const f = (v: number): string => String(+v.toFixed(3));

function polygonD(pts: readonly Pt[]): string {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${f(p[0])} ${f(p[1])}`).join('') + 'Z';
}

/** Polylines as a fill path of straight segments, each subpath closed. */
export function polylinesD(subs: readonly Polyline[]): string {
  return subs.filter((s) => s.pts.length > 2).map((s) => polygonD(s.pts)).join('');
}

function signedArea(pts: readonly Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!, q = pts[(i + 1) % pts.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

function circle(c: Pt, r: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < CIRCLE_STEPS; i++) {
    const t = (2 * Math.PI * i) / CIRCLE_STEPS;
    out.push([c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)]);
  }
  return out;
}

export interface StrokeStyle {
  width: number;
  linecap?: string;
  linejoin?: string;
  miterlimit?: number;
}

/** The area the stroke of `subs` covers, as one nonzero fill path: a quad
 *  per segment, a join polygon at every corner and a cap at open ends. */
export function strokePolylines(subs: readonly Polyline[], style: StrokeStyle): string {
  const w = style.width;
  if (!(w > 0)) return '';
  const h = w / 2;
  const cap = style.linecap ?? 'butt';
  // MathJax writes `mitre`; SVG's keyword (and default) is `miter`.
  const join = style.linejoin === 'mitre' ? 'miter' : style.linejoin ?? 'miter';
  const limit = style.miterlimit && style.miterlimit >= 1 ? style.miterlimit : 4;
  const polys: Pt[][] = [];
  for (const sub of subs) {
    const pts = sub.pts.filter((p, i, all) => i === 0 || p[0] !== all[i - 1]![0] || p[1] !== all[i - 1]![1]);
    if (sub.closed && pts.length > 2 && pts[0]![0] === pts.at(-1)![0] && pts[0]![1] === pts.at(-1)![1]) pts.pop();
    if (pts.length === 1) {
      if (cap === 'round') polys.push(circle(pts[0]!, h));
      else if (cap === 'square') {
        const [px, py] = pts[0]!;
        polys.push([[px - h, py - h], [px + h, py - h], [px + h, py + h], [px - h, py + h]]);
      }
      continue;
    }
    const closed = sub.closed && pts.length > 2;
    const n = closed ? pts.length : pts.length - 1;
    const dirs: Pt[] = [];
    for (let i = 0; i < n; i++) {
      const p = pts[i]!, q = pts[(i + 1) % pts.length]!;
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      dirs.push([(q[0] - p[0]) / len, (q[1] - p[1]) / len]);
    }
    for (let i = 0; i < n; i++) {
      const p = pts[i]!, q = pts[(i + 1) % pts.length]!;
      const [ux, uy] = dirs[i]!;
      // Square caps lengthen the first and last segments of an open path.
      const e0 = !closed && i === 0 && cap === 'square' ? h : 0;
      const e1 = !closed && i === n - 1 && cap === 'square' ? h : 0;
      const nx = -uy * h, ny = ux * h;
      const ax = p[0] - ux * e0, ay = p[1] - uy * e0;
      const bx = q[0] + ux * e1, by = q[1] + uy * e1;
      polys.push([[ax + nx, ay + ny], [bx + nx, by + ny], [bx - nx, by - ny], [ax - nx, ay - ny]]);
    }
    // Joins: at every inner vertex, and at all of them on a closed path.
    for (let i = closed ? 0 : 1; i < (closed ? n : pts.length - 1); i++) {
      const v = pts[i]!;
      const d1 = dirs[(i - 1 + n) % n]!, d2 = dirs[i % n]!;
      const cross = d1[0] * d2[1] - d1[1] * d2[0];
      if (Math.abs(cross) < 1e-9 && d1[0] * d2[0] + d1[1] * d2[1] > 0) continue;
      if (join === 'round') { polys.push(circle(v, h)); continue; }
      // The outer side is the one the path turns away from.
      const s = cross > 0 ? -1 : 1;
      const n1: Pt = [-d1[1] * s, d1[0] * s], n2: Pt = [-d2[1] * s, d2[0] * s];
      const a: Pt = [v[0] + n1[0] * h, v[1] + n1[1] * h];
      const b: Pt = [v[0] + n2[0] * h, v[1] + n2[1] * h];
      const mx = n1[0] + n2[0], my = n1[1] + n2[1];
      const m2 = mx * mx + my * my;
      // Miter length over stroke width is 1 / cos(half the normals' angle).
      if (join === 'miter' && m2 > 1e-12 && 2 / Math.sqrt(m2) <= limit) {
        polys.push([v, a, [v[0] + (w * mx) / m2, v[1] + (w * my) / m2], b]);
      } else {
        polys.push([v, a, b]);
      }
    }
    if (!closed && cap === 'round') {
      polys.push(circle(pts[0]!, h), circle(pts.at(-1)!, h));
    }
  }
  // One winding for all, so overlaps add up instead of cancelling.
  return polys
    .filter((p) => Math.abs(signedArea(p)) > 1e-9)
    .map((p) => polygonD(signedArea(p) < 0 ? [...p].reverse() : p))
    .join('');
}

/** A rounded rectangle's outline as a path (SVG 1.1 §9.2 radii rules). */
export function roundedRectD(x: number, y: number, w: number, h: number, rxIn: number, ryIn: number): string {
  const rx = Math.min(rxIn, w / 2), ry = Math.min(ryIn, h / 2);
  return `M${x + rx} ${y}L${x + w - rx} ${y}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}`
    + `L${x + w} ${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}`
    + `L${x + rx} ${y + h}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}`
    + `L${x} ${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
}
