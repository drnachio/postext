/**
 * The CJK line composer: Chinese (and Japanese, Korean) paragraphs, on both
 * the plain and the formatted path, broken between characters under the
 * clreq prohibitions of the document's `cjk.lineBreak` and, when justified,
 * spread between characters.
 *
 * Linear in the paragraph: every unit (one grapheme, a Western run a line
 * never breaks inside, a 2-em dash or ellipsis, an atomic box) is measured
 * once — the width cache holds single characters, not prefixes — and the
 * breaker walks the units once with a running width. A line that would
 * start with a prohibited mark gives up characters to the next line
 * (push-out), back to the last break the rules allow.
 *
 * Justification (clreq §6.2.2.4): a justified line that is not its
 * paragraph's last is stretched to the measure — word spaces first, up to
 * ½ em each, then every gap between characters equally, never inside a
 * Western run (a word, a number with its signs), a 2-em dash or ellipsis,
 * and never next to a connector or a solidus. The spread is carried as
 * segment `tracking` (px after each grapheme, in the segment's width); a
 * Western run or a dash pair that a gap follows gives its last grapheme a
 * segment of its own. A line that needs more than the cap (½ em, or
 * `bodyText.maxJustifyTracking` when set) is set with the cap and flagged
 * `cjkLoose` and `ragged`; a line with no CJK character on it (the head of
 * a long web address) is set `ragged` without the flag. Japanese
 * full-width text (`isJlreqSpacing`) follows JLReq §3.8 instead where it
 * differs: a line takes one more character by giving up blank in Table 3's
 * order (`fitLine`), and is never spread inside a bracket or next to
 * 、。・？！, a hyphen or U+3000 (`gapStretches`, JLReq §3.1.11).
 *
 * Segments: a Western run keeps one of its own, and single characters
 * share one only when they have one style, link and spacing and advance
 * alike, so a caret spread evenly over a segment lands on its characters
 * and a Markdown link covers only its own.
 */

import type { InlineKunten, InlineRuby, InlineSpan, InlineWarichu } from '../parse';
import type { VDTAnnotationRun, VDTKunten, VDTLine, VDTLineSegment, VDTSegmentMarks, VDTWarichu } from '../vdt';
import { createBoundingBox } from '../vdt';
import { isJapaneseLanguage } from '../locale';
import { lineIndentAt, lineInsetsAt, lineMeasure, markInsetLines, type MeasuredBlock, type MeasureBlockOptions } from './types';
import { measureInkBox, measureInkExtent, measureTextWidth, normalSpaceWidthFor } from './canvas';
import {
  atomicSpanToken,
  setLabelTabs,
  emergencySplit,
  expandSmallCaps,
  pickSpanFont,
  scriptMetrics,
  setsObject,
  spanScriptFields,
  stackedScriptPairs,
  textWidth,
  tokenSegment,
  URL_LIKE_RE,
  urlBreakIndices,
  type PendingSegment,
  type RichToken,
} from './rich';
import {
  cjkBreakAllowed,
  cjkClassOf,
  getCjkLineBreak,
  isCjkGrapheme,
  isFullwidthAlnum,
  isFullwidthDigit,
  isJapaneseLineBreak,
  isLineEndProhibited,
  isLineStartProhibited,
  isWordInnerMark,
  type CjkClass,
  type CjkLineBreakLevel,
} from './cjkClasses';
import { hasCJK } from './cjk';
import { graphemeCount, graphemesOf, lastGrapheme } from './graphemes';
import { isBreakingSpace } from './spaces';
import { trimChipLineEdges } from './chipEdges';
import { cellAdvance, flowTextWidth, fontEm, fontFamilyOf, getMeasureRegion, getMeasureUprightDigits, getMeasureWritingMode, lineBaselineOffset, measureCentralBaseline, verticalTrackCount, withMeasureWritingMode } from './vertical';
import { isUprightMarkPair, verticalRuns } from '../writingMode';
import { foldWidth, isZhuyin, kuntenGeometry, noteRowBaselines, readingAdvance, readingBaseline, rubyGeometry, splitNote, withFontSize, ZHUYIN_SIZE_RATIO, type RubyGeometry } from './cjkAnnotate';
import { boxesWidth, fullSizeKana, layoutJisRuby, layoutJukugo, type JisRubyAlign, type JisRubyAllow, type JisRubyBase, type JisRubyBox } from './rubyJis';
import {
  applyLineEdges,
  blankEnd,
  blankStart,
  boxCut,
  carryStopBlank,
  compositionFor,
  compressPair,
  getCjkComposition,
  isLatinSpacingHan,
  isLatinSpacingLatin,
  isJlreqSpacing,
  isPlainComposition,
  jlreqShrinkStep,
  latinSpacingPx,
  lineEdgeCut,
  mayHang,
  punctuationBox,
  punctuationShrink,
  routesSharedMarks,
  shrinkPunctuation,
  shrinkStep,
  type CjkComposition,
  type PunctuationBox,
} from './cjkPunctuation';

/** Fit tolerance of the breaker (px): running sums of many widths may
 *  land a hair past a measure they fill exactly. */
const FIT_EPS = 1e-6;

const FONT_SIZE_RE = /(\d*\.?\d+)px/;

/** Letters of the scripts set without spaces (Han, kana, bopomofo, hangul),
 *  as {@link isCjkParagraph} counts them. */
const CJK_LETTER_RE = /[\u3005-\u3007\u3040-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3100-\u312F\u31A0-\u31BF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF66-\uFF9F\u{20000}-\u{3FFFF}]/u;

/** Combining marks and variation selectors: they belong to the character
 *  before them. */
const MARK_RE = /\p{M}/u;

/**
 * Whether a paragraph is set by the CJK composer: it holds more CJK letters
 * than word spaces. A word space is a run of spaces between two characters
 * that are not CJK. A space that touches a CJK character or mark is the
 * one web text types at each boundary (`2026 年 9 月 28 日`, `安装 Node.js
 * 和 Git`), which the composer replaces with the Han–Latin space.
 * A Latin paragraph that quotes a Chinese title or name ("the novel 紅樓夢
 * was …") has more word spaces, stays with Knuth–Plass and breaks next to
 * the characters it quotes; a Chinese paragraph with Latin words in it
 * ("用 iPhone 拍照") is composed, with its typed spaces or without them.
 */
export function isCjkParagraph(text: string): boolean {
  let letters = 0;
  let spaces = 0;
  let inSpace = false;
  // Whether the character before the run of spaces is CJK.
  let spaceAfterCjk = false;
  let lastCjk = false;
  for (const ch of text) {
    if (isBreakingSpace(ch)) {
      if (!inSpace) spaceAfterCjk = lastCjk;
      inSpace = true;
      continue;
    }
    if (MARK_RE.test(ch)) continue;
    const cjk = hasCJK(ch);
    if (inSpace && !spaceAfterCjk && !cjk) spaces++;
    inSpace = false;
    lastCjk = cjk;
    if (CJK_LETTER_RE.test(ch)) letters++;
  }
  if (inSpace && !spaceAfterCjk) spaces++;
  return letters > spaces;
}

/** Whether the CJK composer sets a paragraph of this text: it holds CJK
 *  text (not only unit squares or marks Latin shares with Chinese) and more
 *  CJK letters than word spaces (see {@link isCjkParagraph}). Both
 *  measuring paths ask this, so they agree. */
export function composesAsCjk(text: string): boolean {
  return hasCJK(text) && isCjkParagraph(text);
}

/** The style a unit is painted in: every unit of a span shares it, and
 *  consecutive text units with the same `key` merge into one segment. */
interface UnitStyle {
  key: string;
  bold: boolean;
  italic: boolean;
  captionLabel?: boolean;
  script?: 'sup' | 'sub';
  scriptFont?: string;
  baselineShift?: number;
  smallCaps?: boolean;
  /** The font the unit is measured and painted with. */
  font: string;
  /** Chinese marks on the unit (`:dots`, `:name`, `:book`, #193): the
   *  segment carries them for the layout's marks pass. */
  marks?: VDTSegmentMarks;
  /** Characters the layout added (book-title and warichu brackets). */
  inserted?: boolean;
  /** Colour of the unit's text (a warichu note's brackets), hex. */
  color?: string;
  /** The language the unit's isolate names (`:ltr[…]{lang=en}`), carried
   *  to its segment (`VDTLineSegment.lang`) in Japanese text: see
   *  {@link spanLanguageHere}. */
  lang?: string;
}

/** What the composer breaks and spreads. */
interface Unit {
  kind: 'text' | 'space' | 'atomic';
  /** The text as painted (soft hyphens and zero-width spaces left out). */
  text: string;
  /** Advance in px, the block's tracking included. */
  width: number;
  /** Graphemes of `text`: the characters tracking spreads. */
  graphemes: number;
  first: CjkClass;
  last: CjkClass;
  /** Whether the first / last grapheme is a CJK character: a line may break
   *  next to it. */
  firstCjk: boolean;
  lastCjk: boolean;
  style: UnitStyle;
  /** Offset of the unit's first character in its span's text. */
  at: number;
  /** No break before this unit: a superscript, a subscript, a footnote
   *  marker or a `:ref` stays with the text it marks. */
  glueBefore?: boolean;
  /** A zero-width space before it: a break at any level. */
  zwspBefore?: boolean;
  /** An atomic unit's token (a chip, a formula, a swatch, a `:ref`, a
   *  footnote marker). */
  token?: RichToken;
  /** A run of Western text (a word, a number with its signs): no tracking
   *  inside, divided only when wider than a line. */
  run?: boolean;
  /** A web address: cut at its joints when it does not fit. */
  url?: boolean;
  /** One of a subscript and a superscript set over each other. */
  stacked?: 'first' | 'second';
  /** The Markdown link the unit is part of (its span and range), so a
   *  segment never holds linked and unlinked characters. */
  link?: string;
  /** A full-width mark whose blank the composition adjusts (see
   *  `cjkPunctuation.ts`): `width` is its advance less the blank it gave
   *  up. */
  punct?: PunctuationBox;
  /** A space between Han and Latin (`cjk.latinSpacing`): inserted (`text`
   *  empty) or replacing the space the author typed. */
  auto?: boolean;
  /** The one-em space after a ？ or ！ that ends a sentence inside the
   *  paragraph (`cjk.spaceAfterQuestion`, JLReq §3.1.6): inserted, or
   *  replacing the space the author typed there. It never stretches or
   *  shrinks, and goes at a line end as any space does. */
  aki?: boolean;
  /** A 、 or ・ set solid between kanji numerals (二、三日, 三・一四,
   *  JLReq §3.1.3): the line never breaks after it. */
  solid?: boolean;
  /** A mark Latin text shares with Chinese (“ ” ‘ ’ … — ·) set in a
   *  Chinese mark's box (see {@link routeSharedMarks}): where each of its
   *  graphemes' glyph starts in its one-em cell, px. Set only when a glyph
   *  is not one em wide, so its box and its advance differ. */
  place?: number[];
  /** Vertical text: the author set the unit apart (`:tcy[…]` one upright
   *  cell, `:upright[…]` one upright cell per character, `:sideways[…]`
   *  turned). Such a unit keeps a segment of its own. */
  orient?: 'tcy' | 'upright' | 'sideways';
  /** Vertical text: a Western run that opens (`cellStart`) or ends
   *  (`cellEnd`) with a short number set in one upright cell
   *  (`cjk.uprightDigits`). On that side it breaks and spreads like a
   *  Chinese character and takes no Han–Latin space. */
  cellStart?: boolean;
  cellEnd?: boolean;
  /** A ruby base (#194): the span's reading and, once sized
   *  ({@link sizeRubies}), its geometry; `width` is then the base's box.
   *  `base` is the base's own advance. A ruby set by the Japanese rules
   *  (#422, {@link isJisRuby}) also has its reading's characters as
   *  painted (`chars`) and the word it is laid out with (`jis`). */
  ruby?: {
    span: InlineRuby;
    position: 'over' | 'under' | 'right';
    geometry?: RubyGeometry;
    base?: number;
    chars?: { text: string; width: number }[];
    jis?: JisRubyWord;
  };
  /** A base of a Japanese ruby (#422): how much wider the line gets when
   *  it opens a line (`start`: the reading flush with the line's start,
   *  a jukugo word laid out again from there) or closes one (`end`). */
  rubyGrow?: { start: number; end: number };
  /** The character kanbun marks go with (#430): the marks and, once sized
   *  ({@link sizeKunten}), what they paint and the advance they add after
   *  the character (part of `width`). */
  kunten?: { mark: InlineKunten; extra?: number; vdt?: VDTKunten };
  /** A character of a warichu note (#195): `width` is its advance at the
   *  note size; a line folds the note's characters it holds into two rows
   *  ({@link foldNotes}). */
  note?: InlineWarichu;
  /** A word space inside a warichu note: a character of the note, after
   *  which a line may break (between the words of a Latin note). */
  noteSpace?: boolean;
  /** A line's part of a warichu note folded into its rows. */
  warichu?: VDTWarichu;
  /** A 破折号 (——) set in Chinese boxes (see {@link dashRule}): the
   *  horizontal scale each dash is painted at (`VDTLineSegment.inkScale`)
   *  and how far its glyphs move down (negative: up), px, to sit on the
   *  characters' centre. */
  scale?: number;
  shift?: number;
}

interface Fonts {
  normal: string;
  bold: string;
  italic: string;
  boldItalic: string;
}

/** The marks a span sets on its characters (#193, #421), the defaults
 *  of what the span leaves unset filled in (`cjk.emphasisMark` has filled
 *  the region's in already, `pipeline/annotations.ts`): emphasis dots a
 *  filled dot (an open circle), a side line solid; both under the text,
 *  or right of it in vertical text. */
export function spanMarks(span: InlineSpan, vertical: boolean): VDTSegmentMarks | undefined {
  if (!span.emphasisMark && span.properName === undefined && !span.bookTitle && !span.sideline) return undefined;
  const marks: VDTSegmentMarks = {};
  if (span.emphasisMark) {
    const style = span.emphasisMark.style ?? 'dot';
    marks.dots = {
      style,
      fill: span.emphasisMark.fill ?? (style === 'circle' ? 'open' : 'filled'),
      position: span.emphasisMark.position ?? (vertical ? 'over' : 'under'),
    };
  }
  if (span.properName !== undefined) marks.properName = span.properName;
  if (span.bookTitle) marks.bookTitle = span.bookTitle.id;
  if (span.sideline) {
    marks.sideline = {
      id: span.sideline.id,
      style: span.sideline.style ?? 'solid',
      position: span.sideline.position ?? (vertical ? 'over' : 'under'),
    };
  }
  return marks;
}

/** The part of a style key the marks and added characters make. */
function marksKey(marks: VDTSegmentMarks | undefined, inserted: boolean | undefined): string {
  if (!marks && !inserted) return '';
  const d = marks?.dots;
  const l = marks?.sideline;
  return `|m:${d ? `${d.style}${d.fill}${d.position}` : ''}:${marks?.properName ?? ''}:${marks?.bookTitle ?? ''}${l ? `:sl${l.id}${l.style}${l.position}` : ''}${inserted ? ':ins' : ''}`;
}

/**
 * The language a span's isolate names (the innermost that names one,
 * `:ltr[…]{lang=en}`), which its segments carry (`VDTLineSegment.lang`)
 * so the renderers declare it (a PDF `Span` with its `/Lang`) and shape it
 * in its own forms (#427): in a Japanese document (the `japan` region), or
 * for an isolate in Japanese. A segment then never holds text of two
 * languages. Other composed text carries none, as before.
 */
function spanLanguageHere(span: InlineSpan): string | undefined {
  let lang: string | undefined;
  for (let d = span.direction; d && lang === undefined; d = d.outer) lang = d.lang;
  if (lang === undefined) return undefined;
  return getMeasureRegion() === 'japan' || isJapaneseLanguage(lang) ? lang : undefined;
}

function styleOf(span: InlineSpan, fonts: Fonts, vertical = false): UnitStyle {
  const script = spanScriptFields(span, fonts.normal, fonts.bold, fonts.italic, fonts.boldItalic);
  const font = script.scriptFont ?? pickSpanFont(span.bold, span.italic, fonts.normal, fonts.bold, fonts.italic, fonts.boldItalic);
  const marks = spanMarks(span, vertical);
  const lang = spanLanguageHere(span);
  return {
    key: `${span.bold ? 'b' : ''}${span.italic ? 'i' : ''}${span.captionLabel ? 'c' : ''}${span.smallCaps ? 's' : ''}|${script.script ?? ''}|${font}|${script.baselineShift ?? ''}${marksKey(marks, span.inserted)}${lang !== undefined ? `|lang:${lang}` : ''}`,
    bold: span.bold,
    italic: span.italic,
    ...(span.captionLabel ? { captionLabel: true } : {}),
    ...script,
    ...(span.smallCaps ? { smallCaps: true } : {}),
    font,
    ...(marks ? { marks } : {}),
    ...(span.inserted ? { inserted: true } : {}),
    ...(lang !== undefined ? { lang } : {}),
  };
}

