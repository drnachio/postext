// Text set to its measured width: cell pieces, the tolerance of a
// measured run and the font keys of a page (#1276: split out of primitives.ts).
import { type PDFFont, PDFOperator, type PDFPage, PDFName } from 'pdf-lib';
import { graphemesOf } from 'postext';
import { wordRuns, inRun } from '../../faceFiles.js';
import { needsComplexShaping } from '../../complexShaping.js';
import { shapesAsCanvas } from '../../shapingLanguage.js';
import { textAdvancePx, shownRun, pushPart, partsShows } from './shapedRuns.js';
import { type TextShow, type ShowPart, letterTrackingTj, letterTrackedParts, tjNumber } from './textShows.js';

/** How far (px) the characters of a segment, each at its own advance, may
 *  be from the width the layout gave the segment and still be the ones it
 *  measured. A browser's sum of advances is not the font's to the last
 *  digit: Chrome sets an em of Noto Serif JP 15.62 px wide at 15.625 px,
 *  0.135 px less over a line of 27 characters. Half a thousandth of the
 *  width covers that and stays under a kerned pair. */
function cellTolerance(widthPx: number): number {
  return Math.max(0.02, 0.0005 * Math.abs(widthPx));
}

/**
 * The characters of `text`, a segment of a line of the CJK composer
 * `widthPx` wide, each with its own advance, when the layout measured them
 * one by one and a shaper sets them otherwise together (#770); undefined
 * for any other text, which is painted as it is.
 *
 * The composer measures every CJK character alone and lets the ones that
 * advance alike share a segment, which is then one string to a renderer.
 * A face may kern inside it: Noto Serif JP sets `す。` 0.08 em closer
 * and `れ、` 0.06 em further apart, Noto Sans JP `す。` 0.1 em closer,
 * so the glyphs after the pair stood off their places and the segment
 * ended off its width. A line does not say how its segments were measured,
 * so the PDF asks its own shaper, as it does for the pieces of a word
 * (`wordPieces.ts`): the characters are painted one by one, each where the
 * one before ends, when together they are as wide as the layout measured
 * the segment ({@link cellTolerance}) and nearer to it than the string
 * shaped as the canvas shapes it. A Western run, measured whole, keeps its
 * kerning: whole, it is as wide as it was measured.
 *
 * `trackingPx` is the character spacing the segment is painted with. Only
 * in a document shaped in its own language; one that keeps the host's
 * prints its segments as it always did.
 */
export function cellPieces(font: PDFFont, text: string, widthPx: number, sizePx: number, trackingPx = 0): Array<{ text: string; width: number }> | undefined {
  if (text.length < 2 || !(sizePx > 0) || !shapesAsCanvas() || needsComplexShaping(text)) return undefined;
  const graphemes = graphemesOf(text);
  if (graphemes.length < 2) return undefined;
  const whole = Math.abs(textAdvancePx(font, text, sizePx, trackingPx).advance - widthPx);
  // Shaped whole it is where it was measured: nothing kerns inside.
  if (whole <= 0.02) return undefined;
  const pieces = graphemes.map((g) => ({ text: g, width: textAdvancePx(font, g, sizePx, trackingPx).advance }));
  let sum = 0;
  for (const piece of pieces) sum += piece.width;
  const apart = Math.abs(sum - widthPx);
  return apart <= cellTolerance(widthPx) && apart < whole ? pieces : undefined;
}

/** Below this (thousandths of the font size) the pen is left where the
 *  glyphs put it and the difference is carried to the next piece: the
 *  layout and the embedded face agree on almost every word, and the
 *  `TJ` then holds only the kerning. */
const MEASURED_TOLERANCE = 0.5;

/**
 * One show-text operator for a line's pieces (its words and spaces, each
 * with the width the layout measured it at): every piece starts where the
 * layout put it (EF-137). The face's own glyphs set each piece, a `TJ`
 * number after it moves the pen to where the next one starts, so a glyph
 * the embedded face lacks (measured by the browser in another font) or
 * any other difference between the two measures never shifts the words
 * after it. Spaces stay real space glyphs, for text extraction.
 * `trackingPx` is the character spacing (`Tc`) the line is painted with,
 * added after every glyph. Undefined when the font carries no shaper.
 */
export function measuredTextOperator(
  font: PDFFont,
  pieces: readonly { text: string; width: number }[],
  sizePx: number,
  trackingPx = 0,
): PDFOperator | undefined {
  const shows = measuredTextShows(font, pieces, sizePx, trackingPx, false);
  return shows && shows.length === 1 ? shows[0]!.op : undefined;
}

/**
 * {@link measuredTextOperator} for a face of any number of files: the
 * pieces cut into runs by file (see `faceFiles.ts`), one show-text
 * operator per stretch set in the same file. The pen carries across the
 * font switches, so every piece still starts where the layout put it. A
 * glyph the font's `/ToUnicode` map reads as other text is shown in a span
 * of its own between two of them ({@link glyphReads}).
 */
export function measuredTextShows(
  font: PDFFont,
  pieces: readonly { text: string; width: number }[],
  sizePx: number,
  trackingPx = 0,
  /** False when the caller reads the text some other way: no glyph takes
   *  a span of its own (see {@link textShows}). */
  read = true,
): TextShow[] | undefined {
  if (!(sizePx > 0)) return undefined;
  const groups: Array<{ font: PDFFont; parts: ShowPart[] }> = [];
  let group: { font: PDFFont; parts: ShowPart[] } | undefined;
  const tracking = (trackingPx / sizePx) * 1000;
  // What a ligature is owed for the letters it joins (#770).
  const letterTj = letterTrackingTj(trackingPx, sizePx);
  // How far the pen is right of where the layout wants it, in thousandths.
  let ahead = 0;
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i]!;
    let advance = 0;
    for (const word of wordRuns(font, piece.text)) {
      const file = word.font;
      const run = inRun(word, () => shownRun(file, word.text));
      if (!run) return undefined;
      if (!group || group.font !== file) {
        group = { font: file, parts: [] };
        groups.push(group);
      }
      for (const part of letterTrackedParts(run, letterTj)) pushPart(group.parts, read || typeof part !== 'object' ? part : part.hex);
      advance += run.advance + run.glyphs * tracking + (letterTj !== 0 ? run.letters * letterTj : 0);
    }
    ahead += advance - (piece.width / sizePx) * 1000;
    if (i < pieces.length - 1 && Math.abs(ahead) >= MEASURED_TOLERANCE) {
      const n = tjNumber(ahead);
      if (!group) {
        group = { font, parts: [] };
        groups.push(group);
      }
      pushPart(group.parts, n);
      ahead -= n;
    }
  }
  if (groups.length === 0) groups.push({ font, parts: [] });
  return groups.flatMap((g) => partsShows(g.font, g.parts));
}

const fontKeysByPage = new WeakMap<PDFPage, Map<PDFFont, PDFName>>();

export function fontKeyOn(page: PDFPage, font: PDFFont): PDFName {
  let keys = fontKeysByPage.get(page);
  if (!keys) {
    keys = new Map();
    fontKeysByPage.set(page, keys);
  }
  let key = keys.get(font);
  if (!key) {
    key = page.node.newFontDictionary(font.name, font.ref);
    keys.set(font, key);
  }
  return key;
}
