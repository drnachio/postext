import { bidiClassOf, needsBidi } from '../writing/bidi.js';
import { graphemesOf } from '../measure/graphemes.js';
import { joiningScriptIn } from '../measure/rtl/joining.js';
import { hasCJK } from '../measure/cjk/cjk.js';
import { paintAsOneRun } from './mirrorFrame.js';
import { letterSpacingOf, setLetterSpacing } from './contextState.js';
import { contextTextWidth } from './contextText.js';

/**
 * Tracked words keep their ligatures (#663).
 *
 * A tracked word is measured as its natural width plus the tracking times
 * its letters (`measure/rich.ts`, `knuthPlass/tracking.ts`), and its natural
 * width counts the ligatures of the face (fi, fl, ffi…). Painted with the
 * context's `letterSpacing`, the browser shapes it without them (CSS Text:
 * no optional ligatures where the letter-spacing is not zero): "first" in
 * Newsreader comes out 4.5 px wider at 40 px than the place the layout
 * holds for it, and runs into the word space after it. The canvas has no
 * way to ask for the ligatures back, so such a word is painted in pieces:
 * each ligature alone with no letter-spacing, the letters between them
 * tracked, every piece where the natural shaping puts it. The PDF does the
 * same by construction (it shapes the word and spaces its glyphs).
 *
 * Which words: the ones whose width at a letter-spacing, less that
 * letter-spacing, is not their natural width. A word the browser shapes
 * the same either way (nearly all of them) is painted as before, with one
 * `fillText`.
 *
 * The same holds for any tracked text painted with one `fillText` (#703):
 * a line or a run of a design text (running heads, openers, callout
 * titles, balloon lettering) and the sideways Latin run of a vertical
 * line come through here as a word does.
 *
 * Three rules of direction (#685, #703):
 * - the pieces are one run. On a right-to-left page, painted through a
 *   mirror that turns every `fillText` back about its own box
 *   (`mirrorFrame.ts`), the word is turned once, about the box it was
 *   measured in, and its pieces are set inside it from its left end, as on
 *   a left-to-right page. Turned one by one they stood in the mirror's
 *   order: "five" read "vefi";
 * - a word that holds a letter of a joining script (Arabic…) is never cut,
 *   whoever asks: painted in pieces it loses its joins. Nor is a text in
 *   two directions (a Hebrew word with a number or a Latin letter in it):
 *   its pieces would not stand in one order;
 * - a right-to-left word of a script that does not join (Hebrew) is cut
 *   like any other, where the painter set the context right to left for
 *   it (`fillSegmentWord`, `paintRunInDirection`): its pieces are set from
 *   the right end of its box, each painted right to left.
 *
 * The tracking of a ligature (#770). The layout counts the tracking once
 * a letter: a word is its natural width and the tracking times its
 * letters, and that is what the browser paints wherever the
 * letter-spacing dissolves nothing (Geist's `fi` is one glyph as wide as
 * `f` and `i`: under a letter-spacing the two letters are set apart, each
 * with the tracking after it). A ligature painted alone advanced by one
 * tracking, as one glyph, so a word that held one ended a tracking short
 * of its box for each letter the ligature had joined: `shift` in Source
 * Serif 4 at 19.58 px on a line justified with 0.39 px a letter, box
 * 43.37 px, painted 42.98 px, and `efit` on a line tightened by 0.34 px
 * ran 0.34 px over the word after it. In a document shaped in its own
 * language ({@link setLetterTracking}) the piece after a ligature starts
 * the tracking of every letter before it further on, the ligature's
 * letters each counted: the word ends where its box does, and the HTML
 * and the PDF set it the same. A document that keeps its host's language
 * is painted as it was, and so is a right-to-left word of any document
 * (a Hebrew face with a ligature): one tracking a ligature in the three
 * outputs.
 *
 * What a letter-spacing takes away besides ligatures (#770). Chrome sets
 * no contextual alternate either under a letter-spacing (`calt`, with
 * `liga` and `clig`), and the canvas cannot ask for them back. Cormorant
 * SC draws the hyphen between two capitals 1.47 px wider at 17.71 px: the
 * running head `A MAD TEA-PARTY`, tracked 2.5 px, was measured 192.76 px
 * and painted 191.30 px, no pair of its letters being a ligature. Playpen
 * Sans gives nearly every letter another form by its neighbours, so most
 * pairs read as ligatures and their pieces stood where no shaping puts
 * them: `UNIT 12` at 18.75 px, measured 98.52 px, ended at 97.70 px, and
 * `FOR PARENTS AND CARERS` 1.31 px past its 322.85 px. In a document
 * shaped in its own language a word whose pieces do not end where the
 * word was measured to end, or that the letter-spacing reshapes with no
 * ligature to keep, is painted whole at the letter-spacing that ends it
 * there: the tracking, and what the reshaping took or gave shared among
 * its letters (2.66 px a letter for `TEA-PARTY`). A text of several words
 * is then painted word by word, each where the natural shaping puts it
 * with the tracking of every letter before it, as the HTML sets its boxes
 * ({@link fittedParts}). The forms are the ones the browser draws under a
 * letter-spacing; the widths are the ones measured.
 *
 * A ligature and a form by the neighbours told apart (#770). To the probe
 * they read the same: two neighbours whose width under a letter-spacing,
 * the spacing taken off, is not their natural width. A ligature is one
 * glyph, which no spacing opens; a form by the neighbours is still a
 * glyph a letter, and under a letter-spacing the browser sets the same
 * letters in their plain forms, each spaced. Playpen Sans reshapes `FO`
 * and `OR` so: `FOR`, read as a ligature of three, was painted with no
 * tracking inside and the tracking of its three letters after it. In
 * `FOR PARENTS AND CARERS` at 17.71 px, tracked 3.125 px, its letters
 * stood as close as in untracked text, those of the three other words
 * 2.9 to 3.2 px apart, and 18.2 px lay between `FOR` and `PARENTS`
 * against 12 px between the other words. A zero width non-joiner between
 * the two letters tells them apart: it dissolves a ligature and leaves a
 * form by the neighbours as it is. Chrome 154: `fi` in Source Serif 4 at
 * 40 px is 26.16 px, 28.92 px under a letter-spacing and 28.92 px across
 * a non-joiner; `FO` in Playpen Sans at 17.71 px 24.178, 24.107 and
 * 24.178 px. The kerning stands across it: `AV` in Source Serif 4 is
 * 52.08 px with and without, 56.84 px its two letters apart.
 * In a document shaped in its own language two neighbours as wide across
 * a non-joiner as without one are no ligature ({@link ligated}), and a
 * word with none is painted whole at the letter-spacing that ends it on
 * its box, as any other the letter-spacing reshapes: `FOR` at 2.68 px a
 * letter. A document that keeps its host's language is painted as it
 * was, and so is a right-to-left word of any document, which is never
 * painted at a letter-spacing of its own.
 */