/** A grapheme set as a Chinese character here: a CJK grapheme, unless it
 *  is the apostrophe or the interpunct of a Latin word ("don’t", "l·l"). */
function isCjkHere(g: string, prev: string | undefined, next: string | undefined): boolean {
  return isCjkGrapheme(g) && !isWordInnerMark(g, prev, next);
}

/** Marks that pair up into one 2-em unit (破折号, 省略号). */
function pairable(g: string): boolean {
  return g === '\u2014' || g === '\u2015' || g === '\u2026' || g === '\u22EF'; // — ― … ⋯
}

/** Whether a vertical Western run opens and ends with a short number set
 *  in one upright cell (`cjk.uprightDigits`, see `verticalRuns`);
 *  undefined when neither. */
function numberCellEdges(run: readonly string[]): { start: boolean; end: boolean } | undefined {
  const digits = getMeasureUprightDigits();
  if (digits === 0 || !run.some((g) => g >= '0' && g <= '9' && g.length === 1)) return undefined;
  const runs = verticalRuns(run, getMeasureRegion(), digits);
  const start = runs[0]?.glyph.orient === 'tcy';
  const end = runs[runs.length - 1]?.glyph.orient === 'tcy';
  return start || end ? { start, end } : undefined;
}

/**
 * The units of a span the author set apart in vertical text (see
 * `Unit.orient`): `:tcy[…]` one upright cell of one em, `:upright[…]` one
 * cell per character (a line never breaks between them), `:sideways[…]`
 * one Western run at its horizontal width. The cells break and spread like
 * Chinese characters and take no Han–Latin space; the block's tracking
 * follows each cell once.
 */
function orientedUnits(span: InlineSpan, style: UnitStyle, letterSpacingPx: number, zwsp: boolean, units: Unit[]): void {
  const track = (n: number): number => (letterSpacingPx === 0 ? 0 : letterSpacingPx * n);
  const em = fontEm(style.font);
  const base = { style, at: 0, ...(zwsp ? { zwspBefore: true } : {}) };
  if (span.orientation === 'sideways' && !span.combineUpright) {
    const graphemes = graphemesOf(span.text);
    units.push({
      ...base,
      kind: 'text',
      text: span.text,
      width: measureTextWidth(span.text, style.font) + track(graphemes.length),
      graphemes: graphemes.length,
      first: 'western',
      last: 'western',
      firstCjk: false,
      lastCjk: false,
      run: true,
      orient: 'sideways',
    });
    return;
  }
  if (span.combineUpright) {
    units.push({
      ...base,
      kind: 'text',
      text: span.text,
      width: em + track(1),
      graphemes: 1,
      first: 'ideograph',
      last: 'ideograph',
      firstCjk: true,
      lastCjk: true,
      orient: 'tcy',
    });
    return;
  }
  let offset = 0;
  graphemesOf(span.text).forEach((g, i) => {
    units.push({
      ...base,
      ...(i > 0 ? { glueBefore: true, zwspBefore: undefined } : {}),
      kind: 'text',
      text: g,
      width: em + track(1),
      graphemes: 1,
      first: 'ideograph',
      last: 'ideograph',
      firstCjk: true,
      lastCjk: true,
      at: offset,
      orient: 'upright',
    });
    offset += g.length;
  });
}

/** The unit of a ruby base (#194): its characters as one box, measured as
 *  the composer measures them (cells down a vertical line), the reading
 *  laid out later (`sizeRubies`). Where the reading goes: `pos`, else
 *  zhuyin right of each character and anything else over; in vertical text
 *  `right` is the over side. */
function rubyBaseUnit(span: InlineSpan, fonts: Fonts, letterSpacingPx: number, vertical: boolean): Unit {
  const ruby = span.ruby!;
  const style = styleOf(span, fonts, vertical);
  const graphemes = graphemesOf(span.text);
  let width = 0;
  for (const g of graphemes) {
    width += isCjkGrapheme(g) ? cellAdvance(g, style.font, vertical, cjkClassOf(g)) : textWidth(g, style.font, style.smallCaps);
  }
  width += letterSpacingPx * graphemes.length;
  const firstG = graphemes[0] ?? '';
  const lastG = graphemes[graphemes.length - 1] ?? '';
  let position: 'over' | 'under' | 'right' = ruby.position ?? (isZhuyin(ruby.text) ? 'right' : 'over');
  if (vertical && position === 'right') position = 'over';
  const jis = isJisRuby(ruby, position);
  return {
    kind: 'text',
    text: span.text,
    width,
    graphemes: graphemes.length,
    first: cjkClassOf(firstG),
    last: cjkClassOf(lastG),
    firstCjk: isCjkGrapheme(firstG),
    lastCjk: isCjkGrapheme(lastG),
    style,
    at: 0,
    ruby: { span: ruby, position, ...(jis ? { base: width } : {}) },
  };
}

/** Whether a ruby is set by the Japanese rules (#422, `rubyJis.ts`): one
 *  over or under its base, not zhuyin, that has an alignment, an overhang
 *  rule, a jukugo word, a `mode=mono` or full-size kana (in Japan every
 *  reading has the first two). Others keep the clreq geometry. */
function isJisRuby(ruby: InlineRuby, position: 'over' | 'under' | 'right'): boolean {
  if (position === 'right' || isZhuyin(ruby.text)) return false;
  return !!(ruby.align || ruby.overhang || ruby.jukugo || ruby.mono || ruby.fullKana);
}

/** How a Japanese ruby is laid out (#422): as a jukugo word (several
 *  bases) or one base, what the neighbours outside let the reading pass
 *  onto, and the alignment. The units of one word share the object. */
interface JisRubyWord {
  jukugo: boolean;
  align: JisRubyAlign;
  rubyEm: number;
  allow: JisRubyAllow;
}

/** Hiragana, katakana (small kana, half-width forms and ー too): what a
 *  reading may pass onto under `cjk.ruby.overhang: 'kana'`. */
const KANA_RE = /^[\u3041-\u3096\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u31F0-\u31FF\uFF66-\uFF9F]/u;

/** How far a Japanese reading may pass its base (or its jukugo word)
 *  onto the unit `v` beside it (`before`: `v` precedes it), px (JLReq
 *  §3.3.8, see `CjkRubyOverhang`); 0 at the paragraph's edge. `prev` is
 *  the unit before `v`, whose reading may already run onto it. */
function rubyOverhangOnto(v: Unit | undefined, before: boolean, prev: Unit | undefined, mode: InlineRuby['overhang'], rubyEm: number): number {
  if (!v || mode === 'none') return 0;
  if (mode === undefined) {
    // clreq: a quarter of the ruby em onto a neighbour without a reading,
    // as the other rubies of the paragraph (`sizeRubies`).
    if (v.kind !== 'text' || v.note) return 0;
    if (!v.ruby) return rubyEm / 4;
    const theirs = v.ruby.geometry?.rtWidth ?? readingAdvance(v.ruby.span.text, v.ruby.span.fontString ?? v.style.font, v.ruby.position);
    return Math.max(0, Math.min(rubyEm / 4, (v.width - theirs) / 2 - rubyEm / 4));
  }
  if (v.kind === 'atomic' || v.note || v.warichu) return 0;
  // A space: its width; never the space between Japanese and Latin text,
  // whose other side is a Western letter.
  if (v.kind === 'space') return v.auto ? 0 : Math.min(mode === 'any' ? rubyEm / 2 : rubyEm, v.width);
  if (v.ruby) {
    // Another base: only its reading's free room, and none in kana mode.
    if (mode !== 'any') return 0;
    const theirs = v.ruby.chars ? v.ruby.chars.reduce((w, c) => w + c.width, 0) : readingAdvance(v.ruby.span.text, v.ruby.span.fontString ?? v.style.font, v.ruby.position);
    return Math.max(0, Math.min(rubyEm / 2, (v.width - theirs) / 2));
  }
  if (mode === 'any') return rubyEm / 2;
  // `kana`: two readings never share a kana from both sides; the later
  // one keeps to its base (JLReq §3.3.8 note).
  if (before && prev?.ruby?.geometry && prev.ruby.jis) {
    const g = prev.ruby.geometry;
    const reach = g.runs.reduce((hi, r) => Math.max(hi, r.dx + flowTextWidth(r.text, r.fontString)), -Infinity);
    if (reach > g.width + 1e-6) return 0;
  }
  const box = v.punct;
  const cls = before ? v.last : v.first;
  if (box) {
    // A mark: its blank on the reading's side, never its glyph; at most
    // half a ruby character onto an opening bracket. …… and ―― take a
    // ruby character.
    if (box.cls === 'opening') return rubyEm / 2;
    if (box.cls === 'dash' || box.cls === 'ellipsis') return rubyEm;
    return Math.min(rubyEm, before ? blankEnd(box) : blankStart(box));
  }
  if (cls === 'opening') return rubyEm / 2;
  if (cls === 'ideoSpace' || cls === 'dash' || cls === 'ellipsis') return rubyEm;
  // Kana, ー; never kanji, nor a Western run.
  return !v.run && v.graphemes === 1 && KANA_RE.test(v.text) ? rubyEm : 0;
}

/** The bases of a Japanese ruby's units (see {@link JisRubyBase}). */
function jisBases(us: readonly Unit[]): JisRubyBase[] {
  return us.map((u) => ({ width: u.ruby!.base!, graphemes: u.graphemes, reading: u.ruby!.chars! }));
}

/** Lay out the bases of one Japanese ruby word (or one base). */
function layoutJisWord(word: JisRubyWord, bases: readonly JisRubyBase[], allow: JisRubyAllow): JisRubyBox[] {
  return word.jukugo ? layoutJukugo(bases, word.align, word.rubyEm, allow) : [layoutJisRuby(bases[0]!, word.align, word.rubyEm, allow)];
}

/** `u` with the box `box` of its Japanese ruby: its geometry and width. */
function withJisBox(u: Unit, box: JisRubyBox, word: JisRubyWord): Unit {
  const ruby = u.ruby!;
  const font = ruby.span.fontString ?? withFontSize(u.style.font, emOfFont(u.style.font) / 2);
  const dy = readingBaseline(ruby.span.text, font, ruby.position === 'under' ? 'under' : 'over', emOfFont(u.style.font));
  const geometry: RubyGeometry = {
    width: box.width,
    inset: box.inset,
    rtWidth: ruby.chars!.reduce((w, c) => w + c.width, 0),
    runs: box.pieces.map((p) => ({ text: p.text, dx: p.dx, dy, fontString: font })),
    allowLeft: word.allow.start,
    allowRight: word.allow.end,
    ...(box.tracking > 0 ? { tracking: box.tracking } : {}),
  };
  return { ...u, width: box.width, ruby: { ...ruby, geometry } };
}

/**
 * Lay out the Japanese rubies of a paragraph (#422, `rubyJis.ts`): each
 * jukugo word, or each base, with what its neighbours let its reading pass
 * onto, in order (a reading that runs onto a kana keeps the next one off
 * it). Each base also learns how much wider it gets at a line edge
 * (`rubyGrow`), for the breaker. Units are replaced in place.
 */
function sizeJisRubies(units: Unit[]): void {
  const n = units.length;
  for (let k = 0; k < n; k++) {
    const u = units[k]!;
    if (!u.ruby || u.ruby.base === undefined || u.ruby.geometry) continue;
    const span = u.ruby.span;
    let e = k;
    if (span.jukugo) {
      while (e + 1 < n) {
        const v = units[e + 1]!.ruby;
        if (!v || v.base === undefined || !v.span.jukugo || v.span.id !== span.id || v.position !== u.ruby.position) break;
        e++;
      }
    }
    const font = span.fontString ?? withFontSize(u.style.font, emOfFont(u.style.font) / 2);
    const rubyEm = fontEm(font);
    for (let q = k; q <= e; q++) {
      const r = units[q]!.ruby!;
      const painted = r.span.fullKana ? fullSizeKana(r.span.text) : r.span.text;
      r.chars = graphemesOf(painted).map((g) => ({ text: g, width: flowTextWidth(g, font) }));
    }
    const word: JisRubyWord = {
      jukugo: e > k,
      align: span.align ?? 'center',
      rubyEm,
      allow: {
        start: rubyOverhangOnto(units[k - 1], true, units[k - 2], span.overhang, rubyEm),
        end: rubyOverhangOnto(units[e + 1], false, undefined, span.overhang, rubyEm),
      },
    };
    const members = units.slice(k, e + 1);
    const bases = jisBases(members);
    const boxes = layoutJisWord(word, bases, word.allow);
    for (let q = k; q <= e; q++) {
      units[q] = withJisBox(units[q]!, boxes[q - k]!, word);
      units[q]!.ruby!.jis = word;
    }
    // What the line gains when the word (or the base) opens it from that
    // unit on, or closes it with that unit: the reading flush with the
    // edge, the part of a word laid out alone.
    for (let i = 0; i < boxes.length; i++) {
      const head = boxesWidth(boxes.slice(0, i + 1));
      const tail = boxesWidth(boxes.slice(i));
      units[k + i]!.rubyGrow = {
        start: boxesWidth(layoutJisWord(word, bases.slice(i), { start: 0, end: word.allow.end })) - tail,
        end: boxesWidth(layoutJisWord(word, bases.slice(0, i + 1), { start: word.allow.start, end: 0 })) - head,
      };
    }
    k = e;
  }
}

/**
 * A line's Japanese rubies at its edges (#422, JLReq §3.3.8): a word or
 * base that opens or closes the line is laid out again with nothing to
 * pass onto on that side, so a longer reading is set flush with the edge
 * and its base moves in; a jukugo word the line breaks inside is laid
 * out again with the characters the line holds, each keeping its reading.
 * The breaker counted what this adds (`rubyGrow`). Units that change are
 * replaced by copies in `us`.
 */
function relayJisEdges(us: Unit[]): void {
  for (let j = 0; j < us.length; j++) {
    const word = us[j]!.ruby?.jis;
    if (!word) continue;
    let e = j;
    while (e + 1 < us.length && us[e + 1]!.ruby?.jis === word) e++;
    // A word with kanbun marks (#430) keeps its layout: the marks were set
    // against its readings (`sizeKunten`).
    if (us.slice(j, e + 1).some((u) => u.kunten?.vdt)) {
      j = e;
      continue;
    }
    const atStart = j === 0;
    const atEnd = e === us.length - 1;
    if (atStart || atEnd) {
      const allow = { start: atStart ? 0 : word.allow.start, end: atEnd ? 0 : word.allow.end };
      const boxes = layoutJisWord(word, jisBases(us.slice(j, e + 1)), allow);
      for (let q = j; q <= e; q++) us[q] = withJisBox(us[q]!, boxes[q - j]!, word);
    }
    j = e;
  }
}

/**
 * Lay out each ruby base's reading (see `cjkAnnotate.ts`): its box grows
 * to the reading less what the reading may pass it by — a quarter of the
 * ruby em onto a neighbour without ruby, and it keeps as much from a
 * neighbour's reading on the same side (two zhuyin readings: a quarter of
 * the symbols' em). Run once the units are final.
 */
function sizeRubies(units: Unit[]): void {
  // Japanese rubies first (#422): the others read their geometry.
  if (units.some((u) => u.ruby?.base !== undefined)) sizeJisRubies(units);
  for (let k = 0; k < units.length; k++) {
    const u = units[k]!;
    if (!u.ruby || u.ruby.geometry) continue;
    const fontOf = (v: Unit): string => v.ruby!.span.fontString ?? withFontSize(v.style.font, emOfFont(v.style.font) / 2);
    const font = fontOf(u);
    const q = fontEm(font) / 4;
    const zhuyin = isZhuyin(u.ruby.span.text);
    // How far the reading may pass its box towards a neighbour: a quarter
    // of the ruby em onto one without a reading; next to a reading on the
    // same side, what keeps the two a quarter em apart (the neighbour's
    // box is at least its base). Zhuyin is set at 60 % of the ruby size,
    // so two zhuyin readings keep a quarter of that em apart: three
    // symbols beside each of two characters stay in their cells (clreq
    // §5.5.3 centres each column on its own character).
    const allow = (v: Unit | undefined): number => {
      if (!v || v.kind !== 'text' || v.note) return 0;
      if (!v.ruby) return q;
      if (v.ruby.position !== u.ruby!.position || v.ruby.position === 'right') return q;
      const theirs = v.ruby.geometry?.rtWidth ?? readingAdvance(v.ruby.span.text, fontOf(v), v.ruby.position);
      const gap = zhuyin && isZhuyin(v.ruby.span.text) ? (fontEm(font) * ZHUYIN_SIZE_RATIO) / 4 : q;
      return Math.min(q, (v.width - theirs) / 2 - gap);
    };
    const geometry = rubyGeometry({
      reading: u.ruby.span.text,
      fontString: font,
      position: u.ruby.position,
      baseWidth: u.width,
      em: emOfFont(u.style.font),
      allowLeft: allow(units[k - 1]),
      allowRight: allow(units[k + 1]),
    });
    u.ruby.geometry = geometry;
    u.width = geometry.width;
  }
}

