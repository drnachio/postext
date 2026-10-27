/**
 * The glossary's terms (WCAG 3.1.3 Unusual Words): the typesetting, Chinese,
 * Japanese and Arabic layout and software jargon the docs, the Cookbook and the landing use,
 * each with a short definition in every locale. `id` is the anchor on
 * /<locale>/glossary and never changes once published.
 *
 * Isomorphic: no Node or React imports.
 */
import type { SiteLocale } from "@/i18n/locales";
import { TYPE_TEXT_TERMS } from "./terms/typeText";
import { TYPE_PAGE_TERMS } from "./terms/typePage";
import { CHINESE_TERMS } from "./terms/chinese";
import { JAPANESE_TERMS } from "./terms/japanese";
import { ARABIC_TERMS } from "./terms/arabic";
import { WEB_TERMS } from "./terms/web";

export type GlossaryCategory = "type" | "cjk" | "japanese" | "arabic" | "web";

export interface GlossaryTerm {
  id: string;
  category: GlossaryCategory;
  /** [term, definition] per locale. The Japanese entry adds the term's
   *  reading in kana, which the Japanese glossary files it under (gojūon
   *  order): kanji compounds do not collate by reading on their own. */
  text: Record<SiteLocale, readonly [term: string, definition: string, reading?: string]>;
  /** The native name of a Chinese-, Japanese- or Arabic-layout term (中文,
   *  日本語 or العربية), shown beside the term in the locales that do not
   *  write it already. */
  native?: string;
  /** The BCP 47 tag of `native`, so the page marks it in its language: a
   *  Japanese name drawn with Chinese glyph forms, or Arabic taken for
   *  Chinese, would read wrong. */
  nativeLang?: string;
}

export const GLOSSARY_CATEGORIES: readonly GlossaryCategory[] = ["type", "cjk", "japanese", "arabic", "web"];

export const GLOSSARY_TERMS: readonly GlossaryTerm[] = [
  ...TYPE_TEXT_TERMS,
  ...TYPE_PAGE_TERMS,
  ...CHINESE_TERMS,
  ...JAPANESE_TERMS,
  ...ARABIC_TERMS,
  ...WEB_TERMS,
];
