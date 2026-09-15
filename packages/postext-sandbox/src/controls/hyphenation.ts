import type { HyphenationLocale, PostextConfig } from 'postext';

/** Hyphenation dictionary for each app locale, used when the document's
 *  configuration does not name one. */
export const LOCALE_TO_HYPHENATION: Record<string, HyphenationLocale> = {
  en: 'en-us', es: 'es', fr: 'fr', de: 'de', it: 'it', pt: 'pt', ca: 'ca', nl: 'nl',
};

/** `config` with the app locale's hyphenation dictionary filled in when the
 *  user has not chosen one. Returns `config` itself when nothing changes. */
export function withHyphenationLocale(config: PostextConfig, locale: string): PostextConfig {
  if (config.bodyText?.hyphenation?.locale) return config;
  const hypLocale = LOCALE_TO_HYPHENATION[locale] ?? 'en-us';
  return {
    ...config,
    bodyText: {
      ...config.bodyText,
      hyphenation: {
        ...config.bodyText?.hyphenation,
        locale: hypLocale,
      },
    },
  };
}
