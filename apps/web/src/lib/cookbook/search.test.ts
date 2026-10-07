import MiniSearch from "minisearch";
import { describe, expect, it } from "vitest";
import {
  EXACT_IDENTIFIER_BONUS,
  MINISEARCH_OPTIONS,
  SEARCH_BOOSTS,
  cjkAwareTokenizer,
  cjkWords,
  exactIdentifierBonus,
  foldKana,
  kanaInsensitive,
  matchReason,
  processTerm,
  recipeIdentifiers,
  searchDocument,
  searchLocale,
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

  it("cuts Chinese into characters and overlapping pairs", () => {
    expect(tokenize("页眉设置")).toEqual(["页", "页眉", "眉", "眉设", "设", "设置", "置"]);
    expect(tokenize("脚")).toEqual(["脚"]);
  });

  it("breaks Chinese runs at function words, so no pair straddles them", () => {
    expect(tokenize("页眉的高度")).toEqual(["页", "页眉", "眉", "高", "高度", "度"]);
    expect(tokenize("如何添加脚注？")).toEqual(["添", "添加", "加", "加脚", "脚", "脚注", "注"]);
  });

  it("keeps Latin words and identifiers inside Chinese text", () => {
    expect(tokenize("用renderToPdf导出PDF书签")).toEqual([
      "用", "renderToPdf", "render", "To", "Pdf", "导", "导出", "出", "PDF", "书", "书签", "签",
    ]);
    expect(cjkWords("怎么给 PDF 加书签和目录")).toEqual(["给", "加书签", "目录"]);
  });
});

