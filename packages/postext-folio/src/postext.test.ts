import { describe, expect, it } from "vitest";
import type { VDTPage } from "postext";
import { carriedPaintings, sweepFor } from "./postext";

const page = (index: number, text = `p${index}`) => ({ index, width: 100, height: 140, text }) as unknown as VDTPage;

describe("carriedPaintings", () => {
  it("keeps the painting of the same page object", () => {
    const before = [page(0), page(1), page(2)];
    const next = [before[0]!, before[1]!, page(2, "edited")];
    expect([...carriedPaintings(before, [0, 1, 2], next, [0, 1, 2])]).toEqual([[0, 0], [1, 1]]);
  });

  it("keeps the painting of a page that reads the same (a relayout of its chapter)", () => {
    const before = [page(0), page(1)];
    const next = [page(0), page(1)];
    expect([...carriedPaintings(before, [0, 1], next, [0, 1])]).toEqual([[0, 0], [1, 1]]);
  });

  it("only carries painted pages, and only to wanted ones", () => {
    const before = [page(0), page(1), page(2)];
    const next = [page(0), page(1), page(2)];
    expect([...carriedPaintings(before, [1, 2], next, [0, 1])]).toEqual([[1, 1]]);
  });

  it("gives each painting to one page at most", () => {
    const blank = { index: 0, width: 100, height: 140 } as unknown as VDTPage;
    const before = [blank];
    const next = [{ ...blank }, { ...blank }];
    expect([...carriedPaintings(before, [0], next, [0, 1])]).toEqual([[0, 0]]);
  });
});

describe("sweepFor", () => {
  it("sweeps every page between the spread at rest and the target", () => {
    const { pages } = sweepFor(null, [0], [3, 4], 100);
    expect(pages).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("keeps only the pages on show for a long jump from rest (a block)", () => {
    const { run, pages } = sweepFor(null, [1, 2], [41, 42], 100);
    expect(run).toEqual({ from: [1, 2], block: [41, 42] });
    expect(pages).toEqual([1, 2]);
  });

  it("carries a run of fast clicks on leaf by leaf past the block threshold", () => {
    let run = null;
    let pages: number[] = [];
    // Twelve clicks, each set before the book comes to rest.
    for (let s = 1; s <= 12; s++) ({ run, pages } = sweepFor(run, [1, 2], [2 * s + 1, 2 * s + 2], 100));
    expect(run!.block).toBeNull();
    for (let i = 1; i <= 26; i++) expect(pages).toContain(i);
  });

  it("sweeps on from where a block lands when a click follows it", () => {
    const first = sweepFor(null, [1, 2], [41, 42], 100);
    const { pages } = sweepFor(first.run, [1, 2], [43, 44], 100);
    expect(pages).toEqual([1, 2, 40, 41, 42, 43, 44, 45]);
  });

  it("lifts backwards in reverse order", () => {
    const { pages } = sweepFor(null, [9, 10], [5, 6], 100);
    expect(pages).toEqual([11, 10, 9, 8, 7, 6, 5, 4]);
  });
});
