import { cjkRegionOf, DOCUMENT_LANGUAGES, matchHyphenationLocale, sameContentLocale } from 'postext';
import type { HyphenationLocale, DimensionUnit } from 'postext';

export const LOCALE_TO_HYPHENATION: Record<string, HyphenationLocale> = {
  en: 'en-us',
  es: 'es',
  fr: 'fr',
  de: 'de',
  it: 'it',
  pt: 'pt',
  ca: 'ca',
  nl: 'nl',
};

export const TEXT_SIZE_UNITS: DimensionUnit[] = ['pt', 'px', 'em', 'rem'];
export const LINE_HEIGHT_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];
export const INDENT_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];
export const HYPHENATION_ZONE_UNITS: DimensionUnit[] = ['em', 'pt', 'mm'];

export const LOCALE_OPTIONS = [
  { value: 'en-us', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'it', label: 'Italiano' },
  { value: 'pt', label: 'Português' },
  { value: 'ca', label: 'Català' },
  { value: 'nl', label: 'Nederlands' },
];

/** The options of a language select whose value is `value`: the bundled
 *  languages, plus the stored tag itself when it is not one of them — a
 *  region tag such as `es-ES`, or a language without hyphenation patterns —
 *  so the select shows what the document says. The extra option is named
 *  after the bundled language the tag maps to, else shown as written. */
export function localeOptionsFor(value: string | undefined): { value: string; label: string }[] {
  if (!value || LOCALE_OPTIONS.some((o) => o.value === value)) return LOCALE_OPTIONS;
  const match = matchHyphenationLocale(value);
  const base = match ? LOCALE_OPTIONS.find((o) => o.value === match)?.label : undefined;
  return [...LOCALE_OPTIONS, { value, label: base ? `${base} (${value})` : value }];
}

/** The Document language options: every language with built-in strings
 *  (the engine's `DOCUMENT_LANGUAGES`: the hyphenation languages plus
 *  Chinese in Simplified and Traditional characters), each named in its own
 *  language. Written out, not mapped, so the settings search indexes the
 *  names (a test keeps the list equal to the engine's). */
export const DOCUMENT_LOCALE_OPTIONS: { value: string; label: string }[] = [
  ...LOCALE_OPTIONS,
  { value: 'zh-Hans', label: '中文（简体）' },
  { value: 'zh-Hant', label: '中文（繁體）' },
  { value: 'zh-Hant-HK', label: '中文（香港）' },
];

/** The options of the Document language select whose value is `value`: the
 *  document languages, plus the stored tag itself when it is not one of them
 *  (`zh-TW`, `es-ES`, `sv`), named after the language it reads as
 *  (`中文（繁體） (zh-TW)`), else shown as written. */
export function documentLocaleOptionsFor(value: string | undefined): { value: string; label: string }[] {
  if (!value || DOCUMENT_LOCALE_OPTIONS.some((o) => o.value === value)) return DOCUMENT_LOCALE_OPTIONS;
  const region = cjkRegionOf(value);
  const same = region !== undefined
    // Chinese: the option of the same script, and of the same region when
    // one is (Hong Kong), else the region's script option.
    ? DOCUMENT_LANGUAGES.find((l) => sameContentLocale(l.tag, value) && cjkRegionOf(l.tag) === region)
      ?? DOCUMENT_LANGUAGES.find((l) => sameContentLocale(l.tag, value))
    : DOCUMENT_LANGUAGES.find((l) => l.tag === matchHyphenationLocale(value));
  return [...DOCUMENT_LOCALE_OPTIONS, { value, label: same ? `${same.name} (${value})` : value }];
}
