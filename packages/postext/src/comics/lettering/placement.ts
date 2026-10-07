// Where the balloons of one panel go (SPEC D3.3). Deterministic:
// captions pinned to a corner or an edge are butted first; the others are
// placed greedily in reading order, each at the best of a set of candidate
// centres (a grid over the panel and slots around its speaker), then a few
// passes move each one to its best candidate given all the others. The
// cost weighs hard faults (covering a face, an avoid zone, a speaker's
// mouth or another balloon; running out of the panel) far above the soft
// preferences (near its speaker, high in the panel, Kurlander's reading
// order mirrored for right-to-left pages, tails that do not cross). When a
// balloon cannot be placed cleanly the fallbacks are tried in order: break
// the border (when allowed), cover avoid zones (never faces), reshape the
// text block; then it is placed anyway and reported.

import {
  boundsOf, clipToRect, dist, insetConvex, nearestOnPolygon, norm, pointInConvex, pointInRect, rayExit, rectsOverlap, segmentHitsRect,
  segmentDistance, sub, add, scale,
} from './geom';
import { tailLength, type Body } from './shapes';
import type { LetteringDiagnostic, LetteringPanel, LetteringPosition, PanelSide, Point, Rect } from './types';

/** One way to lay out a unit (a balloon, or a group of joined balloons):
 *  its bodies relative to the unit's anchor (the first body's centre). */
export interface UnitVariant {
  bodies: Body[];
  /** Whether this variant reshapes the text (a fallback). */
  reshaped: boolean;
  /** Union of the bodies' boxes, relative. */
  bbox: Rect;
  /** Points standing for the bodies (outline and inside), relative. */
  samples: Point[];
  /** Outline points of the bodies, relative (the outside test). */
  rim: Point[];
  /** Rotation of a sound effect, degrees (its box is the rotated one). */
  rotate?: number;
  /** What the variant costs as it reads: a joined balloon set back,
   *  against the reading direction, reads out of order; a reshaped text
   *  that parts its words or phrases worse than the preferred shape. */
  cost?: number;
}

/** Where a unit's tail aims, as placement sees it. */
export type TargetSpec =
  | { kind: 'none' }
  | { kind: 'point'; point: Point }
  | { kind: 'offPanel'; toward?: Point; side?: PanelSide };

/** A unit to place. */
export interface PlaceUnit {
  id: string;
  order: number;
  kind: 'balloon' | 'caption' | 'sfx' | 'note';
  variants: UnitVariant[];
  target: TargetSpec;
  pin?: Point;
  position?: LetteringPosition;
  butt?: boolean;
  breakBorder?: boolean;
  /** The item range for diagnostics. */
  sourceStart: number;
  sourceEnd: number;
  /** A point of the art a sound effect goes to (the `sfx` anchor). */
  near?: Point;
  em: number;
}

/** The outcome for one unit. */
export interface Placed {
  unit: PlaceUnit;
  variant: number;
  at: Point;
}

const W = {
  face: 60,
  avoid: 25,
  anchor: 30,
  balloon: 60,
  outside: 120,
  order: 1.2,
  orderBase: 5,
  distance: 0.7,
  far: 0.18,
  below: 0.3,
  height: 0.1,
  start: 0.03,
  cross: 15,
  tailThrough: 20,
  tangent: 0.6,
  ownTail: 25,
  otherFace: 15,
  tailOverFigure: 5,
  side: 3,
  soft: 0.035,
  longTail: 0.3,
};

interface Level {
  breakBorder: boolean;
  coverAvoid: boolean;
}

interface Scene {
  panel: LetteringPanel;
  visible: Point[];
  visBox: Rect;
  faces: Rect[];
  avoid: Rect[];
  /** Regions better left uncovered (the picture's safe area when the art
   *  marks nothing else): a cost per area covered, never a fault. */
  soft: (Rect & { weight?: number })[];
  mouths: Point[];
  fwd: 1 | -1;
  /** The other panels' boxes. */
  neighbours: Rect[];
  /** The page's live area. */
  limit?: Rect;
  /** How far a balloon / a sound effect breaking its border on purpose
   *  may run (the trim less the inset; the trim and the panel's bleed). */
  edge?: Rect;
  edgeSfx?: Rect;
  /** Other panels' balloons. */
  foreign: Rect[];
  /** The panel's polygon inside the live area (see {@link livePolygon}). */
  live: Point[];
  /** What a butted caption sits flush against: the panel's polygon, inset
   *  by half its border (the caption's outline then lies on the border). */
  buttPoly: Point[];
  /** Multiplier of the height preference (see `HEIGHT_BIASES`). */
  heightBias?: number;
}

/** The part of a panel lettering may use: its polygon, less what runs
 *  past the page's live area (a bleeding panel's art reaches the edge of
 *  the sheet; its lettering stays where the trim cannot cut it). */
export function livePolygon(panel: Pick<LetteringPanel, 'polygon' | 'limit'>): Point[] {
  if (!panel.limit) return panel.polygon.map((p) => ({ ...p }));
  const clipped = clipToRect(panel.polygon, panel.limit);
  return clipped.length >= 3 ? clipped : panel.polygon.map((p) => ({ ...p }));
}

function insetRect(r: Rect, d: number): Rect {
  const dx = Math.min(d, r.width / 2);
  const dy = Math.min(d, r.height / 2);
  return { x: r.x + dx, y: r.y + dy, width: r.width - 2 * dx, height: r.height - 2 * dy };
}

