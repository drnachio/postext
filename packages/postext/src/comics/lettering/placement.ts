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
  boundsOf, dist, insetConvex, nearestOnPolygon, norm, pointInConvex, pointInRect, rayExit, rectsOverlap, segmentHitsRect,
  segmentsCross, sub, add, scale,
} from './geom';
import type { Body } from './shapes';
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
  orderBase: 2,
  distance: 0.7,
  far: 0.18,
  below: 0.12,
  height: 0.1,
  start: 0.03,
  cross: 15,
  tailThrough: 20,
  tangent: 0.6,
  ownTail: 25,
  otherFace: 15,
  side: 0.25,
};

interface Level {
  breakBorder: boolean;
  coverAvoid: boolean;
}

interface Scene {
  panel: LetteringPanel;
  visible: Point[];
  visBox: Rect;
  /** The room a balloon breaking the border may take. */
  outer: Rect;
  faces: Rect[];
  avoid: Rect[];
  mouths: Point[];
  fwd: 1 | -1;
  /** Multiplier of the height preference (see `HEIGHT_BIASES`). */
  heightBias?: number;
}

function sceneOf(panel: LetteringPanel): Scene {
  let visible = insetConvex(panel.polygon, panel.insetPx);
  if (visible.length < 3) visible = panel.polygon.map((p) => ({ ...p }));
  const bleed = panel.bleedPx ?? panel.insetPx;
  const b = panel.bbox;
  return {
    panel,
    visible,
    visBox: boundsOf(visible),
    outer: { x: b.x - bleed, y: b.y - bleed, width: b.width + 2 * bleed, height: b.height + 2 * bleed },
    faces: panel.anchors.filter((a) => a.face).map((a) => a.face!),
    avoid: [...(panel.avoid ?? [])],
    mouths: panel.anchors.filter((a) => a.visible && a.id !== 'sfx').map((a) => a.mouth),
    fwd: panel.direction === 'rtl' ? -1 : 1,
  };
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
  const poly = panel.polygon;
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
  // Faces, avoid zones, mouths.
  for (const f of scene.faces) {
    if (!rectsOverlap(box, f)) continue;
    const a = coveredArea(samples, f, area);
    if (a > 0) {
      hard += (W.face * a) / em2 + W.face;
      reasons.add('face');
    }
  }
  for (const r of scene.avoid) {
    if (!rectsOverlap(box, r)) continue;
    const a = coveredArea(samples, r, area);
    if (a > 0) {
      if (level.coverAvoid) soft += (2 * a) / em2;
      else {
        hard += (W.avoid * a) / em2 + W.avoid;
        reasons.add('avoid');
      }
    }
  }
  const bodiesHere = v.bodies.map((b) => moved(b.core, at));
  for (const m of scene.mouths) {
    if (!pointInRect(m, box, 0.4 * em)) continue;
    if (bodiesHere.some((poly) => pointInConvex(m, poly) || dist(nearestOnPolygon(m, poly), m) < 0.4 * em)) {
      hard += W.anchor;
      reasons.add('anchor');
    }
  }
  // Outside the panel (the room past the border when breaking it).
  const rim = moved(v.rim, at);
  let out = 0;
  let farOut = 0;
  // A butted caption sits flush with the border itself.
  const area0 = unit.butt && unit.position ? scene.panel.polygon : scene.visible;
  for (const p of rim) {
    if (!pointInConvex(p, area0) && !(unit.butt && unit.position && dist(nearestOnPolygon(p, area0), p) < 1)) {
      out++;
      if (!pointInRect(p, scene.outer)) farOut++;
    }
  }
  if (unit.kind !== 'sfx' || out > 0) {
    if (level.breakBorder && unit.breakBorder) {
      if (farOut > 0) {
        hard += (W.outside * farOut) / rim.length + 10;
        reasons.add('outside');
      } else soft += (3 * out) / rim.length;
    } else if (out > 0) {
      hard += (W.outside * out) / rim.length + 10;
      reasons.add('outside');
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
        hard += (W.balloon * (inside / samples.length) * area) / em2 + W.balloon;
        reasons.add('balloon');
      } else soft += W.tangent;
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
      soft += W.orderBase + (W.order * (limit - lBox.y)) / em + (overlapX > 0 ? 1 : 0);
    }
    // Tails that cross, tails through another balloon.
    const otarget = tailTargetOf(o.unit, scene, o.at);
    if (target && otarget && segmentsCross(centre, target, o.at, otarget)) soft += W.cross;
    if (target && segmentHitsRect(edgePoint(v, at, target), target, shrink(obox, 0.15))) soft += W.tailThrough;
    if (otarget && segmentHitsRect(edgePoint(ov, o.at, otarget), otarget, shrink(box, 0.15))) soft += W.tailThrough;
  }
  // The tail leaves the first body clear of the group's other bodies.
  if (target && v.bodies.length > 1) {
    const edge = edgePoint(v, at, target);
    for (const b of v.bodies.slice(1)) if (segmentHitsRect(edge, target, movedRect(b.bbox, at))) soft += W.ownTail;
  }
  // Near the speaker, a little above; tails not over faces.
  if (target && unit.target.kind === 'point') {
    const edge = edgePoint(v, at, target);
    const gap = dist(edge, target);
    const h = v.bodies[0]!.bbox.height;
    // Room for a tail of a few ems: too close is worse than too far.
    const ideal = Math.max(2 * em, 0.7 * h);
    soft += gap < ideal ? (W.distance * (ideal - gap)) / em : (W.far * (gap - ideal)) / em;
    if (gap < 0.7 * em) soft += 3;
    if (centre.y > target.y) soft += (W.below * (centre.y - target.y)) / em;
    // A tail over another character's face reads as theirs.
    const tip = add(edge, scale(norm(sub(target, edge)), gap * 0.55));
    for (const f of scene.faces) {
      if (!segmentHitsRect(edge, tip, shrink(f, 0.1))) continue;
      soft += pointInRect(target, f) ? 1 : W.otherFace;
    }
  } else if (unit.target.kind === 'offPanel' && target) {
    soft += (W.side * dist(edgePoint(v, at, target), target)) / em;
  }
  if (unit.kind === 'sfx' && unit.near) soft += (0.5 * dist(centre, unit.near)) / em;
  // High in the panel; the first one in the top start corner.
  if (unit.kind !== 'sfx') {
    const top = box.y - scene.visBox.y;
    soft += ((scene.heightBias ?? 1) * (unit.kind === 'note' ? W.height * Math.max(0, scene.visBox.y + scene.visBox.height - (box.y + box.height)) : W.height * top)) / em;
    if (unit.order === firstOrder && unit.kind !== 'note') {
      const fromStart = scene.fwd === 1 ? box.x - scene.visBox.x : scene.visBox.x + scene.visBox.width - (box.x + box.width);
      soft += (W.start * fromStart) / em;
    }
  }
  return { hard, soft, reasons };
}

