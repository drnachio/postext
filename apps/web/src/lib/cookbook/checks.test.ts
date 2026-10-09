import { describe, expect, it } from "vitest";
import { cardProblems, sidesOf, spreadsOf } from "../../../scripts/cookbook/cards.ts";
import { detect, detectFeatures, runChecks } from "../../../scripts/cookbook/checks.ts";
import type { CheckInput, EpubRecord, ProbeFacts } from "../../../scripts/cookbook/checks.ts";
import { loadRegistry } from "./registry.ts";
import type { ComposedPen, RecipeMeta } from "./types.ts";

// The capture's checks, judged in Node from what lib/probe.js returns.

function meta(extra: Partial<RecipeMeta> = {}): RecipeMeta {
  return {
    schemaVersion: 1, number: 74, status: "draft", chapter: "type", order: 10, level: 2, genres: ["novel"],
    outputs: ["canvas", "pdf"], features: { primary: ["cjk-line-breaking"], also: ["cjk-fonts"] }, answers: ["Q88"],
    engine: { postext: "1.9.0", postextPdf: "1.9.0" }, kit: ["core", "fonts", "viewer", "pdf", "cjk"],
    sample: { locales: ["en", "es"] }, capture: { hero: 1, card: "page" }, downloads: { pdf: true },
    credits: { authors: [{ name: "Fixture" }], text: [], images: [], fonts: [{ family: "Noto Serif SC", license: "OFL-1.1" }] },
    license: { code: "MIT", content: "MIT" }, created: "2026-09-28", updated: "2026-09-28",
    ...extra,
  };
}

function facts(extra: Partial<ProbeFacts> = {}): ProbeFacts {
  return {
    builds: [{ kind: "document", shim: "postext", ms: 300, at: 900, pages: 2 }],
    selected: 0, importedAt: 400, registered: [], state: "ready", status: "2 pages", pdfButton: true,
    pages: [1, 2].map((n) => ({
      n, book: n, docIndex: 0, index: n - 1, label: String(n), role: "body" as const, w: 800, h: 1100, trimOffset: 0,
      blank: false, blocks: 8, coverage: 0.9, h1: n === 1, heading: "", captions: [],
    })),
    ...extra,
  };
}

function input(overrides: Partial<CheckInput> = {}): CheckInput {
  return {
    meta: meta(), facts: facts(), done: "ok", err: null, loaderErrors: [], console: [], pageErrors: [], net: [],
    failedRequests: [], settleTimedOut: false, kit: { state: "ready", status: "2 pages" }, tainted: [], passive: false,
    workerEngines: [], engine: "1.9.0", timeoutMs: 60_000, totalMs: 4000,
    pdf: { button: true, timedOut: false, error: null, fontFailures: [], bytes: 90_000, pages: 2 },
    published: [1, 2], publishError: null, cardErrors: [], renderError: null, magnification: null, bytes: 200_000,
    cardBytes: { card: 40_000, card480: 12_000, og: 40_000 },
    assets: [],
    detected: {
      apis: [], configKeys: [], configSections: [], configLeaves: 0, designElements: 0, directives: [], inline: [],
      resources: { svg: 0, bitmap: 0, table: 0 }, fonts: [], features: [], suggestedLevel: 2, paths: [],
    },
    registry: null, previous: null, chrome: "152", vdtHash: "x", sourceHash: "y",
    ...overrides,
  };
}

const of = (check: string, findings: ReturnType<typeof runChecks>) => findings.filter((f) => f.check === check);

