import type { CjkLineBreak } from '../types';

/**
 * Character classes of Chinese (and Japanese) text layout, after the W3C
 * "Requirements for Chinese Text Layout" (clreq §3.1 and §6.1) and GB/T
 * 15834—2011: what a line may not start or end with at each strictness
 * level, which marks never part (—— ……), and which characters take no
 * inter-character space when a justified line is spread.
 *
 * Japanese line breaking (kinsoku shori, JLReq §3.1.7–§3.1.10, JIS X 4051)
 * tells apart characters these classes merge: the small kana and ー (ideograph
 * and iteration here), 々 among the iteration marks, the hyphens among the
 * connectors, ？！ among the stops, ：； among the pauses. The Japanese
 * levels read them from the grapheme ({@link breakClassOf}); every other
 * use of a class (widths, spacing, justification) and the Chinese levels
 * see only the classes below.
 *
 * A class is read from the first code point of a grapheme. The marks Latin
 * text shares with Chinese (— … · “ ” ‘ ’) are classed as Chinese marks
 * here: the table is only consulted for paragraphs set by the CJK composer
 * (`cjkCompose.ts`) and for the joints of words that hold CJK, where they
 * are Chinese punctuation. The apostrophe of a Latin word ("don’t") and the
 * interpunct inside one ("l·l") are kept in their word by the unit builder.
 */

/** How strictly lines avoid starting or ending with punctuation. The
 *  Chinese levels (clreq §6.1.1): `none`: anywhere between characters
 *  (Taiwan and Hong Kong newspapers). `basic`: no pause or stop mark,
 *  closing bracket or quote, connector, interpunct or iteration mark opens
 *  a line, and no opening bracket or quote closes one. `gb`: `basic` plus
 *  the solidus at either end (GB/T 15834—2011 §5.1.9). `strict`: `gb` plus
 *  the two-em dash and the ellipsis at the start of a line. The Japanese
 *  levels (JLReq Appendix C.3): `ja-very-strict` (JIS X 4051), `ja-strict`
 *  (small kana, ー and 々 may open a line) and `ja-loose` (newspapers); see
 *  {@link isLineStartProhibited}. */
export type CjkLineBreakLevel = CjkLineBreak;

export const CJK_LINE_BREAK_LEVELS: readonly CjkLineBreakLevel[] = ['none', 'basic', 'gb', 'strict', 'ja-very-strict', 'ja-strict', 'ja-loose'];

/** Whether a level is one of the Japanese ones (`ja-…`). */
export function isJapaneseLineBreak(level: CjkLineBreakLevel): boolean {
  return level === 'ja-very-strict' || level === 'ja-strict' || level === 'ja-loose';
}

export type CjkClass =
  /** Han, kana, hangul, bopomofo, fullwidth letters and digits, 〇, emoji
   *  and the CJK symbols: a line may break before and after each (the
   *  composer keeps a run of fullwidth digits or letters together, see
   *  {@link isFullwidthAlnum}). */
  | 'ideograph'
  /** Opening brackets and quotes: （〔［｛【〖《〈「『“‘ and ASCII ( [ {. */
  | 'opening'
  /** Closing brackets and quotes: ）〕］｝】〗》〉」』”’ and ASCII ) ] }. */
  | 'closing'
  /** Pause marks: 、，；： and ASCII , ; : */
  | 'pause'
  /** Stop marks: 。．！？‼⁇⁈⁉ and ASCII . ! ? */
  | 'stop'
  /** Interpuncts: · ‧ ・ ･ */
  | 'interpunct'
  /** Iteration marks and the prolonged sound mark: 々〻ゝゞヽヾー */
  | 'iteration'
  /** Dashes: — ― ⸺ ⸻ (two U+2014 in a row are one unit, 破折号). */
  | 'dash'
  /** Ellipses: … ‥ ⋯ (two in a row are one unit, 省略号). */
  | 'ellipsis'
  /** Connectors: – ～ 〜 ~ 〰 ゠ */
  | 'connector'
  /** Solidus: / ／ */
  | 'solidus'
  /** The ideographic space U+3000: a fixed character one em wide; a line
   *  may break after it, never before. */
  | 'ideoSpace'
  /** Signs a number takes before it: ¥ $ € £ ₩ ￥ ＄ ￡ ± − ＋ (the ASCII
   *  plus is Western text: `C++` may end a line). */
  | 'prefix'
  /** Signs a number takes after it: % ‰ ‱ ° ℃ ℉ ′ ″ ％ and the unit
   *  squares ㎡ ㎏ ㎞ ㏄ (U+3371–337A, U+3380–33DF, U+33FF), which are set
   *  in the Western run of their number. */
  | 'postfix'
  /** Latin, Greek, Cyrillic letters, digits and everything else: set in
   *  runs a line never breaks inside. */
  | 'western'
  /** U+200B, the zero-width space: a break opportunity, not printed. */
  | 'zwsp';

