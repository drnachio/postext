/**
 * The geometry of a comic page (#555): the frame cut into convex polygon
 * cells by the lines of its split tree, gutters taken off, bleeding panels
 * run out to the bleed box, and the split lines the Sandbox drags.
 *
 * Every line is placed against the bounding box of the cell its list
 * splits, before gutters (a line at 30 % sits exactly at 30 %); each cell
 * then loses half the gutter on every side it shares with another cell,
 * measured across the line (a slanted line keeps its gutter width). Rows
 * stack top to bottom; columns run from the start side, so a page read
 * right to left (`'rtl'`) sets its first panel at the right, with the same
 * source.
 */

import type { BoundingBox, VDTPoint } from '../vdt';
import { comicSplitLines, type ComicSplitAxis, type ComicSplitList } from './split';

/** A half-plane: the points where `nx·x + ny·y <= c`. */
export interface HalfPlane {
  nx: number;
  ny: number;
  c: number;
}

/** A side of the frame (physical). */
export type ComicFrameSide = 'top' | 'bottom' | 'left' | 'right';

/** One leaf cell of the split, in reading order. */
export interface ComicCell {
  /** The item path of the cell (indices walked down from the top list). */
  path: number[];
  /** The cell's outline, clockwise, gutters off, bleeding sides out. */
  polygon: VDTPoint[];
  bbox: BoundingBox;
  /** An axis-aligned rectangle (round corners allowed). */
  rect: boolean;
  /** The frame sides the cell touches (before any bleed). */
  touches: ComicFrameSide[];
  /** The cell before gutters: the box its art anchors and a nested list's
   *  percentages are read against. */
  raw: BoundingBox;
}

/** One split line, as the VDT carries it (without its source range). */
export interface ComicSplitLine {
  path: number[];
  boundary: number;
  axis: ComicSplitAxis;
  a: VDTPoint;
  b: VDTPoint;
  gutter: number;
  parent: BoundingBox;
  startPercent: number;
  endPercent: number;
  min: number;
  max: number;
}

export interface ComicGeometryInput {
  tree: ComicSplitList;
  /** The box the panels are cut from (page px). */
  frame: BoundingBox;
  /** The box bleeding panels run out to (the trim, or the trim plus the
   *  bleed). */
  bleedBox: BoundingBox;
  direction: 'ltr' | 'rtl';
  /** Gutter between tiers (rows) and between panels side by side
   *  (columns), px. */
  gutter: { rows: number; columns: number };
  /** The frame sides cell `index` (reading order) bleeds through when it
   *  touches them. */
  bleed?: (index: number) => readonly ComicFrameSide[];
}

export interface ComicGeometry {
  cells: ComicCell[];
  lines: ComicSplitLine[];
}

const EPS = 0.01;

function rectPolygon(r: BoundingBox): VDTPoint[] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.width, y: r.y },
    { x: r.x + r.width, y: r.y + r.height },
    { x: r.x, y: r.y + r.height },
  ];
}

/** Sutherland–Hodgman against one half-plane. */
export function clipPolygon(poly: readonly VDTPoint[], h: HalfPlane): VDTPoint[] {
  const out: VDTPoint[] = [];
  const f = (p: VDTPoint) => h.nx * p.x + h.ny * p.y - h.c;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const fp = f(p);
    const fq = f(q);
    if (fp <= 1e-9) out.push(p);
    if ((fp < -1e-9 && fq > 1e-9) || (fp > 1e-9 && fq < -1e-9)) {
      const t = fp / (fp - fq);
      out.push({ x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) });
    }
  }
  return dedupe(out);
}

function dedupe(poly: VDTPoint[]): VDTPoint[] {
  const out: VDTPoint[] = [];
  for (const p of poly) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 1e-6 && Math.abs(last.y - p.y) < 1e-6) continue;
    out.push(p);
  }
  if (out.length > 1) {
    const first = out[0]!;
    const last = out[out.length - 1]!;
    if (Math.abs(last.x - first.x) < 1e-6 && Math.abs(last.y - first.y) < 1e-6) out.pop();
  }
  return out;
}

