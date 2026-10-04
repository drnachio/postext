import type { CjkRegion, DigitSystem, HyphenationLocale, LocaleTag, NumeralsSetting } from './types';

/** The languages whose hyphenation patterns ship with the engine. */
export const HYPHENATION_LOCALES: readonly HyphenationLocale[] = Object.freeze([
  'en-us', 'es', 'fr', 'de', 'it', 'pt', 'ca', 'nl',
] as const);

const BUNDLED = new Set<string>(HYPHENATION_LOCALES);

/** The primary language subtag of a BCP 47 tag, lower-cased (`'pt_BR'` →
 *  `'pt'`, `'en-us'` → `'en'`). The key of the built-in string tables. */
export function languageOf(tag: unknown): string {
  return isTag(tag) ? tag.trim().toLowerCase().split(/[-_]/)[0] ?? '' : '';
}

/** A tag worth matching: a non-blank string. A missing, blank or non-string
 *  tag (an untyped caller passing an unset `config.locale`) counts as unset. */
function isTag(tag: unknown): tag is string {
  return typeof tag === 'string' && tag.trim() !== '';
}

/** A configured tag, trimmed, or `undefined` when it is missing, blank or not
 *  a string: such a tag counts as unset wherever a locale falls back. */
export function presentTag(tag: unknown): string | undefined {
  return isTag(tag) ? tag.trim() : undefined;
}

/** Languages set without hyphenation: Chinese, Japanese and Korean break
 *  lines between characters, and no patterns ship for them. */
const CJK_LANGUAGES = new Set(['zh', 'ja', 'ko']);

/** Whether `tag` names Chinese, Japanese or Korean (`'zh-Hant'`, `'ja-JP'`,
 *  `'ko'`, in any case, with `-` or `_`). Such a document needs no
 *  hyphenation patterns: hyphenation is off unless the author turns it on
 *  and names a language for the Latin words. */
export function isCjkLanguage(tag: unknown): boolean {
  return isTag(tag) && CJK_LANGUAGES.has(languageOf(tag));
}

/** Whether `tag` names a language written in a right-to-left script once
 *  maximised (`'ar'`, `'fa-IR'`, `'ur'`, `'he'`, `'yi'`, `'ks-Arab'`); not
 *  `'ks-Deva'` or `'az'` (Latin). See {@link directionOf}. */
function isRightToLeftLanguage(tag: unknown): boolean {
  return directionOf(tag) === 'rtl';
}

/**
 * Whether `tag` names a language set without hyphenation: Chinese,
 * Japanese and Korean ({@link isCjkLanguage}), and the languages written in
 * a right-to-left script — Arabic, Persian, Urdu, Hebrew, Yiddish… An
 * Arabic word is never divided at a line end: its letters join, and the
 * line is justified with the spaces and kashida instead (arabic-typography
 * §5); Hebrew books do not divide words either. No patterns ship for any
 * of them, and asking for none is not a fallback worth reporting.
 */
export function isUnhyphenatedLanguage(tag: unknown): boolean {
  return isCjkLanguage(tag) || isRightToLeftLanguage(tag);
}

/** `Intl.Locale(tag).maximize()`, memoised; `undefined` for a tag the
 *  runtime rejects (or a runtime without `Intl.Locale`). */
const maximized = new Map<string, Intl.Locale | null>();
function maximize(tag: string): Intl.Locale | undefined {
  const key = tag.trim().replace(/_/g, '-');
  let hit = maximized.get(key);
  if (hit === undefined) {
    try {
      hit = typeof Intl.Locale === 'function' ? new Intl.Locale(key).maximize() : null;
    } catch {
      hit = null;
    }
    maximized.set(key, hit);
  }
  return hit ?? undefined;
}

/** The script of a tag, as `Intl.Locale(tag).maximize()` reads it: `'Hans'`
 *  for `zh`, `zh-CN`, `zh-SG`; `'Hant'` for `zh-TW`, `zh-HK`, `zh-MO` and
 *  `zh-Hant`; `'Latn'` for `en`. `undefined` for a missing or invalid tag. */
export function localeScript(tag: unknown): string | undefined {
  return isTag(tag) ? maximize(tag)?.script : undefined;
}

/** Scripts written from right to left (ISO 15924 codes): Arabic (and its
 *  Nastaliq variant), Hebrew, Syriac, Thaana, N'Ko, Adlam, Hanifi Rohingya,
 *  Mandaic, Samaritan, Mende Kikakui, Garay, and the historic ones
 *  (Imperial Aramaic, Avestan, Chorasmian, Cypriot, Elymaic, Hatran, Old
 *  Hungarian, Kharoshthi, Lydian, Manichaean, Old North and South Arabian,
 *  Nabataean, Old Turkic, Old Uyghur, Palmyrene, Inscriptional and Psalter
 *  Pahlavi, Phoenician, Parthian, Sogdian and Old Sogdian, Yezidi). */
