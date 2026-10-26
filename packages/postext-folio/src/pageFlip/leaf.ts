// A leaf's shape: the open book's two surfaces, the fold and roll of a
// turning leaf, how far through its turn it is, and laying its mesh out
// (#1276: split out of pageFlip.ts).
import { BufferGeometry, Mesh, BoxGeometry, MeshStandardMaterial, Plane, Vector3 } from 'three';
import { along, type Profile, topAt } from '../bookGeometry.js';
import type { PaperSpec } from '../paper.js';
import { ROLL, BLOCK_GAP, NX, NY, OWN_GAP } from './constants.js';
import { smooth, type PageMaterial } from './materials.js';

/** The lowest the reader may orbit the view: 70° from straight above. */
export const MAX_PITCH = (70 * Math.PI) / 180;

/** How far (radians) a leaf in mid-turn stands off the pages at the spine:
 *  barely; it is sewn there, and more reads as the leaf lifting off the
 *  book parallel to it and dropping back. */
const LEAN = 0.02;

/** Where column `t` (0 … 1) of a page's mesh lies across it: closer
 *  together near the spine, where the gutter bends tightest. */
export const column = (t: number) => Math.pow(t, 1.45);

/** Sets a page mesh's u coordinates to its columns. */
export function spreadColumns(geometry: BufferGeometry, nx: number) {
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, column((i % (nx + 1)) / nx));
  uv.needsUpdate = true;
}

/** max(a, b), rounded over a band `k` wide (no crease where they meet). */
function smoothMax(a: number, b: number, k: number) {
  return (a + b + Math.sqrt((a - b) * (a - b) + k * k)) / 2;
}

/** Where arc length `signed` from the spine lies on the open book's
 *  surface (right page positive): [x, z]. */
function surfaceAt(book: Surfaces, signed: number): [number, number] {
  const [bx, bz] = along(signed >= 0 ? book.right : book.left, Math.abs(signed));
  return [(signed >= 0 ? 1 : -1) * bx, bz];
}

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
 * page lifts and shrinks to nothing as it lands on the other side; a
 * stiffer paper (`roll`) bends in a wider roll.
 */
export function foldOf(G: Pt, P: Pt, W: number, H: number, roll = 1) {
  const du = G.u - P.u;
  const dv = G.v - P.v;
  const D = Math.hypot(du, dv);
  if (D < 0.5) return null;
  const n = { u: du / D, v: dv / D };
  const q = progressFrom(G, P);
  const R = Math.min(0.5, ROLL * roll) * W * (0.3 + 0.7 * smooth(0, 0.2, q)) * (1 - smooth(0.62, 1, q)) * Math.min(1, D / (0.1 * W));
  // How far the paper past the fold has turned: a leaf held up by the hand
  // stands in the air (about 110° early in the turn), and only lies back
  // flat (180°) as it lands. Folding it flat over itself all the way (the
  // table-paper curl) made a tent of a leaf dragged across the spine.
  const theta = Math.PI * (0.62 + 0.38 * smooth(0.05, 1, q));
  // The fold sits where the point taken, carried round the roll and on
  // straight, lands over the hand: R sinθ + (c − Rθ) cosθ = c − D.
  const arc = R * theta;
  const k = arc > 0 ? Math.min(1, D / arc) : 0;
  const free = (D + k * (R * Math.sin(theta) - arc * Math.cos(theta))) / (1 - Math.cos(theta));
  let c = free;
  for (const S of [-H / 2, H / 2]) c = Math.min(c, G.u * n.u + (G.v - S) * n.v);
  if (c <= 0) return null;
  const F = { u: G.u - n.u * c, v: G.v - n.v * c };
  // Never all at once (#502). Paper lying beyond the point taken, along
  // the pull (a page taken by the middle of an edge and pulled across),
  // turns over as the hand carries it away, not the moment it moves (a
  // pixel's pull stood half the page up). A fold held off the spine short
  // of the hand turns the less the nearer it comes to the point taken, so
  // that it is gone, not dropped, when it reaches it.
  let beyond = 0;
  for (const u of [0, W]) for (const v of [-H / 2, H / 2]) beyond = Math.max(beyond, (u - G.u) * n.u + (v - G.v) * n.v);
  const turns = (c / free) * (beyond > 0 ? smooth(0, 0.5 * beyond, D) : 1);
  return { F, n, R, theta: theta * turns };
}

