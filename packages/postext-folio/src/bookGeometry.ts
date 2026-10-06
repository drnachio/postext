import { BufferAttribute, BufferGeometry } from "three";

// The open book's shape, in book coordinates: x from the spine (right page
// positive), y up the page (0 at its middle), z up from the desk; lengths
// in the units the page is drawn in (CSS px of its width at rest).

export type BindingKind = "hardcover" | "paperback" | "sewn" | "layflat" | "saddleStitch" | "folded";

/** How each binding opens. `gutter`: the width over which the pages bend
 *  into the spine (a fraction of the page width, plus `perThickness` × the
 *  block's thickness); `spine`: how near the top of the thicker stack the
 *  top leaves meet (1: at its top); `power`: how steeply they drop at the end;
 *  `dipMm`: how far below that a thin book's pages still sink; the case's
 *  boards and their squares (the margin they stand out round the pages). */
export const BINDINGS: Record<BindingKind, { gutter: number; perThickness: number; spine: number; power: number; dipMm: number; boardMm: number; squareMm: number; jointMm: number }> = {
  hardcover: { gutter: 0.06, perThickness: 0.9, spine: 1, power: 2.4, dipMm: 3, boardMm: 2.2, squareMm: 3, jointMm: 7 },
  sewn: { gutter: 0.07, perThickness: 1.0, spine: 0.95, power: 2.5, dipMm: 3.5, boardMm: 0.35, squareMm: 0, jointMm: 0 },
  paperback: { gutter: 0.1, perThickness: 1.2, spine: 0.85, power: 3, dipMm: 5, boardMm: 0.35, squareMm: 0, jointMm: 0 },
  layflat: { gutter: 0.025, perThickness: 0.4, spine: 1, power: 2, dipMm: 0.2, boardMm: 2, squareMm: 3, jointMm: 4 },
  // Folded sheets stapled through the fold: the centre spread opens flat,
  // the cover is a sheet like the others.
  saddleStitch: { gutter: 0.05, perThickness: 1.4, spine: 0.9, power: 2.2, dipMm: 1.5, boardMm: 0.25, squareMm: 0, jointMm: 0 },
  // Sheets folded once and laid one inside the other, nothing holding
  // them (a newspaper, #506): the fold gapes a little, so the leaves meet
  // lower and roll into it over a wider, softer shoulder. Its "board" is
  // the outer sheet round the fold.
  folded: { gutter: 0.075, perThickness: 1.6, spine: 0.8, power: 1.9, dipMm: 2.5, boardMm: 0.1, squareMm: 0, jointMm: 0 },
};

/** A side's top surface: `x(s)`, `z(s)` for arc length `s` from the spine
 *  (a page keeps its width as it bends), and the slope. */
export interface Profile {
  /** Thickness of the stack (book units). */
  t: number;
  /** Height of the block's base (the top of the cover under it). */
  zb: number;
  /** Height the top leaf meets the spine at, above zb (and the rise). */
  meet: number;
  /** How high the block's base stands at the spine above the desk (or the
   *  case): a thin side of a thick book hangs from the top of the spine
   *  down to the desk, its base a slope that reaches the desk at `run`. */
  rise: number;
  run: number;
  /** Width of the bend. */
  g: number;
  power: number;
  /** Arc-length table: x and z every `step` of s. */
  xs: Float32Array;
  zs: Float32Array;
  step: number;
}

const SAMPLES = 256;

/** Height of a side's base above zb at x (its slope down to the desk). */
function baseAt(p: Pick<Profile, "rise" | "run">, x: number) {
  return p.rise > 0 ? p.rise * Math.max(0, 1 - x / p.run) : 0;
}

/** The top leaf of a stack `t` thick at height above the base, at x. */
function heightAt(p: Pick<Profile, "t" | "meet" | "g" | "power">, x: number, lambda = 1) {
  // A block's top is flat and its leaves roll over a rounded shoulder into
  // the binding (a quarter superellipse: level where it leaves the top,
  // steep at the spine), not a long slope across the page.
  const shape = x < p.g ? Math.pow(1 - Math.pow(1 - x / p.g, p.power), 1 / p.power) : 1;
  return lambda * (p.meet + (p.t - p.meet) * shape);
}

/**
 * The open book's two surfaces. Every leaf is sewn at the spine, so the top
 * leaves of both stacks meet there, at a height between the two stacks
 * (lower for a binding that opens less freely, minus a dip so even a thin
 * book sinks into its gutter); away from the spine each lies on its
 * stack. A stack's lower leaves follow the same curve scaled down to the
 * cover, so the block's head and tail show the fan of leaves.
 */
