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

/** The ideographic space U+3000 is no word space either: in Chinese and
 *  Japanese text it is a character one em wide (an indent typed as two of
 *  them, a gap in a title), which a line may break after but which never
 *  stretches on a justified line nor vanishes at a line start. */
export const IDEOGRAPHIC_SPACE = '\u3000';

/** One whitespace character a line may break at: `\s` without the
 *  no-break spaces and the ideographic space. */
export const BREAKING_SPACE_RE = /[^\S\u00A0\u2007\u202F\uFEFF\u3000]/;

/** Words and the runs of breaking whitespace between them, in order: a
 *  word may hold no-break spaces ("37 °C", "225 000") and ideographic
 *  spaces. */
export const WORDS_AND_SPACES_RE = /(?:[^\s]|[\u00A0\u2007\u202F\uFEFF\u3000])+|[^\S\u00A0\u2007\u202F\uFEFF\u3000]+/g;

/** Runs of breaking whitespace, captured, for `split` (design text keeps
 *  the separators). */
export const BREAKING_SPACE_RUNS_SPLIT_RE = /([^\S\u00A0\u2007\u202F\uFEFF\u3000]+)/;

/** Whether `ch` (one character) is whitespace a line may break at. */
export function isBreakingSpace(ch: string | undefined): boolean {
  return ch !== undefined && BREAKING_SPACE_RE.test(ch);
}

/** A word of a reference label that keeps to the word before it: one that
 *  holds a digit (`1a`, `3.2`, `(12)`), a Roman numeral in capitals (`IV`)
 *  or a single letter (`A`, `b`), brackets and stops aside. */
const KEPT_LABEL_WORD_RE = /\p{N}|^[\p{P}\p{S}]*(?:[IVXLCDM]+|\p{L})[\p{P}\p{S}]*$/u;

/**
 * The pieces a reference label of words breaks into (#702): its words and
 * the runs of breaking spaces between them, in order, or undefined when no
 * line may break inside it. A number, a Roman numeral or a single letter
 * keeps to the word before it, the space between them part of the piece
 * (`Fig. 1a`, `plate IV`, `Appendix A`, `page 12`): only a label made of
 * words breaks, and never between a word and its number. Spaces at the
 * label's ends stay with the word beside them.
 */
export function refLabelPieces(text: string): string[] | undefined {
  const parts = text.match(WORDS_AND_SPACES_RE);
  if (!parts || parts.length < 3) return undefined;
  const pieces: string[] = [];
  let piece = '';
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    const next = parts[i + 1];
    // A space is a break between two words unless the second keeps to the
    // first; one at either end of the label joins the word beside it.
    if (isBreakingSpaceRun(part) && piece.trim() !== '' && next !== undefined && !KEPT_LABEL_WORD_RE.test(next)) {
      pieces.push(piece, part);
      piece = '';
    } else {
      piece += part;
    }
  }
  if (piece !== '') pieces.push(piece);
  return pieces.length >= 3 ? pieces : undefined;
}

/** Whether `text` is nothing but breaking whitespace (and not empty). */
export function isBreakingSpaceRun(text: string): boolean {
  return /^[^\S\u00A0\u2007\u202F\uFEFF\u3000]+$/.test(text);
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
  return text.replace(/[^\S\u00A0\u2007\u202F\uFEFF\u3000]+/g, ' ').replace(/^ | $/g, '');
}

/** {@link collapseBreakingSpaces}, keeping the ideographic space (U+3000):
 *  in a Chinese title (`甄士隱夢幻識通靈　賈雨村風塵懷閨秀`, `第一回　…`) it is
 *  a character of the title, not a gap between words. */
export function collapseTitleSpaces(text: string): string {
  return text.includes('\u3000')
    ? text.split('\u3000').map(collapseBreakingSpaces).join('\u3000')
    : collapseBreakingSpaces(text);
}
