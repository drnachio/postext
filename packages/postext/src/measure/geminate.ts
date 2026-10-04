/** The middle dot (U+00B7) of a Catalan ela geminada, `l·l`. */
export const GEMINATE_DOT = '·';

/**
 * Whether a line that ends at a syllable break right after `text` ends
 * inside a Catalan `l·l`. The IEC divides `il·lusió` as `il-` | `lusió`: the
 * hyphen takes the place of the middle dot (*Llibre d'estil*, VI § 2.3).
 * The dictionary puts a break after that dot only there.
 */
export function endsInsideGeminate(text: string): boolean {
  const n = text.length;
  return n >= 2 && text[n - 1] === GEMINATE_DOT && (text[n - 2] === 'l' || text[n - 2] === 'L');
}

/** `text`, which ends at a syllable break, with the hyphen the line ends on:
 *  appended, or in place of the middle dot of an `l·l`. */
export function withLineEndHyphen(text: string): string {
  return endsInsideGeminate(text) ? text.slice(0, -1) + '-' : text + '-';
}
