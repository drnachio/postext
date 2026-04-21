import type { HyphenationLocale, DimensionUnit } from 'postext';

export const LOCALE_TO_HYPHENATION: Record<string, HyphenationLocale> = {
  en: 'en-us',
  es: 'es',
  fr: 'fr',
  de: 'de',
  it: 'it',
  pt: 'pt',
  ca: 'ca',
  nl: 'nl',
};

export const TEXT_SIZE_UNITS: DimensionUnit[] = ['pt', 'px', 'em', 'rem'];
export const LINE_HEIGHT_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];
export const INDENT_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];

export const LOCALE_OPTIONS = [
  { value: 'en-us', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'it', label: 'Italiano' },
  { value: 'pt', label: 'Português' },
  { value: 'ca', label: 'Català' },
  { value: 'nl', label: 'Nederlands' },
];
