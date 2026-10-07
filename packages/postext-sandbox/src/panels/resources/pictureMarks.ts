import type { Resource, ResourceAnchor, ResourceSafeArea } from 'postext';
import { COMIC_RESERVED_KEYS, normalizeSafeArea } from 'postext';

// ---------------------------------------------------------------------------
// The marks drawn over a picture in the "Safe area & lettering" dialog: the
// safe area (#442), the speakers a comic's lettering points at
// (`Resource.anchors`, #557) and the zones its balloons keep clear of
// (`Resource.avoid`). Everything is in fractions of the picture (0–1,
// top-left origin), so the marks are the same in every edition of a comic.
// Pure functions: the dialog keeps a `PictureMarks` value and replaces it.
// ---------------------------------------------------------------------------

export interface Point {
  x: number;
  y: number;
}

/** What the dialog edits, saved back onto the resource. */
export interface PictureMarks {
  safeArea?: ResourceSafeArea;
  anchors: ResourceAnchor[];
  avoid: ResourceSafeArea[];
}

/** A mark of the picture the pointer or the keyboard acts on. */
export type MarkTarget =
  | { kind: 'safe' }
  | { kind: 'mouth'; index: number }
  | { kind: 'head'; index: number }
  | { kind: 'face'; index: number }
  | { kind: 'avoid'; index: number };

