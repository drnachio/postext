/**
 * Glyph orientation in vertical text (`layout.writingMode: 'vertical-rl'`),
 * one helper shared by every renderer, so the canvas, the PDF and the HTML
 * output turn the same characters the same way.
 *
 * The flow of a vertical page is laid out as horizontal lines in a frame
 * turned a quarter turn clockwise (`VDTPage.flow`). Text painted there
 * "as is" comes out turned 90° clockwise — which is right for Latin words
 * and long numbers (sideways, UAX #50 `R`) and wrong for Chinese
 * characters, which stand upright, each in its own 1 em cell, turned back
 * about the cell's centre. Punctuation takes the font's vertical form
 * (OpenType `vert`) when a renderer can get it, else a fallback.
 *
 * Classes follow Unicode's `Vertical_Orientation` (UAX #50, data 18.0),
 * with the Chinese rules on top (clreq Appendix A, GB/T 15834—2011 §5.2):
 * - pause and stop marks (、。，．！？) and ：； are never turned. A
 *   Simplified (mainland) font sets them in the upper right of the cell
 *   through `vert` (、。，． in the top-right corner, ！？：； in the right
 *   half); Taiwan and Hong Kong fonts centre them and have no such form
 *   (their U+FE10–FE16 are the mainland shapes, so the vertical
 *   presentation forms must not be substituted there).
 * - brackets and quotes take the vertical form, which is the horizontal
 *   glyph turned about the em box's centre when the font gives none;
 *   “ ” ‘ ’ in mainland text read as the corner brackets 『』「」
 *   (UAX #50 §3.2.4, the Hans vertical convention).
 * - dashes, ellipses, the wave dash and the interpunct are turned about
 *   the em box's centre (Noto CJK gives —— a vertical form only with
 *   `fwid`): a dash is stretched to fill its cell. The mainland interpunct
 *   takes half a cell (clreq §5.1), the Taiwan and Hong Kong one
 *   a whole cell.
 * - an apostrophe or an interpunct inside a Latin word ("don’t", "l·l")
 *   runs sideways with the word, as the composer keeps it in the word.
 *
 * The measurer and every renderer read the same runs ({@link
 * verticalRuns}): what stands in a cell advances its cell (one em, half an
 * em for the mainland interpunct), what runs sideways its horizontal width.
 */

import type { CjkRegion } from './types';
import { cjkClassOf, isWordInnerMark } from './measure/cjkClasses';

/** How a character is set in a vertical line.
 *  - `upright`: standing, centred in its cell (Han, kana, hangul,
 *    fullwidth letters, and the pause marks of Taiwan and Hong Kong).
 *  - `sideways`: turned 90° clockwise with the run it belongs to, keeping
 *    its horizontal advance (Latin, digits, most symbols).
 *  - `rotate`: turned 90° clockwise about the centre of its em box, in a
 *    cell of its own (dashes, ellipses, the interpunct).
 *  - `alternate`: the font's vertical form (`vert`); without one, the
 *    `fallback`: `rotate` (brackets, quotes) or `corner` (a mainland
 *    pause or stop mark moved to the top-right quadrant of its cell).
 *  - `tcy`: tate-chu-yoko (縱中橫): a short number (`cjk.uprightDigits`)
 *    or a `:tcy[…]` run set side by side in one upright cell, squeezed
 *    across when wider than the cell. */
export type VerticalOrientationKind = 'upright' | 'sideways' | 'rotate' | 'alternate' | 'tcy';

export interface VerticalGlyph {
  orient: VerticalOrientationKind;
  /** `alternate` only: what a renderer without the font's vertical forms
   *  does instead. */
  fallback?: 'rotate' | 'corner';
  /** The character a fallback paints instead of this one (“ → 『 in
   *  mainland text: the Hans vertical quote is the corner bracket). */
  substitute?: string;
  /** `rotate`: stretch the turned glyph along the line to fill its cell
   *  (a dash narrower than its em). */
  stretch?: boolean;
  /** `corner` fallback: where the upright glyph moves in its cell, in ems
   *  (`x` across the column, to the right; `y` along it, negative up).
   *  {@link CORNER_OFFSET_EM} when absent. */
  offset?: { x: number; y: number };
}

