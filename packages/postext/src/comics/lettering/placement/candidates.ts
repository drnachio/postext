// The candidate centres of a unit, anchored and pinned positions, and the
// best of them at each fallback level, reading order before avoid zones
// (#1276: split out of placement.ts).
import { boundsOf, pointInConvex, dist, nearestOnPolygon, rectsOverlap } from '../geom.js';
import type { Point, LetteringPosition } from '../types.js';
import { movedRect, type Level, type Eval, evaluate, W } from './cost.js';
import type { PlaceUnit, Scene, UnitVariant, Placed } from './scene.js';

/** The candidates of each unit's variants: they depend on the unit and
 *  the panel alone, and the search asks for them at every step. */
const candidatesOf = new WeakMap<PlaceUnit, Map<number, Point[]>>();

/** Candidate anchor positions of a unit (deterministic order). */
export function candidates(scene: Scene, unit: PlaceUnit, vi: number): Point[] {
  let byVariant = candidatesOf.get(unit);
  if (!byVariant) candidatesOf.set(unit, (byVariant = new Map()));
  let list = byVariant.get(vi);
  if (!list) byVariant.set(vi, (list = candidatesFresh(scene, unit, vi)));
  return list;
}

function candidatesFresh(scene: Scene, unit: PlaceUnit, vi: number): Point[] {
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
    // Under the speaker (a last resort the cost weighs: in a cell with no
    // room above the head, below it beats over the face).
    if (unit.kind !== 'sfx') {
      for (const k of [1.2, 2.4]) {
        for (const fx of [0, -0.45, 0.45]) push(at(target.x + fx * w, target.y + h / 2 + k * em));
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
export function positionAnchor(scene: Pick<Scene, 'visible' | 'panel' | 'fwd' | 'buttPoly'>, v: UnitVariant, position: LetteringPosition, butt: boolean, along?: number): Point {
  const poly = butt ? scene.buttPoly : scene.visible;
  const box = boundsOf(poly);
  const startLeft = scene.fwd === 1;
  // `along`: where on its edge (0 left, 1 right) instead of the keyword's.
  const hx = along !== undefined ? along : position === 'top' || position === 'bottom' ? 0.5
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
 *  balloon — the other corner of that edge, the middle of it, the spots
 *  along it just clear of what it would cover (between two heads), and
 *  only then the corners of the opposite edge: a caption at the head of a
 *  panel (a strip's title) stays at its head when there is room there. */
function positionAnchors(scene: Scene, v: UnitVariant, position: LetteringPosition, butt: boolean): { at: Point; extra: number }[] {
  const top = position.startsWith('top');
  const across: LetteringPosition = position.endsWith('start') ? (top ? 'top-end' : 'bottom-end') : position.endsWith('end') ? (top ? 'top-start' : 'bottom-start') : (top ? 'top-start' : 'bottom-start');
  const middle: LetteringPosition = top ? 'top' : 'bottom';
  const flip = (q: LetteringPosition): LetteringPosition => (q.startsWith('top') ? q.replace('top', 'bottom') : q.replace('bottom', 'top')) as LetteringPosition;
  const list: [LetteringPosition, number][] = [[position, 0], [across, 2], [middle, 3], [flip(position), 5], [flip(across), 6]];
  const seen = new Set<LetteringPosition>();
  const out = list.filter(([q]) => (seen.has(q) ? false : (seen.add(q), true))).map(([q, extra]) => ({ at: positionAnchor(scene, v, q, butt), extra }));
  // Along the edge: the box butted against each side of every face or
  // avoid zone in the edge's band, nearer its own corner first.
  const own = positionAnchor(scene, v, position, butt);
  const band = movedRect(v.bbox, own);
  const span = boundsOf(butt ? scene.buttPoly : scene.visible);
  const free = span.width - v.bbox.width;
  if (free > 0) {
    const ownX = band.x;
    for (const r of [...scene.faces, ...scene.avoid]) {
      if (r.y > band.y + band.height || r.y + r.height < band.y) continue;
      for (const x of [r.x + r.width + 1, r.x - v.bbox.width - 1]) {
        const f = (x - span.x) / free;
        if (f <= 0 || f >= 1) continue;
        out.push({ at: positionAnchor(scene, v, position, butt, f), extra: 3.5 + Math.abs(x - ownX) / span.width });
      }
    }
  }
  return out;
}

export const LEVELS: Level[] = [
  { breakBorder: false, coverAvoid: false },
  { breakBorder: true, coverAvoid: false },
  { breakBorder: true, coverAvoid: true },
];

export interface Choice {
  variant: number;
  level: number;
  at: Point;
  ev: Eval;
}

export function better(a: Eval, b: Eval): boolean {
  if (a.hard > 0 || b.hard > 0) return a.hard * 1000 + a.soft < b.hard * 1000 + b.soft - 1e-9;
  return a.soft < b.soft - 1e-9;
}

/** Best spot for one unit given the others, over its variants and the
 *  fallback levels (in SPEC order); the first clean choice wins. */
export function bestFor(scene: Scene, unit: PlaceUnit, others: readonly Placed[], firstOrder: number, fixed?: { variant: number; level: number }): Choice {
  let fallback: Choice | undefined;
  const variants = fixed ? [fixed.variant] : unit.variants.map((_, i) => i);
  const levels = fixed ? [fixed.level] : LEVELS.map((_, i) => i).filter((i) => i === 0 || unit.breakBorder || i === 2);
  // Every arrangement of a joined group competes on its cost; a reshaped
  // text block (wider or narrower than its best shape) pays a little for
  // its poorer shape, and is tried before covering an avoid zone (a
  // letterer reshapes the text before covering a hand).
  const penalty = (vi: number) => (unit.variants[vi]!.reshaped ? RESHAPE_COST : 0);
  // Whether any spot tried at the level before met an avoid zone: when
  // none did, a level that only adds covering them finds the same spots at
  // the same costs, and is not searched again.
  const breaks = (l: Level) => l.breakBorder && unit.breakBorder === true;
  let before: { breaks: boolean; metAvoid: boolean } | undefined;
  for (const li of levels) {
    const level = LEVELS[li]!;
    if (level.coverAvoid && before && !before.metAvoid && before.breaks === breaks(level)) continue;
    let metAvoid = false;
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
        if (ev.reasons.has('avoid')) metAvoid = true;
        const score = ev.hard * 1000 + ev.soft + penalty(vi) + extra;
        if (!best || score < best.score - 1e-9) best = { variant: vi, level: li, at, ev, score };
      }
    }
    before = { breaks: breaks(level), metAvoid: metAvoid || level.coverAvoid };
    if (!best) continue;
    const choice: Choice = { variant: best.variant, level: best.level, at: best.at, ev: best.ev };
    if (choice.ev.hard === 0) return fixed || li !== 0 ? choice : orderBeforeAvoid(scene, unit, others, firstOrder, best, penalty);
    if (!fallback || better(choice.ev, fallback.ev)) fallback = choice;
  }
  return fallback!;
}

/** What taking the last fallback (covering an avoid zone a little) to keep
 *  the reading order costs on top of the cover itself. */
export const ORDER_OVER_AVOID = 4;
/** The most a balloon may cover of avoid zones (as their cost: 2 per em²
 *  of a guard over a head, 6 of a zone the art marks) to keep the reading
 *  order: the top of the hair over a face, the edge of a hat; of what the
 *  art marks, hardly a corner. */
const ORDER_COVER_MAX = 16;
const ORDER_COVER_ART_MAX = 6;

/** Whether a spot (its evaluation and cost terms) may stand in for one
 *  that reads out of order: clean, in order, covering no more of avoid
 *  zones than the caps, and its tail off the other faces (a tail across
 *  another character's face reads as theirs, worse than a line read
 *  late). */
export function keepsOrder(ev: Eval, terms: Record<string, number>): boolean {
  return ev.hard === 0 && ev.order < W.orderBase && ev.cover <= ORDER_COVER_MAX && ev.coverArt <= ORDER_COVER_ART_MAX
    && (terms.otherFace ?? 0) < W.otherFace;
}

/** A clean choice that reads out of order (the balloon above the one it
 *  answers, or beside it on the wrong side) against the same unit covering
 *  a little of an avoid zone in reading order: a letterer lets a balloon
 *  touch the top of a head before setting a reply ahead of its line. */
function orderBeforeAvoid(
  scene: Scene, unit: PlaceUnit, others: readonly Placed[], firstOrder: number,
  best: Choice & { score: number }, penalty: (vi: number) => number,
): Choice {
  const plain: Choice = { variant: best.variant, level: best.level, at: best.at, ev: best.ev };
  if (best.ev.order < W.orderBase || unit.pin || unit.position) return plain;
  const level = LEVELS[2]!;
  let alt: (Choice & { score: number }) | undefined;
  for (let vi = 0; vi < unit.variants.length; vi++) {
    for (const at of candidates(scene, unit, vi)) {
      const terms: Record<string, number> = {};
      const ev = evaluate(scene, unit, vi, at, others, level, firstOrder, terms);
      if (!keepsOrder(ev, terms)) continue;
      const score = ev.soft + penalty(vi) + ORDER_OVER_AVOID;
      if (!alt || score < alt.score - 1e-9) alt = { variant: vi, level: 2, at, ev, score };
    }
  }
  return alt && alt.score < best.score - 1e-9 ? { variant: alt.variant, level: alt.level, at: alt.at, ev: alt.ev } : plain;
}

/** What choosing a reshaped text block costs (its poorer shape). */
export const RESHAPE_COST = 1.5;

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
  const out = dx === 0 && dy === 0 ? [p] : [p, { x: p.x + dx, y: p.y + dy }];
  // Off the fold of a spread, to the nearer side (then the other).
  for (const q of [...out]) {
    const b = movedRect(v.bbox, q);
    for (const r of scene.keepOut) {
      if (!rectsOverlap(b, r)) continue;
      const left = r.x - (b.x + b.width) - 1;
      const right = r.x + r.width - b.x + 1;
      const sides = Math.abs(left) <= Math.abs(right) ? [left, right] : [right, left];
      for (const d of sides) out.push({ x: q.x + d, y: q.y });
    }
  }
  return out;
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
