import { describe, expect, it } from "vitest";
import presetIndex from "../../public/presets/index.json";
import { shelfOrder } from "./shelf";

describe("the showcase shelf", () => {
  it("keeps the index order for books without a shelfOrder and puts the others after them", () => {
    const books = [{ id: "a" }, { id: "z", shelfOrder: 1 }, { id: "b" }, { id: "c" }];
    expect(shelfOrder(books).map((b) => b.id)).toEqual(["a", "b", "c", "z"]);
  });

  it("shows 紅樓夢 eighth, after the guide and six showcase books, right-bound and opening in Chinese", () => {
    const presets = shelfOrder((presetIndex as { presets: { id: string; shelfOrder?: number; binding?: string; openLocale?: string }[] }).presets);
    // The guide stands first on the shelf, ahead of the index's books.
    expect(presets.length + 1).toBeGreaterThanOrEqual(8);
    const last = presets[presets.length - 1]!;
    expect(last.id).toBe("hongloumeng");
    expect(last.binding).toBe("right");
    expect(last.openLocale).toBe("zh-Hant");
  });
});