function sceneOf(panel: LetteringPanel): Scene {
  const live = livePolygon(panel);
  let visible = insetConvex(live, panel.insetPx);
  if (visible.length < 3) visible = live;
  const trim = panel.trim ?? panel.limit;
  return {
    panel,
    visible,
    visBox: boundsOf(visible),
    faces: panel.anchors.filter((a) => a.face).map((a) => a.face!),
    avoid: [...(panel.avoid ?? [])],
    soft: [...(panel.softAvoid ?? [])],
    mouths: panel.anchors.filter((a) => a.visible && a.id !== 'sfx').map((a) => a.mouth),
    fwd: panel.direction === 'rtl' ? -1 : 1,
    buttPoly: buttPolygon(panel),
    neighbours: [...(panel.neighbours ?? [])],
    ...(panel.limit ? { limit: panel.limit } : {}),
    ...(trim ? { edge: insetRect(trim, panel.insetPx), edgeSfx: panel.sheet ?? trim } : {}),
    foreign: [...(panel.foreign ?? [])],
    live,
  };
}

function buttPolygon(panel: LetteringPanel): Point[] {
  const half = (panel.borderPx ?? 0) / 2;
  const live = livePolygon(panel);
  if (half <= 0) return live;
  const poly = insetConvex(live, half);
  return poly.length >= 3 ? poly : live;
}

const moved = (pts: readonly Point[], at: Point): Point[] => pts.map((p) => ({ x: p.x + at.x, y: p.y + at.y }));
const movedRect = (r: Rect, at: Point): Rect => ({ x: r.x + at.x, y: r.y + at.y, width: r.width, height: r.height });

/** Area of `rect` the samples (standing for `area` px²) fall in. */
function coveredArea(samples: readonly Point[], rect: Rect, area: number): number {
  let n = 0;
  for (const s of samples) if (pointInRect(s, rect)) n++;
  return (n / Math.max(1, samples.length)) * area;
}

function areaOf(v: UnitVariant): number {
  // The bodies' boxes, as an ellipse fills them.
  return v.bodies.reduce((s, b) => s + b.bbox.width * b.bbox.height * 0.8, 0);
}

/** Where a unit's tail goes for the cost: the target point, or none. */
function tailTargetOf(unit: PlaceUnit, scene: Scene, centre: Point): Point | undefined {
  const t = unit.target;
  if (t.kind === 'point') return t.point;
  if (t.kind === 'offPanel') return offPanelPoint(scene.panel, centre, t.toward, t.side);
  return undefined;
}

/** The border point an off-panel tail runs to: toward a cropped anchor,
 *  on a named side, else the nearest border point. */
export function offPanelPoint(panel: LetteringPanel, centre: Point, toward?: Point, side?: PanelSide): Point {
  const poly = livePolygon(panel);
  if (toward) {
    const u = norm(sub(toward, centre));
    const t = rayExit(centre, u, poly);
    if (t !== undefined) return add(centre, scale(u, t));
  }
  if (side) {
    const b = panel.bbox;
    const rtl = panel.direction === 'rtl';
    const phys = side === 'start' ? (rtl ? 'right' : 'left') : side === 'end' ? (rtl ? 'left' : 'right') : side;
    const probe = phys === 'top' ? { x: centre.x, y: b.y - 1e4 }
      : phys === 'bottom' ? { x: centre.x, y: b.y + b.height + 1e4 }
      : phys === 'left' ? { x: b.x - 1e4, y: centre.y } : { x: b.x + b.width + 1e4, y: centre.y };
    const u = norm(sub(probe, centre));
    const t = rayExit(centre, u, poly);
    if (t !== undefined) return add(centre, scale(u, t));
  }
  return nearestOnPolygon(centre, poly);
}

interface Eval {
  hard: number;
  soft: number;
  reasons: Set<LetteringDiagnostic['reasons'][number]>;
}

