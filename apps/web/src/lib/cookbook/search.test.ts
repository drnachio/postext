import MiniSearch from "minisearch";
import { describe, expect, it } from "vitest";
import {
  EXACT_IDENTIFIER_BONUS,
  MINISEARCH_OPTIONS,
  SEARCH_BOOSTS,
  exactIdentifierBonus,
  matchReason,
  processTerm,
  recipeIdentifiers,
  searchDocument,
  tokenize,
  type SearchDocument,
} from "./search.ts";
import type { Catalog, CatalogRecipe, Locale } from "./types.ts";

describe("tokenize", () => {
  it("splits on whitespace and punctuation", () => {
    expect(tokenize("Knuth–Plass, hyphenation (per language)!")).toEqual(["Knuth", "Plass", "hyphenation", "per", "language"]);
  });

  it("emits camelCase parts next to the word", () => {
    expect(tokenize("renderToPdf")).toEqual(["renderToPdf", "render", "To", "Pdf"]);
    expect(tokenize("PDFExport renderToPDF")).toEqual(["PDFExport", "PDF", "Export", "renderToPDF", "render", "To", "PDF"]);
  });

  it("emits the segments of dotted paths", () => {
    expect(tokenize("headings.levels[].advancedDesign")).toEqual([
      "headings", "levels", "advancedDesign", "advanced", "Design",
    ]);
  });

  it("keeps accented letters inside words", () => {
    expect(tokenize("Títulos y aperturas: ñandú")).toEqual(["Títulos", "y", "aperturas", "ñandú"]);
  });
});

describe("processTerm", () => {
  const en = (term: string) => processTerm(term, "en");
  const es = (term: string) => processTerm(term, "es");

  it("lowercases and strips diacritics", () => {
    expect(es("Título")).toBe("titulo");
    expect(es("Elaboración")).toBe("elaboracion");
  });

  it("drops stop words (after folding) and one-letter terms", () => {
    expect(en("How")).toBeNull();
    expect(en("the")).toBeNull();
    expect(es("Cómo")).toBeNull();
    expect(es("más")).toBeNull();
    expect(en("x")).toBeNull();
    expect(en("3")).toBe("3");
  });

  it("folds naive plurals the same way for the index and the query", () => {
    expect(["boxes", "classes", "captions", "entries", "tables", "status", "axis"].map(en)).toEqual([
      "box", "class", "caption", "entry", "table", "status", "axis",
    ]);
    expect(["colores", "imágenes", "notas", "luces", "títulos", "tablas"].map(es)).toEqual([
      "color", "imagen", "nota", "luz", "titulo", "tabla",
    ]);
    expect(es("color")).toBe("color");
    expect(en("caption")).toBe("caption");
  });
});

// ─── MiniSearch over a small catalogue ──────────────────────────────────────

function recipe(
  slug: string,
  fields: Omit<Partial<CatalogRecipe>, "search"> & { search?: Partial<CatalogRecipe["search"]> },
): CatalogRecipe {
  return {
    slug,
    number: 1,
    chapter: "headings",
    order: 10,
    level: 2,
    genres: ["magazine"],
    outputs: ["canvas"],
    features: [],
    primary: [],
    warnings: [],
    collections: [],
    gap: false,
    created: "2026-09-25",
    updated: "2026-09-25",
    pages: 4,
    title: slug,
    summary: "",
    question: "",
    href: `/cookbook/${slug}`,
    card: { src: "", src480: "" },
    ...fields,
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
      ...fields.search,
    },
  };
}

const FACETS: Catalog["facets"] = {
  chapters: [{ id: "headings", number: 3, part: "page", color: "blue", title: "Headings & openers", count: 3 }],
  genres: [{ id: "magazine", title: "Magazines" }],
  outputs: [],
  levels: [],
  features: [],
  warnings: [{ kind: "calloutOverflow", label: "A callout overflows its page" }],
  collections: [],
};