/** Unicode `Vertical_Orientation` (UAX #50): `U` upright, `R` rotated,
 *  `Tu` / `Tr` a vertical glyph, else upright / rotated. */
export type UaxVerticalOrientation = 'U' | 'R' | 'Tu' | 'Tr';

// VerticalOrientation-18.0.0.txt, the ranges that are not `R`, merged:
// [first, last, class] with 1 = U, 2 = Tu, 3 = Tr. Everything else is R.
const VO_RANGES: readonly number[] = [
  0xA7,0xA7,1, 0xA9,0xA9,1, 0xAE,0xAE,1, 0xB1,0xB1,1, 0xBC,0xBE,1, 0xD7,0xD7,1, 0xF7,0xF7,1, 0x2EA,0x2EB,1,
  0x1100,0x11FF,1, 0x1401,0x167F,1, 0x18B0,0x18FF,1, 0x2016,0x2016,1, 0x2018,0x2019,3, 0x201C,0x201D,3,
  0x2020,0x2021,1, 0x2030,0x2031,1, 0x203B,0x203C,1, 0x2042,0x2042,1, 0x2047,0x2049,1, 0x2051,0x2051,1,
  0x2065,0x2065,1, 0x20DD,0x20E0,1, 0x20E2,0x20E4,1, 0x2100,0x2101,1, 0x2103,0x2109,1, 0x210F,0x210F,1,
  0x2113,0x2114,1, 0x2116,0x2117,1, 0x211E,0x2123,1, 0x2125,0x2125,1, 0x2127,0x2127,1, 0x2129,0x2129,1,
  0x212E,0x212E,1, 0x2135,0x213F,1, 0x2145,0x214A,1, 0x214C,0x214D,1, 0x214F,0x2189,1, 0x218C,0x218F,1,
  0x221E,0x221E,1, 0x2234,0x2235,1, 0x2300,0x2307,1, 0x230C,0x231F,1, 0x2324,0x2328,1, 0x2329,0x232A,3,
  0x232B,0x232B,1, 0x237D,0x239A,1, 0x23BE,0x23CD,1, 0x23CF,0x23CF,1, 0x23D1,0x23DB,1, 0x23E2,0x2422,1,
  0x2424,0x24FF,1, 0x25A0,0x2619,1, 0x2620,0x2767,1, 0x2776,0x2793,1, 0x2B12,0x2B2F,1, 0x2B50,0x2B59,1,
  0x2B97,0x2B97,1, 0x2BB8,0x2BD1,1, 0x2BD3,0x2BEB,1, 0x2BF0,0x2BFF,1, 0x2E50,0x2E51,1, 0x2E80,0x3000,1,
  0x3001,0x3002,2, 0x3003,0x3007,1, 0x3008,0x3011,3, 0x3012,0x3013,1, 0x3014,0x301F,3, 0x3020,0x302F,1,
  0x3030,0x3030,3, 0x3031,0x3040,1, 0x3041,0x3041,2, 0x3042,0x3042,1, 0x3043,0x3043,2, 0x3044,0x3044,1,
  0x3045,0x3045,2, 0x3046,0x3046,1, 0x3047,0x3047,2, 0x3048,0x3048,1, 0x3049,0x3049,2, 0x304A,0x3062,1,
  0x3063,0x3063,2, 0x3064,0x3082,1, 0x3083,0x3083,2, 0x3084,0x3084,1, 0x3085,0x3085,2, 0x3086,0x3086,1,
  0x3087,0x3087,2, 0x3088,0x308D,1, 0x308E,0x308E,2, 0x308F,0x3094,1, 0x3095,0x3096,2, 0x3097,0x309A,1,
  0x309B,0x309C,2, 0x309D,0x309F,1, 0x30A0,0x30A0,3, 0x30A1,0x30A1,2, 0x30A2,0x30A2,1, 0x30A3,0x30A3,2,
  0x30A4,0x30A4,1, 0x30A5,0x30A5,2, 0x30A6,0x30A6,1, 0x30A7,0x30A7,2, 0x30A8,0x30A8,1, 0x30A9,0x30A9,2,
  0x30AA,0x30C2,1, 0x30C3,0x30C3,2, 0x30C4,0x30E2,1, 0x30E3,0x30E3,2, 0x30E4,0x30E4,1, 0x30E5,0x30E5,2,
  0x30E6,0x30E6,1, 0x30E7,0x30E7,2, 0x30E8,0x30ED,1, 0x30EE,0x30EE,2, 0x30EF,0x30F4,1, 0x30F5,0x30F6,2,
  0x30F7,0x30FB,1, 0x30FC,0x30FC,3, 0x30FD,0x3126,1, 0x3127,0x3127,2, 0x3128,0x31B3,1, 0x31B4,0x31B7,2,
  0x31B8,0x31BA,1, 0x31BB,0x31BB,2, 0x31BC,0x31EF,1, 0x31F0,0x31FF,2, 0x3200,0x32FE,1, 0x32FF,0x3357,2,
  0x3358,0x337A,1, 0x337B,0x337F,2, 0x3380,0xA4CF,1, 0xA960,0xA97F,1, 0xAC00,0xD7FF,1, 0xE000,0xFAFF,1,
  0xFE10,0xFE1F,1, 0xFE30,0xFE48,1, 0xFE50,0xFE52,2, 0xFE53,0xFE57,1, 0xFE59,0xFE5E,3, 0xFE5F,0xFE62,1,
  0xFE67,0xFE6F,1, 0xFF01,0xFF01,2, 0xFF02,0xFF07,1, 0xFF08,0xFF09,3, 0xFF0A,0xFF0B,1, 0xFF0C,0xFF0C,2,
  0xFF0E,0xFF0E,2, 0xFF0F,0xFF19,1, 0xFF1A,0xFF1B,3, 0xFF1F,0xFF1F,2, 0xFF20,0xFF3A,1, 0xFF3B,0xFF3B,3,
  0xFF3C,0xFF3C,1, 0xFF3D,0xFF3D,3, 0xFF3E,0xFF3E,1, 0xFF3F,0xFF3F,3, 0xFF40,0xFF5A,1, 0xFF5B,0xFF60,3,
  0xFFE0,0xFFE2,1, 0xFFE3,0xFFE3,3, 0xFFE4,0xFFE7,1, 0xFFF0,0xFFF8,1, 0xFFFC,0xFFFD,1, 0x10980,0x1099F,1,
  0x11580,0x115FF,1, 0x11A00,0x11ABF,1, 0x13000,0x1467F,1, 0x16FE0,0x191DF,1, 0x1AFF0,0x1B131,1,
  0x1B132,0x1B132,2, 0x1B133,0x1B14F,1, 0x1B150,0x1B152,2, 0x1B153,0x1B154,1, 0x1B155,0x1B155,2,
  0x1B156,0x1B163,1, 0x1B164,0x1B168,2, 0x1B169,0x1B2FF,1, 0x1CEC0,0x1CEDC,1, 0x1CEE0,0x1CEF0,1,
  0x1CEFE,0x1CFCF,1, 0x1D000,0x1D1FF,1, 0x1D250,0x1D281,1, 0x1D2E0,0x1D37F,1, 0x1D800,0x1DAAF,1,
  0x1F000,0x1F1FF,1, 0x1F200,0x1F201,2, 0x1F202,0x1F7FF,1, 0x1F900,0x1FAFF,1, 0x20000,0x2FFFD,1,
  0x30000,0x3FFFD,1, 0xF0000,0xFFFFD,1, 0x100000,0x10FFFD,1
];
const VO_CLASS: readonly UaxVerticalOrientation[] = ['R', 'U', 'Tu', 'Tr'];

