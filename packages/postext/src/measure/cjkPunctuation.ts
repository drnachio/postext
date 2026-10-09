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

import type { CjkHangingPunctuation, CjkParagraphStartBracket, CjkPunctuationWidth, CjkRegion, Dimension, ResolvedCjkConfig } from '../types';
import { setCjkCircledNumbers, type CjkClass } from './cjkClasses';
import { dimensionToPx } from '../units';
import { languageOf } from '../locale';

/** How CJK text is composed: the resolved `cjk` settings, as the composer
 *  reads them. */
export interface CjkComposition {
  region: CjkRegion;
  punctuationWidth: CjkPunctuationWidth;
  compressAdjacent: boolean;
  trimLineStart: boolean;
  hangingPunctuation: CjkHangingPunctuation;
  /** The space between Han and Latin: in em of the CJK text's font size
   *  (`em`), or in px when `cjk.latinSpacing` was a length (`px`). Zero
   *  turns it off. */
  latinSpacing: { em: number; px?: undefined } | { px: number; em?: undefined };
  /** The text runs down the page (vertical-rl): ：；？！ keep one em. */
  vertical?: boolean;
  /** The document's language, the primary subtag of its locale in lower
   *  case (`zh`, `ja`, `ko`, `en`…); unset when unknown. Japanese and
   *  Korean text keeps the marks it shares with Latin text at their own
   *  advance (see {@link routesSharedMarks}). */
  language?: string;
  /** One em of blank after a ？ or ！ that ends a sentence inside the
   *  paragraph (`cjk.spaceAfterQuestion`, JLReq §3.1.6); unset: none. */
  spaceAfterQuestion?: boolean;
  /** How an opening bracket that starts an indented paragraph is set
   *  (`cjk.paragraphStartBracket`); unset: as at any line start. */
  paragraphStartBracket?: CjkParagraphStartBracket;
  /** Lines break only at spaces and next to punctuation, never between
   *  two letters (`cjk.wordBreak: 'keep-all'`); unset: between any two
   *  characters the line-break level allows. A paragraph may set its own
   *  (`MeasureBlockOptions.cjkWordBreak`). */
  keepAll?: boolean;
  /** How many characters of a book title (`《…》`, `〈…〉`, a `:book[…]`
   *  span) a line break leaves on either side of it at least
   *  (`cjk.titleMinChars`, #637); unset: {@link DEFAULT_TITLE_MIN_CHARS}.
   *  1 lets a line break anywhere in a title the level allows. */
  titleMinChars?: number;
  /** `'western'`: the circled numbers ①–⑳ and their kin are Western
   *  letters, as up to 1.24 (`cjk.circledNumbers`, #637); unset: Chinese
   *  characters (see `setCjkCircledNumbers`). */
  circledNumbers?: 'western';
  /** Design text (openers, heading designs, running heads, page designs)
   *  is wrapped word by word at the font's own advances, as up to 1.24
   *  (`cjk.composeDesignText: false`, #637); unset: a design text that
   *  composes as CJK is set by the CJK composer. */
  plainDesignText?: true;
}

/** Characters of a book title a line break leaves on either side of it by
 *  default (`cjk.titleMinChars`). */
export const DEFAULT_TITLE_MIN_CHARS = 2;

/** The composition outside a build: every mark at its full advance, no
 *  compression, no hanging, no Han–Latin space — CJK text set as the
 *  composer set it before these settings existed. A build replaces it with
 *  the document's (`setCjkComposition`). */
export const PLAIN_CJK_COMPOSITION: CjkComposition = {
  region: 'mainland',
  punctuationWidth: 'fullwidth',
  compressAdjacent: false,
  trimLineStart: false,
  hangingPunctuation: 'none',
  latinSpacing: { em: 0 },
};

let documentComposition: CjkComposition = PLAIN_CJK_COMPOSITION;

/** Set the composition CJK text is set with when a measurement names none
 *  (the build does, from the resolved `cjk`), as `setCjkLineBreak` sets the
 *  line-break level. `undefined` restores {@link PLAIN_CJK_COMPOSITION}. */
export function setCjkComposition(composition: CjkComposition | undefined): void {
  documentComposition = composition ?? PLAIN_CJK_COMPOSITION;
  setCjkCircledNumbers(documentComposition.circledNumbers !== 'western');
}

/** The composition set by {@link setCjkComposition}. */
export function getCjkComposition(): CjkComposition {
  return documentComposition;
}

/** The composition of a resolved `cjk` config: `latinSpacing` in em when it
 *  is written in em (or rem), else converted to px at `dpi`. `locale` is
 *  the document language (`language`). */