/** Cost of `unit` (variant `vi`) at `at`, given the other placed units. */
function evaluate(
  scene: Scene,
  unit: PlaceUnit,
  vi: number,
  at: Point,
  others: readonly Placed[],
  level: Level,
  firstOrder: number,
  terms?: Record<string, number>,
): Eval {
  const v = unit.variants[vi]!;
  const em = unit.em;
  const em2 = em * em;
  const box = movedRect(v.bbox, at);
  const samples = moved(v.samples, at);
  const area = areaOf(v);
  const reasons = new Set<LetteringDiagnostic['reasons'][number]>();
  let hard = 0;
  let soft = 0;
  const S = (k: string, x: number) => {
    soft += x;
    if (terms) terms[k] = (terms[k] ?? 0) + x;
  };
  if (v.cost) S('arrangement', v.cost);
  const H = (k: string, x: number) => {
    hard += x;
    if (terms) terms[`!${k}`] = (terms[`!${k}`] ?? 0) + x;
  };
  // Faces, avoid zones, mouths.
  for (const f of scene.faces) {
    if (!rectsOverlap(box, f)) continue;
    const a = coveredArea(samples, f, area);
    if (a > 0) {
      H('face', (W.face * a) / em2 + W.face);
      reasons.add('face');
    }
  }
  for (const r of scene.avoid) {
    if (!rectsOverlap(box, r)) continue;
    const a = coveredArea(samples, r, area);
    if (a > 0) {
      if (level.coverAvoid) S('coverAvoid', (2 * a) / em2);
      else {
        H('avoid', (W.avoid * a) / em2 + W.avoid);
        reasons.add('avoid');
      }
    }
  }
  for (const r of scene.soft) {
    if (!rectsOverlap(box, r)) continue;
    S('softAvoid', ((r.weight ?? 1) * W.soft * coveredArea(samples, r, area)) / em2);
  }
  const bodiesHere = v.bodies.map((b) => moved(b.core, at));
  for (const m of scene.mouths) {
    if (!pointInRect(m, box, 0.4 * em)) continue;
    if (bodiesHere.some((poly) => pointInConvex(m, poly) || dist(nearestOnPolygon(m, poly), m) < 0.4 * em)) {
      H('anchor', W.anchor);
      reasons.add('anchor');
    }
  }
  // Outside the panel. A unit that breaks its border on purpose (`break`,
  // at the level that allows it; a pin, where its author put it) may run
  // past the border, the gutter and the live area: a little cost, never a
  // fault — but never off the sheet, and never into another panel's art
  // unless it is a sound effect or a `break` (drawn sound and a balloon
  // breaking into the next panel are both the letterer's call).
  const rim = moved(v.rim, at);
  const intended = unit.pin !== undefined || (level.breakBorder && unit.breakBorder === true);
  const edge = intended ? (unit.kind === 'sfx' ? scene.edgeSfx : scene.edge) ?? scene.limit : scene.limit;
  let out = 0;
  let intrude = 0;
  let offPage = 0;
  // A butted caption sits flush with the border itself.
  const area0 = unit.butt && unit.position ? scene.buttPoly : scene.visible;
  for (const p of rim) {
    if (!pointInConvex(p, area0) && !(unit.butt && unit.position && dist(nearestOnPolygon(p, area0), p) < 1)) {
      out++;
      if (edge && !pointInRect(p, edge)) offPage++;
      else if (scene.neighbours.some((r) => pointInRect(p, r))) intrude++;
    }
  }
  const mayIntrude = intended && (unit.kind === 'sfx' || unit.breakBorder === true);
  if (offPage > 0 || (intrude > 0 && !mayIntrude)) {
    H('neighbour', (12 * W.outside * (offPage + (mayIntrude ? 0 : intrude))) / rim.length + 200);
    reasons.add('outside');
  } else if (intrude > 0) S('neighbour', 4 + (8 * intrude) / rim.length);
  if (intended) {
    if (out > 0) {
      const f = out / rim.length;
      // Breaking the border is a matter of degree: a balloon may stick out
      // of its panel, but one whose middle stands outside it reads as
      // another panel's (drawn sound may; so may a balloon its author
      // pinned). A pinned balloon (no `break`) slides back in when it can.
      S('breakBorder', 3 * f + (unit.kind !== 'sfx' && !unit.breakBorder ? 6 : 0));
      if (unit.kind !== 'sfx' && !unit.pin && !pointInConvex({ x: box.x + box.width / 2, y: box.y + box.height / 2 }, scene.live)) {
        H('outside', W.outside * f + 10);
        reasons.add('outside');
      }
    }
  } else if (out > 0) {
    H('outside', (W.outside * out) / rim.length + 10);
    reasons.add('outside');
  }
  // Balloons of the other panels (a balloon breaking into this one).
  for (const r of scene.foreign) {
    if (!rectsOverlap(box, r, 0.3 * em)) continue;
    const a = coveredArea(samples, grow(r, 0.3 * em), area);
    if (a > 0) {
      H('balloon', (W.balloon * a) / em2 + W.balloon);
      reasons.add('balloon');
    }
  }
  // Other balloons: overlap is a fault, a near miss (a tangent) a blemish.
  const centre = at;
  const target = tailTargetOf(unit, scene, centre);
  for (const o of others) {
    const ov = o.unit.variants[o.variant]!;
    const obox = movedRect(ov.bbox, o.at);
    if (rectsOverlap(box, obox, 0.5 * em)) {
      const opolys = ov.bodies.map((b) => moved(b.core, o.at));
      let inside = 0;
      for (const s of samples) if (opolys.some((poly) => pointInConvex(s, poly))) inside++;
      if (inside > 0) {
        H('balloon', (W.balloon * (inside / samples.length) * area) / em2 + W.balloon);
        reasons.add('balloon');
      } else S('tangent', W.tangent);
    }
    // Reading order (Kurlander), for the two in their script order.
    const [eBox, lBox] = o.unit.order < unit.order ? [obox, box] : [box, obox];
    const forward = (lBox.x + lBox.width / 2 - (eBox.x + eBox.width / 2)) * scene.fwd < 0;
    // `forward`: the earlier one lies forward (in reading direction) of the
    // later one: the later may be no higher than its bottom; else no
    // higher than its top.
    const limit = forward ? eBox.y + eBox.height - 0.25 * em : eBox.y - 0.25 * em;
    if (unit.kind !== 'sfx' && o.unit.kind !== 'sfx' && lBox.y < limit) {
      const overlapX = Math.min(lBox.x + lBox.width, eBox.x + eBox.width) - Math.max(lBox.x, eBox.x);
      // Side by side at one height reads in order when the earlier one
      // is behind; a later one above an earlier one never does.
      S('order', W.orderBase + (W.order * (limit - lBox.y)) / em + (overlapX > 0 ? 1 : 0));
    }
    // Tails that cross (as drawn: from the wall to the tip), tails
    // through another balloon.
    const otarget = tailTargetOf(o.unit, scene, o.at);
    const mine = target ? tailSegment(unit, v, at, target) : undefined;
    const theirs = otarget ? tailSegment(o.unit, ov, o.at, otarget) : undefined;
    if (mine && theirs) {
      // Crossing tails; tails that all but touch read as crossed too
      // (unless they run to one speaker).
      const gapTails = segmentDistance(mine[0], mine[1], theirs[0], theirs[1]);
      if (gapTails === 0) S('cross', W.cross);
      else if (gapTails < 0.6 * em && dist(target!, otarget!) > em) S('cross', 0.4 * W.cross);
    }
    if (mine && ov.bodies.some((b) => segmentHitsRect(mine[0], mine[1], shrink(movedRect(b.bbox, o.at), 0.12)))) S('tailThrough', W.tailThrough);
    if (theirs && v.bodies.some((b) => segmentHitsRect(theirs[0], theirs[1], shrink(movedRect(b.bbox, at), 0.12)))) S('tailThrough', W.tailThrough);
  }
  // The tail leaves the first body clear of the group's other bodies, by
  // more than its own half width: a tail grazing another body of its group
  // leaves a notch between them that the doubled outline fills with ink.
  if (target && v.bodies.length > 1) {
    const edge = edgePoint(v, at, target);
    for (const b of v.bodies.slice(1)) if (segmentHitsRect(edge, target, grow(movedRect(b.bbox, at), 0.8 * em))) S('ownTail', W.ownTail);
  }
  // Near the speaker, a little above; tails not over faces.
  if (target && unit.target.kind === 'point') {
    const edge = edgePoint(v, at, target);
    const gap = dist(edge, target);
    const h = v.bodies[0]!.bbox.height;
    // Room for a tail of a few ems: too close is worse than too far.
    const ideal = Math.max(2 * em, 0.7 * h);
    S('distance', gap < ideal ? (W.distance * (ideal - gap)) / em : (W.far * (gap - ideal)) / em);
    if (gap < 0.7 * em) S('tooClose', 3);
    // A tail longer than a few ems reads as an arrow: the cost of a far
    // balloon grows faster past six ems. (Over a close-up the balloon goes
    // above the head and its tail runs down past the face: that one is
    // long by necessity.)
    if (gap > 6 * em) S('longTail', (W.longTail * (gap - 6 * em)) / em);
    if (centre.y > target.y) S('below', (W.below * (centre.y - target.y)) / em);
    // A tail over another character's face (or the top of the head)
    // reads as theirs.
    const tip = add(edge, scale(norm(sub(target, edge)), gap * 0.55));
    for (const f of scene.faces) {
      const head = { x: f.x, y: f.y - 0.3 * f.height, width: f.width, height: 1.3 * f.height };
      if (!segmentHitsRect(edge, tip, shrink(head, 0.1))) continue;
      S('otherFace', pointInRect(target, head) ? 1 : W.otherFace);
    }
    // A tail drawn across another figure (the body under a marked face):
    // the eye follows it through the wrong character.
    const drawn = tailSegment(unit, v, at, target);
    for (const a of scene.panel.anchors) {
      if (!a.face || a.mouth === target || a.head === target) continue;
      const f = a.face;
      const figure = { x: f.x - 0.2 * f.width, y: f.y + f.height, width: 1.4 * f.width, height: 1.6 * f.height };
      if (segmentHitsRect(drawn[0], drawn[1], figure)) S('tailOverFigure', W.tailOverFigure);
    }
  } else if (unit.target.kind === 'offPanel' && target) {
    // An off-panel speaker's balloon sits by the border its voice comes
    // from, with a short tail to it (the letterer's practice): a tail
    // across the panel reads as an arrow, so the balloon moves instead.
    S('side', (W.side * Math.max(0, dist(edgePoint(v, at, target), target) - 1.2 * em)) / em);
  }
  if (unit.kind === 'sfx' && unit.near) S('sfxNear', (0.5 * dist(centre, unit.near)) / em);
  // High in the panel; the first one in the top start corner.
  if (unit.kind !== 'sfx') {
    const top = box.y - scene.visBox.y;
    S('height', ((scene.heightBias ?? 1) * (unit.kind === 'note' ? W.height * Math.max(0, scene.visBox.y + scene.visBox.height - (box.y + box.height)) : W.height * top)) / em);
    if (unit.order === firstOrder && unit.kind !== 'note') {
      const fromStart = scene.fwd === 1 ? box.x - scene.visBox.x : scene.visBox.x + scene.visBox.width - (box.x + box.width);
      S('start', (W.start * fromStart) / em);
    }
  }
  return { hard, soft, reasons };
}

