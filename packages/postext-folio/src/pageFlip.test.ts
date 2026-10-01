// The folio's page flipper, run without WebGL: the renderer is a
// stub, the scene graph and the leaves' geometry are three.js's own. A
// right-bound book lies mirrored on the desk (verso on the right, recto on
// the left) and its leaves turn from left to right.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Vector3, type Mesh, type PlaneGeometry, type ShaderMaterial } from "three";

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
  classList: { add() {}, remove() {} },
} as unknown as HTMLElement;
// Blank pages throughout: nothing to load.
const book: [string | null, string | null][] = [[null, ""], ["", ""], ["", ""], ["", ""]];
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

function flipper(binding: "left" | "right", at = 1) {
  const settled: number[] = [];
  const targets: number[] = [];
  const f = new PageFlipper(canvas, spread, book, at, (i) => settled.push(i), (i) => targets.push(i), binding);
  return { f, settled, targets };
}

type Inside = { left: Mesh<PlaneGeometry, ShaderMaterial>; leaves: Map<number, Mesh<PlaneGeometry, ShaderMaterial>>; scene: { updateMatrixWorld(): void } };
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
    // The verso lying flat: its outer edge (vertex 1 of the flat quad).
    expect(screenX(f, inside(f).left, 1)).toBeCloseTo(W);
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
    expect(leaf.material.uniforms.uMirror.value).toBe(1);
  });

  it("lays a left-bound spread out as the DOM does", () => {
    const { f } = flipper("left");
    f.grab(onPage("right"));
    tick(16);
    expect(screenX(f, inside(f).left, 1)).toBeCloseTo(-W);
    const leaf = inside(f).leaves.get(1)!;
    expect(screenX(f, leaf, (120 / 2) * 97 + 96)).toBeGreaterThan(0);
    expect(leaf.material.uniforms.uMirror.value).toBe(0);
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
});
