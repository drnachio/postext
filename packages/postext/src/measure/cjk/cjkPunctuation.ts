/**
 * Punctuation widths, Han–Latin spacing and hanging punctuation of CJK
 * text (clreq §6.1.3, §6.2.2, §6.3.2, §6.3.3), for the CJK composer
 * (`cjkCompose.ts`).
 *
 * The model is additive, as in metal type and every CJK composer since: a
 * full-width mark is half an em of glyph and half an em of blank on one
 * side — before the glyph for an opening bracket or quote, after it for a
 * closing one and for the mainland's pause and stop marks (set in the
 * corner of their box), a quarter em on each side for the marks Taiwan and
 * Hong Kong centre. What is adjusted is the blank, never the glyph: a mark
 * that gives up blank on its start side is painted that far before its box
 * (`VDTLineSegment.inkOffset`), so its ink stays where the reader expects
 * it.
 *
 * The width decisions go through {@link punctuationBox} (the style and the
 * region), {@link compressPair} (two marks that meet), the line edges
 * ({@link lineStartTrim}, {@link lineEndTrim}) and the reduction a line
 * makes to take one more character ({@link punctuationShrink}). All of them
 * work on the inline axis only: vertical text passes `vertical: true`,
 * which fixes ：；？！ at one em (clreq §6.3.2.1), and otherwise reuses them
 * as they are.
 *
 * Japanese full-width text (`japan`, `fullwidth`) follows JLReq where it
 * differs from clreq ({@link isJlreqSpacing}): ・：； hold a quarter em
 * each side and ？！ none; the half em after a closing mark or 、。 stays
 * at the end of a line and is the first blank given up, all of it, to
 * take one more character; inside the line 、「」・ give theirs up and 。
 * never does (JLReq §3.1, §3.8.3).
 *
 * Which blank a region's glyphs carry is decided by the region, not by the
 * font: a Traditional Chinese font set under a mainland tag (or the
 * reverse) puts its marks where its designer did, and compression then
 * trims the wrong side. Books should be set in a face of their region
 * (Noto Serif SC for the mainland, TC for Taiwan, HK for Hong Kong).
 */

import type { CjkClass } from './cjkClasses.js';
import { type PunctuationBox, boxCut, blankEnd, isStop, giveUp, punctuationBox } from './cjkPunctuation/box.js';
import { type CjkComposition, isJlreqSpacing } from './cjkPunctuation/composition.js';
import { applyLineTrim, lineStartTrim, lineEndTrim } from './cjkPunctuation/lineEdges.js';

export { DEFAULT_TITLE_MIN_CHARS, DEFAULT_NOTE_MIN_CHARS, PLAIN_CJK_COMPOSITION, setCjkComposition, getCjkComposition, cjkCompositionOf, routesSharedMarks, joinsDashPairs, compositionFor, cjkCompositionKey, isPlainComposition, isJlreqSpacing } from './cjkPunctuation/composition.js';
export type { CjkComposition } from './cjkPunctuation/composition.js';
export { punctuationSide, boxCut, blankStart, blankEnd, punctuationBox } from './cjkPunctuation/box.js';
export type { PunctuationSide, PunctuationBox } from './cjkPunctuation/box.js';
export { compressPair, carryStopBlank, lineStartTrim, lineEndTrim, applyLineTrim, applyLineEdges, lineEdgeCut } from './cjkPunctuation/lineEdges.js';

/**
 * The blank a mark may still give up when its line is compressed to take
 * one more character that may not open the next line (push-in, clreq
 * §6.2.2.3), after its style, its neighbours and the line edges took
 * theirs. `fullwidth` marks give up nothing (a full-width book keeps its
 * grid); `halfwidth` marks have nothing left; `kaiming` lets its stop marks
 * go down to half an em, last (only to resolve a prohibition: a line that
 * merely falls short is spread, so Kaiming keeps 。？！ one em inside the
 * line), and with them the stop's blank a closing mark holds
 * ({@link carryStopBlank}); `lineEndHalf` lets every mark go down to half an
 * em.
 *
 * JLReq spacing ({@link isJlreqSpacing}, §3.8.3) gives up more: a mark
 * that ends the line (`atEnd`) the blank after its glyph, a middle dot
 * (・：；) inside the line its quarter em on each side, and an opening
 * bracket, a closing one or 、， inside the line their half em; never the
 * half em after 。． inside the line.
 */
export function punctuationShrink(box: PunctuationBox | undefined, c: CjkComposition, atEnd = false): number {
  if (!box) return 0;
  const rest = Math.max(0, box.blank - boxCut(box));
  if (isJlreqSpacing(c)) {
    if (atEnd) return Math.max(0, blankEnd(box));
    return box.cls === 'stop' ? 0 : rest;
  }
  switch (c.punctuationWidth) {
    case 'kaiming':
      return isStop(box) || box.carry ? rest : 0;
    case 'lineEndHalf':
      return rest;
    default:
      return 0;
  }
}