describe("C5: content warnings on how the text is set (#401)", () => {
  const textWarnings = [
    { kind: "arabicMarksExceedLeading", page: 3, detail: "وَقَالَ" },
    { kind: "unbreakableWordOverflow", page: null, detail: "https://example.org/a-very-long-path" },
    { kind: "joiningScriptLetterSpacing", page: 1, detail: "كتاب" },
    { kind: "lineNumberOverlap", page: 2, detail: "line 40" },
    { kind: "tabInVerticalText", page: null, detail: ":tab" },
    { kind: "dropCap", page: 1, detail: "shortParagraph (reserve): A short paragraph." },
    { kind: "codeOverflow", page: 2, detail: "wrap: 1 line(s) of js" },
  ];

  it("fails a recipe on the Arabic, word-overflow, line-number and tab warnings it does not expect", () => {
    const c5 = of("C5", runChecks(input({ facts: facts({ textWarnings }) })));
    expect(c5.map((f) => [f.severity, f.detail])).toEqual([
      ["fail", 'arabicMarksExceedLeading "وَقَالَ" on page 3'],
      ["fail", 'unbreakableWordOverflow "https://example.org/a-very-long-path"'],
      ["fail", 'joiningScriptLetterSpacing "كتاب" on page 1'],
      ["fail", 'lineNumberOverlap "line 40" on page 2'],
      ["fail", 'tabInVerticalText ":tab"'],
      ["fail", 'dropCap "shortParagraph (reserve): A short paragraph." on page 1'],
      ["fail", 'codeOverflow "wrap: 1 line(s) of js" on page 2'],
    ]);
  });

  it("lets a recipe that shows one list it in expect.warnings", () => {
    const m = meta({ capture: { hero: 1, card: "page", expect: { warnings: ["arabicMarksExceedLeading"] } } } as Partial<RecipeMeta>);
    const c5 = of("C5", runChecks(input({ meta: m, facts: facts({ textWarnings: textWarnings.slice(0, 1) }) })));
    expect(c5).toEqual([]);
    // Listed and absent: an info, as for the other warnings.
    const absent = of("C5", runChecks(input({ meta: m, facts: facts({ textWarnings: [] }) })));
    expect(absent.map((f) => [f.severity, f.detail])).toEqual([["info", "expect.warnings lists arabicMarksExceedLeading, which did not occur"]]);
  });
});

describe("C24: loose lines", () => {
  it("judges Chinese lines by the space between their characters", () => {
    const cjkLoose = {
      count: 1, total: 40, share: 0.025, worst: 0.5, threshold: 0.5,
      lines: [{ page: 2, tracking: 0.5, text: "他把那一张写满了字的纸递过来，上面是https://example.com/a/very/long/path" }],
    };
    const found = of("C24", runChecks(input({ facts: facts({ cjkLoose }) })));
    expect(found).toEqual([{
      check: "C24",
      severity: "warn",
      detail: "1 of 40 justified Chinese, Japanese or Korean lines needed more than 0.5 em between characters and end short (cjkLooseLine); p. 2 “他把那一张写满了字的纸递过来，上面是https://example.com/a/very/lo…”",
    }]);
    // Spacing within the cap is how Chinese lines are justified: no finding.
    const fine = { count: 0, total: 40, share: 0, worst: 0.18, threshold: 0.5, lines: [] };
    expect(of("C24", runChecks(input({ facts: facts({ cjkLoose: fine }) })))).toEqual([]);
  });

  it("judges Japanese lines the same way", () => {
    const cjkLoose = { count: 1, total: 30, share: 0.03, worst: 0.6, threshold: 0.5, lines: [{ page: 4, tracking: 0.6, text: "先生の手紙にはhttps://www.aozora.gr.jp/とだけあった。" }] };
    expect(of("C24", runChecks(input({ facts: facts({ cjkLoose }) })))[0].detail).toBe(
      "1 of 30 justified Chinese, Japanese or Korean lines needed more than 0.5 em between characters and end short (cjkLooseLine); p. 4 “先生の手紙にはhttps://www.aozora.gr.jp/とだけあった。”",
    );
  });

  it("keeps the word-space rule for Latin lines", () => {
    const loose = { count: 3, total: 100, share: 0.03, worst: 2.4, threshold: 2, lines: [{ page: 1, ratio: 2.4, text: "a loose line" }] };
    expect(of("C24", runChecks(input({ facts: facts({ loose }) })))[0].detail).toMatch(/^3 of 100 justified lines \(3\.0 %\) stretch past 2×/);
  });
});

