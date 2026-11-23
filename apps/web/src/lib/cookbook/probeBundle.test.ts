import { describe, expect, it } from "vitest";
import { defaultResourceTypes, effectiveResourceTypes, resolveBodyTextConfig, stripConfigDefaults } from "postext";
import type { PostextConfig } from "postext";
import {
  bundleGroup, bundleLanguage, bundleLocale, configKeyOf, coverMarkdownOf, extraWarnings, languageBack, layoutHash, linesHash, namedLanguage, readBundleBack, startLossNotes, startOf,
} from "../../../scripts/cookbook/lib/probe.js";

// The Sandbox bundle of a capture whose `capture.doc` lists several builds:
// chained with `continuation` they make a book, one chapter per build
// (#540), of the builds that share one configuration (#690).

const config = { page: { dpi: 150 } };
const build = (markdown: string, resources: { id: string }[], continuation?: object, own: object = config) => ({
  kind: "document", config: own, content: { markdown, resources, ...(continuation ? { continuation } : {}) },
});

describe("bundleGroup: builds chained into a book (#540)", () => {
  it("makes a chapter of each chained build, with every build's resources", () => {
    const group = bundleGroup([
      build("# First article\n\nText.", [{ id: "a" }, { id: "shared" }]),
      build("# Second *article*\n\nText.", [{ id: "shared" }, { id: "b" }], { pageIndexOffset: 3, headings: { h1: 0 } }),
    ], "Bulletin");
    expect(group!.builds).toEqual([0, 1]);
    expect(group!.left).toEqual([]);
    expect(group!.chain!.chapters.map((c) => c.title)).toEqual(["First article", "Second article"]);
    expect(group!.chain!.chapters[1].markdown).toBe("# Second *article*\n\nText.");
    expect(group!.chain!.resources.map((r) => r.id)).toEqual(["a", "shared", "b"]);
    expect(group!.notes).toEqual(["build 2: continuation.headings not carried (the Sandbox chains the chapters itself)"]);
    expect(group!.warns).toEqual([]);
  });

  it("leaves builds that do not chain (two editions) to the first build", () => {
    const group = bundleGroup([build("# En", []), build("# Es", [])]);
    expect(group).toMatchObject({ builds: [0], left: [1], chain: null, notes: [], warns: [] });
    expect(bundleGroup([build("# One", [])])).toBeNull();
    expect(bundleGroup(undefined)).toBeNull();
  });
});

describe("bundleGroup: one configuration per bundle (#690)", () => {
  const original = build("# 原作", [{ id: "art" }, { id: "ja" }], { pageIndexOffset: 1 }, { locale: "ja" });
  const lettered = build("# Lettering", [{ id: "art" }, { id: "en" }], { pageIndexOffset: 2 }, { locale: "en-us" });

  it("keeps the first build's group and warns of the builds left out when the recipe did not choose", () => {
    const group = bundleGroup([original, lettered]);
    expect(group).toMatchObject({ builds: [0], left: [1], chain: null, notes: [] });
    expect(group!.warns).toEqual([
      "build 2 (Lettering) left out of the bundle: its configuration differs from the first build's, and a bundle carries one. "
        + "It holds build 1; name the build to keep in capture.sandbox",
    ]);
  });

  it("keeps the group of the build capture.sandbox names, and only notes the others", () => {
    const group = bundleGroup([original, lettered], "", { keep: 1, explicit: true });
    expect(group).toMatchObject({ builds: [1], left: [0], chain: null, warns: [] });
    expect(group!.notes).toEqual(["capture.sandbox keeps build 2 of 2; build 1 (原作) left out (another configuration)"]);
  });

  it("makes a book of the builds that share the kept configuration", () => {
    const apa = { citations: { style: "apa" } };
    const ieee = { citations: { style: "ieee" } };
    const group = bundleGroup([
      build("# One", [{ id: "a" }], undefined, apa),
      build("# Two", [{ id: "b" }], { pageIndexOffset: 1 }, ieee),
      build("# Three", [{ id: "c" }], { pageIndexOffset: 2, pageNumbering: { startAt: 9 } }, apa),
      build("# Four", [{ id: "d" }], { pageIndexOffset: 3 }, ieee),
    ], "", { keep: 3, explicit: true });
    expect(group!.builds).toEqual([1, 3]);
    expect(group!.left).toEqual([0, 2]);
    expect(group!.chain!.chapters.map((c) => c.title)).toEqual(["Two", "Four"]);
    expect(group!.chain!.resources.map((r) => r.id)).toEqual(["b", "d"]);
    expect(group!.notes).toEqual(["capture.sandbox keeps builds 2 and 4 of 4; build 1 (One) and build 3 (Three) left out (another configuration)"]);
    const first = bundleGroup([
      build("# One", [], undefined, apa), build("# Two", [], { pageIndexOffset: 1 }, ieee), build("# Three", [], { pageIndexOffset: 2 }, apa),
    ]);
    expect(first!.builds).toEqual([0, 2]);
    expect(first!.warns[0]).toMatch(/^build 2 \(Two\) left out of the bundle: its configuration differs .* It holds builds 1 and 3; name/);
  });

  it("keeps the named build alone when the builds do not chain", () => {
    const group = bundleGroup([build("# En", []), build("# Es", [], undefined, { locale: "es" })], "", { keep: 1, explicit: true });
    expect(group).toMatchObject({ builds: [1], left: [0], chain: null, warns: [] });
    expect(group!.notes).toEqual(["capture.sandbox keeps build 2 of 2: the bundle is that document alone"]);
    expect(bundleGroup([build("# En", []), build("# Es", [])], "", { keep: 2, explicit: true })).toBeNull();
  });
});

