// The shape of a die path (#1576): a hole as one of Postext's die shapes
// (a rectangle, a rounded one, a circle, an ellipse, or path data), and a
// leaf's outline as rounded corners. Everything in page coordinates, pt,
// y down. Pure.

import { boxHeight, boxOf, boxWidth, isRectangle, type Box, type Path, type Point } from '../../model/geometry.js';

export type DieShapeKind = 'rect' | 'roundRect' | 'circle' | 'ellipse' | 'path';

/** A hole read from its path: its kind and box, the corner radius of a
 *  rounded rectangle, the path data of anything else (in a viewBox the
 *  size of the box, pt). */
export interface HoleShape {
  kind: DieShapeKind;
  box: Box;
  radius?: number;
  d?: string;
  viewBox?: [number, number];
}

export const CORNERS = ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'] as const;
export type Corner = (typeof CORNERS)[number];
export type Radii = Record<Corner, number>;

/** How far two points of a die path may lie and still be the same, pt. */
const EPS = 0.5;

const near = (a: number, b: number, eps = EPS): boolean => Math.abs(a - b) <= eps;
const same = (p: Point, q: Point, eps = 1e-3): boolean => near(p.x, q.x, eps) && near(p.y, q.y, eps);

/** A path mirrored across a page `width` wide: the hole as the other side
 *  of the leaf has it. */
export function mirrorPath(path: Path, width: number): Path {
  const m = (p: Point): Point => ({ x: width - p.x, y: p.y });
  return { open: path.open, points: path.points.map((p) => ({ anchor: m(p.anchor), left: m(p.left), right: m(p.right) })) };
}

/** The box of a path's anchors. */
export const anchorBox = (path: Path): Box | undefined => boxOf(path.points.map((p) => p.anchor));

const r3 = (n: number): number => Math.round(n * 1000) / 1000;

/** A path as SVG path data, measured from `origin`. A segment whose
 *  handles lie on its anchors is a line, any other a cubic curve. */
export function pathData(path: Path, origin: Point): string {
  const pts = path.points;
  if (!pts.length) return '';
  const xy = (p: Point): string => `${r3(p.x - origin.x)} ${r3(p.y - origin.y)}`;
  const out = [`M${xy(pts[0]!.anchor)}`];
  const segment = (a: (typeof pts)[number], b: (typeof pts)[number]): void => {
    if (same(a.right, a.anchor) && same(b.left, b.anchor)) out.push(`L${xy(b.anchor)}`);
    else out.push(`C${xy(a.right)} ${xy(b.left)} ${xy(b.anchor)}`);
  };
  for (let i = 1; i < pts.length; i++) segment(pts[i - 1]!, pts[i]!);
  if (!path.open) {
    // The way back to the first point: a curve, or the line `Z` draws.
    const last = pts[pts.length - 1]!;
    if (!(same(last.right, last.anchor) && same(pts[0]!.left, pts[0]!.anchor))) segment(last, pts[0]!);
    out.push('Z');
  }
  return out.join(' ');
}

/** The four anchors of an ellipse InDesign draws: one at the middle of
 *  each edge of its box. */
function isEllipse(path: Path, box: Box): boolean {
  if (path.points.length !== 4) return false;
  const cx = (box.left + box.right) / 2;
  const cy = (box.top + box.bottom) / 2;
  const mids: Point[] = [{ x: cx, y: box.top }, { x: box.right, y: cy }, { x: cx, y: box.bottom }, { x: box.left, y: cy }];
  return mids.every((m) => path.points.some((p) => near(p.anchor.x, m.x) && near(p.anchor.y, m.y) && !same(p.left, p.anchor)));
}

/** The corner radii of a closed path that is the box `box` with some of
 *  its corners rounded (every anchor on an edge of the box, a rounded
 *  corner's two anchors as far from it on both edges); undefined for any
 *  other path. A square corner has radius 0. */
