// Character data of the bidi algorithm: Bidi_Class codes and lookup,
// mirrored glyphs and paired brackets.
import { BIDI_CLASS_RANGES, MIRROR_PAIRS, BRACKET_PAIRS } from '../bidiData.js';

/** A Unicode `Bidi_Class` (UAX #9 table 4). */
export type BidiClass =
  | 'L' | 'R' | 'AL' | 'EN' | 'ES' | 'ET' | 'AN' | 'CS' | 'NSM' | 'BN' | 'B' | 'S' | 'WS' | 'ON'
  | 'LRE' | 'LRO' | 'RLE' | 'RLO' | 'PDF' | 'LRI' | 'RLI' | 'FSI' | 'PDI';

/** Every `Bidi_Class`, by its code in the data tables. */
export const BIDI_CLASS_NAMES: readonly BidiClass[] = Object.freeze([
  'L', 'R', 'AL', 'EN', 'ES', 'ET', 'AN', 'CS', 'NSM', 'BN', 'B', 'S', 'WS', 'ON',
  'LRE', 'LRO', 'RLE', 'RLO', 'PDF', 'LRI', 'RLI', 'FSI', 'PDI',
] as const);

// The class codes (indices into BIDI_CLASS_NAMES).
export const L = 0, R = 1, AL = 2, EN = 3, ES = 4, ET = 5, AN = 6, CS = 7, NSM = 8, BN = 9, B = 10, S = 11, WS = 12, ON = 13;
export const LRE = 14, LRO = 15, RLE = 16, RLO = 17, PDF = 18, LRI = 19, RLI = 20, FSI = 21, PDI = 22;
/** Internal: the second unit of a surrogate pair. Removed like `BN`, and
 *  always given its first unit's level. */
export const TAIL = 23;

/** The deepest embedding level (UAX #9 BD2). */
export const MAX_DEPTH = 125;

// ---------------------------------------------------------------------------
// Character data

/** Bidi classes of the BMP, one byte per code point, built on first use. */
let bmpClasses: Uint8Array | null = null;

function buildBmpClasses(): Uint8Array {
  const table = new Uint8Array(0x10000);
  for (let i = 0; i < BIDI_CLASS_RANGES.length; i += 3) {
    const first = BIDI_CLASS_RANGES[i]!;
    if (first > 0xFFFF) break;
    table.fill(BIDI_CLASS_RANGES[i + 2]!, first, Math.min(BIDI_CLASS_RANGES[i + 1]!, 0xFFFF) + 1);
  }
  bmpClasses = table;
  return table;
}

/** The value of `[first, last, value]` triples holding `cp`, else `def`. */
export function rangeLookup(ranges: readonly number[], cp: number, def: number): number {
  let lo = 0;
  let hi = ranges.length / 3 - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cp < ranges[mid * 3]!) hi = mid - 1;
    else if (cp > ranges[mid * 3 + 1]!) lo = mid + 1;
    else return ranges[mid * 3 + 2]!;
  }
  return def;
}

/** A code point's `Bidi_Class` as its numeric code (an index into
 *  {@link BIDI_CLASS_NAMES}). */
export function classCode(cp: number): number {
  if (cp < 0x10000) return (bmpClasses ?? buildBmpClasses())[cp]!;
  return rangeLookup(BIDI_CLASS_RANGES, cp, L);
}

/** A code point's Unicode `Bidi_Class`. */
export function bidiClassOf(cp: number): BidiClass {
  return BIDI_CLASS_NAMES[classCode(cp)]!;
}

/** Whether a code point is a right-to-left letter (`Bidi_Class` `R` or
 *  `AL`): Hebrew, Arabic, Syriac, Thaana, N'Ko, Adlam and the other
 *  scripts written from right to left. Digits, punctuation and marks are
 *  not, whatever text they sit in. */
export function isRtlScriptChar(cp: number): boolean {
  const c = classCode(cp);
  return c === R || c === AL;
}

