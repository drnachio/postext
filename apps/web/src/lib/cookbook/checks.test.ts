import { describe, expect, it } from "vitest";
import { sidesOf, spreadsOf } from "../../../scripts/cookbook/cards.ts";
import { detect, detectFeatures, runChecks } from "../../../scripts/cookbook/checks.ts";
import type { CheckInput, ProbeFacts } from "../../../scripts/cookbook/checks.ts";
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
  });
});

describe("C12: CJK files loaded after the layout", () => {
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

describe("right-binding detection", () => {
  const registry = loadRegistry();
  const found = (paths: string[]) => detectFeatures(registry, { paths, markdown: "", apis: [] }).detected;

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
});
