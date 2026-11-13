import { describe, expect, it } from "vitest";
import { appendToSections, extractToc, getDocSlugsForLocale } from "../docs.ts";
import { docToc, resolveDocAnchor } from "./docLinks.ts";
import { GROUP_SIZE, STRIP_SIZE, pageExamples, rankDocExamples, topLevelKeys, type ExampleRecipe, type ExampleSources, type ResolveAnchor } from "./docExamples.ts";
import { buildDocExamples, buildDocExamplesFrom } from "./docExamplesIndex.ts";
import { getAllRecipes } from "./recipes.ts";
import { loadRegistry } from "./registry.ts";
import type { DocAnchor, Locale } from "./types.ts";
import { LOCALES } from "./types.ts";

// ─── Ranking (fixture) ──────────────────────────────────────────────────────

const A = (heading: string): DocAnchor => ({ slug: "page", heading: { en: heading } as DocAnchor["heading"] });
const resolve: ResolveAnchor = (anchor) => ({ slug: anchor.slug, id: anchor.heading.en.toLowerCase().replace(/\s+/g, "-") });

function recipe(slug: string, number: number, primary: string[], also: string[] = [], more: Partial<ExampleRecipe> = {}): ExampleRecipe {
  return { slug, number, primary, also, apis: [], configKeys: [], editions: ["en", "es"], ...more };
}

function sources(more: Partial<ExampleSources> = {}): ExampleSources {
  return {
    features: { inks: { docs: A("Inks") }, dies: { docs: A("Dies") }, pdf: { docs: A("Output") } },
    apis: { renderToPdf: A("Output") },
    config: { print: A("Inks") },
    overrides: {},
    featured: [],
    collected: [],
    ...more,
  };
}

/** Ten filler recipes, so a link two or three recipes share stays specific. */
const filler = Array.from({ length: 10 }, (_, i) => recipe(`filler-${i}`, 100 + i, ["other"]));

describe("rankDocExamples", () => {
  it("lists a recipe that teaches a feature before one that only uses it", () => {
    const ranked = rankDocExamples(
      [recipe("uses", 1, ["dies"], ["inks"]), recipe("teaches", 2, ["inks"]), ...filler],
      sources(),
      resolve,
      "en",
    );
    expect(ranked.get("page#inks")).toEqual(["teaches", "uses"]);
    expect(ranked.get("page#dies")).toEqual(["uses"]);
  });

  it("puts featured recipes, then collection recipes, first among equals", () => {
    const ranked = rankDocExamples(
      [recipe("plain", 1, ["inks"]), recipe("collected", 2, ["inks"]), recipe("featured", 3, ["inks"]), ...filler],
      sources({ featured: ["featured"], collected: ["collected"] }),
      resolve,
      "en",
    );
    expect(ranked.get("page#inks")).toEqual(["featured", "collected", "plain"]);
  });

  it("weighs every way a recipe reaches the heading, then prefers the focused one", () => {
    const ranked = rankDocExamples(
      [
        recipe("broad", 1, ["inks", "a", "b", "c"]),
        recipe("focused", 2, ["inks"]),
        recipe("config-too", 3, ["inks", "a", "b", "c"], [], { configKeys: ["print.inks", "print.standard"] }),
        ...filler,
      ],
      sources(),
      resolve,
      "en",
    );
    expect(ranked.get("page#inks")).toEqual(["config-too", "focused", "broad"]);
  });

  it("drops secondary links most recipes share, never primary ones", () => {
    const everyone = Array.from({ length: 6 }, (_, i) => recipe(`r${i}`, i, ["dies"], ["pdf"], { apis: ["renderToPdf"] }));
    const ranked = rankDocExamples([...everyone, recipe("pdf-book", 9, ["pdf"]), ...filler], sources(), resolve, "en");
    expect(ranked.get("page#output")).toEqual(["pdf-book"]);
  });

  it("pins and hides per heading", () => {
    const ranked = rankDocExamples(
      [recipe("first", 1, ["inks"]), recipe("second", 2, ["inks"]), recipe("elsewhere", 3, ["dies"]), ...filler],
      sources({ overrides: { x: { docs: A("Inks"), pin: ["elsewhere"], hide: ["first"] } } }),
      resolve,
      "en",
    );
    expect(ranked.get("page#inks")).toEqual(["elsewhere", "second"]);
  });

  it("breaks a tie with the reader's edition, then the catalogue number", () => {
    const list = [recipe("b", 2, ["inks"]), recipe("a", 1, ["inks"]), recipe("ar", 3, ["inks"], [], { editions: ["ar"] }), ...filler];
    expect(rankDocExamples(list, sources(), resolve, "en").get("page#inks")).toEqual(["a", "b", "ar"]);
    expect(rankDocExamples(list, sources(), resolve, "ar").get("page#inks")).toEqual(["ar", "a", "b"]);
  });

  it("reads the top-level config key of a path", () => {
    expect(topLevelKeys(["print.inks", "print", "colorPalette[].id", "page.margins.top"])).toEqual(["print", "colorPalette", "page"]);
  });
});

