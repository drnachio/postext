import { describe, expect, it } from "vitest";
import { altText, cardProblems, sidesOf, spreadsOf } from "../../../scripts/cookbook/cards.ts";
import { configStats, detect, detectFeatures, readBackFindings, runChecks } from "../../../scripts/cookbook/checks.ts";
import type { BundleReadBack, CheckInput, EpubRecord, ProbeFacts, ProbePage, ScormRecord } from "../../../scripts/cookbook/checks.ts";
import { blankFont, mathErrorsOf, textOfFaces } from "../../../scripts/cookbook/lib/probe.js";
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
    { kind: "floatShrunk", page: 3, detail: "plate at 70 %: 18 px past the text block" },
    { kind: "textWrap", page: 2, detail: "bed: tooNarrow" },
    { kind: "afterText", page: 5, detail: "a side box" },
    { kind: "unplaced", page: null, detail: "plate-2" },
    { kind: "columnsTooNarrow", page: 3, detail: "4 columns of 61 px" },
    { kind: "columnsFlowUnknown", page: null, detail: 'flow="snak"' },
    { kind: "fontFallback", page: null, detail: "Bangers 700 (synthesized)" },
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
      ["fail", 'floatShrunk "plate at 70 %: 18 px past the text block" on page 3'],
      ["fail", 'textWrap "bed: tooNarrow" on page 2'],
      // postext 1.25: side boxes after the text or on no page (#639), column
      // groups (#634), faces measured in a fallback (#629).
      ["fail", 'afterText "a side box" on page 5'],
      ["fail", 'unplaced "plate-2"'],
      ["fail", 'columnsTooNarrow "4 columns of 61 px" on page 3'],
      ["fail", 'columnsFlowUnknown "flow="snak""'],
      ["fail", 'fontFallback "Bangers 700 (synthesized)"'],
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

  it("prints ratios to two decimals, whatever float noise the probe kept (#924)", () => {
    const loose = { count: 3, total: 100, share: 0.03, worst: 2.8000000000000003, threshold: 2.5500000000000003, lines: [{ page: 47, ratio: 2.8000000000000003, text: "Sie im Gewimmel zu finden," }] };
    expect(of("C24", runChecks(input({ facts: facts({ loose }) })))[0].detail).toBe(
      "3 of 100 justified lines (3.0 %) stretch past 2.55× (worst 2.8×); loosest: p. 47 2.8× “Sie im Gewimmel zu finden,”",
    );
    const raggedLines = { count: 1, lines: [{ page: 48, ratio: 3.3000000000000003, text: "„Beim Schwärmen stechen sie" }] };
    expect(of("C34", runChecks(input({ facts: facts({ raggedLines }) })))[0].detail).toMatch(/^1 justified line set ragged \(word spaces past 3×\): p\. 48 3\.3× “„Beim/);
  });
});

