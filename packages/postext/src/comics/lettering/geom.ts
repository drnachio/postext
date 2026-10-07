// Small geometry helpers of the lettering: seeded noise, polygons, rects,
// and SVG path data (M L C Z only, so that every renderer reads it).

import type { Point, Rect } from './types';

/** A 32-bit FNV-1a hash of a string: the seed of every jitter. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A deterministic generator of numbers in [0, 1) seeded by `seed`
 *  (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
export const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Point, k: number): Point => ({ x: a.x * k, y: a.y * k });
export const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const norm = (a: Point): Point => {
  const l = Math.hypot(a.x, a.y) || 1;
  return { x: a.x / l, y: a.y / l };
};
/** `a` turned a quarter turn (to the left in page coordinates, y down). */
export const perp = (a: Point): Point => ({ x: a.y, y: -a.x });

export function rectOf(x: number, y: number, width: number, height: number): Rect {
  return { x, y, width, height };
}

export function rectCentre(r: Rect): Point {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

export function unionRect(a: Rect | undefined, b: Rect): Rect {
  if (!a) return { ...b };
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
}

export function boundsOf(points: readonly Point[]): Rect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of points) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  return points.length ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : { x: 0, y: 0, width: 0, height: 0 };
}

export function rectsOverlap(a: Rect, b: Rect, margin = 0): boolean {
  return a.x < b.x + b.width + margin && b.x < a.x + a.width + margin
    && a.y < b.y + b.height + margin && b.y < a.y + a.height + margin;
}

export function rectOverlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

export function pointInRect(p: Point, r: Rect, margin = 0): boolean {
  return p.x >= r.x - margin && p.x <= r.x + r.width + margin && p.y >= r.y - margin && p.y <= r.y + r.height + margin;
}

/** Signed area of a polygon (positive when clockwise on a y-down page). */
export function signedArea(poly: readonly Point[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/** Whether `p` lies inside the convex polygon `poly` (either winding). */
export function pointInConvex(p: Point, poly: readonly Point[]): boolean {
  if (poly.length < 3) return false;
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const c = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (Math.abs(c) < 1e-9) continue;
    const s = c > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** A convex polygon with each edge moved inward by `d` (clipped by the
 *  half-planes of the moved edges). Empty when it vanishes. */
export function insetConvex(poly: readonly Point[], d: number): Point[] {
  if (poly.length < 3) return [];
  if (d <= 0) return poly.map((p) => ({ ...p }));
  const cw = signedArea(poly) > 0;
  let out: Point[] = poly.map((p) => ({ ...p }));
  for (let i = 0; i < poly.length && out.length > 0; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    // Inward normal: on a clockwise (y-down) polygon, to the right of a→b.
    const e = norm(sub(b, a));
    const n = cw ? { x: -e.y, y: e.x } : { x: e.y, y: -e.x };
    const a2 = add(a, scale(n, d));
    out = clipHalfPlane(out, a2, n);
  }
  return out;
}

/** The part of `poly` on the side of the line through `p` that `n` points
 *  to (Sutherland–Hodgman, one edge). */
export function clipHalfPlane(poly: readonly Point[], p: Point, n: Point): Point[] {
  const side = (q: Point) => (q.x - p.x) * n.x + (q.y - p.y) * n.y;
  const out: Point[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const sa = side(a);
    const sb = side(b);
    if (sa >= 0) out.push(a);
    if ((sa >= 0) !== (sb >= 0)) out.push(lerp(a, b, sa / (sa - sb)));
  }
  return out;
}

/** Where the ray from `o` along `dir` first leaves the polygon (the
 *  distance along `dir`, normalised), or undefined. */
export function rayExit(o: Point, dir: Point, poly: readonly Point[]): number | undefined {
  let best: number | undefined;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const t = raySegment(o, dir, a, b);
    if (t !== undefined && t > 1e-9 && (best === undefined || t < best)) best = t;
  }
  return best;
}

/** Distance along `dir` (unit) from `o` to segment `ab`, or undefined. */
export function raySegment(o: Point, dir: Point, a: Point, b: Point): number | undefined {
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const den = dir.x * ey - dir.y * ex;
  if (Math.abs(den) < 1e-12) return undefined;
  const t = ((a.x - o.x) * ey - (a.y - o.y) * ex) / den;
  const u = ((a.x - o.x) * dir.y - (a.y - o.y) * dir.x) / den;
  if (u < -1e-9 || u > 1 + 1e-9) return undefined;
  return t;
}

/** Whether segments `ab` and `cd` cross. */
export function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const o = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = o(c, d, a);
  const d2 = o(c, d, b);
  const d3 = o(a, b, c);
  const d4 = o(a, b, d);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0)) && d1 !== 0 && d2 !== 0 && d3 !== 0 && d4 !== 0;
}