describe("pageExamples", () => {
  const headings = [
    { id: "inks", text: "Inks", level: 2 },
    { id: "dies", text: "Dies", level: 2 },
    { id: "output", text: "Output", level: 3 },
  ];
  const ranked = new Map([
    ["page#inks", ["a", "b", "c", "d"]],
    ["page#dies", ["a", "e"]],
    ["page#output", ["a", "b"]],
  ]);

  it("shows at most three per strip, new recipes only, pins again", () => {
    const pinned = sources({ overrides: { x: { docs: A("Output"), pin: ["a"] } } });
    const page = pageExamples("page", headings, ranked, pinned, resolve);
    expect(page.sections.map((s) => s.strip)).toEqual([["a", "b", "c"], ["e"], ["a"]]);
    expect(STRIP_SIZE).toBe(3);
  });

  it("lists each recipe once, under the section where it ranks best", () => {
    const page = pageExamples("page", headings, ranked, sources(), resolve);
    expect(page.groups.map((g) => [g.id, g.recipes])).toEqual([
      ["inks", ["a", "b", "c", "d"]],
      ["dies", ["e"]],
    ]);
    expect(page.count).toBe(5);
  });

  it("counts what a long section leaves to the Cookbook", () => {
    const many = Array.from({ length: GROUP_SIZE + 2 }, (_, i) => `r${i}`);
    const page = pageExamples("page", headings, new Map([["page#inks", many]]), sources(), resolve);
    expect(page.groups[0]!.more).toBe(2);
  });
});

describe("appendToSections", () => {
  const source = ["# Title", "", "Intro.", "", "## One", "", "Text.", "", "```md", "## Not a heading", "```", "", "### Two", "", "More."].join("\n");

  it("adds a block at the end of a section, before the next heading", () => {
    const out = appendToSections(source, { one: "<X />", two: "<Y />" });
    const lines = out.split("\n");
    expect(lines.indexOf("<X />")).toBeLessThan(lines.indexOf("### Two"));
    expect(lines.indexOf("<X />")).toBeGreaterThan(lines.indexOf("```"));
    expect(lines.at(-2)).toBe("<Y />");
    // The headings and their ids are unchanged.
    expect(extractToc(out)).toEqual(extractToc(source));
  });

  it("returns the source unchanged with no blocks", () => {
    expect(appendToSections(source, {})).toBe(source);
  });
});

// ─── The site's index ───────────────────────────────────────────────────────

const recipes = getAllRecipes();
const INKS_AND_DIES = [
  "gold-foil-poetry-cover", "corporate-fifth-ink-report", "fluorescent-pink-zine", "white-ink-kraft-menu",
  "spot-uv-photo-magazine", "peek-a-boo-board-book", "die-cut-window-cover", "forest-tunnel-book",
];

describe.skipIf(recipes.length === 0)("buildDocExamples", () => {
  const registry = loadRegistry();

  it.each(LOCALES)("builds a stable index for %s whose anchors resolve", (locale: Locale) => {
    const slugs = getDocSlugsForLocale(locale);
    const index = buildDocExamplesFrom(locale, recipes, registry, slugs);
    expect(JSON.stringify(buildDocExamplesFrom(locale, recipes, registry, slugs))).toBe(JSON.stringify(index));
    expect(Object.keys(index.pages).length).toBeGreaterThan(20);
    for (const [slug, page] of Object.entries(index.pages)) {
      const ids = new Set(docToc(slug, locale)!.map((item) => item.id));
      for (const section of page.sections) {
        expect(ids.has(section.id), `${slug}#${section.id}`).toBe(true);
        expect(section.strip.length).toBeLessThanOrEqual(STRIP_SIZE);
      }
      const listed = page.groups.flatMap((g) => g.recipes);
      expect(new Set(listed).size, slug).toBe(listed.length);
      expect(listed.length).toBe(page.count);
    }
    for (const card of Object.values(index.recipes)) {
      expect(card.href).toBe(`/${locale}/cookbook/${card.slug}`);
      expect(card.title).not.toBe("");
      expect(card.card480).toMatch(/\/card\.480\.webp\?v=/);
    }
  });

  it.each(LOCALES)("links the eight special inks and die-cuts recipes on that page in %s", (locale: Locale) => {
    const page = buildDocExamples(locale).pages["special-inks-die-cuts"]!;
    expect(new Set(page.groups.flatMap((g) => g.recipes))).toEqual(new Set(INKS_AND_DIES));
    const at = (english: string) => {
      const entry = Object.values(registry.docExamples ?? {}).find((e) => e.docs.slug === "special-inks-die-cuts" && e.docs.heading.en === english)!;
      const id = resolveDocAnchor(entry.docs, locale)!.id;
      return page.sections.find((s) => s.id === id)!.strip;
    };
    expect(at("Fifth inks")[0]).toBe("corporate-fifth-ink-report");
    expect(at("Finishes")).toEqual(["gold-foil-poetry-cover", "spot-uv-photo-magazine", "white-ink-kraft-menu"]);
    expect(at("Die shapes")).toEqual(["forest-tunnel-book"]);
    expect(at("Leaves and mirroring")).toEqual(["die-cut-window-cover"]);
  });

  it("names a published recipe in every pin and hide", () => {
    const published = new Set(recipes.map((r) => r.slug));
    const named = Object.values(registry.docExamples ?? {}).flatMap((e) => [...(e.pin ?? []), ...(e.hide ?? [])]);
    expect(named.filter((slug) => !published.has(slug))).toEqual([]);
  });

  it("collects the special inks and die-cuts recipes in Nº order", () => {
    const collection = registry.collections["special-inks-die-cuts"]!;
    const numbers = collection.recipes.map((slug) => recipes.find((r) => r.slug === slug)!.meta.number);
    expect(numbers).toEqual([188, 189, 190, 191, 192, 193, 194, 195]);
  });
});