describe("C20: the weight of a book of paintings (#985)", () => {
  const MB = 1024 * 1024;
  const nine = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const withExpect = (expect: NonNullable<RecipeMeta["capture"]["expect"]>) => meta({ capture: { hero: 1, card: "page", expect } });
  const c20 = (overrides: Partial<CheckInput>) => of("C20", runChecks(input(overrides)));

  it("keeps the default budget for a recipe that states nothing", () => {
    expect(c20({ published: nine, bytes: 0.8 * MB })).toEqual([]);
    expect(c20({ published: nine, bytes: 1.3 * MB })).toEqual([{
      check: "C20", severity: "warn",
      detail: "the edition's images weigh 1.30 MB (warning at 0.9 MB for 9 pages; capture.expect.imageMb states the figure of a book of paintings)",
    }]);
    expect(c20({ published: nine, bytes: 1.5 * MB })[0]).toMatchObject({ severity: "fail" });
    // The warning grows with the pages published.
    expect(c20({ published: Array.from({ length: 12 }, (_, i) => i + 1), bytes: 1.1 * MB })).toEqual([]);
  });

  it("takes the figure a recipe states: silent up to it, a failure past it", () => {
    const m = withExpect({ imageMb: 1.35 });
    expect(c20({ meta: m, published: nine, bytes: 1.3 * MB })).toEqual([]);
    expect(c20({ meta: m, published: nine, bytes: 1.34 * MB })).toEqual([]);
    const over = c20({ meta: m, published: nine, bytes: 1.4 * MB });
    expect(over).toHaveLength(1);
    expect(over[0]).toMatchObject({ severity: "fail" });
    expect(over[0]!.detail).toMatch(/past the 1\.35 MB that capture\.expect\.imageMb states/);
    // The 1.4 MB failure of the default budget does not bind a stated figure.
    expect(c20({ meta: withExpect({ imageMb: 1.8 }), published: nine, bytes: 1.7 * MB })).toEqual([]);
  });

  it("says when the stated figure is not needed or is too generous", () => {
    const inside = c20({ meta: withExpect({ imageMb: 1.2 }), published: nine, bytes: 0.6 * MB });
    expect(inside).toHaveLength(1);
    expect(inside[0]).toMatchObject({ severity: "info" });
    expect(inside[0]!.detail).toMatch(/inside the default budget of 0\.9 MB: leave it out/);
    const loose = c20({ meta: withExpect({ imageMb: 1.9 }), published: nine, bytes: 1.3 * MB });
    expect(loose[0]).toMatchObject({ severity: "info" });
    expect(loose[0]!.detail).toBe("capture.expect.imageMb states 1.9 MB, and the edition weighs 1.30 MB: state 1.3 MB");
  });

  it("holds the card files to the aim, or to the figure a painted card states", () => {
    const painted = { card: 104_758, card480: 35_670, og: 59_354 };
    expect(c20({ cardBytes: painted }).map((f) => f.detail)).toEqual([
      "card.webp weighs 102 KB (aim for ≤ 90 KB; capture.expect.cardKb states the figure of a painted card)",
    ]);
    expect(c20({ meta: withExpect({ cardKb: { card: 110 } }), cardBytes: painted })).toEqual([]);
    const past = c20({ meta: withExpect({ cardKb: { card: 100 } }), cardBytes: painted });
    expect(past).toEqual([{ check: "C20", severity: "fail", detail: "card.webp weighs 102 KB, past the 100 KB that capture.expect.cardKb states" }]);
    const spare = c20({ meta: withExpect({ cardKb: { og: 120 } }), cardBytes: { card: 40_000, card480: 12_000, og: 40_000 } });
    expect(spare).toEqual([{ check: "C20", severity: "info", detail: "capture.expect.cardKb states 120 KB for og.jpg, which weighs 39 KB, inside its aim of 90 KB: leave it out" }]);
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

describe("the alt text of a page (#915)", () => {
  const at = (heading: string, extra: Partial<ProbePage> = {}): ProbePage => ({
    n: 2, book: 2, docIndex: 0, index: 1, label: "2", role: "body", w: 100, h: 100, trimOffset: 0, blank: false,
    blocks: 3, coverage: 0.9, h1: true, heading, captions: [], ...extra,
  });

  it("adds no stop after a heading that ends in a question or exclamation mark", () => {
    expect(altText(at("¿Dónde está el agua?"), "es")).toBe("Página 2: ¿Dónde está el agua?");
    expect(altText(at("Where is the water?"), "en")).toBe("Page 2: Where is the water?");
    expect(altText(at("¡Al agua!"), "es")).toBe("Página 2: ¡Al agua!");
    expect(altText(at("«Qui hi ha?»"), "ca")).toBe("Pàgina 2: «Qui hi ha?»");
    expect(altText(at("水在哪里？"), "zh")).toBe("第 2 页：水在哪里？");
    expect(altText(at("أين الماء؟"), "ar")).toBe("الصفحة 2: أين الماء؟");
    expect(altText(at("The water cycle"), "en")).toBe("Page 2: The water cycle.");
  });

  it("joins a caption after such a heading with a space", () => {
    expect(altText(at("Where is the water?", { captions: ["Figure 1.1 A river."] }), "en")).toBe("Page 2: Where is the water? Figure 1.1 A river.");
    expect(altText(at("The water cycle", { captions: ["Figure 1.1 A river"] }), "en")).toBe("Page 2: The water cycle. Figure 1.1 A river.");
  });

  it("names a page a composed box went on to after the page it continues", () => {
    expect(altText(at("¿Dónde está el agua?", { continued: true }), "es")).toBe("Página 2: ¿Dónde está el agua? (continuación).");
    expect(altText(at("Where is the water?", { continued: true }), "en")).toBe("Page 2: Where is the water? (continued).");
    expect(altText(at("水在哪里？", { continued: true }), "zh")).toBe("第 2 页：水在哪里？（续）。");
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

  it("finds a finish or a spot ink set on a palette colour (#1581)", () => {
    const gold = { hex: "#b8962e", model: "spot", spot: { name: "Gold", cmyk: { c: 0, m: 20, y: 60, k: 25 }, finish: { kind: "metallic" } } };
    const stats = configStats({ colorPalette: [{ id: "gold", name: "Gold", value: gold }] });
    expect(found(stats.paths)).toEqual(expect.arrayContaining(["special-inks", "spot-inks"]));
    // A colour is still one leaf, and keys stop at it.
    expect(stats.leaves).toBe(3);
    expect(stats.keys).not.toContain("colorPalette[].value.spot");
    expect(found(configStats({ colorPalette: [{ id: "red", value: { hex: "#ff0000", model: "hex" } }] }).paths)).not.toContain("special-inks");
  });

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

describe("C42: the SCORM packages a pen writes (#1346)", () => {
  const scorm = (extra: Partial<ScormRecord> = {}): ScormRecord => ({
    version: "2004", layout: "fixed", bytes: 300_000, ms: 400, files: 40, manifest: true, readVersion: "2004",
    scos: 1, launchPages: 1, items: 1, missing: [], warnings: [], error: null, ...extra,
  });
  const scormMeta = meta({ outputs: ["canvas", "html", "scorm"] });

  it("fails a scorm recipe that wrote none, or a package an LMS could not import", () => {
    expect(of("C42", runChecks(input({ meta: scormMeta, scorms: [] }))).map((f) => f.severity)).toEqual(["fail"]);
    const broken = of("C42", runChecks(input({ meta: scormMeta, scorms: [
      scorm({ error: "read back: not a zip (no end of central directory)" }),
      scorm({ manifest: false }),
      scorm({ version: "1.2", readVersion: "2004" }),
      scorm({ scos: 0, launchPages: 0 }),
      scorm({ scos: 3, launchPages: 2, missing: ["sco-3.html"] }),
    ] })));
    expect(broken.map((f) => f.detail)).toEqual([
      "the SCORM 2004 fixed package: read back: not a zip (no end of central directory)",
      "the SCORM 2004 fixed package has no imsmanifest.xml at its root",
      "the SCORM 1.2 fixed package declares SCORM 2004",
      "the SCORM 2004 fixed package has no SCO",
      "the SCORM 2004 fixed package has 3 SCOs and 2 launch pages in the zip",
      "the SCORM 2004 fixed package lacks files its manifest names: sco-3.html",
    ]);
  });

  it("passes a whole package and reports the writer's warnings", () => {
    const fine = [scorm(), scorm({ version: "1.2", readVersion: "1.2", layout: "reflowable" })];
    expect(of("C42", runChecks(input({ meta: scormMeta, scorms: fine })))).toEqual([]);
    const warned = of("C42", runChecks(input({ meta: scormMeta, scorms: [scorm({ warnings: ["missingFont: Archivo"] })] })));
    expect(warned).toEqual([{ check: "C42", severity: "warn", detail: "the SCORM 2004 fixed package: missingFont: Archivo" }]);
    expect(of("C42", runChecks(input()))).toEqual([]);
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
      { kind: "contentInConfig", path: "header", value: "Measure · Vol. 7 · 2026", used: "", count: 2, chars: 52 },
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
      ["warn", 'contentInConfig: header keeps 2 design texts of content (52 letters, "Measure · Vol. 7 · 2026"); move the text into the Markdown or list the phrase in checks.contentInConfig.allow'],
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

describe("C32: a formula the maths engine could not set (#683)", () => {
  // The line segments of a page carry each formula's render; a failed one
  // keeps MathJax's message.
  const seg = (tex: string, error?: string) => ({ kind: "math", text: "\uFFFC", width: 12, mathRender: { tex, widthPx: 12, heightPx: 15, paths: [{ d: "M0 0" }], ...(error ? { error } : {}) } });
  const INSTANCEOF = "Right-hand side of 'instanceof' is not an object";

  it("reads the failed formulas off the pages, wherever their line is, once per page", () => {
    const pages = [
      {
        n: 4,
        page: {
          columns: [{ blocks: [
            { type: "paragraph", lines: [{ segments: [{ kind: "text", text: "where " }, seg("\\beta", INSTANCEOF)] }, { segments: [seg("\\beta", INSTANCEOF), seg("x^2")] }] },
            { type: "callout", children: [{ lines: [{ segments: [seg("\\frac{a}{b", "Missing close brace")] }] }] },
          ] }],
          floats: [{ resourceBlock: { captionLines: [{ segments: [seg("\\pi_r", INSTANCEOF)] }], bitmap: new Uint8Array(4) } }],
        },
      },
      { n: 5, page: { columns: [{ blocks: [{ lines: [{ segments: [seg("\\beta", INSTANCEOF)] }] }] }] } },
      { n: 6, page: { columns: [{ blocks: [{ lines: [{ segments: [seg("e^{i\\pi}")] }] }] }] } },
    ];
    expect(mathErrorsOf(pages)).toEqual([
      { page: 4, tex: "\\beta", error: INSTANCEOF },
      { page: 4, tex: "\\frac{a}{b", error: "Missing close brace" },
      { page: 4, tex: "\\pi_r", error: INSTANCEOF },
      { page: 5, tex: "\\beta", error: INSTANCEOF },
    ]);
  });

  it("fails with the formula, its page and the message, one line per message", () => {
    const mathErrors = [
      { page: 2, tex: "\\pi^\\text{SFT}", error: INSTANCEOF },
      { page: 4, tex: "\\beta", error: INSTANCEOF },
      { page: 5, tex: "\\begin{aligned}\n\\nabla_\\theta \\mathcal{L}_\\text{DPO}(\\pi_\\theta; \\pi_\\text{ref}) &= 0\n\\end{aligned}", error: "Invalid LaTeX" },
    ];
    expect(of("C32", runChecks(input({ facts: facts({ mathErrors }) })))).toEqual([
      { check: "C32", severity: "fail", detail: `the formula $\\pi^\\text{SFT}$ on page 2 is set as a red box: ${INSTANCEOF} (and 1 more with the same message)` },
      { check: "C32", severity: "fail", detail: "the formula $\\begin{aligned} \\nabla_\\theta \\mathcal{L}_\\text{DPO}(\\pi_\\t…$ on page 5 is set as a red box: Invalid LaTeX" },
    ]);
  });

  it("passes a capture whose formulas are all set, or from a probe that reports none", () => {
    expect(of("C32", runChecks(input({ facts: facts({ mathErrors: [] }) })))).toEqual([]);
    expect(of("C32", runChecks(input()))).toEqual([]);
  });
});

describe("C33: the Sandbox bundle read back (#690)", () => {
  const same = { pages: 2, hash: "0a1b2c3d4e5f6071" };
  const back = (extra: Partial<BundleReadBack> = {}): BundleReadBack => ({
    chapters: [{ chapter: 1, pen: same, bundle: same, difference: null }], extraWarnings: [], ...extra,
  });

  it("passes a bundle that lays out as the pen's documents, and one that was not written", () => {
    expect(readBackFindings(back())).toEqual([]);
    expect(readBackFindings(null)).toEqual([]);
  });

  it("fails a chapter with another page count or another layout", () => {
    const findings = readBackFindings(back({
      chapters: [
        { chapter: 1, pen: same, bundle: same, difference: null },
        { chapter: 2, pen: { pages: 1, hash: "aa" }, bundle: { pages: 2, hash: "bb" }, difference: "page 1: the pen sets Lx, the bundle Ly" },
        { chapter: 3, pen: { pages: 1, hash: "cc" }, bundle: { pages: 1, hash: "dd" }, difference: "page 1: the pen sets Lx, the bundle Ly" },
      ],
    }));
    expect(findings).toEqual([
      { check: "C33", severity: "fail", detail: "chapter 2 of the bundle lays out to 2 pages, the pen's document 2 to 1 page (page 1: the pen sets Lx, the bundle Ly)" },
      { check: "C33", severity: "fail", detail: "chapter 3 of the bundle is not laid out as the pen's document 3 (layout dd, the pen's cc): page 1: the pen sets Lx, the bundle Ly" },
    ]);
    expect(readBackFindings(back({ chapters: [{ chapter: 1, pen: { pages: 1, hash: "cc" }, bundle: { pages: 1, hash: "dd" }, difference: null }] }))[0].detail)
      .toBe("the bundle is not laid out as the pen's document (layout dd, the pen's cc)");
  });

  it("names the cause the read-back found", () => {
    const differs = { chapter: 1, pen: { pages: 1, hash: "cc" }, bundle: { pages: 1, hash: "dd" }, difference: "page 1: the pen sets Lx, the bundle Ly" };
    const said = (cause: BundleReadBack["chapters"][number]["cause"]) => readBackFindings(back({ chapters: [{ ...differs, cause }] }))[0].detail.split(". Cause: ")[1];
    expect(said({ continuation: ["headings"] })).toBe("a bundle does not carry continuation.headings");
    expect(said({ configuration: ["headingStyles"] })).toBe("the configuration the bundle stores is not the pen's in headingStyles");
    expect(said({ configuration: ["headings", "headingStyles"], together: true }))
      .toBe("the configuration the bundle stores is not the pen's in headings, headingStyles (together)");
    expect(said({ configuration: ["headingStyles"], continuation: ["pageIndexOffset"] }))
      .toBe("the configuration the bundle stores is not the pen's in headingStyles, and a bundle does not carry continuation.pageIndexOffset");
    expect(said({ configuration: [] })).toBe("the configuration the bundle stores is not the pen's");
    expect(said(null)).toBeUndefined();
  });

  it("fails a chapter or a document with nothing on the other side", () => {
    const findings = readBackFindings(back({
      chapters: [
        { chapter: 1, pen: same, bundle: same, difference: null },
        { chapter: 2, pen: null, bundle: { pages: 3, hash: "bb" }, difference: null },
        { chapter: 3, pen: { pages: 1, hash: "cc" }, bundle: null, difference: null },
      ],
    }));
    expect(findings.map((f) => f.detail)).toEqual([
      "chapter 2 of the bundle (3 pages) has no document of the pen to compare with",
      "the pen's document 3 (1 page) is no chapter of the bundle",
    ]);
    expect(findings.every((f) => f.check === "C33" && f.severity === "fail")).toBe(true);
  });

  it("fails every warning the bundle raises and the pen's builds did not", () => {
    const findings = readBackFindings(back({ extraWarnings: ["comicBalloonOverflow panel 3", "comicBalloonOverflow panel 3", "fontFallback Bangers 700 (missing)"] }));
    expect(findings).toEqual([
      { check: "C33", severity: "fail", detail: "the bundle raises comicBalloonOverflow panel 3, which the pen's builds do not (×2)" },
      { check: "C33", severity: "fail", detail: "the bundle raises fontFallback Bangers 700 (missing), which the pen's builds do not" },
    ]);
  });

  it("fails a bundle that names no language, or divides its words otherwise than the pen (#660)", () => {
    const english = { locale: "en-us", enabled: true };
    expect(readBackFindings(back({ language: { pen: english, bundle: english, named: "en-us" } }))).toEqual([]);
    expect(readBackFindings(back({ language: null }))).toEqual([]);
    expect(readBackFindings(back({ language: { pen: english, bundle: english, named: null } }))).toEqual([
      {
        check: "C33", severity: "fail",
        detail: "the bundle's configuration names no language, and the pen hyphenates in en-us: "
          + "the Sandbox reads such a document in the interface language and breaks its lines otherwise",
      },
    ]);
    expect(readBackFindings(back({ language: { pen: english, bundle: { locale: "es", enabled: true }, named: "es" } }))).toEqual([
      { check: "C33", severity: "fail", detail: "the bundle hyphenates in es, the pen hyphenates in en-us" },
    ]);
    const off = { locale: "en-us", enabled: false };
    expect(readBackFindings(back({ language: { pen: off, bundle: english, named: "en-us" } }))[0].detail)
      .toBe("the bundle hyphenates in en-us, the pen sets its text without hyphenation (en-us)");
    expect(readBackFindings(back({ language: { pen: off, bundle: off, named: null } }))[0].detail)
      .toContain("names no language, and the pen sets its text without hyphenation (en-us)");
  });

  it("fails a bundle that does not open, and notes an engine that cannot read one back", () => {
    expect(readBackFindings({ error: "Invalid bundle manifest (preset.json)\n  at openBundle", chapters: [], extraWarnings: [] })).toEqual([
      { check: "C33", severity: "fail", detail: "the bundle does not open and lay out again: Invalid bundle manifest (preset.json)" },
    ]);
    expect(readBackFindings({ skipped: "the engine has no openBundle / buildBundle", chapters: [], extraWarnings: [] })).toEqual([
      { check: "C33", severity: "info", detail: "the bundle was not read back: the engine has no openBundle / buildBundle" },
    ]);
  });
});

// #732: a justified line whose word spaces would stretch past 3× is set
// ragged. Five reviewers of #660 found such a line "left short" in a
// justified paragraph, and no check said so: the line had lost the ratio
// C24 reads and was skipped by its loop.
describe("C34: justified lines set ragged (#732)", () => {
  const lines = [
    { page: 3, ratio: 5.4, text: "The Marrowick Harbour" },
    { page: 3, ratio: 4.1, text: "Marrow Mutual will pay" },
    { page: 4, ratio: 3.6, text: "The ferry's first crossing, at" },
  ];
  const withExpect = (raggedLines: number) => meta({ capture: { hero: 1, card: "page", expect: { raggedLines } } } as Partial<RecipeMeta>);

  it("passes an edition with none, and one on an engine without the warning", () => {
    expect(of("C34", runChecks(input({ facts: facts({ raggedLines: { count: 0, lines: [] } }) })))).toEqual([]);
    expect(of("C34", runChecks(input({ facts: facts() })))).toEqual([]);
  });

  it("fails an edition with a line the recipe does not accept, and names the lines", () => {
    const found = of("C34", runChecks(input({ facts: facts({ raggedLines: { count: 1, lines: lines.slice(1, 2) } }) })));
    expect(found).toEqual([{
      check: "C34", severity: "fail",
      detail: "1 justified line set ragged (word spaces past 3×): p. 3 4.1× “Marrow Mutual will pay”. Reword the copy, give the line a break it can take, or accept the count with capture.expect.raggedLines",
    }]);
    const three = of("C34", runChecks(input({ facts: facts({ raggedLines: { count: 3, lines } }) })))[0]!;
    expect(three.detail).toContain("3 justified lines set ragged");
    expect(three.detail).toContain("p. 3 5.4× “The Marrowick Harbour”, p. 3 4.1× “Marrow Mutual will pay”, p. 4 3.6× “The ferry's first crossing, at”");
  });

  it("passes with the count accepted, and fails with one line over it", () => {
    expect(of("C34", runChecks(input({ meta: withExpect(1), facts: facts({ raggedLines: { count: 1, lines: lines.slice(0, 1) } }) })))).toEqual([]);
    const over = of("C34", runChecks(input({ meta: withExpect(1), facts: facts({ raggedLines: { count: 2, lines: lines.slice(0, 2) } }) })));
    expect(over).toHaveLength(1);
    expect(over[0]).toMatchObject({ severity: "fail" });
    expect(over[0]!.detail).toContain("2 justified lines set ragged (word spaces past 3×), and the recipe accepts 1:");
  });

  it("notes a recipe that accepts more lines than the edition has", () => {
    expect(of("C34", runChecks(input({ meta: withExpect(2), facts: facts({ raggedLines: { count: 1, lines: lines.slice(0, 1) } }) })))).toEqual([
      { check: "C34", severity: "info", detail: "capture.expect.raggedLines accepts 2, and the edition has 1" },
    ]);
  });

  it("prints a line of a note, which has no page of its own in the count", () => {
    const found = of("C34", runChecks(input({ facts: facts({ raggedLines: { count: 1, lines: [{ page: null, ratio: 3.4, text: "7 See the long address" }] } }) })))[0]!;
    expect(found.detail).toContain(": 3.4× “7 See the long address”.");
  });
});

// #733: a paragraph set one line shorter to take up a runt left no trace
// in the capture. In history-essay-chicago-notes note 7 was set at −5‰ and
// note 14 at −10‰, found only because the tracking was not painted (#662).
describe("C35: paragraphs set a line short with tracking (#733)", () => {
  it("prints nothing when no paragraph was fixed, or when word spaces alone did it", () => {
    expect(of("C35", runChecks(input({ facts: facts() })))).toEqual([]);
    expect(of("C35", runChecks(input({ facts: facts({ runtFixes: { count: 3, tracked: 0, worst: 0, blocks: [] } }) })))).toEqual([]);
  });

  it("notes one at the cap with its page, the amount and its first words", () => {
    const runtFixes = { count: 2, tracked: 1, worst: 10, atCap: true, blocks: [{ page: 4, tracking: 10, text: "14 Ibid., 212. The second edition corrects the fig" }] };
    expect(of("C35", runChecks(input({ facts: facts({ runtFixes }) })))).toEqual([{
      check: "C35", severity: "info",
      detail: "1 paragraph set a line short with tracking (worst −10‰, the cap): p. 4 −10‰ “14 Ibid., 212. The second edition corrects the fig…”",
    }]);
  });

  it("lists several, most tracked first, a split paragraph counted once by the probe", () => {
    const runtFixes = { count: 2, tracked: 2, worst: 10, atCap: true, blocks: [{ page: 4, tracking: 10, text: "first words of the paragraph" }, { page: 3, tracking: 5, text: "another paragraph" }] };
    expect(of("C35", runChecks(input({ facts: facts({ runtFixes }) })))[0]!.detail).toBe(
      "2 paragraphs set a line short with tracking (worst −10‰, the cap): p. 4 −10‰ “first words of the paragraph”, p. 3 −5‰ “another paragraph”",
    );
    const below = { count: 1, tracked: 1, worst: 5, blocks: [{ page: 2, tracking: 5, text: "a paragraph" }] };
    expect(of("C35", runChecks(input({ facts: facts({ runtFixes: below }) })))[0]!.detail).toBe("1 paragraph set a line short with tracking (worst −5‰): p. 2 −5‰ “a paragraph”");
  });
});

// #746: a character no loaded file of its family holds is set in a font of
// the reader's system, with other widths on every machine. Nothing said so:
// `fontFallback` is raised for a face that did not load, not for a
// character its files lack, and C25 goes by the files' unicode-range, which
// says what a file may be asked for and not what it holds.
describe("C36: characters set in a font of the system (#746)", () => {
  const face = (chars: string, extra: Partial<{ family: string; weight: number; style: "normal" | "italic"; where: string }> = {}) => ({
    family: "Source Serif 4", weight: 400, style: "normal" as const,
    chars: [...chars].map((ch) => ({ ch, code: `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`, where: extra.where ?? "p2 paragraph" })),
    ...extra,
  });

  it("passes pages whose characters are all in the files loaded", () => {
    expect(of("C36", runChecks(input({ facts: facts() })))).toEqual([]);
    expect(of("C36", runChecks(input({ facts: facts({ systemFont: [] }) })))).toEqual([]);
  });

  it("fails a face with the characters, their code points and where the first stands", () => {
    expect(of("C36", runChecks(input({ facts: facts({ systemFont: [face("→①")] }) })))).toEqual([{
      check: "C36", severity: "fail",
      detail: "Source Serif 4 400 sets → U+2192, ① U+2460 (p2 paragraph) in no file the page loaded: the browser takes a font of the system for them, " +
        "another on every machine. Load the file of the family that holds them, set them in a family that does, or write another character",
    }]);
  });

  it("fails each face on its own, an italic named as one", () => {
    const found = of("C36", runChecks(input({ facts: facts({ systemFont: [face("≥"), face("µ", { family: "Fira Sans", weight: 600, style: "italic", where: "p1 table" })] }) })));
    expect(found.map((f) => f.detail.split(" in no file")[0])).toEqual(["Source Serif 4 400 sets ≥ U+2265 (p2 paragraph)", "Fira Sans 600 italic sets µ U+00B5 (p1 table)"]);
    expect(found.every((f) => f.severity === "fail")).toBe(true);
  });

  it("lists twelve characters and counts the rest", () => {
    const detail = of("C36", runChecks(input({ facts: facts({ systemFont: [face("①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮")] }) })))[0]!.detail;
    expect(detail).toContain("⑫ U+246B and 3 more (p2 paragraph)");
    expect(detail).not.toContain("⑬");
  });

  it("is not excused by expect.warnings", () => {
    const m = meta({ capture: { hero: 1, card: "page", expect: { warnings: ["fontFallback"] } } });
    expect(of("C36", runChecks(input({ meta: m, facts: facts({ systemFont: [face("→")] }) })))).toHaveLength(1);
  });

  it("accepts the marks capture.expect.systemFont lists, and says so", () => {
    const m = meta({ capture: { hero: 1, card: "page", expect: { systemFont: "☐" } } });
    const bullets = face("☐", { family: "Figtree", weight: 700, where: "p1 listItem bullet" });
    expect(of("C36", runChecks(input({ meta: m, facts: facts({ systemFont: [bullets] }) })))).toEqual([{
      check: "C36", severity: "info",
      detail: "☐ set in a font of the system, as capture.expect.systemFont accepts: the shape is the reader's machine's",
    }]);
  });

  it("still fails the other characters of a face that sets an accepted one", () => {
    const m = meta({ capture: { hero: 1, card: "page", expect: { systemFont: "☐" } } });
    const found = of("C36", runChecks(input({ meta: m, facts: facts({ systemFont: [face("☐→")] }) })));
    expect(found.map((f) => f.severity)).toEqual(["fail", "info"]);
    expect(found[0]!.detail.startsWith("Source Serif 4 400 sets → U+2192 (p2 paragraph) in no file")).toBe(true);
  });

  it("notes a listed mark that a face holds now", () => {
    const m = meta({ capture: { hero: 1, card: "page", expect: { systemFont: "☐" } } });
    expect(of("C36", runChecks(input({ meta: m, facts: facts({ systemFont: [] }) })))).toEqual([{
      check: "C36", severity: "info", detail: "capture.expect.systemFont lists ☐, which a face of the pages holds now",
    }]);
    // With no measure of the pages (nothing built), nothing is said.
    expect(of("C36", runChecks(input({ meta: m, facts: facts() })))).toEqual([]);
  });
});

describe("the blank font of C36 (lib/probe.js)", () => {
  const u16 = (b: Uint8Array, at: number) => (b[at]! << 8) | b[at + 1]!;
  const u32 = (b: Uint8Array, at: number) => ((b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) >>> 0;
  const tables = (b: Uint8Array) => Object.fromEntries(Array.from({ length: u16(b, 4) }, (_, i) => {
    const at = 12 + 16 * i;
    return [String.fromCharCode(...b.slice(at, at + 4)), { sum: u32(b, at + 4), offset: u32(b, at + 8), length: u32(b, at + 12) }];
  }));
  const sum = (b: Uint8Array) => {
    let total = 0;
    for (let i = 0; i < b.length; i += 4) total = (total + u32(Uint8Array.from([b[i] ?? 0, b[i + 1] ?? 0, b[i + 2] ?? 0, b[i + 3] ?? 0]), 0)) >>> 0;
    return total;
  };

  it("is a TrueType font with the tables a browser asks for, each at its place", () => {
    const font = blankFont(3000) as Uint8Array;
    expect(u32(font, 0)).toBe(0x00010000);
    const dir = tables(font);
    expect(Object.keys(dir)).toEqual(["OS/2", "cmap", "glyf", "head", "hhea", "hmtx", "loca", "maxp", "name", "post"]);
    expect(dir.head!.length).toBe(54);
    expect(dir.hhea!.length).toBe(36);
    expect(dir.maxp!.length).toBe(32);
    expect(dir["OS/2"]!.length).toBe(96);
    expect(dir.post!.length).toBe(32);
    for (const t of Object.values(dir)) {
      expect(t.offset % 4).toBe(0);
      expect(t.offset + t.length).toBeLessThanOrEqual(font.length);
    }
    // The whole file sums to the magic number once head's adjustment is in.
    expect(sum(font)).toBe(0xb1b0afba);
  });

  it("maps every code point to one glyph of the advance asked for", () => {
    for (const advance of [3000, 5000]) {
      const font = blankFont(advance) as Uint8Array;
      const dir = tables(font);
      const cmap = dir.cmap!.offset;
      // One subtable, Windows full repertoire, format 13: a single group.
      expect([u16(font, cmap + 4), u16(font, cmap + 6), u16(font, cmap + 12)]).toEqual([3, 10, 13]);
      expect([u32(font, cmap + 24), u32(font, cmap + 28), u32(font, cmap + 32), u32(font, cmap + 36)]).toEqual([1, 0, 0x10ffff, 1]);
      const hmtx = dir.hmtx!.offset;
      expect([u16(font, hmtx), u16(font, hmtx + 4)]).toEqual([advance, advance]);
      expect(u16(font, dir.head!.offset + 18)).toBe(1000);
    }
  });
});

describe("the characters each face sets (lib/probe.js textOfFaces)", () => {
  const line = (text: string, segments?: object[]) => ({ text, ...(segments ? { segments } : {}) });
  const page = (blocks: object[]) => ({ page: { index: 0, columns: [{ blocks }] }, n: 1 });
  const para = (lines: object[], extra: object = {}) => ({ type: "paragraph", fontString: '400 12px "Lora"', boldFontString: '700 12px "Lora"', lines, ...extra });

  it("lists the characters of a face once, with where the first stands", () => {
    const faces = textOfFaces([page([para([line("a → b"), line("b ①")])])]) as { family: string; weight: number; chars: [string, string][] }[];
    expect(faces).toHaveLength(1);
    expect(faces[0]!.family).toBe("Lora");
    expect(faces[0]!.chars).toEqual([["a", "p1 paragraph"], ["→", "p1 paragraph"], ["b", "p1 paragraph"], ["①", "p1 paragraph"]]);
  });

  it("gives a bold segment to the bold face and a segment's own font to its family", () => {
    const segments = [{ kind: "text", text: "x " }, { kind: "text", text: "≥", bold: true }, { kind: "text", text: " f()", fontString: '400 11px "Fira Mono"' }];
    const faces = textOfFaces([page([para([line("x ≥ f()", segments)])])]) as { family: string; weight: number; chars: [string, string][] }[];
    expect(faces.map((f) => `${f.family} ${f.weight}: ${f.chars.map(([ch]) => ch).join("")}`)).toEqual(["Fira Mono 400: f()", "Lora 400: x", "Lora 700: ≥"]);
  });

  it("keeps a combining mark with its letter, and the spaces that are characters", () => {
    const faces = textOfFaces([page([para([line("e\u0301 1\u202f000\u3000x")])])]) as { chars: [string, string][] }[];
    expect(faces[0]!.chars.map(([set]) => set)).toEqual(["e", "e\u0301", "1", "\u202f", "0", "\u3000", "x"]);
  });

  it("leaves out the engine's placeholders and what prints nothing", () => {
    const faces = textOfFaces([page([para([line("a\uFFFC\u200Bb\u00AD")])])], new Set(["\uFFFC"])) as { chars: [string, string][] }[];
    expect(faces[0]!.chars.map(([set]) => set)).toEqual(["a", "b"]);
  });

  it("reaches text that carries a font of its own: a drop cap, a balloon's lettering", () => {
    const block = para([line("nce")], { dropCap: { text: "O", fontString: '700 40px "Playfair Display"' } });
    const comic = { balloons: [{ text: [{ kind: "text", fontString: '400 10px "Comic Neue"', lines: [{ text: "POW!" }] }] }] };
    const faces = textOfFaces([{ page: { index: 0, columns: [{ blocks: [block] }], comic }, n: 3 }]) as { family: string; chars: [string, string][] }[];
    expect(faces.map((f) => `${f.family}: ${f.chars.map(([ch]) => ch).join("")}`)).toEqual(["Comic Neue: POW!", "Lora: nce", "Playfair Display: O"]);
    expect(faces[0]!.chars[0]![1]).toBe("p3");
  });
});
