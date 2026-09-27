import type { PostextConfig, ResourceType } from '../types';
import { languageOf, presentTag } from '../locale';

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
 *  hyphenation language. English is the fallback for any locale not listed
 *  here. Add a language by adding a key. */
const BUILTIN_TYPE_STRINGS: Record<string, { figure: ResourceTypeStrings; table: ResourceTypeStrings }> = {
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
};

/** Resolve a (possibly regional) locale tag like `es-ES` or `pt_BR` to a
 *  strings entry, falling back to English. */
function stringsForLocale(locale: string): { figure: ResourceTypeStrings; table: ResourceTypeStrings } {
  return BUILTIN_TYPE_STRINGS[languageOf(locale)] ?? BUILTIN_TYPE_STRINGS.en!;
}

/** The document language the built-in strings follow: `config.locale`, else
 *  the hyphenation locale, else English — the resolution the table
 *  continuation strings use too. A blank tag counts as unset. */
export function documentLocale(config: PostextConfig | undefined): string {
  return presentTag(config?.locale) ?? presentTag(config?.bodyText?.hyphenation?.locale) ?? 'en';
}

/** Built-in resource types provided when a config does not define its own,
 *  localised to `locale` (defaults to English). Both reset their counter on
 *  every `h1` and number as `{h1}.{n}` (e.g. "Figure 2.3"), using decimal
 *  counters. New objects are returned on every call so callers may freely
 *  mutate the result. */
export function defaultResourceTypes(locale = 'en'): ResourceType[] {
  const s = stringsForLocale(locale);
  return [
    {
      id: 'figure',
      ...s.figure,
      numberingTemplate: '{h1}.{n}',
      resetOn: 'h1',
      counterFormat: 'decimal',
    },
    {
      id: 'table',
      ...s.table,
      numberingTemplate: '{h1}.{n}',
      resetOn: 'h1',
      counterFormat: 'decimal',
    },
  ];
}
