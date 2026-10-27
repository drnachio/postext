// The cost of a unit at one place: the weights, what it covers, how far
// it sits from its speaker, and where its tail runs (#1276: split out of
// placement.ts).
import { pointInRect, pointInConvex, norm, sub, rayExit, add, scale, nearestOnPolygon, rectsOverlap, dist, segmentHitsRect, segmentDistance, segmentsCross } from '../geom.js';
import { tailLength } from '../shapes.js';
import type { Point, Rect, LetteringForeignArt, LetteringPanel, PanelSide, LetteringDiagnostic } from '../types.js';
import { type UnitVariant, type PlaceUnit, type Scene, livePolygon, type Placed } from './scene.js';

export const W = {
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

export interface Level {
  breakBorder: boolean;
  coverAvoid: boolean;
}

/** How many times a balloon costs more over another character's figure
 *  than over its own speaker's (a letterer covers the speaker's shoulder
 *  before the one being spoken to). */
const OTHER_FIGURE = 4;

const moved = (pts: readonly Point[], at: Point): Point[] => pts.map((p) => ({ x: p.x + at.x, y: p.y + at.y }));
export const movedRect = (r: Rect, at: Point): Rect => ({ x: r.x + at.x, y: r.y + at.y, width: r.width, height: r.height });

/** Area of `rect` the samples (standing for `area` px²) fall in. */
function coveredArea(samples: readonly Point[], rect: Rect, area: number): number {
  let n = 0;
  for (const s of samples) if (pointInRect(s, rect)) n++;
  return (n / Math.max(1, samples.length)) * area;
}

/** Area of the ellipse `rect` holds the samples fall in. */
function coveredEllipse(samples: readonly Point[], rect: Rect, area: number): number {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const rx = rect.width / 2;
  const ry = rect.height / 2;
  let n = 0;
  for (const s of samples) if (((s.x - cx) / rx) ** 2 + ((s.y - cy) / ry) ** 2 <= 1) n++;
  return (n / Math.max(1, samples.length)) * area;
}

/** Whether a face fills a good part of its panel (a close shot): its box
 *  then has corners of hair a balloon may cover (in a long shot they are a
 *  few pixels beside the face). */
function closeShot(face: Rect, vis: Rect): boolean {
  return face.width >= 0.35 * vis.width || face.height >= 0.35 * vis.height;
}

/** Area of a face's box the samples fall in, less its top corners: above
 *  its middle a face is the oval its box holds (the corners are hair or
 *  background); below it, the whole box (cheeks, jaw and chin). */
function coveredOval(samples: readonly Point[], rect: Rect, area: number): number {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const rx = rect.width / 2;
  const ry = rect.height / 2;
  let n = 0;
  for (const s of samples) {
    if (!pointInRect(s, rect)) continue;
    if (s.y >= cy || ((s.x - cx) / rx) ** 2 + ((s.y - cy) / ry) ** 2 <= 1) n++;
  }
  return (n / Math.max(1, samples.length)) * area;
}

/** Area of a face or avoid zone of another panel the samples fall in:
 *  only what the page shows of it counts (inside its own panel, under no
 *  panel laid over that one). */
function coveredForeign(samples: readonly Point[], art: LetteringForeignArt, area: number): number {
  let n = 0;
  for (const s of samples) {
    if (!pointInRect(s, art.rect) || !pointInConvex(s, art.within)) continue;
    if (art.under?.some((poly) => pointInConvex(s, poly))) continue;
    n++;
  }
  return (n / Math.max(1, samples.length)) * area;
}

function areaOf(v: UnitVariant): number {
  // The bodies' boxes, as an ellipse fills them.
  return v.bodies.reduce((s, b) => s + b.bbox.width * b.bbox.height * 0.8, 0);
}

/** Where a unit's tail goes for the cost: the target point, or none. */
export function tailTargetOf(unit: PlaceUnit, scene: Scene, centre: Point): Point | undefined {
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

export interface Eval {
  hard: number;
  soft: number;
  reasons: Set<LetteringDiagnostic['reasons'][number]>;
  /** What of `soft` is reading order (a balloon read before the one it
   *  follows) and covering avoid zones (at the level that allows it). */
  order: number;
  cover: number;
  /** What of `cover` is over the avoid zones the art marks (not the
   *  guards the layout derives over heads). */
  coverArt: number;
}

/** Cost of `unit` (variant `vi`) at `at`, given the other placed units. */
export function evaluate(
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
  let order = 0;
  let cover = 0;
  let coverArt = 0;
  const S = (k: string, x: number) => {
    soft += x;
    if (k === 'order') order += x;
    else if (k === 'coverAvoid' || k === 'coverArt') cover += x;
    if (k === 'coverArt') coverArt += x;
    if (terms) terms[k] = (terms[k] ?? 0) + x;
  };
  if (v.cost) S('arrangement', v.cost);
  const H = (k: string, x: number) => {
    hard += x;
    if (terms) terms[`!${k}`] = (terms[`!${k}`] ?? 0) + x;
  };
  // Faces (in a close shot less the top corners of their boxes, hair or
  // background), avoid zones, mouths.
  for (const f of scene.faces) {
    if (!rectsOverlap(box, f)) continue;
    const a = closeShot(f, scene.visBox) ? coveredOval(samples, f, area) : coveredArea(samples, f, area);
    if (a > 0) {
      H('face', (W.face * a) / em2 + W.face);
      reasons.add('face');
    }
  }
  for (const r of scene.avoid) {
    if (!rectsOverlap(box, r)) continue;
    const a = coveredArea(samples, r, area);
    if (a > 0) {
      // (What the art marks costs three times what a guard over a head
      // does: a balloon touches the top of the hair before it covers a
      // hand the artist asked to keep clear.)
      if (level.coverAvoid) S(r.guard ? 'coverAvoid' : 'coverArt', ((r.guard ? 2 : 6) * a) / em2);
      else {
        H('avoid', (W.avoid * a) / em2 + W.avoid);
        reasons.add('avoid');
      }
    }
  }
  // What the other panels' pictures protect, for a balloon that leaves
  // its panel: their faces as its own, their avoid zones as its own (#671).
  for (const art of scene.foreignArt) {
    if (!rectsOverlap(box, art.rect)) continue;
    const a = coveredForeign(samples, art, area);
    if (a <= 0) continue;
    if (art.kind === 'face') {
      H('face', (W.face * a) / em2 + W.face);
      reasons.add('face');
    } else if (level.coverAvoid) S(art.guard ? 'coverAvoid' : 'coverArt', ((art.guard ? 2 : 6) * a) / em2);
    else {
      H('avoid', (W.avoid * a) / em2 + W.avoid);
      reasons.add('avoid');
    }
  }
  for (const r of scene.soft) {
    if (!rectsOverlap(box, r)) continue;
    const other = r.owner !== undefined && (r.contact === true || r.owner !== unit.speaker);
    S(other ? 'otherFigure' : 'softAvoid', ((r.weight ?? 1) * (other ? OTHER_FIGURE : 1) * W.soft * coveredArea(samples, r, area)) / em2);
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
  // past the border and the gutter: a little cost, never a fault — but
  // never off the sheet, and never into another panel's art unless it is
  // a sound effect or a `break` (drawn sound and a balloon breaking into
  // the next panel are both the letterer's call). Only a pin, drawn sound
  // or the `break` of a panel that bleeds leaves the live area: a balloon
  // left to the engine breaks into the gutter and the next panel, never
  // into the margin.
  const rim = moved(v.rim, at);
  const intended = unit.pin !== undefined || (level.breakBorder && unit.breakBorder === true);
  const edge = !intended ? scene.limit
    : unit.kind === 'sfx' ? scene.edgeSfx ?? scene.limit
    : unit.pin !== undefined || scene.bleeds ? scene.edge ?? scene.limit
    : scene.limit ?? scene.edge;
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
    } else if (scene.over.some((poly) => pointInConvex(p, poly))) {
      // Over an inset laid on this panel: out of the panel, in another's
      // (#671).
      out++;
      intrude++;
    }
  }
  const mayIntrude = intended && (unit.kind === 'sfx' || unit.breakBorder === true);
  // Off the sheet is the worst; into another panel (its art, its
  // lettering) a fault weighed against the others — a balloon poking into
  // the next panel reads better than one over its speaker's face.
  if (offPage > 0) {
    H('offPage', (12 * W.outside * offPage) / rim.length + 200);
    reasons.add('outside');
  }
  if (intrude > 0 && !mayIntrude) {
    H('neighbour', (4 * W.outside * intrude) / rim.length + 40);
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
      const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      if (unit.kind !== 'sfx' && !unit.pin && (!pointInConvex(middle, scene.live) || scene.over.some((poly) => pointInConvex(middle, poly)))) {
        H('outside', W.outside * f + 10);
        reasons.add('outside');
      }
    }
  } else if (out > 0) {
    H('outside', (W.outside * out) / rim.length + 10);
    reasons.add('outside');
  }
  // The fold of a spread: never, at any level, pinned or not.
  for (const r of scene.keepOut) {
    if (!rectsOverlap(box, r)) continue;
    const ox = Math.min(box.x + box.width, r.x + r.width) - Math.max(box.x, r.x);
    H('avoid', (W.avoid * 4 * ox) / em + 4 * W.avoid);
    reasons.add('avoid');
  }
  // Balloons of the other panels (a balloon breaking into this one).
  for (const r of scene.foreign) {
    if (!rectsOverlap(box, r, 0.3 * em)) continue;
    // (An oval, a cloud or a burst is taken as the oval its box holds: the
    // corners of the box are no part of it. This unit's own outline, where
    // it grows past its core, the spikes of a burst, counts by its points.)
    const g = grow(r, 0.3 * em);
    const a = (r.round ? coveredEllipse(samples, g, area) : coveredArea(samples, g, area))
      || (r.round ? coveredEllipse(rim, r, em2) : coveredArea(rim, r, em2));
    if (a > 0) {
      H('balloon', (W.balloon * a) / em2 + W.balloon);
      reasons.add('balloon');
    }
  }
  // Other balloons: overlap is a fault, a near miss (a tangent) a blemish.
  const centre = at;
  const target = tailTargetOf(unit, scene, centre);
  // Where the tail leaves the body, and the tail as drawn: once for all
  // the terms below (each is a ray cast against the body's outline).
  const leave = target ? edgePoint(v, at, target) : undefined;
  const mine = target && leave ? tailFrom(unit, leave, target) : undefined;
  // The tails of the other panels' balloons are theirs too: no body over
  // one, and no tail of this panel through a balloon of another (#671).
  for (const [a, b] of scene.foreignTails) {
    if (throughBody(a, b, v, at)) {
      H('foreignTail', W.balloon);
      reasons.add('balloon');
    }
  }
  if (mine && scene.foreign.length > 0) {
    if (scene.foreign.some((r) => segmentHitsRect(mine[0], mine[1], shrink(r, 0.12)))) {
      H('tailThroughForeign', W.balloon);
      reasons.add('balloon');
    }
  }
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
    const other = tailOf(scene, o);
    const otarget = other?.target;
    const theirs = other?.drawn;
    if (mine && theirs) {
      // Crossing tails; tails that all but touch read as crossed too
      // (unless they run to one speaker).
      const gapTails = segmentDistance(mine[0], mine[1], theirs[0], theirs[1]);
      if (gapTails === 0) S('cross', W.cross);
      else if (gapTails < 0.6 * em && dist(target!, otarget!) > em) S('cross', 0.4 * W.cross);
    }
    // A tail through another body covers its lettering as a balloon over
    // it would: a fault (#672). Through the corner of its box, clear of its
    // outline, a cost.
    for (const [tail, w, p] of [[mine, ov, o.at], [theirs, v, at]] as const) {
      if (!tail) continue;
      if (throughBody(tail[0], tail[1], w, p)) {
        H('tailThrough', W.balloon);
        reasons.add('balloon');
      } else if (w.bodies.some((b) => segmentHitsRect(tail[0], tail[1], shrink(movedRect(b.bbox, p), 0.12)))) S('tailThrough', W.tailThrough);
    }
  }
  // The tail leaves the first body clear of the group's other bodies, by
  // more than its own half width: a tail grazing another body of its group
  // leaves a notch between them that the doubled outline fills with ink.
  if (target && leave && v.bodies.length > 1) {
    for (const b of v.bodies.slice(1)) if (segmentHitsRect(leave, target, grow(movedRect(b.bbox, at), 0.8 * em))) S('ownTail', W.ownTail);
  }
  // Near the speaker, a little above; tails not over faces.
  if (target && leave && mine && unit.target.kind === 'point') {
    const gap = dist(leave, target);
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
    const tip = add(leave, scale(norm(sub(target, leave)), gap * 0.55));
    for (const f of scene.faces) {
      const head = { x: f.x, y: f.y - 0.3 * f.height, width: f.width, height: 1.3 * f.height };
      if (!segmentHitsRect(leave, tip, shrink(head, 0.1))) continue;
      S('otherFace', pointInRect(target, head) ? 1 : W.otherFace);
    }
    // A tail drawn across another figure (the body under a marked face):
    // the eye follows it through the wrong character.
    const drawn = mine;
    const figureOf = (f: Rect): Rect => ({ x: f.x - 0.2 * f.width, y: f.y + f.height, width: 1.4 * f.width, height: 1.6 * f.height });
    for (const a of scene.panel.anchors) {
      if (!a.face || a.mouth === target || a.head === target) continue;
      if (segmentHitsRect(drawn[0], drawn[1], figureOf(a.face))) S('tailOverFigure', W.tailOverFigure);
    }
    // And across a bystander's (#726), unless the tail is aimed at them
    // (`to=` on a point of their face or figure).
    for (const f of scene.panel.faces ?? []) {
      const figure = figureOf(f);
      if (pointInRect(target, f) || pointInRect(target, figure)) continue;
      if (segmentHitsRect(drawn[0], drawn[1], figure)) S('tailOverFigure', W.tailOverFigure);
    }
  } else if (unit.target.kind === 'offPanel' && target && leave) {
    // An off-panel speaker's balloon sits by the border its voice comes
    // from, with a short tail to it (the letterer's practice): a tail
    // across the panel reads as an arrow, so the balloon moves instead.
    const reach = dist(leave, target);
    S('side', (W.side * Math.max(0, reach - 1.2 * em) + 3 * W.side * Math.max(0, reach - 3 * em)) / em);
  }
  if (unit.kind === 'sfx' && unit.near) S('sfxNear', (0.5 * dist(centre, unit.near)) / em);
  // High in the panel; the first one in the top start corner. (A unit set
  // at a corner or an edge has its place: a caption at the foot of a panel
  // is not drawn to the top of it.)
  if (unit.kind !== 'sfx' && !unit.position) {
    const top = box.y - scene.visBox.y;
    S('height', ((scene.heightBias ?? 1) * (unit.kind === 'note' ? W.height * Math.max(0, scene.visBox.y + scene.visBox.height - (box.y + box.height)) : W.height * top)) / em);
    if (unit.order === firstOrder && unit.kind !== 'note') {
      const fromStart = scene.fwd === 1 ? box.x - scene.visBox.x : scene.visBox.x + scene.visBox.width - (box.x + box.width);
      S('start', (W.start * fromStart) / em);
    }
  }
  return { hard, soft, reasons, order, cover, coverArt };
}

