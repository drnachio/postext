// The direction and the digits of a document as the engine resolves them
// (`pipeline/config.ts`: `resolveDirection`, `resolveNumerals`), for the
// panels that show them before a layout exists: the "Auto (…)" options of
// Writing system, the binding the page drawings use, the review lists.

import type { DigitSystem, PostextConfig } from 'postext';
import { defaultNumeralsFor, directionOf } from 'postext';

/** The base direction of a document in `locale`: `direction` when it says
 *  `'ltr'` or `'rtl'`, else (`'auto'`, unset, a value the engine does not
 *  know) the direction of the language's script. */
export function documentDirection(direction: unknown, locale: string | undefined): 'ltr' | 'rtl' {
  if (direction === 'ltr' || direction === 'rtl') return direction;
  return directionOf(locale);
}

/** The digits of a document in `locale`: `numerals` when it names a
 *  system, else the language's (`defaultNumeralsFor`: ٠–٩ for Arabic,
 *  0–9 in the Maghreb and for every other language). */
export function documentDigits(numerals: unknown, locale: string | undefined): DigitSystem {
  return numerals === 'latn' || numerals === 'arab' || numerals === 'arabext' ? numerals : defaultNumeralsFor(locale);
}

/** The document language as the engine reads it: `locale`, else the
 *  hyphenation locale, else `fallback` (the interface's language, which the
 *  sandbox fills into a book that names none). */
export function documentLanguage(config: Pick<PostextConfig, 'locale' | 'bodyText'>, fallback: string): string {
  const present = (tag: string | undefined) => (tag !== undefined && tag.trim() !== '' ? tag : undefined);
  return present(config.locale) ?? present(config.bodyText?.hyphenation?.locale) ?? fallback;
}