/** One piece of a word painted apart from the rest. */
export interface TrackedPiece {
  text: string;
  /** Where the piece starts in the word's natural shaping, px from its
   *  start: its left end, or its right end for a right-to-left word. */
  offset: number;
  /** Glyphs of the word before the piece: each takes the tracking once (a
   *  ligature is one glyph, as in the PDF of a document that keeps its
   *  host's language). */
  glyphsBefore: number;
  /** Letters (graphemes) of the word before the piece, the letters of a
   *  ligature each counted: what the layout counted the tracking of. */
  lettersBefore: number;
  /** A ligature: painted with no letter-spacing. */
  ligature: boolean;
}

/** Letter-spacing the words are probed with, px. */
const PROBE = 1;
/** Least difference, px, between a word's natural width and its width
 *  under letter-spacing (the spacing taken off) that counts as another
 *  shaping: above the noise of `measureText`, below any ligature. */
const TOLERANCE = 0.05;
/** Words remembered per font before the memory starts over. */
const MAX_WORDS = 8192;

/** A word painted in pieces. */
interface TrackedWord {
  pieces: readonly TrackedPiece[];
  /** The word's natural width, px: its ligatures counted, no tracking. */
  natural: number;
  /** Its letters (graphemes): each was measured with the tracking after it. */
  letters: number;
  /** A right-to-left word: its pieces run from the right end of its box. */
  rtl: boolean;
  /** Whether the pieces, each painted as it is alone, end where the
   *  natural shaping ends the word: false in a face whose letters take
   *  other forms by their neighbours, where a piece set alone is not as
   *  wide as its part of the word. */
  fits: boolean;
}