/** The units of a paragraph's spans, the characters of each warichu note
 *  (#195) measured at the note's size and flagged with it, between the
 *  note's brackets (added text at the body size, in the note's colour). */
function buildAllUnits(spans: readonly InlineSpan[], fonts: Fonts, letterSpacingPx: number, vertical: boolean, route: boolean): Unit[] {
  if (!spans.some((s) => s.warichu)) return buildUnits(spans, fonts, letterSpacingPx, vertical, route);
  const out: Unit[] = [];
  let i = 0;
  while (i < spans.length) {
    const note = spans[i]!.warichu;
    let j = i + 1;
    while (j < spans.length && spans[j]!.warichu === note) j++;
    const group = spans.slice(i, j);
    if (!note) out.push(...buildUnits(group, fonts, letterSpacingPx, vertical, route));
    else out.push(...noteUnits(group, note, fonts, vertical));
    i = j;
  }
  return out;
}

/** The units of one warichu note: its characters at the note's size (a
 *  word space inside it is a character of the note), its brackets. */
function noteUnits(spans: readonly InlineSpan[], note: InlineWarichu, fonts: Fonts, vertical: boolean): Unit[] {
  const size = note.fontString ? fontEm(note.fontString) : emOfFont(fonts.normal) / 2;
  const noteFonts: Fonts = {
    normal: withFontSize(fonts.normal, size),
    bold: withFontSize(fonts.bold, size),
    italic: withFontSize(fonts.italic, size),
    boldItalic: withFontSize(fonts.boldItalic, size),
  };
  const inner = buildUnits(spans, noteFonts, 0, vertical, false);
  for (const u of inner) {
    u.note = note;
    if (u.kind === 'space') {
      u.kind = 'text';
      u.firstCjk = u.lastCjk = false;
      u.noteSpace = true;
    }
  }
  const bracket = (text: string): Unit => {
    const g = graphemesOf(text);
    const cls = cjkClassOf(g[0] ?? '');
    const style: UnitStyle = {
      key: `ins|${note.color ?? ''}|${fonts.normal}`,
      bold: false,
      italic: false,
      font: fonts.normal,
      inserted: true,
      ...(note.color ? { color: note.color } : {}),
    };
    let width = 0;
    for (const c of g) width += cellAdvance(c, fonts.normal, vertical, cjkClassOf(c));
    return {
      kind: 'text',
      text,
      width,
      graphemes: g.length,
      first: cls,
      last: cjkClassOf(g[g.length - 1] ?? ''),
      firstCjk: isCjkGrapheme(g[0] ?? ''),
      lastCjk: isCjkGrapheme(g[g.length - 1] ?? ''),
      style,
      at: 0,
    };
  };
  return [...(note.open ? [bracket(note.open)] : []), ...inner, ...(note.close ? [bracket(note.close)] : [])];
}

/**
 * The units of a paragraph's spans, in order. `letterSpacingPx` (the
 * block's tracking) is measured into every width, per grapheme. In
 * `vertical` text a CJK character advances by its cell (`cellAdvance`).
 */
function buildUnits(spans: readonly InlineSpan[], fonts: Fonts, letterSpacingPx: number, vertical = false, route = false): Unit[] {
  const units: Unit[] = [];
  const track = (n: number): number => (letterSpacingPx === 0 ? 0 : letterSpacingPx * n);
  let zwsp = false;
  // A word joiner (U+2060) before the next unit: no break there, in one
  // span or across two (`**①**⁠文`). It takes no room and is left out.
  let wj = false;
  const glue = (): { glueBefore?: true } => {
    const g = wj;
    wj = false;
    return g ? { glueBefore: true } : {};
  };
  // Which units open a span and hold all of it (the candidates for stacked
  // scripts), by index.
  const wholeSpan = new Set<number>();
  // Where each span's units start, for the kanbun marks (#430).
  const spanStarts: number[] = [];

  for (let si = 0; si < spans.length; si++) {
    const span = spans[si]!;
    spanStarts.push(units.length);
    // A ruby base: one unit, sized with its reading once its neighbours
    // are known (`sizeRubies`).
    if (span.ruby && span.text.length > 0) {
      units.push({ ...rubyBaseUnit(span, fonts, letterSpacingPx, vertical), ...(zwsp ? { zwspBefore: true } : {}), ...glue() });
      zwsp = false;
      continue;
    }
    if (vertical && (span.combineUpright || span.orientation) && span.text.length > 0 && !setsObject(span)) {
      const first = units.length;
      orientedUnits(span, styleOf(span, fonts, vertical), letterSpacingPx, zwsp, units);
      if (units.length > first) Object.assign(units[first]!, glue());
      zwsp = false;
      continue;
    }
    const atomic = atomicSpanToken(span, fonts.normal, fonts.bold, fonts.italic, fonts.boldItalic, letterSpacingPx);
    if (atomic) {
      const style = styleOf(span, fonts, vertical);
      const graphemes = graphemesOf(atomic.text);
      const object = atomic.chip !== undefined || atomic.mathRender !== undefined || atomic.swatch !== undefined;
      const firstG = graphemes[0] ?? '';
      const lastG = graphemes[graphemes.length - 1] ?? '';
      units.push({
        kind: 'atomic',
        text: atomic.text,
        width: atomic.width,
        graphemes: graphemes.length,
        first: object ? 'ideograph' : cjkClassOf(firstG),
        last: object ? 'ideograph' : cjkClassOf(lastG),
        firstCjk: object || isCjkGrapheme(firstG),
        lastCjk: object || isCjkGrapheme(lastG),
        style,
        at: 0,
        token: atomic,
        ...(atomic.refResourceId !== undefined || atomic.footnoteId !== undefined ? { glueBefore: true } : {}),
        ...(zwsp ? { zwspBefore: true } : {}),
        ...glue(),
      });
      zwsp = false;
      continue;
    }
    if (span.text.length === 0) continue;
    const style = styleOf(span, fonts, vertical);
    const graphemes = graphemesOf(span.text);
    const spanFirst = units.length;
    let run: string[] = [];
    let runAt = 0;
    let runLink: string | undefined;
    let space = '';
    let spaceAt = 0;
    // A lone mark that may pair with the next one (—, …), by unit index.
    let pairOpen = -1;
    let at = 0;
    // The link a character at `offset` of the span is part of: its span and
    // range, so two links to one target stay apart.
    const links = span.links;
    const linkAt = (offset: number): string | undefined => {
      if (!links || links.length === 0) return undefined;
      for (let li = 0; li < links.length; li++) {
        const l = links[li]!;
        if (offset >= l.start && offset < l.end) return `${si}:${li}`;
      }
      return undefined;
    };
    const push = (u: Omit<Unit, 'style' | 'glueBefore' | 'zwspBefore'>): void => {
      units.push({
        ...u,
        style,
        ...(zwsp ? { zwspBefore: true } : {}),
        ...(style.script && units.length === spanFirst ? { glueBefore: true } : {}),
        ...glue(),
      });
      zwsp = false;
    };
    const flushRun = (): void => {
      if (run.length === 0) return;
      const text = run.join('');
      const firstG = run[0]!;
      const lastG = run[run.length - 1]!;
      // Vertical text: a short number at either end stands in one upright
      // cell (`cjk.uprightDigits`), and the run is Chinese on that side;
      // tracking follows the cell once.
      const cells = vertical ? numberCellEdges(run) : undefined;
      push({
        kind: 'text',
        text,
        width: textWidth(text, style.font, style.smallCaps) + track(vertical && letterSpacingPx !== 0 ? verticalTrackCount(text) : run.length),
        graphemes: run.length,
        first: cells?.start ? 'ideograph' : cjkClassOf(firstG),
        last: cells?.end ? 'ideograph' : cjkClassOf(lastG),
        firstCjk: cells?.start === true,
        lastCjk: cells?.end === true,
        at: runAt,
        run: true,
        ...(cells?.start ? { cellStart: true } : {}),
        ...(cells?.end ? { cellEnd: true } : {}),
        ...(URL_LIKE_RE.test(text) ? { url: true } : {}),
        ...(runLink !== undefined ? { link: runLink } : {}),
      });
      run = [];
      pairOpen = -1;
    };
    const flushSpace = (): void => {
      if (space === '') return;
      units.push({
        kind: 'space',
        text: space,
        width: measureTextWidth(space, style.font) + track(graphemeCount(space)),
        graphemes: graphemeCount(space),
        first: 'western',
        last: 'western',
        firstCjk: false,
        lastCjk: false,
        style,
        at: spaceAt,
      });
      space = '';
      pairOpen = -1;
    };
    for (let i = 0; i < graphemes.length; i++) {
      const g = graphemes[i]!;
      const gAt = at;
      at += g.length;
      if (isBreakingSpace(g[0])) {
        flushRun();
        wj = false;
        if (space === '') spaceAt = gAt;
        space += g;
        continue;
      }
      flushSpace();
      if (g === '\u200B') {
        flushRun();
        zwsp = true;
        pairOpen = -1;
        continue;
      }
      if (g === '\u2060') {
        flushRun();
        wj = true;
        pairOpen = -1;
        continue;
      }
      // A soft hyphen: the composer breaks Western words only when they are
      // wider than the line, so it is left out, and the word stays whole.
      if (g === '\u00AD') continue;
      const link = linkAt(gAt);
      if (!isCjkHere(g, graphemes[i - 1], graphemes[i + 1])) {
        // A link that starts or ends inside a run cuts it: the two parts
        // still never part (neither is CJK) and take no space between them.
        if (run.length > 0 && link !== runLink) flushRun();
        if (run.length === 0) {
          runAt = gAt;
          runLink = link;
        }
        run.push(g);
        continue;
      }
      flushRun();
      // —— and …… are one unit of two ems; a third mark opens another.
      if (pairOpen >= 0 && units[pairOpen]!.text === g && !zwsp && units[pairOpen]!.link === link) {
        const u = units[pairOpen]!;
        u.text += g;
        u.width += cellAdvance(g, style.font, vertical, u.first) + track(1);
        u.graphemes = 2;
        u.first = u.last = g === '\u2026' || g === '\u22EF' ? 'ellipsis' : 'dash';
        pairOpen = -1;
        continue;
      }
      let cls = cjkClassOf(g);
      // A single em dash (or horizontal bar) joins two words as a connector
      // (clreq §6.1.1): never at a line start.
      if (g === '\u2014' || g === '\u2015') cls = 'connector';
      push({
        kind: 'text',
        text: g,
        width: (style.smallCaps && !vertical ? textWidth(g, style.font, true) : cellAdvance(g, style.font, vertical, cls)) + track(1),
        graphemes: 1,
        first: cls,
        last: cls,
        firstCjk: true,
        lastCjk: true,
        at: gAt,
        ...(link !== undefined ? { link } : {}),
      });
      pairOpen = pairable(g) ? units.length - 1 : -1;
    }
    flushRun();
    flushSpace();
    if (units.length === spanFirst + 1 && units[spanFirst]!.kind === 'text') wholeSpan.add(spanFirst);
  }

  if (spans.some((s) => s.kunten)) attachKunten(spans, spanStarts, units);

  // A subscript and a superscript that touch are set one over the other
  // (EF-80): the first advances nothing, the second the pair's advance, and
  // the two never part.
  if (units.some((u) => u.style.script)) {
    const scripts = units.map((u, i) => (wholeSpan.has(i) && u.style.script && !u.style.smallCaps ? u.style.script : undefined));
    for (const i of stackedScriptPairs(scripts)) {
      const a = units[i]!;
      const b = units[i + 1]!;
      const sub = a.style.script === 'sub' ? a : b;
      sub.style = {
        ...sub.style,
        key: `${sub.style.key}|stacked`,
        baselineShift: scriptMetrics(pickSpanFont(sub.style.bold, sub.style.italic, fonts.normal, fonts.bold, fonts.italic, fonts.boldItalic), 'sub', true).baselineShift,
      };
      b.width = Math.max(a.width, b.width);
      a.width = 0;
      a.stacked = 'first';
      b.stacked = 'second';
      b.glueBefore = true;
    }
  }
  if (vertical && getMeasureRegion() === 'japan') combineMarkPairs(units, letterSpacingPx);
  if (route) routeSharedMarks(units, letterSpacingPx, vertical);
  return units;
}

/** Give each kanbun mark (#430) to the last unit its spans made (a space
 *  aside): the marks go with the base's last character. `starts[i]` is
 *  where span `i`'s units start. */
function attachKunten(spans: readonly InlineSpan[], starts: readonly number[], units: Unit[]): void {
  const last = new Map<InlineKunten, number>();
  spans.forEach((span, i) => {
    if (!span.kunten) return;
    const end = i + 1 < starts.length ? starts[i + 1]! : units.length;
    for (let k = end - 1; k >= starts[i]!; k--) {
      if (units[k]!.kind === 'space') continue;
      last.set(span.kunten, k);
      break;
    }
  });
  for (const [mark, k] of last) units[k]!.kunten = { mark };
}

/**
 * Lay out the kanbun marks of each unit that carries some (see
 * `kuntenGeometry`): their runs, and the advance they add after the
 * character, which joins the unit's width. Run once the units are final
 * and the ruby readings sized (a 送り仮名 follows a reading on its side).
 * A character inside a warichu note keeps no marks.
 */
function sizeKunten(units: Unit[], letterSpacingPx: number): void {
  for (const u of units) {
    if (!u.kunten || u.kunten.vdt || u.note || u.kind !== 'text') continue;
    const mark = u.kunten.mark;
    if (!mark.kaeri && !mark.okuri && !mark.tate) continue;
    const em = emOfFont(u.style.font);
    const g = u.ruby?.geometry;
    // Where the character ends: the base inside a ruby box (a Japanese
    // one, #422, spread by `tracking` after each character but its last),
    // else the unit less the tracking after its last character.
    const baseEnd = !g ? u.width - letterSpacingPx
      : u.ruby!.base !== undefined ? g.inset + u.ruby!.base + (g.tracking ?? 0) * (u.graphemes - 1)
        : u.ruby!.position === 'right' ? u.width - g.rtWidth : u.width - g.inset;
    let readingEnd: number | undefined;
    if (g && u.ruby!.position !== 'right') {
      for (const r of g.runs) readingEnd = Math.max(readingEnd ?? -Infinity, r.dx + flowTextWidth(r.text, r.fontString));
    }
    const over = u.ruby && u.ruby.position !== 'under';
    const { extra, kunten } = kuntenGeometry({
      ...(mark.kaeri ? { kaeri: mark.kaeri } : {}),
      ...(mark.okuri ? { okuri: mark.okuri } : {}),
      ...(mark.tate ? { tate: true } : {}),
      fontString: mark.fontString ?? withFontSize(u.style.font, em / 2),
      ...(mark.color ? { color: mark.color } : {}),
      placement: mark.placement ?? 'inline',
      em,
      baseEnd,
      width: u.width,
      ...(readingEnd !== undefined && over ? { readingOverEnd: readingEnd } : {}),
      ...(readingEnd !== undefined && !over ? { readingUnderEnd: readingEnd } : {}),
    });
    u.kunten = { mark, extra, vdt: kunten };
    u.width += extra;
    // Its Japanese ruby word is not laid out again at a line edge
    // (`relayJisEdges`), so it widens no line there.
    const word = u.ruby?.jis;
    if (word) for (const v of units) if (v.ruby?.jis === word) delete v.rubyGrow;
  }
}

/** A unit's characters (a mark pair's possible neighbour). */
function isPlainTextUnit(u: Unit | undefined): u is Unit {
  return u !== undefined && u.kind === 'text' && !u.token && !u.orient && !u.ruby && !u.kunten && !u.note && !u.stacked && !u.place;
}

/**
 * Japanese vertical text: each pair of exclamation and question marks
 * (!! !? ?! ?? and ！！ ！？ ？！ ？？, JLReq §3.1.10) becomes one upright cell
 * of one em, as an author's `:tcy[…]` (`Unit.orient`), which breaks like a
 * single ！ and keeps a segment of its own (`VDTLineSegment.tcy`). The rule
 * is `isUprightMarkPair`, read over what a segment would hold: a Western
 * run that is the pair alone (`Wow!!` and `(!?)` stay one sideways run),
 * or two full-width marks of one style and link, a mark beside them of the
 * same style and link leaving all three as they are. The painters then
 * read the segment as the measurer did.
 */
