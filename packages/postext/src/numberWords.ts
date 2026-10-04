/**
 * Numbers spelled out in words — "twenty-one", "twenty-first", "veintiuno",
 * "vigesimoprimero", 二十一, 第二十一, الحادي والعشرون — for heading numbering
 * templates (`{1:words}`, `{1:ordinal}`) and the `{numberWords}` /
 * `{numberOrdinalWords}` design placeholders. English, Spanish, Chinese
 * (in the document's script: 一万 / 一萬) and Arabic; any other language
 * takes the English words, like the other localised strings (table
 * continuation labels). Masculine forms by default, as a chapter or a part
 * is numbered ("capítulo primero", الفصل الأول); Arabic also has the
 * feminine (الليلة الأولى, see {@link NumberWordsOptions}).
 */
import { stringsKeyOf } from './locale';
import { chineseNumeral } from './chineseNumerals';
import { arabicCardinal, arabicOrdinal, type ArabicGender, type ArabicSpelling } from './arabicNumberWords';

/** Cardinal ("twenty-one") or ordinal ("twenty-first"). */
export type NumberWordsKind = 'cardinal' | 'ordinal';

/** How a language that inflects its number words writes them. Arabic reads
 *  both fields; English, Spanish and Chinese ignore them. */
export interface NumberWordsOptions {
  /** The gender of the counted noun: الفصل الأول but الليلة الأولى, واحد
   *  وعشرون but إحدى عشرة. Default `'masculine'`. */
  gender?: ArabicGender;
  /** `'classical'` spells the Arabic hundreds مائة (Bulaq orthography);
   *  default `'modern'`, مئة. */
  spelling?: ArabicSpelling;
}

/** Largest number spelled out; anything past it prints in digits. */
const MAX_CARDINAL = 999_999;
const MAX_ORDINAL_ES = 999;

function language(locale: string | undefined): 'en' | 'es' | 'zh-hans' | 'zh-hant' | 'ar' {
  const key = stringsKeyOf(locale ?? 'en');
  return key === 'es' || key === 'zh-hans' || key === 'zh-hant' || key === 'ar' ? key : 'en';
}

// --- English ---------------------------------------------------------------

const EN_ONES = [
  '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
];
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function enBelow1000(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const tail = rest < 20
    ? EN_ONES[rest]!
    : EN_TENS[Math.floor(rest / 10)]! + (rest % 10 ? `-${EN_ONES[rest % 10]}` : '');
  if (hundreds === 0) return tail;
  return `${EN_ONES[hundreds]} hundred${tail ? ` ${tail}` : ''}`;
}

function enCardinal(n: number): string {
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  if (thousands === 0) return enBelow1000(rest);
  return `${enBelow1000(thousands)} thousand${rest ? ` ${enBelow1000(rest)}` : ''}`;
}

const EN_IRREGULAR_ORDINALS: Record<string, string> = {
  one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth',
};

/** The cardinal with its last word made ordinal: "twenty-one" → "twenty-first". */
function enOrdinal(n: number): string {
  const cardinal = enCardinal(n);
  const cut = Math.max(cardinal.lastIndexOf(' '), cardinal.lastIndexOf('-')) + 1;
  const last = cardinal.slice(cut);
  const ordinal = EN_IRREGULAR_ORDINALS[last]
    ?? (last.endsWith('y') ? `${last.slice(0, -1)}ieth` : `${last}th`);
  return cardinal.slice(0, cut) + ordinal;
}

// --- Spanish ---------------------------------------------------------------

const ES_BELOW_30 = [
  '', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
  'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve',
  'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis',
  'veintisiete', 'veintiocho', 'veintinueve',
];
const ES_TENS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const ES_HUNDREDS = [
  '', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos',
  'setecientos', 'ochocientos', 'novecientos',
];

function esBelow100(n: number): string {
  if (n < 30) return ES_BELOW_30[n]!;
  const unit = n % 10;
  return ES_TENS[Math.floor(n / 10)]! + (unit ? ` y ${ES_BELOW_30[unit]}` : '');
}

function esBelow1000(n: number): string {
  if (n === 100) return 'cien';
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds === 0) return esBelow100(rest);
  return ES_HUNDREDS[hundreds]! + (rest ? ` ${esBelow100(rest)}` : '');
}

