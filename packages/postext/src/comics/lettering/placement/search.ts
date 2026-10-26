// placeUnits: the greedy pass in reading order, then the passes that
// swap crossing tails, reorder, replace pairs and uncross tails (#1276:
// split out of placement.ts).
import { segmentDistance, dist } from '../geom.js';
import type { LetteringDiagnostic, Point, LetteringPanel } from '../types.js';
import { bestFor, LEVELS, better, type Choice, RESHAPE_COST, candidates, keepsOrder, ORDER_OVER_AVOID } from './candidates.js';
import { type Eval, evaluate, tailTargetOf, tailSegment, W } from './cost.js';
import { type Placed, type Scene, type PlaceUnit, sceneOf } from './scene.js';

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

/** The cheapest spot for `unit` that reads in order with the others, over
 *  all its shapes and fallback levels (see {@link keepsOrder}; covering an
 *  avoid zone pays as much more as in {@link orderBeforeAvoid}); undefined
 *  when there is none. */
function inOrder(scene: Scene, unit: PlaceUnit, others: readonly Placed[], firstOrder: number): Choice | undefined {
  const levels = LEVELS.map((_, i) => i).filter((i) => i === 0 || unit.breakBorder || i === 2);
  let best: (Choice & { score: number }) | undefined;
  for (const li of levels) {
    for (let vi = 0; vi < unit.variants.length; vi++) {
      const penalty = unit.variants[vi]!.reshaped ? RESHAPE_COST : 0;
      for (const at of candidates(scene, unit, vi)) {
        const terms: Record<string, number> = {};
        const ev = evaluate(scene, unit, vi, at, others, LEVELS[li]!, firstOrder, terms);
        if (!keepsOrder(ev, terms)) continue;
        const score = ev.soft + penalty + (ev.cover > 0 ? ORDER_OVER_AVOID : 0);
        if (!best || score < best.score - 1e-9) best = { variant: vi, level: li, at, ev, score };
      }
    }
  }
  return best && { variant: best.variant, level: best.level, at: best.at, ev: best.ev };
}

/** The layout with one balloon that reads out of order placed again over
 *  all its shapes and fallbacks, the others where they stand, when that
 *  lowers the whole layout's cost; else undefined. The improvement passes
 *  keep a balloon's shape and level, and a pair placed again has the later
 *  balloon alone first, in the room the earlier one needs: neither moves
 *  the first line of a pair above the hair of its speaker, in a shape a
 *  line deeper, ahead of the reply that already stands below it. */
function reorder(scene: Scene, placed: Layout, firstOrder: number): Layout | undefined {
  const base = totalCost(scene, placed, firstOrder);
  let best: Layout | undefined;
  let cost = base;
  for (let i = 0; i < placed.length; i++) {
    const p = placed[i]!;
    if (p.unit.pin || p.unit.position || p.unit.kind === 'sfx' || p.ev.order < W.orderBase) continue;
    const others = placed.filter((_, j) => j !== i);
    const c = inOrder(scene, p.unit, others, firstOrder);
    if (!c) continue;
    const out: Layout = placed.map((q, j) => (j === i ? { ...q, variant: c.variant, level: c.level, at: c.at, ev: c.ev } : q));
    // (Covering an avoid zone to read in order pays what `bestFor` asks;
    // the whole layout's cost counts the order on both balloons of a pair.)
    const t = totalCost(scene, out, firstOrder) + (c.ev.cover > 0 ? ORDER_OVER_AVOID : 0);
    if (t < cost - 1e-6) {
      cost = t;
      best = out;
    }
  }
  return best;
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

/** The search of {@link placeUnits}: greedy runs in a few orders and
 *  height biases, then pairs placed again; the cheapest layout. */
function search(scene: Scene, ordered: readonly PlaceUnit[], firstOrder: number, passes: number): { placed: Layout; cost: number } {
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
  // Balloons still read out of order placed again with every shape and
  // fallback open, the others where they stand.
  for (let round = 0; round < 2 && ordered.length > 1; round++) {
    const next = reorder(scene, placed!, firstOrder);
    if (!next) break;
    placed = solveFrom(scene, next, firstOrder, passes);
  }
  return { placed: placed!, cost: totalCost(scene, placed!, firstOrder) };
}

/** Height biases the solver is run with: a greedy pass that lifts every
 *  balloon higher first can leave room below for the later ones (the
 *  Kurlander order often wants the earlier balloons high); the layout with
 *  the lowest plain cost wins. */
const HEIGHT_BIASES = [1, 3, 7];

/** Place every unit of a panel (see the module comment). `extend`, when
 * given, adds spare variants to the units (see `letterPanelDetailed`):
 * a panel the first search leaves with a fault is searched again with
 * them, and the cheaper layout is kept. */
export function placeUnits(panel: LetteringPanel, units: readonly PlaceUnit[], passes = 3, extend?: () => boolean): PlacementResult {
  const scene = sceneOf(panel);
  const ordered = [...units].sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const firstOrder = ordered.find((u) => u.kind !== 'sfx' && u.kind !== 'note')?.order ?? Number.NaN;
  let { placed, cost } = search(scene, ordered, firstOrder, passes);
  if (cost >= 1000 && extend?.()) {
    const again = search(scene, ordered, firstOrder, passes);
    if (again.cost < cost - 1e-9) ({ placed, cost } = again);
  }
  const final: Layout = placed;
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