function combineMarkPairs(units: Unit[], letterSpacingPx: number): void {
  const fullwidth = (g: string): string => String.fromCodePoint(g.codePointAt(0)! + 0xFEE0);
  const pairUnit = (u: Unit, text: string, cls: CjkClass): Unit => {
    const out: Unit = {
      ...u,
      text,
      width: fontEm(u.style.font) + (letterSpacingPx === 0 ? 0 : letterSpacingPx),
      graphemes: 1,
      first: cls,
      last: cls,
      firstCjk: true,
      lastCjk: true,
      orient: 'tcy',
    };
    delete out.run;
    delete out.cellStart;
    delete out.cellEnd;
    delete out.url;
    return out;
  };
  const sameSegment = (a: Unit, b: Unit | undefined): b is Unit => isPlainTextUnit(b) && !b.run && b.style.key === a.style.key && b.link === a.link;
  for (let k = 0; k < units.length; k++) {
    const u = units[k]!;
    if (!isPlainTextUnit(u)) continue;
    if (u.run) {
      // A Western run that is the pair alone: its own segment.
      if (u.graphemes === 2 && /^[!?]{2}$/.test(u.text) && isUprightMarkPair([...u.text], 0, 'japan')) {
        units[k] = pairUnit(u, u.text, cjkClassOf(fullwidth(u.text[0]!)));
      }
      continue;
    }
    const v = units[k + 1];
    if (u.graphemes !== 1 || !sameSegment(u, v) || v.graphemes !== 1) continue;
    const prev = units[k - 1];
    const next = units[k + 2];
    const context = [
      ...(sameSegment(u, prev) ? [lastGrapheme(prev.text)] : []),
      u.text,
      v.text,
      ...(sameSegment(u, next) ? [graphemesOf(next.text)[0]!] : []),
    ];
    if (!isUprightMarkPair(context, sameSegment(u, prev) ? 1 : 0, 'japan')) continue;
    units.splice(k, 2, pairUnit(u, u.text + v.text, cjkClassOf(u.text)));
  }
}

/** The marks Latin text shares with Chinese (East Asian Width ambiguous):
 *  quotes, the ellipsis, the em dash and horizontal bar, interpuncts. */
const SHARED_MARKS = new Set(['\u201C', '\u201D', '\u2018', '\u2019', '\u2026', '\u22EF', '\u2014', '\u2015', '\u00B7', '\u2027']);

/** Whether a unit is one shared mark, or a pair of them (—— ……). */
function isSharedMarkUnit(u: Unit): boolean {
  if (u.kind !== 'text' || u.run || u.stacked || u.style.script || u.style.smallCaps) return false;
  if (u.graphemes === 1) return SHARED_MARKS.has(u.text);
  return u.graphemes === 2 && SHARED_MARKS.has(u.text[0]!) && u.text[0] === u.text[1];
}

/** The script a unit sets for the shared marks next to it: Chinese (a CJK
 *  character or mark), Western (a Latin run or a word space), or none for
 *  one that is transparent to them (another shared mark, an inline box). */
function unitScript(v: Unit): 'cjk' | 'western' | undefined {
  if (v.kind === 'space') return 'western';
  if (v.kind === 'atomic' || isSharedMarkUnit(v)) return undefined;
  return !v.run && v.firstCjk ? 'cjk' : 'western';
}

/**
 * The marks Latin text shares with Chinese (“ ” ‘ ’ … — ·, East Asian
 * Width ambiguous) take the box of a Chinese mark when they stand in
 * Chinese text (clreq §3.1; research note on context routing): a text on
 * either side is Chinese, or none is Western. A font whose glyphs for them
 * are proportional (LXGW WenKai sets “ ” at 0.35 em, Noto Serif SC the em
 * dash at 0.89 em and · at a third) would otherwise crowd them against the
 * characters they belong to. Each grapheme advances one em (with the
 * block's tracking) whatever its font's advance, and its glyph sits where
 * a Chinese font puts it: an opening quote at the end of its box, a
 * closing one at its start, an interpunct, an ellipsis and a single dash
 * centred; an ellipsis pair (……) is set as the font sets the two
 * together and centred in its two ems, so its six dots keep one spacing,
 * and a 破折号 (——) is stretched into one rule over its two ems
 * (`dashRule`). The composition then adjusts the box as
 * it does any mark's (`cjk.punctuationWidth`). A glyph one em wide already changes
 * nothing. Next to Western text on both sides (`He said “yes”`) they keep
 * their own advance, and so do they in Japanese and Korean text (the
 * composer calls this for Chinese text only, `routesSharedMarks`).
 *
 * Down a vertical line (`vertical`) every mark stands in a cell of its own
 * already; only the 破折号 is set here: the font's vertical form of a dash
 * leaves blank at both ends of its cell (Noto CJK's, 0.07 em), so the pair
 * would print as two strokes. Its dashes are stretched into one rule as in
 * horizontal text, and the renderers paint them turned with the page's
 * frame (sideways), the stretch running down the column
 * (`VDTLineSegment.inkScale`).
 */
function routeSharedMarks(units: Unit[], letterSpacingPx: number, vertical = false): void {
  if (!units.some(isSharedMarkUnit)) return;
  // The script of the nearest unit on each side that is not transparent
  // (`unitScript`), past runs of shared marks and inline boxes: two
  // linear passes, so a long run of marks costs no more than its length.
  const n = units.length;
  const before: ('cjk' | 'western' | undefined)[] = new Array(n);
  const after: ('cjk' | 'western' | undefined)[] = new Array(n);
  let seen: 'cjk' | 'western' | undefined;
  for (let k = 0; k < n; k++) {
    before[k] = seen;
    seen = unitScript(units[k]!) ?? seen;
  }
  seen = undefined;
  for (let k = n - 1; k >= 0; k--) {
    after[k] = seen;
    seen = unitScript(units[k]!) ?? seen;
  }
  for (let k = 0; k < n; k++) {
    const u = units[k]!;
    if (!isSharedMarkUnit(u)) continue;
    const dash = u.graphemes === 2 && (u.text[0] === '\u2014' || u.text[0] === '\u2015');
    // Vertical text: a 破折号 only, and not one whose orientation the
    // author set (`:upright[…]`, `:sideways[…]`).
    if (vertical && (!dash || u.orient)) continue;
    const b = before[k];
    const a = after[k];
    if (b !== 'cjk' && a !== 'cjk' && (b !== undefined || a !== undefined)) continue;
    const em = emOfFont(u.style.font);
    const font = u.style.font;
    let place: number[];
    const rule = dash ? dashRule(u.text[0]!, font, em, em + letterSpacingPx, vertical) : undefined;
    if (rule) {
      place = rule.place;
      if (rule.scale !== undefined) u.scale = rule.scale;
      if (rule.shift !== undefined) u.shift = rule.shift;
      if (vertical) {
        // The cells keep their length down the line.
        u.place = place;
        continue;
      }
    } else if (vertical) {
      // No ink metrics: each dash in its vertical form, as it was.
      continue;
    } else if (u.graphemes === 2) {
      // ……, or —— when the measurer gives no ink metrics: the pair as the
      // font sets it (a face may kern the dashes into one line), centred
      // in its two ems.
      const g = u.text[0]!;
      const adv = measureTextWidth(g, font);
      const pair = measureTextWidth(u.text, font);
      if (Math.abs(adv - em) < 1e-6 && Math.abs(pair - 2 * em) < 1e-6) continue;
      const start = em - pair / 2;
      place = [start, start + pair - adv - em];
    } else {
      const adv = measureTextWidth(u.text, font);
      if (Math.abs(adv - em) < 1e-6) continue;
      const slack = em - adv;
      const cls = cjkClassOf(u.text);
      place = [cls === 'opening' ? slack : cls === 'closing' ? 0 : slack / 2];
    }
    u.width = u.graphemes * (em + letterSpacingPx);
    u.place = place;
  }
}

/** How far past the join each dash of a 破折号 runs, em: the two strokes
 *  overlap, so no seam shows between them at any resolution. */
const DASH_JOIN_EM = 0.02;

/**
 * A 破折号 (——) in Chinese text is one unbroken rule two ems long, on the
 * characters' centre line (GB/T 15834). Faces whose em dash is a
 * proportional Latin stroke (Noto Serif SC: 0.89 em advance, ink from 0.04
 * to 0.85 em, at the height of a Latin dash) print the pair as a short
 * rule with blank on both sides, and low. Each dash is stretched over its
 * cell (`cell`, px: an em and the block's tracking): the rule starts and
 * ends the face's own side bearing inside the pair's two cells (at most a
 * tenth of an em) and each stroke runs `DASH_JOIN_EM` past the join. Its
 * glyphs move to the centre of the ideographic em box
 * (`measureCentralBaseline`). Undefined when the measurer gives no ink
 * metrics, or when the dash already fills its em (a face whose two dashes
 * join by themselves). Down a vertical line (`vertical`) the scale is set
 * even when it is 1: it tells the renderers to paint the dash turned.
 */
function dashRule(g: string, font: string, em: number, cell: number, vertical = false): { place: number[]; scale?: number; shift?: number } | undefined {
  const ink = measureInkExtent(g, font);
  // No ink metrics, or a dash already drawn edge to edge across its em.
  if (!ink || (ink.start <= 0.01 * em && ink.end >= cell - 0.01 * em)) return undefined;
  const side = Math.min(Math.max(ink.start, 0), 0.1 * em);
  const join = DASH_JOIN_EM * em;
  const scale = (cell - side + join) / (ink.end - ink.start);
  const place = [side - ink.start * scale, -join - ink.start * scale];
  const box = measureInkBox(g, font);
  const shift = box ? (box.ascent - box.descent) / 2 - measureCentralBaseline(fontFamilyOf(font)) * em : 0;
  return {
    place,
    ...(vertical || Math.abs(scale - 1) > 1e-3 ? { scale } : {}),
    ...(Math.abs(shift) > 0.01 * em ? { shift } : {}),
  };
}

/** The em (px) of a font shorthand: its size. */
function emOfFont(font: string): number {
  const m = FONT_SIZE_RE.exec(font);
  return m ? parseFloat(m[1]!) : 16;
}

/** Whether a unit is a single CJK mark (a bracket, a pause, stop or
 *  interpunct mark, a dash or an ellipsis): two of them in a row never
 *  hang. */
function isMarkUnit(u: Unit | undefined): boolean {
  if (!u || u.kind !== 'text' || u.run || !u.firstCjk) return false;
  switch (u.first) {
    case 'opening': case 'closing': case 'pause': case 'stop': case 'interpunct': case 'dash': case 'ellipsis':
      return true;
    default:
      return false;
  }
}

/** Kanji numerals a 、 or ・ is set solid between (二、三日 "two or three
 *  days", 三・一四 "3.14", JLReq §3.1.3). */
const KANJI_DIGITS = new Set('〇一二三四五六七八九十');

/** ？ and ！ (and their doubles) as Japanese sets them: full-width marks
 *  with a full-width space after them inside a paragraph. */
const QUESTION_MARKS = new Set(['？', '！', '‼', '⁇', '⁈', '⁉']);

/** A single character unit (not a run, a ruby base, a note…) whose text is
 *  in `set`. */
function charUnitIn(u: Unit | undefined, set: ReadonlySet<string>): boolean {
  return !!u && u.kind === 'text' && !u.run && u.graphemes === 1 && !u.ruby && !u.kunten && !u.note && !u.orient && !u.style.script && set.has(u.text);
}

/**
 * The punctuation widths and Han–Latin spaces of a paragraph's units, as
 * the composition sets them (see `cjkPunctuation.ts`): each full-width mark
 * takes the width its style gives it (`Unit.punct`), two marks that meet
 * give up the blank between them (`compressAdjacent`), and a space unit
 * (`Unit.auto`) goes between each Han character and a Latin letter or digit
 * it touches — the space the author typed there turns into one. The line
 * edges (and the reduction a line makes to take one more character) are
 * the breaker's and the line's business. A plain composition changes
 * nothing but the mainland interpunct, half an em under every style
 * (`punctuationBox`), as its cell is in vertical text. In Japan, a 、 or
 * ・ between kanji numerals is set solid (`Unit.solid`), and with
 * `spaceAfterQuestion` a ？ or ！ takes its one-em space (`Unit.aki`).
 */
function prepareUnits(units: Unit[], c: CjkComposition, letterSpacingPx: number): Unit[] {
  const plain = isPlainComposition(c);
  // Down the line the mainland interpunct's cell is half an em already.
  if (plain && (c.region !== 'mainland' || c.vertical)) return units;
  const full = new Map<Unit, number>();
  for (const u of units) {
    if (u.kind !== 'text' || u.run || u.graphemes !== 1 || !u.firstCjk || u.style.script || u.stacked || u.orient || u.ruby || u.kunten || u.note) continue;
    if (plain && u.first !== 'interpunct') continue;
    const box = punctuationBox(u.text, u.first, u.width - letterSpacingPx, emOfFont(u.style.font), c);
    if (!box) continue;
    full.set(u, u.width);
    u.punct = box;
    u.width -= boxCut(box);
  }
  if (plain) return units;
  if (c.region === 'japan') {
    // 二、三日, 三・一四: the mark between two kanji numerals is its glyph
    // alone (JLReq §3.1.3), and the number is not broken there.
    for (let k = 1; k + 1 < units.length; k++) {
      const u = units[k]!;
      if (!u.punct || (u.text !== '、' && u.text !== '・')) continue;
      if (!charUnitIn(units[k - 1], KANJI_DIGITS) || !charUnitIn(units[k + 1], KANJI_DIGITS) || units[k + 1]!.glueBefore) continue;
      shrinkPunctuation(u.punct, u.punct.blank);
      u.width = full.get(u)! - boxCut(u.punct);
      u.solid = true;
    }
  }
  // Kaiming sets a stop's blank after the closing mark that follows it (。”␣).
  const carry = c.punctuationWidth === 'kaiming';
  const jlreq = isJlreqSpacing(c);
  if ((c.compressAdjacent || carry) && full.size > 1) {
    for (let k = 1; k < units.length; k++) {
      const a = units[k - 1]!;
      const b = units[k]!;
      if (!a.punct || !b.punct || b.zwspBefore || a.solid || b.solid) continue;
      if (c.compressAdjacent) compressPair(a.punct, b.punct, jlreq);
      if (carry) carryStopBlank(a.punct, b.punct);
      a.width = full.get(a)! - boxCut(a.punct);
      b.width = full.get(b)! - boxCut(b.punct);
    }
  }
  const spaced = (c.latinSpacing.px ?? c.latinSpacing.em ?? 0) > 0 ? latinSpaces(units, c) : units;
  return c.spaceAfterQuestion ? questionSpaces(spaced) : spaced;
}

/** The character a chip's words open (`first`) or close (`last`) with, in
 *  their logical order; undefined for a unit that is not a chip, or a chip
 *  in a superscript or a subscript. */
function chipEdgeGrapheme(u: Unit, edge: 'first' | 'last'): string | undefined {
  const runs = u.kind === 'atomic' && !u.style.script ? u.token?.chip?.runs : undefined;
  if (!runs) return undefined;
  const text = runs.map((r) => r.text).join('');
  if (text === '') return undefined;
  return edge === 'first' ? String.fromCodePoint(text.codePointAt(0)!) : lastGrapheme(text);
}

/** `units` with the Han–Latin spaces of `cjk.latinSpacing` (see
 *  {@link prepareUnits}).
 *
 *  A chip (`:chip[…]`) is a box of text: on each side it takes the space
 *  its own words would (#462). `:chip[unicodedata]` between kana is Latin
 *  on both sides and gets the quarter em JLReq §3.2.2 puts between
 *  Japanese and Western text, as `unicodedata` set plain would;
 *  `:chip[漢字]` is Han on both sides, so a Latin word touching it gets
 *  the space and a kana does not. Its line-break class stays that of an
 *  inline box. The rest follows from the rule for plain text: the space
 *  goes at a line end and is dropped at a line start like any space, and
 *  a bracket, a mark or a sign next to the chip is neither Han nor Latin,
 *  so 「:chip[x]」 takes none. Down a vertical line the chip is set
 *  sideways, as a Latin run is, and the same rule holds. */