/** The classes the Japanese levels break by: the {@link CjkClass} of a
 *  grapheme, or one of the JLReq classes (Appendix A) a Chinese class holds
 *  together with others, which {@link breakClassOf} reads from the
 *  grapheme under a Japanese level only. */
export type CjkBreakClass =
  | CjkClass
  /** Small kana, cl-11: ぁぃぅぇぉっゃゅょゎゕゖ ァィゥェォッャュョヮヵヶ ㇰ–ㇿ
   *  ｧ–ｯ and the small kana of the Kana Extended blocks (ideographs to
   *  the Chinese levels). */
  | 'smallKana'
  /** The prolonged sound mark ー (ｰ), cl-10. */
  | 'prolonged'
  /** 々, the one iteration mark `ja-strict` lets open a line. */
  | 'kanjiIteration'
  /** Hyphens, cl-03: ‐ – ゠ 〜 and ～ (U+FF5E, which Japanese text types for
   *  〜; JLReq §3.1.7 note). */
  | 'hyphen'
  /** Dividing punctuation, cl-04: ？！‼⁇⁈⁉ (stops to the Chinese levels). */
  | 'dividing'
  /** Middle dots, cl-05: ・ ： ； and the other interpuncts (pauses or
   *  interpuncts to the Chinese levels). */
  | 'middleDot'
  /** 〳 〴 〵, the halves of the vertical kana repeat mark: cl-08
   *  inseparable characters, which may open a line but never part from
   *  each other (iteration marks to the Chinese levels). */
  | 'inseparable';

/** The level lines of CJK text break at when a measurement names none:
 *  the document's `cjk.lineBreak`, which the build sets before it lays the
 *  document out (as it sets the hyphenation language), so captions, table
 *  cells, notes and boxes break like the body. */
let documentLineBreak: CjkLineBreakLevel = 'gb';

/** Set the level {@link getCjkLineBreak} returns (the build does, from the
 *  resolved `cjk.lineBreak`). */
export function setCjkLineBreak(level: CjkLineBreakLevel): void {
  documentLineBreak = level;
}

/** The document's line-break level for CJK text (see
 *  {@link setCjkLineBreak}); `gb` until a build sets another. */
export function getCjkLineBreak(): CjkLineBreakLevel {
  return documentLineBreak;
}

/** Whether a line may break between two graphemes that touch: `a` (class
 *  `aCls`, a CJK grapheme when `aCjk`) and `b` after it. Only next to a CJK
 *  grapheme — two Western graphemes never part here — and never before the
 *  ideographic space; at `level`, no prohibited mark opens or closes a
 *  line. Under a Japanese level the graphemes, when given (`aG`, `bG`: the
 *  last of the text before and the first after), refine the classes
 *  ({@link breakClassOf}) and keep the inseparable pairs whole
 *  ({@link isInseparablePair}). */
export function cjkBreakAllowed(
  aCls: CjkClass,
  aCjk: boolean,
  bCls: CjkClass,
  bCjk: boolean,
  level: CjkLineBreakLevel,
  aG?: string,
  bG?: string,
): boolean {
  if (aCls === 'zwsp' || bCls === 'zwsp') return true;
  if (!aCjk && !bCjk) return false;
  if (bCls === 'ideoSpace') return false;
  if (aG !== undefined && bG !== undefined && isJapaneseLineBreak(level) && isInseparablePair(aG, bG)) return false;
  return !isLineStartProhibited(bCls, level, bG) && !isLineEndProhibited(aCls, level, aG);
}