/** A part of a tracked text painted at a letter-spacing of its own (see
 *  {@link fittedParts}). */
interface FittedPart {
  text: string;
  /** Where the part starts in the text's natural shaping, px. */
  offset: number;
  /** Letters (graphemes) of the text before the part. */
  lettersBefore: number;
  /** The part's pieces, when it keeps its ligatures and they fit. */
  word: TrackedWord | null;
  /** The part's width under a letter-spacing, the spacing taken off, and
   *  what one px of letter-spacing adds to it, when it is painted whole at
   *  a letter-spacing of its own; undefined for a part painted at the
   *  tracking. */
  spaced?: { width: number; step: number };
  /** Its natural width, px, and its letters. */
  natural: number;
  letters: number;
}

/** A tracked text painted part by part. */
interface FittedText {
  parts: readonly FittedPart[];
  natural: number;
  letters: number;
}

/** What is known of each text set in a font. */
interface Known {
  otherwise: Map<string, boolean>;
  /** Two neighbours → whether a non-joiner between them changes their
   *  width (see {@link ligated}). */
  joined: Map<string, boolean>;
  words: Map<string, TrackedWord | null>;
  fitted: Map<string, FittedText | null>;
}

/** Font string → what is known of each text set in it. */
const knownByFont = new Map<string, Known>();

/** Whether a ligature takes the tracking of each of its letters (see
 *  {@link setLetterTracking}). */
let letterTracking = false;

/** Give a ligature of a tracked word the tracking of every letter it
 *  joins from now on (`on`), as the layout counted it, or of one glyph as
 *  up to postext 1.29: the page painter says which for the document it
 *  paints (`bodyText.shapingLanguage`, through `setSegmentLanguages`). */
export function setLetterTracking(on: boolean): void {
  letterTracking = on;
}

type Ctx = Pick<CanvasRenderingContext2D, 'font' | 'letterSpacing' | 'measureText'>;

/** Bidi classes a right-to-left run holds at one level whatever stands
 *  beside them: its letters, their marks, and the neutral characters that
 *  take the run's direction. A digit, a Latin letter or a bidi control
 *  makes a second level. */
const ONE_LEVEL_RTL: ReadonlySet<string> = new Set(['R', 'AL', 'NSM', 'WS', 'ON', 'CS', 'ES', 'ET']);

function known(ctx: object, font: string): Known {
  // A face ligates otherwise under a language (no `fi` in Turkish): the
  // context's own is part of the key (#764). So is the document's way of
  // telling a ligature (`letterTracking`): the pieces of a word are not
  // the same in the two.
  const lang = (ctx as { lang?: unknown }).lang;
  const own = letterTracking ? '\u0001' : '';
  const key = typeof lang === 'string' && lang !== 'inherit' ? `${own}${lang}\u0000${font}` : own + font;
  let k = knownByFont.get(key);
  if (!k) knownByFont.set(key, k = { otherwise: new Map(), joined: new Map(), words: new Map(), fitted: new Map() });
  return k;
}

/** The direction `text` runs in when it may be painted in pieces at all
 *  (see the module comment), else null: left to right with no
 *  right-to-left letter in it, right to left when it is one run of a
 *  script that does not join. */
function divisible(text: string): 'ltr' | 'rtl' | null {
  if (joiningScriptIn(text)) return null;
  if (!needsBidi(text)) return 'ltr';
  for (const ch of text) {
    if (!ONE_LEVEL_RTL.has(bidiClassOf(ch.codePointAt(0)!))) return null;
  }
  return 'rtl';
}

function widthAt(ctx: Ctx, text: string, spacing: number): number {
  setLetterSpacing(ctx, spacing);
  return contextTextWidth(ctx, text);
}

/** {@link shapedOtherwise}, measured: the context's `letterSpacing` is
 *  left at any value. */
function probe(ctx: Ctx, text: string): boolean {
  const natural = widthAt(ctx, text, 0);
  const one = widthAt(ctx, text, PROBE);
  const two = widthAt(ctx, text, 2 * PROBE);
  // What one more unit of spacing adds: the spacing after each letter.
  const step = two - one;
  // A measurer that takes no letter-spacing (a test stub, an old browser).
  if (!(step > PROBE / 2)) return false;
  return Math.abs(one - step - natural) > TOLERANCE;
}

