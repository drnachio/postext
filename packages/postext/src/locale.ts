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
 * console, since the text is then hyphenated with another language's rules;
 * `warn: false` skips the report (hyphenation is off, so no text uses the
 * patterns). A missing or blank tag gives `'en-us'` silently.
 */
export function hyphenationLocaleFor(tag: LocaleTag, warn = true): HyphenationLocale {
  if (!isTag(tag)) return 'en-us';
  const match = matchHyphenationLocale(tag);
  if (match) return match;
  if (warn && !warnedTags.has(tag)) {
    warnedTags.add(tag);
    console.warn(
      `[postext] No hyphenation patterns for locale "${tag}"; hyphenating with en-us. `
      + `Bundled locales: ${HYPHENATION_LOCALES.join(', ')}.`,
    );
  }
  return 'en-us';
}
