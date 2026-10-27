import GithubSlugger from "github-slugger";
import { describe, expect, it } from "vitest";
import { CONFIGURATION_SLUG, movedConfigurationAnchors, oldConfigurationAnchors } from "./anchors/configurationAnchors";
import { extractToc, getAllDocs, getDocSource } from "./docs";
import { docPart } from "./docParts";
import { fragmentId, oldAnchorUrl, resolveOldAnchor } from "./anchors/oldAnchors";

const LOCALES = ["en", "es", "ca", "zh", "ja", "ar", "pt", "fr", "de", "it"] as const;

/** The pages of the Configuration reference after its entry page (#655,
 *  split further in #884). */
const CONFIGURATION_PAGES = [
  "configuration-page-layout",
  "configuration-headers-footers",
  "configuration-text",
  "configuration-language",
  "configuration-headings",
  "configuration-page-flow",
  "configuration-lists-math",
  "configuration-notes-references",
  "configuration-east-asian",
  "configuration-resources",
  "configuration-styles",
  "configuration-callouts",
  "configuration-exercises",
  "configuration-comics",
  "configuration-composed-pages",
  "configuration-fonts-colors-viewers",
  "configuration-programmatic-usage",
  "configuration-pdf-output",
  "configuration-html-folio-epub",
  "configuration-bundles",
];

/** The pages split off a chapter in #884, after the page that opens it. */
const CHAPTER_PAGES: Record<string, string[]> = {
  architecture: ["architecture-layout-pipeline"],
  "document-format": ["document-format-directives", "document-format-inline", "document-format-notes-references", "document-format-resources"],
  sandbox: ["sandbox-design-checks", "sandbox-composed-pages", "sandbox-previews", "sandbox-books-saving", "sandbox-embedding"],
  "composed-pages": ["composed-pages-figures"],
};

/** The two guides of Part III (#880), after the Sandbox and its pages: a
 *  tutorial that builds a composed page and the how-to that moves an old
 *  book to composed pages. */
const GUIDE_PAGES = ["composed-page-books", "migrating-to-composed-pages"];

/** The chapter a page belongs to ("" for a chapter). */
const parentOf = (slug: string) =>
  CONFIGURATION_PAGES.includes(slug) ? CONFIGURATION_SLUG : (Object.entries(CHAPTER_PAGES).find(([, pages]) => pages.includes(slug))?.[0] ?? "");

