/**
 * French, Italian, Catalan and Portuguese numbers in words, for heading
 * templates (`{1:words}`, `{1:ordinal}`, `{1:ordinal-feminine}`) and the
 * `{numberWords}` / `{numberOrdinalWords}` design placeholders: « Chapitre
 * vingt et un », «Capitolo primo», «Capítol u», «Capítulo vigésimo
 * primeiro». Masculine by default, as a chapter or a book is numbered;
 * the feminine agrees with a feminine noun (« Partie première », «Parte
 * prima», «Lliçó primera», «Lição primeira»).
 *
 * The callers keep the numbers in range (cardinals up to 999 999; French
 * and Italian ordinals too, Catalan and Portuguese ones up to 999).
 */

export type RomanceGender = 'masculine' | 'feminine';

/** The last word of `words` (after its last space or hyphen) and what
 *  comes before it. */
function splitLast(words: string): [head: string, last: string] {
  const cut = Math.max(words.lastIndexOf(' '), words.lastIndexOf('-')) + 1;
  return [words.slice(0, cut), words.slice(cut)];
}

// --- French ----------------------------------------------------------------

const FR_BELOW_17 = [
  '', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix',
  'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize',
];
const FR_TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

function frBelow20(n: number): string {
  return n < 17 ? FR_BELOW_17[n]! : `dix-${FR_BELOW_17[n - 10]}`;
}

/** The traditional spelling (hyphens below a hundred, *et* before *un* and
 *  *onze*), as French books print it: vingt et un, soixante et onze,
 *  quatre-vingts, quatre-vingt-un. */
function frBelow100(n: number): string {
  if (n < 20) return frBelow20(n);
  const tens = Math.floor(n / 10);
  const unit = n % 10;
  if (tens === 7) return unit === 1 ? 'soixante et onze' : `soixante-${frBelow20(10 + unit)}`;
  if (tens === 8) return unit === 0 ? 'quatre-vingts' : `quatre-vingt-${FR_BELOW_17[unit]}`;
  if (tens === 9) return `quatre-vingt-${frBelow20(10 + unit)}`;
  if (unit === 0) return FR_TENS[tens]!;
  return unit === 1 ? `${FR_TENS[tens]} et un` : `${FR_TENS[tens]}-${FR_BELOW_17[unit]}`;
}

/** *Cent* takes an *s* when multiplied and last: deux cents, deux cent un. */
function frBelow1000(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds === 0) return frBelow100(rest);
  const head = hundreds === 1 ? 'cent' : `${FR_BELOW_17[hundreds]} cent`;
  if (rest) return `${head} ${frBelow100(rest)}`;
  return hundreds === 1 ? head : `${head}s`;
}

export function frenchCardinal(n: number, gender: RomanceGender = 'masculine'): string {
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  let words = frBelow1000(rest);
  if (thousands) {
    // *Mille* is invariable, and *vingt* and *cent* lose their *s* before
    // it: deux mille, quatre-vingt mille, deux cent mille.
    const head = thousands === 1 ? 'mille' : `${frBelow1000(thousands).replace(/(vingt|cent)s$/, '$1')} mille`;
    words = rest ? `${head} ${words}` : head;
  }
  // vingt et une, quatre-vingt-une, cent une.
  return gender === 'feminine' && /(^|[ -])un$/.test(words) ? `${words}e` : words;
}

/** The cardinal with *-ième* on its last word (vingt et unième,
 *  quatre-vingtième, deux centième, millième); *premier* / *première* for
 *  one alone. */
export function frenchOrdinal(n: number, gender: RomanceGender = 'masculine'): string {
  if (n === 1) return gender === 'feminine' ? 'première' : 'premier';
  const [head, last] = splitLast(frenchCardinal(n));
  let stem: string;
  if (last === 'cinq') stem = 'cinqu';
  else if (last === 'neuf') stem = 'neuv';
  else if (last === 'vingts' || last === 'cents') stem = last.slice(0, -1);
  else if (last.endsWith('e')) stem = last.slice(0, -1);
  else stem = last;
  return `${head}${stem}ième`;
}

// --- Italian ---------------------------------------------------------------

const IT_BELOW_20 = [
  '', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci',
  'undici', 'dodici', 'tredici', 'quattordici', 'quindici', 'sedici', 'diciassette', 'diciotto', 'diciannove',
];
const IT_TENS = ['', '', 'venti', 'trenta', 'quaranta', 'cinquanta', 'sessanta', 'settanta', 'ottanta', 'novanta'];

/** One word; the tens drop their vowel before *uno* and *otto*: ventuno,
 *  trentotto. */
