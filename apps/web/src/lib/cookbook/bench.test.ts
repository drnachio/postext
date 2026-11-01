import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as engine from "postext";
import type { PostextConfig } from "postext";
import { PAGE8_CONFIG, PAGE8_RESOURCES } from "../../../../../packages/postext/src/__tests__/composed/fixtures/page8";
import { stressFactor, UsageError } from "../../../scripts/cookbook/args.ts";
import {
  changesAgainstBase, compareFindings, composedFindings, configSizeFindings, roundTripFindings, runChecks, stressFindings, usefulProposal,
} from "../../../scripts/cookbook/checks.ts";
import type { CheckInput, ComposedFacts, ProbeFacts } from "../../../scripts/cookbook/checks.ts";
import { COMPOSED_FENCE as PROBE_FENCE, composedFacts, composedRoundTrip } from "../../../scripts/cookbook/lib/probe.js";
import { COMPOSED_FENCE, declaresComposedPages, stretchedEdition, stretchMarkdown } from "./bench.ts";
import { composePen, variantFor } from "./compose.ts";
import { malformedResourceEmbeds, markdownConstructs } from "./detect.ts";
import { readKit } from "./sources.ts";
import type { RecipeMeta, RecipeSources } from "./types.ts";

// The composed-page bench (#869): its checks judged in Node, and its
// fixture recipe laid out by the workspace engine with a measurement stub
// (the capture lays it out in Chrome: `pnpm cookbook bench`).