describe("C25: characters the PDF cannot set", () => {
  it("reports what postext-pdf drew with no glyph", () => {
    const console = [
      { type: "warn", text: 'postext-pdf: "Noto Serif SC" 400 has no glyph for 2 characters (釵 𠞆); the PDF draws them as the font\'s .notdef glyph' },
      { type: "log", text: "unrelated" },
    ];
    const found = of("C25", runChecks(input({ console })));
    expect(found).toEqual([{ check: "C25", severity: "warn", detail: 'the PDF has no glyph for "Noto Serif SC" 400: 釵 𠞆' }]);
  });

  it("lists characters outside latin that no loaded face covers", () => {
    const nonLatin = [{ ch: "ǎ", code: "U+01CE", where: "page 1" }];
    expect(of("C25", runChecks(input({ facts: facts({ nonLatin }) })))[0].detail).toBe("outside the latin subset: ǎ U+01CE");
    // Hentaigana: no Fontsource Japanese file has them.
    const kana = [{ ch: "𛀁", code: "U+1B001", where: "page 3" }];
    expect(of("C25", runChecks(input({ facts: facts({ nonLatin: kana }) })))[0].detail).toBe("outside the latin subset: 𛀁 U+1B001");
  });

  it("trusts the cjk block's provider with the latin-ext letters of a Latin face (#466)", () => {
    // ō from the latin-ext file loadFonts added to Newsreader: cjkPdfProvider adds that file too.
    const romaji = [{ ch: "ō", code: "U+014D", where: "page 2", ownFile: true }];
    expect(of("C25", runChecks(input({ facts: facts({ nonLatin: romaji }) })))).toEqual([]);
    // fontsourceProvider (the pdf block alone) embeds the latin-ext and greek
    // files the face holds on screen too (#541); a letter no loaded file holds is named.
    const latinKit = meta({ kit: ["core", "fonts", "viewer", "pdf"] });
    const chi = [...romaji, { ch: "χ", code: "U+03C7", where: "page 4", ownFile: true }];
    expect(of("C25", runChecks(input({ meta: latinKit, facts: facts({ nonLatin: chi }) })))).toEqual([]);
    const stray = [{ ch: "ō", code: "U+014D", where: "page 2" }];
    expect(of("C25", runChecks(input({ meta: latinKit, facts: facts({ nonLatin: stray }) })))[0].detail).toBe("outside the latin subset: ō U+014D");
    // A Greek letter from a greek file the recipe loaded itself: the provider adds latin-ext only.
    const greek = [...romaji, { ch: "λ", code: "U+03BB", where: "page 3", ownFile: true }];
    expect(of("C25", runChecks(input({ facts: facts({ nonLatin: greek }) })))[0].detail).toBe("outside the latin subset: λ U+03BB");
  });
});

describe("C14: a PDF shaped without HarfBuzz", () => {
  it("fails a capture whose PDF set Arabic without HarfBuzz", () => {
    const console = [{ type: "warn", text: "postext-pdf: HarfBuzz did not load, so right-to-left and joining text is shaped with fontkit and its marks are misplaced (https://esm.sh/x/harfbuzz.wasm: HTTP 404)" }];
    const found = of("C14", runChecks(input({ console })));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ severity: "fail" });
    expect(found[0].detail).toMatch(/shaped without HarfBuzz: postext-pdf: HarfBuzz did not load/);
  });

  it("also knows the older releases' message", () => {
    const console = [{ type: "warn", text: "postext-pdf: HarfBuzz did not load; complex scripts are shaped with fontkit ([unenv] module.require is not implemented yet!)" }];
    expect(of("C14", runChecks(input({ console })))).toHaveLength(1);
  });
});

describe("C14: the PDF's pages against the selected builds (#540)", () => {
  const builds = [
    { kind: "document", shim: "postext", ms: 300, at: 900, pages: 3 },
    { kind: "document", shim: "postext", ms: 300, at: 1200, pages: 3 },
  ] as ProbeFacts["builds"];
  const pdf = (pages: number) => ({ button: true, timedOut: false, error: null, fontFailures: [], bytes: 90_000, pages });
  const run = (pages: number) => of("C14", runChecks(input({ facts: facts({ builds, selectedBuilds: [0, 1] }), pdf: pdf(pages) })));

  it("takes a PDF of one of the builds", () => {
    expect(run(3)).toEqual([]);
  });

  it("takes a PDF of all the chained builds, their pages summed", () => {
    expect(run(6)).toEqual([]);
  });

  it("fails a PDF of any other length", () => {
    expect(run(5).map((f) => f.detail)).toEqual(["the PDF has 5 pages, the documents 3 and 3 (6 together)"]);
  });
});