/** Whether a grapheme of `cls` may not open a line at `level`. Under a
 *  Japanese level `grapheme`, when given, refines the class
 *  ({@link breakClassOf}); the Chinese levels never read it.
 *
 *  The Japanese levels (JLReq §3.1.7 and Appendix C.3). At all three no
 *  line opens with a closing bracket or quote (cl-02, and the warichu's
 *  cl-29), 、， (cl-07) or 。． (cl-06). `ja-very-strict` (JIS X 4051's
 *  default) adds the hyphens (cl-03), ？！ (cl-04), the middle dots (cl-05),
 *  the iteration marks (cl-09), ー (cl-10), the small kana (cl-11) and a unit
 *  sign; `ja-strict` lets a small kana, ー and 々 open a line (JLReq's
 *  convention for books in general); `ja-loose` (the newspapers' very
 *  loose convention) lets all of them but the first group. The two-em
 *  dash and the ellipsis (cl-08) may open a line at every Japanese level,
 *  and the solidus has no rule (GB/T's only). */
export function isLineStartProhibited(cls: CjkBreakClass, level: CjkLineBreakLevel, grapheme?: string): boolean {
  switch (level) {
    case 'none':
      return false;
    case 'ja-very-strict':
    case 'ja-strict':
    case 'ja-loose':
      return jaLineStartProhibited(grapheme === undefined ? cls : breakClassOf(grapheme, cls, level), level);
  }
  const c = chineseClass(cls);
  switch (level) {
    case 'strict':
      if (c === 'dash' || c === 'ellipsis') return true;
    // falls through
    case 'gb':
      if (c === 'solidus') return true;
    // falls through
    case 'basic':
      return c === 'pause' || c === 'stop' || c === 'closing' || c === 'connector'
        || c === 'interpunct' || c === 'iteration' || c === 'postfix';
  }
}

function jaLineStartProhibited(cls: CjkBreakClass, level: 'ja-very-strict' | 'ja-strict' | 'ja-loose'): boolean {
  switch (cls) {
    case 'closing': case 'pause': case 'stop':
      return true;
    case 'hyphen': case 'connector': case 'dividing': case 'middleDot': case 'interpunct': case 'iteration': case 'postfix':
      return level !== 'ja-loose';
    case 'smallKana': case 'prolonged': case 'kanjiIteration':
      return level === 'ja-very-strict';
    default:
      return false;
  }
}

/** Whether a grapheme of `cls` may not close a line at `level` (`grapheme`
 *  as for {@link isLineStartProhibited}). At every Japanese level an
 *  opening bracket or quote (cl-01, and the warichu's cl-28); a currency
 *  sign (cl-12) too, but at `ja-loose`, which lets one end a line away
 *  from a number (a number keeps its signs at every level). */
export function isLineEndProhibited(cls: CjkBreakClass, level: CjkLineBreakLevel, grapheme?: string): boolean {
  switch (level) {
    case 'none':
      return false;
    case 'ja-very-strict':
    case 'ja-strict':
    case 'ja-loose': {
      const c = grapheme === undefined ? cls : breakClassOf(grapheme, cls, level);
      return c === 'opening' || (c === 'prefix' && level !== 'ja-loose');
    }
  }
  const c = chineseClass(cls);
  switch (level) {
    case 'strict':
    case 'gb':
      if (c === 'solidus') return true;
    // falls through
    case 'basic':
      return c === 'opening' || c === 'prefix';
  }
}

/** A Japanese break class as the Chinese levels read it: the clreq class
 *  that holds it. Only a Japanese level refines a class, so the Chinese
 *  levels meet one only when a caller passes it in. */
function chineseClass(cls: CjkBreakClass): CjkClass {
  switch (cls) {
    case 'smallKana': return 'ideograph';
    case 'prolonged': case 'kanjiIteration': case 'inseparable': return 'iteration';
    case 'hyphen': return 'connector';
    case 'dividing': return 'stop';
    case 'middleDot': return 'pause';
    default: return cls;
  }
}

/** Small kana (cl-11): ぁぃぅぇぉ っ ゃゅょ ゎ ゕゖ and their katakana, the
 *  Ainu small katakana ㇰ–ㇿ (U+31F0–31FF, ㇷ゚ with its combining mark), the
 *  halfwidth ｧ–ｯ and the small kana of the Kana Extended and Small Kana
 *  Extension blocks. UAX #14 classes them CJ. */
