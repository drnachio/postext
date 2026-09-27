// Break opportunities and costs shared by the plain and the rich line
// breakers.

const EM_DASH = '—';
const EN_DASH = '–';

/** What may stand right before a closed dash a line breaks after: a letter,
 *  a digit, or punctuation that closes ("riddles.—I", "so,—and", "(1914)—the"). */
const BEFORE_DASH_RE = /[\p{L}\p{N}.,;:!?)\]}»”’"'“«…]/u;
/** The marks of {@link BEFORE_DASH_RE} that may open a quote as well as
 *  close one: a straight quote, `»` (German opens with it), `”` (Swedish and
 *  Finnish open with it), `’`, and `“` and `«`, which German and Danish
 *  close with („nein“, »nej«) and English and Spanish open with. */
const QUOTE_BEFORE_DASH_RE = /["'»”’“«]/u;
/** What must stand before such a quote for it to close a word: a letter, a
 *  digit or closing punctuation ("no"—and, “no.”—and, boys'—and). */
const BEFORE_CLOSING_QUOTE_RE = /[\p{L}\p{N}.,;:!?)\]}…]/u;
/** What must stand before `“` or `«` for it to close a word: a letter, a
 *  digit, or a stop that ends the quoted words („nein“—und, „Nein!“—und,
 *  »nej«—og). A comma, colon or bracket before them is taken for the start
 *  of a quote. */
const BEFORE_CLOSING_OPENER_RE = /[\p{L}\p{N}.!?…]/u;
/** French sets a no-break space inside its guillemets: `»` after one closes
 *  a quote (`« non »—et`). */
const NO_BREAK_SPACE_RE = /[\u00A0\u202F]/u;

/** What may follow a dash a line breaks after: a letter or a digit. Not a
 *  quotation mark, which after a dash often closes the speech the dash broke
 *  off (`thinking—" and`, German `dachte—“ sagte`), nor an opening bracket
 *  or `¿`, which pretext keeps with the dash in plain text. */
const AFTER_DASH_RE = /[\p{L}\p{N}]/u;
const DIGIT_RE = /\p{N}/u;

/** Whether the quotation mark `quote`, with `before` standing right before
 *  it, closes a word (see {@link QUOTE_BEFORE_DASH_RE}). */
function closesQuote(quote: string, before: string | undefined): boolean {
  if (before === undefined) return false;
  if (quote === '“' || quote === '«') return BEFORE_CLOSING_OPENER_RE.test(before);
  return BEFORE_CLOSING_QUOTE_RE.test(before) || (quote === '»' && NO_BREAK_SPACE_RE.test(before));
}

/**
 * Whether a line may end after the em or en dash `dash`, set closed between
 * `prev` and `next` (the characters around it; undefined at the edge of the
 * text, or where a space stands): "say—that’s", "riddles.—I", "Hamburg–Berlin".
 * `beforePrev` is the character before `prev`, read the same way.
 * The dash is the Unicode line-breaking class B2 (em) or BA (en), both of
 * which allow a break after them. Never after a dash that opens an aside or a
 * line of dialogue: a space before it ("—dijo"), or a space and a quotation
 * mark (`said "—Hola`, German `sagte »—Ich`). A straight quote, `»`, `”` or
 * `’` before the dash may open a quote as well as close one, so it counts as
 * closing only after a letter, a digit or closing punctuation ("\"no\"—and",
 * "boys'—and", "«no»—y"), and `»` also after a no-break space (French
 * "« non »—et"). `“` and `«`, which German and Danish close with, count as
 * closing only after a letter, a digit, `.`, `!`, `?` or `…` ("„nein“—und",
 * "»nej«—og"). Never before punctuation ("él—,"), a quotation mark
 * or a bracket ("thinking—\" and", "says—“no”", "says—(no)"), inside a run of
 * dashes ("——"), or inside a range of numbers set with an en dash
 * ("1914–1918"). A quote after a dash may close the speech as well as open
 * one, and UAX #14 allows no break before it; pretext, which sets plain text
 * line by line, keeps a dash with the quote or bracket after it, so both
 * breakers agree.
 */
export function breaksAfterDash(
  prev: string | undefined,
  dash: string,
  next: string | undefined,
  beforePrev?: string,
): boolean {
  if (dash !== EM_DASH && dash !== EN_DASH) return false;
  if (prev === undefined || next === undefined) return false;
  if (!BEFORE_DASH_RE.test(prev) || !AFTER_DASH_RE.test(next)) return false;
  if (QUOTE_BEFORE_DASH_RE.test(prev) && !closesQuote(prev, beforePrev)) return false;
  if (dash === EN_DASH && DIGIT_RE.test(prev) && DIGIT_RE.test(next)) return false;
  return true;
}

/** Whether `ch` is an em or an en dash. */
export function isDash(ch: string | undefined): boolean {
  return ch === EM_DASH || ch === EN_DASH;
}

const LETTER_RE = /\p{L}/u;

/** A compound: a hyphen between two letters ("after-dinner", "vencer-se"),
 *  where {@link breaksAfterHardHyphen} lets a line end. */
const COMPOUND_RE = /\p{L}-\p{L}/u;

/** Whether `text` holds a compound (see {@link COMPOUND_RE}). A soft hyphen
 *  next to the hyphen hides it, as it hides it from the breakers. */
export function hasCompound(text: string): boolean {
  return text.includes('-') && COMPOUND_RE.test(text);
}

/**
 * Whether a line may end after a hyphen the text carries, between `prev`
 * and `next` (the characters around it): between two letters only
 * ("meta-analyses", "UNE-EN"), never in "-5", "1-2" or "pre-(war)". The
 * line then ends on that hyphen and nothing is added.
 */
export function breaksAfterHardHyphen(prev: string | undefined, next: string | undefined): boolean {
  return prev !== undefined && next !== undefined && LETTER_RE.test(prev) && LETTER_RE.test(next);
}

/**
 * How far a ragged line may fall short of its measure at the cost a
 * justified line pays at its word-spacing limit, in ems of the text: the
 * right-hand "glue" of a ragged setting in Knuth and Plass's model (TeX's
 * `\rightskip` of `0pt plus 3em`). A shorter line costs less, a line short by
 * more than this is priced like one stretched past the limit.
 */
export const RAGGED_STRETCH_EM = 3;

/** The size of a CSS font string, in px (the `16px` of `italic 16px Serif`);
 *  16 when it names none. */
export function fontSizePxOf(font: string): number {
  const m = /(\d*\.?\d+)px/.exec(font);
  const size = m ? Number(m[1]) : 16;
  return Number.isFinite(size) && size > 0 ? size : 16;
}

/** The stretch a ragged line of `font` gets in the Knuth–Plass model (see
 *  {@link RAGGED_STRETCH_EM}). */
export function raggedStretchPx(font: string): number {
  return RAGGED_STRETCH_EM * fontSizePxOf(font);
}