describe("C12: CJK and Arabic files loaded after the layout", () => {
  it("fails a face that set characters it had not loaded", () => {
    const late = [{ family: "Noto Sans TC", weight: 700, style: "normal" as const, where: "p3 heading", chars: "章回" }];
    const faces = { used: [], loaded: [], missing: [], late };
    expect(of("C12", runChecks(input({ facts: facts({ faces }) })))).toEqual([{
      check: "C12",
      severity: "fail",
      detail: "Noto Sans TC 700 sets 章 回 (p3 heading) from files not loaded when the layout ran: give loadCjkFonts the text this face sets, and list the weight in FONTS",
    }]);
    expect(of("C12", runChecks(input({ facts: facts({ faces: { used: [], loaded: [], missing: [] } }) })))).toEqual([]);
  });

  it("names loadCjkFonts for a Japanese face, kana or kanji", () => {
    const late = [{ family: "Noto Sans JP", weight: 700, style: "normal" as const, where: "p5 heading", chars: "先生と私" }];
    const faces = { used: [], loaded: [], missing: [], late };
    expect(of("C12", runChecks(input({ facts: facts({ faces }) })))[0].detail).toBe(
      "Noto Sans JP 700 sets 先 生 と 私 (p5 heading) from files not loaded when the layout ran: give loadCjkFonts the text this face sets, and list the weight in FONTS",
    );
  });

  it("names loadArabicFonts for an Arabic weight that had only its latin file", () => {
    const late = [{ family: "Amiri", weight: 700, style: "normal" as const, where: "p2 heading", chars: "اللي" }];
    const faces = { used: [], loaded: [], missing: [], late };
    expect(of("C12", runChecks(input({ facts: facts({ faces }) })))[0].detail).toBe(
      "Amiri 700 sets ا ل ل ي (p2 heading) from files not loaded when the layout ran: list the weight in FONTS and load it with loadArabicFonts(FONTS, markdown) before the build",
    );
  });
});

describe("spreads of a right-bound book", () => {
  it("keeps [verso, recto] and lays them out mirrored", () => {
    const spreads = spreadsOf([1, 2, 3, 4]);
    expect(spreads).toEqual([[null, 0], [1, 2], [3, null]]);
    expect(spreads.map((pair) => sidesOf(pair, "left"))).toEqual([[null, 0], [1, 2], [3, null]]);
    // Page 1 alone on the left of the spine, then [3 | 2].
    expect(spreads.map((pair) => sidesOf(pair, "right"))).toEqual([[0, null], [2, 1], [null, 3]]);
  });
});

describe("spreads of a capture that takes two builds", () => {
  it("starts each build's pages on a spread of their own", () => {
    // Two editions of four pages: their book pages are 1–4 and 1–4 again.
    const book = new Map([[1, 1], [2, 2], [3, 3], [4, 4], [5, 1], [6, 2], [7, 3], [8, 4]]);
    expect(spreadsOf([1, 2, 3, 4, 5, 6, 7, 8], book)).toEqual([[null, 0], [1, 2], [3, null], [null, 4], [5, 6], [7, null]]);
    // Book page 4 of the first edition does not face page 1 of the second.
    expect(spreadsOf([4, 5], book)).toEqual([[0, null], [null, 1]]);
    // One build, as before.
    expect(spreadsOf([1, 2, 3, 4], new Map([[1, 1], [2, 2], [3, 3], [4, 4]]))).toEqual(spreadsOf([1, 2, 3, 4]));
  });

  it("does not take a hero pair across the two builds", () => {
    const book = new Map([[1, 1], [2, 2], [3, 3], [4, 4], [5, 1], [6, 2]]);
    const meta = { capture: { hero: [4, 5], card: "spread" } } as unknown as RecipeMeta;
    expect(cardProblems(meta, [1, 2, 3, 4, 5, 6], book)).toEqual(["capture.hero [4, 5] is not a spread: page 5 does not face page 4"]);
    const ok = { capture: { hero: [2, 3], card: "spread" } } as unknown as RecipeMeta;
    expect(cardProblems(ok, [1, 2, 3, 4, 5, 6], book)).toEqual([]);
  });
});