function latinSpaces(units: Unit[], c: CjkComposition): Unit[] {
  const out: Unit[] = [];
  const han = (u: Unit | undefined, edge: 'first' | 'last'): boolean => {
    if (!u) return false;
    const chipEdge = chipEdgeGrapheme(u, edge);
    if (chipEdge !== undefined) return isLatinSpacingHan(chipEdge);
    return u.kind === 'text' && !u.run && !u.note && u.firstCjk && u[edge] === 'ideograph' && !u.style.script && isLatinSpacingHan(u.text);
  };
  // A run whose edge is a number set in one upright cell (vertical text)
  // takes no Han–Latin space on that side; neither does a unit the author
  // set upright or in one cell. A chip's edge is Latin when its character
  // is a letter or a digit that is not CJK (a full-width Ａ is not).
  const latin = (u: Unit | undefined, edge: 'first' | 'last'): boolean => {
    if (!u) return false;
    const chipEdge = chipEdgeGrapheme(u, edge);
    if (chipEdge !== undefined) return !isCjkGrapheme(chipEdge) && !isLatinSpacingHan(chipEdge) && isLatinSpacingLatin(chipEdge);
    return u.kind === 'text' && !!u.run && !u.note && !u.style.script && !(edge === 'first' ? u.cellStart : u.cellEnd)
      && isLatinSpacingLatin(edge === 'first' ? String.fromCodePoint(u.text.codePointAt(0)!) : lastGrapheme(u.text));
  };
  const spaceOf = (h: Unit): number => latinSpacingPx(c, emOfFont(h.style.font));
  for (let k = 0; k < units.length; k++) {
    const u = units[k]!;
    const prev = out[out.length - 1];
    if (u.kind === 'space' && /^ +$/.test(u.text)) {
      // A space typed between Han and Latin is replaced by the Han–Latin
      // space (CSS `text-autospace: replace`).
      const next = units[k + 1];
      const h = han(prev, 'last') && latin(next, 'first') && !next!.glueBefore ? prev
        : latin(prev, 'last') && han(next, 'first') && !next!.glueBefore ? next : undefined;
      if (h) {
        out.push({ ...u, width: spaceOf(h), auto: true });
        continue;
      }
    } else if (prev && !u.glueBefore && ((han(prev, 'last') && latin(u, 'first')) || (latin(prev, 'last') && han(u, 'first')))) {
      const h = han(prev, 'last') ? prev : u;
      out.push({
        kind: 'space',
        text: '',
        width: spaceOf(h),
        graphemes: 0,
        first: 'western',
        last: 'western',
        firstCjk: false,
        lastCjk: false,
        style: h.style,
        at: u.at,
        auto: true,
      });
    }
    out.push(u);
  }
  return out;
}

/**
 * `units` with the one-em space JLReq §3.1.6 sets after a ？ or ！ that
 * ends a sentence inside the paragraph (`cjk.spaceAfterQuestion`,
 * `Unit.aki`): after the mark and what keeps to it (a note marker), unless
 * the paragraph ends there or a closing bracket or another ？！ follows. A
 * space the author typed there (U+3000, or a run of word spaces) becomes
 * the aki, keeping its text. A line may break after it, and it goes at the
 * line end, as any space does.
 */
function questionSpaces(units: Unit[]): Unit[] {
  const out: Unit[] = [];
  for (let k = 0; k < units.length; k++) {
    const u = units[k]!;
    out.push(u);
    if (!charUnitIn(u, QUESTION_MARKS)) continue;
    // A note marker or a superscript keeps to the mark: the space follows it.
    while (k + 1 < units.length && units[k + 1]!.glueBefore) out.push(units[++k]!);
    const next = units[k + 1];
    if (!next || charUnitIn(next, QUESTION_MARKS)) continue;
    if (next.kind === 'text' && next.first === 'closing') continue;
    const aki: Unit = {
      kind: 'space',
      text: '',
      width: emOfFont(u.style.font),
      graphemes: 0,
      first: 'western',
      last: 'western',
      firstCjk: false,
      lastCjk: false,
      style: u.style,
      at: u.at + u.text.length,
      aki: true,
    };
    if (next.kind === 'space' && !next.auto) {
      // A typed space is replaced: the aki keeps its text.
      if (units[k + 2] === undefined) continue;
      out.push({ ...aki, text: next.text, at: next.at });
      k++;
    } else if (next.kind === 'text' && next.first === 'ideoSpace' && next.graphemes === 1) {
      if (units[k + 2] === undefined) continue;
      out.push({ ...aki, text: next.text, at: next.at });
      k++;
    } else {
      out.push(aki);
    }
  }
  return out;
}

const isDigitCode = (c: number): boolean => (c >= 0x30 && c <= 0x39) || isFullwidthDigit(c);

/** Whether a number keeps to the sign or unit next to it (`50 %`, `50％`,
 *  `￥５９９`, `−3 ℃`): a unit ending in a digit before a unit sign, or a
 *  currency or plus-minus sign before a digit. At every level. */
function numberGlue(a: Unit, b: Unit): boolean {
  if (a.kind !== 'text' || b.kind !== 'text') return false;
  if (b.first === 'postfix' && isDigitCode(a.text.charCodeAt(a.text.length - 1))) return true;
  return a.last === 'prefix' && isDigitCode(b.text.charCodeAt(0));
}

/** A fullwidth character unit (one grapheme, not a Western run) whose code
 *  point passes `test`. */
function fullwidthUnit(u: Unit | undefined, test: (cp: number) => boolean): boolean {
  return u !== undefined && u.kind === 'text' && !u.run && u.graphemes === 1 && test(u.text.charCodeAt(0));
}

/** Marks that join fullwidth digits into one number: a decimal point, a
 *  thousands separator, the colon of a time, the solidus of a fraction
 *  (３．１４, １２：３０, １／２). */
const isFullwidthNumberJoin = (cp: number): boolean => cp === 0xFF0E || cp === 0xFF0C || cp === 0xFF1A || cp === 0xFF0F;

/** Whether units `k - 1` and `k` belong to one fullwidth number or word
 *  (１２３, ＡＢＣ, ３．１４): each character is a unit of its own, spread
 *  like Han when the line is justified, but the line never breaks inside. */
function fullwidthGlue(units: readonly Unit[], k: number): boolean {
  const a = units[k - 1];
  const b = units[k];
  if (fullwidthUnit(a, isFullwidthAlnum) && fullwidthUnit(b, isFullwidthAlnum)) return true;
  if (fullwidthUnit(a, isFullwidthDigit) && fullwidthUnit(b, isFullwidthNumberJoin) && fullwidthUnit(units[k + 1], isFullwidthDigit)) return true;
  return fullwidthUnit(a, isFullwidthNumberJoin) && fullwidthUnit(b, isFullwidthDigit) && fullwidthUnit(units[k - 2], isFullwidthDigit);
}

/** The grapheme a unit opens (`first`) or ends (`last`) with, which a
 *  Japanese level reads the unit's class from (small kana, ー, hyphens…:
 *  `breakClassOf`); undefined under a Chinese level, and for an inline box
 *  (a chip, a formula, a marker), whose class stands as it is. */
function edgeGrapheme(u: Unit, edge: 'first' | 'last', level: CjkLineBreakLevel): string | undefined {
  if (u.kind !== 'text' || u.text === '' || !isJapaneseLineBreak(level)) return undefined;
  return edge === 'first' ? String.fromCodePoint(u.text.codePointAt(0)!) : lastGrapheme(u.text);
}

/** Whether unit `b` may not open a line at `level` (see
 *  {@link edgeGrapheme}). */
function startProhibited(b: Unit, level: CjkLineBreakLevel): boolean {
  return isLineStartProhibited(b.first, level, edgeGrapheme(b, 'first', level));
}

/** Whether unit `a` may not close a line at `level`. */
function endProhibited(a: Unit, level: CjkLineBreakLevel): boolean {
  return isLineEndProhibited(a.last, level, edgeGrapheme(a, 'last', level));
}

/** Whether a line may break before each unit (index 0 is never a break).
 *  A word space is a break unless the unit after it may not open a line,
 *  the last one before it may not close one, or they are a number and its
 *  sign; a zero-width space is a break at every level. A kanji number
 *  never breaks at the 、 or ・ set solid inside it (`Unit.solid`). */
function breakOpportunities(units: readonly Unit[], level: CjkLineBreakLevel): Uint8Array {
  const out = new Uint8Array(units.length);
  // The last unit before `k` that is not a space.
  let ink = -1;
  for (let k = 1; k < units.length; k++) {
    const a = units[k - 1]!;
    const b = units[k]!;
    if (a.kind !== 'space') ink = k - 1;
    if (b.kind === 'space') continue;
    // A line never opens with a warichu note's word space.
    if (b.noteSpace) continue;
    if (b.zwspBefore) {
      out[k] = 1;
      continue;
    }
    if (a.kind === 'space') {
      const p = ink >= 0 ? units[ink]! : undefined;
      if (!p || (!numberGlue(p, b) && !startProhibited(b, level) && !endProhibited(p, level))) out[k] = 1;
      continue;
    }
    if (a.noteSpace) {
      // A word space inside a warichu note: the note's words part there.
      let q = k - 1;
      while (q > 0 && units[q]!.noteSpace) q--;
      const p = units[q]!;
      if (!p.noteSpace && !numberGlue(p, b) && !startProhibited(b, level) && !endProhibited(p, level)) out[k] = 1;
      continue;
    }
    if (b.glueBefore || a.solid || b.solid) continue;
    if (numberGlue(a, b) || fullwidthGlue(units, k)) continue;
    if (cjkBreakAllowed(a.last, a.lastCjk, b.first, b.firstCjk, level, edgeGrapheme(a, 'last', level), edgeGrapheme(b, 'first', level))) out[k] = 1;
  }
  return out;
}

/** Whether a unit opens (`first`) or ends (`last`) with a letter, which
 *  `keep-all` never parts from a letter next to it: a CJK character (kanji,
 *  kana, hangul, an iteration mark, ー), a Western run or a sign glued to
 *  a number, an inline box. Punctuation, dashes, ellipses, connectors and
 *  the ideographic space are not letters: lines still break next to them
 *  where the level allows (after 、。」, before 「). */
function isLetterEdge(u: Unit, edge: 'first' | 'last'): boolean {
  if (u.kind === 'space') return false;
  const cls = edge === 'first' ? u.first : u.last;
  return cls === 'ideograph' || cls === 'iteration' || cls === 'western' || cls === 'prefix' || cls === 'postfix';
}

/** The breaks of `cjk.wordBreak: 'keep-all'` (CSS `word-break: keep-all`)
 *  out of the paragraph's `breaks`: those after a space the author typed,
 *  a warichu note's word space or before a zero-width space stay, and so
 *  do those next to punctuation; none is left between two letters
 *  ({@link isLetterEdge}), so a phrase of kana written between spaces
 *  (分かち書き) is never divided while it fits a line. The Han–Latin space
 *  the composition inserts (`Unit.auto`, no text) is no space between
 *  phrases: `Tシャツ` stays whole. */
function keepAllBreaks(units: readonly Unit[], breaks: Uint8Array): Uint8Array {
  const out = breaks.slice();
  for (let k = 1; k < units.length; k++) {
    if (!out[k]) continue;
    let a = units[k - 1]!;
    const b = units[k]!;
    if (a.noteSpace || b.zwspBefore) continue;
    if (a.kind === 'space') {
      if (!(a.auto && a.text === '') || k < 2) continue;
      a = units[k - 2]!;
    }
    if (isLetterEdge(a, 'last') && isLetterEdge(b, 'first')) out[k] = 0;
  }
  return out;
}

/** Whether justification may add space between two units that touch on a
 *  line: between characters, never inside a Western run or a 2-em mark
 *  (those are single units), never between two Western runs, next to a
 *  connector or a solidus, after an atomic box, or before a mark that
 *  keeps to the text before it. Spaces take their own share. With `jlreq`
 *  (Japanese full-width text) also JLReq §3.1.11's inseparable places:
 *  never after an opening bracket or before a closing one (but before the
 *  one and after the other), never next to 、，。．・：；？！ or U+3000. */
function gapStretches(a: Unit, b: Unit, jlreq = false): boolean {
  if (a.kind !== 'text' || b.kind === 'space') return false;
  // Never inside a jukugo word (JLReq §3.3.7).
  if (a.ruby?.jis && a.ruby.jis === b.ruby?.jis) return false;
  if (b.glueBefore || a.stacked) return false;
  if (a.last === 'connector' || a.last === 'solidus' || b.first === 'connector' || b.first === 'solidus') return false;
  if (!a.lastCjk && !b.firstCjk) return false;
  if (a.last === b.first && (a.last === 'dash' || a.last === 'ellipsis')) return false;
  if (jlreq && (a.last === 'opening' || b.first === 'closing' || jlreqFixed(a.last) || jlreqFixed(b.first))) return false;
  return true;
}

/** The classes JLReq never spreads next to (§3.1.11): pause and stop
 *  marks, middle dots and the ideographic space. */
function jlreqFixed(cls: CjkClass): boolean {
  return cls === 'pause' || cls === 'stop' || cls === 'interpunct' || cls === 'ideoSpace';
}

/** Whether the gap after unit `j` of a line takes tracking. A footnote
 *  marker in the line gap (`footnotes.markerPosition: 'side'`) takes no
 *  room in the line: the gap between the characters around it is theirs,
 *  and is set after the marker, which stays against the character it
 *  marks. */
function gapAfterStretches(us: readonly Unit[], j: number, jlreq = false): boolean {
  const next = us[j + 1]!;
  if (isSideMarker(next)) return false;
  const u = us[j]!;
  if (isSideMarker(u)) return j > 0 && gapStretches(us[j - 1]!, next, jlreq);
  return gapStretches(u, next, jlreq);
}

function isSideMarker(u: Unit): boolean {
  return u.token?.sideRuns !== undefined;
}

/** One line as the breaker found it: units `start` to `end` (exclusive),
 *  the first replaced by `first` (the rest of a unit the line before cut)
 *  and `head` appended (the part of unit `end` that fits). */
interface LineRange {
  start: number;
  end: number;
  first?: Unit;
  head?: Unit;
  hyphenated: boolean;
  hardHyphen?: boolean;
  /** The line's last unit hangs past its end (`cjk.hangingPunctuation`). */
  hang?: boolean;
}

/**
 * What the breaker asks of a composition (see `cjkPunctuation.ts`): the
 * blank a mark gives up at a line start (`lead`) or end (`tail`) — less
 * the blank it gave to a mark across the break, which comes back, so
 * either may be negative —, and what a unit gives when its line is
 * compressed to take one more character (`give`, at the line's start or
 * end or inside it): a mark down to half an em as its style allows, a word
 * space down to a quarter em, a Han–Latin space down to an eighth. `edge`
 * sets a mark as it stands at a line edge (its `punct` must be the line's
 * own copy) and returns what it gave up.
 */
interface LineFit {
  lead(u: Unit): number;
  tail(u: Unit): number;
  give(u: Unit, atStart: boolean, atEnd: boolean): number;
  edge(u: Unit, start: boolean, end: boolean): number;
  /** Whether unit `k` may hang when it ends a line: a pause or stop mark
   *  the composition lets hang, with no other mark before or after it. */
  hangs(units: readonly Unit[], k: number, unitAt: (k: number) => Unit): boolean;
  hanging: 'none' | 'allow' | 'force';
  /** JLReq spacing (`isJlreqSpacing`): the line gives up blank in JLReq's
   *  order, the half em at its end all or nothing, and is never spread at
   *  JLReq's inseparable places. */
  jlreq: boolean;
}

function lineFitOf(c: CjkComposition): LineFit | undefined {
  if (isPlainComposition(c)) return undefined;
  const jlreq = isJlreqSpacing(c);
  return {
    lead: (u) => (u.punct ? lineEdgeCut(u.punct, c, true, false) : 0),
    tail: (u) => (u.punct ? lineEdgeCut(u.punct, c, false, true) : 0),
    give(u, atStart, atEnd) {
      if (u.kind === 'space') {
        if (u.aki) return 0;
        const em = emOfFont(u.style.font);
        return Math.max(0, u.width - (u.auto ? em / 8 : em / 4));
      }
      if (!u.punct) return 0;
      if (!atStart && !atEnd) return punctuationShrink(u.punct, c);
      const box = { ...u.punct };
      applyLineEdges(box, c, atStart, atEnd);
      // JLReq: a mark ending the line gives up the blank after its glyph
      // (and, a middle dot, nothing before it: §3.8.3 steps 2–3).
      return punctuationShrink(box, c, jlreq && atEnd);
    },
    edge: (u, start, end) => (u.punct ? applyLineEdges(u.punct, c, start, end) : 0),
    hangs(units, k, unitAt) {
      const u = unitAt(k);
      if (u.kind !== 'text' || u.run || u.graphemes !== 1 || u.note || u.ruby || u.kunten || !mayHang(u.text, u.first, c)) return false;
      if (k > 0 && isMarkUnit(unitAt(k - 1))) return false;
      return k + 1 >= units.length || !isMarkUnit(units[k + 1]);
    },
    hanging: c.hangingPunctuation,
    jlreq,
  };
}

/** The last unit that must share a line with unit `k` when `k` ends one:
 *  the units after it up to the next break (a closing quote after a
 *  full stop). -1 when that is more than a few units away or crosses a
 *  space the line may not break after. */
function groupEnd(units: readonly Unit[], breaks: Uint8Array, k: number): number {
  const n = units.length;
  for (let q = k; q < k + 6; q++) {
    if (q + 1 >= n) return q;
    if (units[q + 1]!.kind === 'space') {
      let r = q + 1;
      while (r < n && units[r]!.kind === 'space') r++;
      return r >= n || breaks[r] ? q : -1;
    }
    if (breaks[q + 1]) return q;
  }
  return -1;
}