function itBelow100(n: number): string {
  if (n < 20) return IT_BELOW_20[n]!;
  const tens = IT_TENS[Math.floor(n / 10)]!;
  const unit = n % 10;
  if (unit === 0) return tens;
  return (unit === 1 || unit === 8 ? tens.slice(0, -1) : tens) + IT_BELOW_20[unit];
}

/** *Cento* elides before *otto* and *ottanta* (centotto, centottanta) and
 *  keeps its vowel before *uno* (centouno). */
function itBelow1000(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const head = hundreds === 0 ? '' : hundreds === 1 ? 'cento' : `${IT_BELOW_20[hundreds]}cento`;
  const tail = itBelow100(rest);
  return head && tail.startsWith('ott') ? head.slice(0, -1) + tail : head + tail;
}

/** The cardinal as one word, without the accent of a final *tre*. */
function itCardinalPlain(n: number): string {
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  if (thousands === 0) return itBelow1000(rest);
  const head = thousands === 1 ? 'mille' : `${itBelow1000(thousands)}mila`;
  return head + itBelow1000(rest);
}

/** One word (duemilaventiquattro); a final *tre* takes its accent in a
 *  compound (ventitré, centotré). */
export function italianCardinal(n: number, gender: RomanceGender = 'masculine'): string {
  let words = itCardinalPlain(n);
  if (n > 3 && words.endsWith('tre')) words = `${words.slice(0, -3)}tré`;
  // una, ventuna.
  return gender === 'feminine' && words.endsWith('uno') ? `${words.slice(0, -1)}a` : words;
}

const IT_ORDINALS = ['', 'primo', 'secondo', 'terzo', 'quarto', 'quinto', 'sesto', 'settimo', 'ottavo', 'nono', 'decimo'];

/** *Primo* to *decimo*, then the cardinal with *-esimo* for its last vowel
 *  (undicesimo, ventunesimo, ventitreesimo, ventiseiesimo, centesimo,
 *  millesimo, duemillesimo). */
export function italianOrdinal(n: number, gender: RomanceGender = 'masculine'): string {
  let words: string;
  if (n <= 10) words = IT_ORDINALS[n]!;
  else {
    const cardinal = itCardinalPlain(n);
    if (cardinal.endsWith('mila')) words = `${cardinal.slice(0, -4)}millesimo`;
    else if (cardinal.endsWith('tre') || cardinal.endsWith('sei')) words = `${cardinal}esimo`;
    else words = `${cardinal.slice(0, -1)}esimo`;
  }
  return gender === 'feminine' ? `${words.slice(0, -1)}a` : words;
}

// --- Catalan ---------------------------------------------------------------

const CA_BELOW_20 = [
  '', 'u', 'dos', 'tres', 'quatre', 'cinc', 'sis', 'set', 'vuit', 'nou', 'deu',
  'onze', 'dotze', 'tretze', 'catorze', 'quinze', 'setze', 'disset', 'divuit', 'dinou',
];
const CA_TENS = ['', '', 'vint', 'trenta', 'quaranta', 'cinquanta', 'seixanta', 'setanta', 'vuitanta', 'noranta'];

/** As the IEC writes them: vint-i-u, trenta-dos (D-U-C: tens and units
 *  hyphenated, *i* after *vint*). */
function caBelow100(n: number): string {
  if (n < 20) return CA_BELOW_20[n]!;
  const tens = CA_TENS[Math.floor(n / 10)]!;
  const unit = n % 10;
  if (unit === 0) return tens;
  return `${tens}${n < 30 ? '-i-' : '-'}${CA_BELOW_20[unit]}`;
}

/** Hundreds hyphenated to their multiplier (dos-cents), the rest after a
 *  space: cent u, dos-cents vint-i-u. */
function caBelow1000(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds === 0) return caBelow100(rest);
  const head = hundreds === 1 ? 'cent' : `${CA_BELOW_20[hundreds]}-cents`;
  return rest ? `${head} ${caBelow100(rest)}` : head;
}

/** Each word of a Catalan numeral in the feminine: una, dues, dues-centes. */
function caFeminine(words: string): string {
  return words.replace(/[^ -]+/g, (w) => (w === 'u' || w === 'un' ? 'una' : w === 'dos' ? 'dues' : w === 'cents' ? 'centes' : w));
}

/** *U* where the number is named or follows its noun (capítol u, vint-i-u,
 *  dos mil u), *un* before *mil* (vint-i-un mil). */
export function catalanCardinal(n: number, gender: RomanceGender = 'masculine'): string {
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  let words = caBelow1000(rest);
  if (thousands) {
    const head = thousands === 1 ? 'mil' : `${caBelow1000(thousands).replace(/(^|[ -])u$/, '$1un')} mil`;
    words = rest ? `${head} ${words}` : head;
  }
  return gender === 'feminine' ? caFeminine(words) : words;
}

