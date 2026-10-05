// The languages the built-in Postext guide is written in, and the helpers
// its figures, tables, captions and design read their wording through.

/** An edition of the guide. */
export type GuideLang = 'en' | 'es' | 'zh-Hans' | 'ca' | 'ar' | 'ja';

/** Every edition, in the order the guide's fingerprint lists them. */
export const GUIDE_LANGS: readonly GuideLang[] = ['en', 'es', 'zh-Hans', 'ca', 'ar', 'ja'];

/** The edition of the guide for a locale tag: Spanish for any `es` tag,
 *  Catalan for any `ca` tag, Simplified Chinese for any Chinese tag (the guide has no Traditional
 *  edition), Arabic for any `ar` tag (Modern Standard Arabic, whatever the
 *  region), Japanese for any `ja` tag, English for everything else. */
export function guideLang(locale: string): GuideLang {
  const tag = locale.toLowerCase().replace(/_/g, '-');
  if (tag.startsWith('es')) return 'es';
  if (tag === 'ca' || tag.startsWith('ca-')) return 'ca';
  if (tag === 'zh' || tag.startsWith('zh-')) return 'zh-Hans';
  if (tag === 'ar' || tag.startsWith('ar-')) return 'ar';
  if (tag === 'ja' || tag.startsWith('ja-')) return 'ja';
  return 'en';
}

/** One value per edition. */
export type ByLang<T = string> = Record<GuideLang, T>;

/** A {@link ByLang} from its six values, in the order en, es, zh-Hans, ca,
 *  ar, ja. */
export function byLang<T>(en: T, es: T, zh: T, ca: T, ar: T, ja: T): ByLang<T> {
  return { en, es, 'zh-Hans': zh, ca, ar, ja };
}
