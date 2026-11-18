// Cached text widths: plain, run, marked, and the script-sensitivity probe.
import { cjkMarkPieces } from '../cjk/cjkClasses.js';
import { hasCJK } from '../cjk/cjk.js';
import { C, metricsOf, type InkBox } from './state.js';

// Word-level width cache. Text measurement is the engine's hottest call:
// tokenizers measure every word (plus hyphenation prefixes), and natural
// language repeats words constantly. Keyed font → text → width so the key
// needs no string concatenation. Cleared wholesale when it grows past the
// cap (rare) or when fonts change (see clearTextWidthCache).
const MAX_WIDTH_CACHE_ENTRIES = 600_000;

// The ink of a word measured for its width (#1630). Arabic vowel marks are
// cleared against the ink of the words above and below them
// (`marks/arabicMarks.ts`), and the canvas answers a width and an ink box
// in one call: asking again for the ink of a word whose width is known
// shaped it twice, 94,000 times on a long vocalised book (a seventh of its
// first layout). Kept for words in Arabic script only, the ones whose ink
// is asked for, so that other books hold nothing more.
const INK_KEPT_RE = /[\u0600-\u06FF\u0750-\u077F\u0870-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

function keepInk(text: string, font: string, metrics: TextMetrics): void {
  const ascent = (metrics as Partial<TextMetrics>).actualBoundingBoxAscent;
  const descent = (metrics as Partial<TextMetrics>).actualBoundingBoxDescent;
  if (typeof ascent !== 'number' || typeof descent !== 'number' || !Number.isFinite(ascent) || !Number.isFinite(descent)) return;
  let byText = C.ink.get(font);
  if (byText === undefined) {
    byText = new Map();
    C.ink.set(font, byText);
  }
  byText.set(text, { ascent, descent });
}

/** The ink box the canvas gave with the width of `text` in `font`, when
 *  {@link measureTextWidth} measured it in one call and kept it: what
 *  `metricsOf(text, font)` would answer again. Shared: not to be written. */
export function keptInkBox(text: string, font: string): InkBox | undefined {
  return C.ink.get(font)?.get(text);
}

export function measureTextWidth(text: string, font: string): number {
  let byText = C.width.get(font);
  if (byText === undefined) {
    byText = new Map();
    C.width.set(font, byText);
  }
  const cached = byText.get(text);
  if (cached !== undefined) return cached;

  // Two CJK marks side by side (`）》`, `”“`) are measured apart: the
  // browser would set the first half width in one run (see
  // `cjkMarkCuts`), and the renderers paint them apart. Text with no CJK
  // is never cut (`markCuts`): one measure, with no cut to look for.
  let width = 0;
  let whole: TextMetrics | undefined;
  if (!hasCJK(text)) {
    whole = metricsOf(text, font);
    width += whole.width;
  } else for (const piece of cjkMarkPieces(text, true)) width += metricsOf(piece, font).width;

  if (C.widthEntries >= MAX_WIDTH_CACHE_ENTRIES) {
    C.width = new Map();
    C.widthEntries = 0;
    C.ink = new Map();
    byText = new Map();
    C.width.set(font, byText);
  }
  if (whole !== undefined && INK_KEPT_RE.test(text)) keepInk(text, font, whole);
  byText.set(text, width);
  C.widthEntries++;
  return width;
}

// Widths of runs as the browser sets them (see `measureRunWidth`): `C.run`.

/**
 * The width of `text` set in one run, as the browser paints it: two CJK
 * marks that meet are not measured apart (see {@link measureTextWidth}).
 * For the pieces a renderer paints apart (`markPieces`), each of which
 * holds only pairs the layout measured whole.
 */
export function measureRunWidth(text: string, font: string): number {
  let byText = C.run.get(font);
  if (byText === undefined) {
    byText = new Map();
    C.run.set(font, byText);
  }
  const cached = byText.get(text);
  if (cached !== undefined) return cached;
  const width = metricsOf(text, font).width;
  if (C.runEntries >= MAX_WIDTH_CACHE_ENTRIES) {
    C.run = new Map();
    C.runEntries = 0;
    byText = new Map();
    C.run.set(font, byText);
  }
  byText.set(text, width);
  C.runEntries++;
  return width;
}

// Widths of words with no letter, measured in a script (#725): `C.marked`.

/**
 * The width of `text` set between `lead` and `trail`, less theirs: `text`
 * as the browser shapes it in the script of the mark beside it (#725, see
 * `measure/script.ts`; a word with no letter takes the script of the text
 * it stands in). `rtl`: measured in a right-to-left context, as the word is
 * painted. The mark is glued with a no-break space, so nothing kerns
 * across. For text with no CJK character (it is measured in one run).
 */
export function measureMarkedWidth(text: string, font: string, lead: string, trail: string, rtl: boolean): number {
  let byText = C.marked.get(font);
  if (byText === undefined) {
    byText = new Map();
    C.marked.set(font, byText);
  }
  const key = `${rtl ? '<' : '>'}${lead}\x00${trail}\x00${text}`;
  const cached = byText.get(key);
  if (cached !== undefined) return cached;
  // A right-to-left word is measured as it is painted: its brackets mirrored.
  const markKey = `${rtl ? '<' : '>'}${lead}\x00${trail}`;
  let mark = byText.get(markKey);
  if (mark === undefined) {
    mark = metricsOf(lead + trail, font, rtl).width;
    byText.set(markKey, mark);
    C.markedEntries++;
  }
  const width = Math.max(0, metricsOf(lead + text + trail, font, rtl).width - mark);
  if (C.markedEntries >= MAX_WIDTH_CACHE_ENTRIES) {
    C.marked = new Map();
    C.markedEntries = 0;
    byText = new Map();
    C.marked.set(font, byText);
  }
  byText.set(key, width);
  C.markedEntries++;
  return width;
}

/** The marks {@link scriptSensitive} compares: the punctuation and digits
 *  a face may draw by script. */
const SCRIPT_PROBE = '.,:;!?()[]\u00AB\u00BB\u201C\u201D\u2018\u2019\'"-\u2013\u2014/\u2026*%&0123456789';
/** Least difference between two of the probe's widths that counts, as a
 *  fraction of the smaller: above the noise of two measures, far below
 *  any change of glyph (Amiri's full stop alone moves the row by 1.3 %). */
const PROBE_TOLERANCE = 0.0005;

/**
 * Whether the face `font` draws punctuation or digits otherwise by script:
 * a fixed row of them is measured beside each of `marks` (a character of
 * each script, glued after it) and the widths compared. One false answer
 * a font string for nearly every face, which then goes no further; the
 * answer is dropped with the cached widths when faces change. A measurer
 * that tells nothing apart (no canvas, a stub) answers false.
 */
export function scriptSensitive(font: string, marks: readonly string[]): boolean {
  const known = C.sensitive.get(font);
  if (known !== undefined) return known;
  let lo = Infinity;
  let hi = -Infinity;
  for (const mark of marks) {
    const width = metricsOf(SCRIPT_PROBE + mark, font).width - metricsOf(mark, font).width;
    if (width < lo) lo = width;
    if (width > hi) hi = width;
  }
  const sensitive = Number.isFinite(lo) && lo > 0 && hi - lo > lo * PROBE_TOLERANCE;
  C.sensitive.set(font, sensitive);
  return sensitive;
}
