// Die-cut geometry (#1565): the outlines a die cuts, as VDT path commands
// in page px, and the bounding-box and polygon arithmetic the placement,
// the text wrap, the see-through walk and the preflight share. Pure.

import type { BoundingBox, VDTPathCommand } from '../vdt.js';

/** How far a cubic's control point sits from its corner for a quarter of a
 *  circle: 4/3 (√2 − 1). */
export const KAPPA = 0.5522847498307936;

/** The box every point of `paths` lies in, control points included (a
 *  Bézier curve stays inside the hull of its points, so the box holds the
 *  curve). `undefined` for no points. */
export function pathBounds(paths: readonly (readonly VDTPathCommand[])[] | readonly VDTPathCommand[]): BoundingBox | undefined {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const add = (x: number, y: number) => {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  };
  const visit = (c: VDTPathCommand) => {
    if (c.op === 'Z') return;
    if (c.op === 'C') {
      add(c.x1, c.y1);
      add(c.x2, c.y2);
    } else if (c.op === 'Q') add(c.x1, c.y1);
    add(c.x, c.y);
  };
  for (const item of paths as readonly unknown[]) {
    if (Array.isArray(item)) for (const c of item as VDTPathCommand[]) visit(c);
    else visit(item as VDTPathCommand);
  }
  if (!(x1 >= x0) || !(y1 >= y0)) return undefined;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** The part two boxes share; `undefined` when they do not overlap (boxes
 *  that only touch share nothing). */
export function intersectBoxes(a: BoundingBox, b: BoundingBox): BoundingBox | undefined {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : undefined;
}

/** The smallest box that holds both. */
export function unionBoxes(a: BoundingBox | undefined, b: BoundingBox | undefined): BoundingBox | undefined {
  if (!a) return b;
  if (!b) return a;
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  return { x: x0, y: y0, width: Math.max(a.x + a.width, b.x + b.width) - x0, height: Math.max(a.y + a.height, b.y + b.height) - y0 };
}

/** `box` grown by `d` on every side. */
export function growBox(box: BoundingBox, d: number): BoundingBox {
  return { x: box.x - d, y: box.y - d, width: box.width + 2 * d, height: box.height + 2 * d };
}

/** `path` mirrored across the vertical line `x = axis / 2`: `x' = axis − x`
 *  (the other side of a leaf, with `axis` the sheet's width). */
export function mirrorPath(path: readonly VDTPathCommand[], axis: number): VDTPathCommand[] {
  return path.map((c): VDTPathCommand => {
    switch (c.op) {
      case 'M':
      case 'L':
        return { op: c.op, x: axis - c.x, y: c.y };
      case 'C':
        return { op: 'C', x1: axis - c.x1, y1: c.y1, x2: axis - c.x2, y2: c.y2, x: axis - c.x, y: c.y };
      case 'Q':
        return { op: 'Q', x1: axis - c.x1, y1: c.y1, x: axis - c.x, y: c.y };
      case 'Z':
        return { op: 'Z' };
    }
  });
}

/** A closed rectangle. */
export function rectPath(x: number, y: number, w: number, h: number): VDTPathCommand[] {
  return [
    { op: 'M', x, y },
    { op: 'L', x: x + w, y },
    { op: 'L', x: x + w, y: y + h },
    { op: 'L', x, y: y + h },
    { op: 'Z' },
  ];
}

/** A rectangle with each corner rounded by its own radius (top-left,
 *  top-right, bottom-right, bottom-left), each quarter circle one cubic.
 *  A radius is held to half the shorter side. */
export function roundRectPath(x: number, y: number, w: number, h: number, radii: readonly [number, number, number, number]): VDTPathCommand[] {
  const max = Math.max(0, Math.min(w, h) / 2);
  const [tl, tr, br, bl] = radii.map((r) => Math.max(0, Math.min(r, max))) as [number, number, number, number];
  const k = KAPPA;
  const out: VDTPathCommand[] = [{ op: 'M', x: x + tl, y }];
  out.push({ op: 'L', x: x + w - tr, y });
  if (tr > 0) out.push({ op: 'C', x1: x + w - tr + tr * k, y1: y, x2: x + w, y2: y + tr - tr * k, x: x + w, y: y + tr });
  out.push({ op: 'L', x: x + w, y: y + h - br });
  if (br > 0) out.push({ op: 'C', x1: x + w, y1: y + h - br + br * k, x2: x + w - br + br * k, y2: y + h, x: x + w - br, y: y + h });
  out.push({ op: 'L', x: x + bl, y: y + h });
  if (bl > 0) out.push({ op: 'C', x1: x + bl - bl * k, y1: y + h, x2: x, y2: y + h - bl + bl * k, x, y: y + h - bl });
  out.push({ op: 'L', x, y: y + tl });
  if (tl > 0) out.push({ op: 'C', x1: x, y1: y + tl - tl * k, x2: x + tl - tl * k, y2: y, x: x + tl, y });
  out.push({ op: 'Z' });
  return out;
}

/** An ellipse inscribed in the box, as four cubics (a circle when the box
 *  is square). */
export function ellipsePath(x: number, y: number, w: number, h: number): VDTPathCommand[] {
  const rx = w / 2;
  const ry = h / 2;
  const cx = x + rx;
  const cy = y + ry;
  const ox = rx * KAPPA;
  const oy = ry * KAPPA;
  return [
    { op: 'M', x: cx + rx, y: cy },
    { op: 'C', x1: cx + rx, y1: cy + oy, x2: cx + ox, y2: cy + ry, x: cx, y: cy + ry },
    { op: 'C', x1: cx - ox, y1: cy + ry, x2: cx - rx, y2: cy + oy, x: cx - rx, y: cy },
    { op: 'C', x1: cx - rx, y1: cy - oy, x2: cx - ox, y2: cy - ry, x: cx, y: cy - ry },
    { op: 'C', x1: cx + ox, y1: cy - ry, x2: cx + rx, y2: cy - oy, x: cx + rx, y: cy },
    { op: 'Z' },
  ];
}

/** A point of a polygon. */
export interface Pt {
  x: number;
  y: number;
}

/** `path` as polygons, one per subpath, each curve cut into `steps`
 *  straight pieces: enough to tell where text meets a hole a few points
 *  across. */
export function flattenPath(path: readonly VDTPathCommand[], steps = 8): Pt[][] {
  const out: Pt[][] = [];
  let cur: Pt[] = [];
  let at: Pt = { x: 0, y: 0 };
  let start: Pt = at;
  const close = () => {
    if (cur.length > 2) out.push(cur);
    cur = [];
  };
  for (const c of path) {
    if (c.op === 'M') {
      close();
      at = { x: c.x, y: c.y };
      start = at;
      cur.push(at);
    } else if (c.op === 'L') {
      at = { x: c.x, y: c.y };
      cur.push(at);
    } else if (c.op === 'C') {
      const p0 = at;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        cur.push({
          x: u * u * u * p0.x + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x,
          y: u * u * u * p0.y + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y,
        });
      }
      at = { x: c.x, y: c.y };
    } else if (c.op === 'Q') {
      const p0 = at;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        cur.push({ x: u * u * p0.x + 2 * u * t * c.x1 + t * t * c.x, y: u * u * p0.y + 2 * u * t * c.y1 + t * t * c.y });
      }
      at = { x: c.x, y: c.y };
    } else {
      at = start;
    }
  }
  close();
  return out;
}

