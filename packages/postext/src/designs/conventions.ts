/**
 * Composition conventions (#1540): the composition rules a language's
 * typesetting tradition asks for, as designs that hold the composition
 * part alone. Each sets a rule only where the tradition is clear and
 * widely stated; the rest stays at the engine's default, and the
 * penalties are the engine's. They change nothing by themselves: a book
 * takes one when it is applied (the Sandbox ships them as designs and
 * offers the one of the book's language beside the composition rules).
 *
 * Catalan, Italian and Portuguese wait until their rule can be stated.
 */

import type { PostextConfig } from '../types.js';
import { resolveBodyTextConfig } from '../defaults/text/bodyText/resolve.js';
import { sameConfig } from '../defaults/configLayers.js';
import { applyDesign, type Design } from './design.js';
import { designPartSlots, readDesignSlot } from './parts.js';

export interface CompositionConvention {
  /** `composition-es`, `composition-en-gb`…: the id of its design. */
  id: string;
  /** The language tag it is named for (BCP 47). */
  locale: string;
  /** The composition part's settings. */
  config: PostextConfig;
}

/** The regions whose English follows British practice. */
const BRITISH = new Set(['GB', 'UK', 'IE', 'AU', 'NZ']);

/** Every convention, with the language tags each one is for. */
export const COMPOSITION_CONVENTIONS: readonly CompositionConvention[] = [
  {
    // No two hyphenated lines in a row, no divided last word, no stacks,
    // no column ending on a hyphen.
    id: 'composition-es',
    locale: 'es',
    config: {
      bodyText: {
        hyphenation: { ladders: 'avoid', maxConsecutive: 1, lastWord: 'avoid' },
        stacks: 'avoid',
        hyphenateAcrossColumns: false,
      },
    },
  },
  {
    // At most three hyphenated lines in a row, the last word whole.
    id: 'composition-en-us',
    locale: 'en-US',
    config: { bodyText: { hyphenation: { ladders: 'avoid', maxConsecutive: 3, lastWord: 'avoid' } } },
  },
  {
    // At most two hyphenated lines in a row, the last word whole.
    id: 'composition-en-gb',
    locale: 'en-GB',
    config: { bodyText: { hyphenation: { ladders: 'avoid', maxConsecutive: 2, lastWord: 'avoid' } } },
  },
  {
    // At most three hyphenated lines in a row, the last word whole.
    id: 'composition-fr',
    locale: 'fr',
    config: { bodyText: { hyphenation: { ladders: 'avoid', maxConsecutive: 3, lastWord: 'avoid' } } },
  },
  {
    // At most three hyphenated lines in a row.
    id: 'composition-de',
    locale: 'de',
    config: { bodyText: { hyphenation: { ladders: 'avoid', maxConsecutive: 3 } } },
  },
];

/** The convention of a language tag (`es`, `es-MX`, `en-GB`, the
 *  hyphenation's `en-us`, any case), if one ships. English with no region,
 *  or a region outside the British set, reads as American. */
export function compositionConventionFor(tag: string | undefined): CompositionConvention | undefined {
  if (!tag) return undefined;
  const [language = '', ...rest] = tag.toLowerCase().split(/[-_]/);
  const region = rest.find((s) => /^([a-z]{2}|\d{3})$/.test(s))?.toUpperCase();
  const id = language === 'en' ? (region && BRITISH.has(region) ? 'composition-en-gb' : 'composition-en-us') : `composition-${language}`;
  return COMPOSITION_CONVENTIONS.find((c) => c.id === id);
}

/** The convention as a design: the composition part alone. */
export function compositionConventionDesign(convention: CompositionConvention): Design {
  return { parts: ['composition'], config: structuredClone(convention.config) };
}

/** The composition settings of `config` as the engine reads them. */
function resolvedComposition(config: PostextConfig): unknown[] {
  const resolved = { bodyText: resolveBodyTextConfig(config.bodyText, config.locale) };
  return designPartSlots(['composition']).map((slot) => readDesignSlot(resolved, slot));
}

/** Whether `config` already follows the convention: every composition
 *  rule reads the same in the book as it would with the convention
 *  applied (a value written out that is the default counts as unset). */
export function followsCompositionConvention(config: PostextConfig, convention: CompositionConvention): boolean {
  const applied = applyDesign(config, compositionConventionDesign(convention));
  return sameConfig(resolvedComposition(config), resolvedComposition(applied));
}
