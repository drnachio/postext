import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDocument, type PostextConfig, type VDTDocument } from "postext";
import { paintThrough } from "./postext/through.js";

// #1592: holes that widen beneath the page (the leaves already turned, seen
// from their backs: the last turned leaf's small hole over the wider holes
// of the leaves turned before it). The straight-down picture shows only the
// small hole; the through data also carries each layer's own hole, so the
// shader's walk finds the wider ones under the overhang and draws their
// steps instead of one straight cylinder.

class StubCtx {
  font = "";
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

/** A 2D context that fills a path's bounding box (the holes here are
 *  circles: their boxes are enough to tell them apart), under the
 *  transform it was given; drawn images and rectangles fill everything. */
class BoxCtx {
  private t = [1, 0, 0, 1, 0, 0];
  private pts: [number, number][] = [];
  private cover: Uint8ClampedArray;
  globalCompositeOperation = "";
  fillStyle = "";
  constructor(private w: number, private h: number) {
    this.cover = new Uint8ClampedArray(w * h);
  }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number) {
    this.t = [a, b, c, d, e, f];
  }
  private at(x: number, y: number): [number, number] {
    const [a, , , d, e, f] = this.t as [number, number, number, number, number, number];
    return [a * x + e, d * y + f];
  }
  save() {}
  restore() {}
  clip() {}
  beginPath() {
    this.pts = [];
  }
  moveTo(x: number, y: number) {
    this.pts.push(this.at(x, y));
  }
  lineTo(x: number, y: number) {
    this.pts.push(this.at(x, y));
  }
  bezierCurveTo(_a: number, _b: number, _c: number, _d: number, x: number, y: number) {
    this.pts.push(this.at(x, y));
  }
  quadraticCurveTo(_a: number, _b: number, x: number, y: number) {
    this.pts.push(this.at(x, y));
  }
  closePath() {}
  fill() {
    const xs = this.pts.map((p) => p[0]);
    const ys = this.pts.map((p) => p[1]);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++)
        if (x + 0.5 > Math.min(...xs) && x + 0.5 < Math.max(...xs) && y + 0.5 > Math.min(...ys) && y + 0.5 < Math.max(...ys)) this.cover[y * this.w + x] = 255;
  }
  clearRect() {
    this.cover.fill(0);
  }
  fillRect() {
    this.cover.fill(255);
  }
  drawImage() {
    this.cover.fill(255);
  }
  getImageData(x0: number, y0: number, w: number, h: number) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[(y * w + x) * 4 + 3] = this.cover[(y + y0) * this.w + x + x0]!;
    return { data };
  }
}

const mm = (value: number) => ({ value, unit: "mm" as const });
const circle = (id: string, d: number) => ({ id, shape: "circle", x: mm(50 - d / 2), y: mm(70 - d / 2), width: mm(d), height: mm(d), wrap: false });

/** Page 1's hole is small, page 3's wide: seen from page 1, the hole
 *  widens beneath it. */
function book(): VDTDocument {
  const markdown = Array.from({ length: 8 }, (_, k) => `# Page ${k + 1}\n\nText.\n\n:::pagebreak\n`).join("");
  const config = {
    page: { width: mm(100), height: mm(140), dpi: 72, margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
    layout: { layoutType: "single" },
    dieCuts: { shapes: [circle("small", 30), circle("wide", 60)], pages: [{ pages: "1", die: "small" }, { pages: "3", die: "wide" }] },
  };
  return buildDocument({ markdown }, config as unknown as PostextConfig);
}

describe("each layer's own cut in the through data", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("marks the wider hole beneath an overhang, which the straight-down picture cannot show", () => {
    const doc = book();
    const W = 100;
    vi.stubGlobal("document", {
      createElement: () => {
        const canvas = { width: 0, height: 0, ctx: null as BoxCtx | null, getContext: () => (canvas.ctx ??= new BoxCtx(canvas.width, canvas.height)) };
        return canvas;
      },
    });
    const through = paintThrough(doc, 0, W, () => ({}) as CanvasImageSource)!;
    expect(through.cuts).toBeDefined();
    const cuts = through.cuts!;
    const word = (x: number, y: number) => {
      const p = (y * through.width + x) * 4;
      return cuts[p]! | (cuts[p + 1]! << 8) | (cuts[p + 2]! << 16) | (cuts[p + 3]! << 24);
    };
    // Fractions of the page: its middle, a point inside the wide hole but
    // outside the small one, and a point outside both.
    const px = (fx: number, fy: number) => word(Math.floor(fx * through.width), Math.floor(fy * through.height));
    // Layer 1 (page 3) has its wide hole at the middle and under the
    // overhang; nothing is cut out at the page's corner.
    expect(px(0.5, 0.5) & 1).toBe(1);
    expect(px(0.5 + 0.22, 0.5) & 1).toBe(1);
    expect(px(0.05, 0.05)).toBe(0);
  });
});
