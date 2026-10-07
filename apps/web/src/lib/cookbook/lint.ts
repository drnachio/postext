/**
 * Static checks of the Cookbook's pens and recipe folders (spec §7.4, §9):
 * what `pnpm cookbook lint` prints and what `pens.test.ts` asserts. FAILs
 * block a recipe; WARNs are advice. Nothing here runs a browser: the
 * capture's checks (§8.5) cover what only a real layout can show.
 *
 * Isomorphic Node: relative `.ts` imports only. `lintPen` is pure;
 * `lintRecipe` and `lintAll` read the recipe folder.
 */
import fs from "node:fs";
import path from "node:path";
import { ComposeError, composePen, defineData, variantFor } from "./compose.ts";
import {
  CONFIG_KEYS,
  POSTEXT_BUNDLE_URL,
  POSTEXT_PDF_URL,
  POSTEXT_CITEPROC_URL,
  POSTEXT_FOLIO_URL,
  POSTEXT_EPUB_URL,
  POSTEXT_EPUB_WORKER_URL,
  POSTEXT_URL,
  POSTEXT_WORKER_URL,
  configKeys,
  configObjectRange,
  configString,
  fontFamilies,
  isEngineUrl,
  lineLookup,
  malformedResourceEmbeds,
  markdownConstructs,
  matchBracket,
  parseImports,
  penFonts,
  referencesIdentifier,
  scanJs,
  staticLevel,
  usedApis,
} from "./detect.ts";
import { docLinkExists } from "./docLinks.ts";
import { REPO_DIR, recipeDir } from "./paths.ts";
import { loadRegistry } from "./registry.ts";
import { listRecipeSlugs, readKit, readRecipeMeta, readRecipeSources } from "./sources.ts";
import type { ComposedPen, KitBlock, Locale, RecipeMeta, RecipeSources, Registry, SampleLocale } from "./types.ts";
import { KIT_ORDER, LOCALES } from "./types.ts";
import { unquotedFrontmatter, validateRecipeMeta, validateRecipeSet } from "./validate.ts";
import { readWriteup, writeupRefs } from "./writeup.ts";
import { CJK_CHARS_PER_WORD, JAPANESE_CHARS_PER_WORD, styleMessages, textLength } from "./style.ts";

export interface LintReport {
  fails: string[];
  warns: string[];
}

export interface RecipeLintReport extends LintReport {
  slug: string;
}

// ─── Rules ──────────────────────────────────────────────────────────────────

export const LIMITS = {
  /** Recipe code outside the content literals, the kit and `art` regions
   *  (generated artwork is not the technique). Advisory per level; one
   *  hard cap for all. */
  ownLines: 300,
  ownLinesWarn: { 1: 120, 2: 180, 3: 250 } as Record<1 | 2 | 3, number>,
  scriptBytes: 72 * 1024,
  contentWords: 2500,
  prefillBytes: 96 * 1024,
  assetBytes: 400 * 1024,
  assetsBytes: 2 * 1024 * 1024,
  imageLongSide: 2400,
  lineLength: 100,
  /** `#region`s besides `answer`. */
  otherRegions: 6,
  answerLines: [10, 40] as [number, number],
} as const;

/** The only module URLs a pen imports (unpinned: the capture pins them). */
export const ALLOWED_IMPORTS: readonly string[] = [POSTEXT_URL, POSTEXT_BUNDLE_URL, POSTEXT_PDF_URL, POSTEXT_WORKER_URL, POSTEXT_CITEPROC_URL, POSTEXT_FOLIO_URL, POSTEXT_EPUB_URL, POSTEXT_EPUB_WORKER_URL];

/** Hosts (and path prefixes) a pen may fetch from. Nothing else: no hotlinking. */
export const NETWORK_ALLOWLIST: readonly { host: string; path?: string }[] = [
  { host: "esm.sh" },
  { host: "cdn.jsdelivr.net", path: "/npm/@fontsource/" },
  { host: "cdn.jsdelivr.net", path: "/gh/drnachio/postext@main/cookbook/" },
  { host: "api.fontsource.org" },
  { host: "postext.dev" },
];

/** The engine symbol each kit block calls (spec §7.3). */
export const KIT_IMPORTS: Record<KitBlock, { module: "postext" | "postext-pdf"; name: string } | null> = {
  core: null,
  fonts: { module: "postext", name: "clearMeasurementCache" },
  viewer: { module: "postext", name: "renderPageToCanvas" },
  pdf: { module: "postext-pdf", name: "decompressWoff2" },
  images: { module: "postext", name: "registerResourceImage" },
  // loadCjkFonts needs no engine symbol; cjkPdfProvider uses the pdf block's.
  cjk: null,
  // Likewise loadArabicFonts and arabicPdfProvider.
  arabic: null,
  // showBook calls the viewer block's showPages.
  book: null,
  // loadComicFonts, comicPdfProvider and comicPanel call the fonts, pdf,
  // cjk, arabic and images blocks (KIT_CALLS).
  comics: null,
};

/** Kit functions that call another block's: the recipe that calls one
 *  lists that block too, or the pen throws a ReferenceError at run time. */
export const KIT_CALLS: Readonly<Record<string, readonly KitBlock[]>> = {
  comicPanel: ["images"],
  comicPdfProvider: ["pdf"],
};

/** Namespace URIs in inline SVG, never fetched. */
const NAMESPACE_URL = /^https?:\/\/www\.w3\.org\//;

export function isAllowedUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  return NETWORK_ALLOWLIST.some(
    (rule) => parsed.hostname === rule.host && (!rule.path || decodeURI(parsed.pathname).startsWith(rule.path)),
  );
}

function bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

const thousands = (n: number) => n.toLocaleString("en-US");

/** Whether a code point is in Fontsource's `latin` subset (what the pdf
 *  block's provider embeds). */
function isLatin(code: number): boolean {
  return code <= 0xff || code === 0x131 || code === 0x152 || code === 0x153 || code === 0x2bb || code === 0x2bc ||
    code === 0x2c6 || code === 0x2da || code === 0x2dc || code === 0x304 || code === 0x308 || code === 0x329 ||
    (code >= 0x2000 && code <= 0x206f) || code === 0x20ac || code === 0x2122 || code === 0x2191 ||
    code === 0x2193 || code === 0x2212 || code === 0x2215 || code === 0xfeff || code === 0xfffd;
}

/** The Unicode blocks of Chinese, Japanese and Korean text: radicals,
 *  CJK symbols and punctuation, kana (hiragana, katakana and their
 *  phonetic extensions in 3040–31FF, the half-width forms in FF00–FFEF),
 *  bopomofo, hangul, enclosed and compatibility forms, the unified
 *  ideographs and their extensions, vertical and fullwidth forms, and the
 *  historic kana of 1AFF0–1B16F. A CJK face served by Fontsource slices
 *  (the cjk kit block) covers them, all but the historic kana. */
const CJK_BLOCKS: readonly [number, number][] = [
  [0x2e80, 0x2fdf], [0x2ff0, 0x2fff], [0x3000, 0x33ff], [0x3400, 0x4dbf], [0x4e00, 0x9fff], [0xa960, 0xa97f],
  [0xac00, 0xd7ff], [0xf900, 0xfaff], [0xfe10, 0xfe1f], [0xfe30, 0xfe4f], [0xff00, 0xffef], [0x1aff0, 0x1b16f],
  [0x20000, 0x3ffff],
];