export function cjkCompositionOf(cjk: ResolvedCjkConfig, dpi: number, locale?: string): CjkComposition {
  const ls: Dimension = cjk.latinSpacing;
  const language = languageOf(locale);
  return {
    region: cjk.region,
    punctuationWidth: cjk.punctuationWidth,
    compressAdjacent: cjk.compressAdjacent,
    trimLineStart: cjk.trimLineStart,
    hangingPunctuation: cjk.hangingPunctuation,
    latinSpacing: ls.unit === 'em' || ls.unit === 'rem' ? { em: Math.max(0, ls.value) } : { px: Math.max(0, dimensionToPx(ls, dpi)) },
    ...(language ? { language } : {}),
    ...(cjk.spaceAfterQuestion ? { spaceAfterQuestion: true } : {}),
    ...(cjk.paragraphStartBracket ? { paragraphStartBracket: cjk.paragraphStartBracket } : {}),
    ...(cjk.wordBreak === 'keep-all' ? { keepAll: true } : {}),
    ...(cjk.titleMinChars !== DEFAULT_TITLE_MIN_CHARS ? { titleMinChars: cjk.titleMinChars } : {}),
    ...(cjk.circledNumbers === 'western' ? { circledNumbers: 'western' as const } : {}),
    ...(cjk.composeDesignText === false ? { plainDesignText: true as const } : {}),
  };
}

/** Kana and hangul: a paragraph holding them is Japanese or Korean. */
const KANA_HANGUL_RE = /[ᄀ-ᇿ぀-ゟ゠-ヿ㄰-㆏ㇰ-ㇿꥠ-꥿가-힯ힰ-퟿ｦ-ﾟ]/;

/** Whether the composition sets Japanese or Korean text. */
function japaneseOrKorean(c: CjkComposition): boolean {
  return c.language === 'ja' || c.language === 'ko';
}

/**
 * Whether the marks Latin text shares with Chinese (“ ” ‘ ’ … — ·) may take
 * a Chinese mark's box in a paragraph of `text` (clreq's context routing,
 * `cjkCompose.ts`). They do in Chinese text: in a Chinese document, and in
 * a CJK paragraph of a document in another language (or none) unless it
 * holds kana or hangul. Never in a Japanese or Korean document, whose
 * typography sets them otherwise (Korean at their proportional width).
 */
export function routesSharedMarks(c: CjkComposition, text: string): boolean {
  if (japaneseOrKorean(c)) return false;
  return c.language === 'zh' || !KANA_HANGUL_RE.test(text);
}

const verticalOf = new WeakMap<CjkComposition, CjkComposition>();

/** `c` for text set in the writing mode `vertical` names: the same
 *  composition, flagged `vertical` when the text runs down the page (the
 *  composer derives it from the writing mode it measures in, so a
 *  horizontal heading in a vertical book, or a caption, is set as
 *  horizontal text). */
export function compositionFor(c: CjkComposition, vertical: boolean): CjkComposition {
  if (!!c.vertical === vertical) return c;
  let hit = verticalOf.get(c);
  if (!hit) {
    hit = { ...c };
    if (vertical) hit.vertical = true;
    else delete hit.vertical;
    verticalOf.set(c, hit);
  }
  return hit;
}

/** The settings of a composition as a cache key: measurements of CJK text
 *  under other settings never share an entry. */
export function cjkCompositionKey(c: CjkComposition): string {
  const ls = c.latinSpacing.px !== undefined ? `${c.latinSpacing.px}px` : `${c.latinSpacing.em}em`;
  // The language counts where it changes a measurement: Japanese and
  // Korean route no shared marks, and only a Chinese document routes them
  // in a paragraph with kana.
  const lang = japaneseOrKorean(c) ? ':jk' : c.language === 'zh' ? ':zh' : '';
  // Japanese settings only where set, so other keys stay as they were.
  const ja = `${c.spaceAfterQuestion ? ':q' : ''}${c.paragraphStartBracket ? `:p${c.paragraphStartBracket}` : ''}${c.keepAll ? ':ka' : ''}`;
  // The title rule and the circled numbers (#637) only where they differ
  // from the default.
  const titles = c.titleMinChars !== undefined && c.titleMinChars !== DEFAULT_TITLE_MIN_CHARS ? `:t${c.titleMinChars}` : '';
  const circled = c.circledNumbers === 'western' ? ':cw' : '';
  return `${c.region}:${c.punctuationWidth}:${c.compressAdjacent ? 1 : 0}:${c.trimLineStart ? 1 : 0}:${c.hangingPunctuation}:${ls}${c.vertical ? ':v' : ''}${lang}${ja}${titles}${circled}`;
}

/** Whether a composition changes nothing: the text is set as without it. */
export function isPlainComposition(c: CjkComposition): boolean {
  return c.punctuationWidth === 'fullwidth' && !c.compressAdjacent && !c.trimLineStart
    && c.hangingPunctuation === 'none' && (c.latinSpacing.px ?? c.latinSpacing.em ?? 0) === 0
    && !c.spaceAfterQuestion && !c.paragraphStartBracket;
}

