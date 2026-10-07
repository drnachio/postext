// Balloon outlines (SPEC D3.2), built around the text block already set:
// the text's ink, grown by a constant air, is what the body must hold.
// Every outline is a list of path commands in page px (M L C Z), and a
// polygon (`hull`) that stands for it in the geometry (tail exits,
// collisions, bounds). Jitter (burst spikes, cloud scallops, wobble) is
// seeded from the balloon id.
//
// Paint model (Comicraft's layer method): a group's outline is one
// compound path — bodies, tails, necks — stroked at twice the stroke width
// and then filled, so overlapping subpaths merge into one outline with no
// path booleans. Every tail and neck therefore starts inside its body.

import {
  add, boundsOf, circleCmds, dist, lerp, norm, perp, polygonCmds, rayExit, resampleClosed, roundedRectCmds,
  scale, seededRandom, smoothClosedCmds, smoothOpenCmds, sub, hashString, perimeter, translateCmds,
  type PathCmd,
} from './geom';
import type { LetteringStyle, Point, Rect } from './types';

/** A balloon body: its outline, the polygon standing for it, its box. */
export interface Body {
  cmds: PathCmd[];
  /** Outer outline as a polygon (the tips of a burst, the bumps of a
   *  cloud), clockwise on the page. */
  hull: Point[];
  /** The smooth core the decoration grows from (the valleys of a burst or
   *  a cloud); the hull itself for plain shapes. Tails leave from it. */
  core: Point[];
  bbox: Rect;
  centre: Point;
  /** Lengths that shape the tail (em of the text). */
  em: number;
  /** Superellipse semi-axes of the core, when it is one. */
  axes?: { a: number; b: number };
}

/** A shape's parameters as the body builder reads them. */
interface BodyParams {
  ink: readonly Rect[];
  em: number;
  style: LetteringStyle;
  seed: string;
}

/** Samples of the corners of `ink` rects grown by `air` with round corners
 *  (the Minkowski sum with a disc): what an outline must hold. */
function airPoints(ink: readonly Rect[], air: number): Point[] {
  const out: Point[] = [];
  const steps = 6;
  for (const r of ink) {
    const corners: [Point, number][] = [
      [{ x: r.x + r.width, y: r.y }, -Math.PI / 2],
      [{ x: r.x + r.width, y: r.y + r.height }, 0],
      [{ x: r.x, y: r.y + r.height }, Math.PI / 2],
      [{ x: r.x, y: r.y }, Math.PI],
    ];
    for (const [c, a0] of corners) {
      for (let k = 0; k <= steps; k++) {
        const a = a0 + (k / steps) * (Math.PI / 2);
        out.push({ x: c.x + air * Math.cos(a), y: c.y + air * Math.sin(a) });
      }
    }
  }
  return out;
}

/** The smallest-area superellipse `|x/a|^n + |y/b|^n <= 1` about `c` that
 *  holds every point. */
export function fitSuperellipse(points: readonly Point[], c: Point, n: number): { a: number; b: number } {
  let maxDx = 0;
  let maxDy = 0;
  for (const p of points) {
    maxDx = Math.max(maxDx, Math.abs(p.x - c.x));
    maxDy = Math.max(maxDy, Math.abs(p.y - c.y));
  }
  maxDx = Math.max(maxDx, 1);
  maxDy = Math.max(maxDy, 1);
  let best = { a: maxDx * 2, b: maxDy * 2, area: Number.POSITIVE_INFINITY };
  const b0 = maxDy * 1.0005;
  for (let i = 0; i <= 90; i++) {
    const b = b0 * Math.pow(4, i / 90);
    let a = 0;
    for (const p of points) {
      const t = 1 - Math.pow(Math.abs(p.y - c.y) / b, n);
      if (t <= 1e-9) {
        a = Number.POSITIVE_INFINITY;
        break;
      }
      a = Math.max(a, Math.abs(p.x - c.x) / Math.pow(t, 1 / n));
    }
    if (a * b < best.area) best = { a, b, area: a * b };
  }
  return { a: best.a, b: best.b };
}