function isCjk(code: number): boolean {
  return CJK_BLOCKS.some(([lo, hi]) => code >= lo && code <= hi);
}

/** Kana Extended-B, Kana Supplement, Kana Extended-A and Small Kana
 *  Extension: hentaigana (𛀁), archaic and Ainu kana. Fontsource's
 *  Japanese faces have none of them in any file. */
function isHistoricKana(code: number): boolean {
  return code >= 0x1aff0 && code <= 0x1b16f;
}

/** The Unicode blocks of Arabic-script text: Arabic, its supplement and
 *  extensions A–C, the presentation forms A and B, the Rumi numerals,
 *  Arabic Extended-C and the mathematical alphabetic symbols. The arabic
 *  file of an Arabic face served by Fontsource (the arabic kit block)
 *  covers them. */
const ARABIC_BLOCKS: readonly [number, number][] = [
  [0x0600, 0x06ff], [0x0750, 0x077f], [0x0870, 0x08ff], [0xfb50, 0xfdff], [0xfe70, 0xfeff],
  [0x10e60, 0x10e7f], [0x10ec0, 0x10eff], [0x1ee00, 0x1eeff],
];

function isArabic(code: number): boolean {
  return ARABIC_BLOCKS.some(([lo, hi]) => code >= lo && code <= hi);
}

/** Whether a code point is in Fontsource's `latin-ext` file and not in its
 *  `latin` file: what the cjk block's PDF provider adds for a Latin face
 *  (#466). */
function isLatinExtOnly(code: number): boolean {
  if (!((code >= 0x100 && code <= 0x2ff) || (code >= 0x1e00 && code <= 0x1eff))) return false;
  return !isLatin(code);
}

/** Whether a code point is in Fontsource's `greek` file (the Greek and
 *  Coptic block): what the kit's PDF provider adds for a face that ships
 *  it. */
function isGreek(code: number): boolean {
  return code >= 0x370 && code <= 0x3ff;
}

/** Characters outside Fontsource's `latin` subset (what a PDF recipe
 *  embeds), split into those in the CJK blocks, those in the Arabic blocks
 *  and the rest. */
function nonLatin(text: string): { other: string[]; cjk: string[]; arabic: string[] } {
  const other = new Set<string>();
  const cjk = new Set<string>();
  const arabic = new Set<string>();
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (isLatin(code)) continue;
    (isCjk(code) ? cjk : isArabic(code) ? arabic : other).add(ch);
  }
  return { other: [...other], cjk: [...cjk], arabic: [...arabic] };
}

/** Whether a text is mostly Arabic: more Arabic-script letters than Latin
 *  ones. An English or Spanish page quoting a line of Arabic is not. */
function mostlyArabic(text: string): boolean {
  const arabic = text.match(/(?=\p{L})\p{Script=Arabic}/gu)?.length ?? 0;
  const latin = text.match(/\p{Script=Latin}/gu)?.length ?? 0;
  return arabic > latin;
}

/** Scripts written right to left, as the engine's `directionOf` reads a
 *  locale (packages/postext/src/locale.ts; the historic ones left out). */
const RTL_SCRIPTS = new Set(["Arab", "Aran", "Hebr", "Syrc", "Thaa", "Nkoo", "Adlm", "Rohg", "Mand", "Samr"]);

/** Scripts whose readers read comics right to left, as the engine's
 *  `comicsLocaleDirection` reads a locale: Japanese ('ja' → 'Jpan') and
 *  Traditional Chinese ('zh-Hant', 'zh-TW', 'zh-HK' → 'Hant'). */
const COMICS_RTL_SCRIPTS = new Set(["Jpan", "Hant"]);

/** The script a language tag names or implies once maximised ('ar' →
 *  'Arab', 'ur' → 'Arab', 'ks-Deva' → 'Deva'), or undefined. */
function tagScript(tag: string | undefined): string | undefined {
  if (!tag) return undefined;
  try {
    return new Intl.Locale(tag.trim().replace(/_/g, "-")).maximize().script;
  } catch {
    return undefined;
  }
}

// ─── lintPen ────────────────────────────────────────────────────────────────

export interface LintPenOptions {
  /** Kit sources (cookbook/_kit/*.js): enables the kit-function checks. */
  kit?: Partial<Record<KitBlock, string>>;
  /** Whether a repo-relative path exists (for jsDelivr `gh/…` URLs outside this recipe). */
  repoFileExists?: (repoPath: string) => boolean;
}

/** The functions each kit block declares. */
function kitFunctions(kit: Partial<Record<KitBlock, string>>): Map<string, KitBlock[]> {
  const map = new Map<string, KitBlock[]>();
  for (const block of KIT_ORDER) {
    for (const m of (kit[block] ?? "").matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) {
      map.set(m[1], [...(map.get(m[1]) ?? []), block]);
    }
  }
  return map;
}

/** The static checks of one composed edition. `sources` are the raw files
 *  (content, assets); `meta` the recipe.json. */
