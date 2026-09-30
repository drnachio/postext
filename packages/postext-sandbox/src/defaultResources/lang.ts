// The languages the built-in Postext guide is written in, and the helpers
// its figures, tables, captions and design read their wording through.

/** An edition of the guide. */
export type GuideLang = 'en' | 'es' | 'zh-Hans';

/** Every edition, in the order the guide's fingerprint lists them. */
export const GUIDE_LANGS: readonly GuideLang[] = ['en', 'es', 'zh-Hans'];

/** The edition of the guide for a locale tag: Spanish for any `es` tag,
 *  Simplified Chinese for any Chinese tag (the guide has no Traditional
 *  edition), English for everything else. */
export function guideLang(locale: string): GuideLang {
  const tag = locale.toLowerCase().replace(/_/g, '-');
  if (tag.startsWith('es')) return 'es';
  if (tag === 'zh' || tag.startsWith('zh-')) return 'zh-Hans';
  return 'en';
}

/** One value per edition. */
export type ByLang<T = string> = Record<GuideLang, T>;

/** A {@link ByLang} from its three values, in the order en, es, zh-Hans. */
export function byLang<T>(en: T, es: T, zh: T): ByLang<T> {
  return { en, es, 'zh-Hans': zh };
}
