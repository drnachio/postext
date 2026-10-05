import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { composePen } from "./compose.ts";
import {
  CONFIG_KEYS,
  KNOWN_CONTAINERS,
  KNOWN_DIRECTIVES,
  configKeys,
  detectPen,
  markdownConstructs,
  parseImports,
  penFonts,
  scanJs,
  staticLevel,
  usedApis,
} from "./detect.ts";
import { KIT_IMPORTS, imageSize, isAllowedUrl, lintPen, lintRecipe, previewDraftsAllowed } from "./lint.ts";
import { REPO_DIR } from "./paths.ts";
import { listRecipeSlugs, readKit } from "./sources.ts";
import type { KitBlock, RecipeMeta, RecipeSources, SampleLocale } from "./types.ts";

// ─── A pen that follows every convention ────────────────────────────────────

const SCRIPT = String.raw`// ═══ Postext Cookbook · Nº 042 · Fixture opener ═════════════════════════════
// https://postext.dev/en/cookbook/fixture-opener
// Code: MIT · Text: original (MIT)
// Fonts: Newsreader, Archivo (SIL OFL 1.1) · Needs postext ≥ 1.4.1
import {
  buildDocument, renderPageToCanvas, clearMeasurementCache, registerResourceImage,
  defaultResourceTypes,
} from 'https://esm.sh/postext';
import { renderToPdf, decompressWoff2 } from 'https://esm.sh/postext-pdf';

const LANG = 'en'; // @lang: the language of the sample document ('en' | 'es')
const RECIPE = 'fixture-opener';

// ─── 1 · Design ─────────────────────────────────────────────────────────────
const palette = { ink: '#14181d', band: '#2a7f97' };
const col = (id) => ({ hex: palette[id], model: 'hex', paletteId: id });

// #region answer: an explicit H1 page break next to the heading styles
const headings = {
  fontFamily: 'Archivo',
  color: col('ink'),
  // restated on purpose (gotcha headings-drop-h1-break)
  levels: [
    {
      level: 1,
      fontSize: pt(24),
      breakBefore: { enabled: true, parity: 'odd' },
    },
    { level: 2, fontSize: pt(14) },
  ],
};
// #endregion

const config = () => ({ // a factory: the engine caches resolved configs per object
  locale: LANG,
  resourceTypes: defaultResourceTypes(LANG),
  colorPalette: Object.entries(palette)
    .map(([id, hex]) => ({ id, name: id, value: { hex, model: 'hex' } })),
  page: {
    sizePreset: 'custom', width: mm(150), height: mm(210),
    margins: { top: mm(20), bottom: mm(20), left: mm(18), right: mm(18), mirror: true },
  },
  bodyText: { fontFamily: 'Newsreader', fontSize: pt(9.5), lineHeight: pt(13), color: col('ink') },
  'headings': headings,
  header: { elements: [] },
  footer: { elements: [] },
});

// ─── 2 · Content ────────────────────────────────────────────────────────────
const markdown = /* @content */ '';
const resources = [
  { id: 'photo', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
    bitmap: { fileId: 'photo.jpg', format: 'jpeg', width: 1200, height: 800 } },
];
const pattern = /['"]\s*\/\//g; // a regex with quotes and slashes must not confuse the scanner

// ─── 3 · Fonts ──────────────────────────────────────────────────────────────
const FONTS = { Newsreader: ['400', '400i', '700'], Archivo: ['700'] };

// ─── 4 · Build & show ───────────────────────────────────────────────────────
await loadFonts(FONTS, markdown);
await loadImage('photo.jpg', asset('photo.jpg'));
const doc = await buildWithFonts(() => buildDocument({ markdown, resources }, config()), markdown);
showPages(doc, { title: t({ en: 'Fixture opener', es: 'Apertura de prueba' }) });
offerPdf(() => renderToPdf(doc, { fontProvider: fontsourceProvider, resourceBytes: imageBytes }),
  ` + "`${RECIPE}.pdf`" + String.raw`);

// @kit core fonts viewer pdf images
`;

function fixtureSources(overrides: Partial<RecipeSources> = {}): RecipeSources {
  return {
    slug: "fixture-opener",
    script: SCRIPT,
    html: "",
    css: "",
    pen: {},
    content: {
      en: '---\ntitle: "Fixture"\n---\n# One\n\nSee :ref{id="photo"}. A `tick` and ${dollar}.\n\n::resource{id="photo"}\n',
      es: "# Uno\n\nTexto.\n",
    },
    assets: ["assets/photo.jpg"],
    ...overrides,
  };
}

function fixtureMeta(): RecipeMeta {
  return {
    schemaVersion: 1,
    number: 42,
    status: "draft",
    chapter: "headings",
    order: 10,
    level: 2,
    genres: ["magazine"],
    outputs: ["canvas", "pdf"],
    features: { primary: ["heading-styles"], also: ["palette-links"] },
    answers: ["Q29"],
    engine: { postext: "1.4.1", postextPdf: "1.4.1" },
    kit: ["core", "fonts", "viewer", "pdf", "images"],
    sample: { locales: ["en", "es"] },
    capture: { hero: 1, card: "page" },
    downloads: { pdf: true },
    credits: {
      authors: [{ name: "Fixture" }],
      text: [],
      images: [{ what: { en: "Photo", es: "Foto" }, who: "Fixture", license: "CC0-1.0", file: "photo.jpg" }],
      fonts: [
        { family: "Newsreader", license: "OFL-1.1" },
        { family: "Archivo", license: "OFL-1.1" },
      ],
    },
    license: { code: "MIT", content: "MIT" },
    created: "2026-09-25",
    updated: "2026-09-25",
  };
}

const kit = readKit();

