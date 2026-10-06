import { describe, expect, it } from "vitest";
import { ATLAS_MAX, packVideoAtlas, type AtlasRect } from "./videoAtlas";

const overlaps = (a: AtlasRect, b: AtlasRect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe("packVideoAtlas (#507)", () => {
  it("gives one picture a slot of its own size, the atlas no larger", () => {
    const { width, height, rects } = packVideoAtlas([{ width: 640, height: 360 }]);
    expect(rects).toEqual([{ x: 0, y: 0, width: 640, height: 360 }]);
    expect(width).toBe(640);
    expect(height).toBe(360);
  });

  it("packs several side by side, apart, in the order given", () => {
    const sizes = [
      { width: 300, height: 200 },
      { width: 500, height: 280 },
      { width: 200, height: 360 },
    ];
    const { width, height, rects } = packVideoAtlas(sizes);
    rects.forEach((r, i) => {
      expect(r.width).toBe(sizes[i]!.width);
      expect(r.height).toBe(sizes[i]!.height);
    });
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlaps(rects[i]!, rects[j]!)).toBe(false);
    for (const r of rects) {
      expect(r.x + r.width).toBeLessThanOrEqual(width);
      expect(r.y + r.height).toBeLessThanOrEqual(height);
    }
  });

  it("scales them all down together when they do not fit", () => {
    const sizes = Array.from({ length: 8 }, () => ({ width: 1600, height: 900 }));
    const { width, height, rects } = packVideoAtlas(sizes);
    expect(width).toBeLessThanOrEqual(ATLAS_MAX);
    expect(height).toBeLessThanOrEqual(ATLAS_MAX);
    // Each keeps its shape, and none overlaps another.
    for (const r of rects) expect(r.width / r.height).toBeCloseTo(16 / 9, 1);
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlaps(rects[i]!, rects[j]!)).toBe(false);
    // Not needlessly small: the slots fill a fair share of the atlas.
    const used = rects.reduce((s, r) => s + r.width * r.height, 0);
    expect(used / (ATLAS_MAX * ATLAS_MAX)).toBeGreaterThan(0.4);
  });

  it("packs nothing into nothing", () => {
    expect(packVideoAtlas([])).toEqual({ width: 0, height: 0, rects: [] });
  });
});
