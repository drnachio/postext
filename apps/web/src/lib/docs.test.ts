import { describe, expect, it } from "vitest";
import { extractToc, getAllDocs, getDocSource } from "./docs";
import { docPart } from "./docParts";

describe("docs table of contents", () => {
  const docs = getAllDocs();
  const order = (slug: string, locale = "en") => docs.find((d) => d.slug === slug)?.locales[locale]?.order;

  it("lists the docs in order, every language alike", () => {
    expect(docs.map((d) => d.slug)).toEqual([
      "introduction",
      "architecture",
      "configuration",
      "justification",
      "document-format",
      "chinese-layout",
      "arabic-layout",
      "contributing",
      "sandbox",
      "skill",
    ]);
    for (const doc of docs) {
      expect(Object.keys(doc.locales).sort(), doc.slug).toEqual(["ar", "ca", "en", "es", "zh"]);
      expect(doc.locales.en!.order, doc.slug).toBe(doc.locales.es!.order);
      expect(doc.locales.en!.order, doc.slug).toBe(doc.locales.zh!.order);
      expect(doc.locales.zh!.lang, doc.slug).toBe("zh");
      expect(doc.locales.en!.order, doc.slug).toBe(doc.locales.ca!.order);
      expect(doc.locales.ca!.lang, doc.slug).toBe("ca");
      expect(doc.locales.en!.order, doc.slug).toBe(doc.locales.ar!.order);
      expect(doc.locales.ar!.lang, doc.slug).toBe("ar");
    }
  });

  it("gives every page an In short summary in plain words (WCAG 3.1.5)", () => {
    for (const doc of docs) {
      for (const [locale, meta] of Object.entries(doc.locales)) {
        const sentences = meta.plainSummary.split(/(?<=[.!?。！？])\s*/).filter(Boolean);
        expect(sentences.length, `${doc.slug}-${locale}`).toBeGreaterThanOrEqual(3);
        expect(sentences.length, `${doc.slug}-${locale}`).toBeLessThanOrEqual(6);
      }
    }
  });

  it("puts Chinese and Arabic layout in Part II at orders 6 and 7 and the practice pages after them", () => {
    expect(order("chinese-layout")).toBe(6);
    expect(order("arabic-layout")).toBe(7);
    expect(docPart(6).key).toBe("craft");
    expect(docPart(7).key).toBe("craft");
    expect(docPart(order("document-format")!).key).toBe("craft");
    for (const slug of ["contributing", "sandbox", "skill"]) {
      expect(docPart(order(slug)!).key, slug).toBe("practice");
    }
    expect([order("contributing"), order("sandbox"), order("skill")]).toEqual([8, 9, 10]);
  });

  it("gives the language sections h3 headings that anchors can target", () => {
    const en = extractToc(getDocSource("configuration", "en")!.source).map((t) => `${t.level} ${t.id}`);
    expect(en).toContain("3 document-language");
    expect(en).toContain("3 languages-and-scripts");
    const es = extractToc(getDocSource("configuration", "es")!.source).map((t) => `${t.level} ${t.id}`);
    expect(es).toContain("3 idioma-del-documento");
    expect(es).toContain("3 idiomas-y-escrituras");
  });

  it.each(["chinese-layout", "arabic-layout"])("gives every heading of the %s page its own title", (slug) => {
    for (const locale of ["en", "es", "ca", "zh", "ar"] as const) {
      const texts = extractToc(getDocSource(slug, locale)!.source).map((t) => t.text);
      expect(texts.filter((t, i) => texts.indexOf(t) !== i), locale).toEqual([]);
    }
  });

  it.each(["chinese-layout", "arabic-layout"])("keeps Markdown markers literal in the %s page's code spans", (slug) => {
    // MDX reads Markdown inside JSX, so <code>*…*</code> prints an italic
    // "…", and the docs pipeline drops JavaScript expressions (blockJS), so
    // <code>{'*…*'}</code> prints nothing. A character reference stays
    // literal in both the page and its Markdown rendition: <code>&#42;…&#42;</code>.
    for (const locale of ["en", "es", "ca", "zh", "ar"] as const) {
      const { source } = getDocSource(slug, locale)!;
      for (const m of source.matchAll(/<code>([^<]*)<\/code>/g)) {
        expect(m[1], m[0]).not.toMatch(/[*~^{]|(?<![\w])_|_(?![\w])/);
      }
    }
  });

  it.each(docs.flatMap((d) => Object.keys(d.locales).map((locale) => [d.slug, locale] as const)))(
    "links from %s (%s) only to headings that exist",
    (page, locale) => {
      const { source } = getDocSource(page, locale)!;
      const own = new Set(extractToc(source).map((t) => t.id));
      for (const m of source.matchAll(/\]\(\/(en|es|ca|zh|ar)\/docs\/([a-z-]+)(?:#([^)]+))?\)/g)) {
        const [, lang, slug, anchor] = m;
        expect(lang, m[0]).toBe(locale);
        const doc = getDocSource(slug!, locale);
        expect(doc, m[0]).not.toBeNull();
        if (!anchor) continue;
        // Any heading level: the page links to h4 sections of the Sandbox guide too.
        const ids = extractTocAllLevels(doc!.source);
        expect(ids.has(decodeURIComponent(anchor)), m[0]).toBe(true);
      }
      for (const m of source.matchAll(/\]\(#([^)]+)\)/g)) {
        expect(own.has(decodeURIComponent(m[1]!)) || extractTocAllLevels(source).has(decodeURIComponent(m[1]!)), m[0]).toBe(true);
      }
    },
  );
});

/** Heading ids at every level, as rehype-slug gives them on the page. */
function extractTocAllLevels(source: string): Set<string> {
  const deep = source.replace(/^#{4,6}(\s)/gm, "###$1");
  return new Set(extractToc(deep).map((t) => t.id));
}