const RTL_SCRIPTS = new Set([
  'Arab', 'Aran', 'Hebr', 'Syrc', 'Thaa', 'Nkoo', 'Adlm', 'Rohg', 'Mand', 'Samr', 'Mend', 'Gara',
  'Armi', 'Avst', 'Chrs', 'Cprt', 'Elym', 'Hatr', 'Hung', 'Khar', 'Lydi', 'Mani', 'Narb', 'Sarb',
  'Nbat', 'Orkh', 'Ougr', 'Palm', 'Phli', 'Phlp', 'Phnx', 'Prti', 'Sogd', 'Sogo', 'Yezi',
]);

/** The direction text in `tag`'s language runs, from the script the tag
 *  names or implies once maximised (`localeScript`): `'rtl'` for Arabic
 *  (`ar`, `fa`, `ur`, `ps`, `ug`, `az-Arab`), Hebrew (`he`, `yi`), Syriac,
 *  Thaana (`dv`), N'Ko, Adlam (`ff-Adlm`) and the other right-to-left
 *  scripts; `'ltr'` for every other tag, and for a missing or invalid
 *  one. */
export function directionOf(tag: unknown): 'ltr' | 'rtl' {
  const script = localeScript(tag);
  return script !== undefined && RTL_SCRIPTS.has(script) ? 'rtl' : 'ltr';
}

/** The typographic region of a Chinese tag, which decides its typographic
 *  defaults (clreq §1.2: rules follow the region, not the script): CN, SG
 *  and MY are `'mainland'`, TW `'taiwan'`, HK and MO `'hongkong'`; a tag
 *  without a region follows its script (`zh-Hant` → `'taiwan'`, `zh` and
 *  `zh-Hans` → `'mainland'`). `undefined` for any other language. */
export function cjkRegionOf(tag: unknown): CjkRegion | undefined {
  if (!isTag(tag) || languageOf(tag) !== 'zh') return undefined;
  const loc = maximize(tag);
  switch (loc?.region) {
    case 'CN': case 'SG': case 'MY': return 'mainland';
    case 'TW': return 'taiwan';
    case 'HK': case 'MO': return 'hongkong';
    default: return loc?.script === 'Hant' ? 'taiwan' : 'mainland';
  }
}

/** The script of a Chinese tag once maximised: `'Hant'` for `zh-TW`,
 *  `zh-HK`, `zh-MO` and `zh-Hant`, `'Hans'` for every other Chinese tag
 *  (`zh`, `zh-CN`, `zh-SG`, `zh-Hans`); `undefined` for any other
 *  language. */
export function chineseScriptOf(tag: unknown): 'Hans' | 'Hant' | undefined {
  if (!isTag(tag) || languageOf(tag) !== 'zh') return undefined;
  return localeScript(tag) === 'Hant' ? 'Hant' : 'Hans';
}

/** The key of the built-in string tables for a tag: `'zh-hans'` or
 *  `'zh-hant'` for Chinese (Simplified and Traditional need different
 *  characters: 图/圖, 续/續, 见/見), else the bare language
 *  ({@link languageOf}). */
export function stringsKeyOf(tag: unknown): string {
  const script = chineseScriptOf(tag);
  if (script) return script === 'Hant' ? 'zh-hant' : 'zh-hans';
  return languageOf(tag);
}

/** A BCP 47 tag in its canonical case (`'zh-hant-tw'` → `'zh-Hant-TW'`,
 *  `'PT-br'` → `'pt-BR'`, `'en_us'` → `'en-US'`), script and region kept;
 *  `undefined` for a missing, blank or malformed tag. The form HTML `lang`,
 *  PDF `/Lang` and a Sandbox permalink's `lang=` carry. */
export function canonicalLocaleTag(tag: unknown): string | undefined {
  if (!isTag(tag)) return undefined;
  try {
    return Intl.getCanonicalLocales(tag.trim().replace(/_/g, '-'))[0];
  } catch {
    return undefined;
  }
}

