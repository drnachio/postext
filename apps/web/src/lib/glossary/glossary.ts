/**
 * The glossary as one locale reads it: terms grouped by category and sorted
 * by the locale's collation (pinyin for Chinese), then the abbreviations.
 * Shared by the page and its Markdown rendition.
 */
import { htmlLang, type SiteLocale } from "@/i18n/locales";
import { ABBREVIATIONS } from "./abbreviations";
import { GLOSSARY_CATEGORIES, GLOSSARY_TERMS, type GlossaryCategory } from "./terms";

export interface GlossaryEntry {
  id: string;
  term: string;
  definition: string;
  /** The Chinese name, outside Chinese pages. */
  native?: string;
}

export interface GlossarySections {
  categories: { category: GlossaryCategory; terms: GlossaryEntry[] }[];
  abbreviations: { id: string; abbr: string; title: string }[];
}

export function glossarySections(locale: SiteLocale): GlossarySections {
  const collator = new Intl.Collator(htmlLang(locale), { sensitivity: "base" });
  const categories = GLOSSARY_CATEGORIES.map((category) => ({
    category,
    terms: GLOSSARY_TERMS.filter((t) => t.category === category)
      .map((t) => ({
        id: t.id,
        term: t.text[locale][0],
        definition: t.text[locale][1],
        ...(t.native && locale !== "zh" ? { native: t.native } : {}),
      }))
      .sort((a, b) => collator.compare(a.term, b.term)),
  }));
  const abbreviations = ABBREVIATIONS.map((a) => ({
    id: a.id,
    abbr: a.forms?.[locale]?.[0] ?? a.abbr,
    title: a.expansion[locale],
  })).sort((a, b) => collator.compare(a.abbr, b.abbr));
  return { categories, abbreviations };
}
