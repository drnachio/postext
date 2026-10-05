// The folio's page flipper, run without WebGL: the renderer is a
// stub, the scene graph and the leaves' geometry are three.js's own. A
// right-bound book lies mirrored on the desk (verso on the right, recto on
// the left) and its leaves turn from left to right.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlaneGeometry, Vector3, type Mesh, type ShaderMaterial } from "three";
import { along, profiles } from "./bookGeometry";

vi.mock("three", async (importOriginal) => {
  const three = await importOriginal<typeof import("three")>();
  class WebGLRenderer {
    outputColorSpace = "";
    extensions = { has: () => false };
    capabilities = { getMaxAnisotropy: () => 1 };
    setClearColor() {}
    setPixelRatio() {}
    setSize() {}
    setRenderTarget() {}
    render() {}
    clear() {}
    dispose() {}
  }
  return { ...three, WebGLRenderer };
});

const { PageFlipper } = await import("./pageFlip");
type FlipAppearance = import("./pageFlip").FlipAppearance;
type Flipper = InstanceType<typeof PageFlipper>;

// The DOM spread: two 320 × 450 pages side by side, the canvas centred on it.
const W = 320;
const H = 450;
const CX = 500;
const CY = 400;
const canvas = {
  clientWidth: 2 * W * 1.12,
  clientHeight: H * 1.36,
  getBoundingClientRect: () => ({ left: CX - W * 1.12, top: CY - H * 0.68, width: 2 * W * 1.12, height: H * 1.36 }),
} as unknown as HTMLCanvasElement;
const spread = {
  clientWidth: 2 * W,
  clientHeight: H,
  getBoundingClientRect: () => ({ left: CX - W, top: CY - H / 2, width: 2 * W, height: H }),
  classList: { add() {}, remove() {} },
} as unknown as HTMLElement;
// Blank pages throughout: nothing to load.
const book: [string | null, string | null][] = [[null, ""], ["", ""], ["", ""], ["", ""]];
/** The outer top corner of a page lying open (72 columns). */
const OPEN_EDGE = 72;
/** A point on the left or right page of the spread, as the pointer gives it. */
const onPage = (side: "left" | "right") => ({ clientX: CX + (side === "left" ? -0.6 : 0.6) * W, clientY: CY + 0.3 * H });

let frames: FrameRequestCallback[] = [];
let clock = 0;
/** Runs the frames the flipper asked for, `ms` later. */
function tick(ms: number) {
  clock += ms;
  const queue = frames;
  frames = [];
  for (const cb of queue) cb(clock);
}

