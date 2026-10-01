import { describe, expect, it } from "vitest";
import { spreadOfPage, spreadsOf } from "./spreads";

describe("spreadsOf", () => {
  it("opens a book on its first recto, alone", () => {
    expect(spreadsOf(5)).toEqual([[null, 0], [1, 2], [3, 4]]);
    expect(spreadsOf(4)).toEqual([[null, 0], [1, 2], [3, null]]);
  });

  it("fills the first spread of a chapter that starts on a verso", () => {
    expect(spreadsOf(3, false)).toEqual([[0, 1], [2, null]]);
  });

  it("has no spreads for no pages", () => {
    expect(spreadsOf(0)).toEqual([]);
  });

  it("finds the spread of a page", () => {
    const spreads = spreadsOf(5);
    expect(spreadOfPage(spreads, 0)).toBe(0);
    expect(spreadOfPage(spreads, 2)).toBe(1);
    expect(spreadOfPage(spreads, 4)).toBe(2);
  });
});