// Glyphs half an em wide, from the size in `ctx.font`: a page close
// enough to a real one that boxes grow and overflow as text gets longer.
class StubCtx {
  font = "";
  measureText(s: string): { width: number } {
    const px = Number(/([\d.]+)px/.exec(this.font)?.[1] ?? 40);
    return { width: s.length * px * 0.5 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const FIXTURE = path.join(__dirname, "fixtures", "recipes", "composed-bench");
const LOCALES = ["es", "en", "ca"] as const;
const content = (lang: string) => fs.readFileSync(path.join(FIXTURE, `content.${lang}.md`), "utf-8");
const fixtureMeta = () => JSON.parse(fs.readFileSync(path.join(FIXTURE, "recipe.json"), "utf-8")) as RecipeMeta;

type Engine = typeof engine;

function layOut(markdown: string, lang: string, config: PostextConfig = PAGE8_CONFIG, eng: Engine = engine) {
  const doc = eng.buildDocument({ markdown, resources: PAGE8_RESOURCES }, { ...config, locale: lang } as PostextConfig, eng.createMeasurementCache());
  return { doc, composed: composedFacts(eng, [doc], { markdowns: [markdown] }) as ComposedFacts };
}

function facts(composed: ComposedFacts, extra: Partial<ProbeFacts> = {}): ProbeFacts {
  return {
    builds: [{ kind: "document", shim: "postext", ms: 50, at: 400, pages: 1 }], selected: 0, importedAt: 300,
    registered: [], state: "ready", status: "1 page", pdfButton: false,
    pages: [{ n: 1, book: 1, docIndex: 0, index: 0, label: "1", role: "body", w: 1358, h: 1701, trimOffset: 0, blank: false, blocks: 20, coverage: 0.9, h1: true, heading: "", captions: [] }],
    composed, userConfig: { page: {} }, ...extra,
  };
}

const none: ComposedFacts = { declared: false, pages: [], warnings: [], tocSplits: [], roundTrip: null };
const declared: ComposedFacts = { ...none, declared: true };
const meta = (expectWarnings: string[] = []) => ({ capture: { hero: 1, card: "page" as const, expect: { warnings: expectWarnings } } });

/** Every check of a capture on `f`, as an edition that ran cleanly. */
function allChecks(f: ProbeFacts) {
  const input: CheckInput = {
    meta: { ...fixtureMeta(), capture: { hero: 1, card: "page" } }, facts: f, done: "ok", err: null, loaderErrors: [], console: [],
    pageErrors: [], net: [], failedRequests: [], settleTimedOut: false, kit: { state: "ready", status: "" }, tainted: [], passive: false,
    workerEngines: [], engine: "1.35.0", timeoutMs: 60_000, totalMs: 2000, pdf: null, epubs: [], scorms: [], published: [1], publishError: null,
    cardErrors: [], renderError: null, magnification: null, bytes: 100_000, cardBytes: null, assets: [],
    detected: {
      apis: [], configKeys: [], configSections: [], configLeaves: 0, designElements: 0, directives: [], inline: [],
      resources: { svg: 0, bitmap: 0, table: 0 }, fonts: [], features: [], suggestedLevel: 3, paths: [],
    },
    registry: null, previous: null, chrome: "155", vdtHash: "x", sourceHash: "y",
  };
  return runChecks(input);
}

// ─── The longer text ────────────────────────────────────────────────────────

describe("stretchMarkdown: the stress test's longer text", () => {
  const sample = [
    "::::page{template=\"tema-cajas\" tema=\"Retos del planeta\"}",
    "# La hucha de la clase {style=\"tema\"}",
    "",
    "Cada familia necesita :chip[alimentos]{style=\"clave\"}, ropa y una casa en [la ciudad](https://example.org/a).",
    "Pagan con **efectivo**, con $x^2$ y con `código` [^nota] [@cita].",
    "",
    "- **Fijo:** se repite cada mes, como el alquiler.",
    "",
    ":::frame{slot=\"dinero\" label=\"Para qué sirve el dinero\"}",
    "El dinero nos deja cambiar nuestro trabajo por cosas.",
    ":::",
    "",
    "::resource{id=\"foto-dinero\" slot=\"dinero-fotos\"}",
    "| tabla | intacta |",
    "```js",
    "const keep = 'the code stays';",
    "```",
    "::::",
  ].join("\n");

  it("makes each paragraph about 30 % longer with its own words, next to themselves", () => {
    const r = stretchMarkdown(sample, 1.3);
    expect(r.after / r.before).toBeGreaterThanOrEqual(1.3);
    expect(r.after / r.before).toBeLessThan(1.45);
    const lines = r.markdown.split("\n");
    expect(lines[9]).toMatch(/^El( El)? dinero/);
    // Every word of the stretched paragraph is a word of the paragraph.
    const own = new Set(sample.split("\n")[9]!.match(/\p{L}+/gu));
    for (const word of lines[9]!.match(/\p{L}+/gu)!) expect(own.has(word)).toBe(true);
  });

  it("leaves fences, attributes, directives, links, references, code, maths and tables as written", () => {
    const out = stretchMarkdown(sample, 1.5).markdown;
    for (const kept of [
      "::::page{template=\"tema-cajas\" tema=\"Retos del planeta\"}", "{style=\"tema\"}", ":chip[alimentos]{style=\"clave\"}",
      "[la ciudad](https://example.org/a)", "$x^2$", "`código`", "[^nota]", "[@cita]",
      ":::frame{slot=\"dinero\" label=\"Para qué sirve el dinero\"}", "::resource{id=\"foto-dinero\" slot=\"dinero-fotos\"}",
      "| tabla | intacta |", "const keep = 'the code stays';",
    ]) expect(out).toContain(kept);
    // Markup lines keep their place: the stretched text has as many lines.
    expect(out.split("\n")).toHaveLength(sample.split("\n").length);
    expect(out.split("\n")[0]).toBe(sample.split("\n")[0]);
    expect(out.split("\n").slice(-6)).toEqual(sample.split("\n").slice(-6));
    // A list item keeps its marker, an emphasis its asterisks.
    expect(out.split("\n")[6]).toMatch(/^- \*\*Fijo( Fijo)*:\*\* /);
  });

  it("is deterministic, and a factor of 1 or less changes nothing", () => {
    expect(stretchMarkdown(sample, 1.3).markdown).toBe(stretchMarkdown(sample, 1.3).markdown);
    expect(stretchMarkdown(sample, 1).markdown).toBe(sample);
  });

  it("repeats Chinese and Japanese words without a space, and skips front matter and a comic's raw body", () => {
    const zh = stretchMarkdown("这是一个例子，我们用它来测试。", 1.3).markdown;
    expect(zh).toMatch(/^(这是一个例子){2,}，/);
    const comic = "---\ntitle: Front matter stays\n---\n\n:::page\n[1] Panel text stays\n:::\n\nA paragraph that grows here.";
    const out = stretchMarkdown(comic, 1.3).markdown;
    expect(out).toContain("title: Front matter stays\n");
    expect(out).toContain(":::page\n[1] Panel text stays\n:::");
    expect(out.split("\n").at(-1)!.length).toBeGreaterThan("A paragraph that grows here.".length);
  });

  it("counts an edition's own files, else the fallback edition's, and reads the factor of --stress", () => {
    const files = { es: "Una frase de prueba larga.", en: "A long test sentence here.", "box.es": "Texto de la caja." };
    const es = stretchedEdition(files, "es", "es", 1.3);
    expect(es.before).toBe(files.es.length + files["box.es"].length);
    expect(stretchedEdition(files, "en", "es", 1.3).before).toBe(files.en.length + files["box.es"].length);
    expect(stressFactor("1.3", "capture")).toBe(1.3);
    expect(stressFactor(undefined, "capture")).toBeUndefined();
    for (const bad of ["1", "0.9", "4", "x", "1.3x"]) expect(() => stressFactor(bad, "capture")).toThrow(UsageError);
  });
});

// ─── What declares composed pages ───────────────────────────────────────────

describe("composed pages in the source", () => {
  it("knows a four-colon page fence with a template, as lib/probe.js does", () => {
    expect(COMPOSED_FENCE.source).toBe(PROBE_FENCE.source);
    expect(declaresComposedPages({ es: content("es") })).toBe(true);
    expect(declaresComposedPages({ en: ":::page\n[1] A comic page\n:::" })).toBe(false);
  });

  it("lints a slot embed and the page fences as Postext (detect.ts)", () => {
    expect(malformedResourceEmbeds(content("en"))).toEqual([]);
    expect(malformedResourceEmbeds("::resource{id=\"a\" slot=\"b\" extra=\"c\"}")).toHaveLength(1);
    const found = markdownConstructs(content("ca"));
    expect(found.unknown).toEqual([]);
    expect(found.directives).toEqual(expect.arrayContaining(["::::page", ":::frame", "::resource"]));
  });
});

// ─── The fixture recipe, in every sample language ───────────────────────────

describe("the bench's fixture recipe (es, en, ca)", () => {
  it("has three sample editions, each composed from its own content file", () => {
    const meta = fixtureMeta();
    expect(meta.sample.locales).toEqual([...LOCALES]);
    const sources: RecipeSources = {
      slug: "composed-bench", script: fs.readFileSync(path.join(FIXTURE, "script.js"), "utf-8"), html: "", css: "",
      pen: { css_external: [], js_external: [] } as unknown as RecipeSources["pen"],
      content: Object.fromEntries(LOCALES.map((l) => [l, content(l)])), assets: [],
    };
    for (const lang of LOCALES) {
      const pen = composePen(sources, meta, lang, { kit: readKit() });
      expect(pen.js).toContain(`const LANG = '${lang}';`);
      expect(pen.js).toContain(content(lang).split("\n")[1]);
    }
    // The site shows each language its own edition, Spanish for Catalan only when there is none.
    expect(variantFor(meta, "ca")).toBe("ca");
    expect(variantFor(meta, "fr")).toBe("en");
    expect(variantFor(meta, "zh")).toBe("es");
  });

  it("sets the page-8 stand-in template of the engine's tests, frame for frame", () => {
    const script = fs.readFileSync(path.join(FIXTURE, "script.js"), "utf-8");
    const names = [...script.matchAll(/\{ name: '([a-z-]+)', (?!kind)/g)].map((m) => m[1]);
    const template = PAGE8_CONFIG.pageTemplates![0]!;
    expect(names).toEqual(template.frames!.map((f) => f.name));
  });

  for (const lang of LOCALES) {
    it(`${lang}: passes C37 and C40 as written (no frameOverflow, no composed-page warning)`, () => {
      const { composed } = layOut(content(lang), lang);
      expect(composed.declared).toBe(true);
      expect(composed.pages.map((p) => p.template)).toEqual(["tema-cajas"]);
      expect(composed.warnings).toEqual([]);
      const f = facts(composed);
      expect(composedFindings(meta(), f)).toEqual([]);
      const trip = roundTripFindings(f);
      if (typeof (engine as Record<string, unknown>).sourceAt === "function") expect(trip.filter((x) => x.severity === "fail")).toEqual([]);
      else expect(trip).toEqual([{ check: "C40", severity: "info", detail: expect.stringContaining("no source map") }]);
    });

    it(`${lang}: the stress test reports each page, and warns of an overflow only with its proposals`, () => {
      const stretched = stretchMarkdown(content(lang), 1.3);
      const base = layOut(content(lang), lang);
      const run = layOut(stretched.markdown, lang);
      const findings = stressFindings({
        meta: meta(), factor: 1.3, stretch: stretched, done: "ok", facts: facts(run.composed), base: facts(base.composed),
      });
      expect(findings.filter((f) => f.severity === "fail")).toEqual([]);
      expect(findings.find((f) => f.detail.startsWith("p. 1 (tema-cajas)"))?.detail).toMatch(/rearranged|goes on|does not fit/);
      for (const w of findings.filter((f) => f.severity === "warn")) expect(w.detail).toMatch(/frameOverflow: .*; to fit: /);
      expect(findings[0]!.detail).toMatch(/^the text made 3\d\.\d % longer/);
    });
  }

  it("fails C37 when the copy does not fit as written, and names what would fit it", () => {
    const longer = stretchMarkdown(content("es"), 1.6).markdown;
    const { composed } = layOut(longer, "es");
    const c37 = composedFindings(meta(), facts(composed));
    expect(c37.length).toBeGreaterThan(0);
    expect(c37.every((f) => f.check === "C37" && f.severity === "fail")).toBe(true);
    // The last box keeps its minimum; the first, which grew, gives way
    // (#911).
    expect(c37[0]!.detail).toMatch(/^frameOverflow: frame "dinero" of template "tema-cajas" on page 1 is [\d.]+ mm short of its content after .*; to fit: /);
  });
});

// ─── The checks on their own ────────────────────────────────────────────────

describe("C37: warnings no recipe with composed pages may raise", () => {
  const overflow = { kind: "frameOverflow", page: 1, template: "t", frame: "box", overflowMm: 4.2, steps: ["free"], proposals: [{ kind: "raiseMax", path: "/pageTemplates/0/frames/2/maxHeight", value: { value: 60, unit: "mm" }, text: "raise maxHeight to 60 mm" }] };

  it("fails tocGroupSplit, contentInConfig and template warnings on a composed recipe, and keeps them off C31", () => {
    const f = facts({ ...declared, tocSplits: [{ page: 2, title: "Part one", columns: 2 }] }, {
      configWarnings: [
        { kind: "contentInConfig", path: "headingStyles[0].elements[1].content", value: "The whole first paragraph", used: "", count: 1, chars: 120 },
        { kind: "frameStyleUnknown", path: "/pageTemplates/0/frames/1/style", value: "nope", used: "" },
      ],
    });
    const out = composedFindings(meta(), f);
    expect(out.map((x) => [x.severity, x.detail.split(":")[0]])).toEqual([
      ["fail", "tocGroupSplit"], ["fail", "contentInConfig"], ["fail", "frameStyleUnknown"],
    ]);
    const all = allChecks(f);
    expect(all.filter((x) => x.check === "C31")).toEqual([]);
    expect(all.filter((x) => x.check === "C37")).toHaveLength(3);
  });

  it("cannot be excused by expect.warnings on a composed recipe; elsewhere a tocGroupSplit warns", () => {
    const out = composedFindings(meta(["frameOverflow"]), facts({ ...declared, warnings: [overflow] }));
    expect(out.map((x) => x.severity)).toEqual(["fail", "fail"]);
    expect(out[0]!.detail).toBe("frameOverflow: frame \"box\" of template \"t\" on page 1 is 4.2 mm short of its content after free; to fit: raise maxHeight to 60 mm");
    expect(out[1]!.detail).toMatch(/expect.warnings lists frameOverflow: a recipe with composed pages cannot accept it/);
    const plain = composedFindings(meta(), facts({ ...none, tocSplits: [{ page: 3, title: "Index", columns: 2 }] }));
    expect(plain).toEqual([{ check: "C37", severity: "warn", detail: "tocGroupSplit: the contents block \"Index\" is cut into 2 columns on page 3" }]);
    expect(composedFindings(meta(["tocGroupSplit"]), facts({ ...none, tocSplits: [{ page: 3, title: "Index", columns: 2 }] }))).toEqual([]);
  });

  it("leaves a recipe without composed pages as C31 judged it", () => {
    const f = facts(none, { configWarnings: [{ kind: "contentInConfig", path: "header.elements[0].content", value: "x", used: "" }] });
    expect(composedFindings(meta(), f)).toEqual([]);
    const all = allChecks(f);
    expect(all.filter((x) => x.check === "C31").map((x) => x.severity)).toEqual(["warn"]);
  });
});

describe("C38: the stress test", () => {
  const base = { meta: meta(), factor: 1.3, stretch: { before: 100, after: 131, unchanged: 0 }, done: "ok" as const, base: null };
  const page = { n: 1, template: "t", fenceIndex: 0, frames: [{ name: "box", heightMm: 40 }], events: [{ frame: "box", kind: "grew", fromMm: 30, toMm: 40, text: "box grew 10 mm" }] };

  it("fails a frameOverflow under stress that carries no proposal with a value", () => {
    const bare = { kind: "frameOverflow", page: 1, template: "t", frame: "box", overflowMm: 3, steps: [], proposals: [{ kind: "shortenText", value: 0 }] };
    const out = stressFindings({ ...base, facts: facts({ ...declared, pages: [page], warnings: [bare] }) });
    expect(out.map((f) => f.severity)).toEqual(["info", "info", "fail"]);
    expect(out[1]!.detail).toBe("p. 1 (t) rearranged: box grew 10 mm");
    expect(out[2]!.detail).toMatch(/a warning under stress must carry a proposal with a value$/);
    expect(usefulProposal({ kind: "continueNextPage", path: "/pageTemplates/0/frames/0/overflow/continueIn", value: "next-page" })).toBe(true);
    expect(usefulProposal({ kind: "allowShrink", value: 0.8 })).toBe(true);
    expect(usefulProposal({ kind: "shortenText", value: 0 })).toBe(false);
  });

  it("fails any other warning the longer text raises, a stretched run that throws, and one that builds nothing", () => {
    const out = stressFindings({ ...base, facts: facts(declared, { textWarnings: [{ kind: "unbreakableWordOverflow", page: 1, detail: "word" }], warnings: [{ kind: "overflow", page: 1, overflowPx: 12 }] }) });
    expect(out.filter((f) => f.severity === "fail").map((f) => f.detail)).toEqual(["overflow on page 1 (12 px over)", "unbreakableWordOverflow \"word\" on page 1"]);
    expect(stressFindings({ ...base, done: "error", err: "boom", facts: null }).at(-1)).toEqual({ check: "C38", severity: "fail", detail: "the stretched edition threw: boom" });
    expect(stressFindings({ ...base, facts: { ...facts(declared), selected: -1 } }).at(-1)!.detail).toBe("the stretched edition built nothing");
  });

  it("reads how far the reflow pushed a frame past the foot of the type area (#911)", () => {
    const frame = (name: string, y: number, declaredY?: number) => ({ name, rect: { x: 0, y, width: 100, height: 100 }, ...(declaredY !== undefined ? { declaredRect: { x: 0, y: declaredY, width: 100, height: 100 } } : {}), overflowPx: 0, scale: 1, blockIds: [] });
    const doc = { config: { page: { dpi: 254 } }, contentWarnings: [], pages: [{ index: 0, contentArea: { x: 0, y: 0, width: 100, height: 1000 }, composed: { template: "t", fenceIndex: 0, log: [], frames: [frame("moved", 950, 800), frame("drawn", 950), frame("inside", 500, 400)] } }] };
    const out = composedFacts(engine, [doc]) as ComposedFacts;
    expect(out.pages[0]!.frames.map((f) => f.pushedOutMm)).toEqual([5, undefined, undefined]);
  });

  it("reports the page's box of a frame set in its own writing mode, not the turned one it is laid out in (#960)", () => {
    // 254 dpi: 10 px a mm. A frame 200 x 100 on the page, laid out turned: 100 x 200.
    const turned = { x: 50, y: -50, width: 100, height: 200 };
    const frame = { name: "side", rect: turned, declaredRect: turned, writingMode: "vertical-rl", overflowPx: 0, scale: 1, blockIds: [] };
    const doc = { config: { page: { dpi: 254 } }, contentWarnings: [], pages: [{ index: 0, width: 1000, height: 1400, contentArea: { x: 0, y: 0, width: 1000, height: 1400 }, composed: { template: "t", fenceIndex: 0, log: [], frames: [frame] } }] };
    const out = composedFacts(engine, [doc]) as ComposedFacts;
    expect(out.pages[0]!.frames[0]!.heightMm).toBe(10);
    expect(out.pages[0]!.frames[0]!.box).toEqual([0, 0, 20, 10]);
    expect(out.pages[0]!.frames[0]!.pushedOutMm).toBeUndefined();
  });

  describe("frames pushed off the edges (#948)", () => {
    // 254 dpi: 10 px a mm. Area 100..900 x 100..1300 on a 1000 x 1400 sheet.
    const rect = (x: number, y: number, width = 200, height = 100) => ({ x, y, width, height });
    const frame = (name: string, at: ReturnType<typeof rect>, declaredRect?: ReturnType<typeof rect>) => ({ name, rect: at, ...(declaredRect ? { declaredRect } : {}), overflowPx: 0, scale: 1, blockIds: [] });
    const pageOf = (frames: unknown[], extra: Record<string, unknown> = {}, composed: Record<string, unknown> = {}) => ({
      index: 0, width: 1000, height: 1400, contentArea: { x: 100, y: 100, width: 800, height: 1200 },
      composed: { template: "t", fenceIndex: 0, log: [], frames, ...composed }, ...extra,
    });
    const docOf = (pages: unknown[], config: Record<string, unknown> = {}) => ({ config: { page: { dpi: 254, ...config } }, contentWarnings: [], pages });
    const pushedOf = (doc: unknown) => (composedFacts(engine, [doc]) as ComposedFacts).pages.flatMap((p) => p.frames.map((f) => [f.name, f.pushedOutMm, f.pushedOutEdge, f.pushedOutOf]));

    it("catches a frame grown past the right edge, the head and the left edge of the area, as well as the foot", () => {
      const doc = docOf([pageOf([
        frame("right", rect(780, 500), rect(700, 500)),
        frame("head", rect(300, 80), rect(300, 150)),
        frame("left", rect(60, 500), rect(120, 500)),
        frame("foot", rect(300, 1250), rect(300, 1150)),
        frame("inside", rect(300, 500), rect(300, 400)),
      ])]);
      expect(pushedOf(doc)).toEqual([
        ["right", 8, "right", undefined],
        ["head", 2, "head", undefined],
        ["left", 4, "left", undefined],
        ["foot", 5, "foot", undefined],
        ["inside", undefined, undefined, undefined],
      ]);
    });

    it("measures a frame the template places outside the area against the bleed", () => {
      // 3 mm of bleed (30 px) and no marks: a 1060 px sheet around a 1000 px trim, the bleed box the whole sheet.
      const cutLines = { enabled: true, bleed: { value: 3, unit: "mm" }, markLength: { value: 0, unit: "mm" }, markOffset: { value: 0, unit: "mm" } };
      const doc = docOf([{ ...pageOf([
        frame("band", rect(0, 600, 1060), rect(0, 600, 1040)),
        frame("past", rect(0, 600, 1100), rect(0, 600, 1060)),
        frame("margin note", rect(10, 600), rect(10, 600)),
        frame("note grown", rect(10, 600, 200, 300), rect(10, 600, 200, 100)),
      ]), width: 1060, height: 1460 }], { cutLines });
      expect(pushedOf(doc)).toEqual([
        ["band", undefined, undefined, undefined],
        ["past", 4, "right", "bleed"],
        ["margin note", undefined, undefined, undefined],
        ["note grown", undefined, undefined, undefined],
      ]);
    });

    it("judges a frame of a spread against the sheet of both pages, not its own page", () => {
      // Two 1000 px pages; the area runs 100..900 on the first and 100..900 on the second (1100..1900 as a spread).
      const left = { index: 0, composed: { spread: "left", facingPage: 1 } };
      const right = { index: 1, composed: { spread: "right", facingPage: 0 } };
      const area = { x: 100, y: 100, width: 800, height: 1200 };
      const mk = (side: typeof left, frames: unknown[]) => ({ ...pageOf(frames), ...side, composed: { template: "t", fenceIndex: 0, log: [], frames, ...side.composed } });
      const pages = [
        mk(left, [
          // Grew across the spine, to the right edge of the second page's area: still the spread's area.
          frame("band", rect(100, 200, 1700), rect(100, 200, 1600)),
          // Past the outer edge of the sheet.
          frame("outer", rect(40, 500), rect(120, 500)),
          // Declared inside the area, now beyond the whole spread's right edge.
          frame("wide", rect(900, 700, 1100), rect(900, 700, 1000)),
        ]),
        mk(right, [
          frame("band", rect(-900, 200, 1700), rect(-900, 200, 1600)),
          frame("right", rect(780, 500), rect(700, 500)),
        ]),
      ].map((p) => ({ ...p, contentArea: area }));
      const out = Object.fromEntries(pushedOf(docOf(pages)).map(([name, mm, edge], i) => [`${i < 3 ? "L" : "R"}:${name}`, [mm, edge]]));
      expect(out["L:band"]).toEqual([undefined, undefined]);
      expect(out["L:outer"]).toEqual([6, "left"]);
      expect(out["L:wide"]).toEqual([10, "right"]);
      expect(out["R:band"]).toEqual([undefined, undefined]);
      expect(out["R:right"]).toEqual([8, "right"]);
    });

    it("lays out a real spread whose frames cross the spine without pushing any off the sheet", () => {
      const mm = (value: number) => ({ value, unit: "mm" as const });
      const config = {
        page: { width: mm(200), height: mm(260), margins: { top: mm(20), bottom: mm(20), left: mm(20), right: mm(20) } },
        pageTemplates: [{
          id: "tl", spread: true, gutter: mm(10), grid: { columns: 4, rows: 4, columnGap: mm(12) },
          frames: [
            { name: "band", crossGutter: true, grid: { col: 1, row: 1, cols: 4 } },
            { name: "left", grid: { col: 1, row: 2 } },
            { name: "right", grid: { col: 4, row: 2 } },
          ],
        }],
      } as unknown as PostextConfig;
      const md = ["::::page{template=\"tl\" spread}", ":::frame{slot=\"band\"}", "Band across the spine", ":::", "", ":::frame{slot=\"left\"}", "Left card", ":::", "", ":::frame{slot=\"right\"}", "Right card", ":::", "::::"].join("\n");
      const doc = engine.buildDocument({ markdown: md }, config, engine.createMeasurementCache());
      const spread = doc.pages.filter((p) => p.composed?.spread);
      expect(spread).toHaveLength(2);
      const out = composedFacts(engine, [doc]) as ComposedFacts;
      expect(out.pages.flatMap((p) => p.frames).filter((f) => f.pushedOutMm !== undefined)).toEqual([]);
    });

    it("names the edge in the finding", () => {
      const pushed = { ...page, frames: [{ name: "row", heightMm: 20, pushedOutMm: 3.2, pushedOutEdge: "right" as const }, { name: "band", heightMm: 20, pushedOutMm: 1, pushedOutEdge: "head" as const, pushedOutOf: "bleed" as const }] };
      const out = stressFindings({ ...base, facts: facts({ ...declared, pages: [pushed] }) });
      expect(out.filter((f) => f.severity === "fail").map((f) => f.detail)).toEqual([
        'p. 1 (t): frame "row" was pushed 3.2 mm past the right edge of the type area',
        'p. 1 (t): frame "band" was pushed 1 mm past the head of the bleed',
      ]);
    });
  });

  it("fails a frame the reflow pushed past the foot of the type area (#911)", () => {
    const pushed = { ...page, frames: [{ name: "box", heightMm: 40 }, { name: "lines", heightMm: 16, pushedOutMm: 4.5 }] };
    const out = stressFindings({ ...base, facts: facts({ ...declared, pages: [pushed] }) });
    expect(out.filter((f) => f.severity === "fail").map((f) => f.detail)).toEqual(['p. 1 (t): frame "lines" was pushed 4.5 mm past the foot of the type area']);
  });

  it("says when the page goes on, and when the page count changed", () => {
    const going = { ...page, events: [], frames: [{ name: "a", heightMm: 30, continuesTo: "cp0:b" }] };
    const out = stressFindings({ ...base, base: facts(declared), facts: facts({ ...declared, pages: [going] }, { pages: [...facts(declared).pages!, { ...facts(declared).pages![0]!, n: 2 }] }) });
    expect(out.map((f) => f.detail)).toContain("p. 1 (t) goes on: continues a → cp0:b");
    expect(out.at(-1)!.detail).toBe("2 pages, 1 as written");
  });

  it("says what moved against the text as written when the log is silent (#925)", () => {
    // A standfirst whose height follows its text (no minHeight) declares no
    // height: it grows and the columns anchored below it move, and the
    // reflow log says nothing.
    const frames = (standfirst: number) => [
      { name: "entradilla", heightMm: standfirst, box: [10, 10, 190, standfirst] as [number, number, number, number] },
      { name: "col-1", heightMm: 200 - standfirst, box: [10, 17 + standfirst, 92, 200 - standfirst] as [number, number, number, number] },
      { name: "titulo", heightMm: 20, box: [10, 250, 150, 20] as [number, number, number, number] },
    ];
    const asWritten = { n: 1, template: "apertura", fenceIndex: 0, frames: frames(24), events: [] };
    const stretched = { ...asWritten, frames: frames(30.2) };
    const out = stressFindings({ ...base, base: facts({ ...declared, pages: [asWritten] }), facts: facts({ ...declared, pages: [stretched] }) });
    expect(out[1]!.detail).toBe("p. 1 (apertura) rearranged: entradilla 6.2 mm taller than as written; col-1 6.2 mm shorter than as written; col-1 moved down 6.2 mm from where it was as written");
    // Without the run as written, as before.
    expect(stressFindings({ ...base, facts: facts({ ...declared, pages: [stretched] }) })[1]!.detail).toBe("p. 1 (apertura) fits as it was");
    // What the log says already is not said twice.
    const logged = { ...stretched, events: [{ frame: "entradilla", kind: "grew", fromMm: 24, toMm: 30.2, text: "entradilla grew 6.2 mm" }] };
    expect(changesAgainstBase(logged, asWritten)).toEqual(["col-1 6.2 mm shorter than as written", "col-1 moved down 6.2 mm from where it was as written"]);
  });

  it("names the frame a story goes on in by its name, template and page (#925)", () => {
    const going = { ...page, events: [], frames: [{ name: "col-2", id: "cp0:col-2", heightMm: 30, continuesTo: "cp0:col-1~2" }] };
    const after = { n: 2, template: "seguido-par", fenceIndex: 0, frames: [{ name: "col-1", id: "cp0:col-1~2", heightMm: 200, continuedFrom: "cp0:col-2" }], events: [] };
    const out = stressFindings({ ...base, facts: facts({ ...declared, pages: [going, after] }) });
    expect(out.map((f) => f.detail)).toContain("p. 1 (t) goes on: continues col-2 → col-1 of seguido-par on p. 2 (cp0:col-1~2)");
  });
});

describe("C39: the pages against the approved capture", () => {
  const run = { vdtHash: "aaaaaaaa11", engine: "1.35.0" };
  it("notes a recipe with no approved capture of these sources", () => {
    expect(compareFindings({ approved: null, run, changes: null, pages: 1, maxDiff: 12, pixels: true })[0]!.severity).toBe("info");
  });

  it("warns, not fails, on a layout hash measured on another system (--hash-warn)", () => {
    const out = compareFindings({ approved: { vdtHash: "bbbbbbbb22", engine: "1.35.0" }, run, changes: null, pages: 1, maxDiff: 12, pixels: false, hashWarn: true });
    expect(out.map((f) => f.severity)).toEqual(["warn"]);
    expect(out[0]!.detail).toContain("measured on another system");
    const strict = compareFindings({ approved: { vdtHash: "bbbbbbbb22", engine: "1.35.0" }, run, changes: null, pages: 1, maxDiff: 12, pixels: false, hashWarn: true, strict: true });
    expect(strict[0]!.severity).toBe("fail");
  });

  it("fails a moved layout or a changed page on the approved engine, and warns on another", () => {
    const changes = [{ n: 2, detail: "worst cell 36.2 of 255, 14 cells over the threshold" }];
    const same = compareFindings({ approved: { vdtHash: "bbbbbbbb22", engine: "1.35.0" }, run, changes, pages: 3, maxDiff: 12, pixels: true });
    expect(same.map((f) => [f.severity, f.detail])).toEqual([
      ["fail", "the layout is not the approved one (layout hash aaaaaaaa, approved bbbbbbbb) on postext 1.35.0, the engine it was approved on"],
      ["fail", "p. 2 is not the approved page: worst cell 36.2 of 255, 14 cells over the threshold (threshold 12) on postext 1.35.0, the engine it was approved on"],
    ]);
    const other = compareFindings({ approved: { vdtHash: "bbbbbbbb22", engine: "1.34.1" }, run, changes, pages: 3, maxDiff: 12, pixels: false });
    expect(other.map((f) => f.severity)).toEqual(["warn"]);
    expect(compareFindings({ approved: { vdtHash: "bbbbbbbb22", engine: "1.34.1" }, run, changes, pages: 3, maxDiff: 12, pixels: false, strict: true })[0]!.severity).toBe("fail");
    expect(compareFindings({ approved: { vdtHash: run.vdtHash, engine: "1.34.1" }, run, changes: [], pages: 3, maxDiff: 12, pixels: true })[0]!.detail)
      .toBe("the layout and 3 pages within 12 of 255 of the approved capture");
  });
});

describe("C40: the source map round trip (#857)", () => {
  it("is a note on an engine without sourceAt, and only on a recipe with composed pages", () => {
    expect(roundTripFindings(facts(declared))).toEqual([{ check: "C40", severity: "info", detail: expect.stringContaining("skipped until the pinned engine has it") }]);
    expect(roundTripFindings(facts(none))).toEqual([]);
  });

  it("fails an element a click inside does not bring back, and names it", () => {
    const { doc } = layOut(content("en"), "en");
    const page = doc.pages.find((p) => p.composed)!;
    const frame = page.composed!.frames.find((f) => f.name === "dinero")!;
    const element = { level: "frame", id: frame.id, source: { kind: "config", path: frame.configPath }, content: { start: frame.sourceStart!, end: frame.sourceEnd! }, rect: frame.rect };
    // A source map that finds the frame and answers every click with nothing.
    const lost = { ...engine, elementsForSource: () => [{ pageIndex: page.index, element }], sourceAt: () => [] };
    const trip = composedRoundTrip(lost, doc, { markdown: content("en") }) as NonNullable<ComposedFacts["roundTrip"]>;
    expect(trip.levels).toEqual({ frame: { checked: 1, missed: 1 } });
    expect(trip.misses[0]).toMatchObject({ page: 1, level: "frame", id: frame.id, text: expect.stringMatching(/^The money in the box/) });
    const found = { ...engine, elementsForSource: () => [{ pageIndex: page.index, element }], sourceAt: () => [{ ...element, level: "frame" }] };
    expect(composedRoundTrip(found, doc)!.misses).toEqual([]);
    const out = roundTripFindings(facts({ ...declared, roundTrip: trip }));
    expect(out).toEqual([{ check: "C40", severity: "fail", detail: expect.stringMatching(/^p\. 1: a click inside frame cp0:dinero “The money in the box/) }]);
  });

  it.runIf(typeof (engine as Record<string, unknown>).sourceAt === "function")("probes a frame whose text was scaled at the rect the source map gives (#921)", () => {
    // `dinero` at a fixed 56 mm with no maximum: one more paragraph makes
    // the ladder scale its text (to 0.9). elementsForSource gives the lines
    // upright on the sheet already; mapping them through frameMatrix again
    // looked a line off at the frame's foot (4 misses here, 139 on Nº 160).
    const tpl = PAGE8_CONFIG.pageTemplates![0]!;
    const frames = tpl.frames!.map((f) => (f.name === "dinero" ? { ...f, height: { value: 56, unit: "mm" as const }, minHeight: undefined, maxHeight: undefined } : f));
    const config = { ...PAGE8_CONFIG, pageTemplates: [{ ...tpl, frames }, ...PAGE8_CONFIG.pageTemplates!.slice(1)] } as PostextConfig;
    const more = "More money 0 ".repeat(24).trim();
    const markdown = content("en").replace(/(:::frame\{slot="dinero"[^\n]*\n)/, `$1${more}\n\n`);
    const { doc, composed } = layOut(markdown, "en", config);
    const dinero = doc.pages.find((p) => p.composed)!.composed!.frames.find((f) => f.name === "dinero")!;
    expect(dinero.scale).toBeLessThan(0.95);
    expect(dinero.overflowPx ?? 0).toBe(0);
    expect(composed.roundTrip?.misses).toEqual([]);
    expect(composed.roundTrip?.levels.line?.checked).toBeGreaterThan(0);
  });

  it.runIf(typeof (engine as Record<string, unknown>).sourceAt === "function")("brings every element of the fixture back on an engine with the source map", () => {
    for (const lang of LOCALES) {
      const { composed } = layOut(content(lang), lang);
      expect(composed.roundTrip?.misses).toEqual([]);
      expect(Object.keys(composed.roundTrip?.levels ?? {})).toEqual(expect.arrayContaining(["frame", "block", "line"]));
      expect(roundTripFindings(facts(composed))).toEqual([
        { check: "C40", severity: "info", detail: expect.stringMatching(/^every element came back to its source: .*\d+ frame.*\d+ line/) },
      ]);
    }
  });

  it.runIf(typeof (engine as Record<string, unknown>).sourceAt === "function")("clicks a right-to-left page where the sheet shows each element (#929)", () => {
    // The frames of a right-to-left page are laid in its mirrored flow frame:
    // their boxes come flagged `flow`, and the probe clicks them on the sheet.
    const config = { ...PAGE8_CONFIG, direction: "rtl" } as PostextConfig;
    const { doc, composed } = layOut(content("en"), "en", config);
    expect(doc.pages.find((p) => p.composed)!.flow).toBeDefined();
    expect(composed.roundTrip?.misses).toEqual([]);
    expect(composed.roundTrip?.levels.line?.checked).toBeGreaterThan(0);
  });

  it.runIf(typeof (engine as Record<string, unknown>).sourceAt === "function")("fails the fixture when the source map answers for the wrong place", () => {
    const real = engine as unknown as { sourceAt: (doc: unknown, page: number, x: number, y: number) => unknown[] };
    // Every click answered as if it had landed in the page's top-left corner.
    const shifted = { ...engine, sourceAt: (doc: unknown, page: number) => real.sourceAt(doc, page, 1, 1) };
    for (const lang of LOCALES) {
      const { doc } = layOut(content(lang), lang);
      const composed = composedFacts(shifted, [doc], { markdowns: [content(lang)] }) as ComposedFacts;
      expect(composed.roundTrip!.misses.length).toBeGreaterThan(5);
      const out = roundTripFindings(facts(composed));
      expect(out.every((f) => f.check === "C40" && f.severity === "fail")).toBe(true);
      expect(out[0]!.detail).toMatch(/^p\. 1: a click inside (frame|block|line|text) /);
      expect(out.at(-1)!.detail).toMatch(/^and \d+ more elements the source map does not find again$/);
    }
  });
});

describe("C41: the configuration under 1 MB", () => {
  it("fails a configuration of more than 1 MB of JSON", () => {
    expect(configSizeFindings(facts(none, { userConfig: { note: "x".repeat(1024) } }))).toEqual([]);
    expect(configSizeFindings(facts(none, { userConfig: { picture: "x".repeat(1024 * 1024) } }))).toEqual([
      { check: "C41", severity: "fail", detail: "the configuration weighs 1.00 MB of JSON (limit 1 MB): move pictures and text out of it" },
    ]);
  });
});
