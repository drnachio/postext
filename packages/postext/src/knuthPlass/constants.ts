export const KP_INFINITY = 10000;
export const HYPHEN_PENALTY = 50;
export const DEFAULT_CONSECUTIVE_HYPHEN_DEMERIT = 3000;
export const DEFAULT_FITNESS_CLASS_DEMERIT = 100;
export const BADNESS_CAP = 10000;
/** Extra badness for a line stretched beyond `maxWordSpacing` (adjustment
 *  ratio above 1). TeX rejects such lines outright below its tolerance; here
 *  they stay legal — a paragraph may have no other way to set — but they
 *  must cost more than any soft preference (runt avoidance, a hyphen), so a
 *  short last line or a hyphenated last word is chosen before word spacing
 *  overshoots the limit. Scaled to stay above the configured runt penalty,
 *  and multiplied by the square of the adjustment ratio, so the cost rises
 *  with the overshoot (see `computeBreakpoints`). */
export const OVER_STRETCH_BADNESS = 2000;
/** Extra badness of a line that takes tracking (`KPOptions.trackingPerChar`)
 *  at the full capacity of its letters, scaled by the square of the share it
 *  uses: tracking only ever sets a line word spacing alone would take past
 *  its limits, and such a line stays dearer than one within them. */
export const TRACKING_BADNESS = 100;
/** Extra badness of a hyphenated break ending a line that closes a column
 *  or a page (`KPOptions.avoidHyphenAtLines`). On the runt penalty's scale:
 *  it outweighs any line within the word-spacing limits (and a hyphen
 *  elsewhere), and stays below the cost of a line stretched past them. */
export const COLUMN_END_HYPHEN_BADNESS = 1000;
export const MAX_STRETCH = Number.MAX_SAFE_INTEGER;
/** Word spacing (justified over normal space) past which a justified line
 *  is set ragged instead of stretched (`pipeline/raggedLines.ts`). The
 *  breaker's looseness gate counts such lines apart from the ones that
 *  stay justified. */
export const RAGGED_SPACE_RATIO = 3;

export const SOFT_HYPHEN = '\u00AD';