type Fold = NonNullable<ReturnType<typeof foldOf>>;

/** Paper `d` past the fold, round a roll of radius R and straight on at
 *  θ: how far it reaches back across the page, and how high it stands. */
function rollOf(d: number, R: number, theta: number): [number, number] {
  if (R > 1e-3 && d < R * theta) return [R * Math.sin(d / R), R * (1 - Math.cos(d / R))];
  const rest = d - R * theta;
  return [R * Math.sin(theta) + rest * Math.cos(theta), R * (1 - Math.cos(theta)) + rest * Math.sin(theta)];
}

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

/** The open book's two surfaces, which a leaf lies on at rest. */
export interface Surfaces {
  left: Profile;
  right: Profile;
}

/**
 * Lays a leaf's mesh out. The curl is worked out on the flat page (u from
 * the spine), then wrapped onto the book: the part on the right follows
 * the right stack's top (into the gutter and out), the part carried over
 * the spine the left one's. A stiff leaf (`rigidity`) turns more as a
 * plate on its hinge: a board does not bend at all.
 */
export function layLeaf(geometry: BufferGeometry, fold: Fold | null, forward: boolean, W: number, H: number, lift: number, book: Surfaces, rigidity: number, q: number, flutter = 0, time = 0, board?: { thick: number; face: number }): { phi: number; pivot: number } {
  const pos = geometry.attributes.position;
  const sx = forward ? 1 : -1;
  const [xr, zr] = along(book.right, W);
  const [xl, zl] = along(book.left, W);
  const zr0 = along(book.right, 0)[1];
  const zl0 = along(book.left, 0)[1];
  const qa = forward ? q : 1 - q;
  let hinge: number;
  let phi: number;
  let r: number;
  let offset = 0;
  if (board) {
    // A board (a cover): a rigid slab `thick` deep, turning on the joint at
    // the top of the spine. It leaves the block it lay on (its chord, from
    // the spine to the fore-edge) and lands on the other side's, however
    // that lies: flat on an open book, hanging down to the desk from a
    // spine still standing. As it comes down to the lower side the joint
    // comes down the spine with it (the cloth flexes), so it lands instead
    // of dropping. The pivot is its middle plane: it lies with its inner
    // face on the block under it and lands with its outer face on the
    // other, and `face` sets which of its faces this mesh draws.
    const descend = zl0 < zr0 ? smooth(0.4, 1, qa) : 1 - smooth(0.4, 1, 1 - qa);
    hinge = zr0 + (zl0 - zr0) * descend + board.thick / 2;
    const a0 = Math.atan2(zr - zr0, xr);
    const a1 = Math.PI - Math.atan2(zl - zl0, xl);
    // The hand holds the point it took over the desk: a rigid plate turned
    // by φ brings it to u·cos φ, so the board stands where the hand has
    // carried that point (q = (1 − cos)/2), not on an eased curve that laid
    // it level in the air while the hand was still over the slope.
    phi = a0 + ((a1 - a0) * Math.acos(Math.min(1, Math.max(-1, 1 - 2 * qa)))) / Math.PI;
    r = 1;
    offset = (board.face * board.thick) / 2;
  } else {
    // A stiff leaf rests on its stack's fore-edge and swings over the gutter.
    r = rigidity * smooth(0, 0.06, q) * smooth(0, 0.06, 1 - q);
    hinge = along(book.right, 0)[1];
    const a0 = Math.atan2(zr - hinge, xr);
    const a1 = Math.PI - Math.atan2(zl - hinge, xl);
    phi = a0 + (a1 - a0) * qa;
  }
  // How far a turning leaf stands off the pages: none at rest or for a
  // corner barely lifted, a few degrees through the middle of the turn.
  const inAir = smooth(0.02, 0.22, q) * smooth(0.02, 0.22, 1 - q);
  const lean = LEAN * inAir;
  // Each side's chord, from the spine to its fore-edge: a side hanging
  // from a standing spine slopes down to the desk, and a leaf leaning off
  // it leans off that slope, not off a level plane over it.
  const chordR = (zr - zr0) / (xr || 1);
  const chordL = (zl - zl0) / (xl || 1);
  // The plane a leaf lifts off along, by side: the chord turned up by the
  // lean. A leaf keeps its width along it (stepping the chord's rise per
  // unit across, on a side sloping to the desk, stretched it by a tenth
  // and more, #495).
  const tiltR = Math.atan(chordR) + lean;
  const tiltL = Math.atan(chordL) + lean;
  // Onto the book. At rest (and as it lands) the leaf lies on the open
  // book's surface, into the gutter and out. In the air it is lifted off
  // at the spine: its own plane rises from the gutter's floor at a small
  // angle, and it touches the pages only where they stand higher (the
  // gutter's walls), joined smoothly. `z`: how far over that it stands.
  const onBook = (s: number, z: number): [number, number] => {
    const [rx, rz] = surfaceAt(book, s);
    let px = rx;
    let pz = rz + z + lift;
    if (inAir > 0) {
      const tilt = s >= 0 ? tiltR : tiltL;
      const fx = (s >= 0 ? 1 : -1) * Math.abs(s) * Math.cos(tilt);
      const plane = (s >= 0 ? zr0 : zl0) + Math.abs(s) * Math.sin(tilt) + z + lift;
      const under = surfaceAt(book, fx)[1] + lift + 0.6;
      const flying = smoothMax(plane, under, 0.006 * W);
      px += (fx - px) * inAir;
      pz += (flying - pz) * inAir;
    }
    return [px, pz];
  };
  // Thin paper ripples in the air, more towards its free edge. Never
  // down into the pages under it: the ripple dies away where the leaf
  // lies close over them (it stays at least `lift` above them), or a
  // leaf held low over its stack dipped into the page under it, whose
  // print then showed through (#447).
  const ripple = (u: number, v: number, px: number, pz: number) => {
    const amp = flutter * W * (u / W) * (u / W);
    if (flutter <= 0 || amp <= 1e-6) return 0;
    const clear = pz - surfaceAt(book, px)[1] - lift;
    return amp * smooth(0, 2 * amp, clear) * Math.sin(2 * Math.PI * (time / 520) - (3 * u) / W + (2 * v) / H);
  };
  // Where the leaf's paper lies unfolded, column by column (before it
  // ripples): [out from the spine, u, height].
  const clearing = BLOCK_GAP * smooth(0, 0.06, q) * smooth(0, 0.06, 1 - q);
  const own: [number, number, number][] = [];
  if (fold) {
    for (let ix = 0; ix <= NX; ix++) {
      const u = column(ix / NX) * W;
      let [ox, oz] = onBook(sx * u, 0);
      if (r > 0) {
        ox += (u * Math.cos(phi) - offset * Math.sin(phi) - ox) * r;
        oz += (hinge + lift + u * Math.sin(phi) + offset * Math.cos(phi) - oz) * r;
      }
      own.push([sx * ox, u, oz]);
    }
  }
  for (let iy = 0; iy <= NY; iy++) {
    const v = (0.5 - iy / NY) * H;
    for (let ix = 0; ix <= NX; ix++) {
      const u = column(ix / NX) * W;
      let x = u;
      let y = v;
      let z = 0;
      let d = 0;
      let dd = 0;
      if (fold) {
        const { F, n } = fold;
        d = (u - F.u) * n.u + (v - F.v) * n.v;
        if (d > 0) {
          // Round the roll, then straight on at the fold's angle.
          [dd, z] = rollOf(d, fold.R, fold.theta);
          y = v - n.v * (d - dd);
          x = u - n.u * (d - dd);
        }
      }
      let [px, pz] = onBook(sx * x, z);
      if (fold && d > 0) {
        // Paper up in the air is not pressed onto the pages under it: wrapped
        // onto them it dipped into the gutter and was squeezed across it (a
        // crease where the curl passed over the spine). It goes on from the
        // foot of its fold, level, as the fold has it, and only comes down
        // onto the pages as it does (lying back over itself, landing).
        const [fx, fz] = onBook(sx * (u - fold.n.u * d), 0);
        const w = smooth(0, 0.05 * W, z);
        px += (fx + sx * fold.n.u * dd - px) * w;
        pz += (fz + z - pz) * w;
      }
      if (r > 0) {
        px += (u * Math.cos(phi) - offset * Math.sin(phi) - px) * r;
        y += (v - y) * r;
        pz += (hinge + lift + u * Math.sin(phi) + offset * Math.cos(phi) - pz) * r;
      }
      pz += ripple(u, v, px, pz);
      // Never through the leaf's own paper not yet folded, as it ripples
      // too: carried level from a fold low on a side sloping up to the
      // spine, the paper folded back over it ran under it, crossing it.
      if (fold && d > 0) {
        const at = sx * px;
        // (A row past the head and foot too: a triangle reaching past them
        // from paper kept over sagged through.)
        if (at > own[0][0] && at < own[NX][0] && Math.abs(y) <= H / 2 + (1.5 * H) / NY) {
          let lo = 0;
          let hi = NX;
          while (hi - lo > 1) {
            const mid = (lo + hi) >> 1;
            if (own[mid][0] <= at) lo = mid;
            else hi = mid;
          }
          const f = (at - own[lo][0]) / (own[hi][0] - own[lo][0] || 1);
          const ou = own[lo][1] + (own[hi][1] - own[lo][1]) * f;
          if ((ou - fold.F.u) * fold.n.u + (y - fold.F.v) * fold.n.v < 0) {
            const oz = own[lo][2] + (own[hi][2] - own[lo][2]) * f;
            pz = Math.max(pz, oz + ripple(ou, y, px, oz) + OWN_GAP);
          }
        }
      }
      // Never into the book: over a block (and past its head or foot) a
      // leaf stands at least just over its top. A fold's flap is carried
      // level from the foot of its fold, and on a thin side hanging from
      // the spine that foot lies low: the flap went through the tall block
      // on the other side (#489).
      // In the air a little higher still (until it lands): half a pixel
      // over the block is hardly any depth at the view's distance, and a
      // leaf lying over a tall block's top drew through its page in teeth.
      if (!board && Math.abs(px) < (px >= 0 ? xr : xl)) pz = Math.max(pz, topAt(px >= 0 ? book.right : book.left, Math.abs(px)) + Math.min(lift, 0.5) + clearing);
      pos.setXYZ(iy * (NX + 1) + ix, px, y, pz);
    }
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return { phi, pivot: hinge + lift };
}

export type PageMesh = Mesh<BufferGeometry, PageMaterial>;

export interface BoardParts {
  back: PageMesh;
  slab: Mesh<BoxGeometry, MeshStandardMaterial>;
}

/** Frees a leaf's mesh and a board's parts. */
export function disposeLeaf(mesh: PageMesh) {
  const parts = mesh.userData.board as BoardParts | undefined;
  if (parts) {
    parts.back.geometry.dispose();
    parts.slab.geometry.dispose();
    parts.slab.material.dispose();
  }
  (mesh.userData.caster as Mesh | undefined)?.geometry.dispose();
  mesh.geometry.dispose();
  mesh.material.dispose();
}

export interface Turn {
  forward: boolean;
  /** A board: it turns as a rigid slab on the joint. */
  rigid?: boolean;
  /** The point taken, and where the hand holds it now. */
  G: Pt;
  P: Pt;
  /** Held by the reader's pointer: `P` follows `aim`. */
  held?: { aim: Pt; samples: { t: number; p: Pt }[] };
  /** Carried by the animation: from → to, lifted `arc` on the way. */
  anim?: { start: number; duration: number; from: Pt; to: Pt; arc: number; lands: boolean };
  /** Let go: the point eases from where the hand left it (`from`, at the
   *  hand's speed `vel`, px/ms) to `to`, arriving at rest after `duration`
   *  ms (a cubic Hermite curve: no jump, no lingering tail). */
  spring?: { from: Pt; to: Pt; vel: Pt; start: number; duration: number; lands: boolean };
}

export interface Airborne {
  k: number;
  q: number;
  forward: boolean;
  fold: Fold | null;
  mesh: PageMesh;
  spec: PaperSpec;
}

/**
 * The plane an open page lies in past the gutter's shoulder (world,
 * normal up), its side running out from the spine along world x as
 * `out` (±1): level on a block lying on the desk, sloping down to it on
 * the thin side of a thick book, which hangs from the top of the spine.
 * A gloss page mirrors the leaves in the air in it (#483).
 */
export function pagePlane(p: Profile, W: number, out: number): Plane {
  const [x0, z0] = along(p, W * 0.55);
  const [x1, z1] = along(p, W);
  const dx = out * (x1 - x0);
  const dz = z1 - z0;
  const normal = new Vector3(-dz * Math.sign(dx || 1), 0, Math.abs(dx)).normalize();
  return new Plane().setFromNormalAndCoplanarPoint(normal, new Vector3(out * x0, 0, z0));
}