function lint(
  edit: (script: string) => string = (s) => s,
  { meta = fixtureMeta(), sources = {}, variant = "en" }: { meta?: RecipeMeta; sources?: Partial<RecipeSources>; variant?: SampleLocale } = {},
) {
  const src = fixtureSources({ script: edit(SCRIPT), ...sources });
  const pen = composePen(src, meta, variant, { kit });
  return lintPen(pen, meta, src, { kit, repoFileExists: (p) => fs.existsSync(path.join(REPO_DIR, p)) });
}

describe("lintPen (fixture)", () => {
  it("passes a pen that follows the conventions, in both editions", () => {
    expect(lint().fails).toEqual([]);
    expect(lint(undefined, { variant: "es" }).fails).toEqual([]);
  });

  it("checks the banners and the answer region", () => {
    expect(lint((s) => s.replace("Nº 042", "Nº 041")).fails).toContain("script.js line 1: the banner says Nº 041; recipe.json says 042");
    expect(lint((s) => s.replace("≥ 1.4.1", "≥ 1.3.0")).fails).toContain(
      "script.js line 4: the banner needs postext ≥ 1.3.0; recipe.json says 1.4.1",
    );
    expect(lint((s) => s.replace("3 · Fonts", "3 · Type")).fails.some((f) => /^script\.js line \d+: section 3 is "Fonts"$/.test(f))).toBe(true);
    expect(lint((s) => s.replace("#region answer", "#region opener")).fails).toContain(
      "script.js: needs exactly one `// #region answer: <what it shows>`",
    );
    const many = Array.from({ length: 7 }, (_, i) => `// #region r${i}: extra\nconst r${i} = ${i};\n// #endregion`).join("\n");
    expect(lint((s) => s.replace("// ─── 2 · Content", `${many}\n// ─── 2 · Content`)).fails).toContain(
      'script.js: at most 6 regions besides "answer" (has 7)',
    );
    expect(lint((s) => s.replace("const RECIPE = 'fixture-opener'", "const RECIPE = 'other'")).fails).toContain(
      "script.js: RECIPE is 'other' but the folder is fixture-opener",
    );
    expect(lint((s) => s.replace("const RECIPE", "const LANG = 'en'; // @lang\nconst RECIPE")).fails).toContain(
      "script.js: exactly one `const LANG = 'en'; // @lang` line (found 2)",
    );
  });

  it("allows only the unpinned engine URLs, once", () => {
    const pinned = lint((s) => s.replace("'https://esm.sh/postext';", "'https://esm.sh/postext@1.4.1';")).fails;
    expect(pinned.some((f) => f.includes("no version pins"))).toBe(true);
    const other = lint((s) => s.replace("'https://esm.sh/postext-pdf'", "'https://unpkg.com/postext-pdf'")).fails;
    expect(other.some((f) => f.includes("pens import only from"))).toBe(true);
    const twice = lint((s) => s.replace("const LANG", "import { parseMarkdown } from 'https://esm.sh/postext';\nconst LANG")).fails;
    expect(twice).toContain("script.js: exactly one import statement from https://esm.sh/postext (or ?bundle for math), found 2");
  });

  it("ties ?bundle to engine.math", () => {
    const bundled = lint((s) => s.replace("'https://esm.sh/postext';", "'https://esm.sh/postext?bundle';")).fails;
    expect(bundled).toContain("script.js: https://esm.sh/postext?bundle is only for engine.math recipes");
    const meta = { ...fixtureMeta(), engine: { ...fixtureMeta().engine, math: true } };
    expect(lint(undefined, { meta }).fails).toEqual(
      expect.arrayContaining([
        "script.js: engine.math recipes import every postext symbol from https://esm.sh/postext?bundle",
        "script.js: math recipes `await initMathEngine()` before the first build",
      ]),
    );
  });

  it("ties the pdf output, the postext-pdf import and the pdf kit block", () => {
    const meta = { ...fixtureMeta(), outputs: ["canvas" as const], kit: ["core", "fonts", "viewer", "images"] as KitBlock[], downloads: {} };
    const fails = lint((s) => s.replace(/offerPdf\([\s\S]*?\);\n/, ""), { meta }).fails;
    expect(fails.some((f) => f.startsWith('script.js: a "pdf" output, an import from https://esm.sh/postext-pdf'))).toBe(true);
    const noImage = lint((s) => s.replace("registerResourceImage,", "")).fails;
    expect(noImage).toContain('script.js: the "images" kit block needs `registerResourceImage` imported from postext');
    const meta2 = { ...fixtureMeta(), kit: ["core", "fonts", "viewer", "pdf"] as KitBlock[] };
    expect(lint(undefined, { meta: meta2 }).fails).toContain(
      'script.js: calls loadImage() from the "images" kit block, which recipe.json "kit" does not list',
    );
  });

  it("ties the epub output to the postext-epub import (#404)", () => {
    const epub = (s: string) => s
      .replace("const LANG", "import { renderToEpub } from 'https://esm.sh/postext-epub';\nconst LANG")
      .replace("// @kit", "await renderToEpub([doc], { layout: 'fixed', metadata: { title: 'F', language: 'en' } });\n\n// @kit");
    const meta = { ...fixtureMeta(), outputs: ["canvas" as const, "pdf" as const, "epub" as const] };
    expect(lint(epub, { meta }).fails).toEqual([]);
    expect(lint(epub).fails).toContain(
      'script.js: an "epub" output and an import from https://esm.sh/postext-epub (or its /worker) go together (output no, import yes)',
    );
    expect(lint(undefined, { meta }).fails).toContain(
      'script.js: an "epub" output and an import from https://esm.sh/postext-epub (or its /worker) go together (output yes, import no)',
    );
    const pinned = lint((s) => epub(s).replace("esm.sh/postext-epub'", "esm.sh/postext-epub@0.1.0'"), { meta }).fails;
    expect(pinned.some((f) => f.includes("no version pins"))).toBe(true);
    expect(usedApis(epub(SCRIPT))).toContain("renderToEpub");
  });

  it("lets a pen write its EPUBs on a worker from postext-epub/worker (#406)", () => {
    const onWorker = (s: string) => s
      .replace("const LANG", "import { createEpubWorker } from 'https://esm.sh/postext-epub/worker';\nconst LANG")
      .replace("// @kit", "await createEpubWorker().render([doc], { layout: 'fixed', metadata: { title: 'F', language: 'en' } });\n\n// @kit");
    const meta = { ...fixtureMeta(), outputs: ["canvas" as const, "pdf" as const, "epub" as const] };
    expect(lint(onWorker, { meta }).fails).toEqual([]);
    expect(usedApis(onWorker(SCRIPT))).toContain("createEpubWorker");
  });

  it("catches the engine traps", () => {
    expect(lint((s) => s.replace("const config = () => ({", "const config = {").replace("\n});\n\n// ─── 2", "\n};\n\n// ─── 2")).fails).toContain(
      "script.js: the config is a factory, `const config = () => ({ … })` (the engine caches resolved configs per object)",
    );
    const noBreak = lint((s) => s.replace("      breakBefore: { enabled: true, parity: 'odd' },\n", "")).fails;
    expect(noBreak.some((f) => f.includes("any `headings` object drops the default H1 page break"))).toBe(true);
    const stack = lint((s) => s.replace("fontFamily: 'Archivo'", "fontFamily: 'Archivo, sans-serif'")).fails;
    expect(stack.some((f) => /^script\.js line \d+: fontFamily holds one family, not a stack \("Archivo, sans-serif"\)$/.test(f))).toBe(true);
    expect(lint((s) => s.replace("  header:", "  orderedLists: { numberFormat: 'decimal' },\n  header:")).fails.some((f) => f.includes("numberFormat: 'arabic'"))).toBe(true);
    expect(lint((s) => s.replace("  header:", "  headingStyle: [],\n  header:")).fails.some((f) => f.includes("`headingStyle` is not a config key"))).toBe(true);
    expect(lint((s) => s.replace("  footer: { elements: [] },\n", "")).fails).toContain("script.js: the config must set `footer` (never the default skin)");
    const bitmap = lint((s) => s.replace(", width: 1200, height: 800", "")).fails;
    expect(bitmap.some((f) => f.endsWith(": bitmaps declare width and height at print size"))).toBe(true);
    const clock = lint((s) => s.replace("const palette", "const seed = Math.random() + Date.now() + new Date().getTime();\nconst palette")).fails;
    expect(clock.filter((f) => f.includes("captures must be deterministic"))).toHaveLength(3);
  });

  it("checks the content files", () => {
    const content = { en: "# One\n\n::resource{id='photo'}\n\n:::sidebar\n", es: "# Uno\n" };
    const fails = lint(undefined, { sources: { content } }).fails;
    expect(fails).toContain(`content.en.md: "::resource{id='photo'}" is not \`::resource{id="…"}\` (double quotes, id only)`);
    expect(fails).toContain('content.en.md: ":::sidebar" is not a Postext directive (it prints as text)');
    const bare = lint(undefined, { sources: { content: { en: "---\ntitle: Bare\n---\n# One\n", es: "# Uno\n" } } }).fails;
    expect(bare).toContain('content.en.md: frontmatter line 2: quote the value ("…")');
  });

  it("keeps the network on the allowlist and assets in the folder", () => {
    const fails = lint((s) => s.replace("await loadImage('photo.jpg', asset('photo.jpg'));", "await loadImage('photo.jpg', 'https://example.com/photo.jpg');\nawait loadImage('b.jpg', asset('missing.jpg'));")).fails;
    expect(fails.some((f) => f.includes("https://example.com/photo.jpg is not on the network allowlist"))).toBe(true);
    expect(fails.some((f) => f.includes("asset('missing.jpg'): no assets/missing.jpg in the recipe folder"))).toBe(true);
    const gh = lint((s) => s.replace("asset('photo.jpg')", "'https://cdn.jsdelivr.net/gh/drnachio/postext@main/cookbook/fixture-opener/assets/nope.jpg'")).fails;
    expect(gh.some((f) => f.includes("cookbook/fixture-opener/assets/nope.jpg does not exist in the repo"))).toBe(true);
    expect(isAllowedUrl("https://cdn.jsdelivr.net/npm/@fontsource/newsreader@5/files/x.woff2")).toBe(true);
    expect(isAllowedUrl("https://cdn.jsdelivr.net/npm/lodash")).toBe(false);
    expect(isAllowedUrl("https://cdn.jsdelivr.net/gh/drnachio/postext@develop/cookbook/x")).toBe(false);
    expect(isAllowedUrl("http://postext.dev/x")).toBe(false);
  });

  it("enforces the size limits", () => {
    const long = Array.from({ length: 320 }, (_, i) => `const v${i} = ${i};`).join("\n");
    const fails = lint((s) => s.replace("// ─── 2 · Content", `${long}\n// ─── 2 · Content`)).fails;
    expect(fails.some((f) => /script\.js: \d+ lines of recipe code \(at most 300\)/.test(f))).toBe(true);
    const words = Array.from({ length: 2600 }, () => "word").join(" ");
    expect(lint(undefined, { sources: { content: { en: words, es: "x" } } }).fails).toContain("content.en.md: 2600 words (at most 2500)");
  });
});