/** A rectangle grown by `d` px on every side. */
function grow(r: Rect, d: number): Rect {
  return { x: r.x - d, y: r.y - d, width: r.width + 2 * d, height: r.height + 2 * d };
}

function shrink(r: Rect, f: number): Rect {
  return { x: r.x + r.width * f, y: r.y + r.height * f, width: r.width * (1 - 2 * f), height: r.height * (1 - 2 * f) };
}

/** A unit's tail as drawn, for the cost: from where it leaves the first
 *  body to its tip ({@link tailLength} of the gap). */
function tailSegment(unit: PlaceUnit, v: UnitVariant, at: Point, target: Point): [Point, Point] {
  const edge = edgePoint(v, at, target);
  const gap = dist(edge, target);
  const len = Math.max(Math.min(gap, 0.8 * unit.em), tailLength(gap, unit.em, {}, unit.target.kind === 'offPanel'));
  return [edge, add(edge, scale(norm(sub(target, edge)), len))];
}

/** Where the line from the first body's centre to `target` leaves it. */
function edgePoint(v: UnitVariant, at: Point, target: Point): Point {
  const b = v.bodies[0]!;
  const c = { x: b.centre.x + at.x, y: b.centre.y + at.y };
  const u = norm(sub(target, c));
  const t = rayExit(c, u, moved(b.core, at));
  return t === undefined ? c : add(c, scale(u, t));
}

