import { describe, expect, it } from "vitest";
import { FinishTextures, HAIRLINE_COAT, dressFinish, finishUniforms, maskHasSheen, maskTexture, type FaceMaskData } from "./pageFlip/finish.js";
import { finishesOf } from "./viewer/constants.js";

// #1568: the finish masks of the pages reach the book by page source, a
// texture is made only for a face that shows one, freed once no page
// carries it, and a varnish or a foil keeps a clear coat on its material.

const mask = (rgba: [number, number, number, number], n = 4): FaceMaskData => {
  const data = new Uint8ClampedArray(n * n * 4);
  for (let i = 0; i < data.length; i += 4) data.set(rgba, i);
  return { width: n, height: n, data };
};

describe("finish masks", () => {
  it("knows a mask with a sheen (a varnish, a foil) from one without", () => {
    expect(maskHasSheen(mask([255, 255, 0, 0]))).toBe(true);
    expect(maskHasSheen(mask([0, 0, 255, 255]))).toBe(false);
    const t = maskTexture(mask([0, 102, 0, 0]));
    expect(t.coat).toBe(true);
    // Data, not colour: three.js leaves it out of sRGB decoding.
    expect(t.texture.colorSpace).not.toBe("srgb");
    expect([t.texture.image.width, t.texture.image.height]).toEqual([4, 4]);
  });

  it("makes a texture only when a face asks, and frees it once no page carries the mask", () => {
    const f = new FinishTextures();
    const gold = mask([255, 255, 0, 0]);
    const white = mask([0, 0, 0, 255]);
    expect(f.set(new Map([["a", { mask: gold }], ["b", { mask: white }]]))).toBe(true);
    expect(f.size).toBe(0);
    const tex = f.maskOf("a");
    expect(tex?.coat).toBe(true);
    expect(f.maskOf("a")).toBe(tex);
    expect(f.maskOf("c")).toBeNull();
    expect(f.maskOf(null)).toBeNull();
    expect(f.size).toBe(1);
    let disposed = 0;
    tex!.texture.addEventListener("dispose", () => disposed++);
    // The same finishes again: nothing changes.
    expect(f.set(new Map([["a", { mask: gold }], ["b", { mask: white }]]))).toBe(false);
    // Page a let go (out of the painting window): its texture goes.
    expect(f.set(new Map([["b", { mask: white }]]))).toBe(true);
    expect(disposed).toBe(1);
    expect(f.size).toBe(0);
    f.maskOf("b");
    f.dispose();
    expect(f.size).toBe(0);
  });

  it("sets a material's mask uniforms and keeps a hairline coat for a varnish", () => {
    const f = new FinishTextures();
    const varnish = mask([0, 255, 0, 0]);
    const fluo = mask([0, 0, 255, 0]);
    f.set(new Map([["v", { mask: varnish }], ["p", { mask: fluo }]]));
    const m = { clearcoat: 0, userData: { uniforms: finishUniforms() } };
    dressFinish(m, f.maskOf("v"), f.maskOf("p"), 0);
    const u = m.userData.uniforms;
    expect([u.uHasFrontMask.value, u.uHasBackMask.value]).toEqual([1, 1]);
    expect(m.clearcoat).toBe(HAIRLINE_COAT);
    // A coated stock keeps its own coat.
    dressFinish(m, f.maskOf("v"), null, 0.35);
    expect(m.clearcoat).toBe(0.35);
    // No sheen anywhere: no coat, and the back face's branch is off.
    dressFinish(m, f.maskOf("p"), null, 0);
    expect(m.clearcoat).toBe(0);
    expect([u.uHasFrontMask.value, u.uHasBackMask.value, u.uBackMask.value]).toEqual([1, 0, null]);
  });

  it("collects the pages' finishes by source, skipping pages without one", () => {
    const gold = mask([255, 255, 0, 0]);
    const out = finishesOf(["a.png", "", null, { src: "b.png" }, { src: "c.png", finish: { mask: gold } }, { src: "", finish: { mask: gold } }]);
    expect([...out.keys()]).toEqual(["c.png"]);
    expect(out.get("c.png")?.mask).toBe(gold);
  });
});