const RECIPES = [
  recipe("pdf-with-fonts", {
    title: "A PDF with its fonts embedded",
    summary: "renderToPdf with a Fontsource provider.",
    search: { apis: ["buildDocument", "renderToPdf"], configKeys: ["page", "bodyText"], fonts: ["Newsreader"] },
  }),
  recipe("footnotes-honestly", {
    title: "Footnotes, honestly",
    summary: "Three workarounds for notes.",
    gap: true,
    search: { aliases: ["Notas al pie", "footnote"], questions: ["How do I add footnotes?"] },
  }),
  recipe("callout-split", {
    title: "Boxes that split across pages",
    warnings: ["calloutOverflow"],
    search: { configKeys: ["calloutStyles", "headings"], headings: ["Split between children"] },
  }),
];

function index(locale: Locale = "en") {
  const mini = new MiniSearch<SearchDocument>(MINISEARCH_OPTIONS[locale]);
  mini.addAll(RECIPES.map((r) => searchDocument(r, FACETS)));
  return mini;
}

describe("MiniSearch options", () => {
  it("index every boosted field", () => {
    expect(MINISEARCH_OPTIONS.en.fields).toEqual(Object.keys(SEARCH_BOOSTS));
    expect(Object.keys(searchDocument(RECIPES[0], FACETS)).sort()).toEqual(["id", ...Object.keys(SEARCH_BOOSTS)].sort());
    expect(searchDocument(RECIPES[2], FACETS).warnings).toBe("calloutOverflow\nA callout overflows its page");
    expect(searchDocument(RECIPES[2], FACETS).chapter).toBe("Headings & openers");
  });

  it("find identifiers by their words, and words by prefix and typo", () => {
    const mini = index();
    const ids = (query: string, options?: Parameters<typeof mini.search>[1]) => mini.search(query, options).map((r) => r.id);
    expect(ids("renderToPdf")).toEqual(["pdf-with-fonts"]);
    expect(ids("render to PDF")).toEqual(["pdf-with-fonts"]);
    expect(ids("callout style")).toEqual(["callout-split"]);
    expect(ids("footnot")).toEqual(["footnotes-honestly"]);
    expect(ids("newsreeder")).toEqual(["pdf-with-fonts"]);
    expect(ids("callout overflows")).toEqual(["callout-split"]);
    expect(ids("footnotes pdf")).toEqual([]);
    expect(ids("footnotes pdf", { combineWith: "OR" }).sort()).toEqual(["footnotes-honestly", "pdf-with-fonts"]);
  });

  it("match Spanish queries with accents and plurals", () => {
    expect(index("es").search("nota al pié").map((r) => r.id)).toEqual(["footnotes-honestly"]);
  });
});

describe("ranking helpers", () => {
  it("give a bonus to exact identifiers only", () => {
    const ids = recipeIdentifiers(RECIPES[2]);
    expect(exactIdentifierBonus("calloutOverflow", ids)).toBe(EXACT_IDENTIFIER_BONUS);
    expect(exactIdentifierBonus("why calloutoverflow?", ids)).toBe(EXACT_IDENTIFIER_BONUS);
    expect(exactIdentifierBonus("headings", ids)).toBe(0);
    expect(exactIdentifierBonus("renderToPdf()", recipeIdentifiers(RECIPES[0]))).toBe(EXACT_IDENTIFIER_BONUS);
  });

  it("explain a match by its best non-title field", () => {
    const [hit] = index().search("footnotes");
    expect(matchReason(hit.match, RECIPES[1])).toEqual({ field: "questions", terms: ["footnote"], text: "How do I add footnotes?" });
    const [titleOnly] = index().search("honestly");
    expect(matchReason(titleOnly.match, RECIPES[1])).toBeNull();
    expect(matchReason({ newsreader: ["fonts"], pdf: ["summary", "title"] })).toEqual({ field: "summary", terms: ["pdf"] });
  });
});
