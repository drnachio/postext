// Show-text operators shaped once per font and text, letter tracking
// as TJ numbers, and the shows of a word (#1276: split out of primitives.ts).
import { type PDFFont, PDFOperator, showText } from 'pdf-lib';
import { noteMissingGlyphs, fileRuns, wordRuns, inRun, type FileRun } from '../../faceFiles.js';
import { shapingKey, shapesAsCanvas } from '../../shapingLanguage.js';
import { shownRun, partsOperator, plainParts, partsShows, type ShownRun, pushPart } from './shapedRuns.js';

// Text is drawn a word at a time (the layout engine positions every
// word), and pdf-lib's `drawText` shapes each call afresh through fontkit —
// the same words, over and over. The show-text operator of a (font, text)
// pair never changes, so it is shaped once and reused; the font's resource
// key on a page likewise.
const showByFont = new WeakMap<PDFFont, Map<string, PDFOperator>>();
export const ENCODE_CACHE_SLOTS = 50_000;

/** A glyph fontkit laid out: its id in the font file and the characters
 *  the font's `/ToUnicode` map gives it (see {@link glyphReads}). */
export interface LaidGlyph {
  id: number;
  advanceWidth: number;
  codePoints: number[];
}

/** The fontkit side of a pdf-lib custom font — what kerning needs. */
export interface ShapingFace {
  unitsPerEm: number;
  layout(text: string, features?: unknown): {
    glyphs: LaidGlyph[];
    positions: Array<{ xAdvance: number; xOffset: number }>;
  };
}

/** A glyph of a show-text array read as `text`, not as the characters the
 *  font's `/ToUnicode` map gives it (#755, {@link glyphReads}): shown in a
 *  `/Span` of its own whose `/ActualText` is `text`. `hex` is its code. */
interface ReadGlyph {
  hex: string;
  text: string;
}

/** A part of a show-text array: a run of glyph codes, a pen adjustment, or
 *  a glyph read through a span. */
export type ShowPart = string | number | ReadGlyph;