// ─── Chinese, Japanese and Korean recipes (the cjk kit block) ───────────────

const SHOW_BOOK = "script.js: a right-bound book shows its spreads mirrored with showBook(…) from the book kit block (gotcha cjk-spread-order)";

const OPENING = "此開卷第一回也。作者自云：因曾歷過一番夢幻之後，故將真事隱去，而借「通靈」之說，撰此《石頭記》一書也。";

/** The fixture turned into a Chinese recipe: its faces loaded by slices,
 *  its PDF from cjkPdfProvider, its locale set to the text's. */
function cjkScript(s: string): string {
  return s
    .replace("const FONTS = { Newsreader: ['400', '400i', '700'], Archivo: ['700'] };",
      "const FONTS = { Newsreader: ['400', '400i', '700'], Archivo: ['700'], 'Noto Serif TC': ['400'] };")
    .replace("await loadFonts(FONTS, markdown);", "await loadFonts(FONTS, markdown);\nawait loadCjkFonts(FONTS, markdown);")
    .replace("fontProvider: fontsourceProvider", "fontProvider: cjkPdfProvider")
    .replace("  locale: LANG,", "  locale: 'zh-Hant',")
    .replace("showPages(doc,", "showBook(doc,");
}

function cjkMeta(): RecipeMeta {
  const meta = fixtureMeta();
  return {
    ...meta,
    kit: [...meta.kit, "cjk"],
    credits: { ...meta.credits, fonts: [...meta.credits.fonts, { family: "Noto Serif TC", license: "OFL-1.1" }] },
  };
}

