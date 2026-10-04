/**
 * A minimal bidi run splitter for text whose VDT carries no direction
 * (issue #380).
 *
 * The engine resolves bidi levels itself and hands renderers segments that
 * are each one run (`VDTLineSegment.rtl`, `VDTLine.order`). Text drawn
 * without that — a VDT from before the engine did it, a running head, a
 * caption line — still has to be cut into runs before HarfBuzz shapes it,
 * or the digits and Latin words inside an Arabic phrase come out backwards.
 * This is the part of UAX #9 a single line of such text needs: character
 * types from the Unicode general category and script blocks, the weak-type
 * rules W1–W7, the neutral rules N1–N2, implicit levels I1–I2, trailing
 * white space (L1) and run reordering (L2). Explicit embeddings, overrides
 * and isolates are read as neutrals.
 *
 * TODO(#367): use the engine's `bidi.ts` (full UAX #9, isolates, the
 * mirroring table) once it ships; this file then goes.
 */

/** A run of one embedding level, as a range of UTF-16 offsets. */
export interface BidiRun {
  start: number;
  end: number;
  level: number;
  rtl: boolean;
}

type BidiType = 'L' | 'R' | 'AL' | 'EN' | 'AN' | 'ES' | 'ET' | 'CS' | 'NSM' | 'WS' | 'ON';

const MARK = /\p{M}/u;
const LETTER = /[\p{L}\p{Nl}]/u;
const DIGIT = /\p{Nd}/u;
const CURRENCY = /\p{Sc}/u;
const SPACE = /\s/u;

/** The bidi type of a code point, as far as this splitter tells them. */
function bidiType(ch: string): BidiType {
  const cp = ch.codePointAt(0)!;
  if (cp >= 0x30 && cp <= 0x39) return 'EN';
  if (cp === 0x2b || cp === 0x2d || cp === 0x2212) return 'ES';
  if (cp === 0x2c || cp === 0x2e || cp === 0x3a || cp === 0x2f || cp === 0xa0 || cp === 0x060c || cp === 0x202f) return 'CS';
  if (cp === 0x23 || cp === 0x25 || cp === 0xb0 || cp === 0x2030 || cp === 0x066a || CURRENCY.test(ch)) return 'ET';
  if ((cp >= 0x0660 && cp <= 0x0669) || cp === 0x066b || cp === 0x066c || (cp >= 0x0600 && cp <= 0x0605) || cp === 0x06dd || cp === 0x08e2) return 'AN';
  if (cp >= 0x06f0 && cp <= 0x06f9) return 'EN';
  if (MARK.test(ch)) return 'NSM';
  if (SPACE.test(ch)) return 'WS';
  // Arabic-letter blocks (AL): Arabic, Syriac, Arabic Supplement, Thaana,
  // the Arabic extensions, the presentation forms, Hanifi Rohingya,
  // Sogdian and the Arabic mathematical letters.
  if ((cp >= 0x0600 && cp <= 0x07bf) || (cp >= 0x0860 && cp <= 0x08ff) || (cp >= 0xfb50 && cp <= 0xfdff) || (cp >= 0xfe70 && cp <= 0xfefe)
    || (cp >= 0x10d00 && cp <= 0x10d3f) || (cp >= 0x10f30 && cp <= 0x10f6f) || (cp >= 0x1ec70 && cp <= 0x1eeff)) {
    return LETTER.test(ch) || DIGIT.test(ch) || cp === 0x0640 ? 'AL' : 'ON';
  }
  // The other right-to-left blocks (R): Hebrew, N'Ko, Samaritan, Mandaic,
  // the Hebrew presentation forms and the supplementary-plane blocks.
  if ((cp >= 0x0590 && cp <= 0x05ff) || (cp >= 0x07c0 && cp <= 0x085f) || (cp >= 0xfb1d && cp <= 0xfb4f)
    || (cp >= 0x10800 && cp <= 0x10fff) || (cp >= 0x1e800 && cp <= 0x1efff)) {
    return LETTER.test(ch) || DIGIT.test(ch) ? 'R' : 'ON';
  }
  return LETTER.test(ch) || DIGIT.test(ch) ? 'L' : 'ON';
}

/** The paragraph direction of `text` by its first strong letter (P2–P3):
 *  undefined when it has none. */
export function firstStrongDirection(text: string): 'ltr' | 'rtl' | undefined {
  for (const ch of text) {
    const t = bidiType(ch);
    if (t === 'L') return 'ltr';
    if (t === 'R' || t === 'AL') return 'rtl';
  }
  return undefined;
}

/**
 * The embedding level of each UTF-16 unit of `text` (both halves of a
 * surrogate pair take the character's). `base` is the paragraph
 * direction; by default the first strong letter's, else left to right.
 */