/** Round a TJ adjustment to 1/100 of a text-space unit. */
export function tjNumber(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * The show-text operator for `text`, carrying the shaper's glyph positions.
 *
 * pdf-lib's `encodeText` shapes through fontkit but keeps only the glyph
 * ids, so a viewer advances each glyph by its raw width (the `W` array) and
 * the GPOS kerning the canvas measured with is lost: in a tightly kerned
 * face (Geist: `referencia` is 0.21 em narrower kerned) each word paints
 * wider than the layout engine placed it and eats the following space.
 * Emit a `TJ` array instead whose numbers restore every glyph's
 * `xAdvance` / `xOffset`; a run without adjustments stays a plain `Tj`.
 */
export function showTextShaped(font: PDFFont, text: string, letterTj = 0): PDFOperator {
  // A tracked text with a ligature is another show at each tracking
  // ({@link letterTrackedParts}); it is not kept.
  if (letterTj !== 0) {
    const spaced = shownRun(font, text);
    if (spaced && spaced.joined.length > 0) return partsOperator(font, plainParts(letterTrackedParts(spaced, letterTj)));
  }
  let cache = showByFont.get(font);
  if (!cache) {
    cache = new Map();
    showByFont.set(font, cache);
  }
  // Text shaped in another language or script is another show.
  const key = shapingKey(text);
  const hit = cache.get(key);
  if (hit) return hit;
  const run = shownRun(font, text);
  let op: PDFOperator;
  if (run) op = partsOperator(font, plainParts(run.parts));
  else {
    // A standard font: no shaper, pdf-lib's own encoding.
    noteMissingGlyphs(font, text);
    op = showText(font.encodeText(text));
  }
  if (cache.size >= ENCODE_CACHE_SLOTS) cache.clear();
  cache.set(key, op);
  return op;
}

/** A show-text operator and the font (a file of the face) it shows in. */
export interface TextShow {
  font: PDFFont;
  op: PDFOperator;
}

/** The show-text operators of `text` in `font`'s face: one
 *  ({@link showTextShaped}) for a face of one file, else one per run of
 *  characters set in the same file (see `faceFiles.ts`). A glyph the
 *  font's `/ToUnicode` map reads as other text is shown in a span of its
 *  own ({@link glyphReads}), unless `read` is false: the caller reads the
 *  text some other way (an `/ActualText` over all of it, a figure's
 *  alternate text).
 *
 *  In a document shaped in its own language the text is shaped word by
 *  word, as the canvas shaped it (`wordRuns`, #770), and the words that
 *  follow each other in one file are one operator; with `whole` it is
 *  shaped as one string, as the text of a drawing is (a browser lays an
 *  SVG's text out as it does a page's, not as its canvas does). */
export function textShows(font: PDFFont, text: string, read = true, whole = false, letterTj = 0): TextShow[] {
  const runs = whole ? fileRuns(font, text) : wordRuns(font, text);
  if (runs.length > 1 && !whole && shapesAsCanvas()) {
    const joined = joinedShows(runs, read, letterTj);
    if (joined) return joined;
  }
  return runs.flatMap((run) => inRun(run, () => {
    const shown = read ? shownRun(run.font, run.text) : undefined;
    return shown?.reads ? partsShows(run.font, letterTrackedParts(shown, letterTj)) : [{ font: run.font, op: showTextShaped(run.font, run.text, letterTj) }];
  }));
}

/**
 * The character spacing a ligature is owed for the letters it joins, as a
 * `TJ` number (thousandths of the font size), for a text of `sizePx`
 * painted under a character spacing of `trackingPx` (#770); 0 when it is
 * owed none.
 *
 * The layout counts the tracking once a letter, and `Tc` follows every
 * glyph: a ligature, one glyph for two or three letters, advanced by one
 * tracking, and the word ended a tracking short of the width measured for
 * each letter joined (`shift` in Source Serif 4 at 19.58 px, 0.39 px a
 * letter: 0.39 px short). In a document shaped in its own language the
 * pen moves on after a ligature by the tracking of its other letters
 * ({@link letterTrackedParts}), as the canvas and the HTML set it; one
 * that keeps the host's language prints as it did.
 */
export function letterTrackingTj(trackingPx: number, sizePx: number): number {
  return trackingPx !== 0 && sizePx > 0 && shapesAsCanvas() ? (trackingPx / sizePx) * 1000 : 0;
}

/**
 * The parts of `run` with, after each glyph that stands for several
 * letters ({@link ShownRun.joined}), a pen movement of `letterTj` for
 * each letter but the first: the tracking `Tc` gave the glyph once and
 * the layout counted once a letter. The run's own parts when it holds no
 * such glyph or is not tracked.
 */
export function letterTrackedParts(run: ShownRun, letterTj: number): ShowPart[] {
  if (letterTj === 0 || run.joined.length === 0) return run.parts;
  const out: ShowPart[] = [];
  // Glyphs shown so far, and the next entry of `joined` to place.
  let glyph = 0;
  let next = 0;
  for (const part of run.parts) {
    if (typeof part === 'number') {
      pushPart(out, part);
      continue;
    }
    const hex = typeof part === 'string' ? part : part.hex;
    const count = hex.length / 4;
    if (typeof part === 'object') {
      out.push(part);
      for (; next < run.joined.length && run.joined[next]![0] < glyph + count; next++) pushPart(out, tjNumber(-run.joined[next]![1] * letterTj));
      glyph += count;
      continue;
    }
    let from = 0;
    for (let k = 0; k < count && next < run.joined.length; k++) {
      if (run.joined[next]![0] !== glyph + k) continue;
      pushPart(out, hex.slice(from * 4, (k + 1) * 4));
      pushPart(out, tjNumber(-run.joined[next]![1] * letterTj));
      from = k + 1;
      next++;
    }
    if (from < count) pushPart(out, hex.slice(from * 4));
    glyph += count;
  }
  return out;
}

/** The show-text operators of `runs` (`wordRuns`), the runs that follow
 *  each other in one file joined into one operator: the pen carries from
 *  each to the next, and nothing is kerned across. Undefined when a run's
 *  font carries no shaper (a standard font). */
function joinedShows(runs: readonly FileRun[], read: boolean, letterTj = 0): TextShow[] | undefined {
  const groups: Array<{ font: PDFFont; parts: ShowPart[] }> = [];
  for (const run of runs) {
    const shown = inRun(run, () => shownRun(run.font, run.text));
    if (!shown) return undefined;
    let group = groups[groups.length - 1];
    if (!group || group.font !== run.font) {
      group = { font: run.font, parts: [] };
      groups.push(group);
    }
    for (const part of letterTrackedParts(shown, letterTj)) pushPart(group.parts, read || typeof part !== 'object' ? part : part.hex);
  }
  return groups.flatMap((g) => partsShows(g.font, g.parts));
}