describe("right-binding detection", () => {
  const registry = loadRegistry();
  const found = (paths: string[]) => detectFeatures(registry, { paths, markdown: "", apis: [] }).detected;

  it("finds tab stops in the config and :tab in the text (#622)", () => {
    const tabs = (paths: string[], markdown = "") => detectFeatures(registry, { paths, markdown, apis: [] }).detected.includes("tab-stops");
    expect(tabs(["paragraphStyles.tabStops"])).toBe(true);
    expect(tabs(["calloutStyles.body.tabInterval"])).toBe(true);
    expect(tabs(["bodyText.tabStops"])).toBe(true);
    expect(tabs([], "Soup :tab 8.50")).toBe(true);
    expect(tabs([], "Marks :tab{at=end align=end} 2")).toBe(true);
    expect(tabs([], "Chapter 3:table of results")).toBe(false);
  });

  it("finds body drop caps in the config and the {dropcap} attribute (#623)", () => {
    const caps = (paths: string[], markdown = "") => detectFeatures(registry, { paths, markdown, apis: [] }).detected.includes("body-drop-caps");
    expect(caps(["headings.levels.dropCap"])).toBe(true);
    expect(caps(["headingStyles.dropCap"])).toBe(true);
    expect(caps(["paragraphStyles.dropCap"])).toBe(true);
    expect(caps([], "# Lost {dropcap=false}")).toBe(true);
    expect(caps([], ':::paragraphs{style="entry" dropcap}')).toBe(true);
    expect(caps(["headings.levels.advancedDesign.slot.elements.dropCap"])).toBe(false);
  });

  it("finds code listings in codeStyle and in a ``` or ~~~ fence (#624)", () => {
    const code = (paths: string[], markdown = "") => detectFeatures(registry, { paths, markdown, apis: [] }).detected.includes("code-listings");
    expect(code(["codeStyle.tokens.keyword.color"])).toBe(true);
    expect(code([], "Text.\n\n```js\nlet a = 1;\n```")).toBe(true);
    expect(code([], "~~~~ console\n$ ls\n~~~~")).toBe(true);
    expect(code([], "Inline `code` only, and a ``double`` span.")).toBe(false);
  });

  it("comes from the binding, not from any writing mode", () => {
    expect(found(["page.binding"])).toContain("right-binding");
    // An explicit horizontal-tb, or a vertical heading in a left-bound book.
    expect(found(["layout.writingMode"])).not.toContain("right-binding");
    expect(found(["layout.writingMode"])).toContain("vertical-writing");
  });

  it("follows the document when vertical text binds it on the right", () => {
    const pen = { js: "" } as ComposedPen;
    const userConfig = { layout: { writingMode: "vertical-rl" } };
    expect(detect(meta(), facts({ userConfig, binding: "right" }), pen, registry).features).toContain("right-binding");
    expect(detect(meta(), facts({ userConfig }), pen, registry).features).not.toContain("right-binding");
  });

  it("follows the document when an Arabic locale sets the text right to left", () => {
    // locale 'ar' alone: the engine resolves direction 'rtl' and binds the
    // book on the right; the probe reads both off the document.
    const pen = { js: "" } as ComposedPen;
    const userConfig = { locale: "ar" };
    const arabic = detect(meta(), facts({ userConfig, binding: "right", direction: "rtl" }), pen, registry).features;
    expect(arabic).toEqual(expect.arrayContaining(["right-binding", "text-direction"]));
    expect(arabic).not.toContain("document-digits");
    // The probe records the digits the locale chose (latn for 'ar-MA' too).
    const digits = (numerals: "latn" | "arab") => detect(meta(),
      facts({ userConfig, binding: "right", direction: "rtl", numerals }), pen, registry).features;
    expect(digits("arab")).toContain("document-digits");
    expect(digits("latn")).toContain("document-digits");
    expect(detect(meta(), facts({ userConfig: { locale: "en" } }), pen, registry).features).not.toContain("text-direction");
  });
});

describe("C30: the EPUBs a pen writes (#404)", () => {
  const epub = (extra: Partial<EpubRecord> = {}): EpubRecord => ({
    layout: "fixed", bytes: 120_000, ms: 300, documents: 4, pages: 4, toc: 1, readLayout: "fixed", warnings: [], error: null, ...extra,
  });
  const epubMeta = meta({ outputs: ["canvas", "pdf", "epub"] });

  it("fails an epub recipe that wrote none, or a file that does not read back", () => {
    expect(of("C30", runChecks(input({ meta: epubMeta, epubs: [] }))).map((f) => f.severity)).toEqual(["fail"]);
    const broken = of("C30", runChecks(input({ meta: epubMeta, epubs: [
      epub({ error: "readEpub: not a zip" }),
      epub({ layout: "reflowable", documents: 0 }),
      epub({ layout: "reflowable", readLayout: "fixed" }),
    ] })));
    expect(broken.map((f) => f.detail)).toEqual([
      "the fixed EPUB: readEpub: not a zip",
      "the reflowable EPUB has no content documents",
      "the reflowable EPUB reads back as fixed",
    ]);
  });

  it("passes both layouts and reports the writer's warnings", () => {
    const fine = [epub(), epub({ layout: "reflowable", readLayout: "reflowable", documents: 2 })];
    expect(of("C30", runChecks(input({ meta: epubMeta, epubs: fine })))).toEqual([]);
    const warned = of("C30", runChecks(input({ meta: epubMeta, epubs: [epub({ warnings: ["missingFont: Literata"] })] })));
    expect(warned).toEqual([{ check: "C30", severity: "warn", detail: "the fixed EPUB: missingFont: Literata" }]);
    // A recipe without the output is not asked for one.
    expect(of("C30", runChecks(input()))).toEqual([]);
  });
});

