/**
 * The outline of what a picture shows: what stands out from its
 * transparency or from a flat colour round it (a white ground, a plain
 * backdrop). The picture is read small (at most {@link TRACE_SIZE} px a
 * side), each part of it big enough to count is followed round its edge,
 * and the edge thinned to the points that make its shape. The outline is
 * in fractions of the picture, so it lays on the picture at any size, and
 * on a veil or a finish of its own.
 */

import type { CoverOutline } from 'postext';

/** The longest side a picture is read at, px. */
export const TRACE_SIZE = 240;

export interface Pixels {
  width: number;
  height: number;
  /** RGBA, four bytes a pixel. */
  data: Uint8ClampedArray | Uint8Array;
}

/** What is left out: the picture's transparency, a flat colour (`key`,
 *  `#rrggbb`), or whichever of the two the picture has (`auto`: its
 *  transparency when its corners are clear, else the colour of its
 *  corners). */
export type TraceMode = 'auto' | 'transparent' | 'colour';

export interface TraceOptions {
  mode: TraceMode;
  key?: string;
  /** How far a colour may be from the key and still be left out, 0 … 100. */
  tolerance: number;
}

export interface TraceResult {
  outline: CoverOutline;
  /** What was left out: `transparent`, or the colour. */
  left: 'transparent' | string;
}

const hex2 = (n: number) => n.toString(16).padStart(2, '0');

/** The colour most of the picture's corners share, `#rrggbb`, or
 *  `transparent` when they are clear. */
export function cornerColour(px: Pixels): 'transparent' | string {
  const { width: w, height: h, data } = px;
  const at = (x: number, y: number) => 4 * (y * w + x);
  const corners = [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)];
  if (corners.filter((i) => data[i + 3]! < 128).length >= 2) return 'transparent';
  const sum = [0, 0, 0];
  for (const i of corners) for (let c = 0; c < 3; c++) sum[c]! += data[i + c]!;
  return `#${sum.map((v) => hex2(Math.round(v / 4))).join('')}`;
}

/** Which pixels belong to the shape. */
function shapeMask(px: Pixels, left: 'transparent' | string, tolerance: number): Uint8Array {
  const { width: w, height: h, data } = px;
  const mask = new Uint8Array(w * h);
  const key = left === 'transparent' ? null : [1, 3, 5].map((i) => parseInt(left.slice(i, i + 2), 16));
  // Tolerance 0…100 as a distance in RGB (441 the farthest two colours are).
  const reach = (Math.max(0, Math.min(100, tolerance)) / 100) * 441;
  for (let p = 0; p < w * h; p++) {
    const a = data[4 * p + 3]!;
    if (a < 128) continue;
    if (key) {
      const dr = data[4 * p]! - key[0]!;
      const dg = data[4 * p + 1]! - key[1]!;
      const db = data[4 * p + 2]! - key[2]!;
      if (Math.sqrt(dr * dr + dg * dg + db * db) <= reach) continue;
    }
    mask[p] = 1;
  }
  return mask;
}

/** The parts of `mask`: each a list of its pixels (4-connected). */
function parts(mask: Uint8Array, w: number, h: number): number[][] {
  const seen = new Uint8Array(w * h);
  const out: number[][] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    const part: number[] = [];
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      part.push(p);
      const x = p % w;
      const y = (p - x) / w;
      if (x + 1 < w && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack.push(p + 1); }
      if (x > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack.push(p - 1); }
      if (y + 1 < h && mask[p + w] && !seen[p + w]) { seen[p + w] = 1; stack.push(p + w); }
      if (y > 0 && mask[p - w] && !seen[p - w]) { seen[p - w] = 1; stack.push(p - w); }
    }
    out.push(part);
  }
  return out;
}

/** The outer edge of a part, as pixel corners: every side of its pixels
 *  that faces out, joined end to start into loops (clockwise on screen),
 *  of which the outer one is the largest. */