function isSmallKana(cp: number): boolean {
  switch (cp) {
    case 0x3041: case 0x3043: case 0x3045: case 0x3047: case 0x3049: case 0x3063: case 0x3083: case 0x3085: case 0x3087: case 0x308E: case 0x3095: case 0x3096:
    case 0x30A1: case 0x30A3: case 0x30A5: case 0x30A7: case 0x30A9: case 0x30C3: case 0x30E3: case 0x30E5: case 0x30E7: case 0x30EE: case 0x30F5: case 0x30F6:
    case 0x1B132: case 0x1B150: case 0x1B151: case 0x1B152: case 0x1B155: case 0x1B164: case 0x1B165: case 0x1B166: case 0x1B167:
      return true;
  }
  return (cp >= 0x31F0 && cp <= 0x31FF) || (cp >= 0xFF67 && cp <= 0xFF6F);
}

/** Hyphens (cl-03): ‐ (U+2010, a quarter em), – (U+2013), ゠ (U+30A0), 〜
 *  (U+301C) and ～ (U+FF5E), the fullwidth tilde Japanese text types for 〜
 *  (UAX #14 classes it ID, so it needs this tailoring). */
const HYPHEN = new Set('\u2010\u2013\u30A0\u301C\uFF5E');
/** Dividing punctuation (cl-04). */
const DIVIDING = new Set('！？!?‼⁇⁈⁉﹖﹗︕︖');
/** The colon and semicolon, middle dots (cl-05) to JLReq. */
const MIDDLE_DOT_PAUSE = new Set('：；:;﹔﹕︓︔');

/**
 * The class a Japanese level breaks `grapheme` by, given its class `cls`
 * (as the composer set it on the grapheme's unit): the JLReq class
 * (Appendix A) where the clreq class merges several, else `cls`. Under a
 * Chinese level, `cls` unchanged. Only a grapheme whose `cls` is the one
 * {@link cjkClassOf} gives it is refined, so a unit whose class the
 * composer set (an upright number cell, a single em dash read as a
 * connector) keeps what the composer meant:
 * - an ideograph that is a small kana → `smallKana`;
 * - ー → `prolonged`; 々 → `kanjiIteration`; 〳 〴 〵 → `inseparable`;
 * - a hyphen, connector or Western grapheme in {@link HYPHEN} → `hyphen`;
 *   a single — or ― (a connector to clreq) → `dash`, which may open a
 *   Japanese line;
 * - ？！ → `dividing`; ：； and the interpuncts → `middleDot`.
 */
export function breakClassOf(grapheme: string, cls: CjkBreakClass, level: CjkLineBreakLevel): CjkBreakClass {
  if (!isJapaneseLineBreak(level)) return cls;
  const cp = grapheme.codePointAt(0);
  if (cp === undefined) return cls;
  switch (cls) {
    case 'ideograph':
      return isSmallKana(cp) ? 'smallKana' : cls;
    case 'iteration':
      if (cp === 0x30FC || cp === 0xFF70) return 'prolonged';
      if (cp === 0x3005) return 'kanjiIteration';
      return cp >= 0x3033 && cp <= 0x3035 ? 'inseparable' : cls;
    case 'connector':
      if (cp === 0x2014 || cp === 0x2015) return 'dash';
    // falls through
    case 'western':
      return HYPHEN.has(String.fromCodePoint(cp)) ? 'hyphen' : cls;
    case 'stop':
      return DIVIDING.has(String.fromCodePoint(cp)) ? 'dividing' : cls;
    case 'pause':
      return MIDDLE_DOT_PAUSE.has(String.fromCodePoint(cp)) ? 'middleDot' : cls;
    case 'interpunct':
      return 'middleDot';
    default:
      return cls;
  }
}

/** Two graphemes a Japanese line never breaks between (分離禁止, JLReq
 *  §3.1.10): the same inseparable character twice (―― —— …… ‥‥, cl-08;
 *  the composer sets ――, —— and …… as one unit already, this keeps a third
 *  with them and ‥‥ whole), and the two halves of the vertical kana repeat
 *  mark (〳〵, 〴〵). Two different ones may part. */
export function isInseparablePair(a: string, b: string): boolean {
  const ca = a.codePointAt(0);
  const cb = b.codePointAt(0);
  if (ca === undefined || cb === undefined) return false;
  if (cb === 0x3035) return ca === 0x3033 || ca === 0x3034;
  return ca === cb && (ca === 0x2014 || ca === 0x2015 || ca === 0x2026 || ca === 0x2025);
}

