import { describe, expect, it } from "vitest";
import type { VDTPage } from "postext";
import { carriedPaintings } from "./postext";

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