function otherwise(ctx: Ctx, font: string, text: string): boolean {
  const { otherwise: words } = known(ctx, font);
  let changed = words.get(text);
  if (changed === undefined) {
    changed = probe(ctx, text);
    if (words.size >= MAX_WORDS) words.clear();
    words.set(text, changed);
  }
  return changed;
}

/** ZERO WIDTH NON-JOINER: between two letters it asks for no ligature of
 *  them. */
const ZWNJ = '\u200C';

/**
 * Whether two neighbours the letter-spacing reshapes are a ligature (see
 * the module comment): in a document shaped in its own language, whether
 * a non-joiner between them changes their natural width. As wide across
 * it as without it, each letter keeps a glyph of its own, in a form by
 * its neighbour that the letter-spacing takes away. A document that keeps
 * its host's language reads every such pair as a ligature, as up to
 * postext 1.29, and so does a measurer that gives the non-joiner a width.
 * Asked of the pairs of a left-to-right word only.
 */
function ligated(ctx: Ctx, font: string, first: string, second: string): boolean {
  if (!letterTracking) return true;
  const { joined } = known(ctx, font);
  const pair = first + second;
  let is = joined.get(pair);
  if (is === undefined) {
    is = Math.abs(widthAt(ctx, first + ZWNJ + second, 0) - widthAt(ctx, pair, 0)) > TOLERANCE;
    if (joined.size >= MAX_WORDS) joined.clear();
    joined.set(pair, is);
  }
  return is;
}

function wordOf(ctx: Ctx, font: string, text: string): TrackedWord | null {
  const direction = divisible(text);
  if (!direction) return null;
  const letters = graphemesOf(text);
  if (letters.length < 2 || !otherwise(ctx, font, text)) return null;
  // Two neighbours that shape otherwise under letter-spacing are a
  // ligature; a third joins them the same way (f + f + i).
  const groups: { start: number; end: number; ligature: boolean }[] = [];
  let ligatures = 0;
  for (let k = 0; k < letters.length;) {
    let end = k + 1;
    while (end < letters.length && otherwise(ctx, font, letters[end - 1]! + letters[end]!) && (direction === 'rtl' || ligated(ctx, font, letters[end - 1]!, letters[end]!))) end++;
    const ligature = end - k > 1;
    const last = groups[groups.length - 1];
    if (!ligature && last && !last.ligature) last.end = end;
    else groups.push({ start: k, end, ligature });
    if (ligature) ligatures++;
    k = end;
  }
  // Shaped otherwise as a whole but by no ligature of two neighbours: left
  // as it was.
  if (ligatures === 0) return null;
  setLetterSpacing(ctx, 0);
  const natural = (from: number, to: number): number => contextTextWidth(ctx, letters.slice(from, to).join(''));
  let glyphs = 0;
  const pieces = groups.map((g) => {
    // Up to the piece's first letter in the natural shaping, the kerning
    // before it counted: the pieces meet as the whole word's letters do.
    const offset = g.start === 0 ? 0 : natural(0, g.start + 1) - natural(g.start, g.start + 1);
    const piece = { text: letters.slice(g.start, g.end).join(''), offset, glyphsBefore: glyphs, lettersBefore: g.start, ligature: g.ligature };
    glyphs += g.ligature ? 1 : g.end - g.start;
    return piece;
  });
  const whole = natural(0, letters.length);
  // Where the last piece ends, painted as it is alone: a ligature at its
  // natural width, the letters after one as the letter-spacing shapes
  // them.
  const last = pieces[pieces.length - 1]!;
  const end = last.offset + (last.ligature ? contextTextWidth(ctx, last.text) : spacedWidth(ctx, last.text).width);
  return { pieces, natural: whole, letters: letters.length, rtl: direction === 'rtl', fits: Math.abs(end - whole) <= TOLERANCE };
}

/** The width of `text` under a letter-spacing with that spacing taken
 *  off, and what one px of letter-spacing adds to it (a px a letter,
 *  where the context spaces every letter). The context's `letterSpacing`
 *  is left at any value. */
function spacedWidth(ctx: Ctx, text: string): { width: number; step: number } {
  const one = widthAt(ctx, text, PROBE);
  const step = (widthAt(ctx, text, 2 * PROBE) - one) / PROBE;
  return { width: one - step * PROBE, step };
}

/** Runs of spaces and the words between them. */
const PARTS_RE = /( +)/;

