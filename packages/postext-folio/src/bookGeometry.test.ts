import { describe, expect, it } from "vitest";
import { along, profiles, spineRoll, SPINE_ROLL_AT } from "./bookGeometry";

const W = 500;
const k = 3.3;
/** A 45 mm block. */
const T = 45 * k;

describe("the open book's shape", () => {
  it("keeps the spine standing when a thick book is opened at its cover", () => {
    const board = 2.2 * k;
    const { left, right } = profiles("hardcover", W, k, board, T - board, { flatLeft: true, noCase: true, roll: 0 });
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

  it("rolls the spine down as leaves pile up on the thin side", () => {
    const rise = (share: number) => profiles("hardcover", W, k, share * T, (1 - share) * T, { noCase: true }).left.rise;
    expect(rise(0.02)).toBeGreaterThan(rise(0.08));
    expect(rise(0.08)).toBeGreaterThan(rise(0.15));
    expect(rise(SPINE_ROLL_AT)).toBe(0);
    expect(rise(0.5)).toBe(0);
    expect(spineRoll(0, T)).toBe(0);
    expect(spineRoll(T / 2, T / 2)).toBe(1);
  });

  it("does the same at the back of the book, mirrored", () => {
    const a = profiles("hardcover", W, k, 0.05 * T, 0.95 * T, { noCase: true });
    const b = profiles("hardcover", W, k, 0.95 * T, 0.05 * T, { noCase: true });
    expect(b.right.rise).toBeCloseTo(a.left.rise, 6);
    expect(b.left.rise).toBe(0);
  });
});