describe("configKeyOf (#690)", () => {
  it("reads two configurations alike whatever the order of their keys, and drops functions", () => {
    const a = { locale: "en", page: { dpi: 150, mirror: true }, onPass: () => {} };
    const b = { page: { mirror: true, dpi: 150 }, locale: "en" };
    expect(configKeyOf(a)).toBe(configKeyOf(b));
    expect(configKeyOf({ ...b, locale: "ja" })).not.toBe(configKeyOf(b));
  });

  it("compares them as the bundle stores them: without the values that restate a default", () => {
    const engine = {
      stripConfigDefaults: (c: { page?: { dpi?: number } }) => {
        const out = { ...c, page: { ...c.page } };
        if (out.page.dpi === 300) delete out.page.dpi;
        return out;
      },
    };
    expect(configKeyOf({ locale: "en", page: { dpi: 300 } }, engine)).toBe(configKeyOf({ locale: "en", page: {} }, engine));
    expect(configKeyOf({ locale: "en", page: { dpi: 300 } })).not.toBe(configKeyOf({ locale: "en", page: {} }));
    const broken = { stripConfigDefaults: () => { throw new Error("no"); } };
    expect(configKeyOf({ locale: "en" }, broken)).toBe(configKeyOf({ locale: "en" }));
  });
});

// ─── What the bundle takes from the pen's build ──────────────────────────────

describe("startOf: the build's continuation as the bundle's start (#695)", () => {
  it("carries the continuation as plain data, without the book's page count", () => {
    const continuation = { pageIndexOffset: 57, pageNumbering: { startAt: 58 }, headings: { h1: 3 }, bookPageCount: 320 };
    expect(startOf(continuation)).toEqual({ pageIndexOffset: 57, pageNumbering: { startAt: 58 }, headings: { h1: 3 } });
    expect(startOf(continuation)).not.toBe(continuation);
  });

  it("is nothing for a build with no continuation, or with one that says nothing", () => {
    for (const none of [undefined, null, "x", {}, { bookPageCount: 9 }]) expect(startOf(none)).toBeNull();
  });

  it("says what a bundle written by an engine without `start` loses", () => {
    expect(startLossNotes({ pageIndexOffset: 57, pageNumbering: { startAt: 58 }, headings: { h1: 3 }, part: { number: "II", title: "T" } })).toEqual([
      "continuation.pageIndexOffset 57: page 1 is a verso in the recipe, a recto in the Sandbox",
      'continuation.headings {"h1":3} dropped (chapter numbers restart)',
      "continuation.part dropped",
    ]);
    expect(startLossNotes({ pageIndexOffset: 8, pageNumbering: { startAt: 9 } })).toEqual(["continuation.pageIndexOffset 8 dropped (even: same page sides)"]);
    expect(startLossNotes({ pageNumbering: { startAt: 41 } })).toEqual([]);
  });
});