function esCardinal(n: number): string {
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  if (thousands === 0) return esBelow1000(rest);
  // "mil", "dos mil"; a final "uno" shortens before "mil": "veintiún mil",
  // "treinta y un mil".
  const head = thousands === 1
    ? 'mil'
    : `${esBelow1000(thousands).replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un')} mil`;
  return head + (rest ? ` ${esBelow1000(rest)}` : '');
}

const ES_ORDINAL_UNITS = ['', 'primero', 'segundo', 'tercero', 'cuarto', 'quinto', 'sexto', 'séptimo', 'octavo', 'noveno'];
const ES_ORDINAL_TENS = [
  '', 'décimo', 'vigésimo', 'trigésimo', 'cuadragésimo', 'quincuagésimo', 'sexagésimo',
  'septuagésimo', 'octogésimo', 'nonagésimo',
];
const ES_ORDINAL_HUNDREDS = [
  '', 'centésimo', 'ducentésimo', 'tricentésimo', 'cuadringentésimo', 'quingentésimo',
  'sexcentésimo', 'septingentésimo', 'octingentésimo', 'noningentésimo',
];

/** One word, as the RAE prefers from 13 to 29: "decimotercero",
 *  "vigesimoprimero", "decimoctavo". */
function esJoinedOrdinal(prefix: 'decimo' | 'vigesimo', unit: number): string {
  const word = ES_ORDINAL_UNITS[unit]!;
  return word.startsWith('o') ? prefix + word.slice(1) : prefix + word;
}

function esOrdinalBelow100(n: number): string {
  if (n < 10) return ES_ORDINAL_UNITS[n]!;
  if (n === 11) return 'undécimo';
  if (n === 12) return 'duodécimo';
  const tens = Math.floor(n / 10);
  const unit = n % 10;
  if (unit === 0) return ES_ORDINAL_TENS[tens]!;
  if (tens === 1) return esJoinedOrdinal('decimo', unit);
  if (tens === 2) return esJoinedOrdinal('vigesimo', unit);
  return `${ES_ORDINAL_TENS[tens]} ${ES_ORDINAL_UNITS[unit]}`;
}

function esOrdinal(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds === 0) return esOrdinalBelow100(rest);
  return ES_ORDINAL_HUNDREDS[hundreds]! + (rest ? ` ${esOrdinalBelow100(rest)}` : '');
}

/**
 * `n` spelled out in lower case, in the document language (`locale`:
 * `'es'` or a Spanish tag gives Spanish, a Chinese tag Chinese numerals in
 * its script, an Arabic tag Arabic words in the gender and spelling of
 * `options`, anything else English). Numbers past 999 999 (Spanish
 * ordinals: past 999; Chinese: past 10¹⁶ − 1; Arabic: cardinals past
 * 99 999, ordinals past 9 999) print in digits; zero and below print
 * nothing, like the other numeral formats.
 */
export function numberToWords(n: number, kind: NumberWordsKind = 'cardinal', locale?: string, options: NumberWordsOptions = {}): string {
  if (!Number.isInteger(n) || n < 1) return n > 0 ? String(n) : '';
  const lang = language(locale);
  if (lang === 'ar') return kind === 'ordinal' ? arabicOrdinal(n, options) : arabicCardinal(n, options);
  if (lang === 'zh-hans' || lang === 'zh-hant') {
    // Informal numerals; the ordinal is 第 before them (第十二).
    const numeral = chineseNumeral(n, 'informal', lang === 'zh-hant');
    return kind === 'ordinal' ? `第${numeral}` : numeral;
  }
  if (kind === 'ordinal') {
    if (lang === 'es') return n <= MAX_ORDINAL_ES ? esOrdinal(n) : String(n);
    return n <= MAX_CARDINAL ? enOrdinal(n) : String(n);
  }
  if (n > MAX_CARDINAL) return String(n);
  return lang === 'es' ? esCardinal(n) : enCardinal(n);
}

/** Letter case of spelled-out words: as spelled, first letter capital, or
 *  all capitals. */
export type WordsCase = 'lower' | 'capital' | 'upper';

export function caseWords(words: string, wordsCase: WordsCase, locale?: string): string {
  // Han and Arabic characters have no case: the variants print alike.
  const tag = language(locale) === 'es' ? 'es' : 'en';
  if (wordsCase === 'upper') return words.toLocaleUpperCase(tag);
  if (wordsCase === 'capital') return words.charAt(0).toLocaleUpperCase(tag) + words.slice(1);
  return words;
}