/** How a rectangle is dragged: by its body or by one of its handles. */
export type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export const HANDLES: Exclude<Handle, 'move'>[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** Smallest side of a rectangle while editing (a fraction of the picture). */
export const MIN_SIDE = 0.05;
/** Keyboard step (a fraction of the picture); Shift on a point takes five. */
export const STEP = 0.01;
/** A new safe area starts centred on 60 % of the picture. */
export const INITIAL_SAFE_AREA: ResourceSafeArea = { x: 0.2, y: 0.2, width: 0.6, height: 0.6 };
/** Side of a face or an avoid zone added with a button or a plain click. */
export const DEFAULT_ZONE_SIDE = 0.16;

/** The shape of a speaker id: the script's key (`ana: Hello`). */
export const ANCHOR_ID_RE = /^[\p{L}\p{N}_.-]+$/u;

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const clampPoint = (p: Point): Point => ({ x: clamp(p.x, 0, 1), y: clamp(p.y, 0, 1) });

/** The marks a resource carries, ready to edit. */
export function marksOf(resource: Resource): PictureMarks {
  return {
    safeArea: normalizeSafeArea(resource.safeArea),
    anchors: (resource.anchors ?? []).map((a) => ({ ...a, head: a.head && { ...a.head }, face: a.face && { ...a.face } })),
    avoid: (resource.avoid ?? []).map((r) => ({ ...r })),
  };
}

/** The rectangle `start` stretched by `handle` to the point `p`, or moved by
 *  `delta` for `'move'`, kept inside the picture and at least
 *  {@link MIN_SIDE} on each side. */
export function dragRect(handle: Handle, start: ResourceSafeArea, p: Point, delta: Point): ResourceSafeArea {
  if (handle === 'move') {
    return {
      ...start,
      x: clamp(start.x + delta.x, 0, 1 - start.width),
      y: clamp(start.y + delta.y, 0, 1 - start.height),
    };
  }
  let x0 = start.x;
  let y0 = start.y;
  let x1 = start.x + start.width;
  let y1 = start.y + start.height;
  const px = clamp(p.x, 0, 1);
  const py = clamp(p.y, 0, 1);
  if (handle.includes('w')) x0 = Math.min(px, x1 - MIN_SIDE);
  if (handle.includes('e')) x1 = Math.max(px, x0 + MIN_SIDE);
  if (handle.includes('n')) y0 = Math.min(py, y1 - MIN_SIDE);
  if (handle.includes('s')) y1 = Math.max(py, y0 + MIN_SIDE);
  x0 = clamp(x0, 0, 1 - MIN_SIDE);
  y0 = clamp(y0, 0, 1 - MIN_SIDE);
  x1 = clamp(x1, MIN_SIDE, 1);
  y1 = clamp(y1, MIN_SIDE, 1);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** The rectangle moved by `(dx, dy)` steps, or resized from its right and
 *  bottom edges when `resize` (Shift with the arrows). */
export function nudgeRect(r: ResourceSafeArea, dx: number, dy: number, resize: boolean): ResourceSafeArea {
  if (resize) {
    return {
      ...r,
      width: clamp(r.width + dx * STEP, MIN_SIDE, 1 - r.x),
      height: clamp(r.height + dy * STEP, MIN_SIDE, 1 - r.y),
    };
  }
  return { ...r, x: clamp(r.x + dx * STEP, 0, 1 - r.width), y: clamp(r.y + dy * STEP, 0, 1 - r.height) };
}

/** A square zone of side {@link DEFAULT_ZONE_SIDE} centred on `p`, kept
 *  inside the picture. */
export function zoneAround(p: Point, side = DEFAULT_ZONE_SIDE): ResourceSafeArea {
  return {
    x: clamp(p.x - side / 2, 0, 1 - side),
    y: clamp(p.y - side / 2, 0, 1 - side),
    width: side,
    height: side,
  };
}

/** The rectangle of `target` in `marks`, if it is one. */
export function rectOf(marks: PictureMarks, target: MarkTarget): ResourceSafeArea | undefined {
  if (target.kind === 'safe') return marks.safeArea;
  if (target.kind === 'face') return marks.anchors[target.index]?.face;
  if (target.kind === 'avoid') return marks.avoid[target.index];
  return undefined;
}

/** The point of `target` in `marks`, if it is one (a head falls back to the
 *  mouth, as the engine reads it). */
export function pointOf(marks: PictureMarks, target: MarkTarget): Point | undefined {
  if (target.kind !== 'mouth' && target.kind !== 'head') return undefined;
  const a = marks.anchors[target.index];
  if (!a) return undefined;
  return target.kind === 'head' ? (a.head ?? { x: a.x, y: a.y }) : { x: a.x, y: a.y };
}

/** `marks` with the rectangle of `target` replaced. */
export function withRect(marks: PictureMarks, target: MarkTarget, rect: ResourceSafeArea): PictureMarks {
  if (target.kind === 'safe') return { ...marks, safeArea: rect };
  if (target.kind === 'face') return withAnchor(marks, target.index, (a) => ({ ...a, face: rect }));
  if (target.kind === 'avoid') return { ...marks, avoid: marks.avoid.map((r, i) => (i === target.index ? rect : r)) };
  return marks;
}

/** `marks` with the point of `target` moved to `p` (inside the picture). */
export function withPoint(marks: PictureMarks, target: MarkTarget, p: Point): PictureMarks {
  const q = clampPoint(p);
  if (target.kind === 'mouth') return withAnchor(marks, target.index, (a) => ({ ...a, x: q.x, y: q.y }));
  if (target.kind === 'head') return withAnchor(marks, target.index, (a) => ({ ...a, head: q }));
  return marks;
}

export function withAnchor(marks: PictureMarks, index: number, f: (a: ResourceAnchor) => ResourceAnchor): PictureMarks {
  return { ...marks, anchors: marks.anchors.map((a, i) => (i === index ? f(a) : a)) };
}

/** A drag in progress: what is dragged, by which handle, the marks when it
 *  started and where the pointer went down (fractions of the picture). */
export interface MarkDrag {
  target: MarkTarget;
  handle: Handle;
  start: PictureMarks;
  origin: Point;
  /** The rectangle the drag stretches from (a new one starts empty at the
   *  pointer). Unset: the target's own rectangle in `start`. */
  from?: ResourceSafeArea;
}

/** The marks once the pointer of `drag` reached `p`. Points follow the
 *  pointer by the distance it moved (grabbing a point off-centre does not
 *  make it jump); rectangles move or stretch as {@link dragRect} says. */
export function applyDrag(drag: MarkDrag, p: Point): PictureMarks {
  const delta = { x: p.x - drag.origin.x, y: p.y - drag.origin.y };
  const point = pointOf(drag.start, drag.target);
  if (point) return withPoint(drag.start, drag.target, { x: point.x + delta.x, y: point.y + delta.y });
  const rect = drag.from ?? rectOf(drag.start, drag.target);
  if (!rect) return drag.start;
  return withRect(drag.start, drag.target, dragRect(drag.handle, rect, p, delta));
}

/** The marks with `target` nudged by the arrow keys: a point moves one step
 *  (five with Shift); a rectangle moves, or resizes with Shift. */
export function nudge(marks: PictureMarks, target: MarkTarget, dx: number, dy: number, shift: boolean): PictureMarks {
  const point = pointOf(marks, target);
  if (point) {
    const k = shift ? 5 : 1;
    return withPoint(marks, target, { x: point.x + dx * STEP * k, y: point.y + dy * STEP * k });
  }
  const rect = rectOf(marks, target);
  return rect ? withRect(marks, target, nudgeRect(rect, dx, dy, shift)) : marks;
}

/** The marks without `target`: a mouth takes its whole speaker away, a head
 *  or a face only that part, an avoid zone itself. The safe area stays (it
 *  has its own Remove button). */
export function removeMark(marks: PictureMarks, target: MarkTarget): PictureMarks {
  if (target.kind === 'mouth') return { ...marks, anchors: marks.anchors.filter((_, i) => i !== target.index) };
  if (target.kind === 'head') return withAnchor(marks, target.index, ({ head: _head, ...rest }) => rest);
  if (target.kind === 'face') return withAnchor(marks, target.index, ({ face: _face, ...rest }) => rest);
  if (target.kind === 'avoid') return { ...marks, avoid: marks.avoid.filter((_, i) => i !== target.index) };
  return marks;
}

/** The first `speakerN` id no speaker of `anchors` uses. */
export function nextAnchorId(anchors: readonly ResourceAnchor[]): string {
  const used = new Set(anchors.map((a) => a.id));
  for (let n = anchors.length + 1; ; n++) {
    if (!used.has(`speaker${n}`)) return `speaker${n}`;
  }
}

/** The marks with a new speaker whose mouth is at `p`. */
export function addAnchor(marks: PictureMarks, p: Point): PictureMarks {
  const q = clampPoint(p);
  return { ...marks, anchors: [...marks.anchors, { id: nextAnchorId(marks.anchors), x: q.x, y: q.y }] };
}

/** A head point for the speaker `index`: a little above its mouth. */
export function addHead(marks: PictureMarks, index: number): PictureMarks {
  return withAnchor(marks, index, (a) => ({ ...a, head: clampPoint({ x: a.x, y: a.y - 0.08 }) }));
}

/** A face rectangle for the speaker `index`, around its head (or mouth). */
export function addFace(marks: PictureMarks, index: number): PictureMarks {
  return withAnchor(marks, index, (a) => ({ ...a, face: zoneAround(a.head ?? { x: a.x, y: a.y - DEFAULT_ZONE_SIDE / 4 }) }));
}

export type AnchorIdProblem = 'empty' | 'invalid' | 'reserved' | 'duplicate';

/** Why the speaker id of `anchors[index]` cannot be saved, if it cannot:
 *  empty, not a script key (`[\p{L}\p{N}_.-]+`), a reserved key (`caption`,
 *  `sfx`, `note`) or the id of an earlier speaker. */
export function anchorIdProblem(anchors: readonly ResourceAnchor[], index: number): AnchorIdProblem | undefined {
  const id = anchors[index]?.id ?? '';
  if (!id) return 'empty';
  if (!ANCHOR_ID_RE.test(id)) return 'invalid';
  if (COMIC_RESERVED_KEYS.has(id)) return 'reserved';
  if (anchors.some((a, i) => i !== index && a.id === id)) return 'duplicate';
  return undefined;
}

/** The first speaker whose id cannot be saved, or -1. */
export function firstAnchorIdProblem(anchors: readonly ResourceAnchor[]): number {
  return anchors.findIndex((_, i) => anchorIdProblem(anchors, i) !== undefined);
}

const inside = (p: Point, r: ResourceSafeArea) =>
  p.x >= r.x - 1e-9 && p.x <= r.x + r.width + 1e-9 && p.y >= r.y - 1e-9 && p.y <= r.y + r.height + 1e-9;

/** Whether the mouth or the head of `anchor` lies outside `safeArea` (a
 *  crop may then hide it). No safe area: never (the picture shows whole). */
export function anchorOutsideSafeArea(anchor: ResourceAnchor, safeArea: ResourceSafeArea | undefined): boolean {
  if (!safeArea) return false;
  return !inside(anchor, safeArea) || (!!anchor.head && !inside(anchor.head, safeArea));
}

const round = (v: number) => Math.round(v * 10000) / 10000;
const roundRect = (r: ResourceSafeArea): ResourceSafeArea => ({ x: round(r.x), y: round(r.y), width: round(r.width), height: round(r.height) });

/** The marks as the resource stores them: four decimals (a hundredth of a
 *  percent), ids trimmed, faces and zones too small to mean anything
 *  dropped. */
export function normalizeMarks(marks: PictureMarks): PictureMarks {
  const anchors = marks.anchors.map((a) => {
    const out: ResourceAnchor = { id: a.id.trim(), x: round(clamp(a.x, 0, 1)), y: round(clamp(a.y, 0, 1)) };
    if (a.head) out.head = { x: round(clamp(a.head.x, 0, 1)), y: round(clamp(a.head.y, 0, 1)) };
    const face = a.face && validRect(a.face);
    if (face) out.face = roundRect(face);
    return out;
  });
  const avoid = marks.avoid.map(validRect).filter((r): r is ResourceSafeArea => !!r).map(roundRect);
  return { safeArea: normalizeSafeArea(marks.safeArea), anchors, avoid };
}

function validRect(r: ResourceSafeArea): ResourceSafeArea | undefined {
  if (![r.x, r.y, r.width, r.height].every(Number.isFinite)) return undefined;
  const x0 = clamp(r.x, 0, 1);
  const y0 = clamp(r.y, 0, 1);
  const x1 = clamp(r.x + r.width, 0, 1);
  const y1 = clamp(r.y + r.height, 0, 1);
  if (x1 - x0 < 0.005 || y1 - y0 < 0.005) return undefined;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** `resource` carrying `marks` (empty lists and no safe area leave the
 *  keys out, so a picture without marks stays as it was). */
export function applyMarks(resource: Resource, marks: PictureMarks): Resource {
  const next: Resource = { ...resource };
  const m = normalizeMarks(marks);
  if (m.safeArea) next.safeArea = m.safeArea;
  else delete next.safeArea;
  if (m.anchors.length) next.anchors = m.anchors;
  else delete next.anchors;
  if (m.avoid.length) next.avoid = m.avoid;
  else delete next.avoid;
  return next;
}

/** Whether two mark sets are the same (for the dialog's undo history). */
export function sameMarks(a: PictureMarks, b: PictureMarks): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
