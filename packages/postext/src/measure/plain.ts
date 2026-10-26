import { FORCED_BREAK } from './hardBreaks.js';
import {
  layoutNextLine,
  type PreparedTextWithSegments,
  type LayoutCursor,
  type LayoutLine,
} from '@chenglou/pretext';
import type { VDTLine, VDTLineSegment } from '../vdt.js';
import { createBoundingBox } from '../vdt.js';
import type { TextAlign } from '../types.js';
import { hyphenateText, hyphenateTextKeepingCompounds, withoutEdgeSoftHyphens } from '../hyphenation/hyphenate.js';
import {
  pretextSegmentsToItems,
  computeBreakpoints,
  reconstructPretextLines,
} from '../knuthPlass/index.js';
import { SOFT_HYPHEN } from './types.js';
import { GEMINATE_DOT, endsInsideGeminate, withLineEndHyphen } from './geminate.js';
import { lineStartAt, lineWidthAt, lineWidthFunction, markInsetLines, maxLineIndent, maxLineInset, uniformMeasureFrom, type MeasuredBlock, type MeasureBlockOptions } from './types.js';
import { cleanSoftHyphens, getMeasureLanguage, measureTextWidth, normalSpaceWidthFor } from './canvas.js';
import { isRuntLastLine } from './runts.js';
import { justifiedSpaceRatios } from './spaceRatios.js';
import { measureRichBlock } from './rich.js';
import { hasCJK, hasCJKRun } from './cjk/cjk.js';
import { composesAsCjk, composesDashRow } from './cjk/cjkCompose.js';
import { markCuts } from './cjk/markCuts.js';
import { getMeasureRegion, getMeasureUprightDigits, getMeasureWritingMode, lineBaselineOffset, measuringVertically, withMeasureWritingMode } from './vertical.js';
import { holdsVerticalCell } from '../writing/writingMode.js';
import { WORDS_AND_SPACES_RE, isBreakingSpaceRun } from './spaces.js';
import { breaksAfterHardHyphen, hasCompound, raggedStretchPx } from './breakRules.js';
import { joiningScriptIn } from './rtl/joining.js';
import { getMeasureDirection } from './rtl/bidiLines.js';
import { needsBidi } from '../writing/bidi.js';
import { faceReadsScript, getMeasureScriptContext, isLetterless, wordPieceScript } from './script.js';
import { prepareInLanguage } from './pretextLanguage.js';

/** Whether a word of `text` (between breaking spaces) has no letter. */
function holdsLetterlessWord(text: string): boolean {
  const words = text.match(WORDS_AND_SPACES_RE);
  return words !== null && words.some((word) => !isBreakingSpaceRun(word) && isLetterless(word));
}

/** A hyphen or a dash: where a word may part at the end of a line. */
const HYPHEN_OR_DASH_RE = /[-\u2010-\u2015]/;

/** Whether a word of `text` that has a letter parts, after a hyphen or a
 *  dash it carries, into a piece with none (`COVID-19`, `(pre-2001)`,
 *  `2-methyl`): the line may end there, and the piece is then a text of
 *  its own, measured and painted in the script of its word (#725). */
function holdsLetterlessPiece(text: string): boolean {
  if (!HYPHEN_OR_DASH_RE.test(text)) return false;
  for (const word of text.match(WORDS_AND_SPACES_RE) ?? []) {
    if (isBreakingSpaceRun(word) || wordPieceScript(word) === undefined) continue;
    let from = 0;
    for (let at = 0; at < word.length; at++) {
      if (!HYPHEN_OR_DASH_RE.test(word[at]!)) continue;
      if (isLetterless(word.slice(from, at + 1))) return true;
      from = at + 1;
    }
    if (from > 0 && isLetterless(word.slice(from))) return true;
  }
  return false;
}

/** Whether a word of `text` that has a letter and a character with none
 *  (`10.1006/ijhc.2001.0458`) is wider than `widthPx`: cut where its line
 *  ends, it may leave a piece with no letter (#725). */
