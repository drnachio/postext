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

// ---------------------------------------------------------------------------
// Content locales: which of a book's languages serves a locale asked for.

/** Languages written in more than one script, where the script tells two
 *  editions apart: a Traditional Chinese book is not a Simplified one,
 *  whatever the language subtag says. */
const SCRIPT_DISTINCT_LANGUAGES = new Set(['zh', 'sr', 'uz', 'pa', 'az', 'bs', 'mn', 'ks', 'sd', 'ku']);

/**
 * A BCP 47 tag in canonical case (`zh-hant` → `zh-Hant`, `PT-br` →
 * `pt-BR`, `_` read as `-`), or null when it is not a well-formed tag.
 */
export function canonicalLocaleTag(tag: unknown): string | null {
  if (!isTag(tag)) return null;
  try {
    return Intl.getCanonicalLocales(tag.trim().replace(/_/g, '-'))[0] ?? null;
  } catch {
    return null;
  }
}

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
      let max = locale;
      try {
        max = locale.maximize();
      } catch {
        // No likely-subtags data: the tag as written.
      }
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
 * `zh-Hant`. Case and `_` separators are ignored.
 */
export function sameContentLocale(a: string, b: string): boolean {
  const pa = isTag(a) ? localeParts(a) : null;
  const pb = isTag(b) ? localeParts(b) : null;
  if (!pa || !pb) {
    const la = languageOf(a);
    return la !== '' && la === languageOf(b);
  }
  if (pa.language !== pb.language) return false;
  return !SCRIPT_DISTINCT_LANGUAGES.has(pa.language) || pa.script === pb.script;
}

/** How well `candidate` serves `wanted`: 0 not at all, then language only
 *  (a language whose script does not tell editions apart), the same script
 *  in a region of its own, the same script and no region, the same script
 *  and the region `wanted` names (once maximised), and the same tag. */
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
  return SCRIPT_DISTINCT_LANGUAGES.has(pc.language) ? 0 : 1;
}

/**
 * The one of `candidates` that serves `wanted`, or undefined when none is
 * in its language. An exact tag (case aside) wins; then, for a tag naming
 * a region, the one that maximises to the same language, script and region
 * (`zh-TW` finds `zh-Hant`, `en-US` finds `en`); then one in the same
 * script (a tag with no region first: `zh` finds `zh-Hans`); then, for a
 * language not told apart by script, any tag of the language. `zh-Hant`
 * never finds `zh-Hans`. Ties keep the order of `candidates`.
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