describe("bundleLocale: the locale that gives the pen's resource types", () => {
  const engine = { defaultResourceTypes, effectiveResourceTypes };
  const figure = [{ id: "plan", typeId: "figure", kind: "svg" }];

  it("keeps the edition's language when it names the types as the document does", () => {
    expect(bundleLocale(engine, { locale: "es" }, figure, "es")).toEqual({ locale: "es" });
    expect(bundleLocale(engine, { locale: "en" }, figure, "en")).toEqual({ locale: "en" });
    // A document that names no language reads in English, as its edition.
    expect(bundleLocale(engine, {}, figure, "en")).toEqual({ locale: "en" });
  });

  it("takes the document's language when the edition would rename them", () => {
    // maghreb-edition-european-digits: an Arabic document on the English and Spanish pages.
    const arabic = { locale: "ar-MA" };
    for (const edition of ["en", "es"]) {
      const named = bundleLocale(engine, arabic, figure, edition);
      expect(named.locale).toBe("ar-MA");
      expect(named.resourceTypes).toBeUndefined();
      expect(named.note).toContain("ar-MA");
    }
    expect(defaultResourceTypes("ar-MA")[0]!.captionPrefix).not.toBe(defaultResourceTypes("en")[0]!.captionPrefix);
    // The hyphenation locale names the language when `locale` does not.
    expect(bundleLocale(engine, { bodyText: { hyphenation: { locale: "es" } } }, figure, "en").locale).toBe("es");
  });

  it("keeps the edition's language for a document that names none", () => {
    // The read-back (C33) tells when a type name prints otherwise.
    expect(bundleLocale(engine, {}, figure, "es")).toEqual({ locale: "es" });
    expect(bundleLocale(engine, { bodyText: { hyphenation: { locale: " " } } }, figure, "es")).toEqual({ locale: "es" });
  });

  it("leaves the edition's language where no type name can print", () => {
    expect(bundleLocale(engine, { locale: "ar-MA" }, [], "en")).toEqual({ locale: "en" });
    const own = { locale: "ar-MA", resourceTypes: defaultResourceTypes("es") };
    expect(bundleLocale(engine, own, figure, "en")).toEqual({ locale: "en" });
    // An engine that cannot say: as before.
    expect(bundleLocale({}, { locale: "ar-MA" }, figure, "en")).toEqual({ locale: "en" });
  });

  it("writes the pen's types into the configuration when no locale gives them", () => {
    const odd = { defaultResourceTypes, effectiveResourceTypes: () => [{ ...defaultResourceTypes("en")[0]!, captionPrefix: "Plate" }] };
    const named = bundleLocale(odd, { locale: "en-GB" }, figure, "en");
    expect(named.locale).toBe("en");
    expect(named.resourceTypes).toEqual([{ ...defaultResourceTypes("en")[0]!, captionPrefix: "Plate" }]);
  });
});

// ─── The language a bundle names (#660) ──────────────────────────────────────

/** A document as the engine builds it from `config`: its resolved hyphenation and locale. */
const built = (config: PostextConfig) => ({
  config: { bodyText: resolveBodyTextConfig(config.bodyText, config.locale), ...(config.locale ? { locale: config.locale } : {}) },
});