/**
 * The parts a tracked `text` is painted in where its pieces do not fit
 * or the letter-spacing reshapes it with no ligature to keep (see the
 * module comment): its words and its runs of spaces, each where the
 * natural shaping puts it (the canvas shapes a text word by word, and
 * nothing is kerned across a space). A word keeps its pieces when they
 * fit; one the letter-spacing reshapes otherwise is painted whole at the
 * letter-spacing that ends it where it was measured; any other at the
 * tracking. Null when every part is painted at the tracking (the text is
 * painted whole), and for a text that is not left to right.
 */
function fittedOf(ctx: Ctx, font: string, text: string): FittedText | null {
  if (divisible(text) !== 'ltr') return null;
  const parts: FittedPart[] = [];
  let offset = 0;
  let lettersBefore = 0;
  let plain = true;
  for (const part of text.split(PARTS_RE)) {
    if (part === '') continue;
    setLetterSpacing(ctx, 0);
    const natural = contextTextWidth(ctx, part);
    const letters = graphemesOf(part).length;
    let word: TrackedWord | null = null;
    let spaced: FittedPart['spaced'];
    // A word with a CJK character is left as it was: its cells are not
    // measured at a natural width (the composer, a vertical line).
    if (part[0] !== ' ' && letters > 1 && !hasCJK(part) && otherwise(ctx, font, part)) {
      const cut = wordOf(ctx, font, part);
      if (cut?.fits) word = cut;
      else {
        const under = spacedWidth(ctx, part);
        if (under.step > 0) spaced = under;
      }
    }
    if (word || spaced) plain = false;
    parts.push({ text: part, offset, lettersBefore, word, ...(spaced ? { spaced } : {}), natural, letters });
    offset += natural;
    lettersBefore += letters;
  }
  return plain ? null : { parts, natural: offset, letters: lettersBefore };
}

/** {@link fittedOf}, remembered. The context's `letterSpacing` is put
 *  back as it was found. */
function fittedParts(ctx: CanvasRenderingContext2D, text: string): FittedText | null {
  const font = ctx.font;
  const { fitted } = known(ctx, font);
  let parts = fitted.get(text);
  if (parts === undefined) {
    const spacing = letterSpacingOf(ctx);
    parts = fittedOf(ctx, font, text);
    setLetterSpacing(ctx, spacing);
    if (fitted.size >= MAX_WORDS) fitted.clear();
    fitted.set(text, parts);
  }
  return parts;
}

/** {@link trackedPieces} with the word's measures. A word is cut only
 *  where the context paints in its direction: a right-to-left word in a
 *  context set right to left, any other in one that is not (a run of
 *  brackets painted right to left is mirrored and reordered, never cut). */
function trackedWord(ctx: CanvasRenderingContext2D, text: string): TrackedWord | null {
  if (text.length < 2 || !measures(ctx)) return null;
  const font = ctx.font;
  const { words } = known(ctx, font);
  let word = words.get(text);
  if (word === undefined) {
    const spacing = letterSpacingOf(ctx);
    word = wordOf(ctx, font, text);
    setLetterSpacing(ctx, spacing);
    if (words.size >= MAX_WORDS) words.clear();
    words.set(text, word);
  }
  if (word && word.rtl !== ('direction' in ctx && ctx.direction === 'rtl')) return null;
  return word;
}

/** Whether the context can be asked: it has a `letterSpacing` and measures. */
function measures(ctx: CanvasRenderingContext2D): boolean {
  return 'letterSpacing' in ctx && typeof ctx.measureText === 'function';
}

/**
 * Whether the browser shapes `text`, in the context's font, otherwise once
 * a letter-spacing is set: its width at a letter-spacing, that spacing
 * taken off, is not its natural width (it holds a ligature the
 * letter-spacing turns off). False where the context measures no
 * letter-spacing. The context's `letterSpacing` is put back as it was
 * found.
 */
export function shapedOtherwise(ctx: CanvasRenderingContext2D, text: string): boolean {
  if (text.length < 2 || !measures(ctx)) return false;
  const spacing = letterSpacingOf(ctx);
  const changed = otherwise(ctx, ctx.font, text);
  setLetterSpacing(ctx, spacing);
  return changed;
}

