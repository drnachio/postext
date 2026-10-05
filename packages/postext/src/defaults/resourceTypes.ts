import type { PostextConfig, ResourceType } from '../types';
import { presentTag, stringsFor } from '../locale';

/** Localised display strings for a built-in resource type. The numbering
 *  behaviour (template, reset, counter format) is language-independent and
 *  lives in {@link defaultResourceTypes}. */
interface ResourceTypeStrings {
  name: string;
  namePlural: string;
  shortLabel: string;
  captionPrefix: string;
}

/** Per-language strings for the two built-in types, one per bundled
 *  hyphenation language plus Chinese in each script, Japanese and Arabic
 *  (keyed by `stringsKeyOf`). English is the fallback for any locale not
 *  listed here. Add a language by adding a key. A language may also number
 *  its figures its own way (`numberingTemplate`, the house style being
 *  `{h1}.{n}`). */
const BUILTIN_TYPE_STRINGS: Record<string, { figure: ResourceTypeStrings; table: ResourceTypeStrings; numberingTemplate?: string }> = {
  en: {
    figure: { name: 'Figure', namePlural: 'Figures', shortLabel: 'Fig.', captionPrefix: 'Figure' },
    table: { name: 'Table', namePlural: 'Tables', shortLabel: 'Tab.', captionPrefix: 'Table' },
  },
  es: {
    figure: { name: 'Figura', namePlural: 'Figuras', shortLabel: 'Fig.', captionPrefix: 'Figura' },
    table: { name: 'Tabla', namePlural: 'Tablas', shortLabel: 'Tabla', captionPrefix: 'Tabla' },
  },
  fr: {
    figure: { name: 'Figure', namePlural: 'Figures', shortLabel: 'Fig.', captionPrefix: 'Figure' },
    table: { name: 'Tableau', namePlural: 'Tableaux', shortLabel: 'Tabl.', captionPrefix: 'Tableau' },
  },
  de: {
    figure: { name: 'Abbildung', namePlural: 'Abbildungen', shortLabel: 'Abb.', captionPrefix: 'Abbildung' },
    table: { name: 'Tabelle', namePlural: 'Tabellen', shortLabel: 'Tab.', captionPrefix: 'Tabelle' },
  },
  it: {
    figure: { name: 'Figura', namePlural: 'Figure', shortLabel: 'Fig.', captionPrefix: 'Figura' },
    table: { name: 'Tabella', namePlural: 'Tabelle', shortLabel: 'Tab.', captionPrefix: 'Tabella' },
  },
  pt: {
    figure: { name: 'Figura', namePlural: 'Figuras', shortLabel: 'Fig.', captionPrefix: 'Figura' },
    table: { name: 'Tabela', namePlural: 'Tabelas', shortLabel: 'Tab.', captionPrefix: 'Tabela' },
  },
  ca: {
    figure: { name: 'Figura', namePlural: 'Figures', shortLabel: 'Fig.', captionPrefix: 'Figura' },
    table: { name: 'Taula', namePlural: 'Taules', shortLabel: 'Taula', captionPrefix: 'Taula' },
  },
  nl: {
    figure: { name: 'Figuur', namePlural: 'Figuren', shortLabel: 'Fig.', captionPrefix: 'Figuur' },
    table: { name: 'Tabel', namePlural: 'Tabellen', shortLabel: 'Tab.', captionPrefix: 'Tabel' },
  },
  // Chinese numbers figures by chapter with a hyphen: 图1-1, 表2-3.
  'zh-hans': {
    figure: { name: '图', namePlural: '图', shortLabel: '图', captionPrefix: '图' },
    table: { name: '表', namePlural: '表', shortLabel: '表', captionPrefix: '表' },
    numberingTemplate: '{h1}-{n}',
  },
  'zh-hant': {
    figure: { name: '圖', namePlural: '圖', shortLabel: '圖', captionPrefix: '圖' },
    table: { name: '表', namePlural: '表', shortLabel: '表', captionPrefix: '表' },
    numberingTemplate: '{h1}-{n}',
  },
  // Japanese books name them 図 and 表 and number them by chapter with a
  // hyphen too (図1-1, 表2-3; JLReq §4.3, ja-typography §12): a vertical
  // book's horizontal captions read the same.
  ja: {
    figure: { name: '図', namePlural: '図', shortLabel: '図', captionPrefix: '図' },
    table: { name: '表', namePlural: '表', shortLabel: '表', captionPrefix: '表' },
    numberingTemplate: '{h1}-{n}',
  },
  // Arabic numbers by chapter with a hyphen too (شكل ٢-٣, «الجدول ١-٢»):
  // a full stop between two Arabic-Indic digits reads as the decimal
  // separator ٫ at a glance.
  ar: {
    figure: { name: 'شكل', namePlural: 'أشكال', shortLabel: 'شكل', captionPrefix: 'شكل' },
    table: { name: 'جدول', namePlural: 'جداول', shortLabel: 'جدول', captionPrefix: 'جدول' },
    numberingTemplate: '{h1}-{n}',
  },
};

/** Resolve a (possibly regional) locale tag like `es-ES` or `pt_BR` to a
 *  strings entry, falling back to English. */
function stringsForLocale(locale: string): { figure: ResourceTypeStrings; table: ResourceTypeStrings; numberingTemplate?: string } {
  return stringsFor(BUILTIN_TYPE_STRINGS, locale);
}

/** The document language the built-in strings follow: `config.locale`, else
 *  the hyphenation locale, else English — the resolution the table
 *  continuation strings use too. A blank tag counts as unset. */
export function documentLocale(config: PostextConfig | undefined): string {
  return presentTag(config?.locale) ?? presentTag(config?.bodyText?.hyphenation?.locale) ?? 'en';
}

/** Built-in resource types provided when a config does not define its own,
 *  localised to `locale` (defaults to English). Both reset their counter on
 *  every `h1` and number as `{h1}.{n}` (e.g. "Figure 2.3"), or `{h1}-{n}` in
 *  Chinese ("图 2-3"), Japanese ("図 2-3") and Arabic ("شكل 2-3"), using
 *  decimal counters. New objects are returned on every call so callers may
 *  freely mutate the result. */
export function defaultResourceTypes(locale = 'en'): ResourceType[] {
  const s = stringsForLocale(locale);
  const numberingTemplate = s.numberingTemplate ?? '{h1}.{n}';
  return [
    {
      id: 'figure',
      ...s.figure,
      numberingTemplate,
      resetOn: 'h1',
      counterFormat: 'decimal',
    },
    {
      id: 'table',
      ...s.table,
      numberingTemplate,
      resetOn: 'h1',
      counterFormat: 'decimal',
    },
  ];
}
