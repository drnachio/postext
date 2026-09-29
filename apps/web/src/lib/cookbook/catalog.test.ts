import { describe, expect, it } from "vitest";
import { buildCatalog, buildCatalogWire, catalogRecipe } from "./catalog.ts";
import { cardImage, captureVariantFor, heroPages, heroSpread, ogImageFile, pageImages, pdfDownload, spreadBinding, spreadImages } from "./images.ts";
import { getVisibleRecipes } from "./recipes.ts";
import { rankRelated, relatedRecipes, relatedScore, type RelatedCandidate } from "./related.ts";
import { cookbookPaletteEntries } from "./search.ts";
import type { CaptureManifest, CaptureVariant, Catalog, Recipe, RecipeMeta, Registry } from "./types.ts";
import { LOCALES } from "./types.ts";
import { packKeys, unpackCatalog, unpackKeys } from "./wire.ts";

// ─── The real catalogue ─────────────────────────────────────────────────────

describe("buildCatalog", () => {
  const visible = getVisibleRecipes();

  for (const locale of LOCALES) {
    it(`lists every visible recipe (${locale})`, () => {
      const catalog = buildCatalog(locale);
      expect(catalog.locale).toBe(locale);
      expect(catalog.recipes.map((r) => r.slug)).toEqual(visible.map((r) => r.slug));
      for (const recipe of catalog.recipes) {
        expect(recipe.href).toBe(`/cookbook/${recipe.slug}`);
        expect(recipe.title.length).toBeGreaterThan(0);
      }
    });

    it(`has facets that add up (${locale})`, () => {
      const { facets, recipes } = buildCatalog(locale);
      expect(facets.chapters.reduce((sum, c) => sum + c.count, 0)).toBe(recipes.length);
      const known = (list: { id?: unknown; kind?: unknown }[]) => new Set(list.map((item) => item.id ?? item.kind));
      const [chapters, genres, outputs, features, warnings, collections] = [
        facets.chapters, facets.genres, facets.outputs, facets.features, facets.warnings, facets.collections,
      ].map(known);
      for (const r of recipes) {
        expect(chapters.has(r.chapter)).toBe(true);
        r.genres.forEach((id) => expect(genres.has(id)).toBe(true));
        r.outputs.forEach((id) => expect(outputs.has(id)).toBe(true));
        r.features.forEach((id) => expect(features.has(id)).toBe(true));
        r.warnings.forEach((id) => expect(warnings.has(id)).toBe(true));
        r.collections.forEach((id) => expect(collections.has(id)).toBe(true));
      }
    });

    it(`ships a wire form that unpacks to the same catalogue (${locale})`, () => {
      const catalog = buildCatalog(locale);
      const wire = buildCatalogWire(locale);
      const json = JSON.parse(JSON.stringify(wire));
      expect(unpackCatalog(json)).toEqual(JSON.parse(JSON.stringify(catalog)));
      // Registry text once per catalogue: well under the plain form's size.
      if (catalog.recipes.length > 0) expect(JSON.stringify(wire).length).toBeLessThan(JSON.stringify(catalog).length * 0.75);
    });

    it(`maps to palette entries with valid hrefs (${locale})`, () => {
      const catalog = buildCatalog(locale);
      const slugs = new Set(catalog.recipes.map((r) => r.slug));
      for (const entry of cookbookPaletteEntries(catalog, { cookbook: "Cookbook" })) {
        const m = /^\/cookbook(?:\/([a-z0-9-]+)(?:#warning-[A-Za-z]+)?|\?warn=[A-Za-z]+)$/.exec(entry.href);
        expect(m, entry.href).not.toBeNull();
        if (m?.[1]) expect(slugs.has(m[1])).toBe(true);
      }
    });
  }
});

describe("packKeys", () => {
  it("round-trips config keys through the trie", () => {
    const keys = ["a", "a.b", "a.c", "d", "d[].e", "d[].e.f", "g.h"];
    const packed = packKeys(keys);
    expect(packed).toBe("a{b,c},d,!d[]{e{f}},!g{h}");
    expect(unpackKeys(packed)).toEqual(keys);
    expect(unpackKeys(packKeys([]))).toEqual([]);
    // A key the trie cannot write stays a list.
    expect(packKeys(["a{b}"])).toEqual(["a{b}"]);
  });
});

// ─── Fixtures ───────────────────────────────────────────────────────────────

const L = (en: string, es = `${en} (es)`) => ({ en, es });

const REGISTRY = {
  features: {
    "heading-styles": { label: L("Heading styles", "Estilos de título"), aliases: { en: ["openers"], es: ["aperturas"] }, group: "headings" },
    "palette-links": { label: L("Palette links"), group: "colour" },
  },
  questions: { Q29: { text: L("How do I give every article its own opener?"), index: L("Openers, per article") } },
  gaps: { footnotes: { label: L("Footnotes", "Notas al pie"), aliases: { en: ["footnote"], es: ["nota al pie"] } } },
  gotchas: { "headings-drop-h1-break": { title: L("Any headings object drops the H1 break") } },
  warnings: {},
} as unknown as Registry;

function variant(): CaptureVariant {
  const page = (n: number) => ({
    n, label: String(n), role: "body" as const, w: 1000, h: 1414, file: `p0${n}.webp`, strip: `p0${n}.s.webp`, bytes: 1, alt: `Page ${n}.`,
  });
  return {
    hash8: "abcd1234",
    vdtHash: "x",
    timings: { importMs: 1, fontsMs: 1, buildMs: 1, totalMs: 3, builds: 1 },
    specimen: {
      trimMm: [210, 297], dpi: 150, layoutType: "double", mirror: true,
      body: { family: "Newsreader", sizePt: 9.5, leadingPt: 13 }, families: ["Newsreader"], pages: 3, ownLines: 90,
    },
    pages: [page(1), page(2), page(3)],
    spreads: [[null, 0], [1, 2]],
    card: { file: "card.webp", file480: "card.480.webp", w: 960, h: 720, mode: "spread" },
    og: { file: "og.jpg", w: 580, h: 622 },
    pdf: { file: "fixture.pdf", bytes: 2048, pages: 3 },
    detected: {
      apis: ["buildDocument", "renderToPdf"], configKeys: ["page", "headingStyles"], configSections: [], configLeaves: 80,
      designElements: 3, directives: [":::callout"], inline: [":ref"], resources: { svg: 0, bitmap: 1, table: 0 },
      fonts: [{ family: "Newsreader", weight: 400, style: "normal" }, { family: "Newsreader", weight: 700, style: "normal" }],
      features: [], suggestedLevel: 2,
    },
    diagnostics: { converged: true, iterationCount: 2, looseLines: { count: 0, share: 0, worst: 0 }, findings: [] },
  };
}

function fixtureRecipe(capture = true): Recipe {
  const meta = {
    number: 9, chapter: "headings", order: 30, level: 2, status: "published", genres: ["magazine"], outputs: ["canvas", "pdf"],
    features: { primary: ["heading-styles"], also: ["palette-links"] }, answers: ["Q29"], gaps: ["footnotes"],
    gotchas: ["headings-drop-h1-break"], explainsWarnings: [], sample: { locales: ["en"] },
    capture: { hero: [2, 3], card: "spread" }, downloads: { pdf: true }, created: "2026-10-02", updated: "2026-10-03",
  } as unknown as RecipeMeta;
  const manifest: CaptureManifest = {
    schemaVersion: 1, slug: "fixture-opener", sourceHash: "x", engine: { postext: "1.4.1", source: "npm" },
    chrome: "131", capturedAt: "2026-10-02T00:00:00Z", variants: { en: variant() },
  };
  const writeup = (locale: "en" | "es", title: string) => ({
    locale,
    frontmatter: { title, summary: "A summary.", aliases: ["article opener"], pageNotes: { "2": "The photo bleeds." } },
    body: "## Method\n\n### 1 · The photo is a page element\n\n### 2. Attributes\n",
    sections: {},
  });
  return {
    slug: "fixture-opener",
    meta,
    writeups: { en: writeup("en", "Magazine opener"), es: writeup("es", "Apertura de revista") },
    capture: capture ? manifest : null,
  };
}

// ─── Catalogue entries, images, related ─────────────────────────────────────

describe("catalogRecipe (fixture)", () => {
  it("fills the search fields from the registries, the write-ups and the capture", () => {
    const entry = catalogRecipe(fixtureRecipe(), "es", REGISTRY, ["magazine-issue"]);
    expect(entry).toMatchObject({
      slug: "fixture-opener",
      features: ["heading-styles", "palette-links"],
      primary: ["heading-styles"],
      collections: ["magazine-issue"],
      gap: true,
      pages: 3,
      title: "Apertura de revista",
      question: "How do I give every article its own opener? (es)",
      href: "/cookbook/fixture-opener",
      card: { src: "/cookbook/fixture-opener/en/card.webp?v=abcd1234", src480: "/cookbook/fixture-opener/en/card.480.webp?v=abcd1234" },
    });
    expect(entry.search).toEqual({
      questions: ["How do I give every article its own opener? (es)", "Openers, per article (es)"],
      aliases: ["article opener", "Notas al pie", "nota al pie"],
      featureLabels: ["Estilos de título", "aperturas", "Palette links (es)"],
      apis: ["buildDocument", "renderToPdf"],
      configKeys: ["page", "headingStyles"],
      directives: [":::callout", ":ref"],
      fonts: ["Newsreader"],
      headings: ["The photo is a page element", "Attributes"],
      gotchas: ["Any headings object drops the H1 break (es)"],
      otherTitle: "Magazine opener",
    });
  });

  it("works before the first capture", () => {
    const entry = catalogRecipe(fixtureRecipe(false), "en", REGISTRY, []);
    expect(entry.card).toEqual({ src: "", src480: "" });
    expect(entry.pages).toBe(0);
  });
});

describe("images (fixture)", () => {
  it("builds cache-busted URLs for the captured edition", () => {
    const recipe = fixtureRecipe();
    // Spanish readers see the English edition: it is the only sample.
    expect(captureVariantFor(recipe, "es")?.variant).toBe("en");
    expect(cardImage(recipe, "es")).toEqual({
      src: "/cookbook/fixture-opener/en/card.webp?v=abcd1234",
      src480: "/cookbook/fixture-opener/en/card.480.webp?v=abcd1234",
      w: 960, h: 720, mode: "spread",
    });
    const pages = pageImages(recipe, "en");
    expect(pages[1]).toMatchObject({
      n: 2,
      src: "/cookbook/fixture-opener/en/p02.webp?v=abcd1234",
      thumb: "/cookbook/fixture-opener/en/p02.s.webp?v=abcd1234",
      alt: "Page 2. The photo bleeds.",
    });
    expect(spreadImages(recipe, "en").map((pair) => pair.map((p) => p?.n ?? null))).toEqual([[null, 1], [2, 3]]);
    expect(heroPages(recipe, "en").map((p) => p.n)).toEqual([2, 3]);
    expect(heroSpread(recipe, "en")?.map((p) => p?.n)).toEqual([2, 3]);
    expect(ogImageFile(recipe, "en")).toMatch(/public\/cookbook\/fixture-opener\/en\/og\.jpg$/);
    expect(pdfDownload(recipe, "en")).toEqual({ href: "/cookbook/fixture-opener/en/fixture.pdf?v=abcd1234", bytes: 2048, pages: 3 });
  });

  it("says which edge the book is bound on", () => {
    const recipe = fixtureRecipe();
    expect(spreadBinding(recipe, "en")).toBe("left");
    recipe.capture!.variants.en!.binding = "right";
    // The pairs stay [verso, recto]; the light table lays them out mirrored.
    expect(spreadBinding(recipe, "en")).toBe("right");
    expect(spreadImages(recipe, "en").map((pair) => pair.map((p) => p?.n ?? null))).toEqual([[null, 1], [2, 3]]);
    expect(spreadBinding(fixtureRecipe(false), "en")).toBe("left");
  });

  it("returns nothing before the first capture", () => {
    const recipe = fixtureRecipe(false);
    expect(cardImage(recipe, "en")).toBeNull();
    expect(pageImages(recipe, "en")).toEqual([]);
    expect(heroSpread(recipe, "en")).toBeNull();
    expect(ogImageFile(recipe, "en")).toBeNull();
    expect(pdfDownload(recipe, "en")).toBeNull();
  });
});

describe("related", () => {
  const candidate = (
    slug: string,
    primary: string[],
    also: string[],
    extra: Partial<RelatedCandidate["meta"]> = {},
  ): RelatedCandidate => ({
    slug,
    meta: { chapter: "headings", level: 2, genres: ["novel"], features: { primary, also }, ...extra },
  });

  it("scores shared features, genre and chapter", () => {
    const a = candidate("a", ["x"], ["y"]);
    expect(relatedScore(a, candidate("b", ["x"], ["y"], { chapter: "tables", genres: ["paper"] }))).toBe(1);
    expect(relatedScore(a, candidate("c", [], ["x"], { chapter: "tables", genres: ["paper"] }))).toBeCloseTo(1 / 3);
    expect(relatedScore(a, candidate("d", ["z"], [], { chapter: "headings", genres: ["novel"] }))).toBe(0.75);
    expect(relatedScore(a, candidate("e", ["z"], [], { chapter: "tables", genres: ["any"] }))).toBe(0);
  });

  it("puts hand-picked recipes first and leaves out prev/next", () => {
    const target = candidate("target", ["x"], ["y"], { related: ["picked"] });
    const pool = [
      target,
      candidate("picked", ["q"], [], { chapter: "tables", genres: ["paper"] }),
      candidate("twin", ["x"], ["y"], { level: 3 }),
      candidate("twin-easy", ["x"], ["y"], { level: 1 }),
      candidate("next", ["x"], ["y"]),
      candidate("stranger", ["q"], [], { chapter: "tables", genres: ["paper"] }),
    ];
    expect(rankRelated(target, pool, { exclude: ["next"], n: 3 })).toEqual(["picked", "twin-easy", "twin"]);
    expect(rankRelated(target, pool, { exclude: ["next", "picked"], n: 5 })).toEqual(["twin-easy", "twin"]);
  });

  it("works on the recipes on disk", () => {
    for (const recipe of getVisibleRecipes()) {
      const related = relatedRecipes(recipe.slug);
      expect(related.length).toBeLessThanOrEqual(3);
      expect(related.some((r) => r.slug === recipe.slug)).toBe(false);
    }
  });
});

describe("cookbookPaletteEntries (fixture)", () => {
  it("points a warning at its recipe, or at the filtered gallery", () => {
    const base = catalogRecipe(fixtureRecipe(), "en", REGISTRY, []);
    const catalog: Catalog = {
      locale: "en",
      testedWith: "1.4.1",
      facets: {
        chapters: [{ id: "headings", number: 3, part: "page", color: "blue", title: "Headings & openers", count: 2 }],
        genres: [], outputs: [], levels: [], features: [], collections: [],
        warnings: [{ kind: "calloutOverflow", label: "Callout overflow" }, { kind: "looseLine", label: "Loose line" }],
      },
      recipes: [
        { ...base, slug: "one", href: "/cookbook/one", warnings: ["calloutOverflow", "looseLine"] },
        { ...base, slug: "two", href: "/cookbook/two", warnings: ["looseLine"] },
      ],
    };
    const entries = cookbookPaletteEntries(catalog, { cookbook: "Cookbook" });
    expect(entries.map((e) => [e.kind, e.href])).toEqual([
      ["recipe", "/cookbook/one"],
      ["recipe", "/cookbook/two"],
      ["warning", "/cookbook/one#warning-calloutOverflow"],
      ["warning", "/cookbook?warn=looseLine"],
    ]);
    expect(entries[0].breadcrumb).toBe("Cookbook › Headings & openers");
    expect(entries[0].body.length).toBeLessThanOrEqual(400);
    expect(entries[0].body.startsWith("How do I give every article its own opener?")).toBe(true);
  });
});