/** A code point's Unicode `Vertical_Orientation`. */
export function uaxVerticalOrientation(cp: number): UaxVerticalOrientation {
  let lo = 0;
  let hi = VO_RANGES.length / 3 - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const first = VO_RANGES[mid * 3]!;
    if (cp < first) hi = mid - 1;
    else if (cp > VO_RANGES[mid * 3 + 1]!) lo = mid + 1;
    else return VO_CLASS[VO_RANGES[mid * 3 + 2]!]!;
  }
  return 'R';
}

/** Pause and stop marks (标点 of GB/T 15834 §5.2.1): never turned. The
 *  first group sits in the top-right corner of a mainland cell, the second
 *  in the right half, a little above the middle. */
const CORNER_MARKS = new Set(['、', '。', '，', '．', '﹐', '﹑', '﹒']);
const EXCLAIM_MARKS = new Set(['！', '？', '﹖', '﹗']);
const COLON_MARKS = new Set(['：', '；', '﹔', '﹕']);

/** Marks turned about their em box in every Chinese region: dashes,
 *  ellipses, the interpunct, connectors and the wave dash. */
const TURNED = new Set([
  '—', '―', '⸺', '⸻', // — ― ⸺ ⸻
  '…', '‥', '⋯', // … ‥ ⋯
  '·', '‧', // · ‧
  '–', // –
  '～', '〜', '〰', // ～ 〜 〰
  '－', // －
]);