const OPENING = new Set('（〔［｛【〖《〈「『〘〚〝“‘([{«‹︵︷︹︻︽︿﹁﹃﹇﹙﹛﹝︗｟｢⦅');
const CLOSING = new Set('）〕］｝】〗》〉」』〙〛〞〟”’)]}»›︶︸︺︼︾﹀﹂﹄﹈﹚﹜﹞︘｠｣⦆');
const PAUSE = new Set('、，；：,;:﹐﹑﹔﹕︐︑︓︔､');
const STOP = new Set('。．！？.!?‼⁇⁈⁉﹒﹖﹗︒︕︖｡');
const INTERPUNCT = new Set('·‧・･');
const ITERATION = new Set('々〻ゝゞヽヾーｰ〱〲〳〴〵');
const DASH = new Set('—―⸺⸻︱︲﹘');
const ELLIPSIS = new Set('…‥⋯︙︰');
const CONNECTOR = new Set('–～〜~〰゠');
const SOLIDUS = new Set('/／');
const PREFIX = new Set('¥$€£₩￥＄￡￦±−＋﹩₽₹');
const POSTFIX = new Set('%‰‱°℃℉′″％￠﹪');

/** The squared Latin abbreviations of units in the CJK compatibility
 *  block: ㍱ hPa to ㍺ IU, ㎀ pA to ㏟ A∕m, ㏿ gal. They follow a number as
 *  % does, in any script, and are no CJK text. */
export function isUnitSquare(cp: number): boolean {
  return (cp >= 0x3371 && cp <= 0x337A) || (cp >= 0x3380 && cp <= 0x33DF) || cp === 0x33FF;
}

/** Fullwidth digits ０–９. */
export function isFullwidthDigit(cp: number): boolean {
  return cp >= 0xFF10 && cp <= 0xFF19;
}

/** Fullwidth digits and Latin letters (０–９, Ａ–Ｚ, ａ–ｚ): set one em
 *  wide like ideographs, but a number or a word a line never breaks
 *  inside. */
export function isFullwidthAlnum(cp: number): boolean {
  return (cp >= 0xFF10 && cp <= 0xFF19) || (cp >= 0xFF21 && cp <= 0xFF3A) || (cp >= 0xFF41 && cp <= 0xFF5A);
}

/** The circled, parenthesized and full-stop numbers and letters of
 *  Enclosed Alphanumerics (①–⑳, ⑴–⒇, ⒈–⒛, ⒜–⒵, Ⓐ–ⓩ, ⓪, ⓫–⓿) and the
 *  dingbat circled numbers (❶–❿, ➀–➓): East Asian Width ambiguous, wide
 *  in East Asian text, where they number senses, items and steps. */
export function isEnclosedAlphanumeric(cp: number): boolean {
  return (cp >= 0x2460 && cp <= 0x24FF) || (cp >= 0x2776 && cp <= 0x2793);
}

/** Whether {@link isEnclosedAlphanumeric} characters are set as Chinese
 *  characters (`cjk.circledNumbers: 'cjk'`, the default since #637): one
 *  cell, no Han–Latin space, kept off a line end
 *  ({@link isLabelEndProhibited}). Off, they are Western letters, as up to 1.24. The build
 *  sets it with the document's composition (`setCjkComposition`). */
let enclosedAsCjk = true;

/** Set whether circled numbers are set as Chinese characters (see
 *  {@link isEnclosedAlphanumeric}); returns the setting it replaces. */
export function setCjkCircledNumbers(asCjk: boolean): boolean {
  const prev = enclosedAsCjk;
  enclosedAsCjk = asCjk;
  return prev;
}

/** See {@link setCjkCircledNumbers}; true until a build sets it. */
export function getCjkCircledNumbers(): boolean {
  return enclosedAsCjk;
}

/** Whether a line may not end on `grapheme` at `level` because it is a
 *  circled number set as a Chinese character (#637): it labels the text
 *  after it (`①天也`), as a currency sign does its number, and is kept off
 *  a line end at the levels that keep the prefix signs off one: `basic`,
 *  `gb`, `strict`, `ja-very-strict` and `ja-strict`; `none` and
 *  `ja-loose` let it end a line. */
export function isLabelEndProhibited(grapheme: string | undefined, level: CjkLineBreakLevel): boolean {
  if (!enclosedAsCjk || grapheme === undefined || level === 'none' || level === 'ja-loose') return false;
  const cp = grapheme.codePointAt(0);
  return cp !== undefined && isEnclosedAlphanumeric(cp);
}