describe("bundleLanguage: the language written into a bundle that would name none (#660)", () => {
  const engine = { stripConfigDefaults };
  const lora: PostextConfig = { bodyText: { fontFamily: "Lora" } };

  it("writes the language the pen's document was set in when the pen names none", () => {
    const named = bundleLanguage(engine, lora, built(lora));
    expect(named.locale).toBe("en-us");
    expect(named.note).toBe("locale en-us written into the bundle's configuration: the pen names no language, "
      + "and the Sandbox would read the document in the interface language");
    // Hyphenation switched off: the document still has a language a reader would replace.
    const off: PostextConfig = { bodyText: { hyphenation: { enabled: false } } };
    expect(bundleLanguage(engine, off, built(off)).locale).toBe("en-us");
    expect(bundleLanguage(engine, {}, built({})).locale).toBe("en-us");
  });

  it("writes it too when the pen names the default patterns, which createBundle drops", () => {
    const english: PostextConfig = { bodyText: { fontFamily: "Lora", hyphenation: { locale: "en-us" } } };
    // What the bundle would store says nothing of the language.
    expect(namedLanguage(stripConfigDefaults(english))).toBeNull();
    const named = bundleLanguage(engine, english, built(english));
    expect(named.locale).toBe("en-us");
    expect(named.note).toContain("createBundle drops the hyphenation locale, which restates the default");
  });

  it("is kept by the strip, and lays the document out in the same language", () => {
    const written = { ...lora, locale: bundleLanguage(engine, lora, built(lora)).locale! };
    expect(namedLanguage(stripConfigDefaults(written))).toBe("en-us");
    expect(built(written).config.bodyText.hyphenation).toEqual(built(lora).config.bodyText.hyphenation);
    // `bodyText.hyphenation.locale` would not do: the strip drops it again.
    expect(namedLanguage(stripConfigDefaults({ ...lora, bodyText: { ...lora.bodyText, hyphenation: { locale: "en-us" } } }))).toBeNull();
  });

  it("leaves a configuration that names its language as stored", () => {
    const spanish: PostextConfig = { bodyText: { hyphenation: { locale: "es" } } };
    for (const config of [{ locale: "es" }, { locale: "ja" }, { locale: "en" }, spanish, { locale: "ar-MA", bodyText: { hyphenation: { locale: "en-us" } } }] as PostextConfig[]) {
      expect(bundleLanguage(engine, config, built(config))).toEqual({});
    }
    // A hyphenation locale kept with a setting beside it that is no default.
    const ragged: PostextConfig = { bodyText: { hyphenation: { locale: "en-us", ragged: true } } };
    expect(namedLanguage(stripConfigDefaults(ragged))).toBe("en-us");
    expect(bundleLanguage(engine, ragged, built(ragged))).toEqual({});
  });

  it("writes nothing for a document with no resolved configuration, and reads a configuration as written without the engine's strip", () => {
    expect(bundleLanguage(engine, lora, undefined)).toEqual({});
    expect(bundleLanguage(engine, lora, { config: {} })).toEqual({});
    expect(bundleLanguage({}, lora, built(lora)).locale).toBe("en-us");
    expect(bundleLanguage({}, { bodyText: { hyphenation: { locale: "en-us" } } }, built({}))).toEqual({});
    expect(namedLanguage({ locale: " ", bodyText: { hyphenation: { locale: "" } } })).toBeNull();
    expect(namedLanguage(undefined)).toBeNull();
  });
});

describe("languageBack: the bundle's language beside the pen's (#660)", () => {
  it("reads how each side divides its words, and the language the bundle names", () => {
    expect(languageBack(built({}), built({ locale: "en-us" }), { locale: "en-us" })).toEqual({
      pen: { locale: "en-us", enabled: true }, bundle: { locale: "en-us", enabled: true }, named: "en-us",
    });
    // The same patterns on the pen's engine, and nothing a reader could go by.
    expect(languageBack(built({}), built({}), { colorPalette: [] })).toMatchObject({ named: null });
    expect(languageBack(built({ locale: "es" }), built({ bodyText: { hyphenation: { locale: "ca" } } }), { bodyText: { hyphenation: { locale: "ca" } } })).toEqual({
      pen: { locale: "es", enabled: true }, bundle: { locale: "ca", enabled: true }, named: "ca",
    });
    expect(languageBack(built({ locale: "ja" }), built({ locale: "ja" }), { locale: "ja" })!.pen.enabled).toBe(false);
  });

  it("says nothing when a side has no resolved configuration", () => {
    expect(languageBack(undefined, built({}), {})).toBeNull();
    expect(languageBack(built({}), { pages: [] }, {})).toBeNull();
  });
});

// ─── C33: the bundle read back ───────────────────────────────────────────────

const line = (text: string, x = 10) => ({ text, bbox: { x, y: 20, width: 100, height: 12 } });
const doc = (pages: { label: string; lines: string[] }[], extra: object = {}) => ({
  pageIndexOffset: 0,
  pages: pages.map((p, index) => ({
    index, width: 500, height: 700, pageLabel: p.label, role: "body",
    columns: [{ blocks: [{ type: "paragraph", bbox: { x: 10, y: 20, width: 100, height: 12 * p.lines.length }, lines: p.lines.map((t) => line(t)) }] }],
  })),
  ...extra,
});
const engineFor = (docs: object[]) => ({ openBundle: async (bytes: Uint8Array) => ({ bytes }), buildBundle: () => docs });