function hasOverwideMixedWord(text: string, font: string, widthPx: number): boolean {
  for (const word of text.match(WORDS_AND_SPACES_RE) ?? []) {
    if (!isBreakingSpaceRun(word) && wordPieceScript(word) !== undefined && measureTextWidth(word, font) > widthPx) return true;
  }
  return false;
}

/** Where the text library cuts a word into pieces it measures one by
 *  one: at a soft hyphen (the dictionary's or the author's), after a
 *  hyphen and around a dash. */
const WORD_CUT_RE = /[\u00AD\-\u2010-\u2015]/;

/**
 * Whether a paragraph with no formatting is measured as one with a style
 * in it, word by word, in a document shaped in its own language (#772):
 * when a line may end inside one of its words (`text` is the paragraph
 * with the dictionary's soft hyphens in it).
 *
 * The text library measures each piece of such a word alone, so the word
 * is as wide as its pieces set apart, and is painted so. The word-by-word
 * breaker measures the word whole and its pieces as the word grows by
 * them, so it carries what the face draws across a place a line may end
 * at: the Catalan form of `l·l`, a ligature, a kerned pair. One book then
 * set the same word two ways, by whether its paragraph held a word in
 * italics. Crimson Pro in Catalan at 21 px: `il·luminació,` 107.65 px in a
 * paragraph with no formatting (the dot 0.24 em) and 115.14 px in one with
 * a style (the dot 0.586 em); of the thirteen such words of the Catalan
 * pocket novella seven were set the first way and six the second.
 * Measured in Chrome 154.
 *
 * Such a paragraph now takes the lines a styled one would for the same
 * text, and the two halves of a word broken at a line end are measured as
 * the texts painted (`ownRest` in `measure/rich.ts`). A paragraph no line
 * can end inside a word of keeps the text library, which measures its
 * words whole too. A document that keeps the host's language keeps every
 * width it had, and so does vertical text.
 */
function measuresWordsWhole(text: string): boolean {
  return getMeasureLanguage() !== undefined && !measuringVertically() && WORD_CUT_RE.test(text);
}

/** The unit squares of `isUnitSquare` (`cjkClasses.ts`). */
const UNIT_SQUARE_RE = /[\u3371-\u337A\u3380-\u33DF\u33FF]/;

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const FIGURE_SPACE = '\u2007';
/** The no-break spaces pretext glues its neighbours to (EF-66). */
const PRETEXT_GLUE_RE = /[\u00A0\u202F\uFEFF]/;

/**
 * Whether `text` holds a group of words glued by a no-break space that is
 * wider than `widthPx`. Pretext cuts such a group between characters, inside
 * a number ("300 0" / "00 0"); the word-by-word breaker breaks it at its last
 * no-break space first (EF-66), so the paragraph goes there. Only text that
 * holds a no-break space is measured.
 */
function hasOverwideGluedGroup(text: string, font: string, widthPx: number): boolean {
  if (!PRETEXT_GLUE_RE.test(text)) return false;
  for (const word of text.match(WORDS_AND_SPACES_RE) ?? []) {
    if (PRETEXT_GLUE_RE.test(word) && measureTextWidth(word, font) > widthPx) return true;
  }
  return false;
}

/**
 * Whether `text` holds a word of a joining script (Arabic…) wider than
 * `widthPx`. Pretext would cut it between two letters; the word-by-word
 * breaker never cuts one (`measure/rtl/joining.ts`): it lets it run past the
 * measure and flags the line (`VDTLine.wordOverflow`).
 */
function hasOverwideJoiningWord(text: string, font: string, widthPx: number): boolean {
  for (const word of text.match(WORDS_AND_SPACES_RE) ?? []) {
    if (joiningScriptIn(word) && measureTextWidth(word, font) > widthPx) return true;
  }
  return false;
}

