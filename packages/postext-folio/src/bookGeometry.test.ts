import { describe, expect, it } from "vitest";
import { along, profiles } from "./bookGeometry";

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
});
