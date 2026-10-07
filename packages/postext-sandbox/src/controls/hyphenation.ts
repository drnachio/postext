import { chineseScriptOf, isJapaneseLanguage, type HyphenationLocale, type PostextConfig } from 'postext';

/** Hyphenation dictionary for each app locale, used when the document's
 *  configuration does not name one. */
export const LOCALE_TO_HYPHENATION: Record<string, HyphenationLocale> = {
  en: 'en-us', es: 'es', fr: 'fr', de: 'de', it: 'it', pt: 'pt', ca: 'ca', nl: 'nl',
};

/** The language a document that names none is read in: the interface's.
 *  Its hyphenation dictionary (`en` → `en-us`, `es-ES` → `es`), or for a
 *  Chinese interface the Chinese of its script (`zh`, `zh-Hans` →
 *  `zh-Hans`; `zh-TW` → `zh-Hant`), for a Japanese one `ja` (both set
 *  without hyphenation), for a Portuguese one (`pt`, `pt-BR`: the
 *  interface is Brazilian) `pt-BR`, hyphenated with the Portuguese
 *  patterns; English for any other interface. */
export function defaultDocumentLocale(uiLocale: string): string {
  const script = chineseScriptOf(uiLocale);
  if (script) return script === 'Hant' ? 'zh-Hant' : 'zh-Hans';
  if (isJapaneseLanguage(uiLocale)) return 'ja';
  const language = uiLocale.trim().toLowerCase().split(/[-_]/)[0] ?? '';
  if (language === 'pt') return 'pt-BR';
  return LOCALE_TO_HYPHENATION[uiLocale] ?? LOCALE_TO_HYPHENATION[language] ?? 'en-us';
}

/** `config` with the app locale's hyphenation dictionary filled in when the
 *  document names no language: neither a hyphenation locale nor its
 *  `locale`, which the engine falls back to. A Chinese interface fills in
 *  its Chinese tag, which switches hyphenation off. Returns `config` itself
 *  when nothing changes. */
export function withHyphenationLocale(config: PostextConfig, locale: string): PostextConfig {
  if (config.bodyText?.hyphenation?.locale || config.locale) return config;
  const hypLocale = defaultDocumentLocale(locale);
  // One derived object per (config, locale): the fingerprints keyed on
  // the config object (layout records, the worker's document cache) then
  // hit instead of hashing the configuration on every build.
  let byLocale = derived.get(config);
  if (!byLocale) {
    byLocale = new Map();
    derived.set(config, byLocale);
  }
  const hit = byLocale.get(hypLocale);
  if (hit) return hit;
  const effective: PostextConfig = {
    ...config,
    bodyText: {
      ...config.bodyText,
      hyphenation: {
        ...config.bodyText?.hyphenation,
        locale: hypLocale,
      },
    },
  };
  byLocale.set(hypLocale, effective);
  return effective;
}

const derived = new WeakMap<PostextConfig, Map<string, PostextConfig>>();
