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
 *  overshoots the limit. Scaled to stay above the configured runt penalty. */
export const OVER_STRETCH_BADNESS = 2000;
export const MAX_STRETCH = Number.MAX_SAFE_INTEGER;

export const SOFT_HYPHEN = '\u00AD';
