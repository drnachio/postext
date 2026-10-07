import { describe, expect, it } from "vitest";
import { markdownPaths, pageMarkdown } from "@/lib/markdown";
import { ABBREVIATIONS } from "./abbreviations";
import { glossarySections, sortKey } from "./glossary";
import { GLOSSARY_TERMS } from "./terms";

describe("glossary", () => {
  it("gives every term a unique anchor and text in every locale", () => {
    const ids = [...GLOSSARY_TERMS.map((t) => t.id), ...ABBREVIATIONS.map((a) => `abbr-${a.id}`)];
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of GLOSSARY_TERMS) {
      for (const l of ["en", "es", "ca", "zh", "ar", "ja", "pt"] as const) {
        expect(t.text[l][0], `${t.id} ${l}`).toBeTruthy();
        expect(t.text[l][1], `${t.id} ${l}`).toMatch(/[.。]$/);
      }
      // Japanese definitions: full-width stops, half-width digits.
      expect(t.text.ja[1], t.id).toMatch(/。$/);
      // (The full-width entry shows full-width digits as its example.)
      if (t.id !== "full-width") expect(t.text.ja[1], t.id).not.toMatch(/[０-９Ａ-Ｚａ-ｚ]/u);
    }
  });

  it("files every Japanese term under a kana reading, in gojūon order", () => {
    for (const t of GLOSSARY_TERMS) {
      expect(t.text.ja[2], t.id).toMatch(/^[\p{Script=Hiragana}ー]+$/u);
    }
    const ja = glossarySections("ja");
    const collator = new Intl.Collator("ja", { sensitivity: "base" });
    for (const { category, terms: list } of ja.categories) {
      const readings = list.map((e) => GLOSSARY_TERMS.find((t) => t.id === e.id)!.text.ja[2]!);
      expect(readings, category).toEqual([...readings].sort(collator.compare));
    }
    const type = ja.categories.find((c) => c.category === "type")!.terms.map((t) => t.term);
    // 行送り (ぎょう…) before 版面 (はん…) before 見開き (み…), whatever their kanji.
    expect(type.indexOf("行送り")).toBeLessThan(type.indexOf("版面"));
    expect(type.indexOf("版面")).toBeLessThan(type.indexOf("見開き"));
    expect(sortKey("ja", "行送り", "ぎょうおくり")).toBe("ぎょうおくり");
    expect(sortKey("es", "Interlineado", "ぎょうおくり")).toBe("Interlineado");
  });

  it("sorts terms in the reader's language and uses the locale's forms", () => {
    const es = glossarySections("es");
    const terms = es.categories[0]!.terms.map((t) => t.term);
    expect(terms).toEqual([...terms].sort(new Intl.Collator("es").compare));
    expect(es.abbreviations.find((a) => a.id === "gdpr")?.abbr).toBe("RGPD");
    expect(glossarySections("zh").categories[1]!.terms.every((t) => !t.native)).toBe(true);
    const ar = glossarySections("ar");
    for (const { terms: list } of ar.categories) {
      const keys = list.map((t) => sortKey("ar", t.term));
      expect(keys).toEqual([...keys].sort(new Intl.Collator("ar", { sensitivity: "base" }).compare));
    }
    expect(ar.categories.find((c) => c.category === "arabic")!.terms.every((t) => !t.native)).toBe(true);
    expect(sortKey("ar", "الإحالة")).toBe("إحالة");
    expect(sortKey("ar", "Sandbox")).toBe("Sandbox");
    expect(glossarySections("en").categories.find((c) => c.category === "arabic")!.terms.some((t) => t.native)).toBe(true);
  });

  it("tags every native name with its own language", () => {
    for (const t of GLOSSARY_TERMS.filter((term) => term.native)) {
      const lang = { cjk: "zh-Hans", japanese: "ja", arabic: "ar" }[t.category as "cjk" | "japanese" | "arabic"];
      expect(t.nativeLang, t.id).toBe(lang);
    }
    const en = glossarySections("en").categories;
    const furigana = en.find((c) => c.category === "japanese")!.terms.find((t) => t.id === "furigana")!;
    expect([furigana.native, furigana.nativeLang]).toEqual(["振り仮名", "ja"]);
    const kashida = en.find((c) => c.category === "arabic")!.terms.find((t) => t.native === "كشيدة")!;
    expect(kashida.nativeLang).toBe("ar");
    expect(en.find((c) => c.category === "cjk")!.terms.find((t) => t.id === "han")!.nativeLang).toBe("zh-Hans");
  });

  it("lists the Japanese terms in every locale, with their names in Japanese", () => {
    const ids = GLOSSARY_TERMS.filter((t) => t.category === "japanese").map((t) => t.id);
    expect(ids).toEqual(expect.arrayContaining([
      "kana", "hiragana", "katakana", "romaji", "furigana", "jukugo-ruby", "group-ruby", "boten", "bosen",
      "yakumono", "kinsoku-shori", "oikomi-oidashi", "burasagari", "gyodori", "gojuon", "yomi", "hashira",
      "nombre", "bunko", "tankobon", "genko-yoshi", "aozora-notation", "gaiji", "choon", "small-kana",
      "bochu", "kochu", "kunten", "jlreq", "jis-x-4051",
    ]));
    for (const t of GLOSSARY_TERMS.filter((term) => term.category === "japanese")) {
      expect(t.native, t.id).toMatch(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u);
    }
    // No site locale writes Japanese: the native name shows everywhere,
    // unless the Chinese name is the same characters (外字).
    for (const l of ["en", "es", "ca", "zh", "ar"] as const) {
      const japanese = glossarySections(l).categories.find((c) => c.category === "japanese")!.terms;
      expect(japanese.length).toBeGreaterThanOrEqual(30);
      expect(japanese.filter((t) => !t.native).map((t) => t.id), l).toEqual(l === "zh" ? ["gaiji"] : []);
    }
    // The Japanese page writes them natively; the Chinese names still show
    // where they differ from the Japanese ones (纵中横 beside 縦中横).
    const ja = glossarySections("ja").categories;
    expect(ja.find((c) => c.category === "japanese")!.terms.every((t) => !t.native)).toBe(true);
    const tcy = ja.find((c) => c.category === "cjk")!.terms.find((t) => t.id === "tate-chu-yoko")!;
    expect([tcy.term, tcy.native, tcy.nativeLang]).toEqual(["縦中横", "纵中横", "zh-Hans"]);
  });

  it("has a Markdown rendition in every locale", () => {
    for (const l of ["en", "es", "ca", "zh", "ar", "ja", "pt"]) {
      expect(markdownPaths(l)).toContain("/glossary");
      const md = pageMarkdown(l, "/glossary");
      expect(md).toMatch(/^# /);
      expect(md).toContain("**PDF**");
    }
  });
});