/** Give up `amount` px of a mark's blank to compress its line (see
 *  {@link punctuationShrink}); returns what it gave. `atEnd`: only the
 *  blank after the glyph of a mark that ends the line (JLReq spacing). */
export function shrinkPunctuation(box: PunctuationBox, amount: number, atEnd = false): number {
  if (atEnd) {
    const take = Math.min(amount, Math.max(0, blankEnd(box)));
    if (take <= 0) return 0;
    box.cutEnd += take;
    return take;
  }
  return giveUp(box, amount);
}

/** The step of clreq §6.2.2.3's reduction order a mark belongs to:
 *  interpuncts, then brackets, then pause marks, then (after the Han–Latin
 *  spaces) stop marks, and a closing mark holding a stop's blank. */
export function shrinkStep(box: PunctuationBox): number {
  if (box.carry) return 6;
  switch (box.cls) {
    case 'interpunct': return 2;
    case 'opening': case 'closing': return 3;
    case 'pause': return 4;
    default: return 6;
  }
}

/**
 * The step of JLReq §3.8.3's reduction order (Table 3) a mark belongs to,
 * after the word spaces (1): at the end of the line, the half em after a
 * closing mark or 、。 (2), then the quarter em after a middle dot (3),
 * each all or nothing (JLReq §3.1.9); inside the line, the middle dots'
 * quarter ems (4), then the half ems of brackets and 、， (5); the space
 * between Japanese and Latin text comes last (6).
 */
export function jlreqShrinkStep(box: PunctuationBox, atEnd: boolean): number {
  if (atEnd) return box.side === 'both' ? 3 : 2;
  return box.side === 'both' ? 4 : 5;
}

/**
 * The advance of one mark and where its glyph is painted, px — the width
 * decision of {@link punctuationBox} and the line edges, for a single mark
 * with no neighbour: the reuse point for renderers and vertical text.
 * Characters that are no adjustable mark keep `advance`.
 */
export function punctuationAdvance(
  grapheme: string,
  cls: CjkClass,
  advance: number,
  em: number,
  c: CjkComposition,
  edges: { lineStart?: boolean; lineEnd?: boolean } = {},
): { advance: number; inkOffset: number } {
  const box = punctuationBox(grapheme, cls, advance, em, c);
  if (!box) return { advance, inkOffset: 0 };
  applyLineTrim(box, edges.lineStart ? lineStartTrim(box, c) : 0, edges.lineEnd ? lineEndTrim(box, c) : 0);
  return { advance: advance - boxCut(box), inkOffset: box.cutStart > 0 ? -box.cutStart : 0 };
}

/** Marks that may hang in any region: 、，。． */
const HANG_ANYWHERE = new Set(['、', '，', '。', '．', '､', '｡']);

/**
 * Whether a mark may hang past the end of its line
 * (`cjk.hangingPunctuation`, clreq §6.1.3): 、，。． everywhere and, on the
 * mainland (whose marks sit at the start of their box), every pause and
 * stop mark; under `'allow'`, never in horizontal Taiwan and Hong Kong
 * text, whose centred marks look cut off. Japan hangs 、，。． only, in
 * either writing mode (ぶら下げ, JLReq §2.5.1: closing brackets and ？！
 * never hang).
 */
export function mayHang(grapheme: string, cls: CjkClass, c: CjkComposition): boolean {
  if (c.hangingPunctuation === 'none') return false;
  if (cls !== 'pause' && cls !== 'stop') return false;
  if (c.hangingPunctuation === 'allow' && c.region !== 'mainland' && c.region !== 'japan' && !c.vertical) return false;
  return HANG_ANYWHERE.has(grapheme) || c.region === 'mainland';
}

/** Han characters, kana, bopomofo and 〇々: what takes the Han–Latin
 *  space on one side. */
const HAN_RE = /^[々〇〡-〩〸-〻぀-ゟ゠-ヿ㄀-ㄯㆠ-ㆿㇰ-ㇿ㐀-䶿一-鿿豈-﫿\u{20000}-\u{3FFFF}]/u;
const LATIN_RE = /[\p{L}\p{N}]/u;

/** Whether a grapheme takes the Han–Latin space on its Latin side: a letter
 *  or a digit (not a sign such as ¥ or %). */
export function isLatinSpacingLatin(grapheme: string | undefined): boolean {
  return grapheme !== undefined && LATIN_RE.test(grapheme);
}

/** Whether a grapheme takes the Han–Latin space on its Han side. */
export function isLatinSpacingHan(grapheme: string | undefined): boolean {
  return grapheme !== undefined && HAN_RE.test(grapheme);
}

/** The Han–Latin space in px for text whose CJK font has an em of `em`
 *  px. */
export function latinSpacingPx(c: CjkComposition, em: number): number {
  return c.latinSpacing.px ?? (c.latinSpacing.em ?? 0) * em;
}
