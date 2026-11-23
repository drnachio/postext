// The finished picture (#1676), run without WebGL: the renderer and the
// passes are stubs. A book at rest is drawn sixteen times more, each a
// fraction of a pixel aside, and the view is left as it was.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PerspectiveCamera, Scene, type WebGLRenderer } from "three";

/** What each of the composer's pictures was drawn with. */
const drawn: { offset: [number, number]; grain: number; smoothed: boolean; toScreen: boolean; shadows: boolean }[] = [];
let probe: () => Omit<(typeof drawn)[number], "smoothed" | "toScreen"> = () => ({ offset: [0, 0], grain: 0, shadows: true });

vi.mock("three/examples/jsm/postprocessing/EffectComposer.js", () => ({
  EffectComposer: class {
    renderToScreen = true;
    readBuffer = { texture: {} };
    passes: { enabled: boolean }[] = [];
    addPass(pass: { enabled: boolean }) {
      this.passes.push(pass);
    }
    setPixelRatio() {}
    setSize() {}
    render() {
      drawn.push({ ...probe(), smoothed: this.passes[2].enabled, toScreen: this.renderToScreen });
    }
    dispose() {}
  },
}));
vi.mock("three/examples/jsm/postprocessing/RenderPass.js", () => ({ RenderPass: class { enabled = true; } }));
vi.mock("three/examples/jsm/postprocessing/OutputPass.js", () => ({ OutputPass: class { enabled = true; } }));
vi.mock("three/examples/jsm/postprocessing/SMAAPass.js", () => ({ SMAAPass: class { enabled = true; } }));

const { Picture, REST_SAMPLES, halton, restOffset } = await import("./picture.js");
const { occlusionUniforms } = await import("./occlusion.js");

let frames: FrameRequestCallback[] = [];
let clock = 0;
/** Runs the frames asked for, `ms` later. */
function tick(ms: number) {
  clock += ms;
  const queue = frames;
  frames = [];
  for (const cb of queue) cb(clock);
}

function picture({ float = true, atRest = () => true } = {}) {
  const renderer = {
    extensions: { has: () => float },
    shadowMap: { autoUpdate: true },
    autoClear: true,
    setRenderTarget() {},
    render() {},
  };
  const camera = new PerspectiveCamera(24, 1, 1, 100);
  camera.setViewOffset(800, 600, 12, -7, 800, 600);
  probe = () => ({ offset: [camera.view!.offsetX - 12, camera.view!.offsetY + 7], grain: occlusionUniforms.uGrain.value.x, shadows: renderer.shadowMap.autoUpdate });
  const over = vi.fn();
  const p = new Picture(renderer as unknown as WebGLRenderer, new Scene(), camera, atRest);
  p.setSize(800, 600);
  return { p, over, camera, renderer };
}

beforeEach(() => {
  frames = [];
  clock = 0;
  drawn.length = 0;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal("cancelAnimationFrame", () => {
    frames = [];
  });
  vi.spyOn(performance, "now").mockImplementation(() => clock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("where the pictures of a book at rest are taken", () => {
  it("spreads them evenly over the pixel, never the same place twice", () => {
    const at = Array.from({ length: REST_SAMPLES }, (_, i) => restOffset(i + 1));
    for (const [x, y] of at) {
      expect(Math.abs(x)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(y)).toBeLessThanOrEqual(0.5);
    }
    expect(new Set(at.map(([x, y]) => `${x},${y}`)).size).toBe(REST_SAMPLES);
    // A quarter of them in each quarter of the pixel across, and their
    // middle at the pixel's own.
    for (const lo of [-0.5, -0.25, 0, 0.25]) expect(at.filter(([x]) => x >= lo && x < lo + 0.25)).toHaveLength(REST_SAMPLES / 4);
    const mean = (k: 0 | 1) => at.reduce((s, o) => s + o[k], 0) / REST_SAMPLES;
    expect(Math.abs(mean(0))).toBeLessThan(0.05);
    expect(Math.abs(mean(1))).toBeLessThan(0.05);
    expect(halton(1, 2)).toBe(0.5);
    expect(halton(3, 2)).toBe(0.75);
  });
});

describe("the finished picture", () => {
  it("draws a book left at rest sixteen times more, each a fraction of a pixel aside", () => {
    const { p, over, camera, renderer } = picture();
    p.render(over);
    expect(drawn).toEqual([{ offset: [0, 0], grain: 0, shadows: true, smoothed: true, toScreen: true }]);
    expect(over).toHaveBeenCalledTimes(1);
    // Not at once: a hand turning the view draws a frame for each move.
    tick(16);
    tick(16);
    expect(drawn).toHaveLength(1);
    for (let i = 0; i < 40; i++) tick(16);
    expect(drawn).toHaveLength(1 + REST_SAMPLES);
    expect(frames).toHaveLength(0);
    const samples = drawn.slice(1);
    samples.forEach((s, i) => {
      const [dx, dy] = restOffset(i + 1);
      expect(s.offset[0]).toBeCloseTo(dx, 9);
      expect(s.offset[1]).toBeCloseTo(dy, 9);
      // Kept off the screen and not smoothed, the shadow map as it stood.
      expect(s).toMatchObject({ smoothed: false, toScreen: false, shadows: false });
    });
    // The shading's grain differs from one to the next, so it evens out.
    expect(new Set(samples.map((s) => s.grain)).size).toBe(REST_SAMPLES);
    // The glass is drawn again over each average shown (from the fourth).
    expect(over).toHaveBeenCalledTimes(1 + REST_SAMPLES - 3);
    // And everything is left as a frame in motion needs it.
    expect([camera.view!.offsetX, camera.view!.offsetY]).toEqual([12, -7]);
    expect(occlusionUniforms.uGrain.value.toArray()).toEqual([0, 0]);
    expect(renderer.shadowMap.autoUpdate).toBe(true);
    expect(renderer.autoClear).toBe(true);
    p.render(over);
    expect(drawn[drawn.length - 1]).toMatchObject({ offset: [0, 0], smoothed: true, toScreen: true });
  });

  it("starts over when the book is drawn again before it is done", () => {
    const { p, over } = picture();
    p.render(over);
    for (let i = 0; i < 12; i++) tick(16);
    const before = drawn.length;
    expect(before).toBeGreaterThan(1);
    expect(before).toBeLessThan(1 + REST_SAMPLES);
    p.render(over);
    for (let i = 0; i < 40; i++) tick(16);
    expect(drawn).toHaveLength(before + 1 + REST_SAMPLES);
    expect(drawn[before + 1].offset[0]).toBeCloseTo(restOffset(1)[0], 9);
  });

  it("leaves a book in motion to its own frames, and a cleared canvas alone", () => {
    let moving = true;
    const { p, over } = picture({ atRest: () => !moving });
    p.render(over);
    for (let i = 0; i < 20; i++) tick(16);
    expect(drawn).toHaveLength(1);
    // The last frame of the turn asks again.
    moving = false;
    p.render(over);
    for (let i = 0; i < 9; i++) tick(16);
    expect(drawn.length).toBeGreaterThan(2);
    const cleared = drawn.length;
    p.cancel();
    for (let i = 0; i < 40; i++) tick(16);
    expect(drawn).toHaveLength(cleared);
  });

  it("only smooths the frame where there is no float picture to average in", () => {
    const { p, over } = picture({ float: false });
    p.render(over);
    for (let i = 0; i < 40; i++) tick(16);
    expect(drawn).toHaveLength(1);
  });
});