describe("processTerm", () => {
  const en = (term: string) => processTerm(term, "en");
  const es = (term: string) => processTerm(term, "es");
  const zh = (term: string) => processTerm(term, "zh");

  it("keeps single Chinese characters and drops Chinese stop words", () => {
    expect(zh("注")).toBe("注");
    expect(zh("脚注")).toBe("脚注");
    expect(zh("是")).toBeNull();
    expect(zh("这个")).toBeNull();
    expect(zh("the")).toBeNull();
    expect(zh("Tables")).toBe("table");
    expect(en("注")).toBe("注");
  });

  it("maps site locales to search locales", () => {
    expect(["en", "es", "zh", "ja", "fr"].map(searchLocale)).toEqual(["en", "es", "zh", "ja", "en"]);
  });

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

  it("match Chinese queries, which have no spaces, word by word", () => {
    const mini = new MiniSearch<SearchDocument>(MINISEARCH_OPTIONS.zh);
    mini.addAll(
      [
        recipe("footnotes-honestly", { title: "如实处理脚注", summary: "三种注释的变通办法。", search: { aliases: ["脚注", "尾注"] } }),
        recipe("running-heads", { title: "带书眉的图书页面", summary: "书眉按奇偶页放置，页码落到页脚。" }),
        recipe("pdf-with-fonts", { title: "嵌入字体的 PDF", summary: "用 renderToPdf 导出。", search: { apis: ["renderToPdf"] } }),
      ].map((r) => searchDocument(r, FACETS)),
    );
    const ids = (query: string, options?: Parameters<typeof mini.search>[1]) => mini.search(query, options).map((r) => r.id);
    expect(ids("脚注")).toEqual(["footnotes-honestly"]);
    expect(ids("如何添加脚注？")).toEqual([]);
    expect(ids("如何添加脚注？", { combineWith: "OR" })[0]).toBe("footnotes-honestly");
    expect(ids("书眉")).toEqual(["running-heads"]);
    expect(ids("书眉的页码")).toEqual(["running-heads"]);
    expect(ids("页")).toEqual(["running-heads"]);
    expect(ids("renderToPdf 导出")).toEqual(["pdf-with-fonts"]);
    expect(ids("页脚书眉")).toEqual([]);
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

describe("processTerm in Catalan", () => {
  const ca = (term: string) => processTerm(term, "ca");
  it("folds a feminine plural and its singular onto one term", () => {
    expect(ca("taules")).toBe(ca("taula"));
    expect(ca("capçaleres")).toBe(ca("capçalera"));
    expect(ca("imatges")).toBe(ca("imatge"));
    expect(ca("colors")).toBe(ca("color"));
  });
  it("drops Catalan stop words and keeps diacritics folded", () => {
    expect(ca("amb")).toBeNull();
    expect(ca("Què")).toBeNull();
    expect(ca("Índex")).toBe("index");
  });
});

describe("processTerm in Japanese", () => {
  const ja = (term: string) => processTerm(term, "ja");
  it("keeps kana and kanji grams and drops the kana words that carry nothing", () => {
    expect(ja("るび")).toBe("るび");
    expect(ja("縦")).toBe("縦");
    expect(ja("こと")).toBeNull();
    expect(ja("ため")).toBeNull();
    expect(ja("the")).toBeNull();
    expect(ja("Captions")).toBe("caption");
  });
});

describe("processTerm in Arabic", () => {
  const ar = (term: string) => processTerm(term, "ar");
  it("folds the article, the vowel marks and the sound plurals", () => {
    expect(ar("الجداول")).toBe(ar("جداول"));
    expect(ar("الصفحات")).toBe(ar("صفحة"));
    expect(ar("بالخط")).toBe(ar("خط"));
    expect(ar("مُتَرْجِمُونَ")).toBe(ar("مترجم"));
    expect(ar("إطار")).toBe(ar("اطار"));
  });
  it("drops Arabic stop words and reads Arabic-Indic digits", () => {
    expect(ar("التي")).toBeNull();
    expect(ar("على")).toBeNull();
    expect(ar("٢٠٢٦")).toBe("2026");
  });
  it("keeps Arabic words when tokenizing", () => {
    expect(tokenize("كيف أضيف حاشية سفلية، في PDF؟")).toEqual(["كيف", "أضيف", "حاشية", "سفلية", "في", "PDF"]);
  });
});

describe("Japanese", () => {
  it("indexes kana: runs of kanji and kana become characters and pairs", () => {
    expect(tokenize("縦書き")).toEqual(["縦", "縦書", "書", "書き", "き"]);
    expect(tokenize("ふりがな")).toEqual(["ふ", "ふり", "り", "りが", "が", "がな", "な"]);
    expect(tokenize("ノンブル")).toEqual(["の", "のん", "ん", "んぶ", "ぶ", "ぶる", "る"]);
  });

  it("folds katakana to hiragana and half-width katakana to full width", () => {
    expect(tokenize("ルビ")).toEqual(tokenize("るび"));
    expect(tokenize("ﾙﾋﾞ")).toEqual(tokenize("ルビ"));
    expect(tokenize("ｶﾀｶﾅ")).toEqual(tokenize("カタカナ"));
    expect(foldKana("カタカナとひらがな、ヽヾ")).toBe("かたかなとひらがな、ゝゞ");
    expect(foldKana("ヷ")).toBe("ヷ");
    // Full-width Latin is narrowed; other compatibility forms are not touched.
    expect(tokenize("ＰＤＦで出力")).toEqual(["PDF", "出", "出力", "力"]);
    expect(tokenize("① ㍻")).toEqual([]);
  });

  it("keeps the long-vowel mark and leaves the middle dot as a separator", () => {
    expect(tokenize("ルーラー")).toEqual(["る", "るー", "ー", "ーら", "ら", "らー", "ー"]);
    expect(cjkWords("傍点・圏点")).toEqual(["傍点", "圏点"]);
  });

  it("breaks a run at particles only where a word has ended", () => {
    expect(cjkWords("ルビの位置")).toEqual(["るび", "位置"]);
    expect(cjkWords("縦書きには")).toEqual(["縦書き"]);
    expect(cjkWords("ふりがなを付ける方法")).toEqual(["ふりがな", "付ける方法"]);
    expect(cjkWords("ひらがなとカタカナ")).toEqual(["ひらがな", "かたかな"]);
    expect(cjkWords("禁則処理とは何ですか")).toEqual(["禁則処理", "何"]);
    // Inside a word the same kana stay: が in ふりがな, か in 書かれた.
    expect(cjkWords("ふりがな")).toEqual(["ふりがな"]);
    expect(cjkWords("書かれた")).toEqual(["書かれた"]);
  });

  it("does not cut a Japanese run at the Chinese function words", () => {
    expect(cjkWords("和文と欧文")).toEqual(["和文", "欧文"]);
    // A run without kana is read as Chinese, as before.
    expect(cjkWords("页眉的高度")).toEqual(["页眉", "高度"]);
  });

  it("keeps single kana and kanji as terms, and pairs whole", () => {
    expect(processTerm("る", "en")).toBe("る");
    expect(processTerm("が", "es")).toBe("が");
    expect(processTerm("るび", "ar")).toBe("るび");
    expect(processTerm("字", "zh")).toBe("字");
    expect(processTerm("是", "zh")).toBeNull();
  });

  it("separates an identifier from the Japanese around it", () => {
    expect(exactIdentifierBonus("renderToPdfの使い方", ["renderToPdf"])).toBe(EXACT_IDENTIFIER_BONUS);
    expect(exactIdentifierBonus("ルビcalloutStylesとは", ["calloutStyles"])).toBe(EXACT_IDENTIFIER_BONUS);
  });

  it("marks a folded term in either kana", () => {
    const pattern = new RegExp(kanaInsensitive("るび"), "u");
    expect(pattern.test("ルビ")).toBe(true);
    expect(pattern.test("るび")).toBe(true);
    expect(pattern.test("ルヒ")).toBe(false);
  });

  it("wraps another tokenizer, cutting only the Chinese and Japanese runs", () => {
    const words = cjkAwareTokenizer((text) => text.split(/[\s,.()]+/));
    expect(words("Ruby (ルビ) and 縦中横.")).toEqual(["Ruby", "る", "るび", "び", "and", "縦", "縦中", "中", "中横", "横"]);
  });

  it("lets a docs index with MiniSearch's own splitting find quoted Japanese", () => {
    // As DocsSearchPalette builds the en/es/ca/ar docs index.
    const mini = new MiniSearch<{ id: string; body: string }>({
      fields: ["body"],
      tokenize: cjkAwareTokenizer(MiniSearch.getDefault("tokenize") as (text: string) => string[]),
      searchOptions: { prefix: true },
    });
    mini.addAll([
      { id: "ruby", body: "Furigana (振り仮名, ルビ) sits over the base text." },
      { id: "vertical", body: "Vertical writing (縦書き) with tate-chū-yoko (縦中横)." },
      { id: "latin", body: "Headings and running heads." },
    ]);
    const ids = (query: string) => mini.search(query).map((r) => r.id);
    expect(ids("ルビ")).toEqual(["ruby"]);
    expect(ids("振り仮名")).toEqual(["ruby"]);
    expect(ids("縦書き")).toEqual(["vertical"]);
    expect(ids("縦中横")).toEqual(["vertical"]);
    expect(ids("running heads")).toEqual(["latin"]);
  });

  const RECIPES_JA = [
    recipe("furigana", {
      title: "Furigana over kanji",
      summary: "ルビ（振り仮名）を親文字の上に組む。熟語ルビとグループルビ。",
      search: { aliases: ["ふりがな", "ruby"] },
    }),
    recipe("vertical-bunko", {
      title: "A vertical bunko page",
      summary: "縦書きの文庫本。ノンブルと柱。",
      search: { aliases: ["tategaki"] },
    }),
    recipe("kinsoku", {
      title: "Line-start and line-end rules",
      summary: "禁則処理：小書きの仮名や句読点を行頭に置かない。",
      search: { aliases: ["kinsoku shori"] },
    }),
    recipe("kana-tables", {
      title: "A kana chart",
      summary: "ひらがなとカタカナの五十音表。",
    }),
    recipe("chinese-ruby", {
      title: "注音与拼音",
      summary: "在汉字上方排注音。",
    }),
  ];

  for (const locale of ["en", "es", "ca", "zh", "ar", "ja", "pt"] as const) {
    it(`finds recipes by their Japanese words in the ${locale} index`, () => {
      const mini = new MiniSearch<SearchDocument>(MINISEARCH_OPTIONS[locale]);
      mini.addAll(RECIPES_JA.map((r) => searchDocument(r, FACETS)));
      const ids = (query: string) => mini.search(query).map((r) => r.id);
      expect(ids("ルビ")).toEqual(["furigana"]);
      expect(ids("るび")).toEqual(["furigana"]);
      expect(ids("ﾙﾋﾞ")).toEqual(["furigana"]);
      expect(ids("ふりがな")).toEqual(["furigana"]);
      expect(ids("フリガナ")).toEqual(["furigana"]);
      expect(ids("縦書き")).toEqual(["vertical-bunko"]);
      expect(ids("縦書きのノンブル")).toEqual(["vertical-bunko"]);
      expect(ids("禁則処理")).toEqual(["kinsoku"]);
      expect(ids("カタカナ")).toEqual(["kana-tables"]);
      expect(ids("ひらがな")).toEqual(["kana-tables"]);
      expect(ids("熟語ルビ")).toEqual(["furigana"]);
      expect(ids("注音")).toEqual(["chinese-ruby"]);
    });
  }
});