export function profiles(
  binding: BindingKind,
  W: number,
  pxPerMm: number,
  tLeft: number,
  tRight: number,
  /** `flat`: a side whose top leaf is rigid (a board) lies flat, with no
   *  gutter; `noCase`: the boards are leaves of the stacks (the document's
   *  own cover pages), so the block rests on the desk. */
  { flatLeft = false, flatRight = false, noCase = false }: { flatLeft?: boolean; flatRight?: boolean; noCase?: boolean } = {},
): { left: Profile; right: Profile; board: number } {
  const b = BINDINGS[binding];
  const zb = noCase ? 0 : b.boardMm * pxPerMm;
  // Where the two top leaves meet at the spine. They are sewn next to each
  // other on the block's back, near the top of the thicker stack: a book
  // opened at its first page keeps its block flat and only rolls the top
  // leaf a little into the gutter. The valley deepens as pages pile up on
  // the other side and pull the spine down (by the binding's own dip and
  // a share of the thinner stack).
  const low = Math.min(tLeft, tRight);
  const high = Math.max(tLeft, tRight);
  const dip = (b.dipMm * pxPerMm + 0.35 * low) * (binding === "layflat" ? 0.1 : 1);
  const lying = Math.max(0, low + (high - low) * b.spine - dip);
  // A thick book does not open flat. The thicker block lies on the desk and
  // the thinner side hangs from the top of the spine down to it (opened at
  // its cover, the cover is the hypotenuse of a right triangle). Its top
  // leaf always meets the other at the spine, so the spine never shows: as
  // it grows its slope flattens, and at the middle of the book both blocks
  // lie flat, their tops level. The gutter's valley deepens towards there.
  const share = high > 0 ? low / high : 1;
  const meet = high + (lying - high) * share;
  const rise = Math.min(0.8 * W, Math.max(0, meet - low));
  const make = (t: number, flat: boolean): Profile => {
    const thin = t === low && t !== high;
    const up = thin ? rise : 0;
    const own = meet - up;
    // The shoulder is as wide as the leaves have to drop (or rise) to the
    // binding, plus the binding's own bend.
    const side = Math.min(0.3 * W, b.gutter * W * 0.6 + 1.2 * Math.abs(t - own));
    const p = { t, meet: flat ? t : own, g: Math.max(side, 0.02 * W), power: b.power, rise: up, run: Math.sqrt(Math.max(1, W * W - up * up)) };
    // Arc length along x, then x and z at even steps of arc length.
    const fine = SAMPLES * 4;
    const dx = (1.2 * W) / fine;
    const sx: number[] = [0];
    const sz: number[] = [baseAt(p, 0) + heightAt(p, 0)];
    const ss: number[] = [0];
    for (let i = 1; i <= fine; i++) {
      const x = i * dx;
      const z = baseAt(p, x) + heightAt(p, x);
      ss.push(ss[i - 1] + Math.hypot(dx, z - sz[i - 1]));
      sx.push(x);
      sz.push(z);
    }
    const step = (1.1 * W) / SAMPLES;
    const xs = new Float32Array(SAMPLES + 1);
    const zs = new Float32Array(SAMPLES + 1);
    let j = 0;
    for (let i = 0; i <= SAMPLES; i++) {
      const s = i * step;
      while (j < fine - 1 && ss[j + 1] < s) j++;
      const f = Math.min(1, Math.max(0, (s - ss[j]) / (ss[j + 1] - ss[j] || 1)));
      xs[i] = sx[j] + (sx[j + 1] - sx[j]) * f;
      zs[i] = zb + sz[j] + (sz[j + 1] - sz[j]) * f;
    }
    return { ...p, zb, xs, zs, step };
  };
  return { left: make(tLeft, flatLeft), right: make(tRight, flatRight), board: zb };
}

/** Where arc length `s` of a profile lies: [x, z, dz/dx]. */
export function along(p: Profile, s: number): [number, number, number] {
  const f = Math.max(0, s) / p.step;
  const i = Math.min(p.xs.length - 2, Math.floor(f));
  const t = Math.min(1.5, f - i);
  const x = p.xs[i] + (p.xs[i + 1] - p.xs[i]) * t;
  const z = p.zs[i] + (p.zs[i + 1] - p.zs[i]) * t;
  const slope = (p.zs[i + 1] - p.zs[i]) / (p.xs[i + 1] - p.xs[i] || 1e-6);
  return [x, z, slope];
}

/** The height of a side's top leaf `x` from the spine (the arc-length
 *  table read the other way). */
export function topAt(p: Profile, x: number): number {
  const { xs, zs } = p;
  let lo = 0;
  let hi = xs.length - 1;
  if (x <= xs[0]) return zs[0];
  if (x >= xs[hi]) return zs[hi];
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (xs[m] <= x) lo = m;
    else hi = m;
  }
  return zs[lo] + ((zs[hi] - zs[lo]) * (x - xs[lo])) / (xs[hi] - xs[lo] || 1);
}

/** A lower leaf (fraction `lambda` of the way up the stack) at arc
 *  length s, approximately: the top curve scaled down to the base. */
export function alongLayer(p: Profile, s: number, lambda: number): [number, number] {
  const [x] = along(p, s);
  return [x, p.zb + baseAt(p, x) + heightAt(p, x, lambda)];
}

