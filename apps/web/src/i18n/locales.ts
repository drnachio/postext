/** Per-locale facts every surface agrees on: the switcher's names, the
 *  BCP 47 tag pages declare, Open Graph's locale and the edition the
 *  sandbox's guide opens in. Route segments stay the short codes. */
export const LOCALE_INFO = {
  en: { name: "English", code: "EN", htmlLang: "en", ogLocale: "en_US" },
  es: { name: "Español", code: "ES", htmlLang: "es", ogLocale: "es_ES" },
  zh: { name: "简体中文", code: "中", htmlLang: "zh-Hans", ogLocale: "zh_CN" },
} as const;

export type SiteLocale = keyof typeof LOCALE_INFO;

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