export function polygonBBox(poly: readonly VDTPoint[]): BoundingBox {
  if (poly.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of poly) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** Whether a polygon is an axis-aligned rectangle. */
function isRect(poly: readonly VDTPoint[]): boolean {
  if (poly.length !== 4) return false;
  const b = polygonBBox(poly);
  return poly.every((p) => (Math.abs(p.x - b.x) < EPS || Math.abs(p.x - b.x - b.width) < EPS) && (Math.abs(p.y - b.y) < EPS || Math.abs(p.y - b.y - b.height) < EPS));
}

/** Whether `p` lies inside a convex polygon (on the edge counts). */
export function pointInPolygon(poly: readonly VDTPoint[], p: VDTPoint): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (Math.abs(cross) < 1e-9) continue;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** A split line of a list over the box `parent`: its start-end and far-end
 *  points (where it meets the box) and its unit normal, pointing from the
 *  cell before the line to the cell after it. */
function lineOver(
  axis: ComicSplitAxis,
  parent: BoundingBox,
  direction: 'ltr' | 'rtl',
  startPercent: number,
  endPercent: number,
): { s: VDTPoint; e: VDTPoint; n: VDTPoint } {
  let s: VDTPoint;
  let e: VDTPoint;
  let after: VDTPoint;
  if (axis === 'rows') {
    // Across the page, from the start side to the other.
    const sx = direction === 'ltr' ? parent.x : parent.x + parent.width;
    const ex = direction === 'ltr' ? parent.x + parent.width : parent.x;
    s = { x: sx, y: parent.y + (startPercent / 100) * parent.height };
    e = { x: ex, y: parent.y + (endPercent / 100) * parent.height };
    after = { x: 0, y: 1 };
  } else {
    // Down the page, measured from the start side.
    const at = (p: number) => (direction === 'ltr' ? parent.x + (p / 100) * parent.width : parent.x + parent.width - (p / 100) * parent.width);
    s = { x: at(startPercent), y: parent.y };
    e = { x: at(endPercent), y: parent.y + parent.height };
    after = { x: direction === 'ltr' ? 1 : -1, y: 0 };
  }
  const dx = e.x - s.x;
  const dy = e.y - s.y;
  const len = Math.hypot(dx, dy) || 1;
  let n = { x: -dy / len, y: dx / len };
  if (n.x * after.x + n.y * after.y < 0) n = { x: -n.x, y: -n.y };
  return { s, e, n };
}

/** The half-planes of the cell before (`side: -1`) or after (`+1`) a line,
 *  kept `inset` px away from it. */
function sideOf(line: { s: VDTPoint; n: VDTPoint }, side: -1 | 1, inset: number): HalfPlane {
  const d = line.n.x * line.s.x + line.n.y * line.s.y;
  // Before: n·p <= d − inset; after: n·p >= d + inset, i.e. −n·p <= −d − inset.
  return side < 0
    ? { nx: line.n.x, ny: line.n.y, c: d - inset }
    : { nx: -line.n.x, ny: -line.n.y, c: -d - inset };
}

/** The part of segment `s`–`e` inside a convex polygon. */
function clipSegment(poly: readonly VDTPoint[], s: VDTPoint, e: VDTPoint): [VDTPoint, VDTPoint] {
  let t0 = 0;
  let t1 = 1;
  // Orientation of the polygon (sign of its area).
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  const orient = area >= 0 ? 1 : -1;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    // Inside: orient * cross(b − a, p − a) >= 0.
    const g = (p: VDTPoint) => orient * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
    const gs = g(s);
    const ge = g(e);
    if (gs < 0 && ge < 0) return [s, s];
    if (gs < 0) t0 = Math.max(t0, gs / (gs - ge));
    else if (ge < 0) t1 = Math.min(t1, gs / (gs - ge));
  }
  const at = (t: number): VDTPoint => ({ x: s.x + t * (e.x - s.x), y: s.y + t * (e.y - s.y) });
  return [at(t0), at(Math.max(t0, t1))];
}

/** Which frame sides a polygon has an edge on. */
function touchedSides(poly: readonly VDTPoint[], frame: BoundingBox): ComicFrameSide[] {
  const on = (pred: (p: VDTPoint) => boolean) => poly.filter(pred).length >= 2;
  const out: ComicFrameSide[] = [];
  if (on((p) => Math.abs(p.y - frame.y) < EPS)) out.push('top');
  if (on((p) => Math.abs(p.y - frame.y - frame.height) < EPS)) out.push('bottom');
  if (on((p) => Math.abs(p.x - frame.x) < EPS)) out.push('left');
  if (on((p) => Math.abs(p.x - frame.x - frame.width) < EPS)) out.push('right');
  return out;
}

