// Which script a recipe's text is in (Latin, CJK, kana, Arabic, Greek),
// and the CJK and Arabic checks of a pen (#1276: split out of lint.ts).
import { scanJs, configString, fontFamilies, penFonts } from '../detect.ts';

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
export function isHistoricKana(code: number): boolean {
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
export function isLatinExtOnly(code: number): boolean {
  if (!((code >= 0x100 && code <= 0x2ff) || (code >= 0x1e00 && code <= 0x1eff))) return false;
  return !isLatin(code);
}

/** Whether a code point is in Fontsource's `greek` file (the Greek and
 *  Coptic block): what the kit's PDF provider adds for a face that ships
 *  it. */
export function isGreek(code: number): boolean {
  return code >= 0x370 && code <= 0x3ff;
}

/** Characters outside Fontsource's `latin` subset (what a PDF recipe
 *  embeds), split into those in the CJK blocks, those in the Arabic blocks
 *  and the rest. */
export function nonLatin(text: string): { other: string[]; cjk: string[]; arabic: string[] } {
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
export function mostlyArabic(text: string): boolean {
  const arabic = text.match(/(?=\p{L})\p{Script=Arabic}/gu)?.length ?? 0;
  const latin = text.match(/\p{Script=Latin}/gu)?.length ?? 0;
  return arabic > latin;
}

/** Scripts written right to left, as the engine's `directionOf` reads a
 *  locale (packages/postext/src/hyphenation/locale.ts; the historic ones left out). */
export const RTL_SCRIPTS = new Set(["Arab", "Aran", "Hebr", "Syrc", "Thaa", "Nkoo", "Adlm", "Rohg", "Mand", "Samr"]);

/** Scripts whose readers read comics right to left, as the engine's
 *  `comicsLocaleDirection` reads a locale: Japanese ('ja' → 'Jpan') and
 *  Traditional Chinese ('zh-Hant', 'zh-TW', 'zh-HK' → 'Hant'). */
export const COMICS_RTL_SCRIPTS = new Set(["Jpan", "Hant"]);

/** The script a language tag names or implies once maximised ('ar' →
 *  'Arab', 'ur' → 'Arab', 'ks-Deva' → 'Deva'), or undefined. */
export function tagScript(tag: string | undefined): string | undefined {
  if (!tag) return undefined;
  try {
    return new Intl.Locale(tag.trim().replace(/_/g, "-")).maximize().script;
  } catch {
    return undefined;
  }
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
export function lintCjk(
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
export function lintArabic(
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