export function lintPen(
  composed: ComposedPen,
  meta: RecipeMeta,
  sources: RecipeSources,
  { kit, repoFileExists }: LintPenOptions = {},
): LintReport {
  const fails: string[] = [];
  const warns: string[] = [];
  const { js, slug } = composed;
  const lines = js.split("\n");
  const scan = scanJs(js);
  const lineAt = lineLookup(js);

  // Lines that belong to the recipe itself, not to the content literals or the kit.
  const folded = new Set<number>();
  for (const [a, b] of composed.ranges.content) for (let n = a; n <= b; n++) folded.add(n);
  const kitRange = composed.ranges.kit;
  if (kitRange) for (let n = kitRange[0]; n <= kitRange[1]; n++) folded.add(n);
  const own = (text: string) =>
    text
      .split("\n")
      .map((line, i) => (folded.has(i + 1) ? "" : line))
      .join("\n");
  const ownCode = own(scan.code);
  const ownBare = own(scan.bare);
  const ownLiterals = scan.literals.filter((lit) => !folded.has(lineAt(lit.start)));
  const at = (offset: number) => `script.js line ${lineAt(offset)}`;

  // Banner (4 lines) and the numbered section banners.
  const number = String(meta.number).padStart(3, "0");
  const title = /^\/\/ ═+ Postext Cookbook · Nº (\d{3,}) · (.+?) ═*\s*$/.exec(lines[0] ?? "");
  if (!title) fails.push(`script.js line 1: the banner starts "// ═══ Postext Cookbook · Nº ${number} · <title> ═══"`);
  else if (title[1] !== number) fails.push(`script.js line 1: the banner says Nº ${title[1]}; recipe.json says ${number}`);
  const url = /^\/\/ https:\/\/postext\.dev\/(en|es|ca|zh|ja|ar)\/cookbook\/([a-z0-9-]+)\s*$/.exec(lines[1] ?? "");
  if (!url || url[2] !== slug) fails.push(`script.js line 2: the banner links https://postext.dev/en/cookbook/${slug}`);
  if (!/^\/\/ Code: MIT\b/.test(lines[2] ?? "")) fails.push(`script.js line 3: the banner credits "// Code: MIT · Text: … · Photo: …"`);
  const needs = /^\/\/ Fonts: .+ · Needs postext ≥ (\d+\.\d+\.\d+)\s*$/.exec(lines[3] ?? "");
  if (!needs) fails.push(`script.js line 4: the banner ends "// Fonts: … · Needs postext ≥ ${meta.engine?.postext}"`);
  else if (needs[1] !== meta.engine?.postext) {
    fails.push(`script.js line 4: the banner needs postext ≥ ${needs[1]}; recipe.json says ${meta.engine?.postext}`);
  }
  const sections: { n: number; title: string; line: number }[] = [];
  lines.forEach((line, i) => {
    if (folded.has(i + 1)) return;
    const m = /^\/\/ ─── (\d+) · (.+?) ─*\s*$/.exec(line);
    if (m) sections.push({ n: Number(m[1]), title: m[2], line: i + 1 });
  });
  const expected = [/^design/i, /^content/i, /^fonts/i, /^build/i];
  const numbering = sections.map((s) => s.n);
  if (numbering.some((n, i) => n !== i + 1) || sections.length < 4) {
    fails.push(`script.js: section banners must run "// ─── 1 · Design", "2 · Content", "3 · Fonts", "4 · Build & show" in order`);
  } else {
    expected.forEach((pattern, i) => {
      if (!pattern.test(sections[i].title)) {
        fails.push(`script.js line ${sections[i].line}: section ${i + 1} is "${["Design", "Content", "Fonts", "Build & show"][i]}"`);
      }
    });
  }

  // LANG and RECIPE, once each.
  const langMarkers = lines.filter((line) => /^\s*const LANG = '[a-z]{2}';\s*\/\/ @lang\b/.test(line)).length;
  if (langMarkers !== 1) fails.push(`script.js: exactly one \`const LANG = 'en'; // @lang\` line (found ${langMarkers})`);
  const recipes = [...ownCode.matchAll(/^const RECIPE = '([^']*)';/gm)];
  if (recipes.length !== 1) fails.push(`script.js: exactly one \`const RECIPE = '${slug}';\` line (found ${recipes.length})`);
  else if (recipes[0][1] !== slug) fails.push(`script.js: RECIPE is '${recipes[0][1]}' but the folder is ${slug}`);

  // Regions.
  const regions = composed.ranges.regions;
  const answer = regions.answer;
  if (!answer) fails.push(`script.js: needs exactly one \`// #region answer: <what it shows>\``);
  else {
    const length = answer.lines[1] - answer.lines[0] + 1;
    const [min, max] = LIMITS.answerLines;
    if (length < min || length > max) warns.push(`script.js: the answer region has ${length} lines (aim for ${min}–${max})`);
  }
  const others = Object.keys(regions).filter((id) => id !== "answer");
  if (others.length > LIMITS.otherRegions) {
    fails.push(`script.js: at most ${LIMITS.otherRegions} regions besides "answer" (has ${others.length})`);
  }
  for (const [id, region] of Object.entries(regions)) {
    if (!region.title) warns.push(`script.js: #region ${id} has no title ("// #region ${id}: <what it shows>")`);
  }

  // Imports.
  const imports = parseImports(js, scan);
  for (const imp of imports) {
    if (ALLOWED_IMPORTS.includes(imp.url)) continue;
    if (isEngineUrl(imp.url) && /@/.test(imp.url.replace("https://", ""))) {
      fails.push(`script.js line ${imp.line}: import from ${imp.url}: no version pins (pens follow the latest release; the capture pins it)`);
    } else {
      fails.push(`script.js line ${imp.line}: import from ${imp.url}: pens import only from ${ALLOWED_IMPORTS.join(", ")}`);
    }
  }
  const staticImports = imports.filter((imp) => !imp.dynamic);
  const postextImports = staticImports.filter((imp) => imp.url === POSTEXT_URL || imp.url === POSTEXT_BUNDLE_URL);
  if (postextImports.length !== 1) {
    fails.push(`script.js: exactly one import statement from ${POSTEXT_URL} (or ?bundle for math), found ${postextImports.length}`);
  }
  const math = Boolean(meta.engine?.math);
  const bundled = postextImports.some((imp) => imp.url === POSTEXT_BUNDLE_URL);
  if (math && !bundled) fails.push(`script.js: engine.math recipes import every postext symbol from ${POSTEXT_BUNDLE_URL}`);
  if (!math && bundled) fails.push(`script.js: ${POSTEXT_BUNDLE_URL} is only for engine.math recipes`);
  const postextNames = new Set(postextImports.flatMap((imp) => imp.names));
  if (math && !/\bawait\s+initMathEngine\s*\(\s*\)/.test(ownBare)) {
    fails.push(`script.js: math recipes \`await initMathEngine()\` before the first build`);
  }
  const pdfImport = imports.find((imp) => imp.url === POSTEXT_PDF_URL);
  const pdfOutput = meta.outputs?.includes("pdf") ?? false;
  const pdfKit = meta.kit?.includes("pdf") ?? false;
  if (pdfOutput !== Boolean(pdfImport) || pdfOutput !== pdfKit) {
    fails.push(
      `script.js: a "pdf" output, an import from ${POSTEXT_PDF_URL} and the "pdf" kit block go together ` +
        `(output ${pdfOutput ? "yes" : "no"}, import ${pdfImport ? "yes" : "no"}, kit ${pdfKit ? "yes" : "no"})`,
    );
  }
  // An EPUB has no kit block: the pen writes the file and offers it itself.
  const epubImport = imports.some((imp) => imp.url === POSTEXT_EPUB_URL || imp.url === POSTEXT_EPUB_WORKER_URL);
  const epubOutput = meta.outputs?.includes("epub") ?? false;
  if (epubOutput !== epubImport) {
    fails.push(
      `script.js: an "epub" output and an import from ${POSTEXT_EPUB_URL} (or its /worker) go together ` +
        `(output ${epubOutput ? "yes" : "no"}, import ${epubImport ? "yes" : "no"})`,
    );
  }
  const pdfNames = new Set(imports.filter((imp) => imp.url === POSTEXT_PDF_URL).flatMap((imp) => imp.names));
  for (const block of meta.kit ?? []) {
    const need = KIT_IMPORTS[block];
    if (!need) continue;
    const names = need.module === "postext" ? postextNames : pdfNames;
    if (!names.has(need.name)) fails.push(`script.js: the "${block}" kit block needs \`${need.name}\` imported from ${need.module}`);
  }
  const used = new Set(usedApis(js, scan, imports));
  for (const imp of staticImports) {
    for (const name of imp.names) if (isEngineUrl(imp.url) && !used.has(name)) warns.push(`script.js: \`${name}\` is imported but never used`);
  }

  // Config.
  const range = configObjectRange(scan);
  const keys = configKeys(js, scan);
  if (!range) fails.push("script.js: the config is a factory, `const config = () => ({ … })` (the engine caches resolved configs per object)");
  else {
    for (const key of keys) {
      if (!CONFIG_KEYS.includes(key)) fails.push(`${at(range[0])}: \`${key}\` is not a config key (typo? the engine ignores it)`);
    }
    const spread = /\.\.\./.test(scan.bare.slice(range[0], range[1]));
    const skin = meta.capture?.expect?.defaultSkin ?? [];
    const required = ["bodyText", "header", "footer", "colorPalette"];
    const advised = ["page", ...(skin.includes("headings") ? [] : ["headings"])];
    for (const key of required) {
      if (keys.includes(key)) continue;
      (spread ? warns : fails).push(`script.js: the config must set \`${key}\` (never the default skin)`);
    }
    for (const key of advised) if (!keys.includes(key)) warns.push(`script.js: the config should set \`${key}\` (never the default skin)`);
  }
  if (keys.includes("headings") && !hasLevelOneBreak(scan, (offset) => folded.has(lineAt(offset)))) {
    fails.push(
      "script.js: any `headings` object drops the default H1 page break; restate it: " +
        "`levels: [{ level: 1, breakBefore: { … } }]` (gotcha headings-drop-h1-break)",
    );
  }

  // Engine traps.
  for (const m of ownCode.matchAll(/\bfontFamily\s*:\s*(['"`])([^'"`\n]*)\1/g)) {
    if (m[2].includes(",")) fails.push(`${at(m.index ?? 0)}: fontFamily holds one family, not a stack ("${m[2]}")`);
  }
  for (const m of ownCode.matchAll(/\bnumberFormat\s*:\s*['"`]decimal['"`]/g)) {
    fails.push(`${at(m.index ?? 0)}: ordered lists use numberFormat: 'arabic' ('decimal' prints "undefined")`);
  }
  for (const m of ownBare.matchAll(/\bbitmap\s*:\s*\{/g)) {
    const open = (m.index ?? 0) + m[0].length - 1;
    // ownBare, not scan.bare: blanking the content and kit lines shifts every offset after them.
    const body = ownBare.slice(open, matchBracket(ownBare, open) + 1);
    if (!/\bwidth\s*:/.test(body) || !/\bheight\s*:/.test(body)) {
      fails.push(`${at(open)}: bitmaps declare width and height at print size`);
    }
  }
  const clock: [RegExp, string][] = [
    [/\bMath\s*\.\s*random\s*\(/g, "Math.random() (use a seeded Mulberry32)"],
    [/\bDate\s*\.\s*now\s*\(/g, "Date.now()"],
    [/\bnew\s+Date\s*\(\s*\)/g, "new Date()"],
    [/\bcrypto\s*\.\s*(getRandomValues|randomUUID)\s*\(/g, "crypto randomness"],
  ];
  for (const [pattern, what] of clock) {
    for (const m of ownBare.matchAll(pattern)) fails.push(`${at(m.index ?? 0)}: no ${what}: captures must be deterministic`);
  }
  for (const lit of ownLiterals) {
    if (/<marker\b|<filter\b|<mask\b|\sfilter=|\smask=/.test(lit.text)) {
      fails.push(`${at(lit.start)}: SVG without <marker>, filters or masks (they fall back to raster)`);
    }
  }

  // Network.
  const urls: { url: string; where: string; dynamic: boolean }[] = [];
  for (const lit of scan.literals) {
    const line = lineAt(lit.start);
    if (lit.kind === "regex" || composed.ranges.content.some(([a, b]) => line >= a && line <= b)) continue;
    for (const m of lit.text.matchAll(/https?:\/\/[^\s'"`<>()\\]+/g)) {
      const found = m[0];
      const cut = found.indexOf("\u0000");
      urls.push({ url: cut === -1 ? found : found.slice(0, cut), where: at(lit.start), dynamic: cut !== -1 });
    }
  }
  const markup = [
    ...[...sources.html.matchAll(/\b(?:src|href)\s*=\s*["'](https?:[^"']+)["']/g)].map((m) => ({ url: m[1], where: "index.html" })),
    ...[...sources.css.matchAll(/url\(\s*["']?(https?:[^"')]+)["']?\s*\)|@import\s+["'](https?:[^"']+)["']/g)].map((m) => ({
      url: m[1] ?? m[2],
      where: "style.css",
    })),
    ...[...(sources.pen.stylesheets ?? []), ...(sources.pen.scripts ?? [])].map((u) => ({ url: u, where: "pen.json" })),
  ];
  for (const { url: u, where } of markup) urls.push({ url: u, where, dynamic: false });
  for (const { url: u, where, dynamic } of urls) {
    if (NAMESPACE_URL.test(u)) continue;
    if (dynamic && !/^https:\/\/[^/]+\//.test(u)) {
      fails.push(`${where}: the host of ${u}… is computed; fetch from a fixed allowed host`);
      continue;
    }
    if (!isAllowedUrl(dynamic ? u + "x" : u)) {
      fails.push(`${where}: ${u}${dynamic ? "…" : ""} is not on the network allowlist (${NETWORK_ALLOWLIST.map((r) => r.host + (r.path ?? "")).join(", ")})`);
      continue;
    }
    const gh = /^https:\/\/cdn\.jsdelivr\.net\/gh\/drnachio\/postext@([^/]+)\/(.+)$/.exec(u);
    if (gh && !dynamic) {
      const repoPath = decodeURIComponent(gh[2]);
      const local = new RegExp(`^cookbook/${slug}/(assets/.+)$`).exec(repoPath);
      if (local ? !sources.assets.includes(local[1]) : repoFileExists && !repoFileExists(repoPath)) {
        fails.push(`${where}: ${repoPath} does not exist in the repo`);
      }
    }
  }
  for (const m of ownCode.matchAll(/\basset\(\s*(['"`])([^'"`\n]+)\1\s*\)/g)) {
    if (!sources.assets.includes(`assets/${m[2]}`)) fails.push(`${at(m.index ?? 0)}: asset('${m[2]}'): no assets/${m[2]} in the recipe folder`);
  }

  // Kit functions the recipe calls.
  const defined = kit ? kitFunctions(kit) : null;
  if (defined) {
    const usedBlocks = new Set<KitBlock>(["core", "fonts", "viewer"]);
    // A function two blocks declare (showBook: cjk and book) is satisfied
    // by either; the message names the last, the one for new recipes.
    for (const [name, blocks] of defined) {
      if (!referencesIdentifier(ownBare, name)) continue;
      const listed = blocks.filter((block) => meta.kit?.includes(block));
      for (const block of listed) usedBlocks.add(block);
      if (!listed.length) {
        fails.push(`script.js: calls ${name}() from the "${blocks[blocks.length - 1]}" kit block, which recipe.json "kit" does not list`);
      }
    }
    for (const [name, needs] of Object.entries(KIT_CALLS)) {
      if (!referencesIdentifier(ownBare, name)) continue;
      for (const block of needs) {
        usedBlocks.add(block);
        if (!meta.kit?.includes(block)) fails.push(`script.js: ${name}() needs the "${block}" kit block, which recipe.json "kit" does not list`);
      }
    }
    for (const block of meta.kit ?? []) {
      if (!usedBlocks.has(block)) warns.push(`recipe.json: the "${block}" kit block is inlined but never called`);
    }
  }
  if (meta.downloads?.pdf && !/\bofferPdf\s*\(/.test(ownBare)) {
    fails.push("script.js: downloads.pdf needs offerPdf(…) (the capture clicks its button)");
  }
  if (!/^const FONTS = \{/m.test(ownCode)) fails.push("script.js: declare every face in `const FONTS = { Family: ['400', '400i'] }`");
  else if (!/\bloadFonts\s*\(\s*FONTS\b/.test(ownBare)) warns.push("script.js: load the faces with `await loadFonts(FONTS, markdown)` before the build");

  // Content files.
  const cjkKit = meta.kit?.includes("cjk") ?? false;
  const arabicKit = meta.kit?.includes("arabic") ?? false;
  let cjkText = false;
  let japaneseText = false;
  let arabicText = false;
  let arabicBook = false;
  // The files this edition sets, whose script decides its fonts and locale:
  // its own language's, else the first sample language's for a slot it
  // lacks. Every file still gets the length, syntax and voice checks.
  const slotOf = (key: string) => key.split(".").slice(0, -1).join(".");
  const inEdition = (key: string): boolean => {
    const lang = key.split(".").pop();
    if (lang === composed.variant) return true;
    const slot = slotOf(key);
    return lang === meta.sample.locales[0] && sources.content[slot ? `${slot}.${composed.variant}` : composed.variant] === undefined;
  };
  for (const [key, text] of Object.entries(sources.content)) {
    const file = `content.${key}.md`;
    const edition = inEdition(key);
    // Chinese and Japanese have no spaces: their characters count, 1.7 (Chinese)
    // or 2.2 (Japanese, whose kana spell out what Chinese leaves to one
    // character) to the word.
    const length = textLength(text);
    if (length.total > LIMITS.contentWords) {
      const chinese = length.cjk - length.japanese;
      const kinds = [chinese ? `${thousands(chinese)} Chinese` : "", length.japanese ? `${thousands(length.japanese)} Japanese` : ""];
      const rates = chinese && length.japanese
        ? `Chinese counts ${CJK_CHARS_PER_WORD} characters to the word, Japanese ${JAPANESE_CHARS_PER_WORD}`
        : `${chinese ? CJK_CHARS_PER_WORD : JAPANESE_CHARS_PER_WORD} characters count as a word`;
      fails.push(length.cjk
        ? `${file}: ${kinds.filter(Boolean).join(" and ")} characters${length.words ? ` and ${thousands(length.words)} words` : ""}, ` +
          `about ${thousands(length.total)} words (at most ${thousands(LIMITS.contentWords)}; ${rates})`
        : `${file}: ${length.words} words (at most ${LIMITS.contentWords})`);
    }
    // Japanese when its kana sentences outweigh the rest: a Chinese page
    // that quotes a Japanese title stays Chinese.
    // A Latin edition that keeps one Japanese sound effect (ドン) stays Latin: the
    // kana must also outweigh its Latin words.
    if (edition && length.japanese * 2 > length.cjk && length.japanese > length.words) japaneseText = true;
    for (const line of malformedResourceEmbeds(text)) fails.push(`${file}: "${line}" is not \`::resource{id="…"}\` (double quotes, id only)`);
    for (const name of markdownConstructs(text).unknown) fails.push(`${file}: ":::${name}" is not a Postext directive (it prints as text)`);
    fails.push(...unquotedFrontmatter(text, file));
    // Original sample prose gets the same voice check as the write-ups
    // (quoted public-domain or CC BY text is left as its authors wrote it).
    // Em dashes are not counted: fiction and verse use them for dialogue.
    if ((meta.credits?.text ?? []).length === 0) {
      const style = styleMessages(file, text, (key.split(".").pop() as Locale) ?? "en", { emDashLimit: 0 });
      fails.push(...style.fails);
      warns.push(...style.warns);
    }
    const odd = nonLatin(text);
    if (edition && odd.cjk.length) cjkText = true;
    // CJK text is set in faces the cjk block loads by slices, on screen and
    // in the PDF; without it, the kit loads the latin file of every face.
    if (odd.cjk.length && !cjkKit) {
      warns.push(`${file}: Chinese, Japanese or Korean text needs the cjk kit block: load its faces with loadCjkFonts(FONTS, markdown) (gotcha cjk-fonts-slices)`);
    }
    const historic = odd.cjk.filter((ch) => isHistoricKana(ch.codePointAt(0) ?? 0));
    if (historic.length) {
      warns.push(`${file}: hentaigana and archaic kana (${historic.slice(0, 8).join(" ")}) are in no file of a Fontsource Japanese face: ` +
        "loadCjkFonts fails on them and the PDF prints boxes; write the modern kana, or set them in a face the recipe ships in its assets (gotcha ja-fonts-kana)");
    }
    // Arabic letters are set from the arabic file of an Arabic face, which
    // loadFonts never fetches: the arabic block does, unless the recipe
    // builds its own FontFace (a face from its assets).
    if (odd.arabic.length) {
      if (edition) arabicText = true;
      // The main sample sets the book's language; a named slot in Arabic is another
      // lettering or a quotation (a manga's Arabic edition behind a button), which keeps it.
      if (edition && mostlyArabic(text) && !slotOf(key)) arabicBook = true;
      if (!arabicKit && !/\bnew\s+FontFace\s*\(/.test(ownBare)) {
        fails.push(`${file}: Arabic text needs an Arabic face: list the arabic kit block and load the faces with ` +
          "loadArabicFonts(FONTS, markdown) after loadFonts (gotcha arabic-fonts-subset)");
      }
    }
    // The kit's PDF providers add a face's latin-ext file for the letters only
    // it has (ō ǎ č †), and fontsourceProvider its greek file (α χ), so those
    // reach the PDF as they reach the screen; the capture's C25 names any
    // face that ships no such file.
    const beyond = odd.other.filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return !isLatinExtOnly(code) && (cjkKit || !isGreek(code));
    });
    if (pdfOutput && beyond.length) {
      const shown = beyond.slice(0, 8).join(" ");
      warns.push(cjkKit
        ? `${file}: characters outside Fontsource latin, latin-ext and the CJK blocks (${shown}) reach the PDF only in a CJK face ` +
          "(cjkPdfProvider takes every file it needs) or a face the pen's own provider serves"
        : `${file}: characters outside Fontsource latin, latin-ext and greek (${shown}) reach the PDF only in a face the pen's own provider serves`);
    }
  }
  if (cjkKit) lintCjk(scan, ownCode, ownBare, postextNames, pdfOutput && cjkText, cjkText, japaneseText, fails, warns);
  if (arabicText) lintArabic(scan, ownBare, arabicKit && pdfOutput, arabicBook, fails);
  // A book bound on its right edge lies open mirrored; the book block's
  // showBook (the cjk block has the same) shows it so. The binding is the
  // engine's (resolvePageBinding): page.binding as written, else 'auto',
  // the right edge for vertical text, for text that runs right to left
  // (direction, else the script of locale) and for a book with a comics
  // section whose comics read right to left (comicReadingDirection:
  // readingDirection as written, else rtl in a Japanese or Traditional
  // Chinese edition, else the art's direction).
  const binding = configString(scan, "page.binding");
  const direction = configString(scan, "direction");
  const locale = configString(scan, "locale");
  const rtl = direction === "rtl" || ((direction === undefined || direction === "auto") &&
    RTL_SCRIPTS.has(tagScript(locale) ?? ""));
  const vertical = configString(scan, "layout.writingMode") === "vertical-rl";
  const comicAsked = configString(scan, "comics.readingDirection") ?? /\breadingDirection\s*:\s*['"](ltr|rtl)['"]/.exec(js)?.[1];
  const comicArtRtl = (configString(scan, "comics.artDirection") ?? /\bartDirection\s*:\s*['"](ltr|rtl)['"]/.exec(js)?.[1]) === "rtl";
  const comicRtl = keys.includes("comics") && (comicAsked === "rtl" || (comicAsked !== "ltr" &&
    (rtl || vertical || COMICS_RTL_SCRIPTS.has(tagScript(locale) ?? "") || comicArtRtl)));
  const rightBound = binding === "right" || ((binding === undefined || binding === "auto") &&
    (vertical || rtl || comicRtl));
  if (rightBound && /\bshowPages\s*\(/.test(ownBare) && !/\bshowBook\s*\(/.test(ownBare)) {
    warns.push("script.js: a right-bound book shows its spreads mirrored with showBook(…) from the book kit block (gotcha cjk-spread-order)");
  }

  // Size.
  if (composed.ownLines > LIMITS.ownLines) fails.push(`script.js: ${composed.ownLines} lines of recipe code (at most ${LIMITS.ownLines})`);
  else if (composed.ownLines > LIMITS.ownLinesWarn[meta.level]) {
    warns.push(`script.js: ${composed.ownLines} lines of recipe code (aim for ≤ ${LIMITS.ownLinesWarn[meta.level]} at level ${meta.level})`);
  }
  const scriptBytes = bytes(js);
  if (scriptBytes > LIMITS.scriptBytes) fails.push(`the composed script weighs ${Math.round(scriptBytes / 1024)} KB (at most ${LIMITS.scriptBytes / 1024} KB)`);
  const prefill = bytes(defineData(composed, { title: "x".repeat(80), description: "x".repeat(320), tags: ["postext"] }));
  if (prefill > LIMITS.prefillBytes) fails.push(`the CodePen prefill weighs ${Math.round(prefill / 1024)} KB (at most 96 KB)`);
  const long = lines.map((line, i) => (!folded.has(i + 1) && [...line].length > LIMITS.lineLength ? i + 1 : 0)).filter(Boolean);
  if (long.length) {
    warns.push(`script.js: ${long.length} line${long.length === 1 ? "" : "s"} over ${LIMITS.lineLength} characters (line ${long.slice(0, 5).join(", ")})`);
  }

  // Level rubric.
  const suggested = staticLevel(js, { apis: [...used], configKeys: keys });
  if (meta.level && Math.abs(meta.level - suggested) >= 2) {
    warns.push(`recipe.json: level ${meta.level}, but the code reads as level ${suggested} (rubric §2.3)`);
  }
  return { fails: [...new Set(fails)], warns: [...new Set(warns)] };
}

/** Japanese families on Fontsource (Noto Serif JP, Zen Antique, Shippori
 *  Mincho, Klee One, Dela Gothic One…). */
const JAPANESE_FACE = /\sJP$|^(?:Zen|Shippori|Klee|Dela Gothic|Kaisei|BIZ UD|M PLUS|Kiwi Maru|Yuji|Sawarabi|Hina Mincho|Murecho|Yusei Magic|Mochiy|Kosugi)\b/;

/** What a recipe listing the `cjk` kit block must do: when its text is
 *  Chinese, Japanese or Korean, hand the PDF the faces' files and tag the
 *  document with its language (a Latin book may list the block for
 *  showBook alone); import what the vertical forms need. A Japanese text
 *  (`japaneseText`: mostly sentences with kana) is tagged 'ja': under a
 *  Chinese tag it would take the Chinese line breaking, punctuation widths
 *  and labels (图 for 図), and be set in Chinese glyph forms. */
function lintCjk(
  scan: ReturnType<typeof scanJs>,
  ownCode: string,
  ownBare: string,
  postextNames: Set<string>,
  cjkPdf: boolean,
  cjkText: boolean,
  japaneseText: boolean,
  fails: string[],
  warns: string[],
): void {
  if (cjkPdf && !/\b(?:cjkPdfProvider|comicPdfProvider)\b/.test(ownBare)) {
    fails.push("script.js: renderToPdf takes fontProvider: cjkPdfProvider (or the comics block's comicPdfProvider; fontsourceProvider embeds only the latin file of a CJK face; gotcha cjk-fonts-slices)");
  }
  const tag = configString(scan, "locale");
  // A literal tag anywhere in the code, or the config's own (also when it
  // is written per edition, t({ … ja: 'ja' })).
  const tagged = /\blocale\s*:\s*(['"`])(zh|ja|ko)([-_][A-Za-z]+)*\1/.test(ownCode)
    || /^(?:zh|ja|ko)(?:[-_]|$)/i.test(tag ?? "");
  if (japaneseText && tagged && tag !== undefined && !/^ja(?:[-_]|$)/i.test(tag)) {
    fails.push(`script.js: the text is Japanese (it is written with kana) but config.locale is '${tag}': write 'ja', which sets the Japanese line breaking, punctuation and labels (gotcha ja-locale-tag)`);
  } else if (japaneseText && !tagged) {
    warns.push("script.js: set config.locale to the text's language ('ja'), not LANG: the tag picks the Japanese conventions and turns hyphenation off (gotcha ja-locale-tag)");
  } else if (cjkText && !tagged) {
    warns.push("script.js: set config.locale to the text's language ('zh-Hans', 'zh-Hant', 'ja'…), not LANG: the tag picks the regional conventions and turns hyphenation off (gotcha cjk-locale-tag)");
  }
  if (japaneseText) {
    // A face named in the Chinese entry of a per-edition table
    // (`t({ … zh: ['Noto Serif SC', …] })`) sets only the Chinese edition.
    const zhOnly = (family: string) => new RegExp(`\\bzh\\s*:\\s*\\[?[^\\]\\n]*['"]${family}['"]`).test(ownCode);
    const families = fontFamilies(penFonts(ownCode, scan));
    const chinese = families.filter((family) => /\s(?:SC|TC|HK)$/.test(family) && !zhOnly(family));
    // A pen with an edition per language lists the Chinese edition's face
    // beside the Japanese one; only a pen with no Japanese face sets kana in it.
    if (chinese.length && !families.some((family) => JAPANESE_FACE.test(family))) {
      warns.push(`script.js: Japanese text with ${chinese.join(", ")} in FONTS: a Chinese face draws the kanji in Chinese forms (直, 骨, 角) and the kana in its own design; ` +
        "set the Japanese in a Japanese face (Noto Serif JP, Noto Sans JP, Shippori Mincho) and keep the Chinese one for Chinese quotations (gotcha ja-fonts-kana)");
    }
  }
  if (/\bloadCjkFonts\s*\([^;]*\bvertical\s*:\s*true/.test(ownBare) && !postextNames.has("loadVerticalAlternates")) {
    fails.push("script.js: loadCjkFonts(…, { vertical: true }) needs `loadVerticalAlternates` imported from postext");
  }
}

/** What a recipe whose text holds Arabic must do: hand the PDF the arabic
 *  files (`arabicPdf`: it lists the arabic block and outputs a PDF), and,
 *  when the text is mostly Arabic, tag the document with an Arabic-script
 *  language. The tag turns the book right to left (direction 'auto'), binds
 *  it on the right, picks the digits and the strings; a Latin page that
 *  quotes Arabic keeps its own language. */
function lintArabic(
  scan: ReturnType<typeof scanJs>,
  ownBare: string,
  arabicPdf: boolean,
  arabicBook: boolean,
  fails: string[],
): void {
  if (arabicPdf && !/\b(?:arabicPdfProvider|comicPdfProvider)\b/.test(ownBare)) {
    fails.push("script.js: renderToPdf takes fontProvider: arabicPdfProvider (or the comics block's comicPdfProvider; fontsourceProvider embeds only the latin file of an Arabic face; gotcha arabic-fonts-subset)");
  }
  const script = tagScript(configString(scan, "locale"));
  if (arabicBook && script !== "Arab" && script !== "Aran") {
    fails.push("script.js: set config.locale to the text's language ('ar', 'ar-EG', 'ar-MA'…), not LANG: the tag sets the text right to left, binds the book on the right and picks its digits (gotcha arabic-locale-tag)");
  }
}

/** True when some object literal in the recipe's own code has `level: 1`
 *  and a `breakBefore` key. */
function hasLevelOneBreak(scan: ReturnType<typeof scanJs>, isFolded: (offset: number) => boolean): boolean {
  for (const m of scan.bare.matchAll(/\blevel\s*:\s*1(?![\d.])/g)) {
    const offset = m.index ?? 0;
    if (isFolded(offset)) continue;
    let depth = 0;
    let open = -1;
    for (let i = offset; i >= 0; i--) {
      const c = scan.bare[i];
      if (c === "}" || c === "]" || c === ")") depth++;
      else if (c === "{" || c === "[" || c === "(") {
        if (depth === 0) {
          open = i;
          break;
        }
        depth--;
      }
    }
    if (open === -1 || scan.bare[open] !== "{") continue;
    const close = matchBracket(scan.bare, open);
    if (/\bbreakBefore\s*:/.test(scan.bare.slice(open, close + 1))) return true;
  }
  return false;
}

// ─── Assets ─────────────────────────────────────────────────────────────────

/** Pixel size of a PNG, JPEG, GIF or WebP, or null. */
export function imageSize(data: Uint8Array): { width: number; height: number } | null {
  const u16be = (i: number) => (data[i] << 8) | data[i + 1];
  const u16le = (i: number) => data[i] | (data[i + 1] << 8);
  const u24le = (i: number) => data[i] | (data[i + 1] << 8) | (data[i + 2] << 16);
  const u32be = (i: number) => ((data[i] << 24) >>> 0) + (data[i + 1] << 16) + (data[i + 2] << 8) + data[i + 3];
  const ascii = (i: number, n: number) => String.fromCharCode(...data.subarray(i, i + n));
  if (data.length > 24 && data[0] === 0x89 && ascii(1, 3) === "PNG") return { width: u32be(16), height: u32be(20) };
  if (data.length > 10 && ascii(0, 3) === "GIF") return { width: u16le(6), height: u16le(8) };
  if (data.length > 30 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    const chunk = ascii(12, 4);
    if (chunk === "VP8 ") return { width: u16le(26) & 0x3fff, height: u16le(28) & 0x3fff };
    if (chunk === "VP8L") {
      const b = data.subarray(21, 25);
      return { width: 1 + (((b[1] & 0x3f) << 8) | b[0]), height: 1 + (((b[3] & 0xf) << 10) | (b[2] << 2) | ((b[1] & 0xc0) >> 6)) };
    }
    if (chunk === "VP8X") return { width: 1 + u24le(24), height: 1 + u24le(27) };
    return null;
  }
  if (data[0] === 0xff && data[1] === 0xd8) {
    let i = 2;
    while (i + 9 < data.length) {
      if (data[i] !== 0xff) return null;
      const marker = data[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: u16be(i + 7), height: u16be(i + 5) };
      }
      i += 2 + u16be(i + 2);
    }
  }
  return null;
}

function lintAssets(slug: string, meta: RecipeMeta, sources: RecipeSources): LintReport {
  const fails: string[] = [];
  const warns: string[] = [];
  const dir = recipeDir(slug);
  let total = 0;
  const credited = new Set((meta.credits?.images ?? []).map((c) => (c.file ? `assets/${c.file.replace(/^assets\//, "")}` : "")));
  for (const file of sources.assets) {
    const data = fs.readFileSync(path.join(dir, file));
    total += data.length;
    if (data.length > LIMITS.assetBytes) fails.push(`${file}: ${Math.round(data.length / 1024)} KB (at most 400 KB per asset)`);
    if (/\.(jpe?g|png|webp|gif)$/i.test(file)) {
      const size = imageSize(data);
      if (!size) warns.push(`${file}: could not read the image size`);
      else if (Math.max(size.width, size.height) > LIMITS.imageLongSide) {
        fails.push(`${file}: ${size.width}×${size.height} px (long side at most ${LIMITS.imageLongSide} px)`);
      }
    } else if (/\.svg$/i.test(file)) {
      const svg = data.toString("utf-8");
      if (/<marker\b|<filter\b|<mask\b|\sfilter=|\smask=/.test(svg)) fails.push(`${file}: no <marker>, filters or masks in SVG (they fall back to raster)`);
    }
    if (!credited.has(file)) fails.push(`${file}: every asset needs a credits.images entry with "file": "${file.replace(/^assets\//, "")}"`);
  }
  if (total > LIMITS.assetsBytes) fails.push(`assets/: ${Math.round(total / 1024)} KB in all (at most 2 MB)`);
  for (const file of credited) {
    if (file && !sources.assets.includes(file)) fails.push(`credits.images: ${file} does not exist`);
  }
  return { fails, warns };
}

// ─── lintRecipe ─────────────────────────────────────────────────────────────

/** The released postext and postext-pdf versions (packages/*\/package.json). */
export function readReleasedEngine(): { postext?: string; postextPdf?: string } {
  const version = (pkg: string) => {
    try {
      return (JSON.parse(fs.readFileSync(path.join(REPO_DIR, "packages", pkg, "package.json"), "utf-8")) as { version?: string }).version;
    } catch {
      return undefined;
    }
  };
  return { postext: version("postext"), postextPdf: version("postext-pdf") };
}

/** Whether the repository tests take a draft pinned to the next release
 *  as a preview, the way `pnpm cookbook lint --engine local` does
 *  (`COOKBOOK_PREVIEW=1`, on the branch that writes the recipe). Off by
 *  default: a draft in develop pins a released engine and has its capture,
 *  so a recipe for a new feature lands in a PR after the release (#201). */
export function previewDraftsAllowed(env: Record<string, string | undefined> = process.env): boolean {
  return env.COOKBOOK_PREVIEW === "1";
}

export interface LintRecipeOptions {
  registry?: Registry;
  knownSlugs?: string[];
  released?: { postext?: string; postextPdf?: string };
  /** `--engine local`: a draft may pin the next release (validate.ts). */
  preview?: boolean;
}

/** Everything `pnpm cookbook lint <slug>` checks: recipe.json, every
 *  composed edition, the assets, and both write-ups. */
export function lintRecipe(slug: string, options: LintRecipeOptions = {}): RecipeLintReport {
  const fails: string[] = [];
  const warns: string[] = [];
  const report = (): RecipeLintReport => ({ slug, fails: [...new Set(fails)], warns: [...new Set(warns)] });

  let meta: RecipeMeta;
  try {
    meta = readRecipeMeta(slug);
  } catch (error) {
    fails.push(`recipe.json: ${(error as Error).message}`);
    return report();
  }
  let registry: Registry;
  try {
    registry = options.registry ?? loadRegistry();
  } catch (error) {
    fails.push((error as Error).message);
    return report();
  }
  const knownSlugs = options.knownSlugs ?? listRecipeSlugs();
  fails.push(
    // Worded like scripts/cookbook/lint.ts, which also validates recipe.json and merges equal findings.
    ...validateRecipeMeta(meta, slug, registry, { knownSlugs, released: options.released ?? readReleasedEngine(), preview: options.preview }).map(
      (e) => `recipe.json › ${e}`,
    ),
  );
  if (!Array.isArray(meta.sample?.locales) || !Array.isArray(meta.kit)) return report();

  const sources = readRecipeSources(slug);
  if (!sources.script) fails.push("script.js: missing");
  for (const locale of meta.sample.locales) {
    if (sources.content[locale] === undefined) fails.push(`content.${locale}.md: missing (sample.locales lists "${locale}")`);
  }
  for (const key of Object.keys(sources.content)) {
    const locale = key.split(".").pop() as SampleLocale;
    if (!meta.sample.locales.includes(locale)) warns.push(`content.${key}.md: "${locale}" is not in sample.locales, so no edition uses it`);
  }

  // Every edition composes and lints.
  const kit = readKit();
  const composed: Partial<Record<SampleLocale, ComposedPen>> = {};
  for (const variant of meta.sample.locales) {
    try {
      composed[variant] = composePen(sources, meta, variant, { kit });
    } catch (error) {
      if (!(error instanceof ComposeError)) throw error;
      fails.push(`script.js: ${error.message}`);
      continue;
    }
    const result = lintPen(composed[variant], meta, sources, {
      kit,
      repoFileExists: (repoPath) => fs.existsSync(path.join(REPO_DIR, repoPath)),
    });
    fails.push(...result.fails);
    warns.push(...result.warns);
  }
  const assets = lintAssets(slug, meta, sources);
  fails.push(...assets.fails);
  warns.push(...assets.warns);

  // Fonts: one credit per FONTS family.
  const families = fontFamilies(penFonts(sources.script));
  const credited = new Set((meta.credits?.fonts ?? []).map((f) => f.family));
  for (const family of families) if (!credited.has(family)) fails.push(`credits.fonts: add "${family}" (it is in FONTS)`);
  for (const family of credited) if (!families.includes(family)) fails.push(`credits.fonts: "${family}" is not in FONTS`);

  // Write-ups.
  const headings = registry.taxonomy.sections;
  const excerpts: Partial<Record<Locale, string[]>> = {};
  for (const locale of LOCALES) {
    const writeup = readWriteup(slug, locale, headings);
    if (!writeup) {
      fails.push(`${locale}.mdx is missing (${locale === "zh" || locale === "ca" || locale === "ar" || locale === "ja" ? `the ${locale} page shows the English write-up meanwhile` : `the ${locale} page would 404`})`);
      continue;
    }
    fails.push(...writeup.issues);
    const fm = writeup.frontmatter;
    const style = styleMessages(`${locale}.mdx`, [fm.title, fm.summary, fm.plain ?? "", fm.description ?? "", fm.question ?? "", writeup.body].join("\n\n"), locale);
    fails.push(...style.fails);
    warns.push(...style.warns);
    const refs = writeupRefs(writeup.body);
    excerpts[locale] = refs.excerpts;
    const pen = composed[variantFor(meta, locale)];
    for (const region of refs.excerpts) {
      if (pen && !pen.ranges.regions[region]) fails.push(`${locale}.mdx: <Excerpt region="${region}"> names no #region in script.js`);
    }
    for (const id of refs.gotchas) if (!registry.gotchas[id]) fails.push(`${locale}.mdx: <Gotcha id="${id}"> is not in gotchas.json`);
    for (const id of refs.features) if (!registry.features[id]) fails.push(`${locale}.mdx: <Feature id="${id}"> is not in features.json`);
    for (const other of refs.recipes) {
      if (!knownSlugs.includes(other)) fails.push(`${locale}.mdx: <RecipeLink slug="${other}"> names no recipe`);
    }
    for (const link of refs.links) {
      if (!link.startsWith(`/${locale}/`)) fails.push(`${locale}.mdx: ${link} must use the /${locale}/ prefix`);
      else if (link.startsWith(`/${locale}/docs/`) && !docLinkExists(link)) fails.push(`${locale}.mdx: ${link} does not resolve`);
      else if (/^\/(en|es|ca|zh|ja|ar)\/cookbook\/([a-z0-9-]+)/.test(link)) {
        const target = /^\/(en|es|ca|zh|ja|ar)\/cookbook\/([a-z0-9-]+)/.exec(link)?.[2] ?? "";
        if (!knownSlugs.includes(target)) fails.push(`${locale}.mdx: ${link} names no recipe`);
      }
    }
    const hero = [meta.capture?.hero].flat();
    for (const page of refs.pages) {
      if (!Number.isInteger(page) || page < 1) fails.push(`${locale}.mdx: page={${page}} is not a page number`);
      else if (Array.isArray(meta.capture?.pages) && !meta.capture.pages.includes(page) && !hero.includes(page)) {
        fails.push(`${locale}.mdx: page ${page} is not among capture.pages`);
      }
    }
  }
  for (const locale of LOCALES) {
    const own = excerpts[locale];
    if (locale === "en" || !excerpts.en || !own || excerpts.en.join() === own.join()) continue;
    fails.push(`en.mdx and ${locale}.mdx must show the same <Excerpt> regions in the same order (${excerpts.en.join(", ")} / ${own.join(", ")})`);
  }
  return report();
}

/** Lints every recipe (or the given ones) plus the rules across recipes. */
export function lintAll(slugs?: string[], { preview = false }: { preview?: boolean } = {}): RecipeLintReport[] {
  const all = listRecipeSlugs();
  const released = readReleasedEngine();
  let registry: Registry | undefined;
  try {
    registry = loadRegistry();
  } catch {
    registry = undefined; // each report says the registry is missing
  }
  const reports = (slugs ?? all).map((slug) => lintRecipe(slug, { registry, knownSlugs: all, released, preview }));
  const metas: { slug: string; meta: RecipeMeta }[] = [];
  for (const slug of all) {
    try {
      metas.push({ slug, meta: readRecipeMeta(slug) });
    } catch {
      // reported by lintRecipe
    }
  }
  for (const error of validateRecipeSet(metas)) {
    const slug = error.slice(0, error.indexOf(":"));
    const target = reports.find((r) => r.slug === slug);
    if (target) target.fails.push(error.slice(slug.length + 2));
  }
  return reports;
}
