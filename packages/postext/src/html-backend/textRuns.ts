// Text written as markup: escaping, tracked words in the pieces the canvas
// paints, a box per word, script marks, runs that change style inside a word
// and inserted kashidas (#1276: split out of html-backend.ts).
import type { VDTLineSegment } from '../vdt.js';
import { shapingTagOf } from '../hyphenation/locale.js';
import { hasCJK } from '../measure/cjk/cjk.js';
import { needsBidi } from '../writing/bidi.js';
import { joiningScriptIn } from '../measure/rtl/joining.js';
import { type ScriptContext, scriptMark, isLetterless, faceReadsScript } from '../measure/script.js';
import { graphemeCount } from '../measure/graphemes.js';
import { withMeasureLanguage, measureTextWidth, measureSpacedWidth } from '../measure/canvas.js';
import { trackedLigaturePieces, type LigaturePiece } from '../measure/trackedLigatures.js';
import { sameSetWidth } from '../paint/wordPieces.js';
import { shapedText, ownShaping } from './render.js';
import { SCRIPT_MARK_DECL, type RunPaint } from './styles.js';

/**
 * A word with no letter set in the script the layout measured it in
 * (`VDTLineSegment.scriptContext`, #725): its text, and beside it the mark
 * of the script (`scriptMark`, a character of the script glued with a
 * no-break space) in a box of no size. The browser reads the script of
 * digits and punctuation from the text they stand in, across the box, so
 * the word takes the forms and the width of that script, where alone it
 * would take the ones the browser picks for a text with no letter. The
 * mark comes after a left-to-right word and before a right-to-left one,
 * as on the canvas; it has no size, is hidden from assistive technology
 * and is left out of a selection, so the page reads and copies as written.
 */
export function scriptTextHtml(text: string, script: ScriptContext, rtl: boolean): string {
  const { lead, trail } = scriptMark(script, rtl);
  const hidden = (mark: string): string => (mark === '' ? '' : `<span aria-hidden="true" style="${SCRIPT_MARK_DECL}">${esc(mark)}</span>`);
  return hidden(lead) + esc(text) + hidden(trail);
}

/**
 * Whether a doubled dash or ellipsis given the forms of Han text
 * (`scriptContext: 'Hani'`) is set with no mark beside it (#770): where
 * the canvas that measured it set it alone as wide as its place.
 *
 * The mark of the Han script is an ideograph, and Chrome's canvas cuts a
 * string before a Han character that follows another one: the word
 * beside the mark is shaped alone there, in no script, and the mark
 * changes nothing. The browser's layout shapes the two as one run of Han
 * text, where the face may answer with the form of the document's
 * language. Chrome 154, Noto Serif TC at 14.58 px under `zh-Hant`: `——`
 * is 24.67 px on the canvas with the mark or without, 24.67 px alone in a
 * box, and 29.17 px in a box with the mark (the full-width dash of the
 * face's `locl`). So the box takes the word alone whenever the measurer
 * says that is what the layout holds; asked in the language the text is
 * shaped in ({@link shapedText}), and the mark stays where that is not
 * known.
 */
export function setsAlone(seg: VDTLineSegment, font: string, tracking: number): boolean {
  const shaped = shapedText;
  if (!shaped || seg.scriptContext !== 'Hani') return false;
  const alone = withMeasureLanguage(seg.lang !== undefined ? shapingTagOf(seg.lang) : shaped.lang, () => measureTextWidth(seg.text, font));
  return sameSetWidth(alone + (tracking === 0 ? 0 : tracking * graphemeCount(seg.text)), seg.width);
}

/**
 * A word whose letters change style inside it (`VDTLineSegment.runs`: a
 * bold letter, a coloured haraka) as one run of text with inline spans for
 * the styled parts. The browser shapes the word whole across the spans, so
 * the letters of a joining script stay joined, where boxes positioned one
 * by one would break them apart. A run in the segment's own font and colour
 * is plain text; one in another face takes no line height, so it sits on
 * the segment's baseline without growing its box.
 */
export function wordRunsHtml(seg: VDTLineSegment, font: string, color: string, paint: RunPaint): string {
  // Where each run starts in the segment's text, for its inserted
  // tatweels (`VDTLineSegment.kashida`).
  let at = 0;
  return seg.runs!.map((run) => {
    const start = at;
    at += run.text.length;
    const text = kashidaTextHtml(run.text, seg.kashida, start);
    const probe: VDTLineSegment = {
      kind: 'text', text: run.text, width: 0,
      ...(run.bold ? { bold: true } : {}),
      ...(run.italic ? { italic: true } : {}),
      ...(seg.fontString ? { fontString: seg.fontString } : {}),
    };
    const own = paint(probe);
    const runColor = run.color ?? own.color;
    const decl = (own.font !== font ? `font:${own.font};line-height:0;` : '') + (runColor !== color ? `color:${runColor};` : '');
    return decl ? `<span style="${decl}">${text}</span>` : text;
  }).join('');
}