/** Whether `p` lies inside `poly` (even-odd). */
export function pointInPolygon(p: Pt, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** The shortest distance from `p` to the segment `a`–`b`. */
function segmentDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** The distance from the rectangle `r` to the polygons (0 when they
 *  overlap). Measured from the rectangle's corners and edges to the
 *  polygon's edges, and from the polygon's points to the rectangle. */
export function rectPolygonDistance(r: BoundingBox, polys: readonly (readonly Pt[])[]): number {
  const corners: Pt[] = [
    { x: r.x, y: r.y }, { x: r.x + r.width, y: r.y },
    { x: r.x + r.width, y: r.y + r.height }, { x: r.x, y: r.y + r.height },
  ];
  let best = Infinity;
  for (const poly of polys) {
    for (const c of corners) if (pointInPolygon(c, poly)) return 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      // A point of the polygon inside the rectangle.
      if (a.x >= r.x && a.x <= r.x + r.width && a.y >= r.y && a.y <= r.y + r.height) return 0;
      for (const c of corners) best = Math.min(best, segmentDistance(c, a, b));
      // The polygon's point to the rectangle's nearest point.
      const nx = Math.max(r.x, Math.min(a.x, r.x + r.width));
      const ny = Math.max(r.y, Math.min(a.y, r.y + r.height));
      best = Math.min(best, Math.hypot(a.x - nx, a.y - ny));
    }
  }
  return best;
}

/** The horizontal extent of the polygons across the band `y0`–`y1`: the
 *  leftmost and rightmost x of their edges there. `undefined` when no edge
 *  crosses the band. */
export function extentInBand(polys: readonly (readonly Pt[])[], y0: number, y1: number): { left: number; right: number } | undefined {
  let left = Infinity;
  let right = -Infinity;
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      const lo = Math.min(a.y, b.y);
      const hi = Math.max(a.y, b.y);
      if (hi < y0 || lo > y1) continue;
      // The segment clipped to the band.
      const xs: number[] = [];
      if (a.y >= y0 && a.y <= y1) xs.push(a.x);
      if (b.y >= y0 && b.y <= y1) xs.push(b.x);
      for (const y of [y0, y1]) {
        if (hi !== lo && y >= lo && y <= hi) xs.push(a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y));
      }
      for (const x of xs) {
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  return right >= left ? { left, right } : undefined;
}