/** The `lang` a renderer declares for a resolved document (the HTML root,
 *  the canvas context): its language in canonical form (`zh-Hant-TW`,
 *  `ar-EG`), from `locale`, else the hyphenation tag. Only two kinds of
 *  document declare one, so the output of every other document is
 *  unchanged:
 *  - Chinese, Japanese and Korean: the browser picks regional glyph forms
 *    from it (Han characters unified in Unicode, punctuation set in the
 *    corner or the centre of the em box);
 *  - languages written right to left (Arabic, Persian, Urdu, Hebrew…): the
 *    font's language-specific forms (`locl`: the Urdu and Persian digits
 *    and letter shapes of a shared Arabic font) and the fallback font
 *    follow it, and assistive technology reads the text in its language. */
export function renderLangOf(config: {
  locale?: string;
  bodyText?: { hyphenation?: { tag?: string; locale?: string } };
} | undefined): string | undefined {
  const h = config?.bodyText?.hyphenation;
  const tag = presentTag(config?.locale) ?? presentTag(h?.tag) ?? presentTag(h?.locale);
  return isCjkLanguage(tag) || isRightToLeftLanguage(tag) ? canonicalLocaleTag(tag) : undefined;
}

/**
 * The entry of a built-in string table for `tag`, keyed by
 * {@link stringsKeyOf}: the tag's own, then — for Traditional Chinese — the
 * Simplified one, then English (`en`). A table only lists the languages it
 * has strings for.
 */
export function stringsFor<T>(table: Readonly<Record<string, T>>, tag: unknown): T {
  const key = stringsKeyOf(tag);
  return table[key] ?? (key === 'zh-hant' ? table['zh-hans'] : undefined) ?? table.en!;
}

/** A document language the engine has built-in strings for (figure and
 *  table names, continuation marks, index labels), with its name in the
 *  language itself. */
export interface DocumentLanguage {
  tag: string;
  name: string;
}

/** The document languages with built-in strings, in the order a language
 *  picker lists them: the eight hyphenation languages, then Chinese in
 *  Simplified characters, in Traditional characters (Taiwan) and in
 *  Traditional characters as set in Hong Kong, then Arabic — bare, as set
 *  in Egypt and as set in Morocco. The strings are the same in the three
 *  Arabic entries; the region decides what a regional default reads from
 *  the tag (digits: Arabic-Indic ٠–٩ in the Mashriq, European 0–9 in the
 *  Maghreb; month names in dates). */
export const DOCUMENT_LANGUAGES: readonly DocumentLanguage[] = Object.freeze([
  { tag: 'en-us', name: 'English' },
  { tag: 'es', name: 'Español' },
  { tag: 'fr', name: 'Français' },
  { tag: 'de', name: 'Deutsch' },
  { tag: 'it', name: 'Italiano' },
  { tag: 'pt', name: 'Português' },
  { tag: 'ca', name: 'Català' },
  { tag: 'nl', name: 'Nederlands' },
  { tag: 'zh-Hans', name: '中文（简体）' },
  { tag: 'zh-Hant', name: '中文（繁體）' },
  { tag: 'zh-Hant-HK', name: '中文（香港）' },
  { tag: 'ar', name: 'العربية' },
  { tag: 'ar-EG', name: 'العربية (مصر)' },
  { tag: 'ar-MA', name: 'العربية (المغرب)' },
].map((l) => Object.freeze(l)));

/**
 * The bundled hyphenation locale for a BCP 47 language tag, or `undefined`
 * when no patterns ship for its language. Case, `_` separators and any
 * region, script or variant subtags are ignored: `'es-ES'`, `'es_MX'` and
 * `'es-419'` give `'es'`, `'pt-BR'` gives `'pt'`, and every English tag
 * (`'en'`, `'en-GB'`) gives `'en-us'`, the only English patterns.
 */
export function matchHyphenationLocale(tag: string): HyphenationLocale | undefined {
  if (!isTag(tag)) return undefined;
  if (BUNDLED.has(tag)) return tag as HyphenationLocale;
  const t = tag.trim().toLowerCase().replace(/_/g, '-');
  if (BUNDLED.has(t)) return t as HyphenationLocale;
  const lang = languageOf(t);
  if (lang === 'en') return 'en-us';
  return BUNDLED.has(lang) ? (lang as HyphenationLocale) : undefined;
}

/** Tags already reported as unsupported: each is reported once. */
const warnedTags = new Set<string>();

/**
 * {@link matchHyphenationLocale}, falling back to `'en-us'` for a language
 * with no bundled patterns. The fallback is reported once per tag on the
 * console, since the text is then hyphenated with another language's rules
 * (Chinese, Japanese, Korean and the right-to-left languages excepted: they
 * are set without hyphenation, see {@link isUnhyphenatedLanguage});
 * `warn: false` skips the report (hyphenation is off, so no text uses the
 * patterns). A missing or blank tag gives `'en-us'` silently.
 */
