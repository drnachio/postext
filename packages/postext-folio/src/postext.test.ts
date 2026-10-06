import { describe, expect, it } from "vitest";
import type { VDTDocument, VDTPage } from "postext";
import { appearanceOf, carriedPaintings, sweepFor } from "./postext";

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

describe("appearanceOf", () => {
  // A book with its own covers (`binding.cover: 'pages'`), four pages of it.
  const doc = (extra: Partial<VDTDocument> = {}) =>
    ({
      pages: [0, 1, 2, 3].map((i) => page(i)),
      trimOffset: 0,
      config: { page: { dpi: 300 }, folio: { binding: { type: "hardcover", cover: "pages" } } },
      ...extra,
    }) as unknown as VDTDocument;

  it("turns the covers of a whole book as boards", () => {
    expect(appearanceOf(doc(), undefined).covers).toEqual({ front: true, back: true });
  });

  it("gives a chapter from the middle of the book paper leaves at both ends (#449)", () => {
    const a = appearanceOf(doc({ pageIndexOffset: 10 }), { extraPages: { before: 10, after: 20 } });
    expect(a.covers).toEqual({ front: false, back: false });
    expect(a.extraPages).toEqual({ before: 10, after: 20 });
  });

  it("keeps the front cover on the first chapter and the back one on the last", () => {
    expect(appearanceOf(doc(), { extraPages: { before: 0, after: 20 } }).covers).toEqual({ front: true, back: false });
    expect(appearanceOf(doc({ pageIndexOffset: 10 }), { extraPages: { before: 10, after: 0 } }).covers).toEqual({ front: false, back: true });
  });

  it("falls back on the document's own offset and book page count", () => {
    expect(appearanceOf(doc({ pageIndexOffset: 10, bookPageCount: 30 }), undefined)).toMatchObject({
      covers: { front: false, back: false },
      extraPages: { before: 10, after: 16 },
    });
  });

  // A newspaper with no folio settings of its own (#506).
  const news = (sizePreset: string, folio?: unknown) =>
    ({ pages: [0, 1, 2, 3].map((i) => page(i)), trimOffset: 0, config: { page: { dpi: 300, sizePreset }, ...(folio ? { folio } : {}) } }) as unknown as VDTDocument;

  it("shows a newspaper trim on folded newsprint (#506)", () => {
    for (const preset of ["broadsheet", "berliner", "tabloid", "compact"]) {
      expect(appearanceOf(news(preset), undefined).folio).toEqual({ paper: { type: "newsprint" }, binding: { type: "folded" } });
    }
    // The host's settings get the same defaults (the Sandbox passes its raw config).
    expect(appearanceOf(news("tabloid"), { folio: { tilt: 30 } }).folio).toEqual({ tilt: 30, paper: { type: "newsprint" }, binding: { type: "folded" } });
    expect(appearanceOf(news("tabloid"), { folio: undefined }).folio).toEqual({ paper: { type: "newsprint" }, binding: { type: "folded" } });
  });

  it("keeps the stock and binding a newspaper names, and a book's defaults (#506)", () => {
    const chosen = { paper: { type: "uncoated" }, binding: { type: "saddleStitch" } };
    expect(appearanceOf(news("broadsheet", chosen), undefined).folio).toEqual(chosen);
    expect(appearanceOf(news("broadsheet"), { folio: chosen as never }).folio).toEqual(chosen);
    expect(appearanceOf(news("17x24"), undefined).folio).toBeUndefined();
  });
});
