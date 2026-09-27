import { describe, expect, it } from "vitest";
import type { Catalog, CatalogRecipe } from "@/lib/cookbook/types";
import {
  EMPTY_STATE,
  computeModel,
  indexCatalog,
  isFiltered,
  matchedGaps,
  parseState,
  sanitizeState,
  serializeState,
} from "./model";
import { PREPAINT_SCRIPT } from "./prepaint";

function recipe(slug: string, over: Partial<CatalogRecipe>): CatalogRecipe {
  return {
    slug,
    number: 1,
    chapter: "page",
    order: 10,
    level: 1,
    genres: ["any"],
    outputs: ["canvas"],
    features: [],
    primary: [],
    warnings: [],
    collections: [],
    gap: false,
    created: "2026-09-01",
    updated: "2026-09-01",
    pages: 2,
    title: slug,
    summary: "",
    question: "",
    href: `/cookbook/${slug}`,
    card: { src: "", src480: "" },
    search: {
      questions: [],
      aliases: [],
      featureLabels: [],
      apis: [],
      configKeys: [],
      directives: [],
      fonts: [],
      headings: [],
      gotchas: [],
      otherTitle: "",
    },
    ...over,
  };
}

const catalog: Catalog = {
  locale: "en",
  testedWith: "1.4.1",
  facets: {
    chapters: [
      { id: "page", number: 1, part: "page", color: "blue", title: "Page & grid", count: 2 },
      { id: "tables", number: 8, part: "book", color: "gilt", title: "Tables", count: 1 },
    ],
    genres: [
      { id: "textbook", title: "Textbooks" },
      { id: "magazine", title: "Magazines" },
    ],
    outputs: [
      { id: "canvas", title: "Canvas" },
      { id: "pdf", title: "PDF" },
    ],
    levels: [
      { id: 1, title: "Basic" },
      { id: 2, title: "Intermediate" },
      { id: 3, title: "Advanced" },
    ],
    features: [
      { id: "side-captions", label: "Side captions", group: "figures" },
      { id: "running-heads", label: "Running heads", group: "furniture" },
    ],
    warnings: [{ kind: "calloutOverflow", label: "A callout overflows" }],
    collections: [{ id: "start-here", title: "Start here" }],
  },
  recipes: [
    recipe("grid-page", {
      number: 3,
      genres: ["textbook"],
      features: ["running-heads"],
      title: "A page on its baseline grid",
      summary: "Every line sits on the grid.",
      created: "2026-09-02",
      collections: ["start-here"],
    }),
    recipe("side-notes", {
      number: 7,
      order: 20,
      level: 3,
      genres: ["textbook", "magazine"],
      outputs: ["canvas", "pdf"],
      features: ["side-captions", "running-heads"],
      warnings: ["calloutOverflow"],
      title: "Margin notes in a side column",
      created: "2026-09-10",
      gap: true,
      search: { ...recipe("x", {}).search, configKeys: ["layout.sideColumnRole"] },
    }),
    recipe("price-list", {
      number: 9,
      chapter: "tables",
      level: 2,
      genres: ["magazine"],
      title: "A price list table",
      created: "2026-09-05",
    }),
  ],
  gaps: [
    {
      id: "footnotes",
      label: "Footnotes",
      aliases: ["footnote", "notes at the foot of the page"],
      explanation: "Not parsed.",
      recipes: ["side-notes"],
    },
    {
      id: "running-head-marks",
      label: "Dictionary running heads",
      aliases: ["running heads with the first entry"],
      explanation: "No marks.",
      recipes: [],
    },
  ],
};

const loaded = indexCatalog(catalog, "en");
const model = (query: string) => computeModel(loaded, parseState(new URLSearchParams(query)), "en");
const slugs = (query: string) => model(query).results.map((r) => r.recipe.slug);

