/**
 * The glossary as one locale reads it: terms grouped by category and sorted
 * by the locale's collation (pinyin for Chinese, the letter after
 * the article for Arabic, the kana reading in gojūon order for Japanese),
 * then the abbreviations.
 * Shared by the page and its Markdown rendition.
 */
import { htmlLang, type SiteLocale } from "@/i18n/locales";
import { ABBREVIATIONS } from "./abbreviations";
import { GLOSSARY_CATEGORIES, GLOSSARY_TERMS, type GlossaryCategory } from "./terms";

export interface GlossaryEntry {
  id: string;
  term: string;
  definition: string;
  /** The Chinese, Japanese or Arabic name, outside the pages written in
   *  it, and its language tag. */
  native?: string;
  nativeLang?: string;
}

export interface GlossarySections {
  categories: { category: GlossaryCategory; terms: GlossaryEntry[] }[];
  abbreviations: { id: string; abbr: string; title: string }[];
}

/** Whether a locale already writes a category's terms in their native
 *  script. */
const writesNative = (locale: SiteLocale, category: GlossaryCategory) =>
  (locale === "zh" && category === "cjk") ||
  (locale === "ja" && category === "japanese") ||
  (locale === "ar" && category === "arabic");

/** The sort key of a term: Arabic glossaries file a word under its first
 *  letter after the definite article (الإحالة under ء, not ا); Japanese ones
 *  file it under its kana reading, when it has one (行送り under ぎょうおくり). */
export const sortKey = (locale: SiteLocale, term: string, reading?: string) =>
  locale === "ar" ? term.replace(/^ال(?=\p{L})/u, "") : locale === "ja" && reading ? reading : term;

export function glossarySections(locale: SiteLocale): GlossarySections {
  const collator = new Intl.Collator(htmlLang(locale), { sensitivity: "base" });
  const categories = GLOSSARY_CATEGORIES.map((category) => ({
    category,
    terms: GLOSSARY_TERMS.filter((t) => t.category === category)
      .map((t) => ({ t, key: sortKey(locale, t.text[locale][0], t.text[locale][2]) }))
      .sort((a, b) => collator.compare(a.key, b.key))
      .map(({ t }) => ({
        id: t.id,
        term: t.text[locale][0],
        definition: t.text[locale][1],
        // A Chinese page that names a Japanese term with the same characters
        // (外字) does not repeat them.
        ...(t.native && !writesNative(locale, t.category) && t.native !== t.text[locale][0]
          ? { native: t.native, nativeLang: t.nativeLang }
          : {}),
      })),
  }));
  const abbreviations = ABBREVIATIONS.map((a) => ({
    id: a.id,
    abbr: a.forms?.[locale]?.[0] ?? a.abbr,
    title: a.expansion[locale],
  })).sort((a, b) => collator.compare(a.abbr, b.abbr));
  return { categories, abbreviations };
}