function outerEdge(part: readonly number[], w: number): { x: number; y: number }[] {
  const own = new Set(part);
  const W = w + 1;
  const next = new Map<number, number[]>();
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    const k = y0 * W + x0;
    const list = next.get(k);
    if (list) list.push(y1 * W + x1);
    else next.set(k, [y1 * W + x1]);
  };
  for (const p of part) {
    const x = p % w;
    const y = (p - x) / w;
    if (y === 0 || !own.has(p - w)) add(x, y, x + 1, y);
    if (x === w - 1 || !own.has(p + 1)) add(x + 1, y, x + 1, y + 1);
    if (!own.has(p + w)) add(x + 1, y + 1, x, y + 1);
    if (x === 0 || !own.has(p - 1)) add(x, y + 1, x, y);
  }
  let best: { x: number; y: number }[] = [];
  let bestArea = 0;
  for (const [from] of next) {
    while (next.get(from)?.length) {
      const loop: { x: number; y: number }[] = [];
      let at = from;
      for (let guard = 0; guard < 4 * part.length + 4; guard++) {
        const ends = next.get(at);
        if (!ends?.length) break;
        loop.push({ x: at % W, y: Math.floor(at / W) });
        at = ends.pop()!;
        if (at === from) break;
      }
      let area = 0;
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i]!;
        const b = loop[(i + 1) % loop.length]!;
        area += a.x * b.y - b.x * a.y;
      }
      if (Math.abs(area) > bestArea) { bestArea = Math.abs(area); best = loop; }
    }
  }
  return best;
}

/** A polyline thinned to the points that make its shape (Douglas–Peucker,
 *  `tolerance` px). */
function simplify(pts: { x: number; y: number }[], tolerance: number): { x: number; y: number }[] {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const A = pts[a]!;
    const B = pts[b]!;
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const len = Math.hypot(dx, dy) || 1;
    let far = -1;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const P = pts[i]!;
      const d = Math.abs(dy * P.x - dx * P.y + B.x * A.y - B.y * A.x) / len;
      if (d > far) { far = d; at = i; }
    }
    if (far > tolerance && at > 0) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** A closed loop thinned: cut in two at the point farthest from its
 *  first, each half thinned as a polyline. */
function simplifyLoop(loop: { x: number; y: number }[], tolerance: number): { x: number; y: number }[] {
  if (loop.length < 4) return loop;
  const a = loop[0]!;
  let k = 1;
  for (let i = 1; i < loop.length; i++) if (Math.hypot(loop[i]!.x - a.x, loop[i]!.y - a.y) > Math.hypot(loop[k]!.x - a.x, loop[k]!.y - a.y)) k = i;
  const first = simplify(loop.slice(0, k + 1), tolerance);
  const second = simplify([...loop.slice(k), a], tolerance);
  return [...first, ...second.slice(1, -1)];
}

/** The outline of a picture's pixels (read at most {@link TRACE_SIZE} a
 *  side): each part at least a five-hundredth of the picture, its edge
 *  thinned. Empty when nothing stands out. */
export function traceOutline(px: Pixels, options: TraceOptions): TraceResult {
  const left = options.mode === 'transparent'
    ? 'transparent'
    : options.mode === 'colour' && options.key
      ? options.key
      : cornerColour(px);
  const { width: w, height: h } = px;
  const mask = shapeMask(px, left, options.tolerance);
  const min = Math.max(4, (w * h) / 500);
  const outline: CoverOutline = [];
  for (const part of parts(mask, w, h)) {
    if (part.length < min) continue;
    const edge = outerEdge(part, w);
    const thin = simplifyLoop(edge, 0.8);
    if (thin.length >= 3) outline.push(thin.map((q) => ({ x: Math.round((q.x / w) * 10000) / 10000, y: Math.round((q.y / h) * 10000) / 10000 })));
  }
  return { outline, left };
}

/** The largest polygon of an outline (by its area): the one a picture's
 *  contour keeps, which takes a single polygon. */
export function largestPolygon(outline: CoverOutline): { x: number; y: number }[] | undefined {
  let best: { x: number; y: number }[] | undefined;
  let area = 0;
  for (const poly of outline) {
    let a = 0;
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      a += p.x * q.y - q.x * p.y;
    }
    if (Math.abs(a) > area) { area = Math.abs(a); best = poly; }
  }
  return best;
}