/**
 * `text` escaped, with the tatweels kashida justification inserted into it
 * (#375; `offsets` into the segment's text, of which `text` starts at
 * `base`) in spans that cannot be selected: they are painted, joined to
 * the letters around them (the browser shapes one font's text whole
 * across spans), but a copy of the page reads the words as written, as
 * the PDF's text does. A tatweel the author typed is not among the
 * offsets and copies. Plain `esc(text)` when none falls in it.
 */
export function kashidaTextHtml(text: string, offsets: readonly number[] | undefined, base = 0): string {
  if (!offsets || offsets.length === 0) return esc(text);
  let out = '';
  let last = 0;
  for (let k = 0; k < offsets.length; k++) {
    const i = offsets[k]! - base;
    if (i < last || i >= text.length) continue;
    // Consecutive tatweels (a longer elongation) share one span.
    let j = i + 1;
    while (k + 1 < offsets.length && offsets[k + 1]! - base === j && j < text.length) { j++; k++; }
    out += `${esc(text.slice(last, i))}<span style="${KASHIDA_DECL}">${esc(text.slice(i, j))}</span>`;
    last = j;
  }
  return out + esc(text.slice(last));
}

/** Inserted tatweels: painted, never selected or copied. */
const KASHIDA_DECL = '-webkit-user-select:none;user-select:none;';

const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPE[c] ?? c);
}

/**
 * `text` escaped, each run of spaces inside it in a box of its own, and
 * each word with no letter of a text that holds a character past U+00FF
 * (#770).
 *
 * The canvas, which measured the text, shapes a string word by word: a
 * space is a word of its own and nothing kerns across it. The browser
 * shapes the text of a box as one run and kerns a letter against the
 * space beside it. Chrome 154, STIX Two Text at 20.83 px: `Section V` is
 * 83.72 px on the canvas and 83.31 px in one box, `To AV Ty` 80.22 px and
 * 79.39 px; in Hedvig Letters Serif at 40 px a space beside a capital is
 * 1.3 to 3.1 px narrower in a box. In Arabic text the browser also takes
 * another space: Aref Ruqaa's is 0.146 em between two words of a run and
 * 0.333 em alone, 34 px over a title of three words at 92 px. An inline
 * block is shaped apart from the text around it, so with its spaces in
 * such boxes the text is as wide as the canvas made it (83.75 and
 * 80.27 px: the boxes' edges fall on a 64th of a pixel), and it reads and
 * copies as written.
 *
 * A word with no letter (`(1332–1406),`) has no script of its own. In a
 * string with a character past U+00FF the canvas draws it by the face's
 * default rules (`canvas-backend/contextText.ts`); in a box the browser
 * gives it the script of the words beside it, across those inline blocks
 * too: Amiri's brackets are 0.255 em in Latin text and 0.458 em by
 * default, 7.5 px over that word at 18.75 px. In a box of its own it is
 * drawn by the default rules.
 *
 * For the text of one box that holds several words: a reference's label,
 * a line with no segments, a line or a run of a design text.
 */
export function wordsHtml(text: string, tracked?: TrackedText): string {
  if (tracked && ownShaping && tracked.tracking !== 0) return trackedWordsHtml(text, tracked);
  const escaped = esc(text);
  if (text.indexOf(' ') < 0 || text.trim() === '') return escaped;
  if (!WIDE_TEXT_RE.test(text)) return escaped.replace(/ +/g, (spaces) => `${APART_OPEN}${spaces}</span>`);
  return text.split(/( +)/).map((part) => (part === '' ? ''
    : part[0] === ' ' || isLetterless(part) ? `${APART_OPEN}${esc(part)}</span>` : esc(part))).join('');
}

/** The font string and the tracking (px a letter) a text is set with, and
 *  the language its author named for it where it is not the document's:
 *  what {@link trackedWordHtml} asks the measurer with. */
export interface TrackedText {
  font: string;
  tracking: number;
  lang?: string;
}

/** {@link TrackedText} of a text in `font` on a box tracked `tracking` px
 *  a letter, undefined for an untracked one. */
export function trackedIn(font: string, tracking: number | undefined): TrackedText | undefined {
  return tracking ? { font, tracking } : undefined;
}