export function hyphenationLocaleFor(tag: LocaleTag, warn = true): HyphenationLocale {
  if (!isTag(tag)) return 'en-us';
  const match = matchHyphenationLocale(tag);
  if (match) return match;
  // Chinese, Japanese, Korean, Arabic, Hebrew… need no patterns: nothing
  // to report (the body text resolves hyphenation off for them).
  if (isUnhyphenatedLanguage(tag)) return 'en-us';
  if (warn && !warnedTags.has(tag)) {
    warnedTags.add(tag);
    console.warn(
      `[postext] No hyphenation patterns for locale "${tag}"; hyphenating with en-us. `
      + `Bundled locales: ${HYPHENATION_LOCALES.join(', ')}.`,
    );
  }
  return 'en-us';
}

// ---------------------------------------------------------------------------
// Content locales: which of a book's languages serves a locale asked for.

/** Languages written in more than one script, where the script tells two
 *  editions apart: a Traditional Chinese book is not a Simplified one,
 *  whatever the language subtag says. */
const SCRIPT_DISTINCT_LANGUAGES = new Set(['zh', 'sr', 'uz', 'pa', 'az', 'bs', 'mn', 'ks', 'sd', 'ku']);

interface LocaleParts {
  /** The canonical tag, lower-cased (the key of an exact match). */
  tag: string;
  language: string;
  /** Script and region of the maximised tag (`zh-TW` → `Hant`, `TW`). */
  script: string;
  region: string;
  /** Whether the tag itself names a region. */
  hasRegion: boolean;
}

const partsCache = new Map<string, LocaleParts | null>();

function localeParts(tag: string): LocaleParts | null {
  const hit = partsCache.get(tag);
  if (hit !== undefined) return hit;
  let parts: LocaleParts | null = null;
  const canonical = canonicalLocaleTag(tag);
  if (canonical) {
    try {
      const locale = new Intl.Locale(canonical);
      // No likely-subtags data: the tag as written.
      const max = maximize(canonical) ?? locale;
      parts = {
        tag: canonical.toLowerCase(),
        language: locale.language.toLowerCase(),
        script: max.script ?? '',
        region: max.region ?? '',
        hasRegion: !!locale.region,
      };
    } catch {
      parts = null;
    }
  }
  if (partsCache.size > 512) partsCache.clear();
  partsCache.set(tag, parts);
  return parts;
}

/**
 * Whether two locale tags name the same content language: the same
 * language, and for a language written in several scripts (Chinese,
 * Serbian…) the same script once the tags are maximised. `zh-TW` is
 * `zh-Hant`, `zh` is `zh-Hans`, `es-ES` is `es`; `zh-Hans` is never
 * `zh-Hant`. Case and `_` separators are ignored; a missing or blank tag
 * matches nothing.
 */
export function sameContentLocale(a: unknown, b: unknown): boolean {
  const pa = isTag(a) ? localeParts(a) : null;
  const pb = isTag(b) ? localeParts(b) : null;
  if (!pa || !pb) {
    const la = languageOf(a);
    return la !== '' && la === languageOf(b);
  }
  if (pa.language !== pb.language) return false;
  return !SCRIPT_DISTINCT_LANGUAGES.has(pa.language) || pa.script === pb.script;
}

/** How well `candidate` serves `wanted`: 0 not at all, then 1 for the
 *  language only (in another script: a Taiwanese reader of a book keyed by
 *  bare `zh` reads the Chinese rather than the manifest's own language), the
 *  same script in a region of its own, the same script and no region, the
 *  same script and the region `wanted` names (once maximised), and the same
 *  tag. */
function localeMatchScore(candidate: string, wanted: string): number {
  const pc = isTag(candidate) ? localeParts(candidate) : null;
  const pw = isTag(wanted) ? localeParts(wanted) : null;
  if (!pc || !pw) {
    if (!isTag(candidate) || !isTag(wanted)) return 0;
    const c = candidate.trim().toLowerCase();
    const w = wanted.trim().toLowerCase();
    if (c === w) return 5;
    const lc = languageOf(c);
    if (lc === '' || lc !== languageOf(w)) return 0;
    return c === lc ? 3 : 1;
  }
  if (pc.tag === pw.tag) return 5;
  if (pc.language !== pw.language) return 0;
  if (pc.script === pw.script) {
    // A region counts when the reader names one: `zh-TW` reads `zh-Hant`
    // (Taiwan once maximised), while a bare `pt` does not prefer `pt-BR`
    // over `pt-PT`.
    if (pw.hasRegion && pc.region === pw.region) return 4;
    return pc.hasRegion ? 2 : 3;
  }
  return 1;
}