describe("lintPen (a Chinese recipe)", () => {
  const cjkContent = { en: `# 第一回\n\n${OPENING}\n`, es: `# 第一回\n\n${OPENING}\n` };
  const lintCjk = (edit: (s: string) => string = (s) => s, content: Record<string, string> = cjkContent) =>
    lint((s) => edit(cjkScript(s)), { meta: cjkMeta(), sources: { content } });

  it("passes a pen that loads its faces through the cjk block", () => {
    const { fails, warns } = lintCjk();
    expect(fails).toEqual([]);
    expect(warns.filter((w) => /cjk|CJK|Chinese|latin/.test(w))).toEqual([]);
  });

  it("counts Chinese characters, 1.7 to the word", () => {
    const long = { en: `# 一\n\n${"天".repeat(4300)}\n`, es: "# 一\n" };
    expect(lintCjk(undefined, long).fails).toContain(
      "content.en.md: 4,301 Chinese characters, about 2,530 words (at most 2,500; 1.7 characters count as a word)",
    );
    const fits = { en: `# 一\n\n${"天".repeat(4000)}\n`, es: "# 一\n" };
    expect(lintCjk(undefined, fits).fails.filter((f) => f.includes("words"))).toEqual([]);
  });

  it("leaves Han to the CJK faces in the PDF, but not the Latin letters beyond latin", () => {
    const pinyin = { en: `# 一\n\n${OPENING} Zhì yǎn zhāi.\n`, es: "# 一\n" };
    const warns = lintCjk(undefined, pinyin).warns.filter((w) => w.includes("latin"));
    expect(warns).toHaveLength(1);
    expect(warns[0]).toMatch(/^content\.en\.md: characters outside Fontsource latin and the CJK blocks \(ǎ ā\)/);
    // Without the block, the Chinese is reported with the kit block to use.
    const plain = lint((s) => s, { sources: { content: cjkContent } }).warns;
    expect(plain.filter((w) => w.includes("outside Fontsource latin"))).toEqual([]);
    expect(plain).toContain(
      "content.en.md: Chinese, Japanese or Korean text needs the cjk kit block: load its faces with loadCjkFonts(FONTS, markdown) (gotcha cjk-fonts-slices)",
    );
  });

  it("asks for cjkPdfProvider, the locale, showBook for right-bound books and the vertical twin's import", () => {
    const latinPdf = lintCjk((s) => s.replace("fontProvider: cjkPdfProvider", "fontProvider: fontsourceProvider")).fails;
    expect(latinPdf).toContain(
      "script.js: renderToPdf takes fontProvider: cjkPdfProvider (fontsourceProvider embeds only the latin file of a CJK face; gotcha cjk-fonts-slices)",
    );
    const lang = lintCjk((s) => s.replace("  locale: 'zh-Hant',", "  locale: LANG,")).warns;
    expect(lang).toContain(
      "script.js: set config.locale to the text's language ('zh-Hans', 'zh-Hant', 'ja'…), not LANG: the tag picks the regional conventions and turns hyphenation off (gotcha cjk-locale-tag)",
    );
    const vertical = (s: string) => s.replace("  locale: 'zh-Hant',", "  locale: 'zh-Hant',\n  layout: { writingMode: 'vertical-rl' },");
    const shown = lintCjk((s) => vertical(s).replace("showBook(doc,", "showPages(doc,")).warns;
    expect(shown).toContain(SHOW_BOOK);
    expect(lintCjk(vertical).warns.filter((w) => w.includes("showBook"))).toEqual([]);
    const twin = lintCjk((s) => s.replace("await loadCjkFonts(FONTS, markdown);", "await loadCjkFonts(FONTS, markdown, { vertical: true });")).fails;
    expect(twin).toContain("script.js: loadCjkFonts(…, { vertical: true }) needs `loadVerticalAlternates` imported from postext");
    const imported = lintCjk((s) =>
      s.replace("await loadCjkFonts(FONTS, markdown);", "await loadCjkFonts(FONTS, markdown, { vertical: true });")
        .replace("defaultResourceTypes,\n}", "defaultResourceTypes, loadVerticalAlternates,\n}"),
    ).fails;
    expect(imported).toEqual([]);
  });

  it("asks for the CJK faces and locale only when the text is Chinese, and reads the binding off the config", () => {
    // A Latin book bound on the right lists the block for showBook alone.
    const latin = { en: "# One\n\nA page of Latin text.\n", es: "# Uno\n\nUna página de texto latino.\n" };
    const rightBound = (s: string) =>
      s.replace("  page: {\n", "  page: {\n    binding: 'right',\n")
        .replace("fontProvider: cjkPdfProvider", "fontProvider: fontsourceProvider")
        .replace("  locale: 'zh-Hant',", "  locale: LANG,");
    const latinBook = lintCjk(rightBound, latin);
    expect(latinBook.fails).toEqual([]);
    expect(latinBook.warns.filter((w) => /cjk|CJK|showBook/.test(w))).toEqual([]);
    // Without the block, showPages still gets the advice.
    const noBlock = lint((s) => s.replace("  page: {\n", "  page: {\n    binding: 'right',\n"), { sources: { content: latin } }).warns;
    expect(noBlock).toContain(SHOW_BOOK);
    // A vertical heading style does not bind a horizontal book on the right.
    const verticalHead = (s: string) =>
      s.replace("  locale: 'zh-Hant',", "  locale: 'zh-Hant',\n  headingStyles: [{ id: 'side', layout: { writingMode: 'vertical-rl' } }],")
        .replace("showBook(doc,", "showPages(doc,");
    expect(lintCjk(verticalHead).warns.filter((w) => w.includes("showBook"))).toEqual([]);
    // page.binding 'left' keeps a vertical book left-bound.
    const leftVertical = (s: string) =>
      s.replace("  locale: 'zh-Hant',", "  locale: 'zh-Hant',\n  layout: { columns: { count: 1 }, writingMode: 'vertical-rl' },")
        .replace("  page: {\n", "  page: {\n    binding: 'left',\n")
        .replace("showBook(doc,", "showPages(doc,");
    expect(lintCjk(leftVertical).warns.filter((w) => w.includes("showBook"))).toEqual([]);
    expect(lintCjk((s) => leftVertical(s).replace("binding: 'left'", "binding: 'right'")).warns).toContain(
      SHOW_BOOK,
    );
  });
});