/**
 * A word of a tracked text, escaped, in the pieces the canvas paints it
 * in (#663, #770): each ligature in a box of its own under no
 * letter-spacing, so the browser sets it, with the tracking of each of
 * its letters after it as a margin; the letters between them as they
 * are, tracked by the box they stand in. The kerning the natural shaping
 * has across a cut, which the browser does not apply between two boxes
 * of other spacing, is a margin before the piece (`pipefitters` in Source
 * Serif 4 at 40 px: 0.39 px between `pipe` and `fi`). A word with no
 * ligature the letter-spacing dissolves, a word of a joining or a
 * right-to-left script, and any word where nothing measures, is its text.
 *
 * A letter-spacing takes the contextual alternates of a face away too
 * (see `canvas-backend/trackedText.ts`): a word whose pieces do not end
 * where the word was measured to end, or that the letter-spacing reshapes
 * with no ligature to keep, is set whole in a box at the letter-spacing
 * that ends it there, as the canvas paints it. `TEA-PARTY` in Cormorant
 * SC at 17.71 px, tracked 2.5 px: 2.66 px a letter, the 1.47 px its
 * hyphen is narrower by under a letter-spacing shared among its nine
 * letters.
 */
function trackedWordHtml(word: string, tracked: TrackedText): string {
  const shaped = shapedText;
  if (!shaped || word.length < 2) return esc(word);
  const set = withMeasureLanguage(tracked.lang !== undefined ? shapingTagOf(tracked.lang) : shaped.lang, () => {
    const cut = trackedLigaturePieces(word, tracked.font);
    if (cut && piecesFit(cut, word, tracked.font)) return { pieces: cut };
    return { pieces: cut, spacing: fittedLetterSpacing(word, tracked) };
  });
  if (set.spacing !== undefined) return `<span style="letter-spacing:${set.spacing.toFixed(4)}px;">${esc(word)}</span>`;
  const pieces = set.pieces;
  if (!pieces) return esc(word);
  let out = '';
  // Where the piece before ends in the natural shaping.
  let end = 0;
  for (const piece of pieces) {
    const kern = piece.offset - end;
    end = piece.offset + piece.width;
    const lead = Math.abs(kern) >= 0.005 ? `margin-inline-start:${kern.toFixed(3)}px;` : '';
    if (piece.ligature) out += `<span style="letter-spacing:0;${lead}margin-inline-end:${(piece.letters * tracked.tracking).toFixed(3)}px;">${esc(piece.text)}</span>`;
    else out += lead ? `<span style="${lead}">${esc(piece.text)}</span>` : esc(piece.text);
  }
  return out;
}

/** The width of `text` in `font` under a letter-spacing, that spacing
 *  taken off, and what one px of letter-spacing adds to it; undefined
 *  where the measurer takes no letter-spacing. */
function spacedTextWidth(text: string, font: string): { width: number; step: number } | undefined {
  const one = measureSpacedWidth(text, font, 1);
  const two = measureSpacedWidth(text, font, 2);
  if (one === undefined || two === undefined || !(two - one > 0.5)) return undefined;
  return { width: one - (two - one), step: two - one };
}

/** Least difference, px, that counts as another shaping
 *  (`measure/trackedLigatures.ts`). */
const RESHAPED_PX = 0.05;

/** Whether the pieces of `word`, each set as it is alone, end where the
 *  natural shaping ends the word (`TrackedWord.fits` of the canvas). */
function piecesFit(pieces: readonly LigaturePiece[], word: string, font: string): boolean {
  const last = pieces[pieces.length - 1]!;
  const width = last.ligature ? last.width : spacedTextWidth(last.text, font)?.width;
  return width !== undefined && Math.abs(last.offset + width - measureTextWidth(word, font)) <= RESHAPED_PX;
}

/** The letter-spacing, px, at which `word`, as the browser shapes it
 *  under one, is as wide as it was measured: its natural width and the
 *  tracking after each letter. Undefined for a word the letter-spacing
 *  does not reshape, a word of a joining or a right-to-left script, and
 *  where nothing measures a letter-spacing. Nor for a text with a CJK
 *  character, which is not measured so: the composer and a vertical line
 *  count cells, and two marks that meet are as wide set whole as the
 *  browser trims them, under no letter-spacing only (the lines of the
 *  Chinese guide set down the page stood 0.4 to 1.3 px off their cells). */
