// The hyphen rules in the line breaker (#1466): what `bodyText.hyphenation`
// hands it. A rule at `'allow'` or `'warn'`, or whose penalty is 0, hands
// nothing, so the breaker does no extra work and the measurement cache keys
// stay as they were.
import type { ResolvedHyphenationConfig } from '../../types.js';

/** Penalty one step of `hyphenation.fewerHyphens` adds to every hyphen: the
 *  cost of a hyphen (`HYPHEN_PENALTY`). */
export const FEWER_HYPHENS_STEP = 50;

/** The hyphen rules the breaker weighs for this hyphenation, each absent
 *  when off. */
export interface HyphenBreaking {
  ladders?: { maxRun: number; demerits: number };
  lastWordDemerits?: number;
  extraHyphenPenalty?: number;
}

export function hyphenBreaking(h: ResolvedHyphenationConfig): HyphenBreaking {
  const out: HyphenBreaking = {};
  if (h.ladders === 'avoid' && h.ladderPenalty > 0) out.ladders = { maxRun: h.maxConsecutive, demerits: h.ladderPenalty };
  if (h.lastWord === 'avoid' && h.lastWordPenalty > 0) out.lastWordDemerits = h.lastWordPenalty;
  if (h.fewerHyphens > 0) out.extraHyphenPenalty = h.fewerHyphens * FEWER_HYPHENS_STEP;
  return out;
}