/** Candidate anchor positions of a unit (deterministic order). */
function candidates(scene: Scene, unit: PlaceUnit, vi: number): Point[] {
  const v = unit.variants[vi]!;
  const out: Point[] = [];
  const seen = new Set<string>();
  const push = (p: Point) => {
    const k = `${Math.round(p.x * 2)},${Math.round(p.y * 2)}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(p);
  };
  const vb = scene.visBox;
  // Clamp the unit's box into the visible box (a candidate hugging a side).
  const clamp = (p: Point): Point => {
    const box = movedRect(v.bbox, p);
    let dx = 0;
    let dy = 0;
    if (box.width <= vb.width) {
      if (box.x < vb.x) dx = vb.x - box.x;
      else if (box.x + box.width > vb.x + vb.width) dx = vb.x + vb.width - (box.x + box.width);
    }
    if (box.height <= vb.height) {
      if (box.y < vb.y) dy = vb.y - box.y;
      else if (box.y + box.height > vb.y + vb.height) dy = vb.y + vb.height - (box.y + box.height);
    }
    return { x: p.x + dx, y: p.y + dy };
  };
  // Anchor-relative offset: the unit box's centre to its anchor.
  const off = { x: -(v.bbox.x + v.bbox.width / 2), y: -(v.bbox.y + v.bbox.height / 2) };
  const at = (cx: number, cy: number): Point => ({ x: cx + off.x, y: cy + off.y });
  const w = v.bbox.width;
  const h = v.bbox.height;
  const em = unit.em;
  // Around the target (speaker or sound-effect point).
  const target = unit.target.kind === 'point' ? unit.target.point : unit.near;
  if (target) {
    for (const k of [0.6, 1.2, 2, 3]) {
      for (const fx of [0, -0.45, 0.45, -0.85, 0.85]) {
        const p = at(target.x + fx * w, target.y - h / 2 - k * em - 0.4 * h);
        push(p);
        push(clamp(p));
      }
    }
    for (const side of [-1, 1]) {
      for (const k of [0, 0.6, 1.2]) {
        const p = at(target.x + side * (w / 2 + 1.5 * em), target.y - k * h);
        push(p);
        push(clamp(p));
      }
    }
    if (unit.kind === 'sfx') push(at(target.x, target.y));
  }
  // A grid over the visible box.
  const step = Math.max(em, Math.min(vb.width, vb.height) / 12);
  for (let y = vb.y + h / 2; y <= vb.y + vb.height - h / 2 + 1e-6; y += step) {
    for (let x = vb.x + w / 2; x <= vb.x + vb.width - w / 2 + 1e-6; x += step) push(at(x, y));
  }
  // The corners and edges, butted against the visible box.
  for (const fy of [0, 0.5, 1]) {
    for (const fx of [0, 0.5, 1]) push(clamp(at(vb.x + fx * vb.width + (0.5 - fx) * w, vb.y + fy * vb.height + (0.5 - fy) * h)));
  }
  if (out.length === 0) push(at(vb.x + vb.width / 2, vb.y + vb.height / 2));
  return out;
}

/** The anchor a corner or edge keyword puts a unit at: its box flush
 *  with the panel (`butt`) or with the inset area, at that corner. */
export function positionAnchor(scene: Pick<Scene, 'visible' | 'panel' | 'fwd' | 'buttPoly'>, v: UnitVariant, position: LetteringPosition, butt: boolean): Point {
  const poly = butt ? scene.buttPoly : scene.visible;
  const box = boundsOf(poly);
  const startLeft = scene.fwd === 1;
  const hx = position === 'top' || position === 'bottom' ? 0.5
    : position.endsWith('start') ? (startLeft ? 0 : 1) : (startLeft ? 1 : 0);
  const vy = position.startsWith('top') ? 0 : 1;
  const bx = box.x + hx * (box.width - v.bbox.width);
  const by = box.y + vy * (box.height - v.bbox.height);
  // Move inward until the box's corners sit inside a slanted cell.
  const inward = { x: hx === 0 ? 1 : hx === 1 ? -1 : 0, y: vy === 0 ? 1 : -1 };
  let p = { x: bx - v.bbox.x, y: by - v.bbox.y };
  for (let i = 0; i < 400; i++) {
    const r = movedRect(v.bbox, p);
    const corners = [{ x: r.x, y: r.y }, { x: r.x + r.width, y: r.y }, { x: r.x + r.width, y: r.y + r.height }, { x: r.x, y: r.y + r.height }];
    if (corners.every((c) => pointInConvex(c, poly) || dist(nearestOnPolygon(c, poly), c) < 0.75)) break;
    p = { x: p.x + inward.x, y: p.y + inward.y };
  }
  return p;
}

/** A corner or edge unit's anchors: its own corner first, then — a cost
 *  each, so taken only when its own covers a face, an avoid zone or a
 *  balloon — the other corner of that edge, the middle of it, and the
 *  corners of the opposite edge. */
function positionAnchors(scene: Scene, v: UnitVariant, position: LetteringPosition, butt: boolean): { at: Point; extra: number }[] {
  const top = position.startsWith('top');
  const across: LetteringPosition = position.endsWith('start') ? (top ? 'top-end' : 'bottom-end') : position.endsWith('end') ? (top ? 'top-start' : 'bottom-start') : (top ? 'top-start' : 'bottom-start');
  const middle: LetteringPosition = top ? 'top' : 'bottom';
  const flip = (q: LetteringPosition): LetteringPosition => (q.startsWith('top') ? q.replace('top', 'bottom') : q.replace('bottom', 'top')) as LetteringPosition;
  const list: [LetteringPosition, number][] = [[position, 0], [across, 2], [middle, 3], [flip(position), 5], [flip(across), 6]];
  const seen = new Set<LetteringPosition>();
  return list.filter(([q]) => (seen.has(q) ? false : (seen.add(q), true))).map(([q, extra]) => ({ at: positionAnchor(scene, v, q, butt), extra }));
}

const LEVELS: Level[] = [
  { breakBorder: false, coverAvoid: false },
  { breakBorder: true, coverAvoid: false },
  { breakBorder: true, coverAvoid: true },
];

interface Choice {
  variant: number;
  level: number;
  at: Point;
  ev: Eval;
}

function better(a: Eval, b: Eval): boolean {
  if (a.hard > 0 || b.hard > 0) return a.hard * 1000 + a.soft < b.hard * 1000 + b.soft - 1e-9;
  return a.soft < b.soft - 1e-9;
}

/** Best spot for one unit given the others, over its variants and the
 *  fallback levels (in SPEC order); the first clean choice wins. */
function bestFor(scene: Scene, unit: PlaceUnit, others: readonly Placed[], firstOrder: number, fixed?: { variant: number; level: number }): Choice {
  let fallback: Choice | undefined;
  const variants = fixed ? [fixed.variant] : unit.variants.map((_, i) => i);
  const levels = fixed ? [fixed.level] : LEVELS.map((_, i) => i).filter((i) => i === 0 || unit.breakBorder || i === 2);
  // Every arrangement of a joined group competes on its cost; a reshaped
  // text block (wider or narrower than its best shape) pays a little for
  // its poorer shape, and is tried before covering an avoid zone (a
  // letterer reshapes the text before covering a hand).
  const penalty = (vi: number) => (unit.variants[vi]!.reshaped ? RESHAPE_COST : 0);
  for (const li of levels) {
    const level = LEVELS[li]!;
    let best: (Choice & { score: number }) | undefined;
    for (const vi of variants) {
      const cands: { at: Point; extra: number }[] = unit.pin
        // (The pin as written wins unless it runs out of the panel.)
        ? pinAnchors(scene, unit, vi).map((at, i) => ({ at, extra: i === 0 ? 0 : 4 }))
        : unit.position
          ? positionAnchors(scene, unit.variants[vi]!, unit.position, unit.butt === true)
          : candidates(scene, unit, vi).map((at) => ({ at, extra: 0 }));
      for (const { at, extra } of cands) {
        const ev = evaluate(scene, unit, vi, at, others, level, firstOrder);
        const score = ev.hard * 1000 + ev.soft + penalty(vi) + extra;
        if (!best || score < best.score - 1e-9) best = { variant: vi, level: li, at, ev, score };
      }
    }
    if (!best) continue;
    const choice: Choice = { variant: best.variant, level: best.level, at: best.at, ev: best.ev };
    if (choice.ev.hard === 0) return choice;
    if (!fallback || better(choice.ev, fallback.ev)) fallback = choice;
  }
  return fallback!;
}

/** What choosing a reshaped text block costs (its poorer shape). */
const RESHAPE_COST = 1.5;

/** A pinned unit's anchors: on its pin, and moved the least that keeps
 *  its box inside the panel (a pinned label too long for the room left
 *  at its pin slides in rather than run out of the panel). */
function pinAnchors(scene: Scene, unit: PlaceUnit, vi: number): Point[] {
  const p = pinAnchor(unit, vi);
  const v = unit.variants[vi]!;
  const box = movedRect(v.bbox, p);
  // Drawn sound stays where its author put it, over borders and all; it
  // only slides back onto the sheet. A pinned balloon slides into its
  // panel when it would run out of it.
  const vb = unit.kind === 'sfx' ? (scene.edgeSfx ?? scene.limit ?? scene.visBox) : scene.visBox;
  const shift = (lo: number, size: number, min: number, max: number) =>
    size > max - min ? (min + max) / 2 - (lo + size / 2) : lo < min ? min - lo : lo + size > max ? max - (lo + size) : 0;
  const dx = shift(box.x, box.width, vb.x, vb.x + vb.width);
  const dy = shift(box.y, box.height, vb.y, vb.y + vb.height);
  return dx === 0 && dy === 0 ? [p] : [p, { x: p.x + dx, y: p.y + dy }];
}

/** The anchor that puts a pinned unit's box centre on its pin; for a
 *  joined group, the centre of its first body's box (the pinned line's
 *  balloon: the lines joined to it follow wherever the group arranges
 *  them). */
function pinAnchor(unit: PlaceUnit, vi: number): Point {
  const v = unit.variants[vi]!;
  const box = v.bodies.length > 1 ? v.bodies[0]!.bbox : v.bbox;
  return { x: unit.pin!.x - (box.x + box.width / 2), y: unit.pin!.y - (box.y + box.height / 2) };
}

/** The result of placing a panel's units. */
export interface PlacementResult {
  placed: (Placed & { level: number })[];
  diagnostics: LetteringDiagnostic[];
}

type Layout = (Placed & { level: number; ev: Eval })[];

/** Greedy placement in reading order, then local improvement passes. */
/** The order units are first placed in: the reading order, the biggest
 *  first, or by where their speakers stand (from the start side). */
type Sequence = 'reading' | 'big' | 'speaker';

function solve(scene: Scene, ordered: readonly PlaceUnit[], firstOrder: number, passes: number, mode: Sequence = 'reading'): Layout {
  const placed: Layout = [];
  // Corner and edge captions first, then pinned units, then the rest in
  // reading order (or the biggest first: in a crowded panel the balloon
  // that needs the most room takes it first); a sound effect with no place
  // of its own (no pin, no `sfx` point in the art) last: the dialogue
  // takes the room it needs first, the sound fills what is left.
  const rank = (u: PlaceUnit) => (u.position ? 0 : u.pin ? 1 : u.kind === 'sfx' && !u.near ? 3 : 2);
  const size = (u: PlaceUnit) => u.variants[0]!.bbox.width * u.variants[0]!.bbox.height;
  const standing = (u: PlaceUnit) => (u.target.kind === 'point' ? scene.fwd * u.target.point.x : Number.POSITIVE_INFINITY);
  const sequence = [...ordered].sort((a, b) => rank(a) - rank(b)
    || (mode === 'big' ? size(b) - size(a) : mode === 'speaker' ? standing(a) - standing(b) : 0)
    || a.order - b.order);
  for (const unit of sequence) {
    const c = bestFor(scene, unit, placed, firstOrder);
    placed.push({ unit, variant: c.variant, at: c.at, level: c.level, ev: c.ev });
  }
  // Local improvement: each free unit moves to its best spot given the
  // others, keeping its variant and level.
  return solveFrom(scene, placed, firstOrder, passes);
}

/** Improvement passes from an existing layout. */
function solveFrom(scene: Scene, start: Layout, firstOrder: number, passes: number): Layout {
  let placed: Layout = [...start];
  for (let pass = 0; pass < passes; pass++) {
    let changed = false;
    // Two balloons whose tails cross trade places (no single move can
    // undo a crossing: each balloon alone is best where it is).
    const swapped = swapCrossing(scene, placed, firstOrder);
    if (swapped) {
      placed = swapped;
      changed = true;
    }
    for (let i = 0; i < placed.length; i++) {
      const p = placed[i]!;
      if (p.unit.pin || p.unit.position) continue;
      const others = placed.filter((_, j) => j !== i);
      const now = evaluate(scene, p.unit, p.variant, p.at, others, LEVELS[p.level]!, firstOrder);
      const c = bestFor(scene, p.unit, others, firstOrder, { variant: p.variant, level: p.level });
      if (better(c.ev, now) && (c.at.x !== p.at.x || c.at.y !== p.at.y)) {
        placed[i] = { ...p, at: c.at, ev: c.ev };
        changed = true;
      } else placed[i] = { ...p, ev: now };
    }
    if (!changed) break;
  }
  return placed;
}

/** The layout with the first pair of free units whose tails cross
 *  swapped (each box centred where the other's was, then settled at its
 *  best spot), when that lowers the whole layout's cost; else undefined. */
function swapCrossing(scene: Scene, placed: Layout, firstOrder: number): Layout | undefined {
  const free = (p: Layout[number]) => !p.unit.pin && !p.unit.position && p.unit.kind === 'balloon';
  const centreOf = (p: Layout[number]) => {
    const b = p.unit.variants[p.variant]!.bbox;
    return { x: p.at.x + b.x + b.width / 2, y: p.at.y + b.y + b.height / 2 };
  };
  const base = totalCost(scene, placed, firstOrder);
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i]!;
      const b = placed[j]!;
      if (!free(a) || !free(b)) continue;
      const ta = tailTargetOf(a.unit, scene, a.at);
      const tb = tailTargetOf(b.unit, scene, b.at);
      if (!ta || !tb) continue;
      const sa = tailSegment(a.unit, a.unit.variants[a.variant]!, a.at, ta);
      const sb = tailSegment(b.unit, b.unit.variants[b.variant]!, b.at, tb);
      const em = Math.min(a.unit.em, b.unit.em);
      if (segmentDistance(sa[0], sa[1], sb[0], sb[1]) >= 0.6 * em || dist(ta, tb) <= em) continue;
      const ca = centreOf(a);
      const cb = centreOf(b);
      const moveTo = (p: Layout[number], c: Point): Layout[number] => {
        const bb = p.unit.variants[p.variant]!.bbox;
        return { ...p, at: { x: c.x - (bb.x + bb.width / 2), y: c.y - (bb.y + bb.height / 2) } };
      };
      const raw: Layout = placed.map((p, k) => (k === i ? moveTo(a, cb) : k === j ? moveTo(b, ca) : p));
      // Then each settled at its best spot given the other.
      const settled: Layout = [...raw];
      for (const k of [i, j]) {
        const p = settled[k]!;
        const others = settled.filter((_, m) => m !== k);
        const c = bestFor(scene, p.unit, others, firstOrder, { variant: p.variant, level: p.level });
        const now = evaluate(scene, p.unit, p.variant, p.at, others, LEVELS[p.level]!, firstOrder);
        if (better(c.ev, now)) settled[k] = { ...p, at: c.at, ev: c.ev };
      }
      // Or both taken out and placed again, each order in turn, the second
      // seeing the first one's tail.
      const replaced = (first: number, second: number): Layout => {
        const out: Layout = [...placed];
        const rest = () => out.filter((_, m) => m !== i && m !== j);
        const p1 = out[first]!;
        const c1 = bestFor(scene, p1.unit, rest(), firstOrder);
        out[first] = { ...p1, variant: c1.variant, level: c1.level, at: c1.at, ev: c1.ev };
        const p2 = out[second]!;
        const c2 = bestFor(scene, p2.unit, out.filter((_, m) => m !== second), firstOrder);
        out[second] = { ...p2, variant: c2.variant, level: c2.level, at: c2.at, ev: c2.ev };
        return out;
      };
      let trial: Layout | undefined;
      let cost = base;
      for (const t of [raw, settled, replaced(j, i), replaced(i, j)]) {
        const c = totalCost(scene, t, firstOrder);
        if (c < cost - 1e-6) {
          cost = c;
          trial = t;
        }
      }
      if (trial) return trial;
    }
  }
  return undefined;
}

/** The layout with one pair of free units taken out and placed again
 * (each order in turn, the second seeing the first) when that lowers the
 * whole layout's cost; else undefined. A single move cannot undo a pair
 * that blocks itself: the first speaker's balloon in the corner the second
 * needs, the second pushed onto the figures. */
function replacePair(scene: Scene, placed: Layout, firstOrder: number): Layout | undefined {
  const free = (p: Layout[number]) => !p.unit.pin && !p.unit.position && p.unit.kind !== 'sfx';
  const base = totalCost(scene, placed, firstOrder);
  let best: Layout | undefined;
  let cost = base;
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      if (!free(placed[i]!) || !free(placed[j]!)) continue;
      for (const [first, second] of [[i, j], [j, i]] as const) {
        const out: Layout = [...placed];
        const p1 = out[first]!;
        const c1 = bestFor(scene, p1.unit, out.filter((_, m) => m !== i && m !== j), firstOrder);
        out[first] = { ...p1, variant: c1.variant, level: c1.level, at: c1.at, ev: c1.ev };
        const p2 = out[second]!;
        const c2 = bestFor(scene, p2.unit, out.filter((_, m) => m !== second), firstOrder);
        out[second] = { ...p2, variant: c2.variant, level: c2.level, at: c2.at, ev: c2.ev };
        const c = totalCost(scene, out, firstOrder);
        if (c < cost - 1e-6) {
          cost = c;
          best = out;
        }
      }
    }
  }
  return best;
}

/**
 * A placed layout with its crossed tails undone: pairs of balloons whose
 * tails cross (or all but touch) trade places or are placed again, each
 * seeing the other's tail, as long as the whole layout gets cheaper. What
 * {@link placeUnits} runs between its improvement passes, on its own.
 */
export function uncrossTails(panel: LetteringPanel, placed: readonly Placed[]): Placed[] {
  const scene = sceneOf(panel);
  const ordered = [...placed].sort((a, b) => a.unit.order - b.unit.order);
  const firstOrder = ordered.find((p) => p.unit.kind !== 'sfx' && p.unit.kind !== 'note')?.unit.order ?? Number.NaN;
  let layout: Layout = placed.map((p) => {
    const others = placed.filter((o) => o !== p);
    return { ...p, level: 0, ev: evaluate(scene, p.unit, p.variant, p.at, others, LEVELS[0]!, firstOrder) };
  });
  for (let k = 0; k < 4; k++) {
    const next = swapCrossing(scene, layout, firstOrder);
    if (!next) break;
    layout = next;
  }
  return layout.map(({ ev: _ev, level: _level, ...rest }) => rest);
}

/** How many pairs of tails of a layout cross (or all but touch). */
function crossings(scene: Scene, placed: Layout): number {
  let n = 0;
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i]!;
      const b = placed[j]!;
      const ta = tailTargetOf(a.unit, scene, a.at);
      const tb = tailTargetOf(b.unit, scene, b.at);
      if (!ta || !tb || dist(ta, tb) <= Math.min(a.unit.em, b.unit.em)) continue;
      const sa = tailSegment(a.unit, a.unit.variants[a.variant]!, a.at, ta);
      const sb = tailSegment(b.unit, b.unit.variants[b.variant]!, b.at, tb);
      if (segmentDistance(sa[0], sa[1], sb[0], sb[1]) < 0.6 * Math.min(a.unit.em, b.unit.em)) n++;
    }
  }
  return n;
}

/** The whole layout's cost under the plain weights (hard faults first). */
function totalCost(scene: Scene, placed: Layout, firstOrder: number): number {
  let hard = 0;
  let soft = 0;
  for (let i = 0; i < placed.length; i++) {
    const p = placed[i]!;
    const ev = evaluate(scene, p.unit, p.variant, p.at, placed.filter((_, j) => j !== i), LEVELS[p.level]!, firstOrder);
    hard += ev.hard;
    soft += ev.soft;
  }
  return hard * 1000 + soft;
}

/** Height biases the solver is run with: a greedy pass that lifts every
 *  balloon higher first can leave room below for the later ones (the
 *  Kurlander order often wants the earlier balloons high); the layout with
 *  the lowest plain cost wins. */
const HEIGHT_BIASES = [1, 3, 7];

/** Place every unit of a panel (see the module comment). */
export function placeUnits(panel: LetteringPanel, units: readonly PlaceUnit[], passes = 3): PlacementResult {
  const scene = sceneOf(panel);
  const ordered = [...units].sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const firstOrder = ordered.find((u) => u.kind !== 'sfx' && u.kind !== 'note')?.order ?? Number.NaN;
  let placed: Layout | undefined;
  let bestCost = Number.POSITIVE_INFINITY;
  const tries = (mode: Sequence) => {
    for (const bias of HEIGHT_BIASES) {
      let run = solve({ ...scene, heightBias: bias }, ordered, firstOrder, passes, mode);
      // Settle under the plain weights.
      if (bias !== 1) run = solveFrom(scene, run, firstOrder, passes);
      const cost = totalCost(scene, run, firstOrder);
      if (cost < bestCost - 1e-9) {
        bestCost = cost;
        placed = run;
      }
    }
  };
  tries('reading');
  // A layout with a fault left (a balloon out of the panel, over a face or
  // another balloon): the greedy order may have boxed the last balloons
  // in; try again placing the biggest first.
  if (bestCost >= 1000 && ordered.length > 1) tries('big');
  // Tails still crossing (speakers standing in the order opposite to the
  // one they speak in): try again from where the speakers stand, each
  // balloon by its own speaker first.
  if (ordered.length > 1 && crossings(scene, placed!) > 0) tries('speaker');
  // Pairs placed again together, while that helps (a few rounds).
  for (let round = 0; round < 3 && ordered.length > 1; round++) {
    const next = replacePair(scene, placed!, firstOrder);
    if (!next) break;
    placed = solveFrom(scene, next, firstOrder, passes);
  }
  const final: Layout = placed!;
  const diagnostics: LetteringDiagnostic[] = [];
  for (let i = 0; i < final.length; i++) {
    const p = final[i]!;
    const others = final.filter((_, j) => j !== i);
    const ev = evaluate(scene, p.unit, p.variant, p.at, others, LEVELS[p.level]!, firstOrder);
    const fallbacks: LetteringDiagnostic['fallbacks'] = [];
    if (p.level >= 1 && p.unit.breakBorder) fallbacks.push('breakBorder');
    if (p.level >= 2) fallbacks.push('coverAvoid');
    if (p.unit.variants[p.variant]!.reshaped) fallbacks.push('reshape');
    if (ev.hard > 0) {
      diagnostics.push({
        itemId: p.unit.id,
        panelIndex: panel.index,
        sourceStart: p.unit.sourceStart,
        sourceEnd: p.unit.sourceEnd,
        reasons: [...ev.reasons].sort(),
        fallbacks,
      });
    }
  }
  final.sort((a, b) => a.unit.order - b.unit.order);
  return { placed: final.map(({ ev: _ev, ...rest }) => rest), diagnostics };
}
