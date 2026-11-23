import { describe, expect, it } from "vitest";
import type { VDTDocument, VDTPage } from "postext";
import { boardMap, boardsOf, boardedLabels, boardedViewer, withBoards } from "./boards.js";
import type { FolioAppearance, FolioState, FolioViewer } from "../viewer/types.js";

// The print cover bound round the pages as two boards (#1685).

const doc = (pages: number, binding: Record<string, unknown> = { type: "paperback" }, extra: Partial<VDTDocument> = {}) =>
  ({
    pages: Array.from({ length: pages }, (_, i) => ({ index: i, width: 100, height: 140 }) as unknown as VDTPage),
    trimOffset: 0,
    config: { page: { dpi: 300 }, folio: { binding } },
    ...extra,
  }) as unknown as VDTDocument;
const faces: FolioAppearance = { coverFaces: { front: "front.jpg", back: "back.jpg", frontAlt: "Front cover" } };

describe("boardsOf", () => {
  it("binds both boards round a whole book, a blank verso before the back one after a recto", () => {
    expect(boardsOf(doc(4), faces)).toMatchObject({ lead: 2, pad: 0, trail: 2, front: "front.jpg", back: "back.jpg" });
    expect(boardsOf(doc(5), faces)).toMatchObject({ lead: 2, pad: 1, trail: 3 });
  });

  it("binds none without the faces, on a book with its own covers, stapled or folded", () => {
    expect(boardsOf(doc(4), {})).toMatchObject({ lead: 0, trail: 0 });
    expect(boardsOf(doc(4, { type: "paperback", cover: "pages" }), faces)).toMatchObject({ lead: 0, trail: 0 });
    expect(boardsOf(doc(4, { type: "saddleStitch" }), faces)).toMatchObject({ lead: 0, trail: 0 });
    expect(boardsOf(doc(4, { type: "folded" }), faces)).toMatchObject({ lead: 0, trail: 0 });
  });

  it("gives a chapter only the boards at the book's ends", () => {
    const middle = boardsOf(doc(4), { ...faces, extraPages: { before: 10, after: 10 } });
    expect(middle).toMatchObject({ lead: 0, trail: 0 });
    const opening = boardsOf(doc(4), { ...faces, extraPages: { before: 0, after: 10 } });
    expect(opening).toMatchObject({ lead: 2, trail: 0 });
    // The last chapter, starting on a verso (page 12 of the book).
    const closing = boardsOf(doc(3, { type: "paperback" }, { pageIndexOffset: 11 }), { ...faces, extraPages: { before: 11, after: 0 } });
    expect(closing).toMatchObject({ lead: 0, pad: 0, trail: 2 });
  });
});

describe("withBoards and the map", () => {
  it("puts the faces outside and blank insides, and keeps the host in the document's pages", () => {
    const b = boardsOf(doc(5), faces);
    const pages = withBoards(["a", "b", "c", "d", "e"], b);
    expect(pages).toEqual([{ src: "front.jpg", alt: "Front cover" }, "", "a", "b", "c", "d", "e", "", "", "back.jpg"]);
    const map = boardMap(() => b, () => 5);
    expect(map.toView(0)).toBe(2);
    expect(map.toDoc(1)).toBeUndefined();
    expect(map.toDoc(6)).toBe(4);
    // Closed on the front cover: the first page, the first spread.
    const both = { front: true, back: true };
    expect(map.state({ spread: 0, pages: [0] })).toEqual({ spread: 0, pages: [0], cover: { ...both, closed: "front" } });
    expect(map.state({ spread: 1, pages: [1, 2] })).toEqual({ spread: 0, pages: [0], cover: both });
    expect(map.state({ spread: 2, pages: [3, 4] })).toEqual({ spread: 1, pages: [1, 2], cover: both });
    // Closed on the back cover: the last page.
    expect(map.state({ spread: 5, pages: [9] })).toEqual({ spread: 4, pages: [4], cover: { ...both, closed: "back" } });
    // The insides of the back cover: open, not closed.
    expect(map.state({ spread: 4, pages: [7, 8] })).toEqual({ spread: 3, pages: [4], cover: both });
    expect(map.point({ page: 0, x: 0.5, y: 0.5 })).toBeNull();
    expect(map.point({ page: 3, x: 0.5, y: 0.5 })).toEqual({ page: 1, x: 0.5, y: 0.5 });
  });

  it("counts the document's pages under the book", () => {
    const b = boardsOf(doc(4), faces);
    const map = boardMap(() => b, () => 4);
    const labels = boardedLabels(undefined, (pages, total) => `${pages.join(",")}/${total}`, map, () => 4);
    expect(labels.count!([3, 4], 8)).toBe("1,2/4");
    expect(labels.count!([0], 8)).toBe("");
  });

  it("keeps the book closed when a position is restored to the page under its cover", () => {
    const b = boardsOf(doc(4), faces);
    const calls: number[] = [];
    let state: FolioState = { spread: 0, pages: [0] };
    const raw = { get state() { return state; }, goToPage: (i: number) => calls.push(i) } as unknown as FolioViewer;
    const viewer = boardedViewer(raw, boardMap(() => b, () => 4), () => b);
    viewer.goToPage(0, { instant: true });
    expect(calls).toEqual([]);
    viewer.goToPage(0);
    expect(calls).toEqual([2]);
    state = { spread: 1, pages: [1, 2] };
    viewer.goToPage(0, { instant: true });
    expect(calls).toEqual([2, 2]);
  });
});
