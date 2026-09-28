import type { HyphenationLocale, LocaleTag } from './types';

/** The languages whose hyphenation patterns ship with the engine. */
export const HYPHENATION_LOCALES: readonly HyphenationLocale[] = Object.freeze([
  'en-us', 'es', 'fr', 'de', 'it', 'pt', 'ca', 'nl',
] as const);

const BUNDLED = new Set<string>(HYPHENATION_LOCALES);

/** The primary language subtag of a BCP 47 tag, lower-cased (`'pt_BR'` →
 *  `'pt'`, `'en-us'` → `'en'`). The key of the built-in string tables. */
export function languageOf(tag: string): string {
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

/** Where a Chinese text is set, which decides its typographic defaults
 *  (clreq §1.2: rules follow the region, not the script). */
export type CjkRegion = 'mainland' | 'taiwan' | 'hongkong';

/** The typographic region of a Chinese tag: CN and SG are `'mainland'`, TW
 *  `'taiwan'`, HK and MO `'hongkong'`; a tag without a region follows its
 *  script (`zh-Hant` → `'taiwan'`, `zh` and `zh-Hans` → `'mainland'`).
 *  `undefined` for any other language. */
export function cjkRegionOf(tag: unknown): CjkRegion | undefined {
  if (!isTag(tag) || languageOf(tag) !== 'zh') return undefined;
  const loc = maximize(tag);
  switch (loc?.region) {
    case 'CN': case 'SG': return 'mainland';
    case 'TW': return 'taiwan';
    case 'HK': case 'MO': return 'hongkong';
    default: return loc?.script === 'Hant' ? 'taiwan' : 'mainland';
  }
}

/** The key of the built-in string tables for a tag: `'zh-hans'` or
 *  `'zh-hant'` for Chinese (Simplified and Traditional need different
 *  characters: 图/圖, 续/續, 见/見), else the bare language
 *  ({@link languageOf}). */
export function stringsKeyOf(tag: unknown): string {
  if (!isTag(tag)) return '';
  const lang = languageOf(tag);
  if (lang !== 'zh') return lang;
  return localeScript(tag) === 'Hant' ? 'zh-hant' : 'zh-hans';
}

/** A tag in its canonical case (`'zh-hant-tw'` → `'zh-Hant-TW'`, `'en_us'`
 *  → `'en-US'`), script and region kept; `undefined` for a missing or
 *  invalid tag. The form HTML `lang` and PDF `/Lang` declare. */
export function canonicalLocaleTag(tag: unknown): string | undefined {
  if (!isTag(tag)) return undefined;
  try {
    return Intl.getCanonicalLocales(tag.trim().replace(/_/g, '-'))[0];
  } catch {
    return undefined;
  }
}

/** The `lang` a renderer declares for a resolved document (the HTML root,
 *  the canvas context): its language in canonical form (`zh-Hant-TW`),
 *  from `locale`, else the hyphenation tag. Only Chinese, Japanese and
 *  Korean documents declare one — there the browser picks regional glyph
 *  forms from it (Han characters unified in Unicode, punctuation set in the
 *  corner or the centre of the em box) — so the output of every other
 *  document is unchanged. */
export function renderLangOf(config: {
  locale?: string;
  bodyText?: { hyphenation?: { tag?: string; locale?: string } };
} | undefined): string | undefined {
  const h = config?.bodyText?.hyphenation;
  const tag = presentTag(config?.locale) ?? presentTag(h?.tag) ?? presentTag(h?.locale);
  return isCjkLanguage(tag) ? canonicalLocaleTag(tag) : undefined;
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

/** Languages whose script decides the content (Serbian in Cyrillic or
 *  Latin, Chinese in Simplified or Traditional characters…). */
const SCRIPT_DISTINCT_LANGUAGES = new Set(['zh', 'sr', 'uz', 'pa', 'az', 'bs', 'mn']);

/** Whether two tags name the same content language: the same language and,
 *  for a language written in more than one script, the same script
 *  (`zh-TW` and `zh-Hant` match, `zh` and `zh-Hans` match, `zh-Hans` and
 *  `zh-Hant` do not; `es` and `es-MX` match). */
export function sameContentLocale(a: unknown, b: unknown): boolean {
  if (!isTag(a) || !isTag(b)) return false;
  const lang = languageOf(a);
  if (lang !== languageOf(b)) return false;
  if (!SCRIPT_DISTINCT_LANGUAGES.has(lang)) return true;
  return localeScript(a) === localeScript(b);
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
 *  Traditional characters as set in Hong Kong. */
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
 * (Chinese, Japanese and Korean excepted: they are set without hyphenation);
 * `warn: false` skips the report (hyphenation is off, so no text uses the
 * patterns). A missing or blank tag gives `'en-us'` silently.
 */
export function hyphenationLocaleFor(tag: LocaleTag, warn = true): HyphenationLocale {
  if (!isTag(tag)) return 'en-us';
  const match = matchHyphenationLocale(tag);
  if (match) return match;
  // Chinese, Japanese and Korean need no patterns: nothing to report. The
  // body text resolves hyphenation off for them (see `resolveHyphenation`).
  if (isCjkLanguage(tag)) return 'en-us';
  if (warn && !warnedTags.has(tag)) {
    warnedTags.add(tag);
    console.warn(
      `[postext] No hyphenation patterns for locale "${tag}"; hyphenating with en-us. `
      + `Bundled locales: ${HYPHENATION_LOCALES.join(', ')}.`,
    );
  }
  return 'en-us';
}