/**
 * Whether `text` holds a compound with a part wider than `widthPx`: a word
 * with a hyphen between two letters, the parts being what lies between its
 * breaks after those hyphens ("counterrevolutionaries-" of
 * "counterrevolutionaries-internationalization"). When the dictionary leaves
 * compounds whole (`hyphenation.compounds: false`) such a part has no soft
 * hyphen, and pretext would cut it between two characters with no hyphen;
 * the word-by-word breaker divides it at the dictionary's syllables, as it
 * does any word wider than the line, so the paragraph goes there.
 */
function hasOverwideCompoundPart(text: string, font: string, widthPx: number): boolean {
  if (!hasCompound(text)) return false;
  for (const word of text.match(WORDS_AND_SPACES_RE) ?? []) {
    if (!hasCompound(word)) continue;
    let start = 0;
    for (let i = 1; i < word.length - 1; i++) {
      if (word[i] !== '-' || !breaksAfterHardHyphen(word[i - 1], word[i + 1])) continue;
      if (measureTextWidth(word.slice(start, i + 1), font) > widthPx) return true;
      start = i + 1;
    }
    if (measureTextWidth(word.slice(start), font) > widthPx) return true;
  }
  return false;
}

/** Graphemes `from` to `to` (exclusive; to the end when undefined) of a
 *  segment, as pretext counts a cursor's `graphemeIndex`. */
function graphemeSlice(text: string, from: number, to: number | undefined): string {
  return Array.from(graphemeSegmenter.segment(text), (g) => g.segment).slice(from, to).join('');
}

function extractSegments(
  prepared: PreparedTextWithSegments,
  start: LayoutCursor,
  end: LayoutCursor,
  font: string,
): { segments: VDTLineSegment[]; hyphenated: boolean } {
  const result: VDTLineSegment[] = [];
  let hyphenated = false;
  const kinds = prepared.kinds;
  // A word wider than the line is cut between graphemes: the line then
  // starts or ends inside a segment, and holds only that part of it.
  const last = end.graphemeIndex > 0 ? end.segmentIndex : end.segmentIndex - 1;

  for (let i = start.segmentIndex; i <= last; i++) {
    let seg = prepared.segments[i]!;
    let w = prepared.widths[i]!;
    const from = i === start.segmentIndex ? start.graphemeIndex : 0;
    const to = i === end.segmentIndex ? end.graphemeIndex : undefined;
    if (from > 0 || to !== undefined) {
      seg = graphemeSlice(seg, from, to);
      if (seg === '') continue;
      w = measureTextWidth(seg, font);
    }

    if (seg === SOFT_HYPHEN) {
      // If this is the last segment before the break, mark as hyphenated
      if (i === end.segmentIndex - 1) hyphenated = true;
      continue;
    }
    // A zero-width break opportunity (the one the dictionary puts after a
    // slash) is no text: Knuth–Plass lines leave it out too.
    if (kinds[i] === 'zero-width-break') continue;

    if (seg.trim().length === 0) {
      result.push({ kind: 'space', text: seg, width: w });
    } else {
      result.push({ kind: 'text', text: seg, width: w });
    }
  }

  // Check if the break point is at a soft hyphen
  if (!hyphenated && end.segmentIndex < prepared.segments.length) {
    if (prepared.segments[end.segmentIndex] === SOFT_HYPHEN) {
      hyphenated = true;
    }
  }

  // Trim trailing spaces
  while (result.length > 0 && result[result.length - 1]!.kind === 'space') {
    result.pop();
  }

  return { segments: result, hyphenated };
}

/**
 * What a line that breaks inside a Catalan `l·l` gives back: it ends on
 * `piece`, whose last character is the dot, and the hyphen is printed in
 * the dot's place (`il-` | `lusió`).
 *
 * Up to postext 1.29, and in a document shaped in the host's language,
 * the dot set alone. But a face may set the dot after an `l` otherwise
 * than alone (#770): Castoro's is 0.129 em there in Catalan and 0.297 em
 * alone, so the head `til-` was 22.02 px for 25.28 painted at 19.4 px;
 * Lora ligates `l·`. A document shaped in its own language gives back the
 * room the dot takes in that piece, so the head is the text painted, the
 * letters before the dot and the hyphen, as a styled paragraph measures
 * it (`wordBreakPoints` in `rich.ts`).
 */
