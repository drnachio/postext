/** Per-locale facts every surface agrees on: the switcher's names, the
 *  BCP 47 tag pages declare, Open Graph's locale and the edition the
 *  sandbox's guide opens in. Route segments stay the short codes. */
export const LOCALE_INFO = {
  en: { name: "English", code: "EN", htmlLang: "en", ogLocale: "en_US" },
  es: { name: "Español", code: "ES", htmlLang: "es", ogLocale: "es_ES" },
  ca: { name: "Català", code: "CA", htmlLang: "ca", ogLocale: "ca_ES" },
  zh: { name: "简体中文", code: "中", htmlLang: "zh-Hans", ogLocale: "zh_CN" },
} as const;

export type SiteLocale = keyof typeof LOCALE_INFO;

/** Each locale's YouTube playlist, opened on its first video (the showreel)
 *  so the rest of the list plays on in the same language. */
const YOUTUBE_PLAYLIST: Record<SiteLocale, { video: string; list: string }> = {
  en: { video: "js4vQSNhbEs", list: "PLXV_YSL9ROv0" },
  es: { video: "UFme-Yw6Q0k", list: "PLb9LUQYJSvyg" },
  // No Catalan cut: the Spanish playlist is the nearest.
  ca: { video: "UFme-Yw6Q0k", list: "PLb9LUQYJSvyg" },
  zh: { video: "lFy_VLFuWqA", list: "PLIfpGQLFoR8k" },
};

/** The header's YouTube link for a route locale. */
export function youtubeUrl(locale: string): string {
  const { video, list } = YOUTUBE_PLAYLIST[siteLocale(locale)];
  return `https://www.youtube.com/watch?v=${video}&list=${list}`;
}

export function isSiteLocale(value: string): value is SiteLocale {
  return Object.prototype.hasOwnProperty.call(LOCALE_INFO, value);
}

/** The site locale a route segment or a BCP 47 tag names, English otherwise. */
export function siteLocale(value: string | null | undefined): SiteLocale {
  const base = (value ?? "").toLowerCase().split(/[-_]/)[0];
  return isSiteLocale(base) ? base : "en";
}

/** The `lang` attribute for a route locale ("zh" → "zh-Hans"). */
export function htmlLang(locale: string): string {
  return isSiteLocale(locale) ? LOCALE_INFO[locale].htmlLang : locale;
}
