import type { ResourceType } from '../types';

/** Localised display strings for a built-in resource type. The numbering
 *  behaviour (template, reset, counter format) is language-independent and
 *  lives in {@link defaultResourceTypes}. */
interface ResourceTypeStrings {
  name: string;
  namePlural: string;
  shortLabel: string;
  captionPrefix: string;
}

/** Per-language strings for the two built-in types. English is the fallback for
 *  any locale not listed here. Add a language by adding a key. */
const BUILTIN_TYPE_STRINGS: Record<string, { figure: ResourceTypeStrings; table: ResourceTypeStrings }> = {
  en: {
    figure: { name: 'Figure', namePlural: 'Figures', shortLabel: 'Fig.', captionPrefix: 'Figure' },
    table: { name: 'Table', namePlural: 'Tables', shortLabel: 'Tab.', captionPrefix: 'Table' },
  },
  es: {
    figure: { name: 'Figura', namePlural: 'Figuras', shortLabel: 'Fig.', captionPrefix: 'Figura' },
    table: { name: 'Tabla', namePlural: 'Tablas', shortLabel: 'Tabla', captionPrefix: 'Tabla' },
  },
};

/** Resolve a (possibly regional) locale tag like `es-ES` to a strings entry,
 *  falling back to English. */
function stringsForLocale(locale: string): { figure: ResourceTypeStrings; table: ResourceTypeStrings } {
  const lang = locale.toLowerCase().split('-')[0];
  return BUILTIN_TYPE_STRINGS[lang] ?? BUILTIN_TYPE_STRINGS.en;
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
