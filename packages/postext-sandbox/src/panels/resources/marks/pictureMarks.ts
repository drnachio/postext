import type { LeaderStyle, Resource, ResourceAnchor, ResourceSafeArea } from 'postext';
import { COMIC_RESERVED_KEYS, normalizeSafeArea } from 'postext';

// ---------------------------------------------------------------------------
// The marks drawn over a picture in the "Safe area & lettering" dialog: the
// safe area (#442), the anchors of the picture (`Resource.anchors`): the
// points a map's or a diagram's `::label` lines stand at (#866) and the
// speakers a comic's lettering points at (#557), the zones its balloons keep clear of
// (`Resource.avoid`) and the faces of the people who do not speak
// (`Resource.faces`, #726). Everything is in fractions of the picture (0–1,
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
  /** The faces of people who do not speak (`Resource.faces`): no balloon
   *  covers them, where an avoid zone gives way at the last fallback. */
  faces: ResourceSafeArea[];
}

/** A mark of the picture the pointer or the keyboard acts on. */
export type MarkTarget =
  | { kind: 'safe' }
  | { kind: 'mouth'; index: number }
  /** Where the label set at a map's anchor stands away from its point
   *  (`ResourceAnchor.labelAt`, #1064); at the point while unset. */
  | { kind: 'label'; index: number }
  | { kind: 'head'; index: number }
  | { kind: 'face'; index: number }
  | { kind: 'avoid'; index: number }
  | { kind: 'bystander'; index: number };

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
    anchors: (resource.anchors ?? []).map((a) => ({
      ...a,
      head: a.head && { ...a.head },
      face: a.face && { ...a.face },
      ...(a.labelAt ? { labelAt: { ...a.labelAt } } : {}),
      ...(a.leader && typeof a.leader === 'object' ? { leader: structuredClone(a.leader) } : {}),
    })),
    avoid: (resource.avoid ?? []).map((r) => ({ ...r })),
    faces: (resource.faces ?? []).map((r) => ({ ...r })),
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
  if (target.kind === 'bystander') return marks.faces[target.index];
  return undefined;
}

/** The point of `target` in `marks`, if it is one (a head falls back to the
 *  mouth, as the engine reads it). */
export function pointOf(marks: PictureMarks, target: MarkTarget): Point | undefined {
  if (target.kind !== 'mouth' && target.kind !== 'head' && target.kind !== 'label') return undefined;
  const a = marks.anchors[target.index];
  if (!a) return undefined;
  if (target.kind === 'label') return a.labelAt ?? { x: a.x, y: a.y };
  return target.kind === 'head' ? (a.head ?? { x: a.x, y: a.y }) : { x: a.x, y: a.y };
}

/** `marks` with the rectangle of `target` replaced. */
export function withRect(marks: PictureMarks, target: MarkTarget, rect: ResourceSafeArea): PictureMarks {
  if (target.kind === 'safe') return { ...marks, safeArea: rect };
  if (target.kind === 'face') return withAnchor(marks, target.index, (a) => ({ ...a, face: rect }));
  if (target.kind === 'avoid') return { ...marks, avoid: marks.avoid.map((r, i) => (i === target.index ? rect : r)) };
  if (target.kind === 'bystander') return { ...marks, faces: marks.faces.map((r, i) => (i === target.index ? rect : r)) };
  return marks;
}