function shrink(r: Rect, f: number): Rect {
  return { x: r.x + r.width * f, y: r.y + r.height * f, width: r.width * (1 - 2 * f), height: r.height * (1 - 2 * f) };
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
export function positionAnchor(scene: Pick<Scene, 'visible' | 'panel' | 'fwd'>, v: UnitVariant, position: LetteringPosition, butt: boolean): Point {
  const poly = butt ? scene.panel.polygon : scene.visible;
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
  for (const vi of variants) {
    const levels = fixed ? [fixed.level] : LEVELS.map((_, i) => i).filter((i) => i === 0 || unit.breakBorder || i === 2);
    for (const li of levels) {
      const level = LEVELS[li]!;
      let best: Choice | undefined;
      const cands = unit.pin
        ? [pinAnchor(unit, vi)]
        : unit.position
          ? [positionAnchor(scene, unit.variants[vi]!, unit.position, unit.butt === true)]
          : candidates(scene, unit, vi);
      for (const at of cands) {
        const ev = evaluate(scene, unit, vi, at, others, level, firstOrder);
        if (!best || better(ev, best.ev)) best = { variant: vi, level: li, at, ev };
      }
      if (!best) continue;
      if (best.ev.hard === 0) return best;
      if (!fallback || better(best.ev, fallback.ev)) fallback = best;
    }
  }
  return fallback!;
}

/** The anchor that puts a pinned unit's box centre on its pin. */
function pinAnchor(unit: PlaceUnit, vi: number): Point {
  const v = unit.variants[vi]!;
  return { x: unit.pin!.x - (v.bbox.x + v.bbox.width / 2), y: unit.pin!.y - (v.bbox.y + v.bbox.height / 2) };
}

/** The result of placing a panel's units. */
export interface PlacementResult {
  placed: (Placed & { level: number })[];
  diagnostics: LetteringDiagnostic[];
}

type Layout = (Placed & { level: number; ev: Eval })[];

/** Greedy placement in reading order, then local improvement passes. */
function solve(scene: Scene, ordered: readonly PlaceUnit[], firstOrder: number, passes: number): Layout {
  const placed: Layout = [];
  // Corner and edge captions first, then pinned units, then the rest in
  // reading order.
  const rank = (u: PlaceUnit) => (u.position ? 0 : u.pin ? 1 : 2);
  const sequence = [...ordered].sort((a, b) => rank(a) - rank(b) || a.order - b.order);
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
  const placed: Layout = [...start];
  for (let pass = 0; pass < passes; pass++) {
    let changed = false;
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
  for (const bias of HEIGHT_BIASES) {
    let run = solve({ ...scene, heightBias: bias }, ordered, firstOrder, passes);
    // Settle under the plain weights.
    if (bias !== 1) run = solveFrom(scene, run, firstOrder, passes);
    const cost = totalCost(scene, run, firstOrder);
    if (cost < bestCost - 1e-9) {
      bestCost = cost;
      placed = run;
    }
  }
  placed = placed!;
  const diagnostics: LetteringDiagnostic[] = [];
  for (let i = 0; i < placed.length; i++) {
    const p = placed[i]!;
    const others = placed.filter((_, j) => j !== i);
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
  placed.sort((a, b) => a.unit.order - b.unit.order);
  return { placed: placed.map(({ ev: _ev, ...rest }) => rest), diagnostics };
}
