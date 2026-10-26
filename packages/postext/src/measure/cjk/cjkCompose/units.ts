// What the CJK composer works on: which paragraphs it sets, the unit and
// its style, span marks and languages, and units turned for a vertical line
// (#1276: split out of cjkCompose.ts).
import type { InlineRuby, InlineKunten, InlineWarichu, InlineSpan } from '../../../parse/index.js';
import type { VDTSegmentMarks, VDTKunten, VDTWarichu } from '../../../vdt.js';
import { isJapaneseLanguage } from '../../../hyphenation/locale.js';
import { getMeasureLanguage, measureTextWidth } from '../../canvas.js';
import { type RichToken, spanScriptFields, pickSpanFont } from '../../rich.js';
import { type CjkClass, isCjkGrapheme, isWordInnerMark } from '../cjkClasses.js';
import { hasCJK } from '../cjk.js';
import { graphemesOf } from '../../graphemes.js';
import { isBreakingSpace } from '../../spaces.js';
import { getMeasureRegion, getMeasureUprightDigits, fontEm } from '../../vertical.js';
import { verticalRuns } from '../../../writing/writingMode.js';
import type { RubyGeometry } from '../cjkAnnotate.js';
import { type CjkComposition, getCjkComposition, type PunctuationBox } from '../cjkPunctuation.js';
import type { JisRubyWord } from './ruby.js';

/** Fit tolerance of the breaker (px): running sums of many widths may
 *  land a hair past a measure they fill exactly. */
export const FIT_EPS = 1e-6;

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

/** A paragraph that is a row of dashes and nothing else. */
const DASH_ROW_RE = /^\s*(?:\u2014{2,}|\u2015{2,})\s*$/;

/**
 * Whether the CJK composer sets a paragraph that is nothing but a row of
 * dashes (――――――, a rule the author typed between two passages): in a
 * Chinese or Japanese document it does (#680), so the row is drawn as one
 * rule (`routeSharedMarks`) where the word-by-word path would paint each
 * dash at its face's advance, a stroke per cell. The dashes alone say
 * nothing about the language ({@link composesAsCjk}); the document does.
 */
export function composesDashRow(text: string, c: CjkComposition = getCjkComposition()): boolean {
  return (c.language === 'ja' || c.language === 'zh') && DASH_ROW_RE.test(text);
}

/** The style a unit is painted in: every unit of a span shares it, and
 *  consecutive text units with the same `key` merge into one segment. */
export interface UnitStyle {
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
export interface Unit {
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

export interface Fonts {
  normal: string;
  bold: string;
  italic: string;
  boldItalic: string;
}

/** The marks a span sets on its characters (#193, #421), the defaults
 *  of what the span leaves unset filled in (`cjk.emphasisMark` has filled
 *  the region's in already, `pipeline/text/annotations.ts`): emphasis dots a
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
  // In a document shaped in its own language every run that names one
  // carries it (#764): it was measured in it, and is painted in it.
  if (getMeasureLanguage() !== undefined) return lang;
  return getMeasureRegion() === 'japan' || isJapaneseLanguage(lang) ? lang : undefined;
}

export function styleOf(span: InlineSpan, fonts: Fonts, vertical = false): UnitStyle {
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
export function isCjkHere(g: string, prev: string | undefined, next: string | undefined): boolean {
  return isCjkGrapheme(g) && !isWordInnerMark(g, prev, next);
}

/** Marks that pair up into one 2-em unit (破折号, 省略号). */
export function pairable(g: string): boolean {
  return g === '\u2014' || g === '\u2015' || g === '\u2026' || g === '\u22EF'; // — ― … ⋯
}

/** Whether a vertical Western run opens and ends with a short number set
 *  in one upright cell (`cjk.uprightDigits`, see `verticalRuns`);
 *  undefined when neither. */
export function numberCellEdges(run: readonly string[]): { start: boolean; end: boolean } | undefined {
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
export function orientedUnits(span: InlineSpan, style: UnitStyle, letterSpacingPx: number, zwsp: boolean, units: Unit[]): void {
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
