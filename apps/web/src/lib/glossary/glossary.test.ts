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
      for (const l of ["en", "es", "ca", "zh", "ar"] as const) {
        expect(t.text[l][0], `${t.id} ${l}`).toBeTruthy();
        expect(t.text[l][1], `${t.id} ${l}`).toMatch(/[.。]$/);
      }
    }
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

  it("has a Markdown rendition in every locale", () => {
    for (const l of ["en", "es", "ca", "zh", "ar"]) {
      expect(markdownPaths(l)).toContain("/glossary");
      const md = pageMarkdown(l, "/glossary");
      expect(md).toMatch(/^# /);
      expect(md).toContain("**PDF**");
    }
  });
});
