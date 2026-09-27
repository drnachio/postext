/**
 * Spaces that glue their neighbours (EF-66): the no-break space U+00A0, the
 * figure space U+2007, the narrow no-break space U+202F and the zero-width
 * no-break space U+FEFF. JavaScript's `\s` matches all four, so a breaker
 * that splits words on `\s` would break the line at them; the word breakers
 * split on {@link BREAKING_SPACE_RE} instead and keep them inside the word
 * they join, set at their own width (justification stretches word spaces
 * only). The word joiner U+2060 is no whitespace and glues already.
 */
export const NO_BREAK_SPACES = '\u00A0\u2007\u202F\uFEFF';

/** One whitespace character a line may break at: `\s` without the
 *  no-break spaces. */
export const BREAKING_SPACE_RE = /[^\S\u00A0\u2007\u202F\uFEFF]/;

/** Words and the runs of breaking whitespace between them, in order: a
 *  word may hold no-break spaces ("37 °C", "225 000"). */
export const WORDS_AND_SPACES_RE = /(?:[^\s]|[\u00A0\u2007\u202F\uFEFF])+|[^\S\u00A0\u2007\u202F\uFEFF]+/g;

/** Runs of breaking whitespace, captured, for `split` (design text keeps
 *  the separators). */
export const BREAKING_SPACE_RUNS_SPLIT_RE = /([^\S\u00A0\u2007\u202F\uFEFF]+)/;

/** Whether `ch` (one character) is whitespace a line may break at. */
export function isBreakingSpace(ch: string | undefined): boolean {
  return ch !== undefined && BREAKING_SPACE_RE.test(ch);
}

/** Whether `text` is nothing but breaking whitespace (and not empty). */
export function isBreakingSpaceRun(text: string): boolean {
  return /^[^\S\u00A0\u2007\u202F\uFEFF]+$/.test(text);
}

/** Whether `text` sets nothing: empty, or breaking whitespace only. A
 *  no-break space (U+00A0, U+2007, U+202F) is content, as in CommonMark,
 *  where a line holding one is no blank line (`String.prototype.trim` would
 *  strip it). The zero-width U+FEFF has no width to keep and is mostly a
 *  byte-order mark left by a pasted file, so a text of it alone is blank,
 *  as `trim` has it. */
export function isBlankText(text: string): boolean {
  return /^[^\S\u00A0\u2007\u202F]*$/.test(text);
}

/** `text` with every run of breaking whitespace set as one space and the
 *  ends trimmed of it; no-break spaces stay as they are. */
export function collapseBreakingSpaces(text: string): string {
  return text.replace(/[^\S\u00A0\u2007\u202F\uFEFF]+/g, ' ').replace(/^ | $/g, '');
}