function fittedLetterSpacing(word: string, tracked: TrackedText): number | undefined {
  if (joiningScriptIn(word) || needsBidi(word) || hasCJK(word)) return undefined;
  const letters = graphemeCount(word);
  if (letters < 2) return undefined;
  const under = spacedTextWidth(word, tracked.font);
  if (!under) return undefined;
  const natural = measureTextWidth(word, tracked.font);
  if (Math.abs(under.width - natural) <= RESHAPED_PX) return undefined;
  const spacing = (natural + tracked.tracking * letters - under.width) / under.step;
  // At no letter-spacing the browser would shape it naturally again.
  return Math.abs(spacing) < 1e-6 ? undefined : spacing;
}

/** {@link wordsHtml} of a tracked text whose ligatures take the tracking
 *  of each letter: its spaces and its letterless words in boxes of their
 *  own as there, every other word through {@link trackedWordHtml}. */
function trackedWordsHtml(text: string, tracked: TrackedText): string {
  if (text.indexOf(' ') < 0 || text.trim() === '') return trackedWordHtml(text, tracked);
  const wide = WIDE_TEXT_RE.test(text);
  return text.split(/( +)/).map((part) => (part === '' ? ''
    : part[0] === ' ' || (wide && isLetterless(part)) ? `${APART_OPEN}${esc(part)}</span>` : trackedWordHtml(part, tracked))).join('');
}

/** A text set down a vertical line or with no box per space, escaped,
 *  each word of a tracked one through {@link trackedWordHtml}. */
export function trackedTextHtml(text: string, tracked: TrackedText | undefined): string {
  if (!tracked || !ownShaping || tracked.tracking === 0) return esc(text);
  if (text.indexOf(' ') < 0) return trackedWordHtml(text, tracked);
  return text.split(/( +)/).map((part) => (part === '' ? '' : part[0] === ' ' ? part : trackedWordHtml(part, tracked))).join('');
}
/** A box shaped apart from the text around it. */
const APART_OPEN = '<span style="display:inline-block;">';

/**
 * A line of several words as a box per word and per run of spaces, each
 * at the place the canvas gives it (#770), or undefined where
 * {@link wordsHtml} sets it.
 *
 * Boxes inside a line each round their width to a 64th of a pixel, and
 * over a long line the rounding adds up: a colophon of 26 spaces set with
 * {@link wordsHtml} ends 0.14 to 0.64 px past the canvas's width (four
 * faces, three sizes), where in one box it stood 1.9 to 16 px short of
 * it. With every word at its own place, as the words of a body line
 * are, nothing adds up. The places are the canvas's: the advance of each
 * word alone, in the language the text is shaped in ({@link shapedText}),
 * `tracking` after each character and `wordSpacing` on each space. For a
 * text that reads left to right, written straight into a box that keeps
 * the line's font; the caller gives that box the line's width, since its
 * words no longer make it. Not where the language is not known. In a
 * face that draws by script, a word with no letter may take other forms
 * measured alone than in a line that holds a character past U+00FF: such
 * a line is set so only where its words alone are as wide together as
 * the line measured whole, 0.01 px apart at most (the colophon `Higuchi
 * Ichiyō, たけくらべ (Child’s Play, 1895–96), …` in Noto Sans JP at
 * 11.46 px: 578.2357 px both ways; with {@link wordsHtml} its 16 spaces
 * and its number, each in a box, end it at 578.53 px).
 */
export function wordBoxesHtml(text: string, font: string, tracking: number, wordSpacing: number): string | undefined {
  const shaped = shapedText;
  if (!shaped || text.indexOf(' ') < 0 || text.trim() === '' || needsBidi(text)) return undefined;
  const parts = text.split(/( +)/).filter((part) => part !== '');
  return withMeasureLanguage(shaped.lang, () => {
    const byScript = WIDE_TEXT_RE.test(text) && parts.some((part) => part[0] !== ' ' && isLetterless(part)) && faceReadsScript(font);
    let x = 0;
    // The words alone, with no tracking and no wider space.
    let alone = 0;
    let out = '';
    for (const part of parts) {
      out += `<span style="position:absolute;left:${x.toFixed(3)}px;top:0;">${part[0] === ' ' ? esc(part) : trackedTextHtml(part, trackedIn(font, tracking))}</span>`;
      const width = measureTextWidth(part, font);
      alone += width;
      x += width + (tracking === 0 ? 0 : tracking * graphemeCount(part)) + (part[0] === ' ' ? wordSpacing * part.length : 0);
    }
    if (byScript && Math.abs(alone - measureTextWidth(text, font)) > 0.01) return undefined;
    return out;
  });
}
/** A character past Latin-1 (see `canvas-backend/contextText.ts`). */
const WIDE_TEXT_RE = /[^\u0000-\u00FF]/;