/** The advance of the first `idx` UTF-16 units of a Western run, the
 *  block's tracking included. */
function prefixWidth(u: Unit, idx: number, letterSpacingPx: number): number {
  const head = u.text.slice(0, idx);
  return textWidth(head, u.style.font, u.style.smallCaps) + (letterSpacingPx === 0 ? 0 : letterSpacingPx * graphemeCount(head));
}

/** Characters of a run kept past the first that does not fit when it is
 *  cut: enough for the dictionary and the joints of a web address to read
 *  the text around every cut that fits as they read the whole run. */
const CUT_CONTEXT = 32;

/** The shortest prefix of a Western run (in UTF-16 units) wider than
 *  `room`, or its length when all of it fits: found by doubling, then
 *  halving, so a run many lines long costs what one line of it does. */
function overflowAt(u: Unit, room: number, letterSpacingPx: number): number {
  const len = u.text.length;
  let fit = 0;
  let over = len;
  for (let step = 1; fit + step < len; step *= 2) {
    if (prefixWidth(u, fit + step, letterSpacingPx) > room + FIT_EPS) {
      over = fit + step;
      break;
    }
    fit += step;
  }
  if (over === len && u.width <= room + FIT_EPS) return len;
  while (over - fit > 1) {
    const mid = (fit + over) >> 1;
    if (prefixWidth(u, mid, letterSpacingPx) > room + FIT_EPS) over = mid;
    else fit = mid;
  }
  return over;
}

/** The rest of a run after its first `from` UTF-16 units (`cutWidth` px). */
function runTail(u: Unit, from: number, cutWidth: number): Unit {
  const tail = u.text.slice(from);
  return {
    ...u,
    text: tail,
    width: u.width - cutWidth,
    graphemes: u.graphemes - graphemeCount(u.text.slice(0, from)),
    first: cjkClassOf(tail),
    at: u.at + from,
    glueBefore: false,
    zwspBefore: false,
  };
}

/** Cut a web address at its last joint (after a slash, before a dot…)
 *  whose head fits `room`: nothing is added at the break. Only the joints
 *  before the first character that does not fit are tried. */
function cutAtJoint(u: Unit, room: number, letterSpacingPx: number): { head: Unit; tail: Unit } | null {
  const over = overflowAt(u, room, letterSpacingPx);
  const joints = urlBreakIndices(u.text.slice(0, Math.min(u.text.length, over + CUT_CONTEXT)));
  for (let j = joints.length - 1; j >= 0; j--) {
    const idx = joints[j]!;
    if (idx >= over) continue;
    const head = u.text.slice(0, idx);
    const w = prefixWidth(u, idx, letterSpacingPx);
    if (w > room + FIT_EPS) continue;
    return {
      head: { ...u, text: head, width: w, graphemes: graphemeCount(head), last: cjkClassOf(lastGrapheme(head)), url: false },
      tail: runTail(u, idx, w),
    };
  }
  return null;
}

/** Divide a Western run wider than the whole line (see `emergencySplit`):
 *  at a dictionary syllable with a hyphen, else at the last character that
 *  fits. Only the run up to a little past the first character that does not
 *  fit is handed to the divider, so each line of a long run costs what the
 *  line holds. */
function divideRun(u: Unit, room: number, letterSpacingPx: number): { head: Unit; tail: Unit; hyphen: boolean; hard: boolean } | null {
  const end = Math.min(u.text.length, overflowAt(u, room, letterSpacingPx) + CUT_CONTEXT);
  const text = end === u.text.length ? u.text : u.text.slice(0, end);
  const width = end === u.text.length ? u.width : prefixWidth(u, end, letterSpacingPx);
  const token: RichToken = {
    text,
    bold: u.style.bold,
    italic: u.style.italic,
    kind: 'text',
    width,
    ...(u.style.smallCaps ? { smallCaps: true } : {}),
  };
  const split = emergencySplit(token, u.style.font, letterSpacingPx, room);
  if (!split) return null;
  const headText = split.head.text;
  const hyphen = headText.length > 0 && headText.endsWith('-') && !u.text.startsWith(headText);
  // Where the rest starts (past a no-break space the divider parted at)
  // and the advance of what comes before it.
  const from = text.length - split.tail.text.length;
  return {
    head: { ...u, text: headText, width: split.head.width, graphemes: graphemeCount(headText), last: cjkClassOf(lastGrapheme(headText)), url: false },
    tail: runTail(u, from, width - split.tail.width),
    hyphen,
    hard: split.hard === true,
  };
}

/**
 * Break the units into lines, first fit with push-out: a line takes units
 * while they fit its measure less `reserve`; the unit that does not fit
 * opens the next line when a break before it is allowed, else (when the
 * composition cannot push it in or hang it) the line ends
 * at the last allowed break (the characters after it go down with the
 * unit). A space never overflows: the line ends before it, when the line
 * may break after it. A unit wider
 * than the whole line is divided when it is a Western run (a web address
 * at a joint first), else set on a line of its own. `pull` names a line
 * that takes in the rest of the paragraph when the line can give up the
 * blank for it (push-in, to save a last line of one character).
 */
function breakUnits(
  units: readonly Unit[],
  breaks: Uint8Array,
  measureOf: (line: number) => number,
  reserve: number,
  letterSpacingPx: number,
  fit?: LineFit,
  level: CjkLineBreakLevel = getCjkLineBreak(),
  /** End line `line` before unit `at` (a break), whatever else fits. */
  stop?: { line: number; at: number },
  /** Line `pull` takes every unit left when it can give up the blank. */
  pull?: number,
  /** Under `keep-all` (`breaks` holds only the breaks between phrases): the
   *  breaks the level allows between any two characters, where a phrase
   *  longer than the line is broken. */
  emergency?: Uint8Array,
): LineRange[] {
  const out: LineRange[] = [];
  const n = units.length;
  let i = 0;
  let carried: Unit | undefined;
  let carriedAt = -1;
  const unitAt = (k: number): Unit => (k === carriedAt && carried ? carried : units[k]!);
  // A warichu note's characters on the line take the advance of their two
  // rows (`foldWidth`), not their sum: where the note's part on this line
  // starts, and the line's width before it.
  let noteFrom = -1;
  let noteBase = 0;
  const foldOf = (from: number, to: number): number => {
    const widths: number[] = [];
    const startNo: boolean[] = [];
    const endNo: boolean[] = [];
    for (let q = from; q <= to; q++) {
      const uq = unitAt(q);
      widths.push(uq.width);
      startNo.push(noteRowStartProhibited(uq, level));
      endNo.push(endProhibited(uq, level));
    }
    return foldWidth(widths, splitNote(widths, startNo, endNo));
  };
  // A Japanese ruby base at a line edge widens the line (`rubyGrow`): at
  // its start, and at its end when the line may end after it.
  const endGrow = (k: number): number => {
    const g = unitAt(k).rubyGrow;
    if (!g || g.end <= 0) return 0;
    return k + 1 >= n || breaks[k + 1] || units[k + 1]!.kind === 'space' ? g.end : 0;
  };
  for (let li = 0; ; li++) {
    while (i < n && unitAt(i).kind === 'space') i++;
    if (i >= n) break;
    const max = measureOf(li) - reserve;
    let w = Math.max(0, unitAt(i).rubyGrow?.start ?? 0);
    let lastBreak = -1;
    let end = -1;
    let head: Unit | undefined;
    let tail: Unit | undefined;
    let hyphenated = false;
    let hardHyphen = false;
    let hang = false;
    // What the line could give up to take one more character (push-in).
    let give = 0;
    for (let k = i; k < n; k++) {
      if (stop && stop.line === li && k >= stop.at) {
        end = k;
        break;
      }
      const u = unitAt(k);
      if (k > i && breaks[k]) lastBreak = k;
      if (u.note) {
        if (k === i || unitAt(k - 1).note !== u.note) {
          noteFrom = k;
          noteBase = w;
        }
        const folded = noteBase + foldOf(noteFrom, k);
        if (folded <= max + FIT_EPS) {
          w = folded;
          continue;
        }
        // The part no longer folds into the line: the line ends here or at
        // the last break before, never taking the character at its own
        // advance (the fold of a part is not monotonic, so every part the
        // line may end with was one that folded).
      }
      const lead = fit && k === i ? fit.lead(u) : 0;
      if (!u.note && w + u.width - lead - (fit ? fit.tail(u) : 0) + endGrow(k) <= max + FIT_EPS) {
        w += u.width - lead;
        if (fit) give += fit.give(u, k === i, false);
        continue;
      }
      if (fit && k > i && u.kind !== 'space' && !u.note) {
        // A pause or stop mark that does not fit hangs past the measure:
        // at once under 'force', after compressing the line failed under
        // 'allow'. Else, when the unit may not open the next line (no
        // break before it), the line gives up blank to take it and what
        // must stay with it (push-in, clreq §6.2.2.3), before it would
        // push characters down. A unit that may open a line goes down and
        // the line is spread: compressing marks to take one more
        // character there would narrow Kaiming's stop marks inside the
        // line.
        const canHang = fit.hanging !== 'none' && groupEnd(units, breaks, k) === k && fit.hangs(units, k, unitAt);
        if (canHang && fit.hanging === 'force') {
          end = k + 1;
          hang = true;
          break;
        }
        const m = pull === li ? n - 1 : breaks[k] ? -1 : groupEnd(units, breaks, k);
        if (m >= k) {
          let width = w;
          let room = give;
          for (let q = k; q <= m; q++) {
            const uq = unitAt(q);
            const t = q === m ? fit.tail(uq) - endGrow(q) : 0;
            width += uq.width - t;
            room += fit.give(uq, false, q === m);
          }
          if (width - room <= max + FIT_EPS) {
            end = m + 1;
            break;
          }
        }
        if (canHang) {
          end = k + 1;
          hang = true;
          break;
        }
      }
      if (u.kind === 'space') {
        // The line ends before the space when it may break after it; else
        // it gives up characters to the next line, as for any other unit.
        let m = k + 1;
        while (m < n && units[m]!.kind === 'space') m++;
        if (m >= n || breaks[m]) {
          end = k;
          break;
        }
      }
      if (u.url) {
        const cut = cutAtJoint(u, max - w, letterSpacingPx);
        if (cut) {
          end = k;
          head = cut.head;
          tail = cut.tail;
          hyphenated = true;
          hardHyphen = false;
          break;
        }
      }
      if (k > i && breaks[k]) {
        end = k;
        break;
      }
      if (lastBreak > i) {
        end = lastBreak;
        break;
      }
      if (k === i) {
        if (u.run) {
          const split = divideRun(u, max, letterSpacingPx);
          if (split) {
            end = k;
            head = split.head;
            tail = split.tail;
            hyphenated = true;
            hardHyphen = split.hard;
            break;
          }
        }
        end = k + 1;
        break;
      }
      if (emergency) {
        // A phrase longer than the line (keep-all): it is broken inside,
        // at the last place the level allows.
        let q = k;
        while (q > i && !emergency[q]) q--;
        if (q > i) {
          end = q;
          break;
        }
      }
      // Nothing on the line may end it: break before the unit anyway.
      end = k;
      break;
    }
    if (end < 0) end = n;
    out.push({
      start: i,
      end,
      ...(carriedAt === i && carried ? { first: carried } : {}),
      ...(head ? { head } : {}),
      hyphenated,
      ...(hardHyphen ? { hardHyphen: true } : {}),
      ...(hang ? { hang: true } : {}),
    });
    if (tail) {
      carried = tail;
      carriedAt = end;
    } else if (carriedAt < end) {
      carried = undefined;
      carriedAt = -1;
    }
    i = end;
  }
  return out;
}

/** A segment being built: its texts, joined once it is done. */
interface Piece {
  seg: PendingSegment;
  parts: string[];
  /** Consecutive text units of this style, link and tracking may join it. */
  key: string | undefined;
  /** The advance of each character of a piece others may join: only
   *  characters that advance alike share a segment, so the Sandbox's caret
   *  can spread a segment's width evenly over its characters. */
  cell?: number;
}

interface ComposeContext {
  fonts: Fonts;
  textAlign: string;
  letterSpacingPx: number;
  em: number;
  cap: number;
  normalSpace: number;
  lineHeightPx: number;
  /** How far below its top a line has its baseline (`lineBaselineOffset`). */
  baselineOffset: number;
  indentOf: (line: number) => number;
  measureOf: (line: number) => number;
  /** Vertical text: a Western run keeps the gap after it in its width. */
  vertical?: boolean;
  /** The composition's line edges, push-in and hanging; undefined for a
   *  plain one. */
  fit?: LineFit;
  /** The line-break level (the rows of a warichu note split under it). */
  level: CjkLineBreakLevel;
}

/** Whether a note's unit may not open its lower row: a mark that may not
 *  start a line (the small kana and the rest of the Japanese classes under
 *  a Japanese level), or a word space (it ends the upper row instead). */
function noteRowStartProhibited(u: Unit, level: CjkLineBreakLevel): boolean {
  return u.noteSpace === true || startProhibited(u, level);
}

/** Replace each run of a warichu note's characters on a line by the part
 *  folded into its two rows (see `cjkAnnotate.ts`). `us` is changed in
 *  place. */
function foldNotes(us: Unit[], level: CjkLineBreakLevel, em: number): void {
  const out: Unit[] = [];
  for (let j = 0; j < us.length;) {
    const u = us[j]!;
    if (!u.note) {
      out.push(u);
      j++;
      continue;
    }
    let e = j + 1;
    while (e < us.length && us[e]!.note === u.note) e++;
    out.push(noteFragment(us.slice(j, e), level, em));
    j = e;
  }
  us.splice(0, us.length, ...out);
}

/** A line's part of a warichu note: its characters split into an upper and
 *  a lower row, each painted in runs of one font; the part's advance is the
 *  wider row's. */
function noteFragment(part: readonly Unit[], level: CjkLineBreakLevel, em: number): Unit {
  const note = part[0]!.note!;
  const widths = part.map((u) => u.width);
  const at = splitNote(widths, part.map((u) => noteRowStartProhibited(u, level)), part.map((u) => endProhibited(u, level)));
  const noteFont = note.fontString ?? part[0]!.style.font;
  const rows = noteRowBaselines(em, fontEm(noteFont));
  const runs: VDTAnnotationRun[] = [];
  const row = (units: readonly Unit[], dy: number): { text: string; width: number } => {
    let dx = 0;
    let text = '';
    let run: VDTAnnotationRun | undefined;
    for (const u of units) {
      if (run && run.fontString === u.style.font) run.text += u.text;
      else {
        run = { text: u.text, dx, dy, fontString: u.style.font };
        runs.push(run);
      }
      dx += u.width;
      text += u.text;
    }
    return { text, width: dx };
  };
  const upper = row(part.slice(0, at), rows.upper);
  const lower = row(part.slice(at), rows.lower);
  const first = part[0]!;
  const last = part[part.length - 1]!;
  let graphemes = 0;
  for (const u of part) graphemes += u.graphemes;
  return {
    kind: 'text',
    text: upper.text + lower.text,
    width: Math.max(upper.width, lower.width),
    graphemes,
    first: first.first,
    last: last.last,
    firstCjk: first.firstCjk,
    lastCjk: last.lastCjk,
    style: first.style,
    at: first.at,
    warichu: {
      upper: upper.text,
      lower: lower.text,
      fontString: noteFont,
      upperDy: rows.upper,
      lowerDy: rows.lower,
      ...(note.color ? { color: note.color } : {}),
      runs,
    },
  };
}

/**
 * A ruby base that opens or closes a line (clreq §5.5.4): base and reading
 * align to that edge. The base gives up its inset on that side, and the
 * box keeps only what the reading needs past its other side (less what it
 * may pass the box by there), never more than it was, so the line the
 * breaker set never grows. A base alone on its line stays centred.
 * Units that change are replaced by copies in `us`.
 */
function alignEdgeRubies(us: Unit[]): void {
  if (us.length < 2) return;
  const align = (j: number, start: boolean): void => {
    const u = us[j]!;
    const g = u.ruby?.geometry;
    // A base with kanbun marks keeps its reading where the marks were set
    // against it (#430).
    if (!g || u.ruby!.position === 'right' || u.ruby!.jis || g.runs.length === 0 || u.kunten) return;
    const base = u.width - 2 * g.inset;
    const rt = g.rtWidth;
    const wide = rt > base;
    // How far the reading reaches from the edge: its advance, or to the
    // far side of the base it is centred on.
    const reach = wide ? rt : (base + rt) / 2;
    const width = Math.min(u.width, Math.max(base, reach - (start ? g.allowRight : g.allowLeft)));
    const inset = start ? 0 : width - base;
    const readingAt = wide ? (start ? 0 : width - rt) : inset + (base - rt) / 2;
    const shift = readingAt - g.runs[0]!.dx;
    if (Math.abs(width - u.width) < 1e-9 && Math.abs(inset - g.inset) < 1e-9 && Math.abs(shift) < 1e-9) return;
    us[j] = {
      ...u,
      width,
      ruby: { ...u.ruby!, geometry: { ...g, width, inset, runs: g.runs.map((r) => ({ ...r, dx: r.dx + shift })) } },
    };
  };
  align(0, true);
  align(us.length - 1, false);
}

