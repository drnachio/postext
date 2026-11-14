import { describe, expect, it } from "vitest";
import { buildDocument, type PostextConfig, type VDTDocument } from "postext";
import { profiles, stackGeometry } from "./bookGeometry.js";
import { edgeOutlineOf } from "./postext/book.js";

// #1591: a book whose leaves are cut with rounded corners shows them on the
// blocks of leaves too, not only on the top leaf: the blocks' sides follow
// the leaves' outline.

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

function book(corners?: { radius: ReturnType<typeof mm>; edges?: "fore" | "all" }, binding: "left" | "right" = "left"): VDTDocument {
  const markdown = Array.from({ length: 4 }, (_, k) => `# Page ${k + 1}\n\nText.\n\n:::pagebreak\n`).join("");
  const config = {
    page: { width: mm(100), height: mm(140), dpi: 72, binding, margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
    layout: { layoutType: "single" },
    ...(corners ? { dieCuts: { corners } } : {}),
  };
  return buildDocument({ markdown }, config as unknown as PostextConfig);
}

describe("the leaves' outline past the spine", () => {
  it("is undefined for leaves cut square", () => {
    expect(edgeOutlineOf(book())).toBeUndefined();
  });

  it("runs from the spine at the head round the rounded fore-edge corners to the spine at the foot", () => {
    for (const binding of ["left", "right"] as const) {
      const outline = edgeOutlineOf(book({ radius: mm(10) }, binding))!;
      expect(outline.length).toBeGreaterThan(4);
      expect(outline[0]).toEqual([0, 0]);
      expect(outline[outline.length - 1]).toEqual([0, 1]);
      // No point at the square fore-edge corners: they are rounded away.
      for (const [s, v] of outline) expect(s > 0.99 && (v < 0.01 || v > 0.99)).toBe(false);
      // It reaches the fore-edge.
      expect(Math.max(...outline.map(([s]) => s))).toBeCloseTo(1, 3);
    }
  });

  it("rounds the spine corners too when all four are", () => {
    const outline = edgeOutlineOf(book({ radius: mm(10), edges: "all" }))!;
    // It leaves the spine below the head and comes back above the foot.
    expect(outline[0]![0]).toBeCloseTo(0, 3);
    expect(outline[0]![1]).toBeGreaterThan(0.05);
    expect(outline[outline.length - 1]![1]).toBeLessThan(0.95);
  });
});

describe("a block of cut leaves", () => {
  const W = 500;
  const H = 700;
  const { right } = profiles("paperback", W, 3.3, 3, 40, { noCase: true });
  const outline = edgeOutlineOf(book({ radius: mm(10) }))!;

  it("stands its sides along the outline, the square corners cut away", () => {
    const g = stackGeometry(right, 1, W, H, 20, outline);
    const pos = g.getAttribute("position");
    const nrm = g.getAttribute("normal");
    let diagonal = 0;
    for (let i = 0; i < pos.count; i++) {
      // Nothing stands at the square corner's place.
      const x = pos.getX(i);
      const y = pos.getY(i);
      expect(x > W - 3 && Math.abs(y) > H / 2 - 3).toBe(false);
      if (Math.abs(nrm.getX(i)) > 0.2 && Math.abs(nrm.getY(i)) > 0.2) diagonal++;
    }
    // The rounded corners face out on the slant.
    expect(diagonal).toBeGreaterThan(0);
  });

  it("is the plain head, tail and fore-edge without an outline", () => {
    const g = stackGeometry(right, 1, W, H, 20);
    const pos = g.getAttribute("position");
    let corner = 0;
    for (let i = 0; i < pos.count; i++) if (pos.getX(i) > W - 3 && Math.abs(pos.getY(i)) > H / 2 - 1) corner++;
    expect(corner).toBeGreaterThan(0);
  });
});