/**
 * The pieces a tracked word is painted in, in the context's font and
 * direction, or null when it is painted whole (the browser shapes it the
 * same under letter-spacing, the context measures none, the word holds a
 * joining letter or text in two directions, or the context paints the
 * other way). The context's `letterSpacing` is put back as it was found.
 */
export function trackedPieces(ctx: CanvasRenderingContext2D, text: string): readonly TrackedPiece[] | null {
  return trackedWord(ctx, text)?.pieces ?? null;
}

/**
 * Paint a word of a tracked line, or any tracked text set as one run (a
 * line or a run of a design text, a sideways run of a vertical line), with
 * `paint` (the caller's `fillText`) at `x`, `y`: its left end on a
 * left-to-right page, the start of its box in a mirrored frame. `tracking`
 * is the context's `letterSpacing` on entry, px, and on return. A text
 * that would lose its ligatures to it is painted in its
 * {@link trackedPieces}, as one run (`paintAsOneRun`): its box is the one
 * the frame turns a text painted whole about, its natural width and the
 * tracking after each letter. A right-to-left word (the context set right
 * to left and aligned on its left edge by the caller) has its pieces set
 * from the right end of that box. Any other text with one `paint`.
 * Returns the advance of a text painted in pieces, the width it was
 * measured at, and undefined for one painted whole.
 */
export function fillTrackedWord(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number,
  paint: (text: string, x: number, y: number) => void,
): number | undefined {
  const word = tracking !== 0 ? trackedWord(ctx, text) : null;
  // In a document shaped in its own language, a text whose pieces do not
  // end where it was measured to end, or that the letter-spacing reshapes
  // with no ligature to keep, is painted part by part (see the module
  // comment).
  if (letterTracking && tracking !== 0 && !(word?.fits) && text.length > 1 && measures(ctx) && !('direction' in ctx && ctx.direction === 'rtl')) {
    const fitted = fittedParts(ctx, text);
    if (fitted) return fillFittedParts(ctx, fitted, x, y, tracking, paint);
  }
  if (!word) {
    paint(text, x, y);
    return undefined;
  }
  const width = word.natural + tracking * word.letters;
  paintAsOneRun(ctx, x, width, () => fillPieces(ctx, word, x, width, y, tracking, paint));
  return width;
}

/** The pieces of `word`, whose box is `width` px from `x`. */
function fillPieces(ctx: CanvasRenderingContext2D, word: TrackedWord, x: number, width: number, y: number, tracking: number, paint: (text: string, x: number, y: number) => void): void {
  const align = ctx.textAlign;
  // Each piece of a right-to-left word from its own right end.
  if (word.rtl) ctx.textAlign = 'right';
  for (const piece of word.pieces) {
    // A right-to-left word keeps one tracking a ligature, as in the
    // HTML and the PDF.
    const at = piece.offset + tracking * (letterTracking && !word.rtl ? piece.lettersBefore : piece.glyphsBefore);
    if (piece.ligature) setLetterSpacing(ctx, 0);
    paint(piece.text, word.rtl ? x + width - at : x + at, y);
    if (piece.ligature) setLetterSpacing(ctx, tracking);
  }
  if (word.rtl) ctx.textAlign = align;
}

/** {@link fittedParts} painted from `x`: one run in a mirrored frame.
 *  Returns the width the text was measured at. */
function fillFittedParts(ctx: CanvasRenderingContext2D, fitted: FittedText, x: number, y: number, tracking: number, paint: (text: string, x: number, y: number) => void): number {
  const width = fitted.natural + tracking * fitted.letters;
  paintAsOneRun(ctx, x, width, () => {
    for (const part of fitted.parts) {
      const at = x + part.offset + tracking * part.lettersBefore;
      if (part.word) fillPieces(ctx, part.word, at, part.natural + tracking * part.letters, y, tracking, paint);
      else if (part.spaced) {
        // The letter-spacing under which the part, as the browser shapes
        // it then, is as wide as its natural width and its tracking.
        const fit = (part.natural + tracking * part.letters - part.spaced.width) / part.spaced.step;
        // At no letter-spacing the browser would shape it naturally again.
        if (Math.abs(fit) < 1e-6) paint(part.text, at, y);
        else {
          setLetterSpacing(ctx, fit);
          paint(part.text, at, y);
          setLetterSpacing(ctx, tracking);
        }
      } else paint(part.text, at, y);
    }
  });
  return width;
}
