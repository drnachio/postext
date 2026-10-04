/**
 * Arabic-script numerals, written and read: the Arabic-Indic digits of the
 * Mashriq (٠١٢٣٤٥٦٧٨٩, U+0660–0669) and the Extended Arabic-Indic digits
 * of Persian and Urdu (۰۱۲۳۴۵۶۷۸۹, U+06F0–06F9); the additive abjad
 * numerals of Classical Arabic and manuscript foliation (يا = 11,
 * غتمو = 1446) in the Mashriqi and the Maghrebi values; and the letter
 * series that number list items and front matter, in abjad order
 * (أ ب ج د هـ) and in the alphabetical, hijāʾī order (أ ب ت ث). Also
 * the reverse for digits: an Arabic author types ٣ where a Latin one
 * types 3.
 */

import type { DigitSystem } from './types';

const ARABIC_INDIC_ZERO = 0x0660;
const PERSIAN_ZERO = 0x06f0;

/** `n` in Arabic-Indic digits: 2026 → ٢٠٢٦. */
export function arabicIndicDecimal(n: number): string {
  return String(n).replace(/\d/g, (d) => String.fromCharCode(ARABIC_INDIC_ZERO + Number(d)));
}

/** `n` in Extended Arabic-Indic (Persian) digits: 2026 → ۲۰۲۶. Urdu writes
 *  the same code points; its glyph forms come from the font (`locl`). */
export function persianDecimal(n: number): string {
  return String(n).replace(/\d/g, (d) => String.fromCharCode(PERSIAN_ZERO + Number(d)));
}

/**
 * The ASCII digits of an engine-generated string in the document's digit
 * system: `'arab'` writes ٠–٩, `'arabext'` ۰–۹, `'latn'` (or none) leaves
 * the string as it is. Only strings the engine composed go through it — a
 * page count, a chapter ordinal, the fallback of a list number — never
 * the author's text.
 */
export function withDigits(text: string, digits: DigitSystem | undefined): string {
  if (!digits || digits === 'latn') return text;
  const zero = digits === 'arab' ? ARABIC_INDIC_ZERO : PERSIAN_ZERO;
  return text.replace(/[0-9]/g, (d) => String.fromCharCode(zero + d.charCodeAt(0) - 48));
}

/** Arabic-Indic (٠–٩) and Extended Arabic-Indic (۰–۹) digits turned into
 *  ASCII ones, everything else kept: what a number an author typed on an
 *  Arabic or Persian keyboard (`startAt=٣`, `:::part{number="١٢"}`) is
 *  read through before `Number()`. */
export function asciiDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹]/g, (d) => {
    const c = d.charCodeAt(0);
    return String.fromCharCode(48 + c - (c >= PERSIAN_ZERO ? PERSIAN_ZERO : ARABIC_INDIC_ZERO));
  });
}

// ---------------------------------------------------------------------------
// Abjad numerals
// ---------------------------------------------------------------------------

/** Units, tens and hundreds (index 1–9) and the thousand of the Mashriqi
 *  abjad (أبجد هوز حطي كلمن سعفص قرشت ثخذ ضظغ). */
const MASHRIQI = {
  units: ['', 'ا', 'ب', 'ج', 'د', 'ه', 'و', 'ز', 'ح', 'ط'],
  tens: ['', 'ي', 'ك', 'ل', 'م', 'ن', 'س', 'ع', 'ف', 'ص'],
  hundreds: ['', 'ق', 'ر', 'ش', 'ت', 'ث', 'خ', 'ذ', 'ض', 'ظ'],
  thousand: 'غ',
};

/** The Maghrebi abjad (أبجد هوز حطي كلمن صعفض قرست ثخذ ظغش): the same up to
 *  ن = 50, then ص 60, ض 90, س 300, ظ 800, غ 900 and ش 1000. The W3C
 *  `maghrebi-abjad` counter lists ض before ع (60) and ص after ف (90); the
 *  mnemonic صعفض and the reference tables put them the other way round,
 *  which is what is followed here. */
const MAGHREBI = {
  units: MASHRIQI.units,
  tens: ['', 'ي', 'ك', 'ل', 'م', 'ن', 'ص', 'ع', 'ف', 'ض'],
  hundreds: ['', 'ق', 'ر', 'س', 'ت', 'ث', 'خ', 'ذ', 'ظ', 'غ'],
  thousand: 'ش',
};