describe("URL grammar", () => {
  it("parses comma lists, drops duplicates and unknown values of view and sort", () => {
    const state = parseState(new URLSearchParams("q=side+column&genre=textbook,textbook,magazine&view=grid&sort=nope"));
    expect(state).toMatchObject({ q: "side column", genre: ["textbook", "magazine"], view: "plates", sort: null });
  });

  it("writes keys in grammar order and lists in registry order, dropping unknown ids", () => {
    const state = sanitizeState(
      parseState(new URLSearchParams("sort=new&feat=running-heads,side-captions,bogus&cat=nowhere&q=a b")),
      catalog,
    );
    expect(serializeState(state)).toBe("q=a+b&feat=side-captions,running-heads&sort=new");
  });

  it("knows the unfiltered state", () => {
    expect(isFiltered(EMPTY_STATE)).toBe(false);
    expect(isFiltered({ ...EMPTY_STATE, view: "contents" })).toBe(true);
    expect(serializeState(EMPTY_STATE)).toBe("");
  });

  it("marks <html> before paint for any key of the grammar", () => {
    for (const key of ["q", "cat", "genre", "level", "out", "feat", "warn", "col", "view", "sort"]) {
      expect(PREPAINT_SCRIPT).toContain(`"${key}"`);
    }
  });
});

describe("facets", () => {
  it("combines features with AND and other facets with OR", () => {
    expect(slugs("feat=running-heads,side-captions")).toEqual(["side-notes"]);
    expect(slugs("genre=textbook,magazine")).toEqual(["grid-page", "side-notes", "price-list"]);
    expect(slugs("genre=magazine&level=3")).toEqual(["side-notes"]);
  });

  it("counts each value as if the other facets stayed", () => {
    const { counts } = model("genre=magazine");
    // Genre counts ignore the genre selection itself…
    expect(counts.genre).toEqual({ textbook: 2, magazine: 2 });
    // …the others apply it.
    expect(counts.cat).toEqual({ page: 1, tables: 1 });
    expect(counts.level).toEqual({ "2": 1, "3": 1 });
  });

  it("counts a feature as the recipes that also keep the other picks", () => {
    expect(model("feat=running-heads").counts.feat).toEqual({ "running-heads": 2, "side-captions": 1 });
  });

  it("suggests what to remove when the facets exclude everything", () => {
    const m = model("cat=tables&genre=textbook");
    expect(m.results).toEqual([]);
    expect(m.removals).toEqual([
      { key: "genre", id: "textbook", count: 1 },
      { key: "cat", id: "tables", count: 2 },
    ].sort((a, b) => b.count - a.count));
  });
});

describe("search", () => {
  it("ranks by relevance with a query and explains non-title hits", () => {
    const m = model("q=sideColumnRole");
    expect(m.sort).toBe("relevance");
    expect(m.results.map((r) => r.recipe.slug)).toEqual(["side-notes"]);
    expect(m.results[0].reason).toMatchObject({ field: "configKeys", text: "layout.sideColumnRole" });
  });

  it("retries with OR and says so", () => {
    const m = model("q=price+baseline");
    expect(m.partial).toBe(true);
    expect(m.results.map((r) => r.recipe.slug).sort()).toEqual(["grid-page", "price-list"]);
  });

  it("sorts by newest, level and title", () => {
    expect(slugs("sort=new")).toEqual(["side-notes", "price-list", "grid-page"]);
    expect(slugs("sort=level")).toEqual(["grid-page", "price-list", "side-notes"]);
    expect(slugs("sort=az")).toEqual(["grid-page", "price-list", "side-notes"]);
  });

  it("pins the workaround when the query names a gap", () => {
    const m = model("q=footnotes");
    expect(m.gaps.map((g) => g.id)).toEqual(["footnotes"]);
    expect(m.results[0]).toMatchObject({ pinned: true, recipe: { slug: "side-notes" } });
  });

  it("answers a query that only names a gap with its workarounds alone", () => {
    // "notes at the foot of the page" would match other recipes word by word.
    const m = model("q=notes+at+the+foot+of+the+page");
    expect(m.gaps.map((g) => g.id)).toEqual(["footnotes"]);
    expect(m.results.map((r) => [r.recipe.slug, r.pinned])).toEqual([["side-notes", true]]);
    expect(model("q=running+head+marks").gaps).toEqual([]);
  });

  it("matches a gap only when the query names it in full", () => {
    expect(matchedGaps("how do I add footnotes", catalog.gaps!, "en").map((g) => g.id)).toEqual(["footnotes"]);
    expect(matchedGaps("running heads", catalog.gaps!, "en")).toEqual([]);
  });

  it("finds nothing for gibberish, and offers no removals", () => {
    const m = model("q=zzqxw");
    expect(m.results).toEqual([]);
    expect(m.removals).toEqual([]);
  });
});
