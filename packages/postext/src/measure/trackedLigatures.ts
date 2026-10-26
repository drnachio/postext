/**
 * The ligatures of a tracked text, as the measurer sees them (#663, #770).
 *
 * A tracked word is measured at its natural width, the ligatures of the
 * face counted, plus the tracking times its letters. A browser sets no
 * optional ligature under a letter-spacing, on the canvas or in a box, so
 * the word painted with the spacing alone is wider than its place: Chrome
 * 154 at 40 px, `first` 4.56 px in Newsreader and 2.76 px in Source Serif
 * 4, `office` 7 px in EB Garamond. The canvas paints such a word in
 * pieces (`canvas-backend/trackedText.ts`): each ligature alone under no
 * letter-spacing, the letters between them tracked, every piece where the
 * natural shaping puts it and the tracking of every letter before it
 * further on. This module finds the same pieces with the engine's own
 * measurer, for an output that has no painting context to ask (the HTML).
 *
 * Which letters: two neighbours whose width under a letter-spacing, the
 * spacing taken off, is not their natural width are a ligature, and a
 * third joins them the same way (f + f + i). A face whose ligature is as
 * wide as its letters (Geist's `fi`) shows nothing here, and needs
 * nothing: set apart under the letter-spacing its letters stand where the
 * layout counted them.
 *
 * A form by the neighbours is no ligature. Under a letter-spacing the
 * browser takes the contextual alternates of a face away with its
 * ligatures, and two neighbours with such forms read as a ligature to the
 * probe above (Playpen Sans: `FO`, `OR`, most pairs). A zero width
 * non-joiner between the two tells: it dissolves a ligature and leaves a
 * form by the neighbours (`canvas-backend/trackedText.ts` has the widths
 * measured). Two neighbours as wide across a non-joiner as without one
 * are left in the letters around them: the HTML sets a word with such
 * forms whole, at the letter-spacing that ends it where it was measured,
 * as the canvas paints it in a document shaped in its own language. Only
 * such a document asks here.
 *
 * In the language measured in (`getMeasureLanguage`): a face ligates
 * otherwise under a language (no `fi` in Turkish).
 */

import { needsBidi } from '../writing/bidi.js';
import { measureLanguageKey, measureSpacedWidth, measureTextWidth, onTextWidthCacheClear } from './canvas.js';
import { graphemesOf } from './graphemes.js';
import { joiningScriptIn } from './rtl/joining.js';

/** One piece of a tracked text set apart from the rest. */
export interface LigaturePiece {
  text: string;
  /** Where the piece starts in the text's natural shaping, px from its
   *  start, the kerning before it counted. */
  offset: number;
  /** Its natural width, px: alone, under no letter-spacing. */
  width: number;
  /** Its letters (graphemes): each takes the tracking once. */
  letters: number;
  /** A ligature: set under no letter-spacing. */
  ligature: boolean;
}

/** Letter-spacing the texts are probed with, px. */
const PROBE = 1;
/** Least difference, px, between a text's natural width and its width
 *  under letter-spacing (the spacing taken off) that counts as another
 *  shaping: above the noise of `measureText`, below any ligature. The
 *  canvas painter's own (`trackedText.ts`). */
const TOLERANCE = 0.05;
/** Texts remembered per font before the memory starts over. */
const MAX_TEXTS = 8192;

/** Language key and font string → text → its pieces, null for a text set
 *  whole. */
let known = new Map<string, Map<string, readonly LigaturePiece[] | null>>();
onTextWidthCacheClear(() => {
  known = new Map();
});

/** Whether `text` may be set in pieces at all: left to right, with no
 *  letter of a joining script. A right-to-left word is left whole here:
 *  the outputs give its ligatures the tracking they did. */
function divisible(text: string): boolean {
  return !joiningScriptIn(text) && !needsBidi(text);
}

/** Whether the browser shapes `text` otherwise once a letter-spacing is
 *  set. False where the canvas measures no letter-spacing. */
function shapedOtherwise(text: string, font: string): boolean {
  const one = measureSpacedWidth(text, font, PROBE);
  const two = measureSpacedWidth(text, font, 2 * PROBE);
  if (one === undefined || two === undefined) return false;
  // What one more unit of spacing adds: the spacing after each letter.
  const step = two - one;
  // A measurer that takes no letter-spacing (a test stub, an old browser).
  if (!(step > PROBE / 2)) return false;
  return Math.abs(one - step - measureTextWidth(text, font)) > TOLERANCE;
}

/** ZERO WIDTH NON-JOINER: between two letters it asks for no ligature of
 *  them. */
const ZWNJ = '\u200C';

/** Whether two neighbours the letter-spacing reshapes are a ligature: a
 *  non-joiner between them changes their natural width (see the module
 *  comment). */
function ligated(first: string, second: string, font: string): boolean {
  return Math.abs(measureTextWidth(first + ZWNJ + second, font) - measureTextWidth(first + second, font)) > TOLERANCE;
}

function piecesOf(text: string, font: string): readonly LigaturePiece[] | null {
  if (!divisible(text)) return null;
  const letters = graphemesOf(text);
  if (letters.length < 2 || !shapedOtherwise(text, font)) return null;
  const groups: { start: number; end: number; ligature: boolean }[] = [];
  let ligatures = 0;
  for (let k = 0; k < letters.length;) {
    let end = k + 1;
    while (end < letters.length && shapedOtherwise(letters[end - 1]! + letters[end]!, font) && ligated(letters[end - 1]!, letters[end]!, font)) end++;
    const ligature = end - k > 1;
    const last = groups[groups.length - 1];
    if (!ligature && last && !last.ligature) last.end = end;
    else groups.push({ start: k, end, ligature });
    if (ligature) ligatures++;
    k = end;
  }
  // Shaped otherwise as a whole but by no ligature of two neighbours: left
  // whole.
  if (ligatures === 0) return null;
  const natural = (from: number, to: number): number => measureTextWidth(letters.slice(from, to).join(''), font);
  return groups.map((g) => ({
    text: letters.slice(g.start, g.end).join(''),
    offset: g.start === 0 ? 0 : natural(0, g.start + 1) - natural(g.start, g.start + 1),
    width: natural(g.start, g.end),
    letters: g.end - g.start,
    ligature: g.ligature,
  }));
}

/**
 * The pieces a tracked `text` (a word, or any text set as one run) is set
 * in, in `font` and the language measured in, or null when it is set
 * whole: the browser shapes it the same under a letter-spacing, the
 * canvas measures none, or the text holds a joining letter or a
 * right-to-left one.
 */
export function trackedLigaturePieces(text: string, font: string): readonly LigaturePiece[] | null {
  if (text.length < 2) return null;
  const key = measureLanguageKey() + font;
  let byText = known.get(key);
  if (!byText) known.set(key, byText = new Map());
  let pieces = byText.get(text);
  if (pieces === undefined) {
    pieces = piecesOf(text, font);
    if (byText.size >= MAX_TEXTS) byText.clear();
    byText.set(text, pieces);
  }
  return pieces;
}