// ─── Japanese recipes (the cjk kit block) ───────────────────────────────────

/** The opening of こころ (Aozora 773), kana and kanji with a Latin marker. */
const KOKORO = "私はその人を常に先生と呼んでいた。だからここでもただ先生と書くだけで本名は打ち明けない。Sensei.";

/** The fixture turned into a Japanese recipe: a Japanese face loaded by
 *  slices, its PDF from cjkPdfProvider, its locale 'ja'. */
function jaScript(s: string): string {
  return cjkScript(s).replace("'Noto Serif TC': ['400']", "'Noto Serif JP': ['400']").replace("  locale: 'zh-Hant',", "  locale: 'ja',");
}

function jaMeta(): RecipeMeta {
  const meta = cjkMeta();
  return { ...meta, credits: { ...meta.credits, fonts: meta.credits.fonts.map((f) => (f.family === "Noto Serif TC" ? { ...f, family: "Noto Serif JP" } : f)) } };
}

describe("lintPen (a Japanese recipe)", () => {
  const jaContent = { en: `# 上　先生と私\n\n${KOKORO}\n`, es: `# 上　先生と私\n\n${KOKORO}\n` };
  const lintJa = (edit: (s: string) => string = (s) => s, content: Record<string, string> = jaContent) =>
    lint((s) => edit(jaScript(s)), { meta: jaMeta(), sources: { content } });

  it("passes a pen that loads a Japanese face through the cjk block and tags the text 'ja'", () => {
    const { fails, warns } = lintJa();
    expect(fails).toEqual([]);
    expect(warns.filter((w) => /cjk|CJK|Chinese|Japanese|latin|locale|kana/.test(w))).toEqual([]);
    for (const tag of ["ja-JP", "ja-Jpan"]) {
      expect(lintJa((s) => s.replace("'ja'", `'${tag}'`)).fails).toEqual([]);
    }
  });

  it("counts Japanese characters, 2.2 to the word, and a mix by each language's rate", () => {
    const long = { en: `# 一\n\n${"あ".repeat(5600)}\n`, es: "# 一\n" };
    expect(lintJa(undefined, long).fails).toContain(
      "content.en.md: 5,601 Japanese characters, about 2,546 words (at most 2,500; 2.2 characters count as a word)",
    );
    // 5,400 kana letters would be 3,176 words of Chinese, 2,455 of Japanese.
    const fits = { en: `# 一\n\n${"あ".repeat(5400)}\n`, es: "# 一\n" };
    expect(lintJa(undefined, fits).fails.filter((f) => f.includes("words"))).toEqual([]);
    const mixed = { en: `${"天".repeat(3000)}。\n${"あ".repeat(2000)}。\n`, es: "# 一\n" };
    expect(lintCjkMixed(mixed)).toContain(
      "content.en.md: 3,000 Chinese and 2,000 Japanese characters, about 2,674 words (at most 2,500; Chinese counts 1.7 characters to the word, Japanese 2.2)",
    );
  });

  it("fails Japanese text under a Chinese or Korean tag and names 'ja' when the tag is missing", () => {
    for (const tag of ["zh-Hans", "zh-Hant", "zh", "ko"]) {
      expect(lintJa((s) => s.replace("'ja'", `'${tag}'`)).fails).toContain(
        `script.js: the text is Japanese (it is written with kana) but config.locale is '${tag}': write 'ja', which sets the Japanese line breaking, punctuation and labels (gotcha ja-locale-tag)`,
      );
    }
    expect(lintJa((s) => s.replace("  locale: 'ja',", "  locale: LANG,")).warns).toContain(
      "script.js: set config.locale to the text's language ('ja'), not LANG: the tag picks the Japanese conventions and turns hyphenation off (gotcha ja-locale-tag)",
    );
    // A Chinese page that quotes a Japanese title stays Chinese.
    const quoting = { en: `# 第一回\n\n${OPENING}「こころ」\n`, es: `# 第一回\n\n${OPENING}\n` };
    const chinese = lint((s) => cjkScript(s), { meta: cjkMeta(), sources: { content: quoting } });
    expect(chinese.fails).toEqual([]);
    expect(chinese.warns.filter((w) => w.includes("ja-locale-tag"))).toEqual([]);
  });

  it("recognises kana-only and half-width text as CJK", () => {
    const kana = { en: "# かな\n\nひらがなとカタカナだけの文。ｶﾀｶﾅ。\n", es: "# かな\n\nひらがなとカタカナだけの文。\n" };
    const plain = lint((s) => s, { sources: { content: kana } }).warns;
    expect(plain).toContain(
      "content.en.md: Chinese, Japanese or Korean text needs the cjk kit block: load its faces with loadCjkFonts(FONTS, markdown) (gotcha cjk-fonts-slices)",
    );
    expect(plain.filter((w) => w.includes("outside Fontsource latin"))).toEqual([]);
    expect(lintJa(undefined, kana).fails).toEqual([]);
  });

  it("warns on hentaigana, which no Fontsource file holds, and on a Chinese face for Japanese text", () => {
    const hentaigana = { en: `# 一\n\n${KOKORO}𛀁𛂞\n`, es: `# 一\n\n${KOKORO}\n` };
    const warns = lintJa(undefined, hentaigana).warns;
    expect(warns.filter((w) => w.includes("hentaigana"))).toEqual([
      "content.en.md: hentaigana and archaic kana (𛀁 𛂞) are in no file of a Fontsource Japanese face: loadCjkFonts fails on them and the PDF prints boxes; " +
        "write the modern kana, or set them in a face the recipe ships in its assets (gotcha ja-fonts-kana)",
    ]);
    // They are CJK: no "outside latin" warning on top.
    expect(warns.filter((w) => w.includes("outside Fontsource latin"))).toEqual([]);
    const sc = lint((s) => cjkScript(s).replace("'Noto Serif TC'", "'Noto Serif SC'").replace("'zh-Hant'", "'ja'"), {
      meta: { ...cjkMeta(), credits: { ...cjkMeta().credits, fonts: cjkMeta().credits.fonts.map((f) => (f.family === "Noto Serif TC" ? { ...f, family: "Noto Serif SC" } : f)) } },
      sources: { content: jaContent },
    }).warns;
    expect(sc.filter((w) => w.includes("ja-fonts-kana"))).toHaveLength(1);
    expect(sc.find((w) => w.includes("ja-fonts-kana"))).toMatch(/^script\.js: Japanese text with Noto Serif SC in FONTS: a Chinese face draws the kanji in Chinese forms/);
    expect(lintJa().warns.filter((w) => w.includes("ja-fonts-kana"))).toEqual([]);
  });
});