/** Whether segment `ab` crosses rect `r` (or lies inside it). */
export function segmentHitsRect(a: Point, b: Point, r: Rect): boolean {
  if (pointInRect(a, r) || pointInRect(b, r)) return true;
  const c = [
    { x: r.x, y: r.y }, { x: r.x + r.width, y: r.y },
    { x: r.x + r.width, y: r.y + r.height }, { x: r.x, y: r.y + r.height },
  ];
  for (let i = 0; i < 4; i++) if (segmentsCross(a, b, c[i]!, c[(i + 1) % 4]!)) return true;
  return false;
}

/** The point of the polygon's boundary nearest to `p`. */
export function nearestOnPolygon(p: Point, poly: readonly Point[]): Point {
  let best = poly[0] ?? p;
  let bestD = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const ab = sub(b, a);
    const l2 = ab.x * ab.x + ab.y * ab.y || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / l2));
    const q = add(a, scale(ab, t));
    const d = dist(p, q);
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return best;
}

/** One command of a path in page px: M L C Z only. */
export interface PathCmd {
  op: 'M' | 'L' | 'C' | 'Z';
  pts: Point[];
}

const num = (v: number): string => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};
const pt = (p: Point): string => `${num(p.x)} ${num(p.y)}`;

/** SVG path data of commands (two decimals). */
export function pathData(cmds: readonly PathCmd[]): string {
  let d = '';
  for (const c of cmds) {
    if (c.op === 'Z') d += 'Z';
    else if (c.op === 'C') d += `C${pt(c.pts[0]!)} ${pt(c.pts[1]!)} ${pt(c.pts[2]!)}`;
    else d += `${c.op}${pt(c.pts[0]!)}`;
  }
  return d;
}

/** Commands moved by (dx, dy). */
export function translateCmds(cmds: readonly PathCmd[], dx: number, dy: number): PathCmd[] {
  return cmds.map((c) => ({ op: c.op, pts: c.pts.map((p) => ({ x: p.x + dx, y: p.y + dy })) }));
}

/** A closed polygon (straight segments). */
export function polygonCmds(points: readonly Point[]): PathCmd[] {
  if (points.length === 0) return [];
  return [
    { op: 'M', pts: [{ ...points[0]! }] },
    ...points.slice(1).map((p) => ({ op: 'L' as const, pts: [{ ...p }] })),
    { op: 'Z', pts: [] },
  ];
}

/** A closed smooth curve through `points` (Catmull-Rom turned into cubic
 *  Beziers). */
export function smoothClosedCmds(points: readonly Point[]): PathCmd[] {
  const n = points.length;
  if (n < 3) return polygonCmds(points);
  const out: PathCmd[] = [{ op: 'M', pts: [{ ...points[0]! }] }];
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n]!;
    const p1 = points[i]!;
    const p2 = points[(i + 1) % n]!;
    const p3 = points[(i + 2) % n]!;
    out.push({
      op: 'C',
      pts: [
        { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
        { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
        { ...p2 },
      ],
    });
  }
  out.push({ op: 'Z', pts: [] });
  return out;
}

/** An open smooth curve through `points` (Catmull-Rom, ends clamped), as
 *  `C` commands that continue from `points[0]`. */