export function cornerRadii(path: Path, box: Box, eps = EPS): Radii | undefined {
  if (path.open || path.points.length < 4 || path.points.length > 8) return undefined;
  const onEdge = (p: Point): boolean => near(p.x, box.left, eps) || near(p.x, box.right, eps) || near(p.y, box.top, eps) || near(p.y, box.bottom, eps);
  if (!path.points.every((p) => onEdge(p.anchor))) return undefined;
  const corners: Record<Corner, Point> = { TopLeft: { x: box.left, y: box.top }, TopRight: { x: box.right, y: box.top }, BottomRight: { x: box.right, y: box.bottom }, BottomLeft: { x: box.left, y: box.bottom } };
  const out = { TopLeft: 0, TopRight: 0, BottomRight: 0, BottomLeft: 0 };
  const half = Math.min(boxWidth(box), boxHeight(box)) / 2 + eps;
  for (const c of Object.keys(corners) as Corner[]) {
    const k = corners[c];
    if (path.points.some((p) => near(p.anchor.x, k.x, eps) && near(p.anchor.y, k.y, eps))) continue;
    // The anchors nearest the corner along its horizontal and its
    // vertical edge.
    const along = (horizontal: boolean): number => {
      let best = Infinity;
      for (const p of path.points) {
        const a = p.anchor;
        const d = horizontal ? (near(a.y, k.y, eps) ? Math.abs(a.x - k.x) : Infinity) : near(a.x, k.x, eps) ? Math.abs(a.y - k.y) : Infinity;
        if (d < best) best = d;
      }
      return best;
    };
    const dx = along(true);
    const dy = along(false);
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || !near(dx, dy, Math.max(eps, 0.02 * dx)) || dx > half) return undefined;
    out[c] = (dx + dy) / 2;
  }
  return out;
}

/** The radii of a rectangle's corner options (`TopLeftCornerOption`…):
 *  undefined when it rounds none. Other corner shapes (bevel, inset,
 *  fancy) are read as rounded. */
export function cornerOptions(attrs: Record<string, string>): Radii | undefined {
  const out = { TopLeft: 0, TopRight: 0, BottomRight: 0, BottomLeft: 0 };
  let any = false;
  for (const c of CORNERS) {
    const option = attrs[`${c}CornerOption`];
    const r = Number(attrs[`${c}CornerRadius`]);
    if (option && option !== 'None' && Number.isFinite(r) && r > 0) {
      out[c] = r;
      any = true;
    }
  }
  return any ? out : undefined;
}

/** What the item a hole comes from says of it: an InDesign rectangle
 *  with its corner options, or an oval. */
export interface HoleHint {
  kind?: string;
  corners?: Radii;
}

/** A closed path as a die shape. */
export function classifyHole(path: Path, hint: HoleHint = {}): HoleShape | undefined {
  const box = anchorBox(path);
  if (!box || boxWidth(box) <= 0 || boxHeight(box) <= 0) return undefined;
  const rect = isRectangle([path]);
  if (rect) {
    const radii = hint.kind === 'Rectangle' ? hint.corners : undefined;
    const r = radii ? Math.max(...CORNERS.map((c) => radii[c])) : 0;
    return r > 0 ? { kind: 'roundRect', box: rect, radius: r } : { kind: 'rect', box: rect };
  }
  if (isEllipse(path, box)) return { kind: near(boxWidth(box), boxHeight(box)) ? 'circle' : 'ellipse', box };
  const radii = cornerRadii(path, box);
  if (radii) {
    const rs = CORNERS.map((c) => radii[c]);
    if (rs.every((r) => r > 0 && near(r, rs[0]!))) return { kind: 'roundRect', box, radius: rs.reduce((a, b) => a + b, 0) / 4 };
    if (rs.every((r) => r === 0)) return { kind: 'rect', box };
  }
  return { kind: 'path', box, d: pathData(path, { x: box.left, y: box.top }), viewBox: [r3(boxWidth(box)), r3(boxHeight(box))] };
}

/** Whether a path's anchors are the anchors of `other`, in any order. */
export function sameAnchors(a: readonly Point[], b: readonly Point[], eps = EPS): boolean {
  if (a.length !== b.length) return false;
  return a.every((p) => b.some((q) => near(p.x, q.x, eps) && near(p.y, q.y, eps)));
}