beforeEach(() => {
  frames = [];
  clock = 0;
  vi.stubGlobal("window", { devicePixelRatio: 1 });
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.spyOn(performance, "now").mockImplementation(() => clock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function flipper(binding: "left" | "right", at = 1, appearance: FlipAppearance = { folio: { tilt: 0 } }) {
  const settled: number[] = [];
  const targets: number[] = [];
  const f = new PageFlipper(canvas, spread, book, at, (i) => settled.push(i), (i) => targets.push(i), binding, { appearance });
  return { f, settled, targets };
}

type Inside = {
  left: Mesh<PlaneGeometry, ShaderMaterial>;
  leaves: Map<number, Mesh<PlaneGeometry, ShaderMaterial>>;
  scene: { updateMatrixWorld(): void };
  turns: Map<number, { P: { u: number; v: number }; G: { u: number; v: number } }>;
  surfaces: { left: { t: number }; right: { t: number } } | null;
};
const inside = (f: Flipper) => f as unknown as Inside;

/** Where a vertex of a mesh lies on screen (x from the spine, rightward). */
function screenX(f: Flipper, mesh: Mesh<PlaneGeometry, ShaderMaterial>, index: number) {
  inside(f).scene.updateMatrixWorld();
  const pos = mesh.geometry.attributes.position;
  return mesh.localToWorld(new Vector3(pos.getX(index), pos.getY(index), pos.getZ(index))).x;
}

describe("the page flipper", () => {
  it("turns a left-bound book forward from its right page and back from its left one", () => {
    const forward = flipper("left");
    expect(forward.f.grab(onPage("right"))).toBe(true);
    forward.f.release(true);
    expect(forward.targets).toEqual([2]);

    const back = flipper("left");
    expect(back.f.grab(onPage("left"))).toBe(true);
    back.f.release(true);
    expect(back.targets).toEqual([0]);
  });

  it("turns a right-bound book forward from its left page, the recto, and back from its right one", () => {
    const forward = flipper("right");
    expect(forward.f.grab(onPage("left"))).toBe(true);
    forward.f.release(true);
    expect(forward.targets).toEqual([2]);
    for (let i = 0; i < 40 && forward.settled.length === 0; i++) tick(50);
    expect(forward.settled).toEqual([2]);

    const back = flipper("right");
    expect(back.f.grab(onPage("right"))).toBe(true);
    back.f.release(true);
    expect(back.targets).toEqual([0]);
  });

  it("lays a right-bound spread out mirrored while a leaf turns: the verso on the right, the leaf travelling rightward", () => {
    const { f } = flipper("right");
    f.grab(onPage("left"));
    tick(16);
    // The verso lying open: its outer edge (the last column of its top
    // row), a little short of a page's width as the page curves into the
    // gutter.
    expect(screenX(f, inside(f).left, OPEN_EDGE)).toBeGreaterThan(0.9 * W);
    expect(screenX(f, inside(f).left, OPEN_EDGE)).toBeLessThanOrEqual(W);
    // The leaf taken is page 3, the recto on the left: its outer edge, at
    // the middle of its height.
    const leaf = inside(f).leaves.get(1)!;
    const edge = (120 / 2) * 97 + 96;
    expect(screenX(f, leaf, edge)).toBeLessThan(0);
    f.release(true);
    tick(1);
    const start = screenX(f, leaf, edge);
    tick(900);
    expect(screenX(f, leaf, edge)).toBeGreaterThan(start);
    expect(screenX(f, leaf, edge)).toBeGreaterThan(0);
    // The page images keep reading left to right (their u is flipped back).
    expect((leaf.material.userData.uniforms as { uMirror: { value: number } }).uMirror.value).toBe(1);
  });

  it("lays a left-bound spread out as the DOM does", () => {
    const { f } = flipper("left");
    f.grab(onPage("right"));
    tick(16);
    expect(screenX(f, inside(f).left, OPEN_EDGE)).toBeLessThan(-0.9 * W);
    const leaf = inside(f).leaves.get(1)!;
    expect(screenX(f, leaf, (120 / 2) * 97 + 96)).toBeGreaterThan(0);
    expect((leaf.material.userData.uniforms as { uMirror: { value: number } }).uMirror.value).toBe(0);
  });

  it("takes a book of another length afresh, open where it is told", () => {
    const { f, targets } = flipper("left");
    f.setBook([[null, ""], ["", ""]], 1);
    // One leaf now: the open spread's left page turns back to the first.
    expect(f.grab(onPage("left"))).toBe(true);
    f.release(true);
    expect(targets).toEqual([0]);
    // Nothing lies beyond the last spread.
    const again = flipper("left");
    again.f.setBook([[null, ""], ["", ""]], 1);
    expect(again.f.grab(onPage("right"))).toBe(false);
  });

  it("eases a page let go short of halfway back to where it lay, not at once", () => {
    const { f, targets } = flipper("left");
    expect(f.grab(onPage("right"))).toBe(true);
    // Carried a third of the way over, slowly, then held still.
    for (let i = 1; i <= 10; i++) {
      tick(16);
      f.drag({ clientX: CX + 0.6 * W - i * 0.04 * W, clientY: CY + 0.3 * H });
    }
    for (let i = 0; i < 20; i++) tick(16);
    const turn = inside(f).turns.get(1)!;
    const lifted = turn.G.u - turn.P.u;
    expect(lifted).toBeGreaterThan(0.2 * W);
    clock += 200;
    f.release(false);
    expect(targets).toEqual([]);
    // A tenth of a second later it is still on its way back…
    tick(16);
    for (let i = 0; i < 5; i++) tick(16);
    const midway = inside(f).turns.get(1);
    expect(midway).toBeDefined();
    const left = midway!.G.u - midway!.P.u;
    expect(left).toBeGreaterThan(0.05 * W);
    expect(left).toBeLessThan(lifted);
    // …and lies flat again within a second, without having turned.
    for (let i = 0; i < 70 && inside(f).turns.size; i++) tick(16);
    expect(inside(f).turns.size).toBe(0);
    expect(targets).toEqual([]);
  });

  it("carries a page thrown towards the spine over, from the hand's speed", () => {
    const { f, targets } = flipper("left");
    f.grab(onPage("right"));
    // A quick flick: a quarter of the way in 50 ms.
    for (let i = 1; i <= 4; i++) {
      tick(12);
      f.drag({ clientX: CX + 0.6 * W - i * 0.07 * W, clientY: CY + 0.3 * H });
    }
    f.release(false);
    expect(targets).toEqual([2]);
  });

  it("builds a thicker page block for a longer book", () => {
    const thin = flipper("left", 1, { folio: { tilt: 0 } });
    const thick = flipper("left", 1, { folio: { tilt: 0 }, extraLeaves: { before: 0, after: 300 } });
    for (const { f } of [thin, thick]) {
      f.grab(onPage("right"));
      tick(16);
    }
    const t1 = inside(thin.f).surfaces!.right.t;
    const t2 = inside(thick.f).surfaces!.right.t;
    expect(t2).toBeGreaterThan(t1 + 50 * 0.1);
  });

  it("prints a stapled cover on its own stock when the leaf names one", () => {
    const card = { type: "cardStock" as const, grammage: 250, shade: { hex: "#f2c9b4", model: "hex" as const } };
    const folio = { tilt: 0, paper: { type: "newsprint" as const }, binding: { type: "saddleStitch" as const, cover: "pages" as const } };
    const own = flipper("left", 1, { folio, coverLeaves: { front: 0 }, leafPapers: [card, undefined] });
    const plain = flipper("left", 1, { folio, coverLeaves: { front: 0 }, leafPapers: [undefined, undefined] });
    const spec = (f: typeof own.f) => (inside(f) as unknown as { specOf(k: number): { paper: { type: string; grammage: number; shade: { hex: string } } } }).specOf(0);
    expect(spec(own.f).paper.type).toBe("cardStock");
    expect(spec(own.f).paper.grammage).toBe(250);
    expect(spec(own.f).paper.shade.hex).toBe("#f2c9b4");
    // Without a stock of its own: the pages' paper, a little heavier.
    expect(spec(plain.f).paper.type).toBe("newsprint");
    expect(spec(plain.f).paper.grammage).toBeGreaterThan(48);
  });

  it("turns a board leaf as a rigid plate", () => {
    const board = flipper("left", 1, { folio: { tilt: 0 }, leafPapers: [undefined, { type: "board" }, undefined] });
    board.f.grab(onPage("right"));
    board.f.release(true);
    // Halfway through its turn.
    for (let i = 0; i < 31; i++) tick(16);
    const mesh = inside(board.f).leaves.get(1)!;
    const pos = mesh.geometry.attributes.position;
    // Along the middle row the leaf is a straight line from the hinge.
    const row = 60 * 97;
    const p = (i: number) => new Vector3(pos.getX(row + i), pos.getY(row + i), pos.getZ(row + i));
    const a = p(10);
    const b = p(50);
    const c = p(96);
    const ab = b.clone().sub(a).normalize();
    const ac = c.clone().sub(a).normalize();
    expect(ab.dot(ac)).toBeGreaterThan(0.999);
    // Lifted well off the page: it swings up, not along it.
    expect(c.z - a.z).toBeGreaterThan(50);
  });

  it("never ripples a thin leaf held low down into the page under it", async () => {
    const { foldOf, layLeaf, progressFrom } = await import("./pageFlip");
    const W = 650;
    const H = 920;
    const book = profiles("hardcover", W, 4, 60, 60);
    // The page's height under x (the profile runs by arc length).
    const under = (x: number) => {
      let s = x;
      for (let i = 0; i < 4; i++) s += x - along(book.right, s)[0];
      return along(book.right, s)[1];
    };
    const lift = 0.5;
    let lowest = Infinity;
    let swayed = 0;
    for (const reach of [0.97, 0.9, 0.8]) {
      const G = { u: 0.92 * W, v: -0.4 * H };
      const P = { u: reach * G.u, v: G.v };
      const q = progressFrom(G, P);
      const fold = foldOf(G, P, W, H, 0.4);
      const geometry = new PlaneGeometry(W, H, 96, 120);
      const rest = new PlaneGeometry(W, H, 96, 120);
      layLeaf(rest, fold, true, W, H, lift, book, 0, q);
      // Bible paper: a floppy leaf, rippling (as `draw` sets it for roll 0.4).
      const flutter = 0.012 * (1 / 0.4 - 0.75) * Math.sin(Math.PI * q);
      for (let time = 0; time < 1040; time += 65) {
        layLeaf(geometry, fold, true, W, H, lift, book, 0, q, flutter, time);
        const pos = geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i);
          if (x < 0.1 * W) continue;
          lowest = Math.min(lowest, pos.getZ(i) - under(x));
          swayed = Math.max(swayed, Math.abs(pos.getZ(i) - rest.attributes.position.getZ(i)));
        }
      }
      geometry.dispose();
      rest.dispose();
    }
    // It stays over the page by its lift (it used to dip into it, and the
    // page's print showed through it), and its curl still sways.
    expect(lowest).toBeGreaterThan(lift - 0.05);
    expect(swayed).toBeGreaterThan(2);
  });

  it("keeps the paper curled up over the gutter free of creases", async () => {
    const { foldOf, layLeaf, progressFrom } = await import("./pageFlip");
    // The middle of a thick book: a deep gutter between two level pages.
    const W = 600;
    const H = 850;
    const book = profiles("hardcover", W, 4, 60, 60);
    const floor = along(book.right, 0)[1];
    let worst = 0;
    for (let k = 1; k < 20; k++) {
      const G = { u: W, v: -0.4 * H };
      const P = { u: W - (2 * W * k) / 20, v: -0.36 * H };
      const fold = foldOf(G, P, W, H);
      const geometry = new PlaneGeometry(W, H, 96, 120);
      layLeaf(geometry, fold, true, W, H, 1, book, 0, progressFrom(G, P));
      const pos = geometry.attributes.position;
      for (let iy = 0; iy <= 120; iy += 4) {
        for (let ix = 1; ix < 96; ix++) {
          const p = (i: number) => new Vector3(pos.getX(iy * 97 + i), pos.getY(iy * 97 + i), pos.getZ(iy * 97 + i));
          const b = p(ix);
          // Paper in the air over the gutter.
          if (Math.abs(b.x) > 0.05 * W || b.z < floor + 40) continue;
          const e1 = b.clone().sub(p(ix - 1));
          const e2 = p(ix + 1).sub(b);
          if (e1.length() < 1e-6 || e2.length() < 1e-6) continue;
          worst = Math.max(worst, e1.angleTo(e2) / ((e1.length() + e2.length()) / 2));
        }
      }
      geometry.dispose();
    }
    // It bends no tighter than its roll (radius over 10 px here): it used
    // to dip into the gutter, creased where it passed over the spine.
    expect(worst).toBeLessThan(0.1);
  });

  it("finds the printed point under the pointer on either open page, and back", () => {
    for (const binding of ["left", "right"] as const) {
      const { f } = flipper(binding, 1, { folio: { tilt: 30 } });
      f.redraw();
      tick(16);
      for (const side of [0, 1] as const) {
        for (const [x, y] of [[0.3, 0.2], [0.8, 0.7]]) {
          const screen = f.screenPoint(side, x, y)!;
          const back = f.pagePoint({ clientX: screen.x, clientY: screen.y })!;
          expect(back.side).toBe(side);
          expect(back.x).toBeCloseTo(x, 2);
          expect(back.y).toBeCloseTo(y, 2);
        }
      }
      // The recto lies on the right of a left-bound book, on the left of a
      // right-bound one; its top left corner is towards the spine on the
      // first, towards the fore-edge on the other.
      const recto = f.screenPoint(1, 0.5, 0.5)!;
      expect(binding === "left" ? recto.x > CX : recto.x < CX).toBe(true);
      const tl = f.screenPoint(1, 0, 0)!;
      const tr = f.screenPoint(1, 1, 0)!;
      expect(tl.x < tr.x).toBe(true);
      expect(tl.y).toBeLessThan(f.screenPoint(1, 0, 1)!.y);
    }
  });

  it("finds no page off the book", () => {
    const { f } = flipper("left");
    expect(f.pagePoint({ clientX: CX + 3 * W, clientY: CY })).toBeNull();
  });

  it("carries a long jump over as one block of leaves, a short one leaf by leaf", async () => {
    const started = () => new Promise((r) => setTimeout(r, 0));
    const long: [string | null, string | null][] = [[null, ""], ...Array.from({ length: 40 }, () => ["", ""] as [string, string])];
    const settled: number[] = [];
    const f = new PageFlipper(canvas, spread, long, 1, (i) => settled.push(i), () => {}, "left", { appearance: { folio: { tilt: 0 } } });
    type Block = { block: { lo: number; hi: number } | null; turns: Map<number, unknown> };
    const peek = () => f as unknown as Block;
    // 30 spreads on (60 pages): one block, no leaf of its own in the air.
    f.go(31);
    await started();
    let most = 0;
    let sawBlock = false;
    for (let i = 0; i < 200 && settled.length === 0; i++) {
      tick(100);
      const b = peek().block;
      if (b) {
        sawBlock = true;
        expect(b).toMatchObject({ lo: 1, hi: 31 });
      }
      most = Math.max(most, peek().turns.size);
    }
    expect(sawBlock).toBe(true);
    expect(most).toBe(0);
    expect(settled).toEqual([31]);
    // 4 spreads back (8 pages): leaf by leaf.
    settled.length = 0;
    f.go(27);
    await started();
    most = 0;
    for (let i = 0; i < 400 && settled.length === 0; i++) {
      tick(50);
      expect(peek().block).toBeNull();
      most = Math.max(most, peek().turns.size);
    }
    expect(most).toBeGreaterThan(0);
    expect(settled).toEqual([27]);
  }, 30_000); // a 40-leaf book flipped tick by tick: 5.8 s on the CI runner
});
