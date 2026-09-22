import type { VDTLine } from '../vdt';
import type { TextAlign } from '../types';

export interface MeasuredBlock {
  lines: VDTLine[];
  totalHeight: number;
  /** Set on the optimal path when runt avoidance is on and the paragraph
   *  still ends in one: its last line is narrower than the runt threshold.
   *  The pipeline may then set the paragraph a line shorter (see
   *  `bodyText.tightenRunts`). */
  lastLineRunt?: boolean;
}

export interface MeasurementCache {
  _blocks: Map<string, MeasuredBlock>;
}

export interface MeasureBlockOptions {
  textAlign?: TextAlign;
  hyphenate?: boolean;
  firstLineIndentPx?: number;
  hangingIndent?: boolean;
  /** Use Knuth-Plass optimal line breaking instead of greedy. */
  optimal?: boolean;
  /** Max space stretch ratio (for K-P glue model). Default 1.5. */
  maxStretchRatio?: number;
  /** Min space shrink ratio (for K-P glue model). Default 0.8. */
  minShrinkRatio?: number;
  /** Demerit for a too-short final line (runt). 0 disables. */
  runtPenalty?: number;
  /** Approximate minimum characters on the final line before runt penalty
   *  applies. Converted internally to a pixel threshold via normal space width. */
  runtMinCharacters?: number;
  /** Knuth-Plass looseness: re-break the paragraph with this many lines more
   *  (column balancing's "run a paragraph long" lever) or fewer — negative —
   *  when a feasible sequence of that length exists. Ignored on the greedy
   *  path. */
  looseness?: number;
  /** Tracking: extra advance added after every character (px). Column
   *  balancing uses a little positive tracking on a loose paragraph when
   *  word spacing alone cannot gain the line, and a little negative tracking
   *  to set a paragraph short and pull up a runt. Rich path only. */
  letterSpacingPx?: number;
}

export const SOFT_HYPHEN = '\u00AD';