/** A Chinese recipe linted with `content`. */
function lintCjkMixed(content: Record<string, string>): string[] {
  return lint((s) => cjkScript(s), { meta: cjkMeta(), sources: { content } }).fails;
}

// ─── Arabic recipes (the arabic and book kit blocks) ────────────────────────

/** The opening of the first night, with a Latin marker and digits. */
const NIGHT = "قالت شهرزاد: بلغني أيها الملك السعيد أن تاجرًا كان كثير المال (١٢٣) and 45 dinars.";

/** The fixture turned into an Arabic book: the arabic files loaded after
 *  loadFonts, the PDF from arabicPdfProvider, the locale written out and
 *  the spreads shown right-bound. */
function arabicScript(s: string): string {
  return s
    .replace("const FONTS = { Newsreader: ['400', '400i', '700'], Archivo: ['700'] };",
      "const FONTS = { Newsreader: ['400', '400i', '700'], Archivo: ['700'], Amiri: ['400', '700'] };")
    .replace("await loadFonts(FONTS, markdown);", "await loadFonts(FONTS, markdown);\nawait loadArabicFonts(FONTS, markdown);")
    .replace("fontProvider: fontsourceProvider", "fontProvider: arabicPdfProvider")
    .replace("  locale: LANG,", "  locale: 'ar',")
    .replace("showPages(doc,", "showBook(doc,");
}

function arabicMeta(blocks: KitBlock[] = ["arabic", "book"]): RecipeMeta {
  const meta = fixtureMeta();
  return {
    ...meta,
    kit: [...meta.kit, ...blocks],
    credits: { ...meta.credits, fonts: [...meta.credits.fonts, { family: "Amiri", license: "OFL-1.1" }] },
  };
}

