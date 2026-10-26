/**
 * The pieces of a word, painted as the word the layout measured (postext
 * #764, #770).
 *
 * The line breaker cuts a word wherever a line may end inside it, and a
 * line carries each piece as a segment of its own. In a paragraph with a
 * style, a link or a note a piece is as wide as the word grew by it, so a
 * face that draws across a cut (the dot of a Catalan `l·l` in Crimson
 * Pro, a ligature, a kerned pair) leaves a hole or an overlap when the
 * pieces are shaped one by one.
 *
 * Which pieces are set as one text is the engine's rule
 * (`lineWordSegments` of postext, `wordPieces.ts` there): the same for
 * the canvas, the HTML and the PDF, each asking its own text setter. It
 * also sets apart the hyphen of a line end where the layout measured it
 * apart, and sets the rest of a word that opens a line as one text. Here
 * it is asked of the PDF's shaper, in a document shaped in its own
 * language; a document that keeps the host's language is painted piece by
 * piece, as every word was up to postext-pdf 1.29, and prints the same
 * bytes.
 *
 * The rule compares widths to half a thousandth, and a browser does not
 * set a face at the size it is asked for: Chrome cuts the size to a
 * hundredth of a pixel ({@link browserSizePx}), so the layout it measured
 * is narrower than the PDF's advances at the full size by up to that
 * hundredth: 0.041 % at 20.2083 px (9.7 pt at 150 dpi), 0.072 % at
 * 11.4583 px. At 9.7 pt the head `cor-` of a line end in STIX Two Text,
 * measured 27.068 + 6.363 px, was 27.079 + 6.366 px to the PDF: the body
 * 0.051 % from what the place left it, over the half thousandth, so the
 * hyphen stayed in the head's text and its kerning against the `r`
 * (-0.505 px) ended the line 0.24 pt short; 37 line ends of a 32-page
 * novella went that way. Where the cut is past half a thousandth nothing
 * is joined at all. So the rule is asked at the size the browser set the
 * face at, and again at the size asked for when that sets nothing
 * otherwise: a layout measured with no browser (the command line's own
 * measure) has the advances of the full size.
 */
import { lineWordSegments } from 'postext';
import type { VDTLine, VDTLineSegment } from 'postext';
import { shapesSegmentLanguages } from '../../shapingLanguage.js';

/**
 * The size (px) Chrome sets a face at when asked for `sizePx`: cut to a
 * hundredth of a pixel, in single precision, on the canvas as in a page.
 * Measured in Chrome 154 (the advance of thirty letters of STIX Two Text,
 * 13.31 em): 20.2083 px is set at 20.20, 19.5833 at 19.58, 21.6667 at
 * 21.66, 15.4167 at 15.41, 11.4583 at 11.45; 20.3 at 20.29 and 20.22 at
 * 20.21, whose nearest single-precision numbers lie under them, and 20.23
 * and 15.42 at themselves.
 */
export function browserSizePx(sizePx: number): number {
  const cut = Math.floor(Math.fround(Math.fround(sizePx) * 100)) / 100;
  return cut > 0 ? cut : sizePx;
}

/** The size a text's advance is asked at, given the size of its face. */
export type SetSize = (sizePx: number) => number;

/**
 * The segments a line is painted from: its own, with the pieces of a
 * word joined into one segment where the word was measured whole, and
 * the hyphen of a line end as a segment of its own where the layout
 * measured it apart. `advanceOf` is the advance the PDF gives `text` in
 * the style of the segment `seg` (px, with the line's character spacing),
 * its face at the size `sizeOf` makes of its own: the one a browser set
 * it at, then the one asked for (see the module comment).
 *
 * The line's own array when nothing changes: a line of the CJK composer
 * or down a vertical page (`composed`), a line that carries directions,
 * a document that keeps the host's language, a line whose pieces are each
 * as wide alone as measured.
 */
export function wordSegments(line: VDTLine, composed: boolean, advanceOf: (seg: VDTLineSegment, text: string, sizeOf: SetSize) => number): VDTLineSegment[] | undefined {
  if (!shapesSegmentLanguages()) return line.segments;
  // Whether the browser's size is another than the one asked for, for a
  // face the rule asked about.
  let cut = false;
  const browser: SetSize = (sizePx) => {
    const set = browserSizePx(sizePx);
    if (set !== sizePx) cut = true;
    return set;
  };
  const segments = lineWordSegments(line, composed, (seg, text) => advanceOf(seg, text, browser));
  if (segments !== line.segments || !cut) return segments;
  return lineWordSegments(line, composed, (seg, text) => advanceOf(seg, text, asAsked));
}

const asAsked: SetSize = (sizePx) => sizePx;
