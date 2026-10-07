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

  it("stands the three right-bound books, ألف ليلة وليلة, 紅樓夢 and こころ, each opening in its own language, then Pepper&Carrot last", () => {
    const presets = shelfOrder((presetIndex as { presets: { id: string; shelfOrder?: number; binding?: string; openLocale?: string }[] }).presets);
    const [nights, dream, kokoro, comic] = presets.slice(-4);
    expect(nights!.id).toBe("alf-layla");
    expect(nights!.binding).toBe("right");
    expect(nights!.openLocale).toBe("ar");
    expect(dream!.id).toBe("hongloumeng");
    expect(dream!.binding).toBe("right");
    expect(dream!.openLocale).toBe("zh-Hant");
    expect(kokoro!.id).toBe("kokoro");
    expect(kokoro!.binding).toBe("right");
    expect(kokoro!.openLocale).toBe("ja");
    // The comic opens in the reader's language: it names no openLocale.
    expect(comic!.id).toBe("pepper-carrot");
    expect(comic!.binding).toBeUndefined();
    expect(comic!.openLocale).toBeUndefined();
    // Every other book is left-bound and stands before them.
    expect(presets.slice(0, -4).every((p) => p.binding !== "right" && p.shelfOrder === undefined)).toBe(true);
  });

  it("carries Pepper&Carrot in every site language, French as well", () => {
    const entry = (presetIndex as { presets: { id: string; locales: string[]; tags: string[]; license: string }[] }).presets.find((p) => p.id === "pepper-carrot")!;
    expect(entry.locales).toEqual(["en", "es", "ca", "fr", "ja", "zh-Hans", "ar"]);
    expect(entry.tags).toContain("comic");
    expect(entry.license).toContain("CC BY 4.0");
  });

  it("describes 紅樓夢 by its vertical, right-bound edition", () => {
    const entry = (presetIndex as { presets: { id: string; description: string; tags: string[] }[] }).presets.find((p) => p.id === "hongloumeng")!;
    expect(entry.tags).toEqual(expect.arrayContaining(["vertical", "right-bound"]));
    expect(entry.tags).not.toContain("single-column");
    const [es, en] = entry.description.split(" · ");
    expect(es).toContain("compuesto en vertical y con el lomo a la derecha");
    expect(en).toContain("set vertically and bound on the right");
  });

  it("describes ألف ليلة وليلة as an Arabic book bound on the right", () => {
    const entry = (presetIndex as { presets: { id: string; description: string; tags: string[]; locales: string[] }[] }).presets.find((p) => p.id === "alf-layla")!;
    expect(entry.locales).toEqual(["ar"]);
    expect(entry.tags).toEqual(expect.arrayContaining(["arabic", "right-to-left", "right-bound"]));
    const [es, en] = entry.description.split(" · ");
    expect(es).toContain("encuadernado a la derecha");
    expect(en).toContain("bound on the right");
  });

  it("describes こころ as a Japanese-only book, vertical and bound on the right", () => {
    const entry = (presetIndex as { presets: { id: string; description: string; tags: string[]; locales: string[]; locale: string }[] }).presets.find((p) => p.id === "kokoro")!;
    expect(entry.locale).toBe("ja");
    expect(entry.locales).toEqual(["ja"]);
    expect(entry.tags).toEqual(expect.arrayContaining(["japanese", "vertical", "right-bound", "ruby"]));
    const [es, en] = entry.description.split(" · ");
    expect(es).toContain("encuadernada a la derecha");
    expect(en).toContain("bound on the right");
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
