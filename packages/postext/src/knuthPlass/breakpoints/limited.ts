// A paragraph's breaks under the document's limits: the search again,
// exact, when the first one broke a limit another setting may keep.
import type { KPItem, KPOptions } from '../types.js';
import { search } from './search.js';

/**
 * {@link search} under the document's limits. Merging nodes by line and
 * fitness alone forgets what a limit's cost depends on (the hyphen run a
 * node closes, the edge its line starts on), so a chain may break a limit
 * another one keeps. Most paragraphs keep their limits that way; one that
 * does not is set again with that state kept apart, which is exact but
 * dearer.
 */
export function limited(items: KPItem[], options: KPOptions, longerTo?: number, maxHard = Infinity): SearchResult | null {
  const first = search(items, options, false, longerTo, maxHard);
  if (first === null || first.hard === 0) return first;
  if (!options.stacks && !((options.hyphenRules?.maxRun ?? 0) > 0)) return first;
  const exact = search(items, options, true, longerTo, maxHard);
  return exact !== null && exact.hard <= first.hard ? exact : first;
}

/** A search's breaks, and how many limits they break (`ActiveNode.hard`). */
export interface SearchResult {
  breaks: number[];
  hard: number;
}