describe("lintPen (an Arabic recipe)", () => {
  const arabicContent = { en: `# الليلة الأولى\n\n${NIGHT}\n`, es: `# الليلة الأولى\n\n${NIGHT}\n` };
  const lintArabic = (edit: (s: string) => string = (s) => s, content: Record<string, string> = arabicContent, meta = arabicMeta()) =>
    lint((s) => edit(arabicScript(s)), { meta, sources: { content } });

  it("passes a pen that loads the arabic files and shows a right-bound book", () => {
    const { fails, warns } = lintArabic();
    expect(fails).toEqual([]);
    expect(warns.filter((w) => /arabic|Arabic|showBook|latin|kit block/.test(w))).toEqual([]);
  });

  it("counts Arabic in words, as Latin text", () => {
    const word = "حكاية ";
    const long = { en: `# أ\n\n${word.repeat(2600)}\n`, es: "# أ\n" };
    expect(lintArabic(undefined, long).fails).toContain("content.en.md: 2601 words (at most 2500)");
    const fits = { en: `# أ\n\n${word.repeat(2400)}\n`, es: "# أ\n" };
    expect(lintArabic(undefined, fits).fails.filter((f) => f.includes("words"))).toEqual([]);
  });

  it("asks for the arabic block, arabicPdfProvider and an Arabic locale", () => {
    const noBlock = lint((s) => arabicScript(s).replace("await loadArabicFonts(FONTS, markdown);\n", ""), {
      meta: arabicMeta(["book"]), sources: { content: arabicContent },
    }).fails;
    expect(noBlock).toContain(
      "content.en.md: Arabic text needs an Arabic face: list the arabic kit block and load the faces with loadArabicFonts(FONTS, markdown) after loadFonts (gotcha arabic-fonts-subset)",
    );
    // Arabic letters are not reported as characters outside latin.
    expect(noBlock.concat(lintArabic().warns).filter((w) => w.includes("outside Fontsource latin"))).toEqual([]);
    const latinPdf = lintArabic((s) => s.replace("fontProvider: arabicPdfProvider", "fontProvider: fontsourceProvider")).fails;
    expect(latinPdf).toContain(
      "script.js: renderToPdf takes fontProvider: arabicPdfProvider (fontsourceProvider embeds only the latin file of an Arabic face; gotcha arabic-fonts-subset)",
    );
    const lang = lintArabic((s) => s.replace("  locale: 'ar',", "  locale: LANG,")).fails;
    expect(lang).toContain(
      "script.js: set config.locale to the text's language ('ar', 'ar-EG', 'ar-MA'…), not LANG: the tag sets the text right to left, binds the book on the right and picks its digits (gotcha arabic-locale-tag)",
    );
    for (const tag of ["ar-EG", "ar_MA", "fa-IR", "ur"]) {
      expect(lintArabic((s) => s.replace("'ar'", `'${tag}'`)).fails.filter((f) => f.includes("locale"))).toEqual([]);
    }
    expect(lintArabic((s) => s.replace("'ar'", "'he'")).fails.some((f) => f.includes("config.locale"))).toBe(true);
  });

  it("accepts a face the recipe builds itself instead of the block", () => {
    const own = lint((s) => arabicScript(s)
      .replace("await loadArabicFonts(FONTS, markdown);", "document.fonts.add(await new FontFace('Amiri', amiriBytes).load());")
      .replace("const FONTS", "const amiriBytes = new Uint8Array(0);\nconst FONTS")
      .replace("fontProvider: arabicPdfProvider", "fontProvider: fontsourceProvider"), {
      meta: arabicMeta(["book"]), sources: { content: arabicContent },
    }).fails;
    expect(own.filter((f) => /Arabic|arabic/.test(f))).toEqual([]);
  });

  it("lets a Latin page quote Arabic in an Arabic face, in its own language", () => {
    const quote = {
      en: `# The first night\n\nThe frame tale opens on a sentence every reader of the Nights knows by heart, and the translator kept its rhythm:\n\n> ${NIGHT}\n`,
      es: "# La primera noche\n\nTexto.\n",
    };
    const ltr = (s: string) => arabicScript(s).replace("  locale: 'ar',", "  locale: LANG,").replace("showBook(doc,", "showPages(doc,");
    const { fails, warns } = lintArabic(ltr, quote, arabicMeta(["arabic"]));
    expect(fails).toEqual([]);
    expect(warns.filter((w) => /arabic|Arabic|showBook/.test(w))).toEqual([]);
  });

  it("reads a right-to-left book as right-bound from its locale or direction", () => {
    const plain = (s: string) => s.replace("showBook(doc,", "showPages(doc,");
    expect(lintArabic(plain).warns).toContain(SHOW_BOOK);
    expect(lintArabic((s) => plain(s).replace("  locale: 'ar',", "  locale: 'ar',\n  direction: 'auto',")).warns).toContain(SHOW_BOOK);
    // A Latin locale with direction 'rtl' is right-bound too…
    const latin = { en: "# One\n\nA page of Latin text.\n", es: "# Uno\n\nUna página de texto latino.\n" };
    const rtl = (s: string) => s.replace("  locale: LANG,", "  locale: LANG,\n  direction: 'rtl',");
    expect(lint(rtl, { sources: { content: latin } }).warns).toContain(SHOW_BOOK);
    // …and an Arabic book that says direction 'ltr', or binds itself on
    // the left, is not.
    expect(lintArabic((s) => plain(s).replace("  locale: 'ar',", "  locale: 'ar',\n  direction: 'ltr',")).warns).not.toContain(SHOW_BOOK);
    expect(lintArabic((s) => plain(s).replace("  page: {\n", "  page: {\n    binding: 'left',\n")).warns).not.toContain(SHOW_BOOK);
    expect(lintArabic((s) => plain(s).replace("  page: {\n", "  page: {\n    binding: 'auto',\n")).warns).toContain(SHOW_BOOK);
  });

  it("takes showBook from the book block or the cjk block, never both", () => {
    const noBook = lintArabic(undefined, undefined, arabicMeta(["arabic"])).fails;
    expect(noBook).toContain('script.js: calls showBook() from the "book" kit block, which recipe.json "kit" does not list');
    expect(lintArabic(undefined, undefined, arabicMeta(["arabic", "cjk"])).fails.filter((f) => f.includes("showBook"))).toEqual([]);
  });
});

// ─── detect.ts ──────────────────────────────────────────────────────────────