/** Dashes stretched to their cell when turned. (The Latin hyphens ‐ ‑ ‒
 *  are Unicode's `R`: sideways with the word they join.) */
const STRETCHED = new Set(['—', '―', '⸺', '⸻', '–', '－']);

const TURNED_RE = new RegExp(`[${[...TURNED].join('')}]`);
const STRETCHED_RE = new RegExp(`[${[...STRETCHED].join('')}]`, 'g');

/** Whether `text` holds a mark a vertical line turns in a cell of its own
 *  (`rotate`: a dash, an ellipsis, an interpunct, a wave dash), which a
 *  browser setting the text vertically advances by its horizontal width. */
export function holdsTurnedMark(text: string): boolean {
  return TURNED_RE.test(text);
}

/** The dashes of `text` a vertical line stretches to fill their cell
 *  (`VerticalGlyph.stretch`), each once. */
export function stretchedDashesOf(text: string): string[] {
  const found = text.match(STRETCHED_RE);
  return found ? [...new Set(found)] : [];
}

/** Mainland vertical quotes: the corner brackets (UAX #50 §3.2.4). */
const HANS_QUOTES: Record<string, string> = {
  '“': '『', // “ → 『
  '”': '』', // ” → 』
  '‘': '「', // ‘ → 「
  '’': '」', // ’ → 」
};

const UPRIGHT: VerticalGlyph = { orient: 'upright' };
const SIDEWAYS: VerticalGlyph = { orient: 'sideways' };
const ROTATE: VerticalGlyph = { orient: 'rotate' };
const ROTATE_STRETCH: VerticalGlyph = { orient: 'rotate', stretch: true };
const ALT_ROTATE: VerticalGlyph = { orient: 'alternate', fallback: 'rotate' };
const ALT_CORNER: VerticalGlyph = { orient: 'alternate', fallback: 'corner' };
const ALT_EXCLAIM: VerticalGlyph = { orient: 'alternate', fallback: 'corner', offset: { x: 0.5, y: -0.08 } };
const ALT_COLON: VerticalGlyph = { orient: 'alternate', fallback: 'corner', offset: { x: 0.52, y: -0.22 } };
const TCY: VerticalGlyph = { orient: 'tcy' };

/**
 * How a grapheme is set in a vertical line of `region`'s Chinese (see the
 * module comment). Reads the grapheme's first code point; a sequence with
 * a combining mark or a variation selector follows its base.
 */