/** Keep the readings of a line's ruby bases inside the line: a reading
 *  that would pass the line's start or end is moved back to it (clreq
 *  §5.5.4: at a line edge base and ruby align to the edge). */
function clampReadings(segments: readonly VDTLineSegment[]): void {
  if (!segments.some((s) => s.ruby)) return;
  let lineWidth = 0;
  for (const s of segments) if (!s.hangs) lineWidth += s.width;
  let x = 0;
  for (const s of segments) {
    const ruby = s.ruby;
    // A Japanese reading (`id`) was set inside the line already (#422).
    if (ruby && ruby.position !== 'right' && ruby.id === undefined && ruby.runs.length > 0) {
      const lo = ruby.runs[0]!.dx;
      const hi = lo + ruby.rtWidth;
      let shift = 0;
      if (x + lo < 0) shift = -(x + lo);
      else if (x + hi > lineWidth + 1e-6) shift = lineWidth - (x + hi);
      if (shift !== 0) ruby.runs = ruby.runs.map((r) => ({ ...r, dx: r.dx + shift }));
    }
    x += s.width;
  }
}

/** Share `amount` among `caps` equally, none past its cap: what each
 *  takes. */
function spread(amount: number, caps: readonly number[]): number[] {
  const takes = caps.map(() => 0);
  const order = caps.map((_, i) => i).sort((a, b) => caps[a]! - caps[b]!);
  let rest = amount;
  for (let o = 0; o < order.length && rest > 1e-12; o++) {
    const i = order[o]!;
    const take = Math.min(caps[i]!, rest / (order.length - o));
    takes[i] = take;
    rest -= take;
  }
  return takes;
}

/**
 * A line's units as its edges and its measure set them (see
 * `cjkPunctuation.ts`): the first mark gives up its lead and the last its
 * tail, each taking back the blank it gave to a mark on the other side of
 * the break (the two no longer meet); a mark that hangs is taken out and
 * returned apart; and a line wider than its measure (it took one more
 * character that may not open a line, clreq §6.2.2.3) gives up
 * blank in clreq's order — word spaces to a quarter em, interpuncts,
 * brackets, pause marks, Han–Latin spaces to an eighth of an em, stop marks
 * last — each step shared equally, until it fits. Japanese full-width text
 * takes JLReq §3.8.3's order instead (`jlreqShrinkStep`): word spaces, the
 * half em after the line's last mark and then a middle dot's quarter (each
 * all or nothing: what it gives beyond the need is spread back when the
 * line is justified), the middle dots' quarters inside the line, the half
 * ems of brackets and 、， inside it, Han–Latin spaces; never the half em
 * after a 。 inside the line. A mark that hangs keeps its glyph alone. `us`
 * holds the line's units and is changed in place; a unit that changes is
 * replaced by a copy, since the paragraph's units serve every attempt at
 * breaking it.
 */
function fitLine(us: Unit[], units: readonly Unit[], range: LineRange, lastK: number, isLast: boolean, measure: number, fit: LineFit): Unit | undefined {
  const copy = (j: number): Unit => {
    const u = us[j]!;
    const c: Unit = { ...u, ...(u.punct ? { punct: { ...u.punct } } : {}) };
    us[j] = c;
    return c;
  };
  let hang: Unit | undefined;
  if (us.length > 1) {
    const unitAt = (k: number): Unit => (k === range.start && range.first ? range.first : units[k]!);
    const forced = fit.hanging === 'force' && !isLast && !range.head && fit.hangs(units, lastK, unitAt);
    if (range.hang || forced) {
      hang = copy(us.length - 1);
      us.pop();
      hang.width -= fit.edge(hang, false, true);
      // ぶら下げ: the hung mark is its glyph, past the measure.
      if (fit.jlreq && hang.punct) hang.width -= shrinkPunctuation(hang.punct, hang.punct.blank, true);
      while (us.length > 0 && us[us.length - 1]!.kind === 'space') us.pop();
    }
  }
  if (us.length === 0) return hang;
  // The marks at the edges: what they gave to a mark across the break
  // comes back, then the edge trims.
  if (fit.lead(us[0]!) !== 0) {
    const c = copy(0);
    c.width -= fit.edge(c, true, false);
  }
  if (fit.tail(us[us.length - 1]!) !== 0) {
    const c = copy(us.length - 1);
    c.width -= fit.edge(c, false, true);
  }
  let over = -measure;
  for (const u of us) over += u.width;
  if (over <= FIT_EPS) return hang;
  // Steps of the reduction order: word spaces (1), interpuncts (2),
  // brackets (3), pause marks (4), Han–Latin spaces (5), stop marks (6);
  // in JLReq spacing, word spaces (1), the line end (2, 3), middle dots
  // (4), brackets and 、， (5), Han–Latin spaces (6).
  const last = us.length - 1;
  const atEnd = (j: number): boolean => fit.jlreq && j === last;
  const stepOf = (u: Unit, j: number): number => {
    if (u.kind === 'space') return u.aki ? 0 : u.auto ? (fit.jlreq ? 6 : 5) : 1;
    if (!u.punct) return 0;
    return fit.jlreq ? jlreqShrinkStep(u.punct, atEnd(j)) : shrinkStep(u.punct);
  };
  for (let step = 1; step <= 6 && over > FIT_EPS; step++) {
    const members: number[] = [];
    const caps: number[] = [];
    for (let j = 0; j < us.length; j++) {
      const u = us[j]!;
      if (stepOf(u, j) !== step) continue;
      // The marks at the edges already gave up their lead and tail.
      const cap = fit.give(u, false, atEnd(j));
      if (cap <= 0) continue;
      members.push(j);
      caps.push(cap);
    }
    if (members.length === 0) continue;
    // The blank at a JLReq line end goes whole or not at all (§3.1.9).
    const takes = fit.jlreq && (step === 2 || step === 3) ? caps : spread(over, caps);
    for (let m = 0; m < members.length; m++) {
      const take = takes[m]!;
      if (take <= 0) continue;
      const j = members[m]!;
      const c = copy(j);
      const given = c.punct ? shrinkPunctuation(c.punct, take, atEnd(j)) : take;
      c.width -= given;
      over -= given;
    }
  }
  return hang;
}

/** Where a unit's glyph (its `grapheme`th) is painted from its segment's
 *  start, px (`VDTLineSegment.inkOffset`): a shared mark's place in its
 *  box, less the blank its box gave up before it. Undefined for a unit
 *  painted at its own advances. */
function inkOffsetOf(u: Unit, grapheme = 0): number | undefined {
  const cutStart = u.punct?.cutStart ?? 0;
  if (u.place) return u.place[grapheme]! - cutStart;
  if (u.punct && boxCut(u.punct) > 0) return cutStart > 0 ? -cutStart : 0;
  return undefined;
}

/** The segments, text and flags of one line (see the module comment for
 *  the spreading). */
function composeLine(units: readonly Unit[], range: LineRange, li: number, isLast: boolean, ctx: ComposeContext): VDTLine {
  const us: Unit[] = [];
  for (let k = range.start; k < range.end; k++) us.push(k === range.start && range.first ? range.first : units[k]!);
  if (range.head) us.push(range.head);
  let lastK = range.end - 1;
  while (us.length > 0 && us[us.length - 1]!.kind === 'space') {
    us.pop();
    lastK--;
  }

  const measure = ctx.measureOf(li);
  // A warichu note's characters fold into their two rows (#195).
  if (us.some((u) => u.note)) foldNotes(us, ctx.level, ctx.em);
  // A ruby base at either edge aligns to it with its reading (#194); a
  // Japanese one is laid out again there (#422).
  if (us.some((u) => u.ruby?.jis)) relayJisEdges(us);
  alignEdgeRubies(us);
  const hang = ctx.fit ? fitLine(us, units, range, lastK, isLast, measure, ctx.fit) : undefined;
  const justify = ctx.textAlign === 'justify' && !isLast;
  let spaceWidth: number | undefined;
  let tracking = 0;
  let loose = false;
  let spaceRatio: number | undefined;
  let ragged = false;
  const stretches: boolean[] = [];
  if (justify) {
    let content = 0;
    let spaces = 0;
    let natural = 0;
    let widest = 0;
    let gaps = 0;
    // Han–Latin spaces (`cjk.latinSpacing`): they flex apart from word
    // spaces, and the renderers leave them as set.
    const autos: number[] = [];
    const jlreq = ctx.fit?.jlreq === true;
    for (let j = 0; j < us.length; j++) {
      const u = us[j]!;
      content += u.width;
      // The space after ？！ keeps its em (JLReq §3.1.6).
      if (u.kind === 'space' && u.aki) {
        stretches.push(false);
        continue;
      }
      if (u.kind === 'space' && u.auto) autos.push(j);
      else if (u.kind === 'space') {
        spaces++;
        natural += u.width;
        widest = Math.max(widest, u.width);
      }
      const s = j < us.length - 1 && gapAfterStretches(us, j, jlreq);
      stretches.push(s);
      if (s) gaps++;
    }
    let slack = measure - content;
    if (slack > FIT_EPS) {
      if (gaps > 0 || autos.length > 0) {
        if (spaces > 0) {
          // Word spaces first, up to half an em each, all set alike.
          spaceWidth = Math.max(widest, Math.min((natural + slack) / spaces, Math.max(ctx.em / 2, widest)));
          slack -= spaceWidth * spaces - natural;
          if (ctx.normalSpace > 0) spaceRatio = spaceWidth / ctx.normalSpace;
        }
        if (autos.length > 0 && slack > FIT_EPS) {
          // Then the Han–Latin spaces, up to half an em each (clreq
          // §6.2.2.4).
          const caps = autos.map((j) => Math.max(0, emOfFont(us[j]!.style.font) / 2 - us[j]!.width));
          const takes = spread(slack, caps);
          autos.forEach((j, m) => {
            if (takes[m]! <= 0) return;
            us[j] = { ...us[j]!, width: us[j]!.width + takes[m]! };
            slack -= takes[m]!;
          });
        }
        if (slack > FIT_EPS) {
          // Then every gap between characters, the Han–Latin spaces too.
          tracking = slack / (gaps + autos.length);
          if (tracking > ctx.cap + 1e-9) {
            tracking = ctx.cap;
            loose = true;
          }
          for (const j of autos) us[j] = { ...us[j]!, width: us[j]!.width + tracking };
        }
      } else if (spaces > 0 && us.some((u) => u.kind === 'text' && (u.firstCjk || u.lastCjk))) {
        // CJK characters with no gap between them that may spread (phrases
        // glued by word joiners, marks JLReq never spreads next to), and
        // word spaces (#463): the spaces take it all and the line ends on
        // the measure. Their final width is the segments', as every gap of
        // a composed line is; a Latin word space's stretch limit
        // (`justifiedSpaceRatio`, which sets a looser line ragged) is not
        // the rule of a CJK line, so the line reports none.
        spaceWidth = (natural + slack) / spaces;
      } else if (spaces > 0) {
        // Latin words only (an English sentence in a CJK paragraph): the
        // spaces take it all, as in a Latin line (the renderers stretch
        // them, and a line past the ratio is set ragged).
        if (ctx.normalSpace > 0) spaceRatio = (natural + slack) / spaces / ctx.normalSpace;
      } else if (us.some((u) => u.kind === 'text' && (u.firstCjk || u.lastCjk))) {
        // A CJK character with nothing to spread against.
        loose = true;
      } else {
        // Western text only (the head of a web address, a divided word): set
        // ragged, as a Latin line of one word is, and not reported.
        ragged = true;
      }
    }
  }

  const pieces: Piece[] = [];
  const addText = (u: Unit, text: string, width: number, t: number | undefined): void => {
    // Single characters (not Western runs, which keep a segment each) of
    // one style, link and spacing that advance alike share a segment.
    // A mark that gave up blank is a segment of its own: its glyph may be
    // painted before its box (`inkOffset`), and the caret spreads a
    // segment's width evenly over its characters.
    const cut = u.punct ? boxCut(u.punct) : 0;
    // Upright letters (`:upright[…]`) share a segment with each other only.
    const key = u.stacked || u.run || u.graphemes !== 1 || cut > 0 || u.place || u.orient === 'tcy' ? undefined : `${u.style.key}|${u.link ?? ''}|${t ?? ''}${u.orient ? `|${u.orient}` : ''}`;
    const last = pieces[pieces.length - 1];
    if (key !== undefined && last && last.key === key && last.cell !== undefined && Math.abs(last.cell - width) < 1e-3) {
      last.parts.push(text);
      last.seg.width += width;
      return;
    }
    pieces.push({ seg: segmentOf(u, width, t), parts: [text], key, ...(key !== undefined ? { cell: width } : {}) });
  };
  const segmentOf = (u: Unit, width: number, t: number | undefined, grapheme = 0): PendingSegment => {
    const s = u.style;
    const ink = inkOffsetOf(u, grapheme);
    return {
      kind: 'text',
      text: '',
      width,
      bold: s.bold || undefined,
      italic: s.italic || undefined,
      ...(s.captionLabel ? { captionLabel: true } : {}),
      ...(s.script ? { script: s.script, fontString: s.scriptFont, baselineShift: s.baselineShift } : {}),
      ...(u.stacked === 'first' ? { stacked: true } : {}),
      ...(s.smallCaps ? { smallCaps: true } : {}),
      ...(s.marks ? { cjkMarks: s.marks } : {}),
      ...(s.inserted ? { inserted: true } : {}),
      ...(s.color ? { color: s.color } : {}),
      ...(s.lang !== undefined ? { lang: s.lang } : {}),
      ...(t !== undefined ? { tracking: t } : {}),
      // Every mark that gave up blank carries its ink offset (0 when only
      // the blank after its glyph went), and so does a shared mark set in
      // a Chinese box, so no renderer paints its line in one run at the
      // glyphs' own advances.
      ...(ink !== undefined ? { inkOffset: ink } : {}),
      ...(u.orient === 'tcy' ? { tcy: true as const } : u.orient ? { orientation: u.orient } : {}),
      ...(u.scale !== undefined ? { inkScale: u.scale } : {}),
      ...(u.shift !== undefined ? { baselineShift: u.shift } : {}),
    };
  };
  /** The segment of a ruby base `width` px wide, `t` its tracking. */
  const rubySegment = (u: Unit, width: number, t: number | undefined): PendingSegment => {
    const ruby = u.ruby!;
    const g = ruby.geometry!;
    // The box less the advance kanbun marks add after it (#430).
    const box = u.width - (u.kunten?.extra ?? 0);
    // A Japanese ruby (#422) names its annotation (`id`), so renderers
    // can set one `<ruby>` for a word.
    const jis = ruby.jis !== undefined;
    return {
      ...segmentOf(u, width, t),
      text: u.text,
      ...(g.inset > 1e-9 ? { inkOffset: g.inset } : {}),
      // A base spread 1:2:1 under a longer Japanese reading.
      ...(g.tracking ? { tracking: g.tracking } : {}),
      ruby: {
        text: ruby.span.text,
        fontString: ruby.span.fontString ?? g.runs[0]?.fontString ?? u.style.font,
        baseWidth: ruby.base ?? box - g.inset * 2 - (ruby.position === 'right' ? g.rtWidth : 0),
        rtWidth: g.rtWidth,
        position: ruby.position,
        ...(ruby.span.group ? { group: true } : {}),
        ...(ruby.span.color ? { color: ruby.span.color } : {}),
        ...(jis ? { id: ruby.span.id } : {}),
        ...(jis && ruby.span.jukugo ? { jukugo: true as const } : {}),
        runs: g.runs,
      },
    };
  };
  for (let j = 0; j < us.length; j++) {
    const u = us[j]!;
    if (u.kind === 'space' && (u.auto || u.aki)) {
      pieces.push({ seg: { kind: 'space', text: u.text, width: u.width, autospace: true }, parts: [u.text], key: undefined });
      continue;
    }
    if (u.kind === 'space') {
      pieces.push({ seg: { kind: 'space', text: u.text, width: spaceWidth ?? u.width }, parts: [u.text], key: undefined });
      continue;
    }
    if (u.kind === 'atomic') {
      const seg = tokenSegment(u.token!);
      // A side marker carries the gap after the character it marks.
      if (seg.sideMarker && tracking > 0 && stretches[j]) seg.width += tracking;
      pieces.push({ seg, parts: [seg.text], key: undefined });
      continue;
    }
    const gap = tracking > 0 && stretches[j] ? tracking : 0;
    if (u.warichu) {
      // A warichu note's part: the rows are painted, not the text.
      pieces.push({ seg: { kind: 'text', text: u.text, width: u.width + gap, warichu: u.warichu }, parts: [u.text], key: undefined });
      continue;
    }
    if (u.kunten?.vdt) {
      // A character with kanbun marks (#430): a segment of its own, the
      // marks painted from its start; the room they take after it (inline
      // 返り点, a 竪点, 送り仮名 that run past it) and the gap follow as a
      // space of their own, so the character is painted at its natural
      // spacing (a ruby base in it centred under its reading).
      const extra = u.kunten.extra ?? 0;
      const own = u.width - extra;
      const seg: PendingSegment = u.ruby?.geometry ? rubySegment(u, own, undefined) : { ...segmentOf(u, own, undefined), text: u.text };
      seg.kunten = u.kunten.vdt;
      pieces.push({ seg, parts: [u.text], key: undefined });
      if (extra + gap > 0) pieces.push({ seg: { kind: 'space', text: '', width: extra + gap, autospace: true }, parts: [''], key: undefined });
      continue;
    }
    if (u.ruby?.geometry) {
      // A ruby base: centred in its box, its reading placed from the box's
      // start (#194). One character takes the gap after it as tracking; a
      // base of several keeps its natural spacing, centred under its
      // reading, and the gap follows the box as a space of its own (its
      // width final, as a Han–Latin space's is): tracking would be added
      // after each of its characters.
      const gapAfter = gap > 0 && u.graphemes > 1;
      const seg = rubySegment(u, gapAfter ? u.width : u.width + gap, gap > 0 && !gapAfter ? gap : undefined);
      pieces.push({ seg, parts: [u.text], key: undefined });
      if (gapAfter) pieces.push({ seg: { kind: 'space', text: '', width: gap, autospace: true }, parts: [''], key: undefined });
      continue;
    }
    if (u.place && u.graphemes === 2) {
      // A pair (—— ……) set in Chinese boxes: one segment per grapheme,
      // each glyph placed in its own em.
      const cell = u.width / 2;
      pieces.push({ seg: { ...segmentOf(u, cell, undefined, 0), text: u.text[0]! }, parts: [u.text[0]!], key: undefined });
      pieces.push({ seg: { ...segmentOf(u, cell + gap, gap > 0 ? gap : undefined, 1), text: u.text[1]! }, parts: [u.text[1]!], key: undefined });
    } else if (gap === 0) {
      addText(u, u.text, u.width, undefined);
    } else if (ctx.vertical && u.run) {
      // In vertical text a run is painted whole, its cells and sideways
      // letters as it was measured: the gap after it is advance only, and
      // cutting its last letter off would lose the neighbour an apostrophe
      // or an interpunct inside it is read with (`verticalRuns`).
      addText(u, u.text, u.width + gap, undefined);
    } else if (u.graphemes <= 1) {
      addText(u, u.text, u.width + gap, gap);
    } else {
      // A run the gap follows: its last grapheme carries the gap, the rest
      // keeps its natural spacing.
      const lastG = lastGrapheme(u.text);
      const head = u.text.slice(0, u.text.length - lastG.length);
      const headWidth = textWidth(head, u.style.font, u.style.smallCaps) + (ctx.letterSpacingPx === 0 ? 0 : ctx.letterSpacingPx * (u.graphemes - 1));
      addText(u, head, headWidth, undefined);
      addText(u, lastG, u.width - headWidth + gap, gap);
    }
  }
  const segments: VDTLineSegment[] = [];
  for (const p of pieces) {
    if (p.parts.length > 1 || p.seg.text === '') p.seg.text = p.parts.join('');
    segments.push(p.seg);
  }
  const trimmed = trimChipLineEdges(segments);
  clampReadings(trimmed);
  let width = 0;
  for (const s of trimmed) width += s.width;
  if (hang) {
    // The hung mark follows the line, outside its measure and its width.
    trimmed.push({ ...segmentOf(hang, hang.width, undefined), text: hang.text, hangs: true });
  }
  const text = trimmed.map((s) => s.text).join('');
  const y = li * ctx.lineHeightPx;
  return {
    text,
    bbox: createBoundingBox(ctx.indentOf(li), y, width, ctx.lineHeightPx),
    baseline: y + ctx.baselineOffset,
    hyphenated: range.hyphenated,
    ...(range.hyphenated && range.hardHyphen ? { hardHyphen: true } : {}),
    segments: trimmed,
    isLastLine: isLast,
    ...(spaceRatio !== undefined && !loose ? { justifiedSpaceRatio: spaceRatio } : {}),
    ...(loose ? { ragged: true, cjkLoose: true } : ragged ? { ragged: true } : {}),
    cjkComposed: true,
  };
}