function geminateDotRoom(piece: string, font: string): number {
  if (getMeasureLanguage() === undefined) return measureTextWidth(GEMINATE_DOT, font);
  return Math.max(0, measureTextWidth(piece, font) - measureTextWidth(piece.slice(0, -1), font));
}

/** {@link geminateDotRoom} for the pieces of `text` when it has a Catalan
 *  `l·l` (see `pretextSegmentsToItems`), else 0. */
function geminateDotWidth(text: string, font: string): number | ((piece: string) => number) {
  if (!text.includes(GEMINATE_DOT)) return 0;
  if (getMeasureLanguage() === undefined) return measureTextWidth(GEMINATE_DOT, font);
  return (piece) => geminateDotRoom(piece, font);
}

function findLastTextSegmentIndex(segments: VDTLineSegment[]): number {
  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i]!.kind === 'text') return i;
  }
  return -1;
}

/** The hyphen a soft-hyphen break prints (`withLineEndHyphen`), in the
 *  text's font. Up to pretext 0.0.9 the engine read the same width out of
 *  its handle; 1.0 keeps it to itself, and may measure U+2010 there. */
function getHyphenWidth(font: string): number {
  return measureTextWidth('-', font);
}

/**
 * A line pretext ends before a word whose first piece ends inside a Catalan
 * `l·l` (`il·` | `lusió`), taken through that piece when it fits with its
 * hyphen printed in the dot's place (`il-`). Pretext 1.0 fits the dot and
 * the hyphen both (0.0.9 fitted neither), so it would not end the line
 * there (#1213). The line comes back as pretext gives a soft-hyphen break:
 * its text and width with the dot and the hyphen; the loop gives the dot
 * back.
 */
function throughGeminate(prepared: PreparedTextWithSegments, line: LayoutLine, maxWidth: number, font: string): LayoutLine {
  const { segments, kinds, widths } = prepared;
  const i = line.end.segmentIndex;
  if (line.end.graphemeIndex !== 0 || kinds[i] !== 'text' || kinds[i + 1] !== 'soft-hyphen' || kinds[i - 1] !== 'space') return line;
  const piece = segments[i]!;
  if (!endsInsideGeminate(piece)) return line;
  let spaces = 0;
  for (let j = i - 1; j >= line.start.segmentIndex && kinds[j] === 'space'; j--) spaces += widths[j]!;
  const width = line.width + spaces + widths[i]! + getHyphenWidth(font);
  if (width - geminateDotRoom(piece, font) > maxWidth) return line;
  return { ...line, text: line.text + piece + '-', width, end: { segmentIndex: i + 2, graphemeIndex: 0 } };
}

/**
 * Whether a Knuth–Plass line runs past its measure even with its spaces
 * removed: a word wider than the whole line has no feasible break around
 * it, and the search then sets it — with everything before it back to the
 * last feasible break — on one overfull line. A ragged line's spaces do not
 * shrink (`rigidSpaces`): they count.
 */
export function hasOverfullLine(lines: VDTLine[], lineWidth: (lineIndex: number) => number, rigidSpaces = false): boolean {
  return lines.some((line, i) => {
    let width = 0;
    for (const seg of line.segments ?? []) if (rigidSpaces || seg.kind !== 'space') width += seg.width;
    return width > lineWidth(i) + 0.5;
  });
}

/** The painted word-space ratio of a justified line that is not the last
 *  (`VDTLine.justifiedSpaceRatio`); the breakers call `justifiedSpaceRatios`,
 *  which gives the ratio the limits bound too (#704). */
export function computeJustifiedSpaceRatio(
  segments: VDTLineSegment[],
  lineMaxWidth: number,
  normalSpaceWidth: number,
  textAlign: TextAlign,
  isLastLine: boolean,
): number | undefined {
  if (textAlign !== 'justify' || isLastLine || normalSpaceWidth <= 0) return undefined;
  let wordWidth = 0;
  let spaceCount = 0;
  for (const s of segments) {
    if (s.kind === 'space') spaceCount++;
    else wordWidth += s.width;
  }
  if (spaceCount === 0) return undefined;
  const justifiedSpaceWidth = (lineMaxWidth - wordWidth) / spaceCount;
  return justifiedSpaceWidth / normalSpaceWidth;
}