/**
 * The one of `candidates` that serves `wanted`, or undefined when none is
 * in its language. An exact tag (case aside) wins; then, for a tag naming
 * a region, the one that maximises to the same language, script and region
 * (`zh-TW` finds `zh-Hant`, `en-US` finds `en`); then one in the same
 * script (a tag with no region first: `zh` finds `zh-Hans`); then any tag
 * of the language, in another script too: `zh-Hant` finds `zh-Hans` (or a
 * bare `zh`) only when no candidate is written in Traditional characters.
 * Ties keep the order of `candidates`. Whether two tags are the same
 * edition is {@link sameContentLocale}'s question, which the script
 * always answers.
 */
export function matchContentLocale(candidates: readonly string[], wanted: string): string | undefined {
  let best: string | undefined;
  let bestScore = 0;
  for (const c of candidates) {
    const score = localeMatchScore(c, wanted);
    if (score > bestScore) {
      best = c;
      bestScore = score;
      if (score === 5) break;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Digits: which digit system a document's generated numbers are written in.

/** The Arabic-speaking Maghreb, where books print European digits (alreq
 *  §Numbers): Morocco, Algeria, Tunisia, Libya, Mauritania and Western
 *  Sahara. */
const MAGHREB_REGIONS = new Set(['MA', 'DZ', 'TN', 'LY', 'MR', 'EH']);

const DIGIT_SYSTEMS = new Set<string>(['latn', 'arab', 'arabext']);

/** Whether `value` names a digit system (`'latn'`, `'arab'`, `'arabext'`). */
export function isDigitSystem(value: unknown): value is DigitSystem {
  return typeof value === 'string' && DIGIT_SYSTEMS.has(value);
}

/**
 * The digits a book in `tag` prints its page numbers, list and note numbers
 * and counters in (`PostextConfig.numerals: 'auto'`):
 *
 * - Arabic (`ar`): the Arabic-Indic digits (`'arab'`, ٠–٩) without a region
 *   or with any region but the Maghreb's, whose books print European digits
 *   (`'latn'`: `ar-MA`, `ar-DZ`, `ar-TN`, `ar-LY`, `ar-MR`, `ar-EH`).
 *   CLDR's own defaults give `latn` for a bare `ar` and for `ar-AE`; Arabic
 *   book publishing in the Mashriq and the Gulf prints ٠–٩, and a book is
 *   what this setting is for.
 * - Persian (`fa`), Pashto (`ps`) and the Urdu of India (`ur-IN`): the
 *   Extended Arabic-Indic digits (`'arabext'`, ۰–۹). The Urdu of Pakistan
 *   (`ur`, `ur-PK`) takes `'latn'`, as CLDR does: Pakistani books print
 *   both, and the European digits are the safe default.
 * - Every other language: `'latn'`.
 *
 * A tag that names its digits in a Unicode extension
 * (`ar-MA-u-nu-arab`, `fa-u-nu-latn`) has those when they are one of the
 * three. A missing or invalid tag gives `'latn'`.
 */
export function defaultNumeralsFor(tag: unknown): DigitSystem {
  if (!isTag(tag)) return 'latn';
  let locale: Intl.Locale | undefined;
  try {
    locale = typeof Intl.Locale === 'function' ? new Intl.Locale(tag.trim().replace(/_/g, '-')) : undefined;
  } catch {
    locale = undefined;
  }
  if (isDigitSystem(locale?.numberingSystem)) return locale.numberingSystem;
  const language = languageOf(tag);
  // The region as written: a bare `ar` is not Egyptian Arabic.
  const region = locale?.region ?? tag.trim().split(/[-_]/).slice(1).find((s) => /^[A-Za-z]{2}$|^\d{3}$/.test(s))?.toUpperCase();
  switch (language) {
    case 'ar':
      return region !== undefined && MAGHREB_REGIONS.has(region) ? 'latn' : 'arab';
    case 'fa':
    case 'ps':
      return 'arabext';
    case 'ur':
      return region === 'IN' ? 'arabext' : 'latn';
    default:
      return 'latn';
  }
}

/** The digit system of a `numerals` setting for a document in `tag`: the
 *  setting itself when it names one, else (`'auto'`, unset, or a value the
 *  engine does not know) the language's ({@link defaultNumeralsFor}). */
export function resolveNumerals(setting: NumeralsSetting | undefined, tag: unknown): DigitSystem {
  return isDigitSystem(setting) ? setting : defaultNumeralsFor(tag);
}