/**
 * Whether a paragraph needs the bidi algorithm at all: it holds a
 * right-to-left letter or a control that opens a right-to-left embedding,
 * override or isolate. Text without one, in a left-to-right paragraph,
 * resolves to even levels throughout and paints in logical order, so the
 * layout can skip the algorithm (and stays exactly as it was). Arabic-Indic
 * digits alone do not count: they run left to right.
 */
export function needsBidi(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const u = text.charCodeAt(i);
    // Nothing below the Hebrew block is right to left.
    if (u < 0x0590) continue;
    let cp = u;
    if (u >= 0xD800 && u <= 0xDBFF && i + 1 < text.length) {
      const lo = text.charCodeAt(i + 1);
      if (lo >= 0xDC00 && lo <= 0xDFFF) {
        cp = ((u - 0xD800) << 10) + (lo - 0xDC00) + 0x10000;
        i++;
      }
    }
    const c = classCode(cp);
    if (c === R || c === AL || c === RLE || c === RLO || c === RLI) return true;
  }
  return false;
}

let mirrors: Map<number, number> | null = null;

/**
 * The mirrored form of a character (`Bidi_Mirroring_Glyph`, rule L4): `)`
 * for `(`, `»` for `«`, `≥` for `≤`. A renderer paints it in place of the
 * character when the character's resolved level is odd and the font does
 * not mirror it itself (OpenType `rtlm`). A character without a mirror is
 * returned unchanged, as is anything longer than one code point.
 *
 * The ornate parentheses of Quranic text, U+FD3E ﴾ and U+FD3F ﴿, have no
 * mirror and are not paired brackets: Unicode 14 gave them their present
 * general categories (FD3F opens, FD3E closes, as they are written in
 * Arabic) and keeps them out of `BidiMirroring.txt` and `BidiBrackets.txt`
 * on purpose, so they always paint as they are encoded.
 */
export function mirroredChar(ch: string): string {
  const cp = ch.codePointAt(0);
  if (cp === undefined || ch.length > (cp > 0xFFFF ? 2 : 1)) return ch;
  const m = mirroredCodePoint(cp);
  return m === cp ? ch : String.fromCodePoint(m);
}

/** The mirrored form of a code point (see {@link mirroredChar}), or the
 *  code point itself when it has none. */
export function mirroredCodePoint(cp: number): number {
  if (!mirrors) {
    mirrors = new Map();
    for (let i = 0; i < MIRROR_PAIRS.length; i += 2) mirrors.set(MIRROR_PAIRS[i]!, MIRROR_PAIRS[i + 1]!);
  }
  return mirrors.get(cp) ?? cp;
}

/** Paired brackets (`Bidi_Paired_Bracket`): opening bracket → its closing
 *  bracket, and the reverse; built on first use. */
export let bracketOpen: Map<number, number> | null = null;
export let bracketClose: Map<number, number> | null = null;

export function bracketTables(): void {
  bracketOpen = new Map();
  bracketClose = new Map();
  for (let i = 0; i < BRACKET_PAIRS.length; i += 2) {
    bracketOpen.set(BRACKET_PAIRS[i]!, BRACKET_PAIRS[i + 1]!);
    bracketClose.set(BRACKET_PAIRS[i + 1]!, BRACKET_PAIRS[i]!);
  }
}

/** A bracket as rule BD16 compares it: the angle brackets U+2329/U+232A are
 *  canonically equivalent to U+3008/U+3009, so either closes the other. */
export function canonicalBracket(cp: number): number {
  return cp === 0x2329 ? 0x3008 : cp === 0x232A ? 0x3009 : cp;
}

export const isIsolateInitiator = (c: number): boolean => c === LRI || c === RLI || c === FSI;
/** Removed by rule X9 (kept in the text, given a neighbour's level). */
export const isRemoved = (c: number): boolean => c === BN || c === TAIL || (c >= LRE && c <= PDF);