describe("detect", () => {
  const pen = composePen(fixtureSources(), fixtureMeta(), "en", { kit });

  it("scans code, comments and literals", () => {
    const scan = scanJs("const a = `x ${`y ${1}`} z`; // c /* d */\nconst r = /[/'\"]/g; const s = 'e\\'f';");
    expect(scan.comments.map((c) => c.text)).toEqual(["// c /* d */"]);
    expect(scan.literals.map((l) => [l.kind, l.text])).toEqual([
      ["template", "y \u0000"],
      ["template", "x \u0000 z"],
      ["regex", "[/'\"]"],
      ["string", "e'f"],
    ]);
    expect(scan.bare.length).toBe(scan.code.length);
  });

  it("finds imports, used APIs, config keys and fonts", () => {
    const imports = parseImports(pen.js);
    expect(imports.map((i) => i.url)).toEqual(["https://esm.sh/postext", "https://esm.sh/postext-pdf"]);
    expect(usedApis(pen.js)).toEqual([
      "buildDocument", "clearMeasurementCache", "decompressWoff2", "defaultResourceTypes", "registerResourceImage",
      "renderPageToCanvas", "renderToPdf",
    ]);
    // A spread is a use; a property of the same name is not.
    const spread = `import { parseTSV, mergeCells } from "https://esm.sh/postext";\nconst t = { ...parseTSV(tsv) };\nt.mergeCells();`;
    expect(usedApis(spread)).toEqual(["parseTSV"]);
    expect(configKeys(pen.js)).toEqual(["locale", "resourceTypes", "colorPalette", "page", "bodyText", "headings", "header", "footer"]);
    expect(configKeys("const config = () => ({ page, ...base, [k]: 1, 'bodyText': {}, layout() {} });")).toEqual(["page", "bodyText", "layout"]);
    expect(penFonts(pen.js)).toEqual([
      { family: "Newsreader", weight: 400, style: "normal" },
      { family: "Newsreader", weight: 400, style: "italic" },
      { family: "Newsreader", weight: 700, style: "normal" },
      { family: "Archivo", weight: 700, style: "normal" },
    ]);
  });

  it("finds the Markdown constructs", () => {
    const md = [
      "---",
      ':::toc{x="frontmatter is skipped"}',
      "---",
      "# Title \\\\ two lines {author=\"A\"}",
      ":::callout{type=\"note\"}",
      "Press :chip[Ctrl] and see :ref{id=\"f\"}, :swatch{color=\"ok\"}, $x^2$, H~2~O, 10^3^ and \\$5.",
      ":::",
      "::resource{id=\"f\"}",
      "$$E = mc^2$$",
      ":::pagebreak{parity=\"odd\"}",
      ":::aside",
    ].join("\n");
    expect(markdownConstructs(md)).toEqual({
      directives: [":::callout", "::resource", "$$", ":::pagebreak"],
      inline: ["{attrs}", "\\\\", ":ref", ":chip", ":swatch", "$…$", "^…^", "~…~"],
      unknown: ["aside"],
    });
  });

  it("suggests a level", () => {
    const detected = detectPen(pen, Object.values(fixtureSources().content));
    expect(detected.suggestedLevel).toBe(2);
    expect(detected.families).toEqual(["Newsreader", "Archivo"]);
    expect(detected.resources).toEqual({ svg: 0, bitmap: 1, table: 0 });
    expect(staticLevel("const config = () => ({ page: {} });", { apis: ["buildDocument"], configKeys: ["page"] })).toBe(1);
    expect(staticLevel("", { apis: ["buildBundle"], configKeys: [] })).toBe(3);
  });

  it("reads image sizes", () => {
    const png = new Uint8Array(32);
    png.set([0x89, 0x50, 0x4e, 0x47], 0);
    png.set([0, 0, 0x09, 0x60, 0, 0, 0x06, 0x40], 16);
    expect(imageSize(png)).toEqual({ width: 2400, height: 1600 });
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 17, 8, 0x03, 0x20, 0x04, 0xb0, 3, 0, 0, 0, 0]);
    expect(imageSize(jpeg)).toEqual({ width: 1200, height: 800 });
  });
});

// ─── The engine and the kit, kept in sync ───────────────────────────────────

describe("engine vocabularies", () => {
  const source = (file: string) => fs.readFileSync(path.join(REPO_DIR, "packages/postext/src", file), "utf-8");

  it("CONFIG_KEYS lists PostextConfig's keys", () => {
    const body = /export interface PostextConfig \{([\s\S]*?)\n\}/.exec(source("types.ts"))?.[1] ?? "";
    const keys = [...body.matchAll(/^ {2}([a-zA-Z]+)\??:/gm)].map((m) => m[1]);
    expect([...CONFIG_KEYS].sort()).toEqual(keys.sort());
  });

  it("the directive lists match the parser's", () => {
    const parser = source("parse/blockParser.ts");
    const set = (name: string) => [...(new RegExp(`${name}[^=]*= new Set\\(\\[([^\\]]*)\\]`).exec(parser)?.[1] ?? "").matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
    expect([...KNOWN_DIRECTIVES].sort()).toEqual(set("KNOWN_DIRECTIVES").sort());
    expect([...KNOWN_CONTAINERS].sort()).toEqual(set("KNOWN_CONTAINERS").sort());
  });

  it("each kit block calls the import the lint requires", () => {
    for (const [block, need] of Object.entries(KIT_IMPORTS)) {
      if (need) expect(kit[block as KitBlock]).toMatch(new RegExp(`\\b${need.name}\\(`));
    }
  });
});

// ─── cookbook/<slug>/ ───────────────────────────────────────────────────────

describe("recipe pens", () => {
  it("pass the lint in every edition", () => {
    // As `pnpm cookbook lint`; with COOKBOOK_PREVIEW=1, as `--engine local`
    // (a draft may preview the next release).
    const preview = previewDraftsAllowed();
    const failures = listRecipeSlugs().flatMap((slug) => lintRecipe(slug, { preview }).fails.map((f) => `${slug}: ${f}`));
    expect(failures).toEqual([]);
  }, 120_000);
});