export function bidiLevels(text: string, base?: 'ltr' | 'rtl'): number[] {
  const chars: string[] = [];
  const offsets: number[] = [];
  for (let i = 0; i < text.length;) {
    const cp = text.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    chars.push(ch);
    offsets.push(i);
    i += ch.length;
  }
  offsets.push(text.length);
  const n = chars.length;
  const dir = base ?? firstStrongDirection(text) ?? 'ltr';
  const baseLevel = dir === 'rtl' ? 1 : 0;
  const sor: BidiType = baseLevel ? 'R' : 'L';
  const original = chars.map(bidiType);
  const types = original.slice();

  // W1: a mark takes the type of what it follows.
  for (let i = 0; i < n; i++) if (types[i] === 'NSM') types[i] = i === 0 ? sor : types[i - 1]!;
  // W2: European digits after an Arabic letter are Arabic numbers.
  let lastStrong: BidiType = sor;
  for (let i = 0; i < n; i++) {
    const t = types[i]!;
    if (t === 'L' || t === 'R' || t === 'AL') lastStrong = t;
    else if (t === 'EN' && lastStrong === 'AL') types[i] = 'AN';
  }
  // W3: Arabic letters are right to left.
  for (let i = 0; i < n; i++) if (types[i] === 'AL') types[i] = 'R';
  // W4: one separator between two numbers of a kind joins them.
  for (let i = 1; i < n - 1; i++) {
    const t = types[i]!;
    const prev = types[i - 1]!;
    const next = types[i + 1]!;
    if (t === 'ES' && prev === 'EN' && next === 'EN') types[i] = 'EN';
    else if (t === 'CS' && prev === next && (prev === 'EN' || prev === 'AN')) types[i] = prev;
  }
  // W5: terminators (%, °, currency) next to European digits join them.
  for (let i = 0; i < n; i++) {
    if (types[i] !== 'ET') continue;
    let j = i;
    while (j < n && types[j] === 'ET') j++;
    if ((i > 0 && types[i - 1] === 'EN') || (j < n && types[j] === 'EN')) for (let k = i; k < j; k++) types[k] = 'EN';
    i = j - 1;
  }
  // W6: the separators and terminators left are neutral.
  for (let i = 0; i < n; i++) {
    const t = types[i]!;
    if (t === 'ES' || t === 'ET' || t === 'CS') types[i] = 'ON';
  }
  // W7: European digits after a left-to-right letter are left to right.
  lastStrong = sor;
  for (let i = 0; i < n; i++) {
    const t = types[i]!;
    if (t === 'L' || t === 'R') lastStrong = t;
    else if (t === 'EN' && lastStrong === 'L') types[i] = 'L';
  }
  // N1–N2: a run of neutrals between two of the same direction (numbers
  // count as right to left) takes it, any other the paragraph's.
  const strongOf = (t: BidiType): 'L' | 'R' | undefined => (t === 'L' ? 'L' : t === 'R' || t === 'EN' || t === 'AN' ? 'R' : undefined);
  for (let i = 0; i < n; i++) {
    if (strongOf(types[i]!) !== undefined) continue;
    let j = i;
    while (j < n && strongOf(types[j]!) === undefined) j++;
    const before = i > 0 ? strongOf(types[i - 1]!)! : sor;
    const after = j < n ? strongOf(types[j]!)! : sor;
    const resolved: BidiType = before === after ? before : sor;
    for (let k = i; k < j; k++) types[k] = resolved;
    i = j - 1;
  }
  // I1–I2: implicit levels.
  const levels = types.map((t) => {
    if (baseLevel === 0) return t === 'R' ? 1 : t === 'AN' || t === 'EN' ? 2 : 0;
    return t === 'L' || t === 'EN' || t === 'AN' ? 2 : 1;
  });
  // L1: white space at the end of the line takes the paragraph level.
  for (let i = n - 1; i >= 0 && original[i] === 'WS'; i--) levels[i] = baseLevel;
  const out: number[] = new Array(text.length);
  for (let i = 0; i < n; i++) for (let u = offsets[i]!; u < offsets[i + 1]!; u++) out[u] = levels[i]!;
  return out;
}

/**
 * `text` cut into runs of one level, in visual order (left to right).
 * `base` as in {@link bidiLevels}. Offsets are UTF-16; a surrogate pair
 * stays whole.
 */
export function bidiRuns(text: string, base?: 'ltr' | 'rtl'): BidiRun[] {
  if (!text) return [];
  const levels = bidiLevels(text, base);
  // Runs of one level, in logical order.
  const runs: BidiRun[] = [];
  for (let i = 0; i < levels.length;) {
    let j = i + 1;
    while (j < levels.length && levels[j] === levels[i]) j++;
    runs.push({ start: i, end: j, level: levels[i]!, rtl: levels[i]! % 2 === 1 });
    i = j;
  }
  return visualOrder(runs.map((r) => r.level)).map((i) => runs[i]!);
}

/** The visual order (left to right) of items at `levels`, given in logical
 *  order (UAX #9 L2): from the highest level down to the lowest odd one,
 *  every sequence at that level or above is reversed. */
export function visualOrder(levels: readonly number[]): number[] {
  const order = levels.map((_, i) => i);
  if (levels.length === 0) return order;
  const highest = Math.max(...levels);
  const lowestOdd = Math.min(...levels.map((l) => (l % 2 === 1 ? l : l + 1)));
  for (let level = highest; level >= lowestOdd; level--) {
    for (let i = 0; i < order.length;) {
      if (levels[order[i]!]! < level) {
        i++;
        continue;
      }
      let j = i;
      while (j < order.length && levels[order[j]!]! >= level) j++;
      order.splice(i, j - i, ...order.slice(i, j).reverse());
      i = j;
    }
  }
  return order;
}