/** `marks` with the point of `target` moved to `p` (inside the picture). */
export function withPoint(marks: PictureMarks, target: MarkTarget, p: Point): PictureMarks {
  const q = clampPoint(p);
  if (target.kind === 'mouth') return withAnchor(marks, target.index, (a) => ({ ...a, x: q.x, y: q.y }));
  if (target.kind === 'head') return withAnchor(marks, target.index, (a) => ({ ...a, head: q }));
  if (target.kind === 'label') return withAnchor(marks, target.index, (a) => ({ ...a, labelAt: q }));
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
 *  or a face only that part, an avoid zone or a bystander's face itself.
 *  The safe area stays (it has its own Remove button). */
export function removeMark(marks: PictureMarks, target: MarkTarget): PictureMarks {
  if (target.kind === 'mouth') return { ...marks, anchors: marks.anchors.filter((_, i) => i !== target.index) };
  if (target.kind === 'head') return withAnchor(marks, target.index, ({ head: _head, ...rest }) => rest);
  // The label goes back to its point.
  if (target.kind === 'label') return withAnchor(marks, target.index, ({ labelAt: _at, ...rest }) => rest);
  if (target.kind === 'face') return withAnchor(marks, target.index, ({ face: _face, ...rest }) => rest);
  if (target.kind === 'avoid') return { ...marks, avoid: marks.avoid.filter((_, i) => i !== target.index) };
  if (target.kind === 'bystander') return { ...marks, faces: marks.faces.filter((_, i) => i !== target.index) };
  return marks;
}

/** An avoid zone or a bystander's face: the two lists the Avoid zones mode
 *  of the dialog edits. */
export type ZoneTarget = Extract<MarkTarget, { kind: 'avoid' | 'bystander' }>;

/** The marks with a new bystander's face around `p`. */
export function addBystanderFace(marks: PictureMarks, p: Point, side = DEFAULT_ZONE_SIDE): PictureMarks {
  return { ...marks, faces: [...marks.faces, zoneAround(p, side)] };
}

/** The marks with the rectangle of `target` moved to the other list: an
 *  avoid zone becomes the face of someone who does not speak, and such a
 *  face an avoid zone. It goes to the end of its new list; `target` is
 *  where it is now. */
export function switchZone(marks: PictureMarks, target: ZoneTarget): { marks: PictureMarks; target: ZoneTarget } {
  const rect = rectOf(marks, target);
  if (!rect) return { marks, target };
  const without = removeMark(marks, target);
  if (target.kind === 'avoid') return { marks: { ...without, faces: [...without.faces, rect] }, target: { kind: 'bystander', index: without.faces.length } };
  return { marks: { ...without, avoid: [...without.avoid, rect] }, target: { kind: 'avoid', index: without.avoid.length } };
}

/** The first `<prefix>N` id no anchor of `anchors` uses (`speakerN` for a
 *  comic's speakers, `anchorN` for a map's labels). */
export function nextAnchorId(anchors: readonly ResourceAnchor[], prefix = 'speaker'): string {
  const used = new Set(anchors.map((a) => a.id));
  for (let n = anchors.length + 1; ; n++) {
    if (!used.has(`${prefix}${n}`)) return `${prefix}${n}`;
  }
}

/** The label fields of an anchor (#853/#866): what a `::label` set at it
 *  takes unless it says otherwise. */
export type LabelFields = Pick<ResourceAnchor, 'style' | 'align' | 'verticalAlign' | 'rotate' | 'width' | 'writingMode' | 'overlap' | 'gutter'>;
export const LABEL_FIELD_KEYS = ['style', 'align', 'verticalAlign', 'rotate', 'width', 'writingMode', 'overlap', 'gutter'] as const;

/** The label fields `a` sets. */
export function labelFieldsOf(a: ResourceAnchor | undefined): LabelFields {
  const out: LabelFields = {};
  if (!a) return out;
  for (const k of LABEL_FIELD_KEYS) if (a[k] !== undefined) (out as Record<string, unknown>)[k] = a[k];
  return out;
}

export interface NewAnchorOptions {
  /** The anchor's id; unset: the next free `<prefix>N`. */
  id?: string;
  prefix?: string;
  /** Label fields the new anchor starts with (those of the anchor picked
   *  before it, so a row of towns takes one style). */
  fields?: LabelFields;
}

/** The marks with a new anchor at `p` (a speaker's mouth on a comic). */
export function addAnchor(marks: PictureMarks, p: Point, options: NewAnchorOptions = {}): PictureMarks {
  const q = clampPoint(p);
  const id = options.id ?? nextAnchorId(marks.anchors, options.prefix);
  return { ...marks, anchors: [...marks.anchors, { id, x: q.x, y: q.y, ...labelFieldsOf(options.fields as ResourceAnchor | undefined) }] };
}

/** The marks with the label fields of anchor `index` changed: a key set to
 *  undefined (or to the engine's default: centre, middle, no turn, a
 *  natural width) is removed, so the anchor keeps only what it changes. */
export function withLabelFields(marks: PictureMarks, index: number, patch: { [K in keyof LabelFields]?: LabelFields[K] | undefined }): PictureMarks {
  return withAnchor(marks, index, (a) => {
    const next: ResourceAnchor = { ...a };
    for (const k of Object.keys(patch) as (keyof LabelFields)[]) {
      const v = patch[k];
      const isDefault = v === undefined || v === '' || (k === 'align' && v === 'center') || (k === 'verticalAlign' && v === 'middle') || (k === 'rotate' && v === 0) || (k === 'writingMode' && v === 'horizontal-tb') || (k === 'overlap' && v === 'check') || (k === 'gutter' && v === 'keep');
      if (isDefault) delete next[k];
      else (next as unknown as Record<string, unknown>)[k] = v;
    }
    return next;
  });
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

/** A leader look with its unset keys left out; undefined when nothing is
 *  set (the label style's look then holds). */
export function leaderStyleClean(style: LeaderStyle | undefined): LeaderStyle | undefined {
  if (!style) return undefined;
  const out: LeaderStyle = {};
  for (const [k, v] of Object.entries(style) as [keyof LeaderStyle, unknown][]) {
    if (v === undefined || (Array.isArray(v) && v.length === 0)) continue;
    (out as Record<string, unknown>)[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** The step a label is set off its point by when it is first moved away
 *  with a button (fractions of the picture): up and to the right. */
export const LABEL_AWAY_STEP = { x: 0.08, y: -0.08 };

/** The marks with the label of anchor `index` set away from its point (by
 *  {@link LABEL_AWAY_STEP}, turned back into the picture near an edge), or
 *  back at it (`away` false). */
export function withLabelAway(marks: PictureMarks, index: number, away: boolean): PictureMarks {
  const a = marks.anchors[index];
  if (!a) return marks;
  if (!away) return removeMark(marks, { kind: 'label', index });
  if (a.labelAt) return marks;
  const x = a.x + LABEL_AWAY_STEP.x <= 1 ? a.x + LABEL_AWAY_STEP.x : a.x - LABEL_AWAY_STEP.x;
  const y = a.y + LABEL_AWAY_STEP.y >= 0 ? a.y + LABEL_AWAY_STEP.y : a.y - LABEL_AWAY_STEP.y;
  return withPoint(marks, { kind: 'label', index }, { x, y });
}

/** What an anchor says of the leader of the label set at it: `'style'`
 *  (unset: the label style decides), `'on'` or `'off'`. */
export type LeaderChoice = 'style' | 'on' | 'off';
export function leaderChoiceOf(a: Pick<ResourceAnchor, 'leader'> | undefined): LeaderChoice {
  const v = a?.leader;
  return v === undefined ? 'style' : v === false ? 'off' : 'on';
}

/** The marks with the leader of anchor `index` set: `'style'` takes the key
 *  away, `'off'` writes false, `'on'` keeps a look the anchor has (else
 *  true); `look` replaces the anchor's own look (an empty one is true). */
export function withLeader(marks: PictureMarks, index: number, choice: LeaderChoice, look?: LeaderStyle): PictureMarks {
  return withAnchor(marks, index, (a) => {
    const { leader: before, ...rest } = a;
    if (choice === 'style') return rest;
    if (choice === 'off') return { ...rest, leader: false };
    const own = look !== undefined ? leaderStyleClean(look) : before && typeof before === 'object' ? before : undefined;
    return { ...rest, leader: own ?? true };
  });
}

/** Whether a leader is drawn for the label at `a` (#1057, as the engine
 *  decides it): the label's own attribute, else the anchor's `leader`, else
 *  a label set away from its point whose style has a `leader` look. */
export function leaderDrawn(a: Pick<ResourceAnchor, 'leader' | 'labelAt'>, styleHasLeader: boolean, labelAttr?: boolean): boolean {
  if (labelAttr !== undefined) return labelAttr;
  if (a.leader !== undefined) return a.leader !== false;
  return !!a.labelAt && styleHasLeader;
}
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
    // The label fields of composed pages (#853) are kept as they are, the
    // numbers rounded as the points are.
    if (a.width !== undefined) out.width = Number.isFinite(a.width) ? round(clamp(a.width, 0.0001, 1)) : a.width;
    if (a.align !== undefined) out.align = a.align;
    if (a.verticalAlign !== undefined) out.verticalAlign = a.verticalAlign;
    if (a.rotate !== undefined) out.rotate = Number.isFinite(a.rotate) ? Math.round(a.rotate * 100) / 100 : a.rotate;
    if (a.style !== undefined) out.style = a.style;
    if (a.writingMode !== undefined) out.writingMode = a.writingMode;
    if (a.overlap !== undefined) out.overlap = a.overlap;
    if (a.gutter !== undefined) out.gutter = a.gutter;
    // A label set away from its point and its leader (#1057, #1064).
    if (a.labelAt && Number.isFinite(a.labelAt.x) && Number.isFinite(a.labelAt.y)) out.labelAt = { x: round(a.labelAt.x), y: round(a.labelAt.y) };
    if (a.leader !== undefined) out.leader = typeof a.leader === 'object' ? leaderStyleClean(a.leader) ?? true : a.leader;
    return out;
  });
  const avoid = marks.avoid.map(validRect).filter((r): r is ResourceSafeArea => !!r).map(roundRect);
  const faces = marks.faces.map(validRect).filter((r): r is ResourceSafeArea => !!r).map(roundRect);
  return { safeArea: normalizeSafeArea(marks.safeArea), anchors, avoid, faces };
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
  if (m.faces.length) next.faces = m.faces;
  else delete next.faces;
  return next;
}

/** Whether two mark sets are the same (for the dialog's undo history). */
export function sameMarks(a: PictureMarks, b: PictureMarks): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
