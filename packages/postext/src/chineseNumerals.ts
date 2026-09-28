/**
 * Chinese numerals, written and read: the CSS Counter Styles 3 longhand
 * (`simp-chinese-informal` 一百二十, `trad-chinese-formal` 壹佰貳拾), the
 * digit-by-digit `cjk-decimal` (二〇二六), the heavenly stems and earthly
 * branches, circled and fullwidth digits — and the reverse, for part numbers
 * an author typed (`卷三`, `第十二`, `一二〇`).
 */

const INFORMAL_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const SIMP_FORMAL_DIGITS = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
const TRAD_FORMAL_DIGITS = ['零', '壹', '貳', '參', '肆', '伍', '陸', '柒', '捌', '玖'];
/** 十 百 千 (informal) and 拾 佰 仟 (formal), for the tens, hundreds and
 *  thousands of a four-digit group. */
const INFORMAL_MARKERS = ['', '十', '百', '千'];
const FORMAL_MARKERS = ['', '拾', '佰', '仟'];
/** The units of the four-digit groups: 10⁴, 10⁸ and 10¹². Mainland usage
 *  writes 10¹² 万亿, Taiwan 兆. */
const SIMP_GROUP_UNITS = ['', '万', '亿', '万亿'];
const TRAD_GROUP_UNITS = ['', '萬', '億', '兆'];
/** Past this the numerals print in digits. */
const MAX_CHINESE = 10 ** 16 - 1;

/** One group of up to four digits (1–9999): each digit with its marker, a
 *  zero inside the group written 零 once, zeros at the end dropped. */
function groupText(g: number, digits: readonly string[], markers: readonly string[]): string {
  let out = '';
  let zero = false;
  for (let pos = 3; pos >= 0; pos--) {
    const d = Math.floor(g / 10 ** pos) % 10;
    if (d === 0) {
      if (out.length > 0) zero = true;
      continue;
    }
    if (zero) {
      out += digits[0];
      zero = false;
    }
    out += digits[d]! + markers[pos]!;
  }
  return out;
}

/**
 * `n` (a positive integer) in Chinese numerals, as CSS Counter Styles 3
 * writes the Chinese longhand, extended past 9 999 with the group units
 * 万/萬, 亿/億: each digit followed by its marker (十 百 千, formal 拾 佰 仟),
 * the marker dropped after a zero, a run of zeros written 零 once, zeros at
 * the end dropped; in the informal style 10–19 open with 十, not 一十
 * (十二, but 一百一十). 101 一百零一, 1010 一千零一十, 10010 一万零一十.
 * Past 10¹⁶ − 1 the number prints in digits.
 */
export function chineseNumeral(n: number, kind: 'informal' | 'formal', traditional: boolean): string {
  if (!Number.isSafeInteger(n) || n < 1 || n > MAX_CHINESE) return String(n);
  const digits = kind === 'formal' ? (traditional ? TRAD_FORMAL_DIGITS : SIMP_FORMAL_DIGITS) : INFORMAL_DIGITS;
  const markers = kind === 'formal' ? FORMAL_MARKERS : INFORMAL_MARKERS;
  const units = traditional ? TRAD_GROUP_UNITS : SIMP_GROUP_UNITS;
  const groups: number[] = [];
  for (let x = n; x > 0; x = Math.floor(x / 10_000)) groups.push(x % 10_000);
  let out = '';
  let zero = false;
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i]!;
    if (g === 0) {
      if (out.length > 0) zero = true;
      continue;
    }
    // A group after a higher one that does not fill its thousands starts
    // with 零: 一万零一十 (10 010), 一亿零一万 (100 010 000).
    if (out.length > 0 && (zero || g < 1000)) out += digits[0];
    zero = false;
    let text = groupText(g, digits, markers);
    // 十, 十二 for 10–19 at the head of the number (十万 for 100 000).
    if (kind === 'informal' && out.length === 0 && g >= 10 && g <= 19) text = text.slice(1);
    out += text + units[i]!;
  }
  return out;
}

const CJK_DECIMAL_DIGITS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/** Digit by digit in Chinese numerals, with 〇 for zero: 2026 → 二〇二六
 *  (GB/T 15835—2011 §5.2.5, as years and serial numbers are written). */
export function cjkDecimal(n: number): string {
  return String(n).replace(/\d/g, (d) => CJK_DECIMAL_DIGITS[Number(d)]!);
}

/** Fullwidth digits: 123 → １２３. */
export function fullwidthDecimal(n: number): string {
  return String(n).replace(/\d/g, (d) => String.fromCharCode(0xff10 + Number(d)));
}

