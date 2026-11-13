import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDocument, type PostextConfig, type VDTDocument } from "postext";
import { Texture } from "three";
import { FinishTextures } from "./pageFlip/finish.js";
import { CUT_AIR, CUT_OFF, CUT_OPEN, cutUniforms, dressCut, type CutSources } from "./pageFlip/through.js";
import { cachedThrough, isCut, pagesThrough, withPagesThrough } from "./postext/through.js";
import { finishesOf } from "./viewer/constants.js";

// #1569: a die-cut page paints with the pages its holes show, those pages
// stay painted while it is in reach, its through picture is built again only
// when one of them repaints, and the page meshes take their cut uniforms
// from the book's finishes (off for a book without holes).

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

const mm = (value: number) => ({ value, unit: "mm" as const });
const circle = (id: string, d: number) => ({ id, shape: "circle", x: mm(50 - d / 2), y: mm(70 - d / 2), width: mm(d), height: mm(d), wrap: false });

function book(holes: boolean): VDTDocument {
  const markdown = Array.from({ length: 8 }, (_, k) => `# Page ${k + 1}\n\nText.\n\n:::pagebreak\n`).join("");
  const config = {
    page: { width: mm(100), height: mm(140), dpi: 72, margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
    layout: { layoutType: "single" },
    ...(holes ? { dieCuts: { shapes: [circle("big", 60), circle("small", 30)], pages: [{ pages: "1", die: "big" }, { pages: "3", die: "small" }] } } : {}),
  };
  return buildDocument({ markdown }, config as unknown as PostextConfig);
}

describe("pages seen through die-cuts", () => {
  it("knows which pages are cut and which pages their holes show", () => {
    const doc = book(true);
    expect(isCut(doc, 0)).toBe(true);
    // The leaf's back is cut by the same hole.
    expect(isCut(doc, 1)).toBe(true);
    expect(isCut(doc, 4)).toBe(false);
    // Page 1's hole shows page 3 (the next leaf's front), and through page
    // 3's smaller hole, page 5; page 4 looks back at page 2; page 2 sees
    // only the board.
    expect(pagesThrough(doc, 0)).toEqual([2, 4]);
    expect(pagesThrough(doc, 3)).toEqual([1]);
    expect(pagesThrough(doc, 1)).toEqual([]);
    expect(pagesThrough(doc, 4)).toEqual([]);
    expect(pagesThrough(book(false), 0)).toEqual([]);
  });

  it("paints the pages a hole shows with the window, the ones outside it smaller", () => {
    const doc = book(true);
    const { keep, deep } = withPagesThrough(doc, [0, 1]);
    expect([...keep].sort()).toEqual([0, 1, 2, 4]);
    expect([...deep].sort()).toEqual([2, 4]);
    // A page already in reach is painted at its full size.
    expect([...withPagesThrough(doc, [0, 1, 2, 3]).deep]).toEqual([4]);
    // Without holes the window is the window.
    const flat = withPagesThrough(book(false), [0, 1]);
    expect([[...flat.keep], [...flat.deep]]).toEqual([[0, 1], []]);
  });
});

describe("the through picture's cache", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("builds a page's through picture again only when a page beneath repaints", () => {
    // No 2D context here: each build makes its three canvases and gives up.
    const doc = book(true);
    const createElement = vi.fn(() => ({ width: 0, height: 0, getContext: () => null }));
    vi.stubGlobal("document", { createElement });
    const canvases: Record<number, object> = { 2: {}, 4: {} };
    const canvasOf = (j: number) => canvases[j] as HTMLCanvasElement | undefined;
    expect(cachedThrough(doc, 0, 200, canvasOf)).toBeUndefined();
    expect(createElement).toHaveBeenCalledTimes(3);
    cachedThrough(doc, 0, 200, canvasOf);
    expect(createElement).toHaveBeenCalledTimes(3);
    canvases[4] = {};
    cachedThrough(doc, 0, 200, canvasOf);
    expect(createElement).toHaveBeenCalledTimes(6);
    cachedThrough(doc, 0, 300, canvasOf);
    expect(createElement).toHaveBeenCalledTimes(9);
    // A page without holes has no picture to build.
    expect(cachedThrough(doc, 4, 200, canvasOf)).toBeUndefined();
    expect(createElement).toHaveBeenCalledTimes(9);
  });
});

describe("cut uniforms", () => {
  const through = { width: 2, height: 2, data: new Uint8ClampedArray(16), layers: 3 };
  const meshOf = (mode: number, front: string, back: string) => {
    const uniforms = { ...cutUniforms(mode), uFront: { value: new Texture() as Texture | null }, uBack: { value: null as Texture | null }, uMirror: { value: 0 } };
    return { material: { userData: { uniforms } }, userData: { Front: front, Back: back } as Record<string, unknown>, customDepthMaterial: undefined as unknown };
  };

  it("keeps the cut branches off for pages without holes", () => {
    const f = new FinishTextures();
    f.set(finishesOf([{ src: "a.png" }, { src: "b.png" }]));
    const mesh = meshOf(CUT_AIR, "a.png", "b.png");
    dressCut(mesh, f, 0.5, { shared: "shared", cut: () => ({ uniforms: {} }) });
    const u = mesh.material.userData.uniforms;
    expect([u.uHasFrontCut.value, u.uHasBackCut.value, u.uHasFrontThrough.value]).toEqual([0, 0, 0]);
    expect(mesh.customDepthMaterial).toBeUndefined();
    expect(f.size).toBe(0);
  });

  it("gives an open page its through texture and a leaf its cut shadow", () => {
    const f = new FinishTextures();
    const sources: CutSources = f;
    f.set(new Map([["a.png", { cut: true, through }], ["b.png", { cut: true }]]));
    const open = meshOf(CUT_OPEN, "a.png", "z.png");
    dressCut(open, sources, 0.5, { shared: "shared", cut: () => ({ uniforms: {} }) });
    const u = open.material.userData.uniforms;
    expect([u.uHasFrontCut.value, u.uHasFrontThrough.value, u.uThroughLayers.value, u.uLeafDepth.value]).toEqual([1, 1, 3, 0.5]);
    expect(u.uFrontThrough.value).toBeInstanceOf(Texture);
    expect(open.customDepthMaterial).toBeUndefined();
    expect(f.size).toBe(1);
    // A leaf in the air: no through picture, but its depth material and
    // caster discard its holes.
    const caster = { material: "shared" as unknown };
    const leaf = meshOf(CUT_AIR, "b.png", "z.png");
    leaf.userData.caster = caster;
    const cut = { uniforms: { uCut: { value: null }, uCutBack: { value: 1 }, uMirror: { value: 1 } } };
    dressCut(leaf, sources, 0.5, { shared: "shared", cut: () => cut });
    expect(leaf.material.userData.uniforms.uHasFrontThrough.value).toBe(0);
    expect(leaf.customDepthMaterial).toBeDefined();
    expect(caster.material).toBe(cut);
    expect([cut.uniforms.uCut.value, cut.uniforms.uCutBack.value, cut.uniforms.uMirror.value]).toEqual([leaf.material.userData.uniforms.uFront.value, 0, 0]);
    // The page let go: the through texture goes, the leaf takes the shared caster again.
    f.set(new Map([["b.png", { cut: false }]]));
    expect(f.size).toBe(0);
    dressCut(leaf, sources, 0.5, { shared: "shared", cut: () => cut });
    expect(leaf.customDepthMaterial).toBeUndefined();
    expect(caster.material).toBe("shared");
    expect(CUT_OFF).toBe(0);
  });
});
