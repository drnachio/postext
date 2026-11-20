/**
 * ISBN and its EAN-13 barcode: reading an ISBN as written (with or without
 * hyphens, ISBN-10 or ISBN-13), checking it, and the bars of the barcode
 * printed on the back cover, with the optional five-digit add-on (a price).
 */

/** Why an ISBN cannot be read: characters other than digits, hyphens and
 *  spaces (and a final X on an ISBN-10); neither 10 nor 13 digits; a
 *  13-digit number that does not start 978 or 979; or a wrong check digit. */
export type IsbnError = 'chars' | 'length' | 'prefix' | 'checksum';

export type IsbnReading =
  | { ok: true; isbn13: string; isbn10?: string }
  | { ok: false; error: IsbnError };

/** The digits of an ISBN as written: `ISBN`, hyphens and spaces dropped. */
function isbnDigits(raw: string): string {
  return raw.trim().replace(/^isbn(?:-1[03])?:?\s*/i, '').replace(/[\s‐-―-]/g, '');
}

/** The EAN-13 check digit of twelve digits. */
export function ean13CheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

function isbn10CheckValid(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const c = digits[i]!;
    sum += (c === 'X' || c === 'x' ? 10 : Number(c)) * (10 - i);
  }
  return sum % 11 === 0;
}

/** The ISBN-10 of a 978 ISBN-13 (979 numbers have none). */
function isbn10Of(isbn13: string): string | undefined {
  if (!isbn13.startsWith('978')) return undefined;
  const nine = isbn13.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(nine[i]) * (10 - i);
  const check = (11 - (sum % 11)) % 11;
  return nine + (check === 10 ? 'X' : String(check));
}

/** Reads an ISBN as written, `978-84-9835-123-4`, `ISBN 8498351239` or
 *  `9788498351234`, and gives it as the thirteen digits of the barcode
 *  (an ISBN-10 is converted) together with its ISBN-10 when it has one. */
export function parseIsbn(raw: string): IsbnReading {
  const d = isbnDigits(raw);
  if (/^\d{9}[\dXx]$/.test(d)) {
    if (!isbn10CheckValid(d)) return { ok: false, error: 'checksum' };
    const first12 = '978' + d.slice(0, 9);
    return { ok: true, isbn13: first12 + ean13CheckDigit(first12), isbn10: d.toUpperCase() };
  }
  if (!/^[\dXx]*$/.test(d)) return { ok: false, error: 'chars' };
  if (d.length !== 13 || !/^\d+$/.test(d)) return { ok: false, error: 'length' };
  if (!d.startsWith('978') && !d.startsWith('979')) return { ok: false, error: 'prefix' };
  if (ean13CheckDigit(d) !== Number(d[12])) return { ok: false, error: 'checksum' };
  const isbn10 = isbn10Of(d);
  return isbn10 ? { ok: true, isbn13: d, isbn10 } : { ok: true, isbn13: d };
}

// EAN-13 digit patterns (GS1 General Specifications, 5.2.1.2): the left
// half in sets A (odd parity) and B (even), the right half in set C.
const SET_A = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const SET_C = SET_A.map((p) => [...p].map((b) => (b === '1' ? '0' : '1')).join(''));
const SET_B = SET_C.map((p) => [...p].reverse().join(''));
/** Which set each left-hand digit takes, by the first digit (which is
 *  not drawn as bars: it is read from this pattern). */
const EAN13_PARITY = ['AAAAAA', 'AABABB', 'AABBAB', 'AABBBA', 'ABAABB', 'ABBAAB', 'ABBBAA', 'ABABAB', 'ABABBA', 'ABBABA'];
/** Which set each digit of the five-digit add-on takes, by its checksum. */
const EAN5_PARITY = ['BBAAA', 'BABAA', 'BAABA', 'BAAAB', 'ABBAA', 'AABBA', 'AAABB', 'ABABA', 'ABAAB', 'AABAB'];

/** One bar of a barcode, in modules from the left edge of the symbol (the
 *  quiet zone not included). Guard bars run down past the others, into
 *  the line of digits. */