/**
 * Measure a text block: break it into lines within maxWidthPx
 * and return VDTLine data with bounding boxes.
 *
 * The returned lines have bbox positions relative to the block origin (0,0).
 * The pipeline will offset them to absolute page coordinates later.
 */
export function measureBlock(
  text: string,
  font: string,
  maxWidthPx: number,
  lineHeightPx: number,
  options?: MeasureBlockOptions,
): MeasuredBlock {
  if (text.trim() === '') {
    return { lines: [], totalHeight: 0 };
  }
  // A writing mode asked for this text alone (`options.writingMode`).
  if (options?.writingMode !== undefined && options.writingMode !== getMeasureWritingMode()) {
    const opts = options;
    return withMeasureWritingMode(opts.writingMode!, () => measureBlock(text, font, maxWidthPx, lineHeightPx, opts));
  }

  // A forced line break (#620): the word-by-word breaker breaks the text
  // between two of them on its own (`measure/hardBreaks.ts`).
  if (text.includes(FORCED_BREAK)) {
    return measureRichBlock([{ text, bold: false, italic: false }], font, font, font, font, maxWidthPx, lineHeightPx, options);
  }
  // Words set without spaces (Chinese, Japanese, Korean): the formatted
  // path's breaker, which composes a CJK paragraph (clreq line breaking,
  // inter-character justification) and breaks a Latin one that quotes CJK
  // words next to their characters. The same text gives the same lines on
  // both paths. In vertical text so does any text with a character that
  // stands in a cell of its own (— … © ×) or a short number set in one
  // (`cjk.uprightDigits`): pretext would measure it at its horizontal
  // width. And so does a word holding CJK text and two marks
  // that meet (`本）》录`): pretext would measure it with the browser's
  // trimming, where the renderers paint such marks apart (`markCuts`).
  // Each of the three CJK tests needs CJK text (`hasCJK`), looked for once.
  // A row of dashes alone in a Chinese or Japanese document goes there
  // too (#680): the composer draws it as one rule.
  if ((hasCJK(text) && (hasCJKRun(text) || composesAsCjk(text) || markCuts(text, 'words').length > 0)) || (measuringVertically() && holdsVerticalCell(text, getMeasureUprightDigits(), getMeasureRegion())) || (text.length > 1 && composesDashRow(text, options?.cjkComposition))) {
    return measureRichBlock([{ text, bold: false, italic: false }], font, font, font, font, maxWidthPx, lineHeightPx, options);
  }
  // A unit square (㎡ ㎏, `isUnitSquare`) stays with its number, as the
  // word-by-word breaker keeps it; pretext 1.0 breaks before one as Chrome
  // does (#1213).
  if (UNIT_SQUARE_RE.test(text)) {
    return measureRichBlock([{ text, bold: false, italic: false }], font, font, font, font, maxWidthPx, lineHeightPx, options);
  }
  // A paragraph set right to left, or holding right-to-left text: the
  // word-by-word breaker, which cuts its words where their direction
  // changes (`ABC،`, `(API)` in Arabic), measuring each piece as it is
  // painted (pretext measures `(API)` whole, its brackets kerned to letters
  // they end up on the far side of), and gives its lines their order
  // (`measure/rtl/bidiLines.ts`).
  if ((options?.direction ?? getMeasureDirection()) === 'rtl' || needsBidi(text)) {
    return measureRichBlock([{ text, bold: false, italic: false }], font, font, font, font, maxWidthPx, lineHeightPx, options);
  }
  // A word with no letter (`46.`, `1367)`) in a face that draws its
  // punctuation by script (#725, `measure/script.ts`): the word-by-word
  // breaker, which measures it in the script of the text around it and
  // says so on its segment. Pretext would measure it alone, in whatever
  // script the browser picks for a text with none.
  // So does a word with a letter that may part into a piece with none:
  // after its hyphen (`COVID-19`), or anywhere when it is wider than its
  // line. The breaker measures that piece in the script of its word.
  const readsScript = getMeasureScriptContext().enabled && !measuringVertically() && faceReadsScript(font);
  if (readsScript && (holdsLetterlessWord(text) || holdsLetterlessPiece(text))) {
    return measureRichBlock([{ text, bold: false, italic: false }], font, font, font, font, maxWidthPx, lineHeightPx, options);
  }
  const shouldHyphenate = options?.hyphenate ?? false;
  // Each line's start: its indent past its inset beside a picture (#627).
  const indentOf = (li: number): number => lineStartAt(options, li);
  const widestIndent = maxLineIndent(options) + maxLineInset(options?.lineInsets);
  const textAlign = options?.textAlign ?? 'left';
  // A hyphenation zone (ragged text) needs the word-level breakers, which
  // weigh each dictionary syllable against the gap it would leave and tell
  // the dictionary's soft hyphens from the author's; pretext's takes every
  // soft hyphen that fits.
  if (shouldHyphenate && options?.hyphenationZonePx !== undefined && !(options.optimal && textAlign === 'justify')) {
    return measureRichBlock([{ text, bold: false, italic: false }], font, font, font, font, maxWidthPx, lineHeightPx, options);
  }
  // Pretext glues its neighbours to a no-break space (U+00A0, U+202F,
  // U+FEFF) but not to a figure space (U+2007), which it may break at; the
  // word-by-word breaker glues all four (EF-66).
  // A glued group wider than the narrowest line likewise (EF-66): pretext
  // would cut it between characters.
  if (text.includes(FIGURE_SPACE) || hasOverwideGluedGroup(text, font, Math.min(maxWidthPx, ...(options?.restWidths ?? []).map((s) => s.maxWidthPx)) - widestIndent)) {
    return measureRichBlock([{ text, bold: false, italic: false }], font, font, font, font, maxWidthPx, lineHeightPx, options);
  }
  if (readsScript && hasOverwideMixedWord(text, font, Math.min(maxWidthPx, ...(options?.restWidths ?? []).map((s) => s.maxWidthPx)) - widestIndent)) {
    return measureRichBlock([{ text, bold: false, italic: false }], font, font, font, font, maxWidthPx, lineHeightPx, options);
  }
  // Words of a joining script stay whole: pretext would break one at a soft
  // hyphen its author typed, and cut one wider than the line between two
  // letters. The word-by-word breaker does neither.
  if (joiningScriptIn(text) && (text.includes(SOFT_HYPHEN) || hasOverwideJoiningWord(text, font, Math.min(maxWidthPx, ...(options?.restWidths ?? []).map((s) => s.maxWidthPx)) - widestIndent))) {
    return measureRichBlock([{ text, bold: false, italic: false }], font, font, font, font, maxWidthPx, lineHeightPx, options);
  }
  // A hyphen repeated at the start of the line after a compound's break
  // (`repeatHyphen`) is measured by the word-by-word breaker; pretext's
  // cannot add it.
  if (options?.repeatHyphen && hasCompound(text)) {
    return measureRichBlock([{ text, bold: false, italic: false }], font, font, font, font, maxWidthPx, lineHeightPx, options);
  }
  // Compounds the dictionary leaves whole: their own hyphen is their one
  // break, so Knuth–Plass must have it. A part of one wider than the line
  // is divided at its syllables by the word-by-word breaker.
  const keepCompounds = shouldHyphenate && options?.hyphenateCompounds === false;
  if (keepCompounds && hasOverwideCompoundPart(text, font, maxWidthPx - widestIndent)) {
    return measureRichBlock([{ text, bold: false, italic: false }], font, font, font, font, maxWidthPx, lineHeightPx, options);
  }
  const hyphenatedText = shouldHyphenate
    ? (keepCompounds ? hyphenateTextKeepingCompounds(text) : hyphenateText(text))
    : text;
  // Pretext breaks at every soft hyphen it is given: one typed at a word's
  // edge or next to punctuation is no break and is left out (#700). The
  // block's plain text keeps it, as it keeps the ones inside a line.
  const processedText = text.includes(SOFT_HYPHEN) ? withoutEdgeSoftHyphens(text, hyphenatedText) : hyphenatedText;
  // In a document shaped in its own language a word a line may end inside
  // is measured whole, as in a paragraph with a style (#772). A justified
  // paragraph whose document keeps the lines of postext 1.4 at a compound's
  // hyphen (`breakAfterHyphens: false`) stays here: the word-by-word
  // breaker always breaks there.
  const keepsCompoundLines = options?.optimal === true && textAlign === 'justify' && options.breakAfterHyphens !== true && !keepCompounds && hasCompound(text);
  if (!keepsCompoundLines && measuresWordsWhole(processedText)) {
    return measureRichBlock([{ text, bold: false, italic: false }], font, font, font, font, maxWidthPx, lineHeightPx, options);
  }

  // Measured in the document's language, like every other text (#764).
  const prepared = prepareInLanguage(processedText, font);
  const normalSpaceWidth = textAlign === 'justify' ? normalSpaceWidthFor(font) : 0;

  // Knuth-Plass optimal line breaking path (text with words set without
  // spaces went to the formatted path above; a lone CJK bracket or
  // fullwidth sign in Latin text is no reason). Ragged text takes it too
  // with `optimalRagged`: its word spaces keep their width and each line
  // gets the ragged stretch instead.
  const ragged = textAlign !== 'justify';
  if (options?.optimal && (!ragged || options.optimalRagged)) {
    const maxStretchRatio = ragged ? 1 : options.maxStretchRatio ?? 1.5;
    const minShrinkRatio = ragged ? 1 : options.minShrinkRatio ?? 0.8;
    // The runt threshold counts word spaces on ragged text too.
    const spaceWidth = ragged ? normalSpaceWidthFor(font) : normalSpaceWidth;
    // Ragged text keeps the break after a hyphen the text carries that
    // pretext's line-by-line breaker gave it (and the rich path has);
    // justified text takes it with `breakAfterHyphens` (with two letters
    // on each side, so no line ends on "e-"), and wherever the dictionary
    // leaves compounds whole, whose one break it is.
    const hardHyphens = ragged || options.breakAfterHyphens === true || keepCompounds;
    const dotWidth = geminateDotWidth(text, font);
    const hyphenWidth = getHyphenWidth(font);
    const items = pretextSegmentsToItems(prepared, hyphenWidth, spaceWidth, maxStretchRatio, minShrinkRatio, options.breakAfterDashes === true, hardHyphens, ragged || keepCompounds ? 1 : 2, dotWidth);
    const lineWidthFn = lineWidthFunction(maxWidthPx, options);
    const lineIndentFn = indentOf;
    const runtPenalty = options.runtPenalty ?? 0;
    const runtMinWidth = runtPenalty > 0
      ? (options.runtMinCharacters ?? 0) * spaceWidth
      : 0;
    const trackingPerChar = ragged ? 0 : options.justifyTrackingPx ?? 0;
    const breaks = computeBreakpoints(items, {
      lineWidth: lineWidthFn,
      normalSpaceWidth: spaceWidth,
      maxStretchRatio,
      minShrinkRatio,
      runtPenalty,
      runtMinWidth,
      runtGraded: options.runtGraded === true,
      ...(options.avoidHyphenAtLines ? { avoidHyphenAtLines: options.avoidHyphenAtLines } : {}),
      ...(options.keepBreaks?.path === 'plain' ? { fixedBreaks: options.keepBreaks.at } : {}),
      looseness: options.looseness ?? 0,
      lineWidthUniformFrom: uniformMeasureFrom(options.restWidths, options.lineIndentsPx, options.lineInsets),
      trackingPerChar,
      ...(ragged ? { raggedStretch: raggedStretchPx(font) } : {}),
    });
    if (breaks.length > 0) {
      const kpLines = reconstructPretextLines(
        items, breaks, prepared, hyphenWidth, lineHeightPx,
        lineWidthFn, lineIndentFn, normalSpaceWidth, textAlign,
        trackingPerChar, lineBaselineOffset(lineHeightPx, font), dotWidth,
      );
      if (!hasOverfullLine(kpLines, lineWidthFn, ragged)) {
        markInsetLines(kpLines, maxWidthPx, options);
        return {
          lines: kpLines,
          totalHeight: kpLines.length * lineHeightPx,
          ...(isRuntLastLine(kpLines, runtMinWidth) ? { lastLineRunt: true } : {}),
          breaks: { path: 'plain', at: breaks },
        };
      }
    }
    // Fallback to greedy if K-P produced no breaks, or a line past the
    // measure (a word wider than it: the greedy breaker divides it)
  }

  const lines: VDTLine[] = [];
  const baselineOffset = lineBaselineOffset(lineHeightPx, font);
  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };
  let y = 0;
  let lineIndex = 0;

  while (true) {
    // The line's own indent (`lineIndentAt`): the first line's, a hanging
    // one, or the line's entry in `lineIndentsPx`; past its inset beside a
    // picture (#627).
    const lineIndent = indentOf(lineIndex);
    const lineMaxWidth = lineWidthAt(maxWidthPx, options, lineIndex);

    const next = layoutNextLine(prepared, lineMaxWidth, cursor);
    if (next === null) break;
    const line = throughGeminate(prepared, next, lineMaxWidth, font);

    const nextCursor = line.end;

    const { segments, hyphenated } = extractSegments(prepared, cursor, nextCursor, font);

    /** What the break inside an `l·l` gave back on this line, if it ends there. */
    let geminateRoom: number | undefined;
    if (hyphenated) {
      const lastTextIdx = findLastTextSegmentIndex(segments);
      if (lastTextIdx >= 0) {
        const lastSeg = segments[lastTextIdx]!;
        segments[lastTextIdx] = {
          kind: 'text',
          text: withLineEndHyphen(lastSeg.text),
          width: lastSeg.width + getHyphenWidth(font)
            - (endsInsideGeminate(lastSeg.text) ? (geminateRoom = geminateDotRoom(lastSeg.text, font)) : 0),
        };
      }
    }

    // Whether this turns out to be the last line is only known once the
    // loop ends; the ratio is computed as if it weren't and corrected below.
    // This avoids a second layoutNextLine call per line just to peek ahead.
    const spaceRatios = textAlign === 'justify' ? justifiedSpaceRatios(segments, lineMaxWidth, normalSpaceWidth) : {};

    // Pretext's line text already ends with the hyphen of a soft-hyphen
    // break; add it only when it does not. It also carries the zero-width
    // breaks the segments leave out.
    let lineText = cleanSoftHyphens(line.text).replace(/\u200B/g, '');
    let lineWidth = line.width;
    if (hyphenated) {
      const body = lineText.endsWith('-') ? lineText.slice(0, -1) : lineText;
      if (endsInsideGeminate(body)) lineWidth -= geminateRoom ?? measureTextWidth(GEMINATE_DOT, font);
      lineText = withLineEndHyphen(body);
    }
    lines.push({
      text: lineText,
      bbox: createBoundingBox(lineIndent, y, lineWidth, lineHeightPx),
      baseline: y + baselineOffset,
      hyphenated,
      segments,
      isLastLine: false,
      ...spaceRatios,
    });

    cursor = nextCursor;
    y += lineHeightPx;
    lineIndex++;
  }

  const lastLine = lines[lines.length - 1];
  if (lastLine) {
    lastLine.isLastLine = true;
    delete lastLine.justifiedSpaceRatio;
    delete lastLine.justifiedSpaceLimitRatio;
  }
  markInsetLines(lines, maxWidthPx, options);

  return { lines, totalHeight: y };
}
