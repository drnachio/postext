import type { CjkLineBreak } from '../types';

/**
 * Character classes of Chinese (and Japanese) text layout, after the W3C
 * "Requirements for Chinese Text Layout" (clreq §3.1 and §6.1) and GB/T
 * 15834—2011: what a line may not start or end with at each strictness
 * level, which marks never part (—— ……), and which characters take no
 * inter-character space when a justified line is spread.
 *
 * A class is read from the first code point of a grapheme. The marks Latin
 * text shares with Chinese (— … · “ ” ‘ ’) are classed as Chinese marks
 * here: the table is only consulted for paragraphs set by the CJK composer
 * (`cjkCompose.ts`) and for the joints of words that hold CJK, where they
 * are Chinese punctuation. The apostrophe of a Latin word ("don’t") and the
 * interpunct inside one ("l·l") are kept in their word by the unit builder.
 */

/** How strictly lines avoid starting or ending with punctuation (clreq
 *  §6.1.1). `none`: anywhere between characters (Taiwan and Hong Kong
 *  newspapers). `basic`: no pause or stop mark, closing bracket or quote,
 *  connector, interpunct or iteration mark opens a line, and no opening
 *  bracket or quote closes one. `gb`: `basic` plus the solidus at either
 *  end (GB/T 15834—2011 §5.1.9). `strict`: `gb` plus the two-em dash and
 *  the ellipsis at the start of a line. */
export type CjkLineBreakLevel = CjkLineBreak;

export const CJK_LINE_BREAK_LEVELS: readonly CjkLineBreakLevel[] = ['none', 'basic', 'gb', 'strict'];

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
 *  line. */
export function cjkBreakAllowed(aCls: CjkClass, aCjk: boolean, bCls: CjkClass, bCjk: boolean, level: CjkLineBreakLevel): boolean {
  if (aCls === 'zwsp' || bCls === 'zwsp') return true;
  if (!aCjk && !bCjk) return false;
  if (bCls === 'ideoSpace') return false;
  return !isLineStartProhibited(bCls, level) && !isLineEndProhibited(aCls, level);
}

/** Whether a grapheme of `cls` may not open a line at `level`. */
export function isLineStartProhibited(cls: CjkClass, level: CjkLineBreakLevel): boolean {
  switch (level) {
    case 'none':
      return false;
    case 'strict':
      if (cls === 'dash' || cls === 'ellipsis') return true;
    // falls through
    case 'gb':
      if (cls === 'solidus') return true;
    // falls through
    case 'basic':
      return cls === 'pause' || cls === 'stop' || cls === 'closing' || cls === 'connector'
        || cls === 'interpunct' || cls === 'iteration' || cls === 'postfix';
  }
}

/** Whether a grapheme of `cls` may not close a line at `level`. */
export function isLineEndProhibited(cls: CjkClass, level: CjkLineBreakLevel): boolean {
  switch (level) {
    case 'none':
      return false;
    case 'strict':
    case 'gb':
      if (cls === 'solidus') return true;
    // falls through
    case 'basic':
      return cls === 'opening' || cls === 'prefix';
  }
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

/** Code points of the CJK scripts and their symbol blocks, classed
 *  `ideograph` unless a punctuation set above names them. */
function isCjkCodePoint(cp: number): boolean {
  if (cp >= 0x3371 && cp <= 0x33FF && isUnitSquare(cp)) return false;
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