export interface BarcodeBar {
  x: number;
  width: number;
  guard: boolean;
}

/** An EAN-13 symbol, and its add-on when there is one: the bars and the
 *  digits printed under them. */
export interface Ean13Symbol {
  digits: string;
  bars: BarcodeBar[];
  /** Width of the main symbol in modules (95). */
  width: number;
  addOn?: { digits: string; bars: BarcodeBar[]; x: number; width: number };
}

/** Width of an EAN-13 module at 100 % (nominal size), mm. */
export const EAN13_MODULE_MM = 0.33;
/** Height of the bars at 100 %, mm (the guard bars are 5 modules longer). */
export const EAN13_BAR_HEIGHT_MM = 22.85;
/** Quiet zones at either side, in modules: 11 on the left, 7 on the right. */
export const EAN13_QUIET_ZONE = { left: 11, right: 7 } as const;
/** Gap between the main symbol and its add-on, in modules (7 … 12). */
export const EAN_ADDON_GAP = 9;

function runs(pattern: string, offset: number, guard: (i: number) => boolean): BarcodeBar[] {
  const bars: BarcodeBar[] = [];
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] !== '1') continue;
    const last = bars[bars.length - 1];
    if (last && last.x + last.width === offset + i && last.guard === guard(i)) last.width++;
    else bars.push({ x: offset + i, width: 1, guard: guard(i) });
  }
  return bars;
}

/** The bars of an EAN-13 for thirteen digits, with the bars of a five-digit
 *  add-on when `addOn` is given (a price: `'51995'`). Throws on input that
 *  is not thirteen digits with a right check digit, or an add-on that is
 *  not five digits: read the ISBN with {@link parseIsbn} first. */
export function ean13Symbol(digits: string, addOn?: string): Ean13Symbol {
  if (!/^\d{13}$/.test(digits) || ean13CheckDigit(digits) !== Number(digits[12])) {
    throw new Error(`ean13Symbol: "${digits}" is not an EAN-13`);
  }
  const parity = EAN13_PARITY[Number(digits[0])]!;
  let pattern = '101';
  for (let i = 1; i <= 6; i++) {
    const set = parity[i - 1] === 'A' ? SET_A : SET_B;
    pattern += set[Number(digits[i])];
  }
  pattern += '01010';
  for (let i = 7; i <= 12; i++) pattern += SET_C[Number(digits[i])];
  pattern += '101';
  const isGuard = (i: number) => i < 3 || (i >= 45 && i < 50) || i >= 92;
  const symbol: Ean13Symbol = { digits, bars: runs(pattern, 0, isGuard), width: 95 };
  if (addOn !== undefined) {
    if (!/^\d{5}$/.test(addOn)) throw new Error(`ean13Symbol: add-on "${addOn}" is not five digits`);
    const d = [...addOn].map(Number);
    const check = (3 * (d[0]! + d[2]! + d[4]!) + 9 * (d[1]! + d[3]!)) % 10;
    const addOnParity = EAN5_PARITY[check]!;
    let add = '1011';
    d.forEach((digit, i) => {
      if (i > 0) add += '01';
      add += (addOnParity[i] === 'A' ? SET_A : SET_B)[digit];
    });
    const x = 95 + EAN_ADDON_GAP;
    symbol.addOn = { digits: addOn, bars: runs(add, x, () => false), x, width: add.length };
  }
  return symbol;
}

/** The line printed over the barcode: `ISBN 978-84-9835-123-4` when the
 *  ISBN was written with its hyphens (they mark the registration group,
 *  publisher and title, which only the agency's range table can place),
 *  the bare thirteen digits otherwise. */
export function isbnCaption(raw: string, isbn13: string): string {
  const written = raw.trim().replace(/^isbn(?:-1[03])?:?\s*/i, '');
  const hyphenated = /^97[89][-‐ ]\d+[-‐ ]\d+[-‐ ]\d+[-‐ ]\d$/.test(written);
  return `ISBN ${hyphenated ? written.replace(/[‐ ]/g, '-') : isbn13}`;
}