/** Physical side of a logical one on a page read in `direction`. */
export function physicalSide(side: string, direction: 'ltr' | 'rtl'): ComicFrameSide | undefined {
  switch (side) {
    case 'top': return 'top';
    case 'bottom': return 'bottom';
    case 'start': return direction === 'ltr' ? 'left' : 'right';
    case 'end': return direction === 'ltr' ? 'right' : 'left';
    case 'left': return 'left';
    case 'right': return 'right';
    default: return undefined;
  }
}

/**
 * Cut the frame into the cells of a split tree, in reading order, and list
 * its split lines.
 */
export function comicGeometry(input: ComicGeometryInput): ComicGeometry {
  const { frame, direction, gutter, bleedBox } = input;
  const leaves: { path: number[]; planes: HalfPlane[]; raw: VDTPoint[] }[] = [];
  const lines: ComicSplitLine[] = [];
  const walk = (list: ComicSplitList, raw: VDTPoint[], planes: HalfPlane[], path: number[], parentAxis: ComicSplitAxis | undefined): void => {
    const n = list.items.length;
    if (n === 0) return;
    const axis: ComicSplitAxis = list.axis ?? (parentAxis === 'rows' ? 'columns' : 'rows');
    const box = polygonBBox(raw);
    const pos = comicSplitLines(list);
    const g = axis === 'rows' ? gutter.rows : gutter.columns;
    const lineAt = (b: number) => lineOver(axis, box, direction, pos.start[b]!, pos.end[b]!);
    const geo = Array.from({ length: n - 1 }, (_, b) => lineAt(b));
    for (let b = 0; b < n - 1; b++) {
      const l = geo[b]!;
      const [a, e] = clipSegment(raw, l.s, l.e);
      const prevS = b > 0 ? pos.start[b - 1]! : 0;
      const prevE = b > 0 ? pos.end[b - 1]! : 0;
      const nextS = b < n - 2 ? pos.start[b + 1]! : 100;
      const nextE = b < n - 2 ? pos.end[b + 1]! : 100;
      const s = pos.start[b]!;
      const en = pos.end[b]!;
      lines.push({
        path,
        boundary: b,
        axis,
        a,
        b: e,
        gutter: g,
        parent: box,
        startPercent: s,
        endPercent: en,
        min: Math.min(s, s + Math.max(prevS + 5 - s, prevE + 5 - en)),
        max: Math.max(s, s + Math.min(nextS - 5 - s, nextE - 5 - en)),
      });
    }
    for (let i = 0; i < n; i++) {
      let childRaw = raw;
      const childPlanes = [...planes];
      if (i > 0) {
        childRaw = clipPolygon(childRaw, sideOf(geo[i - 1]!, 1, 0));
        childPlanes.push(sideOf(geo[i - 1]!, 1, g / 2));
      }
      if (i < n - 1) {
        childRaw = clipPolygon(childRaw, sideOf(geo[i]!, -1, 0));
        childPlanes.push(sideOf(geo[i]!, -1, g / 2));
      }
      const item = list.items[i]!;
      const childPath = [...path, i];
      if (item.children && item.children.items.length > 0) walk(item.children, childRaw, childPlanes, childPath, axis);
      else leaves.push({ path: childPath, planes: childPlanes, raw: childRaw });
    }
  };
  walk(input.tree, rectPolygon(frame), [], [], undefined);

  const cells: ComicCell[] = leaves.map((leaf, index) => {
    let poly = rectPolygon(frame);
    for (const h of leaf.planes) poly = clipPolygon(poly, h);
    const touches = touchedSides(poly, frame);
    const bleeds = new Set(input.bleed?.(index) ?? []);
    const out = touches.filter((s) => bleeds.has(s));
    if (out.length > 0) {
      const top = out.includes('top') ? bleedBox.y : frame.y;
      const bottom = out.includes('bottom') ? bleedBox.y + bleedBox.height : frame.y + frame.height;
      const left = out.includes('left') ? bleedBox.x : frame.x;
      const right = out.includes('right') ? bleedBox.x + bleedBox.width : frame.x + frame.width;
      poly = rectPolygon({ x: left, y: top, width: right - left, height: bottom - top });
      for (const h of leaf.planes) poly = clipPolygon(poly, h);
    }
    return { path: leaf.path, polygon: poly, bbox: polygonBBox(poly), rect: isRect(poly), touches, raw: polygonBBox(leaf.raw) };
  });
  return { cells, lines };
}
