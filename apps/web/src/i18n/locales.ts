/** Per-locale facts every surface agrees on: the switcher's names, the
 *  BCP 47 tag pages declare, their writing direction, Open Graph's locale
 *  and the edition the sandbox's guide opens in. Route segments stay the
 *  short codes. */
export const LOCALE_INFO = {
  en: { name: "English", code: "EN", htmlLang: "en", dir: "ltr", ogLocale: "en_US" },
  es: { name: "Español", code: "ES", htmlLang: "es", dir: "ltr", ogLocale: "es_ES" },
  ca: { name: "Català", code: "CA", htmlLang: "ca", dir: "ltr", ogLocale: "ca_ES" },
  pt: { name: "Português (Brasil)", code: "PT", htmlLang: "pt-BR", dir: "ltr", ogLocale: "pt_BR" },
  zh: { name: "简体中文", code: "中", htmlLang: "zh-Hans", dir: "ltr", ogLocale: "zh_CN" },
  ja: { name: "日本語", code: "日", htmlLang: "ja", dir: "ltr", ogLocale: "ja_JP" },
  ar: { name: "العربية", code: "ع", htmlLang: "ar", dir: "rtl", ogLocale: "ar_AR" },
} as const;

export type SiteLocale = keyof typeof LOCALE_INFO;

/** Each locale's YouTube playlist, opened on its first video (the showreel,
 *  or the tutorial while that language's showreel is not public yet) so the
 *  rest of the list plays on in the same language. */
const YOUTUBE_PLAYLIST: Record<SiteLocale, { video: string; list: string }> = {
  en: { video: "pTVl1TWvu-A", list: "PLXV_YSL9ROv0" },
  es: { video: "X7DEVCVz5sk", list: "PLb9LUQYJSvyg" },
  ca: { video: "s18kxneB05w", list: "PLbA04WsEy-wQ" },
  zh: { video: "z9OhKCK270M", list: "PLIfpGQLFoR8k" },
  ar: { video: "CuI63kdIlK0", list: "PLft7wmxPkdGo" },
  // No Japanese playlist yet: the English one, with Japanese transcripts on the site.
  ja: { video: "pTVl1TWvu-A", list: "PLXV_YSL9ROv0" },
  // No Brazilian Portuguese playlist yet: the English one, with Portuguese transcripts on the site.
  pt: { video: "pTVl1TWvu-A", list: "PLXV_YSL9ROv0" },
};

/** The cuts of the narrated videos on the media CDN: one per site locale
 *  (#510), Brazilian Portuguese still to come. */
export type MediaLang = Exclude<SiteLocale, "pt">;

/** The cut a route locale plays: Portuguese pages play the English one,
 *  with their own transcript underneath, until the pt cut is on the CDN. */
export function mediaLang(locale: string): MediaLang {
  const site = siteLocale(locale);
  return site === "pt" ? "en" : site;
}

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

/** The `dir` attribute for a route locale: "rtl" for Arabic, "ltr" otherwise. */
export function htmlDir(locale: string): "ltr" | "rtl" {
  return isSiteLocale(locale) ? LOCALE_INFO[locale].dir : "ltr";
}