/** Circled digits ① … ㊿ (U+2460–2473, U+3251–325F, U+32B1–32BF), ⓪ for
 *  zero; past 50 the number prints in digits. */
export function circledDecimal(n: number): string {
  if (n === 0) return '⓪';
  if (!Number.isInteger(n) || n < 0 || n > 50) return String(n);
  if (n <= 20) return String.fromCharCode(0x2460 + n - 1);
  if (n <= 35) return String.fromCharCode(0x3251 + n - 21);
  return String.fromCharCode(0x32b1 + n - 36);
}

/** The ten heavenly stems, 甲 to 癸. */
export const CJK_HEAVENLY_STEMS: readonly string[] = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
/** The twelve earthly branches, 子 to 亥. */
export const CJK_EARTHLY_BRANCHES: readonly string[] = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

/** The `n`th symbol of a fixed series (1-based); past its end the number
 *  prints in digits. */
export function fixedSymbol(n: number, symbols: readonly string[]): string {
  return Number.isInteger(n) && n >= 1 && n <= symbols.length ? symbols[n - 1]! : String(n);
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** Value of each digit character, informal and formal, both scripts. */
const DIGIT_VALUES: ReadonlyMap<string, number> = new Map([
  ['〇', 0], ['零', 0], ['○', 0],
  ['一', 1], ['壹', 1],
  ['二', 2], ['贰', 2], ['貳', 2], ['两', 2], ['兩', 2],
  ['三', 3], ['叁', 3], ['參', 3],
  ['四', 4], ['肆', 4],
  ['五', 5], ['伍', 5],
  ['六', 6], ['陆', 6], ['陸', 6],
  ['七', 7], ['柒', 7],
  ['八', 8], ['捌', 8],
  ['九', 9], ['玖', 9],
]);
const SMALL_MARKERS: ReadonlyMap<string, number> = new Map([
  ['十', 10], ['拾', 10], ['百', 100], ['佰', 100], ['千', 1000], ['仟', 1000],
]);

/** Value of a group below 10 000 written with markers (十二, 一百零一,
 *  壹佰贰拾); `undefined` when it is not one. */
function readGroup(s: string): number | undefined {
  let total = 0;
  let digit: number | undefined;
  let lastMarker = 10_000;
  for (const ch of s) {
    const d = DIGIT_VALUES.get(ch);
    if (d !== undefined) {
      if (digit !== undefined && digit !== 0 && d !== 0) return undefined;
      digit = d;
      continue;
    }
    const m = SMALL_MARKERS.get(ch);
    if (m === undefined || m >= lastMarker) return undefined;
    total += (digit ?? 1) * m;
    digit = undefined;
    lastMarker = m;
  }
  return total + (digit ?? 0);
}

/** Value of a number written with the group units 万/萬, 亿/億, 兆
 *  (一万零一十, 十二万, 一亿二千万). */
function readWithUnits(s: string): number | undefined {
  for (const [units, value] of [[['兆'], 1e12], [['亿', '億'], 1e8], [['万', '萬'], 1e4]] as const) {
    const at = Math.max(...units.map((u) => s.indexOf(u)));
    if (at < 0) continue;
    const head = s.slice(0, at);
    const tail = s.slice(at + 1);
    const high = head.length === 0 ? 1 : readWithUnits(head);
    const low = tail.length === 0 ? 0 : readWithUnits(tail);
    return high === undefined || low === undefined ? undefined : high * value + low;
  }
  return readGroup(s);
}

/**
 * The value of a number written in Chinese numerals: the longhand, informal
 * or formal, in either script (三, 十二, 一百零一, 一万零一十, 壹佰贰拾), or
 * digit by digit (一二〇, 二〇二六). `undefined` for anything else.
 */
export function parseChineseNumeral(text: string): number | undefined {
  const s = text.trim();
  if (s.length === 0) return undefined;
  const chars = [...s];
  // Digits only, more than one: read digit by digit (一二〇 = 120).
  if (chars.length > 1 && chars.every((c) => DIGIT_VALUES.has(c) && c !== '两' && c !== '兩')) {
    let n = 0;
    for (const c of chars) n = n * 10 + DIGIT_VALUES.get(c)!;
    return n;
  }
  if (!chars.every((c) => DIGIT_VALUES.has(c) || SMALL_MARKERS.has(c) || c === '万' || c === '萬' || c === '亿' || c === '億' || c === '兆')) return undefined;
  const n = readWithUnits(s);
  return n !== undefined && Number.isSafeInteger(n) ? n : undefined;
}
