import GithubSlugger from "github-slugger";
import { describe, expect, it } from "vitest";
import { CONFIGURATION_SLUG, movedConfigurationAnchors, oldConfigurationAnchors } from "./configurationAnchors";
import { extractToc, getAllDocs, getDocSource } from "./docs";
import { docPart } from "./docParts";
import { fragmentId, resolveOldAnchor } from "./oldAnchors";

const LOCALES = ["en", "es", "ca", "zh", "ja", "ar", "pt"] as const;

/** The pages of the Configuration reference after its entry page (#655). */
const CONFIGURATION_PAGES = [
  "configuration-page-layout",
  "configuration-text",
  "configuration-notes-references",
  "configuration-east-asian",
  "configuration-resources",
  "configuration-styles",
  "configuration-comics",
  "configuration-fonts-colors-viewers",
  "configuration-programmatic-usage",
];

describe("docs table of contents", () => {
  const docs = getAllDocs();
  const order = (slug: string, locale = "en") => docs.find((d) => d.slug === slug)?.locales[locale]?.order;

  it("lists the docs in order, every language alike", () => {
    expect(docs.map((d) => d.slug)).toEqual([
      "introduction",
      "architecture",
      "configuration",
      ...CONFIGURATION_PAGES,
      "justification",
      "document-format",
      "chinese-layout",
      "arabic-layout",
      "japanese-layout",
      "comics",
      "contributing",
      "sandbox",
      "skill",
      "command-line",
    ]);
    for (const doc of docs) {
      expect(Object.keys(doc.locales).sort(), doc.slug).toEqual(["ar", "ca", "en", "es", "ja", "pt", "zh"]);
      expect(doc.locales.en!.order, doc.slug).toBe(doc.locales.es!.order);
      expect(doc.locales.en!.order, doc.slug).toBe(doc.locales.zh!.order);
      expect(doc.locales.zh!.lang, doc.slug).toBe("zh");
      expect(doc.locales.en!.order, doc.slug).toBe(doc.locales.ca!.order);
      expect(doc.locales.ca!.lang, doc.slug).toBe("ca");
      expect(doc.locales.en!.order, doc.slug).toBe(doc.locales.ar!.order);
      expect(doc.locales.ar!.lang, doc.slug).toBe("ar");
      expect(doc.locales.en!.order, doc.slug).toBe(doc.locales.ja!.order);
      expect(doc.locales.ja!.lang, doc.slug).toBe("ja");
      expect(doc.locales.en!.order, doc.slug).toBe(doc.locales.pt!.order);
      expect(doc.locales.pt!.lang, doc.slug).toBe("pt");
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

  it("numbers the pages 1 to 22 and gives Part II the Configuration reference, the craft pages and Comics", () => {
    expect(docs.map((d) => d.locales.en!.order)).toEqual(docs.map((_, i) => i + 1));
    expect(order("configuration")).toBe(3);
    expect(CONFIGURATION_PAGES.map((slug) => order(slug))).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect([order("justification"), order("document-format")]).toEqual([13, 14]);
    expect(order("chinese-layout")).toBe(15);
    expect(order("arabic-layout")).toBe(16);
    expect(order("japanese-layout")).toBe(17);
    expect(order("comics")).toBe(18);
    for (const slug of ["introduction", "architecture"]) {
      expect(docPart(order(slug)!).key, slug).toBe("foundations");
    }
    for (const slug of ["configuration", ...CONFIGURATION_PAGES, "justification", "document-format", "chinese-layout", "arabic-layout", "japanese-layout", "comics"]) {
      expect(docPart(order(slug)!).key, slug).toBe("craft");
    }
    for (const slug of ["contributing", "sandbox", "skill", "command-line"]) {
      expect(docPart(order(slug)!).key, slug).toBe("practice");
    }
    expect([order("contributing"), order("sandbox"), order("skill"), order("command-line")]).toEqual([19, 20, 21, 22]);
  });

  it("sets the pages of the Configuration reference under its entry page, in every language", () => {
    for (const doc of docs) {
      for (const [locale, meta] of Object.entries(doc.locales)) {
        expect(meta.parent, `${doc.slug}-${locale}`).toBe(CONFIGURATION_PAGES.includes(doc.slug) ? CONFIGURATION_SLUG : "");
        // No title is cut at an apostrophe (Catalan: "Línia d'ordres").
        expect(getDocSource(doc.slug, locale)!.source, `${doc.slug}-${locale}`).toContain(meta.title);
        expect(meta.title.length, `${doc.slug}-${locale}`).toBeGreaterThan(1);
      }
    }
    // A page's title is not one of its section headings, which would move
    // that section's id to "…-1".
    for (const slug of CONFIGURATION_PAGES) {
      for (const locale of LOCALES) {
        const toc = extractToc(getDocSource(slug, locale)!.source);
        expect(toc[0]!.level, `${slug}-${locale}`).toBe(1);
        expect(toc.filter((t) => t.text === toc[0]!.text).length, `${slug}-${locale}`).toBe(1);
      }
    }
  });

  it("gives the language sections h3 headings that anchors can target", () => {
    const en = extractToc(getDocSource("configuration-text", "en")!.source).map((t) => `${t.level} ${t.id}`);
    expect(en).toContain("3 document-language");
    expect(en).toContain("3 languages-and-scripts");
    const es = extractToc(getDocSource("configuration-text", "es")!.source).map((t) => `${t.level} ${t.id}`);
    expect(es).toContain("3 idioma-del-documento");
    expect(es).toContain("3 idiomas-y-escrituras");
  });

  it.each(["chinese-layout", "arabic-layout", "japanese-layout", "comics"])("gives every heading of the %s page its own title", (slug) => {
    for (const locale of ["en", "es", "ca", "zh", "ja", "ar", "pt"] as const) {
      const texts = extractToc(getDocSource(slug, locale)!.source).map((t) => t.text);
      expect(texts.filter((t, i) => texts.indexOf(t) !== i), locale).toEqual([]);
    }
  });

  it.each(["chinese-layout", "arabic-layout", "japanese-layout", "comics"])("keeps Markdown markers literal in the %s page's code spans", (slug) => {
    // MDX reads Markdown inside JSX, so <code>*…*</code> prints an italic
    // "…", and the docs pipeline drops JavaScript expressions (blockJS), so
    // <code>{'*…*'}</code> prints nothing. A character reference stays
    // literal in both the page and its Markdown rendition: <code>&#42;…&#42;</code>.
    for (const locale of ["en", "es", "ca", "zh", "ja", "ar", "pt"] as const) {
      const { source } = getDocSource(slug, locale)!;
      for (const m of source.matchAll(/<code>([^<]*)<\/code>/g)) {
        expect(m[1], m[0]).not.toMatch(/[*~^{]|(?<![\w])_|_(?![\w])/);
      }
    }
  });

  it.each(docs.flatMap((d) => Object.keys(d.locales).map((locale) => [d.slug, locale] as const)))(
    "links from %s (%s) only to pages and headings that exist, and lists only headings the page renders (#654, #655)",
    (page, locale) => {
      const { source } = getDocSource(page, locale)!;
      const own = pageIds(source);
      const broken: string[] = [];
      for (const item of extractToc(source)) {
        if (!own.has(item.id)) broken.push(`contents entry #${item.id}`);
      }
      // Inside the page: Markdown links and the <a href> of table cells alike.
      for (const m of [...source.matchAll(/href="#([^"]+)"/g), ...source.matchAll(/\]\(#([^)\s]+)\)/g)]) {
        if (!own.has(fragmentId(m[1]!))) broken.push(`#${m[1]}`);
      }
      // To another docs page, with or without the site's origin, and its `.md` rendition.
      for (const m of source.matchAll(/(?:\]\(|href=")(?:https:\/\/postext\.dev)?\/(?:([a-z]{2}(?:-[A-Za-z]+)?)\/)?docs\/([a-z0-9-]+)(?:\.md)?\/?(?:#([^)"\s]+))?(?=[)"])/g)) {
        const [whole, lang, slug, anchor] = m;
        // In the reader's language, as every docs link is written.
        if (lang !== locale) broken.push(`${whole}: not a /${locale}/docs link`);
        const doc = getDocSource(slug!, locale);
        if (!doc) broken.push(`${whole}: no such page`);
        else if (anchor && !pageIds(doc.source).has(fragmentId(anchor))) broken.push(`${whole}: no such heading`);
      }
      expect(broken).toEqual([]);
    },
  );
});

describe("the Configuration reference, split into pages (#655)", () => {
  const ids = (slug: string, locale: string) => pageIds(getDocSource(slug, locale)!.source);
  const entries = (locale: string) =>
    Object.entries(oldConfigurationAnchors(locale)).flatMap(([slug, list]) => list.split(" ").map((entry) => ({ slug, old: entry.split(">")[0]! })));

  it("resolves an old heading id to the page that holds it", () => {
    const en = oldConfigurationAnchors("en");
    expect(resolveOldAnchor(en, "table-style")).toEqual({ slug: "configuration-resources", id: "table-style" });
    expect(resolveOldAnchor(en, "generating-pdfs")).toEqual({ slug: "configuration-programmatic-usage", id: "generating-pdfs" });
    expect(resolveOldAnchor(en, "table")).toBeNull();
    expect(resolveOldAnchor(en, "")).toBeNull();
    expect(resolveOldAnchor(en, "estilo-de-tablas")).toBeNull();
    // An id of the old page that carried a "-1" (the heading had a namesake
    // further up) is plain on its own page.
    const es = oldConfigurationAnchors("es");
    expect(resolveOldAnchor(es, "citas-1")).toEqual({ slug: "configuration-notes-references", id: "citas" });
    expect(resolveOldAnchor(es, "citas")?.id).toBe("citas");
    expect(resolveOldAnchor(es, "citas")?.slug).not.toBe("configuration-notes-references");
    // Ids hold accents, Arabic and CJK; a browser may hand them percent-encoded.
    expect(fragmentId("#estilo-de-tablas")).toBe("estilo-de-tablas");
    expect(fragmentId(`#${encodeURIComponent("表格样式")}`)).toBe("表格样式");
    expect(fragmentId("#100%")).toBe("100%");
    expect(resolveOldAnchor(oldConfigurationAnchors("zh"), fragmentId(`#${encodeURIComponent("表格样式")}`))?.slug).toBe("configuration-resources");
    expect(resolveOldAnchor(oldConfigurationAnchors("ar"), fragmentId(`#${encodeURIComponent("نمط-الجداول")}`))?.slug).toBe("configuration-resources");
  });

  it("sends every heading id the single page had, in every language, to a page that has it", () => {
    // A heading that is renamed or removed keeps its old address: write the
    // entry of configurationAnchors.json as "old>new" (or move it to the page
    // that takes its place).
    const lost: string[] = [];
    for (const locale of LOCALES) {
      const table = oldConfigurationAnchors(locale);
      expect(Object.keys(table), locale).toEqual([CONFIGURATION_SLUG, ...CONFIGURATION_PAGES]);
      const all = entries(locale);
      // The single page had 207 headings in every language, each with its own id.
      expect(all.length, locale).toBe(207);
      expect(new Set(all.map((e) => e.old)).size, locale).toBe(207);
      for (const { slug, old } of all) {
        const target = resolveOldAnchor(table, old);
        if (!target || target.slug !== slug) lost.push(`${locale}: #${old} resolves to ${target?.slug}, listed under ${slug}`);
        else if (!ids(target.slug, locale).has(target.id)) lost.push(`${locale}: #${old} → ${target.slug}#${target.id}: no such heading`);
      }
    }
    expect(lost).toEqual([]);
  });

  it("hands the entry page only the ids that left it, and none it still has", () => {
    for (const locale of LOCALES) {
      const moved = movedConfigurationAnchors(locale);
      expect(Object.keys(moved), locale).toEqual(CONFIGURATION_PAGES);
      const own = ids(CONFIGURATION_SLUG, locale);
      // The page's own headings (its title and the index) stay where they were.
      for (const entry of oldConfigurationAnchors(locale)[CONFIGURATION_SLUG]!.split(" ")) expect(own.has(entry), `${locale} #${entry}`).toBe(true);
      // An id that is on the entry page is never redirected, so none may be.
      for (const list of Object.values(moved)) {
        for (const entry of list.split(" ")) expect(own.has(entry.split(">")[0]!), `${locale} #${entry}`).toBe(false);
      }
      // One language of the table is all the entry page loads: a few KB.
      expect(JSON.stringify(moved).length, locale).toBeLessThan(8000);
    }
  });

  it("lost no heading in the split and cut the seven languages alike", () => {
    const levels = (slug: string, locale: string) => headingLevels(getDocSource(slug, locale)!.source);
    for (const locale of LOCALES) {
      // Every heading of the old page, plus the title of each new page; later
      // additions only add to it.
      const now = [CONFIGURATION_SLUG, ...CONFIGURATION_PAGES].reduce((n, slug) => n + levels(slug, locale).length, 0);
      expect(now, locale).toBeGreaterThanOrEqual(207 + CONFIGURATION_PAGES.length);
      for (const slug of [CONFIGURATION_SLUG, ...CONFIGURATION_PAGES]) {
        expect(levels(slug, locale), `${slug}-${locale}`).toEqual(levels(slug, "en"));
      }
    }
    // The entry page keeps its introduction and the index, nothing else.
    expect(levels(CONFIGURATION_SLUG, "en")).toEqual([1, 2]);
  });

  it("lists every section of the reference in the entry page's index, on its page", () => {
    for (const locale of LOCALES) {
      const { source } = getDocSource(CONFIGURATION_SLUG, locale)!;
      for (const slug of CONFIGURATION_PAGES) {
        expect(source, `${locale} ${slug}`).toContain(`](/${locale}/docs/${slug})`);
        for (const section of extractToc(getDocSource(slug, locale)!.source).filter((t) => t.level === 2)) {
          expect(source, `${locale} ${slug}#${section.id}`).toContain(`](/${locale}/docs/${slug}#${section.id})`);
        }
      }
    }
  });

  it("keeps every page of the reference near the size of the Document format page", () => {
    const lines = (slug: string) => getDocSource(slug, "en")!.source.split("\n").length;
    for (const slug of [CONFIGURATION_SLUG, ...CONFIGURATION_PAGES]) {
      expect(lines(slug), slug).toBeLessThan(lines("document-format") * 1.5);
    }
  });
});

/** The ids a page's links can target: every heading level, slugged in
 *  document order as rehype-slug does on the page, and explicit `id`s. */
function pageIds(source: string): Set<string> {
  const slugger = new GithubSlugger();
  const ids = new Set<string>();
  for (const text of headingLines(source)) ids.add(slugger.slug(text.replace(/^#{1,6}\s+/, "").trim()));
  for (const m of source.matchAll(/\sid="([^"]+)"/g)) ids.add(m[1]!);
  return ids;
}

/** The `#`–`######` lines outside fenced code. */
function headingLines(source: string): string[] {
  const out: string[] = [];
  let fence: string | null = null;
  for (const line of source.split("\n")) {
    const mark = line.match(/^(`{3,}|~{3,})/)?.[1]![0];
    if (mark) {
      fence = fence === null ? mark : fence === mark ? null : fence;
      continue;
    }
    if (fence === null && /^#{1,6}\s+.+$/.test(line)) out.push(line);
  }
  return out;
}

const headingLevels = (source: string) => headingLines(source).map((line) => line.match(/^#+/)![0].length);
