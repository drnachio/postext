/**
 * Composition conventions: the typesetting rules a language's tradition
 * asks for, shipped as templates that hold only the composition part. Each
 * sets a value only where the tradition is clear and widely stated; the
 * rest stays at the engine's default. Named by tradition, never by
 * program. They change nothing by themselves: the book takes one when the
 * reader tries it in the Templates panel or applies the hint beside the
 * hyphenation settings.
 */

import type { PostextConfig } from 'postext';
import type { SandboxLabels } from '../../types/index.js';

export interface CompositionConvention {
  id: string;
  nameKey: keyof SandboxLabels;
  descriptionKey: keyof SandboxLabels;
  /** Whether a language tag (BCP 47, any case) reads by this convention. */
  matches: (language: string, region: string | undefined) => boolean;
  config: PostextConfig;
}

/** Spanish: no two hyphenated lines in a row, no divided last word, no
 *  stacks, no column ending on a hyphen. */
const SPANISH: PostextConfig = {
  bodyText: {
    hyphenation: { ladders: 'avoid', maxConsecutive: 1, lastWord: 'avoid' },
    stacks: 'avoid',
    hyphenateAcrossColumns: false,
  },
};

/** English as set in the United States: at most three hyphenated lines in
 *  a row, the last word of a paragraph whole. */
const ENGLISH_US: PostextConfig = {
  bodyText: { hyphenation: { ladders: 'avoid', maxConsecutive: 3, lastWord: 'avoid' } },
};

/** English as set in Britain: at most two hyphenated lines in a row, the
 *  last word of a paragraph whole. */
const ENGLISH_UK: PostextConfig = {
  bodyText: { hyphenation: { ladders: 'avoid', maxConsecutive: 2, lastWord: 'avoid' } },
};

/** French: at most three hyphenated lines in a row, the last word of a
 *  paragraph whole. */
const FRENCH: PostextConfig = {
  bodyText: { hyphenation: { ladders: 'avoid', maxConsecutive: 3, lastWord: 'avoid' } },
};

/** German: at most three hyphenated lines in a row. */
const GERMAN: PostextConfig = {
  bodyText: { hyphenation: { ladders: 'avoid', maxConsecutive: 3 } },
};

/** The regions whose English follows British practice. */
const BRITISH = new Set(['GB', 'UK', 'IE', 'AU', 'NZ']);

export const COMPOSITION_CONVENTIONS: readonly CompositionConvention[] = [
  { id: 'builtin-composition-es', nameKey: 'compositionSpanish', descriptionKey: 'compositionSpanishDescription', matches: (l) => l === 'es', config: SPANISH },
  { id: 'builtin-composition-en-us', nameKey: 'compositionEnglishUS', descriptionKey: 'compositionEnglishUSDescription', matches: (l, r) => l === 'en' && !BRITISH.has(r ?? ''), config: ENGLISH_US },
  { id: 'builtin-composition-en-gb', nameKey: 'compositionEnglishUK', descriptionKey: 'compositionEnglishUKDescription', matches: (l, r) => l === 'en' && BRITISH.has(r ?? ''), config: ENGLISH_UK },
  { id: 'builtin-composition-fr', nameKey: 'compositionFrench', descriptionKey: 'compositionFrenchDescription', matches: (l) => l === 'fr', config: FRENCH },
  { id: 'builtin-composition-de', nameKey: 'compositionGerman', descriptionKey: 'compositionGermanDescription', matches: (l) => l === 'de', config: GERMAN },
];

/** The convention of a language (`es`, `en-GB`, the hyphenation's `en-us`),
 *  if one ships. A tag with no region reads as its language's first. */
export function conventionFor(tag: string | undefined): CompositionConvention | undefined {
  if (!tag) return undefined;
  const [language, ...rest] = tag.toLowerCase().split(/[-_]/);
  const region = rest.find((s) => /^([a-z]{2}|\d{3})$/.test(s))?.toUpperCase();
  return COMPOSITION_CONVENTIONS.find((c) => c.matches(language ?? '', region));
}