describe("C31: config values the engine replaced (#468)", () => {
  const grid = { kind: "cjkGridClamped", path: "cjk.grid.linesPerPage", value: "15", used: "14" };

  it("fails a character grid the page cannot hold", () => {
    expect(of("C31", runChecks(input({ facts: facts({ configWarnings: [grid] }) })))).toEqual([{
      check: "C31",
      severity: "fail",
      detail: "cjkGridClamped: cjk.grid.linesPerPage asks for 15, the margins leave room for 14; the grid sets 14",
    }]);
  });

  it("fails every substitution that changes the page, and warns on a font stack", () => {
    const configWarnings = [
      { kind: "sideColumnPercentClamped", path: "layout.sideColumnPercent", value: "120", used: "66.67" },
      { kind: "columnCountClamped", path: "layout.columnCount", value: "12", used: "8" },
      { kind: "unknownNumberFormat", path: "orderedLists.levels[1].numberFormat", value: "kanji", used: "arabic" },
      { kind: "unknownNumerals", path: "numerals", value: "hindi", used: "arab" },
      { kind: "unknownConfigValue", path: "footnotes.placement", value: "spread", used: "column" },
      { kind: "unknownConfigValue", path: "comics.balloonStyles[0].shape", value: "ovl", used: "oval", suggestion: "oval" },
      { kind: "unknownConfigKey", path: "headingStyles[3].minHeight", value: "minHeight", used: "", suggestion: "lineHeight" },
      { kind: "lineNumbersUnsupported", path: "lineNumbers.enabled", value: "true", used: "false" },
      { kind: "fontFamilyStack", path: "bodyText.fontFamily", value: "Zen Old Mincho, serif", used: "Zen Old Mincho" },
    ];
    const c31 = of("C31", runChecks(input({ facts: facts({ configWarnings }) })));
    expect(c31.map((f) => [f.severity, f.detail])).toEqual([
      ["fail", 'sideColumnPercentClamped: layout.sideColumnPercent "120" leaves a column with no width; the columns are cut at 66.67 %'],
      ["fail", 'columnCountClamped: layout.columnCount "12" is not a column count from 3 to 8; the page is cut into 8 columns'],
      ["fail", 'unknownNumberFormat: orderedLists.levels[1].numberFormat "kanji" is no format the engine knows; it numbers in arabic'],
      ["fail", 'unknownNumerals: numerals "hindi" names no digit system; the digits are arab'],
      ["fail", 'unknownConfigValue: footnotes.placement "spread" is not one of its choices; the engine used column'],
      ["fail", 'unknownConfigValue: comics.balloonStyles[0].shape "ovl" is not one of its choices (oval?); the engine used oval'],
      ["fail", "unknownConfigKey: headingStyles[3].minHeight is no key of that setting (lineHeight?); the engine ignores it"],
      ["fail", "lineNumbersUnsupported: lineNumbers.enabled: vertical documents get no line numbers"],
      ["warn", 'fontFamilyStack: bodyText.fontFamily "Zen Old Mincho, serif" is a font stack; the text is set in Zen Old Mincho alone'],
    ]);
  });

  it("warns on a kind it does not know yet", () => {
    const future = { kind: "someNewClamp", path: "page.x", value: "3", used: "2" };
    expect(of("C31", runChecks(input({ facts: facts({ configWarnings: [future] }) })))).toEqual([
      { check: "C31", severity: "warn", detail: 'someNewClamp: page.x "3"; the engine used 2' },
    ]);
  });

  it("lets a recipe that shows one list it in expect.warnings", () => {
    const m = meta({ capture: { hero: 1, card: "page", expect: { warnings: ["cjkGridClamped"] } } } as Partial<RecipeMeta>);
    const found = runChecks(input({ meta: m, facts: facts({ configWarnings: [grid] }) }));
    expect(of("C31", found)).toEqual([]);
    // Listed and present: C5 does not call it absent.
    expect(of("C5", found)).toEqual([]);
  });

  it("passes a capture without config warnings, or from an engine that records none", () => {
    expect(of("C31", runChecks(input({ facts: facts({ configWarnings: [] }) })))).toEqual([]);
    expect(of("C31", runChecks(input()))).toEqual([]);
  });
});
