export const KP_INFINITY = 10000;
export const HYPHEN_PENALTY = 50;
export const DEFAULT_CONSECUTIVE_HYPHEN_DEMERIT = 3000;
/** Extra badness of a hyphen that breaks a strict rule
 *  (`KPOptions.strictHyphens`): a second hyphenated line in a row, or the
 *  paragraph's last word divided. Like {@link COLUMN_END_HYPHEN_BADNESS},
 *  it outweighs any line within the word-spacing limits and stays below a
 *  line stretched past them. */
export const STRICT_HYPHEN_BADNESS = 1000;
/** Extra badness of a third (or later) hyphenated line in a row under
 *  `KPOptions.strictHyphens`: a run the strict rule already gave way on
 *  once must not grow, so it outweighs a line well past the stretch limit. */
export const STRICT_HYPHEN_RUN_BADNESS = 3000;
/** Default lines a hyphen wants free of hyphens before it
 *  (`KPOptions.hyphenSpacing`): 2 also avoids a hyphen every other line. */
export const DEFAULT_HYPHEN_SPACING_LINES = 2;
/** Default extra badness of a hyphen closer than that to the previous one. */
export const DEFAULT_HYPHEN_SPACING_BADNESS = 300;
/** Extra badness of every hyphen per step of `BodyTextConfig.fewerHyphens`
 *  (0–10, InDesign's slider from "Better spacing" to "Fewer hyphens"). */
export const FEWER_HYPHENS_STEP_BADNESS = 200;
/** Extra badness of a break against a rule set as a limit (a hyphen run
 *  past `KPOptions.hyphenRules.maxRun`, a stack at this cost, a repeated
 *  monosyllable): it outweighs any line the breaker can
 *  set (a line stretched past the word-spacing limits included, up to some
 *  seven times its stretch), so the rule gives way only where no setting
 *  of the paragraph keeps it. */
export const HARD_RULE_BADNESS = 100000;
/** Default extra badness of a stack (`KPOptions.stacks`): dearer than a
 *  hyphen or a loose line. */
export const DEFAULT_STACK_BADNESS = 500;
/** Default letters two words must share at a line's edge to stack. */
export const DEFAULT_STACK_MIN_CHARS = 3;
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
 *  is set ragged instead of stretched (`pipeline/text/raggedLines.ts`). The
 *  breaker's looseness gate counts such lines apart from the ones that
 *  stay justified. */
export const RAGGED_SPACE_RATIO = 3;

export const SOFT_HYPHEN = '\u00AD';