/** Whether the segment a–b runs through a body of `v` at `at`: across
 *  its outline (the spikes of a burst and the bumps of a cloud are part of
 *  it; a turned or leaned sound effect's is its turned box) or inside it. */
function throughBody(a: Point, b: Point, v: UnitVariant, at: Point): boolean {
  if (!segmentHitsRect(a, b, movedRect(v.bbox, at))) return false;
  const turned = (v.rotate || v.skew) && v.bodies.length === 1;
  return v.bodies.some((body) => {
    const outline = moved(turned ? v.rim : body.hull, at);
    for (let i = 0; i < outline.length; i++) {
      if (segmentsCross(a, b, outline[i]!, outline[(i + 1) % outline.length]!)) return true;
    }
    return !turned && pointInConvex(a, moved(body.core, at));
  });
}

/** A rectangle grown by `d` px on every side. */
function grow(r: Rect, d: number): Rect {
  return { x: r.x - d, y: r.y - d, width: r.width + 2 * d, height: r.height + 2 * d };
}

function shrink(r: Rect, f: number): Rect {
  return { x: r.x + r.width * f, y: r.y + r.height * f, width: r.width * (1 - 2 * f), height: r.height * (1 - 2 * f) };
}

/** The tail of a placed unit, kept with it: a unit that stays where it is
 *  is asked for its tail at every spot tried for the others. (A placed
 *  unit is never changed in place; a move makes a new one.) */
const tailsOf = new WeakMap<Placed, { target: Point; drawn: [Point, Point] } | null>();

function tailOf(scene: Scene, o: Placed): { target: Point; drawn: [Point, Point] } | undefined {
  let t = tailsOf.get(o);
  if (t === undefined) {
    const target = tailTargetOf(o.unit, scene, o.at);
    t = target ? { target, drawn: tailSegment(o.unit, o.unit.variants[o.variant]!, o.at, target) } : null;
    tailsOf.set(o, t);
  }
  return t ?? undefined;
}

/** A unit's tail as drawn, for the cost: from where it leaves the first
 *  body to its tip ({@link tailLength} of the gap). */
export function tailSegment(unit: PlaceUnit, v: UnitVariant, at: Point, target: Point): [Point, Point] {
  return tailFrom(unit, edgePoint(v, at, target), target);
}

/** The same from the point the tail leaves the body at. */
function tailFrom(unit: PlaceUnit, edge: Point, target: Point): [Point, Point] {
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
