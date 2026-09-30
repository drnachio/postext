import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import presetIndex from "../../public/presets/index.json";
import { shelfOrder } from "./shelf";

/** The widest licence tag that fits a row of the Sandbox's Books panel at
 *  its default width (360 px): the tag is set in 9 px capitals and neither
 *  wraps nor truncates. The EEA line is the longest that fits. */
const LICENCE_TAG_MAX = "© EEA 2020, reproduction authorised · CC0 photos".length;

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

  it("describes 紅樓夢 by its vertical, right-bound edition", () => {
    const entry = (presetIndex as { presets: { id: string; description: string; tags: string[] }[] }).presets.find((p) => p.id === "hongloumeng")!;
    expect(entry.tags).toEqual(expect.arrayContaining(["vertical", "right-bound"]));
    expect(entry.tags).not.toContain("single-column");
    const [es, en] = entry.description.split(" · ");
    expect(es).toContain("compuesto en vertical y con el lomo a la derecha");
    expect(en).toContain("set vertically and bound on the right");
  });

  it("keeps every licence tag short enough for a Books panel row, as the preset itself states it", () => {
    for (const entry of (presetIndex as { presets: { id: string; dir: string; license?: string }[] }).presets) {
      if (!entry.license) continue;
      expect(entry.license.length, entry.id).toBeLessThanOrEqual(LICENCE_TAG_MAX);
      const manifest = JSON.parse(readFileSync(path.join(__dirname, "../../public/presets", entry.dir, "preset.json"), "utf8")) as { license?: string };
      expect(manifest.license, entry.id).toBe(entry.license);
    }
  });
});