export function smoothOpenCmds(points: readonly Point[]): PathCmd[] {
  const n = points.length;
  const out: PathCmd[] = [];
  for (let i = 0; i + 1 < n; i++) {
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(n - 1, i + 2)]!;
    out.push({
      op: 'C',
      pts: [
        { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
        { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
        { ...p2 },
      ],
    });
  }
  return out;
}

/** A circle as four cubic arcs. */
export function circleCmds(c: Point, r: number): PathCmd[] {
  const k = 0.5522847498 * r;
  const P = (x: number, y: number): Point => ({ x: c.x + x, y: c.y + y });
  return [
    { op: 'M', pts: [P(r, 0)] },
    { op: 'C', pts: [P(r, k), P(k, r), P(0, r)] },
    { op: 'C', pts: [P(-k, r), P(-r, k), P(-r, 0)] },
    { op: 'C', pts: [P(-r, -k), P(-k, -r), P(0, -r)] },
    { op: 'C', pts: [P(k, -r), P(r, -k), P(r, 0)] },
    { op: 'Z', pts: [] },
  ];
}

/** A rectangle with corners rounded by `radius` (cubic arcs). */
export function roundedRectCmds(r: Rect, radius: number): PathCmd[] {
  const rad = Math.max(0, Math.min(radius, r.width / 2, r.height / 2));
  const { x, y, width: w, height: h } = r;
  if (rad <= 0.01) return polygonCmds([{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]);
  const k = 0.5522847498 * rad;
  return [
    { op: 'M', pts: [{ x: x + rad, y }] },
    { op: 'L', pts: [{ x: x + w - rad, y }] },
    { op: 'C', pts: [{ x: x + w - rad + k, y }, { x: x + w, y: y + rad - k }, { x: x + w, y: y + rad }] },
    { op: 'L', pts: [{ x: x + w, y: y + h - rad }] },
    { op: 'C', pts: [{ x: x + w, y: y + h - rad + k }, { x: x + w - rad + k, y: y + h }, { x: x + w - rad, y: y + h }] },
    { op: 'L', pts: [{ x: x + rad, y: y + h }] },
    { op: 'C', pts: [{ x: x + rad - k, y: y + h }, { x, y: y + h - rad + k }, { x, y: y + h - rad }] },
    { op: 'L', pts: [{ x, y: y + rad }] },
    { op: 'C', pts: [{ x, y: y + rad - k }, { x: x + rad - k, y }, { x: x + rad, y }] },
    { op: 'Z', pts: [] },
  ];
}

/** Length of the closed polygon through `points`. */
export function perimeter(points: readonly Point[]): number {
  let s = 0;
  for (let i = 0; i < points.length; i++) s += dist(points[i]!, points[(i + 1) % points.length]!);
  return s;
}

/** Points at `count` equal steps of arc length along the closed polygon
 *  `points` (starting at `points[0]`, shifted by `phase` steps), each with
 *  the polygon's outward normal there (`cw`: the polygon runs clockwise on
 *  the page). */
export function resampleClosed(points: readonly Point[], count: number, phase = 0): { p: Point; n: Point }[] {
  const n = points.length;
  const cum: number[] = [0];
  for (let i = 0; i < n; i++) cum.push(cum[i]! + dist(points[i]!, points[(i + 1) % n]!));
  const total = cum[n]!;
  const cw = signedArea(points) > 0;
  const out: { p: Point; n: Point }[] = [];
  let seg = 0;
  for (let j = 0; j < count; j++) {
    let s = ((j + phase) / count) * total;
    s = ((s % total) + total) % total;
    while (seg > 0 && cum[seg]! > s) seg--;
    while (seg < n - 1 && cum[seg + 1]! < s) seg++;
    const a = points[seg]!;
    const b = points[(seg + 1) % n]!;
    const t = (s - cum[seg]!) / Math.max(1e-9, cum[seg + 1]! - cum[seg]!);
    const e = norm(sub(b, a));
    // Outward: left of the direction on a clockwise (y-down) polygon.
    const nn = cw ? { x: e.y, y: -e.x } : { x: -e.y, y: e.x };
    out.push({ p: lerp(a, b, t), n: nn });
  }
  return out;
}