describe("readBundleBack (#690)", () => {
  it("finds the bundle laid out as the pen's documents, wherever the book puts them", async () => {
    const pen = [{ ...doc([{ label: "1", lines: ["One", "two"] }]), pageIndexOffset: 2 }];
    const back = await readBundleBack(engineFor([doc([{ label: "1", lines: ["One", "two"] }])]), new Uint8Array(), pen);
    expect(back.chapters).toHaveLength(1);
    expect(back.chapters[0].pen).toEqual(back.chapters[0].bundle);
    expect(back.chapters[0].pen!.pages).toBe(1);
    expect(back.chapters[0].difference).toBeNull();
    expect(back.extraWarnings).toEqual([]);
  });

  it("says where a chapter's layout parts from the pen's", async () => {
    const pen = [doc([{ label: "1", lines: ["One"] }]), doc([{ label: "2", lines: ["A balloon", "in Comic Neue"] }])];
    const bundle = [doc([{ label: "1", lines: ["One"] }]), doc([{ label: "2", lines: ["A balloon in", "Zen Antique"] }, { label: "3", lines: ["over"] }])];
    const back = await readBundleBack(engineFor(bundle), new Uint8Array(), pen);
    expect(back.chapters[0].difference).toBeNull();
    expect(back.chapters[1].pen!.pages).toBe(1);
    expect(back.chapters[1].bundle!.pages).toBe(2);
    expect(back.chapters[1].pen!.hash).not.toBe(back.chapters[1].bundle!.hash);
    expect(back.chapters[1].difference).toBe("page 1: the pen sets L10,20,100,12|A balloon, the bundle L10,20,100,12|A balloon in");
  });

  it("reports the language of both sides and the one the bundle names (#660)", async () => {
    const page = [{ label: "1", lines: ["One"] }];
    const pen = [{ ...doc(page), ...built({}) }];
    const opens = (stored: PostextConfig) => ({ openBundle: async () => ({ config: stored }), buildBundle: () => [{ ...doc(page), ...built(stored) }] });
    const silent = await readBundleBack(opens({}), new Uint8Array(), pen);
    expect(silent.chapters[0].difference).toBeNull();
    expect(silent.language).toEqual({ pen: { locale: "en-us", enabled: true }, bundle: { locale: "en-us", enabled: true }, named: null });
    expect((await readBundleBack(opens({ locale: "en-us" }), new Uint8Array(), pen)).language!.named).toBe("en-us");
    expect((await readBundleBack(opens({ locale: "es" }), new Uint8Array(), pen)).language!.bundle.locale).toBe("es");
    // Documents with no resolved configuration (an engine that keeps none).
    expect((await readBundleBack(engineFor([doc(page)]), new Uint8Array(), [doc(page)])).language).toBeNull();
  });

  it("lists the warnings the bundle raises beyond the pen's", async () => {
    const overflow = { kind: "comicBalloonOverflow", pageIndex: 0, panel: 2, speaker: "rin" };
    const pen = [doc([{ label: "1", lines: ["One"] }], { contentWarnings: [{ kind: "comicUnknownSpeaker", speaker: "voice" }] })];
    const bundle = [doc([{ label: "1", lines: ["One"] }], {
      contentWarnings: [{ kind: "comicUnknownSpeaker", speaker: "voice" }, overflow, { ...overflow, pageIndex: 1 }],
      configWarnings: [{ kind: "unknownConfigKey", path: "comics.letterin", value: "x" }],
    })];
    const back = await readBundleBack(engineFor(bundle), new Uint8Array(), pen);
    expect(back.extraWarnings).toEqual([
      "comicBalloonOverflow panel 3 rin", "comicBalloonOverflow panel 3 rin", "unknownConfigKey comics.letterin",
    ]);
    expect(extraWarnings(["a", "a", "b"], ["a", "a", "a", "c"])).toEqual(["a", "c"]);
  });

  // A toy engine: the chapter number comes from the continuation's heading
  // counter, the second line from two configuration keys.
  type Toy = { headings?: string; headingStyles?: string; resourceTypes?: string };
  type ToyContent = { markdown: string; continuation?: { headings?: { h1: number }; pageIndexOffset?: number } };
  const lay = (content: ToyContent, config: Toy) => doc([{
    label: "1",
    lines: [`${(content.continuation?.headings?.h1 ?? 0) + 1} ${content.markdown}`, `${config.headings ?? "plain"}/${config.headingStyles ?? "plain"}/${config.resourceTypes ?? "own"}`],
  }]);
  const toy = (stored: Toy) => ({
    openBundle: async () => ({ chapters: [{ markdown: "Title" }], resources: [], config: stored }),
    buildBundle: (b: { chapters: ToyContent[]; config: Toy }) => b.chapters.map((c) => lay(c, b.config)),
    buildDocument: lay,
  });
  const penBuild = (config: Toy, continuation?: ToyContent["continuation"]) => {
    const content = { markdown: "Title", ...(continuation ? { continuation } : {}) };
    return { kind: "document", config, content, docs: [lay(content, config)] };
  };
  const causeFor = async (stored: Toy, build: ReturnType<typeof penBuild>) =>
    (await readBundleBack(toy(stored), new Uint8Array(), build.docs, [build])).chapters[0].cause;

  it("names the continuation a bundle does not carry, by the keys the pages need", async () => {
    const build = penBuild({ headings: "bold" }, { headings: { h1: 3 }, pageIndexOffset: 40 });
    expect(await causeFor({ headings: "bold" }, build)).toEqual({ continuation: ["headings"] });
  });

  it("names the configuration key the bundle stores otherwise, or sets and the pen does not", async () => {
    const build = penBuild({ headings: "bold", headingStyles: "cover" });
    expect(await causeFor({ headings: "bold" }, build)).toEqual({ configuration: ["headingStyles"] });
    expect(await causeFor({ headings: "bold", headingStyles: "cover", resourceTypes: "en" }, build)).toEqual({ configuration: ["resourceTypes"] });
  });

  it("names the keys that only give the pen's pages back together, and both causes at once", async () => {
    expect(await causeFor({}, penBuild({ headings: "bold", headingStyles: "cover" })))
      .toEqual({ configuration: ["headings", "headingStyles"], together: true });
    expect(await causeFor({ headings: "bold" }, penBuild({ headings: "bold", headingStyles: "cover" }, { headings: { h1: 2 } })))
      .toEqual({ configuration: ["headingStyles"], continuation: ["headings"] });
  });

  it("leaves a difference it cannot explain without a cause, and an equal chapter without one", async () => {
    const build = penBuild({ headings: "bold" });
    const other = { ...build, docs: [doc([{ label: "1", lines: ["Another text"] }])] };
    expect(await causeFor({ headings: "bold" }, other)).toBeNull();
    expect(await causeFor({ headings: "bold" }, build)).toBeNull();
    expect((await readBundleBack(toy({ headings: "bold" }), new Uint8Array(), build.docs, [build])).chapters[0].difference).toBeNull();
  });

  it("gives each side its lines hash beside its layout hash (#736)", async () => {
    const one = doc([{ label: "1", lines: ["One", "two"] }]);
    const back = await readBundleBack(engineFor([one]), new Uint8Array(), [one]);
    expect(back.chapters[0].bundle).toEqual({ pages: 1, hash: layoutHash(one), lines: linesHash(one) });
    expect(back.chapters[0].pen).toEqual(back.chapters[0].bundle);
  });

  it("reports a chapter with no document, a bundle that does not open, and an engine that cannot read one", async () => {
    const one = doc([{ label: "1", lines: ["One"] }]);
    const more = await readBundleBack(engineFor([one, one]), new Uint8Array(), [one]);
    expect(more.chapters[1]).toMatchObject({ chapter: 2, pen: null, bundle: { pages: 1 } });
    const broken = { openBundle: async () => { throw new Error("Invalid bundle manifest (preset.json)"); }, buildBundle: () => [] };
    expect(await readBundleBack(broken, new Uint8Array(), [one])).toMatchObject({ error: "Invalid bundle manifest (preset.json)", chapters: [] });
    expect(await readBundleBack({}, new Uint8Array(), [one])).toMatchObject({ skipped: "the engine has no openBundle / buildBundle" });
  });
});

