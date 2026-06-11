import type { VDTLine } from '../vdt';
import type { TextAlign } from '../types';

export interface MeasuredBlock {
  lines: VDTLine[];
  totalHeight: number;
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
  /** Knuth-Plass looseness: re-break the paragraph with this many extra lines
   *  when feasible within the stretch limit (column balancing's "run a
   *  paragraph long" lever). Ignored on the greedy path. */
  looseness?: number;
}

export const SOFT_HYPHEN = '\u00AD';