export function verticalOrientation(grapheme: string, region: CjkRegion = 'mainland'): VerticalGlyph {
  const cp = grapheme.codePointAt(0);
  if (cp === undefined) return SIDEWAYS;
  if (cp < 0x80) return SIDEWAYS;
  const ch = String.fromCodePoint(cp);
  if (CORNER_MARKS.has(ch)) return region === 'mainland' ? ALT_CORNER : UPRIGHT;
  if (EXCLAIM_MARKS.has(ch)) return region === 'mainland' ? ALT_EXCLAIM : UPRIGHT;
  if (COLON_MARKS.has(ch)) return region === 'mainland' ? ALT_COLON : UPRIGHT;
  if (TURNED.has(ch)) return STRETCHED.has(ch) ? ROTATE_STRETCH : ROTATE;
  const hans = HANS_QUOTES[ch];
  if (hans !== undefined) return region === 'mainland' ? { orient: 'alternate', fallback: 'rotate', substitute: hans } : ALT_ROTATE;
  switch (uaxVerticalOrientation(cp)) {
    case 'U': return UPRIGHT;
    case 'Tu': return UPRIGHT; // small kana and the like: upright, the vertical form when the font has one
    case 'Tr': return ALT_ROTATE;
    default: return SIDEWAYS;
  }
}

/** Whether a grapheme stands in a cell of its own in vertical text (every
 *  orientation but `sideways`). */
export function isVerticalCell(grapheme: string, region: CjkRegion = 'mainland'): boolean {
  return verticalOrientation(grapheme, region).orient !== 'sideways';
}

/** Where a mainland 、。，． moves when the font gives no vertical form, in
 *  ems of the cell: right and up (a horizontal 。 sits in the bottom-left
 *  quadrant, the vertical one in the top-right). Measured against the
 *  `vert` glyphs of Noto Serif SC: within 0.07 em for 、。，．. ！？ and ：；
 *  carry their own `offset` (half an em to the right, 0.08 and 0.22 em up),
 *  within 0.02 em of the font's. */
export const CORNER_OFFSET_EM = { x: 0.6, y: -0.62 };

/** The size of a character's cell in a vertical line, in ems: half an em
 *  for the mainland interpunct (· ・, clreq §5.1), one em for
 *  every other character that stands in a cell. `cls`, when the caller has
 *  it, is the grapheme's `cjkClassOf`. */
export function verticalCellEms(grapheme: string, region: CjkRegion = 'mainland', cls = cjkClassOf(grapheme)): number {
  return region === 'mainland' && cls === 'interpunct' ? 0.5 : 1;
}

/** One run of a vertical line: consecutive graphemes set alike. A
 *  `sideways` run holds a whole Latin word or number; every other run is
 *  one grapheme in a cell `cell` ems long. */
export interface VerticalRun {
  text: string;
  glyph: VerticalGlyph;
  /** The cell's length along the line, in ems (not on a sideways run). */
  cell?: number;
}

/** The numbers up to how many ASCII digits are set side by side in one
 *  upright cell (tate-chu-yoko) in vertical text: `cjk.uprightDigits`, 0
 *  (none), 2 (the default), 3 or 4. */
export type UprightDigits = 0 | 2 | 3 | 4;

const isAsciiDigit = (g: string | undefined): boolean => g !== undefined && g.length === 1 && g >= '0' && g <= '9';
const isAsciiLetter = (g: string | undefined): boolean => g !== undefined && g.length === 1 && /[A-Za-z]/.test(g);
const isGroupMark = (g: string | undefined): boolean => g === '.' || g === ',';

/**
 * Where the automatic tate-chu-yoko cells of `graphemes` start, with their
 * length: every run of at most `digits` ASCII digits, whole (a longer run is
 * set sideways, never split), that is not part of a word (no Latin letter
 * touches it: `A4`, `mp3`, `3D` stay sideways) nor of a number with digit
 * grouping or a decimal point (`10,000`, `3.14`: a `,` or `.` between it and
 * another digit). Empty when `digits` is 0.
 */
export function uprightDigitRuns(graphemes: readonly string[], digits: number): Map<number, number> {
  const out = new Map<number, number>();
  if (!(digits > 0)) return out;
  for (let i = 0; i < graphemes.length; i++) {
    if (!isAsciiDigit(graphemes[i])) continue;
    let j = i;
    while (isAsciiDigit(graphemes[j + 1])) j++;
    const before = graphemes[i - 1];
    const after = graphemes[j + 1];
    const grouped = (isGroupMark(before) && isAsciiDigit(graphemes[i - 2])) || (isGroupMark(after) && isAsciiDigit(graphemes[j + 2]));
    if (j - i + 1 <= digits && !isAsciiLetter(before) && !isAsciiLetter(after) && !grouped) out.set(i, j - i + 1);
    i = j;
  }
  return out;
}