/**
 * The first line's indent of a paragraph that opens with an opening
 * bracket, as `cjk.paragraphStartBracket` sets it (JLReq §3.1.5), with the
 * bracket's blank before its glyph given up (it is `units`' own unit,
 * replaced): pattern ① (`indent`) keeps the indent, ③ (`half`) sets the
 * bracket's glyph inside the indent so the text after it starts where the
 * indent ends (the bracket and its half em of blank fill a one-em indent),
 * 天付き (`flush`) drops the indent. `indentPx` when the composition leaves
 * the bracket to the line-start rules, the paragraph has no indent or
 * does not open with a bracket.
 */
function paragraphStartIndent(units: Unit[], indentPx: number, c: CjkComposition): number {
  const pattern = c.paragraphStartBracket;
  if (!pattern || indentPx <= 0) return indentPx;
  const f = units.findIndex((u) => u.kind !== 'space');
  const u = units[f];
  if (!u?.punct || u.first !== 'opening') return indentPx;
  // Its blank before the glyph, whatever `trimLineStart` says.
  const box = { ...u.punct };
  const lead = box.blank - box.cutStart;
  const trimmed: Unit = { ...u, punct: box };
  if (lead > 0 && box.side === 'start') {
    box.cutStart += lead;
    trimmed.width -= lead;
  }
  units[f] = trimmed;
  if (pattern === 'flush') return 0;
  if (pattern === 'half') return Math.max(0, indentPx - trimmed.width);
  return indentPx;
}

/**
 * Set a Chinese, Japanese or Korean paragraph (see the module comment):
 * `options.cjkLineBreak` (else the document's level) decides where lines
 * may break; `textAlign: 'justify'` spreads every line but the last to the
 * measure. First-line and hanging indents, the block's tracking
 * (`letterSpacingPx`), other measures for later lines (`restWidths`) and a
 * positive `looseness` (one line more, for column balancing: the lines are
 * broken a little short of the measure and spread to it) are honoured;
 * Knuth–Plass options are not used.
 */
export function composeCjkParagraph(
  spans: InlineSpan[],
  normalFont: string,
  boldFont: string,
  italicFont: string,
  boldItalicFont: string,
  maxWidthPx: number,
  lineHeightPx: number,
  options: MeasureBlockOptions | undefined,
): MeasuredBlock {
  // A writing mode asked for this paragraph alone: the Latin runs' widths
  // (`textWidth`) read it too.
  if (options?.writingMode !== undefined && options.writingMode !== getMeasureWritingMode()) {
    const opts = options;
    return withMeasureWritingMode(opts.writingMode!, () => composeCjkParagraph(spans, normalFont, boldFont, italicFont, boldItalicFont, maxWidthPx, lineHeightPx, opts));
  }
  const fonts: Fonts = { normal: normalFont, bold: boldFont, italic: italicFont, boldItalic: boldItalicFont };
  const letterSpacingPx = options?.letterSpacingPx ?? 0;
  const vertical = getMeasureWritingMode() === 'vertical-rl';
  // The composition works along the line in either writing mode; vertical
  // text keeps ：；？！ at one em (`CjkComposition.vertical`).
  const composition = compositionFor(options?.cjkComposition ?? getCjkComposition(), vertical);
  // The marks Latin text shares with Chinese take Chinese boxes in Chinese
  // text only (`routesSharedMarks`).
  const route = routesSharedMarks(composition, spans.map((s) => s.text).join(''));
  const units = prepareUnits(buildAllUnits(spans, fonts, letterSpacingPx, vertical, route), composition, letterSpacingPx);
  // A bibliography label's column (#290).
  if (options?.labelColumnPx !== undefined) {
    setLabelTabs(units, (u) => u.token?.labelTab, options.labelColumnPx, (u, w) => {
      u.width = w;
      u.token = { ...u.token!, width: w };
    });
  }
  // Ruby readings (#194), laid out once their neighbours are known.
  if (units.some((u) => u.ruby)) sizeRubies(units);
  // Kanbun marks (#430), beside the readings.
  if (units.some((u) => u.kunten)) sizeKunten(units, letterSpacingPx);
  if (!units.some((u) => u.kind !== 'space')) return { lines: [], totalHeight: 0 };
  const fit = lineFitOf(composition);
  const level = options?.cjkLineBreak ?? getCjkLineBreak();
  // `keep-all` (the paragraph's own, else the document's): lines break
  // between phrases, and inside one only when it is longer than the line.
  const keepAll = options?.cjkWordBreak !== undefined ? options.cjkWordBreak === 'keep-all' : composition.keepAll === true;
  const levelBreaks = breakOpportunities(units, level);
  const breaks = keepAll ? keepAllBreaks(units, levelBreaks) : levelBreaks;
  const emergency = keepAll ? levelBreaks : undefined;
  // The first line's indent gives way to an opening bracket that starts it
  // (`paragraphStartIndent`); the others are as asked (`lineIndentAt`).
  const firstIndent = paragraphStartIndent(units, lineIndentAt(options, 0), composition);
  // A line beside a picture text wraps round (#627) starts past its start
  // inset and ends short of its end inset.
  const insetOf = (li: number) => lineInsetsAt(options?.lineInsets, li);
  const indentOf = (li: number): number => (li === 0 ? firstIndent : lineIndentAt(options, li)) + insetOf(li).start;
  const measureOf = (li: number): number => lineMeasure(maxWidthPx, options?.restWidths, li) - insetOf(li).end - indentOf(li);
  const sizeMatch = FONT_SIZE_RE.exec(normalFont);
  const em = sizeMatch ? parseFloat(sizeMatch[1]!) : 16;
  const trackingCap = options?.justifyTrackingPx && options.justifyTrackingPx > 0 ? Math.min(em / 2, options.justifyTrackingPx) : em / 2;
  const textAlign = options?.textAlign ?? 'left';
  const ctx: ComposeContext = {
    fonts,
    textAlign,
    letterSpacingPx,
    em,
    cap: trackingCap,
    normalSpace: textAlign === 'justify' ? normalSpaceWidthFor(normalFont) + letterSpacingPx : 0,
    lineHeightPx,
    baselineOffset: lineBaselineOffset(lineHeightPx, normalFont),
    indentOf,
    measureOf,
    ...(vertical ? { vertical: true } : {}),
    ...(fit ? { fit } : {}),
    level,
  };
  const compose = (ranges: LineRange[]): VDTLine[] => ranges.map((r, li) => composeLine(units, r, li, li === ranges.length - 1, ctx));

  const ranges = breakUnits(units, breaks, measureOf, 0, letterSpacingPx, fit, level, undefined, undefined, emergency);
  let lines = compose(ranges);
  // 孤字 (clreq §7.2), where the paragraph avoids runts (`bodyText.avoidRunts`
  // gives it a runt penalty): a last line that holds one character, alone
  // or with its closing marks, takes the last character the line above may
  // give up (push-out), and that line is spread to the measure. When it
  // would need more than the tracking cap, the runt stays. Japanese text
  // (泣き別れ) first tries the other way JLReq prefers (§3.8.2): the line
  // above takes the character in by giving up blank (push-in), and the
  // paragraph is a line shorter.
  if ((options?.runtPenalty ?? 0) > 0 && endsOnOneCharacter(lines) && fit?.jlreq) {
    const pulled = breakUnits(units, breaks, measureOf, 0, letterSpacingPx, fit, level, undefined, ranges.length - 2, emergency);
    if (pulled.length === ranges.length - 1) {
      const set = compose(pulled);
      if (!set.some((l) => l.cjkLoose) && !endsOnOneCharacter(set)) lines = set;
    }
  }
  if ((options?.runtPenalty ?? 0) > 0 && endsOnOneCharacter(lines)) {
    const li = ranges.length - 2;
    const above = ranges[li]!;
    let at = above.end - 1;
    while (at > above.start && !breaks[at]) at--;
    if (!above.head && !above.hyphenated && !ranges[li + 1]!.first && at > above.start) {
      const pushed = breakUnits(units, breaks, measureOf, 0, letterSpacingPx, fit, level, { line: li, at }, undefined, emergency);
      if (pushed.length === ranges.length) {
        const set = compose(pushed);
        if (!set[li]!.cjkLoose && !endsOnOneCharacter(set)) lines = set;
      }
    }
  }
  // Column balancing asks for a paragraph one line longer: break each line
  // a little short of its measure, in eighths of an em, until the paragraph
  // gains the lines without a line past the tracking cap. The first step
  // that gains them usually carries a single character down; a setting
  // whose last line is one character, alone or with its marks (孤字), is
  // passed over for the next step's, which carries more.
  const looseness = options?.looseness ?? 0;
  if (looseness > 0) {
    const target = lines.length + looseness;
    for (let step = 1; step <= 16; step++) {
      const ranges = breakUnits(units, breaks, measureOf, (step * em) / 8, letterSpacingPx, fit, level, undefined, undefined, emergency);
      if (ranges.length < target) continue;
      if (ranges.length > target) break;
      const loose = compose(ranges);
      if (!loose.some((l) => l.cjkLoose) && !endsOnOneCharacter(loose)) {
        lines = loose;
        break;
      }
    }
  }
  if (lines.some((l) => l.segments?.some((s) => (s as PendingSegment).smallCaps))) {
    expandSmallCaps(lines, normalFont, boldFont, italicFont, boldItalicFont, letterSpacingPx);
  }
  markInsetLines(lines, maxWidthPx, options);
  return { lines, totalHeight: lines.length * lineHeightPx };
}

/** Whether a paragraph of two lines or more ends on a line that holds one
 *  CJK character, alone or followed by the marks that may not open a line
 *  (`图`, `版。`, `说。”`): the 孤字 Chinese typesetting avoids. */
function endsOnOneCharacter(lines: readonly VDTLine[]): boolean {
  if (lines.length < 2) return false;
  const gs = graphemesOf(lines[lines.length - 1]!.text.trim());
  let n = gs.length;
  while (n > 1 && isLineStartProhibited(cjkClassOf(gs[n - 1]!), 'basic')) n--;
  return n === 1 && isCjkGrapheme(gs[0]!) && cjkClassOf(gs[0]!) === 'ideograph';
}

/** Where a word that holds CJK characters may break, and its widths: see
 *  {@link cjkWordBreaks}. */
export interface CjkWordBreaks {
  /** Offsets into the word a line may break at, ascending. */
  breaks: number[];
  /** The word's advance: the sum of its units'. */
  width: number;
  /** The advance of the word's first `idx` characters. */
  widthBefore: (idx: number) => number;
}

/**
 * The breaks of one word (no breaking space inside) that holds CJK
 * characters, in a paragraph set by the word-by-word breaker (a Latin
 * paragraph quoting CJK): next to its CJK characters, under the document's
 * line-break rules. Each unit is measured once and the widths before a
 * break come from their running sums, so a long run of ideographs costs
 * linear time.
 */
export function cjkWordBreaks(word: string, font: string, smallCaps: boolean | undefined, letterSpacingPx: number, level: CjkLineBreakLevel = getCjkLineBreak()): CjkWordBreaks {
  const span: InlineSpan = { text: word, bold: false, italic: false, ...(smallCaps ? { smallCaps: true } : {}) };
  const units = buildUnits([span], { normal: font, bold: font, italic: font, boldItalic: font }, letterSpacingPx, getMeasureWritingMode() === 'vertical-rl');
  const opportunities = breakOpportunities(units, level);
  const starts: number[] = [];
  const sums: number[] = [0];
  const breaks: number[] = [];
  let total = 0;
  for (let k = 0; k < units.length; k++) {
    const u = units[k]!;
    starts.push(u.at);
    if (k > 0 && opportunities[k]) breaks.push(u.at);
    total += u.width;
    sums.push(total);
  }
  const widthBefore = (idx: number): number => {
    // The last unit that starts at or before `idx`.
    let lo = 0;
    let hi = starts.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (starts[mid]! <= idx) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    if (found < 0) return 0;
    const u = units[found]!;
    const inside = idx - u.at;
    if (inside <= 0) return sums[found]!;
    if (inside >= u.text.length) return sums[found + 1]!;
    const part = u.text.slice(0, inside);
    return sums[found]! + textWidth(part, font, smallCaps) + (letterSpacingPx === 0 ? 0 : letterSpacingPx * graphemeCount(part));
  };
  return { breaks, width: total, widthBefore };
}