const CA_ORDINALS: Readonly<Record<RomanceGender, readonly string[]>> = {
  masculine: ['', 'primer', 'segon', 'tercer', 'quart'],
  feminine: ['', 'primera', 'segona', 'tercera', 'quarta'],
};
const CA_ORDINAL_STEMS: Readonly<Record<string, string>> = {
  u: 'un', cinc: 'cinqu', nou: 'nov', deu: 'des', dinou: 'dinov', cents: 'cent',
};

/** *Primer* to *quart*, then the cardinal with *-è* (feminine *-ena*) on its
 *  last word: cinquè, desè, vint-i-unè, trentè, centè, dos-centè. */
export function catalanOrdinal(n: number, gender: RomanceGender = 'masculine'): string {
  if (n <= 4) return CA_ORDINALS[gender][n]!;
  const [head, last] = splitLast(catalanCardinal(n));
  const stem = CA_ORDINAL_STEMS[last] ?? (/[ae]$/.test(last) ? last.slice(0, -1) : last);
  return gender === 'feminine' ? `${caFeminine(head)}${stem}ena` : `${head}${stem}è`;
}

// --- Portuguese ------------------------------------------------------------

const PT_BELOW_20 = [
  '', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez',
  'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove',
];
/** Where Portugal (and Africa) spell 14, 16, 17 and 19 otherwise. */
const PT_EUROPEAN: Readonly<Record<number, string>> = {
  14: 'catorze', 16: 'dezasseis', 17: 'dezassete', 19: 'dezanove',
};
const PT_TENS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const PT_HUNDREDS = [
  '', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos',
  'setecentos', 'oitocentos', 'novecentos',
];

function ptBelow100(n: number, european: boolean): string {
  if (n < 20) return (european ? PT_EUROPEAN[n] : undefined) ?? PT_BELOW_20[n]!;
  const unit = n % 10;
  return PT_TENS[Math.floor(n / 10)]! + (unit ? ` e ${PT_BELOW_20[unit]}` : '');
}

function ptBelow1000(n: number, european: boolean): string {
  if (n === 100) return 'cem';
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds === 0) return ptBelow100(rest, european);
  return PT_HUNDREDS[hundreds]! + (rest ? ` e ${ptBelow100(rest, european)}` : '');
}

/** Every element joined by *e* (cento e vinte e um); after *mil* only a
 *  last group under a hundred or a round hundred takes it: mil e um, mil e
 *  cem, mil duzentos e trinta. Brazilian spelling (dezesseis) unless
 *  `european` (dezasseis). */
export function portugueseCardinal(n: number, gender: RomanceGender = 'masculine', european = false): string {
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  let words = ptBelow1000(rest, european);
  if (thousands) {
    const head = thousands === 1 ? 'mil' : `${ptBelow1000(thousands, european)} mil`;
    words = rest === 0 ? head : `${head}${rest < 100 || rest % 100 === 0 ? ' e ' : ' '}${words}`;
  }
  if (gender === 'masculine') return words;
  // uma, duas, duzentas, vinte e uma mil.
  return words.replace(/[^ ]+/g, (w) => (w === 'um' ? 'uma' : w === 'dois' ? 'duas' : w.endsWith('entos') ? `${w.slice(0, -2)}as` : w));
}

const PT_ORDINAL_UNITS = ['', 'primeiro', 'segundo', 'terceiro', 'quarto', 'quinto', 'sexto', 'sétimo', 'oitavo', 'nono'];
const PT_ORDINAL_TENS = [
  '', 'décimo', 'vigésimo', 'trigésimo', 'quadragésimo', 'quinquagésimo', 'sexagésimo',
  'septuagésimo', 'octogésimo', 'nonagésimo',
];
const PT_ORDINAL_HUNDREDS = [
  '', 'centésimo', 'ducentésimo', 'trecentésimo', 'quadringentésimo', 'quingentésimo',
  'sexcentésimo', 'septingentésimo', 'octingentésimo', 'nongentésimo',
];

/** The Latin ordinals, one per order, without *e*: décimo primeiro,
 *  vigésimo primeiro, centésimo vigésimo primeiro; each word in the
 *  feminine for a feminine noun (vigésima primeira). */
export function portugueseOrdinal(n: number, gender: RomanceGender = 'masculine'): string {
  const words = [
    PT_ORDINAL_HUNDREDS[Math.floor(n / 100)]!,
    PT_ORDINAL_TENS[Math.floor(n / 10) % 10]!,
    PT_ORDINAL_UNITS[n % 10]!,
  ].filter(Boolean).join(' ');
  return gender === 'feminine' ? words.replace(/o(?= |$)/g, 'a') : words;
}
