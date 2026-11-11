// The hyphen rules of a paragraph's search (#1466), read once from its
// options: `hyphenation.ladders`, `lastWord` and `fewerHyphens` as the
// breaker weighs them.
import type { KPItem, KPOptions } from '../types.js';

/** Hyphenated lines in a row a node counts up to: past any ladder limit. */
export const MAX_RUN = 255;

/** What the hyphen rules cost in one search. */
export interface HyphenRules {
  /** Demerits of each line past a ladder of `ladderRun` lines (0: off). */
  ladderCost: number;
  ladderRun: number;
  /** Demerits of the last word divided (0: off). */
  lastWordCost: number;
  /** Added to the penalty of every break that ends a line on a hyphen. */
  extraHyphen: number;
  /** The paragraph's last word space (-1: none, or the rule is off): a
   *  last line that starts past it holds only the end of a word. */
  lastWordSpace: number;
}

/** The hyphen rules of `options`; `withLastWordSpace` false leaves
 *  `lastWordSpace` at -1 (the WebAssembly breaker finds it itself). */
export function hyphenRulesFor(items: KPItem[], options: KPOptions, withLastWordSpace = true): HyphenRules {
  const ladderCost = options.ladders && options.ladders.demerits > 0 ? options.ladders.demerits : 0;
  const ladderRun = ladderCost > 0 ? Math.min(MAX_RUN - 1, Math.max(1, Math.round(options.ladders!.maxRun))) : 0;
  const lastWordCost = options.lastWordDemerits !== undefined && options.lastWordDemerits > 0 ? options.lastWordDemerits : 0;
  const extraHyphen = options.extraHyphenPenalty !== undefined && options.extraHyphenPenalty > 0 ? options.extraHyphenPenalty : 0;
  let lastWordSpace = -1;
  if (lastWordCost > 0 && withLastWordSpace) {
    for (let k = items.length - 1; k >= 0; k--) {
      const it = items[k]!;
      // A word space (the closing glue has no source).
      if (it.type === 'glue' && it.sourceIndex >= 0) {
        lastWordSpace = k;
        break;
      }
    }
  }
  return { ladderCost, ladderRun, lastWordCost, extraHyphen, lastWordSpace };
}