describe("docs table of contents", () => {
  const docs = getAllDocs();
  const order = (slug: string, locale = "en") => docs.find((d) => d.slug === slug)?.locales[locale]?.order;

  it("lists the docs in order, every language alike", () => {
    expect(docs.map((d) => d.slug)).toEqual([
      "introduction",
      "architecture",
      ...CHAPTER_PAGES.architecture!,
      "configuration",
      ...CONFIGURATION_PAGES,
      "justification",
      "document-format",
      ...CHAPTER_PAGES["document-format"]!,
      "chinese-layout",
      "arabic-layout",
      "japanese-layout",
      "comics",
      "music",
      "exercises",
      "composed-pages",
      ...CHAPTER_PAGES["composed-pages"]!,
      "contributing",
      "sandbox",
      ...CHAPTER_PAGES.sandbox!,
      ...GUIDE_PAGES,
      "skill",
      "command-line",
      "webmcp",
    ]);
    for (const doc of docs) {
      expect(Object.keys(doc.locales).sort(), doc.slug).toEqual(["ar", "ca", "de", "en", "es", "fr", "it", "ja", "pt", "zh"]);
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
      expect(doc.locales.en!.order, doc.slug).toBe(doc.locales.fr!.order);
      expect(doc.locales.fr!.lang, doc.slug).toBe("fr");
      expect(doc.locales.en!.order, doc.slug).toBe(doc.locales.de!.order);
      expect(doc.locales.de!.lang, doc.slug).toBe("de");
      expect(doc.locales.en!.order, doc.slug).toBe(doc.locales.it!.order);
      expect(doc.locales.it!.lang, doc.slug).toBe("it");
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

  it("numbers the pages 1 to 50 and gives Part II the Configuration reference, the craft pages, Comics, Music notation, Exercises and Composed pages, and Part III the Sandbox, the two guides, the skill, the command line and WebMCP", () => {
    expect(docs.map((d) => d.locales.en!.order)).toEqual(docs.map((_, i) => i + 1));
    expect(order("configuration")).toBe(4);
    expect(CONFIGURATION_PAGES.map((slug) => order(slug))).toEqual(CONFIGURATION_PAGES.map((_, i) => 5 + i));
    expect([order("justification"), order("document-format")]).toEqual([25, 26]);
    expect(order("comics")).toBe(34);
    expect(order("music")).toBe(35);
    expect(order("exercises")).toBe(36);
    expect(order("composed-pages")).toBe(37);
    for (const slug of ["introduction", "architecture", ...CHAPTER_PAGES.architecture!]) {
      expect(docPart(order(slug)!).key, slug).toBe("foundations");
    }
    for (const slug of ["configuration", ...CONFIGURATION_PAGES, "justification", "document-format", ...CHAPTER_PAGES["document-format"]!, "chinese-layout", "arabic-layout", "japanese-layout", "comics", "music", "exercises", "composed-pages", ...CHAPTER_PAGES["composed-pages"]!]) {
      expect(docPart(order(slug)!).key, slug).toBe("craft");
    }
    for (const slug of ["contributing", "sandbox", ...CHAPTER_PAGES.sandbox!, ...GUIDE_PAGES, "skill", "command-line", "webmcp"]) {
      expect(docPart(order(slug)!).key, slug).toBe("practice");
    }
    expect([order("contributing"), order("sandbox"), order("skill"), order("command-line"), order("webmcp")]).toEqual([39, 40, 48, 49, 50]);
    expect(GUIDE_PAGES.map((slug) => order(slug))).toEqual([46, 47]);
  });

  it("sets the pages of the Configuration reference under its entry page, in every language", () => {
    for (const doc of docs) {
      for (const [locale, meta] of Object.entries(doc.locales)) {
        expect(meta.parent, `${doc.slug}-${locale}`).toBe(parentOf(doc.slug));
        // No title is cut at an apostrophe (Catalan: "Línia d'ordres").
        expect(getDocSource(doc.slug, locale)!.source, `${doc.slug}-${locale}`).toContain(meta.title);
        expect(meta.title.length, `${doc.slug}-${locale}`).toBeGreaterThan(1);
      }
    }
    // A page's title is not one of its section headings, which would move
    // that section's id to "…-1".
    for (const slug of [...CONFIGURATION_PAGES, ...Object.values(CHAPTER_PAGES).flat()]) {
      for (const locale of LOCALES) {
        const toc = extractToc(getDocSource(slug, locale)!.source);
        expect(toc[0]!.level, `${slug}-${locale}`).toBe(1);
        expect(toc.filter((t) => t.text === toc[0]!.text).length, `${slug}-${locale}`).toBe(1);
      }
    }
  });

  it("gives the language sections headings that anchors can target", () => {
    const en = extractToc(getDocSource("configuration-language", "en")!.source).map((t) => `${t.level} ${t.id}`);
    expect(en).toContain("2 document-language");
    expect(en).toContain("2 languages-and-scripts");
    const es = extractToc(getDocSource("configuration-language", "es")!.source).map((t) => `${t.level} ${t.id}`);
    expect(es).toContain("2 idioma-del-documento");
    expect(es).toContain("2 idiomas-y-escrituras");
  });

  it.each(["chinese-layout", "arabic-layout", "japanese-layout", "comics", "exercises", "composed-pages"])("gives every heading of the %s page its own title", (slug) => {
    for (const locale of LOCALES) {
      const texts = extractToc(getDocSource(slug, locale)!.source).map((t) => t.text);
      expect(texts.filter((t, i) => texts.indexOf(t) !== i), locale).toEqual([]);
    }
  });

  it.each(["chinese-layout", "arabic-layout", "japanese-layout", "comics", "exercises", "composed-pages"])("keeps Markdown markers literal in the %s page's code spans", (slug) => {
    // MDX reads Markdown inside JSX, so <code>*…*</code> prints an italic
    // "…", and the docs pipeline drops JavaScript expressions (blockJS), so
    // <code>{'*…*'}</code> prints nothing. A character reference stays
    // literal in both the page and its Markdown rendition: <code>&#42;…&#42;</code>.
    for (const locale of LOCALES) {
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

/** The pages the single Configuration page was split into (#655, #884):
 *  a page added after the split holds none of its old headings. */
const SPLIT_PAGES = CONFIGURATION_PAGES.filter((slug) => slug !== "configuration-composed-pages" && slug !== "configuration-exercises");

describe("the Configuration reference, split into pages (#655)", () => {
  const ids = (slug: string, locale: string) => pageIds(getDocSource(slug, locale)!.source);
  const entries = (locale: string) =>
    Object.entries(oldConfigurationAnchors(locale)).flatMap(([slug, list]) => list.split(" ").map((entry) => ({ slug, old: entry.split(">")[0]! })));

  it("resolves an old heading id to the page that holds it", () => {
    const en = oldConfigurationAnchors("en");
    expect(resolveOldAnchor(en, "table-style")).toEqual({ slug: "configuration-resources", id: "table-style" });
    expect(resolveOldAnchor(en, "generating-pdfs")).toEqual({ slug: "configuration-pdf-output", id: "generating-pdfs" });
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

  it("redirects a visit to an old anchor, and only that", () => {
    const go = (locale: string, hash: string, search = "") => {
      const own = ids(CONFIGURATION_SLUG, locale);
      return oldAnchorUrl(movedConfigurationAnchors(locale), locale, { hash, search }, (id) => own.has(id));
    };
    expect(go("en", "#table-style")).toBe("/en/docs/configuration-resources#table-style");
    expect(go("en", "#table-style", "?ref=x")).toBe("/en/docs/configuration-resources?ref=x#table-style");
    // As typed, or as a browser encodes it: the same heading.
    const zh = `/zh/docs/configuration-resources#${encodeURIComponent("表格样式")}`;
    expect(go("zh", "#表格样式")).toBe(zh);
    expect(go("zh", `#${encodeURIComponent("表格样式")}`)).toBe(zh);
    expect(go("es", "#citas-1")).toBe("/es/docs/configuration-notes-references#citas");
    // Each language has its own ids: an English one means nothing on the Spanish page, as before.
    expect(go("es", "#table-style")).toBeNull();
    // What is still on the entry page, no fragment and unknown fragments stay.
    expect(go("en", "#index")).toBeNull();
    expect(go("en", "#configuration")).toBeNull();
    expect(go("en", "")).toBeNull();
    expect(go("en", "#")).toBeNull();
    expect(go("en", "#no-such-heading")).toBeNull();
  });

  it("sends every heading id the single page had, in every language, to a page that has it", () => {
    // A heading that is renamed or removed keeps its old address: write the
    // entry of configurationAnchors.json as "old>new" (or move it to the page
    // that takes its place).
    const lost: string[] = [];
    for (const locale of LOCALES) {
      const table = oldConfigurationAnchors(locale);
      expect(Object.keys(table), locale).toEqual([CONFIGURATION_SLUG, ...SPLIT_PAGES]);
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
      expect(Object.keys(moved), locale).toEqual(SPLIT_PAGES);
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

  it("keeps every docs page under 11,000 words (#884)", () => {
    // Words outside code fences and tags: the pages split in #884 ran to
    // 25,000–30,000.
    const words = (slug: string) =>
      getDocSource(slug, "en")!
        .source.replace(/^(`{3,}|~{3,})[\s\S]*?^\1\s*$/gm, " ")
        .replace(/<[^>]+>/g, " ")
        .split(/\s+/)
        .filter((w) => /\p{L}/u.test(w)).length;
    for (const doc of getAllDocs()) expect(words(doc.slug), doc.slug).toBeLessThan(11000);
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