/** Points of a superellipse, clockwise on the page from its right end,
 *  each pushed out by `wobble(t)` of its radius. */
function superellipsePoints(c: Point, a: number, b: number, n: number, count: number, wobble?: (t: number) => number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2;
    const ct = Math.cos(t);
    const st = Math.sin(t);
    const k = wobble ? 1 + wobble(t) : 1;
    out.push({
      x: c.x + k * a * Math.sign(ct) * Math.pow(Math.abs(ct), 2 / n),
      y: c.y + k * b * Math.sign(st) * Math.pow(Math.abs(st), 2 / n),
    });
  }
  return out;
}

/** A seeded low-frequency wobble: a sum of three sines, `amount` of the
 *  radius at most. */
function wobbleOf(seed: string, amount: number): ((t: number) => number) | undefined {
  if (!amount) return undefined;
  const rnd = seededRandom(hashString(`${seed}#wobble`));
  const waves = [2, 3, 5].map((k) => ({ k, phase: rnd() * Math.PI * 2, amp: (0.5 + rnd() * 0.5) / k }));
  const total = waves.reduce((s, w) => s + w.amp, 0);
  return (t) => (amount * waves.reduce((s, w) => s + w.amp * Math.sin(w.k * t + w.phase), 0)) / total;
}

function inkCentre(ink: readonly Rect[]): Point {
  const b = boundsOf(ink.flatMap((r) => [{ x: r.x, y: r.y }, { x: r.x + r.width, y: r.y + r.height }]));
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

function inkBounds(ink: readonly Rect[]): Rect {
  return boundsOf(ink.flatMap((r) => [{ x: r.x, y: r.y }, { x: r.x + r.width, y: r.y + r.height }]));
}

/** The core superellipse of an oval-like body: air all round, `extra` more
 *  for the decoration that grows inward (none: decorations grow out). */
function coreEllipse(p: BodyParams, extra = 0): { c: Point; a: number; b: number; n: number } {
  const n = p.style.roundness ?? 2.2;
  const c = inkCentre(p.ink);
  const { a, b } = fitSuperellipse(airPoints(p.ink, p.style.padding + extra), c, n);
  return { c, a, b, n };
}

function finish(cmds: PathCmd[], hull: Point[], core: Point[], em: number, centre: Point, axes?: { a: number; b: number }): Body {
  return { cmds, hull, core, bbox: boundsOf(hull), centre, em, ...(axes ? { axes } : {}) };
}

/** Build the body of a balloon around its text's ink (`ink`, page px). */
export function buildBody(ink: readonly Rect[], em: number, style: LetteringStyle, seed: string): Body {
  const p: BodyParams = { ink, em, style, seed };
  switch (style.shape) {
    case 'rectangle':
    case 'rounded':
    case 'none':
      return rectBody(p);
    case 'cloud':
      return cloudBody(p);
    case 'burst':
      return burstBody(p);
    case 'wavy':
      return wavyBody(p);
    case 'electric':
      return electricBody(p);
    default:
      return ovalBody(p);
  }
}

function ovalBody(p: BodyParams): Body {
  const { c, a, b, n } = coreEllipse(p);
  const wob = wobbleOf(p.seed, p.style.wobble ?? 0);
  const pts = superellipsePoints(c, a, b, n, 72, wob);
  return finish(smoothClosedCmds(pts), pts, pts, p.em, c, { a, b });
}

function rectBody(p: BodyParams): Body {
  const ib = inkBounds(p.ink);
  const air = p.style.shape === 'none' ? Math.max(0, p.style.halo ?? 0) : p.style.padding;
  const r: Rect = { x: ib.x - air, y: ib.y - air, width: ib.width + 2 * air, height: ib.height + 2 * air };
  const hull = [{ x: r.x, y: r.y }, { x: r.x + r.width, y: r.y }, { x: r.x + r.width, y: r.y + r.height }, { x: r.x, y: r.y + r.height }];
  const centre = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  if (p.style.shape === 'none') return finish([], hull, hull, p.em, centre);
  const radius = p.style.shape === 'rounded' ? (p.style.radius ?? Math.min(0.6 * p.em, r.height / 2)) : 0;
  return finish(roundedRectCmds(r, radius), hull, hull, p.em, centre);
}

/** A thought cloud: scallops bulging out of a core superellipse whose
 *  valleys keep the air. */
function cloudBody(p: BodyParams): Body {
  const { c, a, b, n } = coreEllipse(p);
  const core = superellipsePoints(c, a, b, n, 96);
  const rnd = seededRandom(hashString(`${p.seed}#cloud`));
  const per = perimeter(core);
  const count = Math.max(7, Math.round(per / (1.9 * p.em)));
  const valleys = resampleClosed(core, count, rnd());
  // Jitter the valleys along the outline a little (seeded).
  const jittered = valleys.map((v, i) => {
    const next = valleys[(i + 1) % count]!;
    return { p: lerp(v.p, next.p, (rnd() - 0.5) * 0.25), n: v.n };
  });
  const cmds: PathCmd[] = [{ op: 'M', pts: [jittered[0]!.p] }];
  const hull: Point[] = [];
  for (let i = 0; i < count; i++) {
    const v0 = jittered[i]!.p;
    const v1 = jittered[(i + 1) % count]!.p;
    const chord = dist(v0, v1);
    const mid = lerp(v0, v1, 0.5);
    // Outward: away from the centre, through the chord's middle.
    const out = norm(sub(mid, c));
    const h = chord * (0.36 + rnd() * 0.12);
    const t = norm(sub(v1, v0));
    const c1 = add(add(v0, scale(out, h * 1.25)), scale(t, -chord * 0.06));
    const c2 = add(add(v1, scale(out, h * 1.25)), scale(t, chord * 0.06));
    cmds.push({ op: 'C', pts: [c1, c2, v1] });
    hull.push(v0, add(mid, scale(out, h * 0.95)));
  }
  cmds.push({ op: 'Z', pts: [] });
  return finish(cmds, hull, core, p.em, c, { a, b });
}

/** A burst: spikes all pointing away from the centre, of seeded length,
 *  between valleys on a core superellipse. */
function burstBody(p: BodyParams): Body {
  const { c, a, b, n } = coreEllipse(p);
  const core = superellipsePoints(c, a, b, n, 96);
  const rnd = seededRandom(hashString(`${p.seed}#burst`));
  const per = perimeter(core);
  const count = p.style.burstPoints && p.style.burstPoints >= 5
    ? Math.round(p.style.burstPoints)
    : Math.max(9, Math.min(26, Math.round(per / (2.1 * p.em))));
  const depth = p.style.burstDepth ?? (p.style.burstDepthRatio ? p.style.burstDepthRatio * (a + b) / 2 : 1.1 * p.em);
  const valleys = resampleClosed(core, count, rnd());
  const pts: Point[] = [];
  for (let i = 0; i < count; i++) {
    const v0 = valleys[i]!;
    const v1 = valleys[(i + 1) % count]!;
    pts.push(v0.p);
    const mid = lerp(v0.p, v1.p, 0.35 + rnd() * 0.3);
    const radial = norm(sub(mid, c));
    const dir = norm(add(radial, scale(norm(add(v0.n, v1.n)), 0.6)));
    pts.push(add(mid, scale(dir, depth * (0.55 + rnd() * 0.9))));
  }
  return finish(polygonCmds(pts), pts, core, p.em, c, { a, b });
}

/** A wavy (deflated, wobbly) outline: a slow wave on the core. */
function wavyBody(p: BodyParams): Body {
  const amp = 0.16 * p.em;
  const { c, a, b, n } = coreEllipse(p);
  const core = superellipsePoints(c, a, b, n, 96);
  const per = perimeter(core);
  const waves = Math.max(6, Math.round(per / (1.7 * p.em)));
  const samples = resampleClosed(core, waves * 8);
  const pts = samples.map((s, i) => add(s.p, scale(s.n, amp * (1 + Math.sin((i / 8) * Math.PI * 2)))));
  return finish(smoothClosedCmds(pts), pts, core, p.em, c, { a, b });
}

/** An electric (radio, phone) outline: an even zig-zag on the core. */
function electricBody(p: BodyParams): Body {
  const amp = 0.24 * p.em;
  const { c, a, b, n } = coreEllipse(p);
  const core = superellipsePoints(c, a, b, n, 96);
  const per = perimeter(core);
  const count = Math.max(24, 2 * Math.round(per / (0.9 * p.em)));
  const samples = resampleClosed(core, count);
  const pts = samples.map((s, i) => add(s.p, scale(s.n, i % 2 === 0 ? 0 : amp)));
  return finish(polygonCmds(pts), pts, core, p.em, c, { a, b });
}

/** A body moved by (dx, dy). */
export function translateBody(body: Body, dx: number, dy: number): Body {
  const mv = (q: Point) => ({ x: q.x + dx, y: q.y + dy });
  return {
    ...body,
    cmds: translateCmds(body.cmds, dx, dy),
    hull: body.hull.map(mv),
    core: body.core.map(mv),
    bbox: { ...body.bbox, x: body.bbox.x + dx, y: body.bbox.y + dy },
    centre: mv(body.centre),
  };
}

/** Where the ray from the body's centre toward `toward` leaves `poly`, and
 *  the outward normal there. */
function exitOf(body: Body, poly: readonly Point[], toward: Point): { p: Point; n: Point } | undefined {
  const u = norm(sub(toward, body.centre));
  const t = rayExit(body.centre, u, poly);
  if (t === undefined) return undefined;
  const p = add(body.centre, scale(u, t));
  // Normal: from the outline around the exit (a chord of the polygon).
  let best = 0;
  let bestD = Number.POSITIVE_INFINITY;
  for (let i = 0; i < poly.length; i++) {
    const d = dist(poly[i]!, p);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  const a = poly[(best - 2 + poly.length) % poly.length]!;
  const b = poly[(best + 2) % poly.length]!;
  const e = norm(sub(b, a));
  let n = { x: e.y, y: -e.x };
  if (n.x * u.x + n.y * u.y < 0) n = scale(n, -1);
  return { p, n };
}

/** How a tail is drawn. */
export interface TailOptions {
  /** The target lies on the panel border (an off-panel speaker): the tip
   *  runs right to it. */
  offPanel?: boolean;
  /** Stroke width, px: how far inside the body the tail starts. */
  strokeWidth: number;
  /** Bend sign for a curved tail (+1 / -1): Kurlander's tails curve away
   *  from the reading side. */
  bend?: number;
  /** The speaker's face: the tip stops short of it, so that the tail
   *  points at the mouth without running over the face. */
  face?: Rect;
}

/** A tail as path commands, and its tip. */
export interface Tail {
  cmds: PathCmd[];
  tip: Point;
  /** Where it leaves the body. */
  base: Point;
}

/**
 * The tail of `body` toward `target` (SPEC D3.2): it leaves the body
 * perpendicular to the wall where the line from the centre to the target
 * crosses it, aims at the target, tapers, and stops `tailReach` of the way
 * there (never closer than `tailGap`), or at the border for an off-panel
 * speaker. Undefined when the target is inside the body or too close.
 */
export function buildTail(body: Body, target: Point, style: LetteringStyle, opts: TailOptions): Tail | undefined {
  const kind = style.tail;
  if (kind === 'none') return undefined;
  const ex = exitOf(body, body.core, target);
  if (!ex) return undefined;
  const em = body.em;
  const gap = dist(ex.p, target);
  if (dist(body.centre, target) <= dist(body.centre, ex.p) + 0.2 * em) return undefined;
  const reach = opts.offPanel ? 1 : (style.tailReach ?? 0.55);
  const minGap = opts.offPanel ? 0 : (style.tailGap ?? 0.5 * em);
  const aim = norm(sub(target, ex.p));
  let len = Math.min(gap * reach, gap - minGap);
  if (opts.face && !opts.offPanel) {
    // Stop before the face (the target, a mouth, lies inside it).
    const entry = rayEnterRect(ex.p, aim, opts.face);
    if (entry !== undefined) len = Math.min(len, entry - 0.35 * em);
  }
  if (len < 0.8 * em) len = Math.min(gap, 0.8 * em);
  if (len <= 0.2 * em) return undefined;
  const tip = add(ex.p, scale(aim, len));
  if (kind === 'bubbles') return bubbleTail(ex, tip, em);
  const inset = 2 * opts.strokeWidth + 0.15 * em;
  const halfBase = Math.max(0.5 * opts.strokeWidth + 1, style.tailWidth / 2);
  if (kind === 'zigzag') return zigzagTail(ex, tip, halfBase, inset, em);
  // The centre line: a quadratic from the wall, leaving along the normal,
  // to the tip (straight for a wedge).
  const ctrl = kind === 'wedge'
    ? lerp(ex.p, tip, 0.5)
    : add(add(ex.p, scale(ex.n, len * 0.5)), scale(perp(aim), (opts.bend ?? 0) * len * 0.12));
  const at = (t: number): Point => add(add(scale(ex.p, (1 - t) ** 2), scale(ctrl, 2 * t * (1 - t))), scale(tip, t * t));
  const dAt = (t: number): Point => norm(add(scale(sub(ctrl, ex.p), 2 * (1 - t)), scale(sub(tip, ctrl), 2 * t)));
  const steps = 10;
  const left: Point[] = [];
  const right: Point[] = [];
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const c = at(t);
    const side = perp(dAt(t));
    const w = halfBase * Math.pow(1 - t, 0.9);
    left.push(add(c, scale(side, w)));
    right.push(add(c, scale(side, -w)));
  }
  // The base runs into the body along the wall's tangent.
  const tangent = perp(ex.n);
  const inner = sub(ex.p, scale(ex.n, inset));
  const innerL = add(inner, scale(tangent, halfBase));
  const innerR = add(inner, scale(tangent, -halfBase));
  // Orient the sides with the tangent so that the polygon does not twist.
  const flip = (left[0]!.x - right[0]!.x) * tangent.x + (left[0]!.y - right[0]!.y) * tangent.y < 0;
  const L = flip ? right : left;
  const R = flip ? left : right;
  const cmds: PathCmd[] = [
    { op: 'M', pts: [innerL] },
    { op: 'L', pts: [L[0]!] },
    ...smoothOpenCmds([...L, tip]),
    ...smoothOpenCmds([tip, ...[...R].reverse()]),
    { op: 'L', pts: [innerR] },
    { op: 'Z', pts: [] },
  ];
  return { cmds, tip, base: ex.p };
}

/** Distance along the unit ray from `o` to where it enters `r` (0 when
 *  `o` is inside), or undefined when it misses. */
function rayEnterRect(o: Point, u: Point, r: Rect): number | undefined {
  let t0 = 0;
  let t1 = Number.POSITIVE_INFINITY;
  for (const [p, d, lo, hi] of [[o.x, u.x, r.x, r.x + r.width], [o.y, u.y, r.y, r.y + r.height]] as const) {
    if (Math.abs(d) < 1e-12) {
      if (p < lo || p > hi) return undefined;
      continue;
    }
    let a = (lo - p) / d;
    let b = (hi - p) / d;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
  }
  return t0 <= t1 ? t0 : undefined;
}

/** A thought tail: three circles shrinking toward the head. */
function bubbleTail(ex: { p: Point; n: Point }, tip: Point, em: number): Tail {
  const radii = [0.42 * em, 0.3 * em, 0.2 * em];
  const dir = norm(sub(tip, ex.p));
  const total = dist(ex.p, tip);
  // Gaps between the circles, scaled to the length the tail has.
  const natural = radii[0]! + 0.25 * em + 2 * radii[1]! + 0.25 * em + radii[2]! + 0.25 * em + radii[0]! * 0.3;
  const k = Math.max(0.6, Math.min(1.6, total / natural));
  const cmds: PathCmd[] = [];
  let at = 0.25 * em * k + radii[0]!;
  let last = ex.p;
  radii.forEach((r, i) => {
    const c = add(ex.p, scale(dir, at));
    cmds.push(...circleCmds(c, r));
    last = c;
    if (i + 1 < radii.length) at += r + 0.3 * em * k + radii[i + 1]!;
  });
  return { cmds, tip: last, base: ex.p };
}

/** A lightning tail (radio, phone): a tapered zig-zag. */
function zigzagTail(ex: { p: Point; n: Point }, tip: Point, halfBase: number, inset: number, em: number): Tail {
  const dir = norm(sub(tip, ex.p));
  const side = perp(dir);
  const len = dist(ex.p, tip);
  const kink = Math.min(0.8 * em, len * 0.22);
  const centre: Point[] = [
    sub(ex.p, scale(dir, inset)),
    ex.p,
    add(add(ex.p, scale(dir, len * 0.35)), scale(side, kink)),
    add(add(ex.p, scale(dir, len * 0.6)), scale(side, -kink)),
    tip,
  ];
  const widths = [halfBase, halfBase, halfBase * 0.8, halfBase * 0.55, 0];
  const left: Point[] = [];
  const right: Point[] = [];
  for (let i = 0; i < centre.length; i++) {
    const a = centre[Math.max(0, i - 1)]!;
    const b = centre[Math.min(centre.length - 1, i + 1)]!;
    const s = perp(norm(sub(b, a)));
    left.push(add(centre[i]!, scale(s, widths[i]!)));
    right.push(add(centre[i]!, scale(s, -widths[i]!)));
  }
  const pts = [...left.slice(0, -1), tip, ...right.slice(0, -1).reverse()];
  return { cmds: polygonCmds(pts), tip, base: ex.p };
}

/** A neck joining two bodies of one speaker (a connector, SPEC D3.2): it
 *  runs from centre to centre, narrow in the middle, and starts inside
 *  both bodies. */
export function buildNeck(a: Body, b: Body, strokeWidth: number): PathCmd[] {
  const ea = exitOf(a, a.core, b.centre);
  const eb = exitOf(b, b.core, a.centre);
  if (!ea || !eb) return [];
  const em = Math.min(a.em, b.em);
  const dir = norm(sub(eb.p, ea.p));
  const side = perp(dir);
  const inset = 2 * strokeWidth + 0.5 * em;
  const pa = sub(ea.p, scale(dir, inset));
  const pb = add(eb.p, scale(dir, inset));
  const wEnd = 0.55 * em;
  const wMid = 0.32 * em;
  const mid = lerp(ea.p, eb.p, 0.5);
  const leftPts = [add(pa, scale(side, wEnd)), add(ea.p, scale(side, wEnd * 0.9)), add(mid, scale(side, wMid)), add(eb.p, scale(side, wEnd * 0.9)), add(pb, scale(side, wEnd))];
  const rightPts = [add(pb, scale(side, -wEnd)), add(eb.p, scale(side, -wEnd * 0.9)), add(mid, scale(side, -wMid)), add(ea.p, scale(side, -wEnd * 0.9)), add(pa, scale(side, -wEnd))];
  return [
    { op: 'M', pts: [leftPts[0]!] },
    ...smoothOpenCmds(leftPts),
    { op: 'L', pts: [rightPts[0]!] },
    ...smoothOpenCmds(rightPts),
    { op: 'Z', pts: [] },
  ];
}

/** The dash pattern of a style, px (absent: solid). */
export function dashOf(style: LetteringStyle): number[] | undefined {
  if (!style.dash) return undefined;
  if (Array.isArray(style.dash)) return style.dash.length ? [...style.dash] : undefined;
  const w = Math.max(0.5, style.strokeWidth);
  return [3 * w, 2 * w];
}
