// A paragraph's breaks under the document's composition rules: the search
// again, exact, when the first one kept a fault another setting may avoid.
import type { KPItem, KPOptions } from '../types.js';
import { LineEdges } from './edges.js';
import { search } from './search.js';

/** A search's breaks, how many faults of the composition rules they keep
 *  (stacks, lines past a hyphen ladder's limit, the last word divided) and
 *  what they cost. */
export interface SearchResult {
  breaks: number[];
  faults: number;
  demerits: number;
}

/**
 * {@link search} under the document's composition rules (#1463, #1466).
 * Merging nodes by line and fitness alone forgets what a stack's cost
 * depends on (the edge a node's line starts on) and what a hyphen ladder's
 * does (the run of hyphenated lines a node ends on, when the ladder may be
 * longer than one line), so the chain kept may keep a fault another one
 * avoids for less. A paragraph whose setting keeps a fault is set again
 * with that state kept apart, which is exact but dearer: that search gives
 * up past `EXACT_MAX_ACTIVE` active nodes, and the first setting stands.
 * The exact one is taken when it has as many lines and costs less (a tie
 * keeps the first). `edges` are the paragraph's, built once for every
 * search over it; none when stacks cost nothing.
 */
export function limited(items: KPItem[], options: KPOptions, edges: LineEdges | undefined, longerTo?: number, maxFaults = Infinity): SearchResult | null {
  const first = search(items, options, edges, false, longerTo, maxFaults);
  if (first === null || first.faults === 0 || !(edges || longLadders(options))) return first;
  const exact = search(items, options, edges, true, longerTo, maxFaults);
  return exact !== null && exact.breaks.length === first.breaks.length && exact.demerits < first.demerits ? exact : first;
}

/** Whether a hyphen ladder may run longer than one line: its cost then
 *  depends on more than a node's own break. */
function longLadders(options: KPOptions): boolean {
  return options.ladders !== undefined && options.ladders.demerits > 0 && Math.round(options.ladders.maxRun) > 1;
}

/** The edges stacks compare in a paragraph, when they are compared: not
 *  when a stack costs nothing, which sets the lines of no stacks at all. */
export function lineEdgesFor(items: KPItem[], options: KPOptions): LineEdges | undefined {
  return options.stacks && options.stacks.demerits > 0 ? new LineEdges(items, options.stacks.minChars) : undefined;
}
