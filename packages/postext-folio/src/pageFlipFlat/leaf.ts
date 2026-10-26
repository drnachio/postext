// The flat flipper's mesh and timing numbers, the easing curves, and a
// turning leaf's fold, progress and mesh (#1276: split out of pageFlipFlat.ts).
import { PlaneGeometry, Mesh, ShaderMaterial } from 'three';

/** Columns and rows of a leaf's mesh: fine enough for a tight roll. */
export const NX = 96;
export const NY = 120;
/** Vertical field of view: low, so a page at rest maps 1:1 onto the DOM spread. */
export const FOV = 26;
/** Radius of the roll at mid-turn, relative to the page's width. */
const ROLL = 0.11;
/** Milliseconds one leaf takes to turn. */
export const DURATION = 1000;
/** A leaf follows the one before it once that one is this far through its turn. */
export const GAP = 0.14;

export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A point in a leaf's own coordinates: `u` from the spine (0 … W), `v`
 *  from the middle of the page (−H/2 … H/2). Backward turns mirror x. */
export interface Pt {
  u: number;
  v: number;
}

/**
 * How a leaf folds when the point `G` of it has been carried to `P`: the
 * paper stays flat up to a fold line, rolls round a cylinder of radius R
 * and lies over itself beyond it, back up (the page-curl cylinder). The
 * fold is square to the pull, placed so the point taken lands under the
 * hand, and never crosses the spine the leaf is sewn to. R grows as the
 * page lifts and shrinks to nothing as it lands on the other side.
 */
export function foldOf(G: Pt, P: Pt, W: number, H: number) {
  const du = G.u - P.u;
  const dv = G.v - P.v;
  const D = Math.hypot(du, dv);
  if (D < 0.5) return null;
  const n = { u: du / D, v: dv / D };
  const q = progressFrom(G, P);
  const R = ROLL * W * (0.3 + 0.7 * smooth(0, 0.2, q)) * (1 - smooth(0.62, 1, q)) * Math.min(1, D / (0.1 * W));
  const roll = Math.PI * R;
  let c = (D + roll * Math.min(1, roll > 0 ? D / roll : 0)) / 2;
  for (const S of [-H / 2, H / 2]) c = Math.min(c, G.u * n.u + (G.v - S) * n.v);
  if (c <= 0) return null;
  return { F: { u: G.u - n.u * c, v: G.v - n.v * c }, n, R };
}

type Fold = NonNullable<ReturnType<typeof foldOf>>;

/** How far through its turn a leaf is: the point taken, from where it
 *  was to its mirror image across the spine. */
export function progressFrom(G: Pt, P: Pt) {
  return Math.min(1, Math.max(0, (G.u - P.u) / (2 * G.u)));
}

/** The hand can carry the point taken no farther from the spine's ends
 *  than the paper reaches. */
export function reach(G: Pt, P: Pt, H: number): Pt {
  let { u, v } = P;
  for (let i = 0; i < 4; i++) {
    for (const S of [-H / 2, H / 2]) {
      const r = Math.hypot(G.u, G.v - S);
      const d = Math.hypot(u, v - S);
      if (d > r) {
        u *= r / d;
        v = S + ((v - S) * r) / d;
      }
    }
  }
  return { u, v };
}

/** Lays a leaf's mesh out for a fold (flat when there is none). */
export function layLeaf(geometry: PlaneGeometry, fold: Fold | null, forward: boolean, W: number, H: number, z0: number) {
  const pos = geometry.attributes.position;
  const sx = forward ? 1 : -1;
  for (let iy = 0; iy <= NY; iy++) {
    const v = (0.5 - iy / NY) * H;
    for (let ix = 0; ix <= NX; ix++) {
      const u = (ix / NX) * W;
      let x = u;
      let y = v;
      let z = 0;
      if (fold) {
        const { F, n, R } = fold;
        const d = (u - F.u) * n.u + (v - F.v) * n.v;
        if (d > 0) {
          let dd: number;
          if (R < 1e-3) dd = -d;
          else if (d < Math.PI * R) {
            dd = R * Math.sin(d / R);
            z = R * (1 - Math.cos(d / R));
          } else {
            dd = -(d - Math.PI * R);
            z = 2 * R;
          }
          x = u - n.u * (d - dd);
          y = v - n.v * (d - dd);
        }
      }
      pos.setXYZ(iy * (NX + 1) + ix, sx * x, y, z + z0);
    }
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}

export type PageMesh = Mesh<PlaneGeometry, ShaderMaterial>;

export interface Turn {
  forward: boolean;
  /** The point taken, and where the hand holds it now. */
  G: Pt;
  P: Pt;
  /** Held by the reader's pointer: `P` follows `aim`. */
  held?: { aim: Pt; samples: { t: number; q: number }[] };
  /** Carried by the animation: from → to, lifted `arc` on the way. */
  anim?: { start: number; duration: number; from: Pt; to: Pt; arc: number; lands: boolean };
}

export interface Airborne {
  k: number;
  q: number;
  forward: boolean;
  fold: Fold | null;
  mesh: PageMesh;
}
