import { describe, expect, it } from "vitest";
import { along, column, PAGE_LIFT, profiles, stackGeometry } from "./bookGeometry.js";
import { NX_OPEN } from "./pageFlip/constants.js";

const W = 500;
const k = 3.3;
/** A 45 mm block. */
const T = 45 * k;

describe("the open book's shape", () => {
  it("keeps the spine standing when a thick book is opened at its cover", () => {
    const board = 2.2 * k;
    const { left, right } = profiles("hardcover", W, k, board, T - board, { flatLeft: true, noCase: true });
    // The cover hangs from the top of the spine down to the desk.
    const [, spineZ] = along(left, 0);
    const [edgeX, edgeZ] = along(left, W);
    expect(spineZ).toBeGreaterThan(0.9 * (T - board));
    expect(edgeZ).toBeLessThan(board + 1);
    // A straight board, its length kept: a right triangle with the spine.
    expect(Math.hypot(edgeX, spineZ - edgeZ)).toBeCloseTo(W, -1);
    // The pages on the other side lie flat, meeting it at the spine.
    expect(Math.abs(along(right, 0)[1] - spineZ)).toBeLessThan(2);
  });

  it("lowers the thin side as it grows, its top always meeting the other at the spine", () => {
    const at = (share: number) => profiles("hardcover", W, k, share * T, (1 - share) * T, { noCase: true });
    let last = Infinity;
    for (const share of [0.02, 0.1, 0.2, 0.35, 0.45]) {
      const { left, right } = at(share);
      // No spine showing between them.
      expect(Math.abs(along(left, 0)[1] - along(right, 0)[1])).toBeLessThan(1);
      expect(left.rise).toBeLessThan(last);
      last = left.rise;
    }
    // Open at the middle both blocks lie flat, level.
    const { left, right } = at(0.5);
    expect(left.rise).toBe(0);
    expect(right.rise).toBe(0);
    expect(Math.abs(along(left, W)[1] - along(right, W)[1])).toBeLessThan(0.01);
  });

  it("does the same at the back of the book, mirrored", () => {
    const a = profiles("hardcover", W, k, 0.05 * T, 0.95 * T, { noCase: true });
    const b = profiles("hardcover", W, k, 0.95 * T, 0.05 * T, { noCase: true });
    expect(b.right.rise).toBeCloseTo(a.left.rise, 6);
    expect(b.left.rise).toBe(0);
  });

  it("lets folded sheets gape at the fold more than stapled ones (#506)", () => {
    const t = 3 * k;
    const stapled = profiles("saddleStitch", W, k, t, t, { noCase: true });
    const folded = profiles("folded", W, k, t, t, { noCase: true });
    // The top leaves meet lower in the fold, over a wider shoulder.
    expect(along(folded.right, 0)[1]).toBeLessThan(along(stapled.right, 0)[1]);
    expect(folded.right.g).toBeGreaterThan(stapled.right.g);
    // Away from the fold both lie on their stacks.
    expect(along(folded.right, W)[1]).toBeCloseTo(along(stapled.right, W)[1], 1);
  });
});

describe("the block's sides under an open page (#1676)", () => {
  const W = 479;
  const H = 726;

  it("end at the page's own edge: the same points, to the bit", () => {
    for (const binding of ["paperback", "hardcover"] as const) {
      const { right, left } = profiles(binding, W, 3.09, 30, 44.3, { noCase: true });
      for (const [p, side] of [[right, 1], [left, -1]] as const) {
        const pos = stackGeometry(p, side, W, H, 36).getAttribute("position");
        const at = new Set<string>();
        for (let i = 0; i < pos.count; i++) at.add(`${pos.getX(i)},${pos.getY(i)},${pos.getZ(i)}`);
        // The open page's vertices, as the flipper lays them: every one of
        // them along the head and the tail is a vertex of the block too.
        for (let c = 0; c <= NX_OPEN; c++) {
          const [x, z] = along(p, column(c / NX_OPEN) * W);
          for (const y of [H / 2, -H / 2]) expect(at.has(`${Math.fround(side * x)},${y},${Math.fround(z + PAGE_LIFT)}`)).toBe(true);
        }
      }
    }
  });

  it("stay under the page everywhere else", () => {
    const { right } = profiles("paperback", W, 3.09, 30, 44.3, { noCase: true });
    const g = stackGeometry(right, 1, W, H, 36);
    const pos = g.getAttribute("position");
    const lambda = g.getAttribute("lambda");
    let top = 0;
    for (let i = 0; i < pos.count; i++) {
      if (lambda.getX(i) === 1) top++;
      else expect(pos.getZ(i)).toBeLessThan(44.3 + PAGE_LIFT);
    }
    // Head, tail and fore-edge.
    expect(top).toBe(2 * (NX_OPEN + 1) + 2);
  });
});