/** Code points of the CJK scripts and their symbol blocks, classed
 *  `ideograph` unless a punctuation set above names them; the circled
 *  numbers too, unless the document sets them as Western letters
 *  ({@link setCjkCircledNumbers}). */
function isCjkCodePoint(cp: number): boolean {
  if (cp >= 0x3371 && cp <= 0x33FF && isUnitSquare(cp)) return false;
  if (cp >= 0x2460 && cp <= 0x2793 && isEnclosedAlphanumeric(cp)) return enclosedAsCjk;
  return (cp >= 0x1100 && cp <= 0x11FF) // Hangul Jamo
    || (cp >= 0x2E80 && cp <= 0x2FDF) // CJK and Kangxi radicals
    || (cp >= 0x2FF0 && cp <= 0x2FFF) // ideographic description characters
    || (cp >= 0x3000 && cp <= 0x303F) // CJK symbols and punctuation
    || (cp >= 0x3040 && cp <= 0x30FF) // kana
    || (cp >= 0x3100 && cp <= 0x312F) // bopomofo
    || (cp >= 0x3130 && cp <= 0x318F) // Hangul compatibility Jamo
    || (cp >= 0x3190 && cp <= 0x31FF) // kanbun, bopomofo extended, CJK strokes, katakana extension
    || (cp >= 0x3200 && cp <= 0x33FF) // enclosed CJK, CJK compatibility
    || (cp >= 0x3400 && cp <= 0x4DBF) // Extension A
    || (cp >= 0x4E00 && cp <= 0x9FFF) // unified ideographs
    || (cp >= 0xA960 && cp <= 0xA97F) // Hangul Jamo extended A
    || (cp >= 0xAC00 && cp <= 0xD7FF) // Hangul syllables, Jamo extended B
    || (cp >= 0xF900 && cp <= 0xFAFF) // compatibility ideographs
    || (cp >= 0xFE10 && cp <= 0xFE1F) // vertical forms
    || (cp >= 0xFE30 && cp <= 0xFE6F) // CJK compatibility forms, small form variants
    || (cp >= 0xFF00 && cp <= 0xFFEF) // halfwidth and fullwidth forms
    || (cp >= 0x16FE0 && cp <= 0x16FFF) // ideographic symbols (small 儿)
    || (cp >= 0x1B000 && cp <= 0x1B16F) // kana supplement and extended
    || (cp >= 0x1F200 && cp <= 0x1F2FF) // enclosed ideographic supplement
    || (cp >= 0x20000 && cp <= 0x3FFFF); // Extensions B and later
}

const PICTOGRAPHIC_RE = /\p{Extended_Pictographic}/u;

/** The class of a grapheme, read from its first code point. */
export function cjkClassOf(grapheme: string): CjkClass {
  const ch = grapheme.length === 1 ? grapheme : String.fromCodePoint(grapheme.codePointAt(0)!);
  if (ch === '\u3000') return 'ideoSpace';
  if (ch === '\u200B') return 'zwsp';
  if (OPENING.has(ch)) return 'opening';
  if (CLOSING.has(ch)) return 'closing';
  if (PAUSE.has(ch)) return 'pause';
  if (STOP.has(ch)) return 'stop';
  if (INTERPUNCT.has(ch)) return 'interpunct';
  if (ITERATION.has(ch)) return 'iteration';
  if (DASH.has(ch)) return 'dash';
  if (ELLIPSIS.has(ch)) return 'ellipsis';
  if (CONNECTOR.has(ch)) return 'connector';
  if (SOLIDUS.has(ch)) return 'solidus';
  if (PREFIX.has(ch)) return 'prefix';
  if (POSTFIX.has(ch)) return 'postfix';
  const cp = ch.codePointAt(0)!;
  if (isUnitSquare(cp)) return 'postfix';
  if (isCjkCodePoint(cp)) return 'ideograph';
  if (cp >= 0x2190 && PICTOGRAPHIC_RE.test(ch)) return 'ideograph';
  return 'western';
}

/** Whether a grapheme is set as a Chinese character in a CJK paragraph: it
 *  opens a unit of its own instead of joining a Western run. The ASCII
 *  marks (`,` `.` `(` `%`…) and the signs of numbers stay in the Western
 *  run they touch; the marks Chinese shares with Latin text (— … · “ ” ‘ ’
 *  – ~) are Chinese marks, except the apostrophe or the interpunct of a
 *  Latin word, which the unit builder keeps in it. */
