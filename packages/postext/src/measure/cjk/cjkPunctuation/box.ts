// The box of a punctuation mark: its side, glyph and blanks for the style
// and the region.
import type { CjkRegion } from '../../../types.js';
import type { CjkClass } from '../cjkClasses.js';
import type { CjkComposition } from './composition.js';

/** Where a full-width mark keeps the blank it may give up: before its
 *  glyph (`start`), after it (`end`), a quarter em on each side (`both`),
 *  or nowhere (`none`: a mark fixed at its advance). */
export type PunctuationSide = 'start' | 'end' | 'both' | 'none';

/** ？！ and their doubles. */
const QUESTION_EXCLAMATION = new Set(['？', '！', '?', '!', '‼', '⁇', '⁈', '⁉', '﹖', '﹗', '︖', '︕']);
/** ：；, fixed at one em in vertical text. */
const COLON_SEMICOLON = new Set(['：', '；', '﹕', '﹔', '︓', '︔']);

/**
 * The side of a mark's blank along the line (clreq §6.3.2.1): opening
 * brackets and quotes before their glyph, closing ones after it; the
 * pause and stop marks of the mainland (、，。．；：？！, in the corner of
 * their box) and Japan's 、，。． after it; the marks Taiwan and Hong Kong
 * centre (、，。．；：), Japan's ：； (a quarter em each side, as ・, JLReq
 * §3.1.2 cl-05) and interpuncts on both sides. ？！ are fixed at one em in
 * horizontal Taiwan, Hong Kong and Japanese text (JLReq cl-04: a
 * full-width glyph), and ：；？！ in vertical text everywhere. Any other
 * character has no blank.
 */
export function punctuationSide(grapheme: string, cls: CjkClass, region: CjkRegion, vertical = false): PunctuationSide {
  switch (cls) {
    case 'opening':
      return 'start';
    case 'closing':
      return 'end';
    case 'interpunct':
      return 'both';
    case 'pause':
    case 'stop':
      if (vertical && (QUESTION_EXCLAMATION.has(grapheme) || COLON_SEMICOLON.has(grapheme))) return 'none';
      if (region === 'mainland') return 'end';
      if (QUESTION_EXCLAMATION.has(grapheme)) return 'none';
      // Japan sets 、。，． in the corner of their box, as the mainland does
      // (JLReq §3.1.2), and centres ：； as Taiwan and Hong Kong do.
      if (region === 'japan' && !COLON_SEMICOLON.has(grapheme)) return 'end';
      return 'both';
    default:
      return 'none';
  }
}

/** A mark and the blank it gives up. */
export interface PunctuationBox {
  cls: CjkClass;
  grapheme: string;
  side: PunctuationSide;
  /** The em of the mark's font (px). */
  em: number;
  /** The blank the mark may give up, px: its advance less half an em. Zero
   *  for a mark fixed at its advance and for a glyph narrower than three
   *  quarters of an em (a proportional mark from a Latin face), which is
   *  never adjusted. */
  blank: number;
  /** Blank given up before the glyph and after it (px). */
  cutStart: number;
  cutEnd: number;
  /** Of `cutStart` and `cutEnd`, the blank given up to the mark before it
   *  and after it ({@link compressPair}): it comes back when a line breaks
   *  between the two ({@link applyLineEdges}). */
  pairStart?: number;
  pairEnd?: number;
  /** The blank of a Kaiming stop before it that a closing mark holds after
   *  its glyph, px ({@link carryStopBlank}): it goes when the mark opens a
   *  line ({@link applyLineEdges}). */
  carry?: number;
}

/** A mark's advance now: its full advance less the blank it gave up. */
export function boxCut(box: PunctuationBox): number {
  return box.cutStart + box.cutEnd;
}

/** The blank a mark still holds on each side. */
export function blankStart(box: PunctuationBox): number {
  if (box.side === 'start') return box.blank - box.cutStart;
  if (box.side === 'both') return box.blank / 2 - box.cutStart;
  return 0;
}
export function blankEnd(box: PunctuationBox): number {
  if (box.side === 'end') return box.blank - box.cutEnd;
  if (box.side === 'both') return box.blank / 2 - box.cutEnd;
  return 0;
}

/** Give up `amount` px of blank, on the mark's own side (half each side for
 *  a centred mark); never more than it holds. Returns what was given up. */
export function giveUp(box: PunctuationBox, amount: number): number {
  if (amount <= 0) return 0;
  if (box.side === 'start') {
    const take = Math.min(amount, blankStart(box));
    box.cutStart += take;
    return take;
  }
  if (box.side === 'end') {
    const take = Math.min(amount, blankEnd(box));
    box.cutEnd += take;
    return take;
  }
  if (box.side === 'both') {
    const each = Math.min(amount / 2, blankStart(box), blankEnd(box));
    box.cutStart += each;
    box.cutEnd += each;
    return each * 2;
  }
  return 0;
}

/** Stop marks (。．！？): the Kaiming style keeps them one em inside the
 *  line. */
export function isStop(box: PunctuationBox): boolean {
  return box.cls === 'stop';
}

/**
 * A mark (`grapheme` of class `cls`, full advance `advance` px, font em
 * `em` px) with the blank its style sets aside (clreq §6.3.2.1): none under
 * `fullwidth` and `lineEndHalf`, all of it under `halfwidth`, and under
 * `kaiming` all but for the stop marks 。．？！. The mainland interpunct is
 * half an em under every style (GB/T 15834, clreq §5.1), centred, in either
 * writing mode: a full-width glyph gives up its blank here, and in vertical
 * text its cell is half an em already (`verticalCellEms`), so it is no
 * adjustable mark there. The Japanese ・ keeps its em (half a glyph and a
 * quarter em each side, JLReq §3.1.2), as in Taiwan and Hong Kong.
 * Undefined for a character that is no adjustable mark.
 */
export function punctuationBox(grapheme: string, cls: CjkClass, advance: number, em: number, c: CjkComposition): PunctuationBox | undefined {
  const side = punctuationSide(grapheme, cls, c.region, c.vertical);
  if (side === 'none' || em <= 0 || advance < em * 0.75) return undefined;
  const box: PunctuationBox = { cls, grapheme, side, em, blank: Math.max(0, advance - em / 2), cutStart: 0, cutEnd: 0 };
  const style = c.punctuationWidth;
  if (style === 'halfwidth' || (style === 'kaiming' && !isStop(box)) || (cls === 'interpunct' && c.region === 'mainland')) giveUp(box, box.blank);
  return box;
}

/** Whether a mark takes part in the adjacent-mark rules. */
export function isMarkClass(cls: CjkClass): boolean {
  return cls === 'opening' || cls === 'closing' || cls === 'pause' || cls === 'stop' || cls === 'interpunct';
}