/**
 * Whether marks are spaced as JLReq sets Japanese full-width text (§3.1,
 * Appendix B): the `japan` region with `fullwidth` marks (its default).
 * Then ・：； hold a quarter em on each side ({@link punctuationSide}), a
 * closing mark or 、。 keeps its half em at a line end
 * ({@link lineEndTrim}), and a line takes one more character by giving up
 * blank in JLReq's order ({@link jlreqShrinkStep}); a Chinese region, or
 * Japan under another width style, keeps clreq's rules.
 */
export function isJlreqSpacing(c: CjkComposition): boolean {
  return c.region === 'japan' && c.punctuationWidth === 'fullwidth';
}

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
function giveUp(box: PunctuationBox, amount: number): number {
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
function isStop(box: PunctuationBox): boolean {
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
function isMarkClass(cls: CjkClass): boolean {
  return cls === 'opening' || cls === 'closing' || cls === 'pause' || cls === 'stop' || cls === 'interpunct';
}

/**
 * Two marks that meet (`a` then `b`) give up the blank between them, so the
 * pair takes 1.5 em instead of 2 (clreq §6.3.2.2, the eight rules of the
 * earlier clreq drafts): a closing bracket after another or after a
 * mainland pause or stop mark (。」, not the centred marks of Taiwan and
 * Hong Kong), a pause or stop mark after a closing bracket (」，), an
 * opening bracket after any of them or after another opening one (，「
 * 》（ 「『); a quarter em between an interpunct and a closing bracket
 * before it or an opening one after it. Only the blank between the two is
 * given up — the bracket's first — and never more than takes the pair to
 * 1.5 em, so a Kaiming pair that already takes 1.5 em (。”) keeps it.
 *
 * With `jlreq` ({@link isJlreqSpacing}) the same rules give JLReq §3.1.4's
 * table: 、」 。」 」、 」。 」」 「「 solid, 、「 」「 half an em between,
 * and 」・ ・「 (and ：； in place of ・) a quarter em between: the
 * bracket's whole half em goes, the middle dot keeps its quarter.
 */
export function compressPair(a: PunctuationBox, b: PunctuationBox, jlreq = false): void {
  if (!isMarkClass(a.cls) || !isMarkClass(b.cls)) return;
  let limit = Math.max(a.em, b.em) / 2;
  let ok = false;
  if (b.cls === 'closing' && (a.cls === 'closing' || ((a.cls === 'pause' || a.cls === 'stop') && a.side === 'end'))) ok = true;
  else if (a.cls === 'closing' && (b.cls === 'pause' || b.cls === 'stop')) ok = true;
  else if (b.cls === 'opening' && a.cls !== 'interpunct') ok = true;
  else if ((a.cls === 'closing' && b.cls === 'interpunct') || (a.cls === 'interpunct' && b.cls === 'opening')) {
    ok = true;
    if (!jlreq) limit = Math.max(a.em, b.em) / 4;
  }
  if (!ok) return;
  // The pair's advance over 1.5 em: what may go.
  const over = (a.blank - boxCut(a)) + (b.blank - boxCut(b)) - Math.max(a.em, b.em) / 2;
  let want = Math.min(limit, over);
  if (want <= 1e-9) return;
  // The blank between them: a's end side, b's start side — a bracket's
  // half-em blank before a centred mark's quarter.
  const takeEnd = (box: PunctuationBox, n: number): number => {
    const t = Math.min(n, Math.max(0, blankEnd(box)));
    box.cutEnd += t;
    if (t > 0) box.pairEnd = (box.pairEnd ?? 0) + t;
    return t;
  };
  const takeStart = (box: PunctuationBox, n: number): number => {
    const t = Math.min(n, Math.max(0, blankStart(box)));
    box.cutStart += t;
    if (t > 0) box.pairStart = (box.pairStart ?? 0) + t;
    return t;
  };
  if (a.side === 'end' || a.side === 'start') {
    want -= takeEnd(a, want);
    want -= takeStart(b, want);
  } else {
    want -= takeStart(b, want);
    want -= takeEnd(a, want);
  }
}

/**
 * Under Kaiming a stop mark keeps its blank inside the line and a closing
 * mark gives its own up, so where the two meet (。” ？” 。）) the stop's half
 * em would stand between them and the quote would read as the next
 * character's. The blank goes after the closing mark instead: 。”␣, the
 * glyphs together, as full width with `compressAdjacent` sets them; the
 * pair keeps its width. A closing mark after that one takes the blank on
 * (。”）␣). The blank is still the stop's: it goes at a line end
 * ({@link lineEndTrim}), gives way with the stop marks' to take in a
 * character ({@link punctuationShrink}), and returns to the stop when the
 * line breaks between the two. Mainland marks only (in the corner of their
 * box): a centred mark keeps its blank on both sides.
 */
export function carryStopBlank(a: PunctuationBox, b: PunctuationBox): void {
  if (b.cls !== 'closing' || b.side !== 'end' || a.side !== 'end') return;
  if (!isStop(a) && !a.carry) return;
  const moved = Math.min(Math.max(0, blankEnd(a)), b.cutEnd);
  if (moved <= 1e-9) return;
  a.cutEnd += moved;
  a.pairEnd = (a.pairEnd ?? 0) + moved;
  if (a.carry) a.carry = Math.max(0, a.carry - moved);
  b.cutEnd -= moved;
  b.carry = (b.carry ?? 0) + moved;
}

/** The blank a mark gives up when it opens a line: an opening bracket or
 *  quote its start half, with `trimLineStart` (clreq §6.3.2.3). */
export function lineStartTrim(box: PunctuationBox | undefined, c: CjkComposition): number {
  if (!box || !c.trimLineStart || box.cls !== 'opening') return 0;
  return Math.max(0, blankStart(box));
}

/** The blank a mark gives up when it ends a line: every mark under
 *  `lineEndHalf` (GB/T 15834—2011 §5.1.10), the stop marks under
 *  `kaiming` (the rest are half already, but for a closing mark holding a
 *  stop's blank, {@link carryStopBlank}), a closing bracket or quote with
 *  `trimLineStart` (clreq §6.3.2.3) but in JLReq spacing, which keeps it
 *  (§3.1.9: the line gives it up only to take one more character,
 *  {@link punctuationShrink}). A centred mark gives up a quarter em each
 *  side. */
export function lineEndTrim(box: PunctuationBox | undefined, c: CjkComposition): number {
  if (!box || box.side === 'start') return 0;
  const rest = box.side === 'both' ? Math.max(0, blankStart(box)) + Math.max(0, blankEnd(box)) : Math.max(0, blankEnd(box));
  if (c.punctuationWidth === 'lineEndHalf') return rest;
  if (c.punctuationWidth === 'kaiming' && (isStop(box) || box.cls === 'closing')) return rest;
  if (c.trimLineStart && box.cls === 'closing' && !isJlreqSpacing(c)) return rest;
  return 0;
}

/** Apply the edge trims of a line to a mark: `start` from
 *  {@link lineStartTrim}, `end` from {@link lineEndTrim}. */
export function applyLineTrim(box: PunctuationBox, start: number, end: number): void {
  if (start > 0) box.cutStart += start;
  if (end <= 0) return;
  if (box.side === 'both') {
    // A centred mark gives up what it holds on both sides.
    const s = Math.min(end, Math.max(0, blankStart(box)));
    box.cutStart += s;
    box.cutEnd += end - s;
  } else box.cutEnd += end;
}

/**
 * A mark at a line edge — it opens the line (`start`), ends it (`end`) or
 * both: the blank it gave up to the mark across the break comes back, as
 * the two no longer meet (clreq §6.3.2.2 compresses marks that meet on a
 * line), then the edge trims apply ({@link lineStartTrim},
 * {@link lineEndTrim}). Changes `box`; returns the blank given up at the
 * edges less the blank that came back, px (negative when the mark grows:
 * a full-width `，` whose `「` went to the next line is one em again).
 */
export function applyLineEdges(box: PunctuationBox, c: CjkComposition, start: boolean, end: boolean): number {
  const before = boxCut(box);
  if (start) {
    if (box.pairStart) {
      box.cutStart -= box.pairStart;
      box.pairStart = 0;
    }
    if (box.carry) {
      // The stop whose blank it held ends the line before.
      box.cutEnd += box.carry;
      box.carry = 0;
    }
    applyLineTrim(box, lineStartTrim(box, c), 0);
  }
  if (end) {
    if (box.pairEnd) {
      box.cutEnd -= box.pairEnd;
      box.pairEnd = 0;
    }
    applyLineTrim(box, 0, lineEndTrim(box, c));
  }
  return boxCut(box) - before;
}

/** What {@link applyLineEdges} would give up at the edges, leaving `box`
 *  as it is. */
export function lineEdgeCut(box: PunctuationBox, c: CjkComposition, start: boolean, end: boolean): number {
  if (!(start && (box.pairStart || box.carry)) && !(end && box.pairEnd)) {
    // Nothing comes back: the trims alone (an opening mark's start trim and
    // an end trim never touch the same blank).
    return (start ? lineStartTrim(box, c) : 0) + (end ? lineEndTrim(box, c) : 0);
  }
  return applyLineEdges({ ...box }, c, start, end);
}

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