// ─── The lines of a layout, whatever their boxes measure (#736) ──────────────

describe("linesHash (#736)", () => {
  /** `doc` with every line and block `by` px wider and further right: the
   *  same lines measured with another build of the family. */
  const widened = (pages: { label: string; lines: string[] }[], by: number) => {
    const base = doc(pages);
    return {
      ...base,
      pages: base.pages.map((page) => ({
        ...page,
        columns: page.columns.map((column) => ({
          blocks: column.blocks.map((block) => ({
            ...block,
            bbox: { ...block.bbox, width: block.bbox.width + by },
            lines: block.lines.map((l) => ({ ...l, bbox: { ...l.bbox, x: l.bbox.x + by, width: l.bbox.width + by } })),
          })),
        })),
      })),
    };
  };
  const pages = [{ label: "1", lines: ["One line", "and another"] }, { label: "2", lines: ["over"] }];

  it("holds when a width differs and the lines do not, where the layout hash does not", () => {
    expect(layoutHash(widened(pages, 0.3))).not.toBe(layoutHash(doc(pages)));
    expect(linesHash(widened(pages, 0.3))).toBe(linesHash(doc(pages)));
    expect(linesHash(widened(pages, 40))).toBe(linesHash(doc(pages)));
  });

  it("changes with a line that breaks at another word, a line more and a block on another page", () => {
    const base = linesHash(doc(pages));
    expect(linesHash(doc([{ label: "1", lines: ["One line and", "another"] }, { label: "2", lines: ["over"] }]))).not.toBe(base);
    expect(linesHash(doc([{ label: "1", lines: ["One line", "and another", "over"] }]))).not.toBe(base);
    expect(linesHash(doc([{ label: "1", lines: ["One line"] }, { label: "2", lines: ["and another", "over"] }]))).not.toBe(base);
    expect(linesHash(doc([{ label: "i", lines: ["One line", "and another"] }, { label: "2", lines: ["over"] }]))).not.toBe(base);
  });

  it("counts a document's pages from its own first, as the layout hash does", () => {
    expect(linesHash({ ...doc(pages), pageIndexOffset: 6 })).toBe(linesHash(doc(pages)));
  });

  it("reads the running heads, a table's cells and what is hidden", () => {
    const head = (text: string) => ({ blocks: [{ kind: "text", bbox: { x: 0, y: 0, width: 80, height: 10 }, lines: [{ text }] }] });
    const withHead = (text: string) => ({ ...doc(pages), pages: doc(pages).pages.map((page) => ({ ...page, header: head(text) })) });
    expect(linesHash(withHead("Chapter one"))).not.toBe(linesHash(withHead("Chapter o…")));
    const block = (extra: object) => ({ pageIndexOffset: 0, pages: [{ index: 0, width: 500, height: 700, pageLabel: "1", role: "body", columns: [{ blocks: [{ type: "resource", bbox: { x: 0, y: 0, width: 10, height: 10 }, lines: [], ...extra }] }] }] });
    const table = (text: string) => block({ resourceBlock: { table: { cells: [{ row: 0, col: 1, lines: [line(text)] }] } } });
    expect(linesHash(table("12 mm"))).not.toBe(linesHash(table("12")));
    expect(linesHash(block({ hidden: true }))).not.toBe(linesHash(block({})));
  });
});

describe("coverMarkdownOf: the cover sheet's text in the bundle (#1671)", () => {
  const covers = [
    { version: "paperback", markdown: "First.", built: true },
    { version: "paperback", markdown: "  ", built: true },
    { version: "none", markdown: "Failed.", built: false },
    { version: "hardcover", markdown: "Last.", built: true },
  ];
  it("is the last cover built from a non-blank Markdown", () => {
    expect(coverMarkdownOf(covers, { cover: {} })).toBe("Last.");
    expect(coverMarkdownOf(covers.slice(0, 3), { cover: {} })).toBe("First.");
  });
  it("is nothing without a cover design in the configuration, or without a cover", () => {
    expect(coverMarkdownOf(covers, { page: {} })).toBeNull();
    expect(coverMarkdownOf([], { cover: {} })).toBeNull();
    expect(coverMarkdownOf(undefined, { cover: {} })).toBeNull();
  });
});