/** Largest abjad numeral written; past it the number prints in digits. */
const MAX_ABJAD = 999_999;

/** Letters that join only to the letter before them: a ه written after
 *  one of them stands alone. */
const RIGHT_JOINING = new Set(['ا', 'أ', 'إ', 'آ', 'د', 'ذ', 'ر', 'ز', 'و']);

/**
 * A heh that would stand alone at the end of a numeral or a list marker —
 * the whole marker (the fifth item, هـ) or after a letter that does not
 * join forward (ده) — takes a tatweel, هـ, as Arabic books write it, so it
 * is not read as the digit ٥. A heh joined to the letter before it (يه,
 * 15) is clear as it is. The W3C counter styles write ه followed by a
 * zero-width joiner, which shapes the same in a font that honours the
 * joiner; the tatweel shapes alike everywhere, and is the form printed
 * books use.
 */
function settleFinalHeh(text: string): string {
  if (!text.endsWith('ه')) return text;
  const before = text.slice(-2, -1);
  return before === '' || RIGHT_JOINING.has(before) ? `${text}ـ` : text;
}

function abjadBelow1000(n: number, table: typeof MASHRIQI): string {
  return table.hundreds[Math.floor(n / 100)]! + table.tens[Math.floor(n / 10) % 10]! + table.units[n % 10]!;
}

/**
 * `n` in additive abjad numerals, highest value first in logical order
 * (the reader sees it right to left): 11 يا, 15 يه, 1446 غتمو, 1835 غضله.
 * The thousands count is written before the thousand letter (2000 بغ, as
 * against 1002 غب). `'maghrebi'` takes the Maghrebi values. A final heh
 * that would stand alone takes a tatweel (5 هـ). Zero has no abjad numeral
 * and prints nothing; past 999 999 the number prints in digits.
 */
export function abjadNumeral(n: number, variant: 'mashriqi' | 'maghrebi' = 'mashriqi'): string {
  if (!Number.isSafeInteger(n) || n < 1) return '';
  if (n > MAX_ABJAD) return String(n);
  const table = variant === 'maghrebi' ? MAGHREBI : MASHRIQI;
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  const head = thousands === 0 ? '' : (thousands === 1 ? '' : abjadBelow1000(thousands, table)) + table.thousand;
  return settleFinalHeh(head + abjadBelow1000(rest, table));
}

// ---------------------------------------------------------------------------
// Letter series
// ---------------------------------------------------------------------------

/** The 28 letters in abjad order, as list items are lettered in Arabic
 *  textbooks and outlines (أ، ب، ج، د، هـ…). The first is written with its
 *  hamza, as a list marker always is: a bare alif reads as the digit ١. */
export const ABJAD_LETTERS: readonly string[] = Object.freeze([
  'أ', 'ب', 'ج', 'د', 'ه', 'و', 'ز', 'ح', 'ط', 'ي', 'ك', 'ل', 'م', 'ن',
  'س', 'ع', 'ف', 'ص', 'ق', 'ر', 'ش', 'ت', 'ث', 'خ', 'ذ', 'ض', 'ظ', 'غ',
]);

/** The 28 letters in alphabetical (hijāʾī) order, the dictionary order of
 *  today (أ، ب، ت، ث، ج…); the first with its hamza, as above. */
export const HIJAI_LETTERS: readonly string[] = Object.freeze([
  'أ', 'ب', 'ت', 'ث', 'ج', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص',
  'ض', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ك', 'ل', 'م', 'ن', 'ه', 'و', 'ي',
]);

/**
 * The `n`th marker of a letter series, by the bijective rule of
 * `lower-alpha` (z, aa, ab…): past the last letter the series goes on in
 * two letters (أأ, أب…), then three. A final heh that would stand alone
 * takes a tatweel (هـ). Zero and below print nothing.
 */
export function arabicLettering(n: number, letters: readonly string[]): string {
  if (!Number.isSafeInteger(n) || n < 1) return '';
  let s = '';
  for (let x = n; x > 0; x = Math.floor(x / letters.length)) {
    x -= 1;
    s = letters[x % letters.length]! + s;
  }
  return settleFinalHeh(s);
}