/**
 * Ambient light reaching each point of the open pages, from the shape of
 * the book's cross-section: the fraction of the sky (cosine weighted) the
 * other page and the gutter leave open. This is the darkening along the
 * gutter, found from the geometry rather than painted. `n` samples across
 * one page, from the spine out.
 */
export function gutterOcclusion(own: Profile, other: Profile, W: number, n = 64): Float32Array {
  const out = new Float32Array(n + 1);
  // Occluders: the other page's surface (at negative x) and this page's own
  // surface between the point and the spine.
  const pts: [number, number][] = [];
  for (let i = 0; i <= 96; i++) {
    const [x, z] = along(other, (i / 96) * W);
    pts.push([-x, z]);
  }
  const ownPts: [number, number][] = [];
  for (let i = 0; i <= 96; i++) {
    const [x, z] = along(own, (i / 96) * W);
    ownPts.push([x, z]);
  }
  for (let k = 0; k <= n; k++) {
    const [x, z, slope] = along(own, (k / n) * W);
    const tau = Math.atan(slope);
    // Highest elevation (angle from +x) of an occluder towards the spine.
    let spine = 0;
    for (const [px, pz] of pts) spine = Math.max(spine, Math.atan2(pz - z, x - px));
    for (const [px, pz] of ownPts) if (px < x - 1e-3) spine = Math.max(spine, Math.atan2(pz - z, x - px));
    // Towards the fore-edge the page's own surface, if it rises.
    let fore = tau;
    for (const [px, pz] of ownPts) if (px > x + 1e-3) fore = Math.max(fore, Math.atan2(pz - z, px - x));
    const nAngle = tau + Math.PI / 2;
    const a = Math.max(tau, fore);
    const b = Math.min(tau + Math.PI, Math.PI - spine);
    out[k] = b > a ? Math.max(0, (Math.sin(b - nAngle) - Math.sin(a - nAngle)) / 2) : 0;
  }
  return out;
}

/**
 * The page block's visible sides for one stack: the head and tail (the
 * fan of leaves between the cover and the top leaf) and the fore-edge.
 * Each vertex carries `layer`: the leaf it lies on, counted up from the
 * cover, so the shader draws the edges of the leaves, and `run`: how far
 * along the cut face it lies.
 */
export function stackGeometry(p: Profile, side: 1 | -1, W: number, H: number, leaves: number): BufferGeometry {
  const NS = 48;
  const NL = Math.max(2, Math.min(24, leaves + 1));
  const pos: number[] = [];
  const nrm: number[] = [];
  const layer: number[] = [];
  const lam: number[] = [];
  const run: number[] = [];
  const idx: number[] = [];
  const quadGrid = (cols: number, rows: number, at: (c: number, r: number) => [number, number, number, number, number], normal: [number, number, number], flip: boolean) => {
    const base = pos.length / 3;
    for (let r = 0; r <= rows; r++)
      for (let c = 0; c <= cols; c++) {
        const [x, y, z, l, a] = at(c, r);
        pos.push(x, y, z);
        run.push(a);
        nrm.push(...normal);
        layer.push(l);
        lam.push(leaves > 0 ? l / leaves : r / Math.max(1, rows));
      }
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const a = base + r * (cols + 1) + c;
        const b = a + 1;
        const d = a + cols + 1;
        const e = d + 1;
        if (flip) idx.push(a, d, b, b, d, e);
        else idx.push(a, b, d, b, e, d);
      }
  };
  for (const end of [1, -1] as const) {
    // Head (y = H/2, facing +y) and tail (facing −y).
    quadGrid(
      NS,
      NL - 1,
      (c, r) => {
        const lambda = r / (NL - 1);
        const [x, z] = alongLayer(p, (c / NS) * W, lambda);
        return [side * x, (end * H) / 2, z, lambda * leaves, x];
      },
      [0, end, 0],
      (end > 0) !== (side > 0),
    );
  }
  // The fore-edge: each leaf ends where its arc length runs out.
  quadGrid(
    1,
    NL - 1,
    (c, r) => {
      const lambda = r / (NL - 1);
      const [x, z] = alongLayer(p, W, lambda);
      return [side * x, (c ? -1 : 1) * (H / 2), z, lambda * leaves, W + (c ? H : 0)];
    },
    [side, 0, 0],
    side < 0,
  );
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("normal", new BufferAttribute(new Float32Array(nrm), 3));
  g.setAttribute("layer", new BufferAttribute(new Float32Array(layer), 1));
  // How far up the block (0 at its base, 1 at its top), for the bands a
  // board takes in it.
  g.setAttribute("lambda", new BufferAttribute(new Float32Array(lam), 1));
  // How far along the cut face (book units, from the spine round the
  // head or tail to the fore-edge), for the relief the guillotine leaves.
  g.setAttribute("run", new BufferAttribute(new Float32Array(run), 1));
  g.setIndex(idx);
  return g;
}
