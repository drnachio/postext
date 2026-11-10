// Geometry of an IDML document. Every length is in points. A transform is
// the six numbers of an `ItemTransform` (`a b c d e f`): a point of the
// inner frame maps to `(a·x + c·y + e, b·x + d·y + f)` of the outer one.

export type Matrix = readonly [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export interface Point {
  x: number;
  y: number;
}

/** A box by its edges, y down. */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const apply = (m: Matrix, p: Point): Point => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });

/** `outer ∘ inner`: the transform that applies `inner` first. */
export const multiply = (outer: Matrix, inner: Matrix): Matrix => [
  outer[0] * inner[0] + outer[2] * inner[1],
  outer[1] * inner[0] + outer[3] * inner[1],
  outer[0] * inner[2] + outer[2] * inner[3],
  outer[1] * inner[2] + outer[3] * inner[3],
  outer[0] * inner[4] + outer[2] * inner[5] + outer[4],
  outer[1] * inner[4] + outer[3] * inner[5] + outer[5],
];

/** The inverse of `m`; the identity when `m` flattens the plane. */
export function invert(m: Matrix): Matrix {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return IDENTITY;
  const a = m[3] / det;
  const b = -m[1] / det;
  const c = -m[2] / det;
  const d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}

/** A matrix read from an attribute's numbers; the identity when they are
 *  not six finite numbers. */
export function matrixOf(values: readonly number[] | undefined): Matrix {
  return values && values.length === 6 && values.every(Number.isFinite) ? (values as unknown as Matrix) : IDENTITY;
}

export const boxOf = (points: readonly Point[]): Box | undefined => {
  if (!points.length) return undefined;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const p of points) {
    if (p.x < left) left = p.x;
    if (p.x > right) right = p.x;
    if (p.y < top) top = p.y;
    if (p.y > bottom) bottom = p.y;
  }
  return { left, top, right, bottom };
};

export const unionBox = (a: Box | undefined, b: Box | undefined): Box | undefined =>
  !a ? b : !b ? a : { left: Math.min(a.left, b.left), top: Math.min(a.top, b.top), right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom) };

export const boxWidth = (b: Box): number => b.right - b.left;
export const boxHeight = (b: Box): number => b.bottom - b.top;
export const boxCentre = (b: Box): Point => ({ x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 });

/** The area two boxes share. */
export function overlap(a: Box, b: Box): number {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

/** What a transform does besides moving: its turn (degrees, clockwise on
 *  the page, as InDesign shows a rotation angle negated), its scales, a
 *  flip and a shear. */
export interface Decomposed {
  /** Degrees clockwise on the page (y down). */
  rotation: number;
  scaleX: number;
  scaleY: number;
  /** The transform mirrors (a negative determinant). */
  flipped: boolean;
  /** Shear angle, degrees; 0 for a plain turn and scale. */
  shear: number;
}

export function decompose(m: Matrix): Decomposed {
  const det = m[0] * m[3] - m[1] * m[2];
  const scaleX = Math.hypot(m[0], m[1]);
  const flipped = det < 0;
  const scaleY = scaleX ? Math.abs(det) / scaleX : Math.hypot(m[2], m[3]);
  const rotation = (Math.atan2(m[1], m[0]) * 180) / Math.PI;
  const shear = scaleX ? (Math.atan2(m[0] * m[2] + m[1] * m[3], scaleX * scaleX) * 180) / Math.PI : 0;
  const clean = (n: number) => (Math.abs(n) < 1e-9 ? 0 : n);
  return { rotation: clean(rotation), scaleX, scaleY, flipped, shear: clean(shear) };
}

/** One point of a path: its anchor and the handles coming in (`left`) and
 *  going out (`right`). */
export interface PathPoint {
  anchor: Point;
  left: Point;
  right: Point;
}

export interface Path {
  open: boolean;
  points: PathPoint[];
}

/** Every anchor and handle of the paths, through `m`. */
export function pathExtent(paths: readonly Path[], m: Matrix = IDENTITY): Box | undefined {
  const pts: Point[] = [];
  for (const path of paths) for (const p of path.points) pts.push(apply(m, p.anchor));
  return boxOf(pts);
}

/** The paths are one axis-aligned rectangle in their own frame. */
export function isRectangle(paths: readonly Path[]): Box | undefined {
  if (paths.length !== 1) return undefined;
  const p = paths[0]!;
  if (p.open || p.points.length !== 4) return undefined;
  const straight = p.points.every((q) => Math.abs(q.left.x - q.anchor.x) + Math.abs(q.left.y - q.anchor.y) + Math.abs(q.right.x - q.anchor.x) + Math.abs(q.right.y - q.anchor.y) < 1e-6);
  if (!straight) return undefined;
  const box = boxOf(p.points.map((q) => q.anchor))!;
  const onCorner = p.points.every((q) => (Math.abs(q.anchor.x - box.left) < 1e-6 || Math.abs(q.anchor.x - box.right) < 1e-6) && (Math.abs(q.anchor.y - box.top) < 1e-6 || Math.abs(q.anchor.y - box.bottom) < 1e-6));
  return onCorner && boxWidth(box) > 0 && boxHeight(box) > 0 ? box : undefined;
}