export function isCjkGrapheme(grapheme: string): boolean {
  const cp = grapheme.codePointAt(0)!;
  if (cp < 0x80) return false;
  if (isCjkCodePoint(cp)) return true;
  switch (grapheme[0]) {
    case '\u2014': case '\u2015': case '\u2E3A': case '\u2E3B': // — ― ⸺ ⸻
    case '\u2026': case '\u2025': case '\u22EF': // … ‥ ⋯
    case '\u00B7': case '\u2027': // · ‧
    case '\u201C': case '\u201D': case '\u2018': case '\u2019': // “ ” ‘ ’
    case '\u2013': // –
    case '\u200B':
      return true;
  }
  return cp >= 0x2190 && PICTOGRAPHIC_RE.test(grapheme);
}

/** Whether a grapheme is a letter or digit of Western text (the neighbours
 *  of an apostrophe or an interpunct kept inside a word). */
export function isWesternWordChar(grapheme: string | undefined): boolean {
  if (grapheme === undefined) return false;
  const cp = grapheme.codePointAt(0)!;
  if (isCjkCodePoint(cp)) return false;
  return /[\p{L}\p{N}]/u.test(grapheme);
}

/** Whether an apostrophe or an interpunct sits inside a Latin word
 *  ("don’t", "l·l"): between two letters or digits of Western text. It
 *  belongs to the word then — the composer keeps it in the word's run, and
 *  vertical text sets it sideways with the word — not to the Chinese text
 *  around it. */
export function isWordInnerMark(grapheme: string, prev: string | undefined, next: string | undefined): boolean {
  return (grapheme === '\u2019' || grapheme === '\u00B7') && isWesternWordChar(prev) && isWesternWordChar(next);
}

/** Whether a code point is a mark a browser sets half width when it meets
 *  another (CSS `text-spacing-trim`, OpenType `chws`/`halt`): an opening or
 *  closing bracket or quote, a pause or stop mark, an interpunct, the
 *  ideographic space. The marks of the CJK blocks always; the marks Latin
 *  text shares with Chinese (“ ” ‘ ’ · ‧ « »…) only when `shared` is set
 *  (the text is Chinese). ASCII never. */
export function isTrimmableMark(cp: number, shared: boolean): boolean {
  if (cp < 0xAB) return false;
  if (cp < 0x2E80 && !shared) return false;
  switch (cjkClassOf(String.fromCodePoint(cp))) {
    case 'opening': case 'closing': case 'pause': case 'stop': case 'interpunct': case 'ideoSpace':
      return true;
    default:
      return false;
  }
}

/**
 * Where to cut `text` so that no piece holds two CJK marks side by side:
 * the offsets (UTF-16) between each such pair. Chrome (CSS
 * `text-spacing-trim: normal`, and fonts with `chws`) sets the first of
 * `）》`, `”“`, `》。` or `。《` half width when a run is measured or painted
 * whole — `本）》录` in Noto Serif SC is 3.5 em as one run and 4 em
 * character by character — while the CJK composer measures every
 * character alone and adjusts the marks itself (`cjk.punctuationWidth`).
 * Measuring and painting such text piece by piece keeps the browser out of
 * it. `shared` counts the marks Latin text shares with Chinese (“ ” ‘ ’ ·):
 * set it for Chinese text only, so a Latin `’”` is never cut. Empty for
 * text with no such pair.
 */
export function cjkMarkCuts(text: string, shared: boolean): number[] {
  let cuts: number[] | undefined;
  let prev = false;
  for (let i = 0; i < text.length; i++) {
    const cp = text.codePointAt(i)!;
    const mark = isTrimmableMark(cp, shared);
    if (mark && prev) (cuts ??= []).push(i);
    prev = mark;
    if (cp > 0xFFFF) i++;
  }
  return cuts ?? [];
}

/** `text` cut at {@link cjkMarkCuts}: one piece when there is no cut. */
export function cjkMarkPieces(text: string, shared: boolean): string[] {
  const cuts = cjkMarkCuts(text, shared);
  if (cuts.length === 0) return [text];
  const out: string[] = [];
  let from = 0;
  for (const at of cuts) {
    out.push(text.slice(from, at));
    from = at;
  }
  out.push(text.slice(from));
  return out;
}