/** Cut `text` into the runs a vertical line paints and measures: sideways
 *  graphemes joined into runs, every other grapheme a cell of its own. An
 *  apostrophe or interpunct between two letters of a Latin word runs
 *  sideways with it (see `isWordInnerMark`), as the composer measures it.
 *  With `uprightDigits` (`cjk.uprightDigits`), each short number
 *  ({@link uprightDigitRuns}) is one `tcy` cell. */
export function verticalRuns(graphemes: readonly string[], region: CjkRegion = 'mainland', uprightDigits = 0): VerticalRun[] {
  const out: VerticalRun[] = [];
  const tcy = uprightDigitRuns(graphemes, uprightDigits);
  let side = '';
  for (let i = 0; i < graphemes.length; i++) {
    const g = graphemes[i]!;
    const combined = tcy.get(i);
    if (combined !== undefined) {
      if (side) {
        out.push({ text: side, glyph: SIDEWAYS });
        side = '';
      }
      out.push({ text: graphemes.slice(i, i + combined).join(''), glyph: TCY, cell: 1 });
      i += combined - 1;
      continue;
    }
    const glyph = isWordInnerMark(g, graphemes[i - 1], graphemes[i + 1]) ? SIDEWAYS : verticalOrientation(g, region);
    if (glyph.orient === 'sideways') {
      side += g;
      continue;
    }
    if (side) {
      out.push({ text: side, glyph: SIDEWAYS });
      side = '';
    }
    out.push({ text: g, glyph, cell: verticalCellEms(g, region) });
  }
  if (side) out.push({ text: side, glyph: SIDEWAYS });
  return out;
}

/** How the author set a run of vertical text apart (`VDTLineSegment.tcy`,
 *  `VDTLineSegment.orientation`): `'tcy'` (`:tcy[…]`), one upright cell;
 *  `'upright'` (`:upright[…]`), every character upright in a cell of its
 *  own; `'sideways'` (`:sideways[…]`), the whole run turned. */
export type ForcedOrientation = 'tcy' | 'upright' | 'sideways';

/** The runs of a text whose orientation the author forced (see
 *  {@link ForcedOrientation}): one `tcy` cell, one upright cell per
 *  grapheme, or one sideways run. */
export function forcedVerticalRuns(graphemes: readonly string[], orient: ForcedOrientation): VerticalRun[] {
  if (graphemes.length === 0) return [];
  if (orient === 'tcy') return [{ text: graphemes.join(''), glyph: TCY, cell: 1 }];
  if (orient === 'sideways') return [{ text: graphemes.join(''), glyph: SIDEWAYS }];
  return graphemes.map((g) => ({ text: g, glyph: UPRIGHT, cell: 1 }));
}

/** The orientation a segment's author forced, if any. */
export function segmentOrientation(seg: { tcy?: boolean; orientation?: 'upright' | 'sideways' }): ForcedOrientation | undefined {
  return seg.tcy ? 'tcy' : seg.orientation;
}

/** Whether `text` holds a character that stands in a cell of its own in
 *  vertical text (see {@link verticalRuns}), a short number included when
 *  `uprightDigits` sets it in a cell (the measurer passes the document's
 *  `cjk.uprightDigits`, as the painters do). ASCII letters never do. */
export function holdsVerticalCell(text: string, uprightDigits: number): boolean {
  if (uprightDigits > 0 && /[0-9]/.test(text) && uprightDigitRuns([...text], uprightDigits).size > 0) return true;
  // eslint-disable-next-line no-control-regex
  if (!/[^\u0000-\u007F]/.test(text)) return false;
  for (const ch of text) {
    if (ch.charCodeAt(0) < 0x80) continue;
    if (verticalOrientation(ch).orient !== 'sideways') return true;
  }
  return false;
}
