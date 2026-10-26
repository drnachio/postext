/**
 * Arabic numbers in words, for heading templates (`{1:ordinal}`,
 * `{1:ordinal-feminine}`, `{1:words}`): the ordinal a chapter or a night is
 * titled with — الفصل الأول, الباب الحادي عشر, الليلة الأولى, الليلة الحادية
 * بعد الألف — and the cardinal (واحد وعشرون, إحدى عشرة). Both agree in gender
 * with the noun they count: masculine for فصل, باب, جزء, كتاب; feminine for
 * ليلة, مقالة, حكاية.
 *
 * The forms are those of Modern Standard Arabic as headings print them:
 * nominative, and for ordinals definite (with ال). Numbers above a hundred
 * that are not round take the "after" formula of the classical editions
 * and their modern reprints: 145 الخامس والأربعون بعد المئة, 1001 الحادية
 * بعد الألف. Hundreds are spelled مئة, as the language academies write
 * them today, or مائة (`spelling: 'classical'`), as Bulaq and most
 * Egyptian prints do (ثلاثمائة in one word either way).
 */

export type ArabicGender = 'masculine' | 'feminine';
export type ArabicSpelling = 'modern' | 'classical';

export interface ArabicWordsOptions {
  /** The gender of the counted noun. Default `'masculine'`. */
  gender?: ArabicGender;
  /** `'classical'` spells the hundreds مائة. Default `'modern'` (مئة). */
  spelling?: ArabicSpelling;
}

/** Largest cardinal spelled out; past it the number prints in digits. */
const MAX_CARDINAL_AR = 99_999;
/** Largest ordinal spelled out. */
const MAX_ORDINAL_AR = 9_999;

// --- Cardinals --------------------------------------------------------------

/** 1–10 counting a masculine noun (3–10 take the feminine ending, by the
 *  rule of polarity) and a feminine one. */
const CARDINAL_UNITS: Record<ArabicGender, readonly string[]> = {
  masculine: ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة'],
  feminine: ['', 'واحدة', 'اثنتان', 'ثلاث', 'أربع', 'خمس', 'ست', 'سبع', 'ثماني', 'تسع', 'عشر'],
};

/** 11 and 12: their own forms; 13–19 take the unit of 3–9 above. */
const CARDINAL_TEENS: Record<ArabicGender, { eleven: string; twelve: string; ten: string }> = {
  masculine: { eleven: 'أحد عشر', twelve: 'اثنا عشر', ten: 'عشر' },
  feminine: { eleven: 'إحدى عشرة', twelve: 'اثنتا عشرة', ten: 'عشرة' },
};

/** The tens, alike for both genders, nominative (genitive and accusative
 *  end in ين). */
const TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];

/** 100–900, nominative: مئتان is the dual (genitive مئتين); 300–900 are
 *  written as one word. */
const HUNDREDS = ['', 'مئة', 'مئتان', 'ثلاثمئة', 'أربعمئة', 'خمسمئة', 'ستمئة', 'سبعمئة', 'ثمانمئة', 'تسعمئة'];

/** The classical spelling of the hundreds: مئة → مائة, مئتان → مائتان,
 *  ثلاثمئة → ثلاثمائة. */
function spelled(words: string, spelling: ArabicSpelling | undefined): string {
  return spelling === 'classical' ? words.replace(/مئ/g, 'مائ') : words;
}

/** "a and b", the conjunction written onto the next word: ألف ومئة. */
function joinAnd(parts: readonly string[]): string {
  return parts.filter((p) => p.length > 0).join(' و');
}

function cardinalBelow100(n: number, gender: ArabicGender): string {
  if (n <= 10) return CARDINAL_UNITS[gender][n]!;
  const teens = CARDINAL_TEENS[gender];
  if (n === 11) return teens.eleven;
  if (n === 12) return teens.twelve;
  if (n < 20) return `${CARDINAL_UNITS[gender][n - 10]} ${teens.ten}`;
  const unit = n % 10;
  // Units before tens: واحد وعشرون (21).
  return joinAnd([unit ? CARDINAL_UNITS[gender][unit]! : '', TENS[Math.floor(n / 10)]!]);
}

function cardinalBelow1000(n: number, gender: ArabicGender): string {
  return joinAnd([HUNDREDS[Math.floor(n / 100)]!, n % 100 ? cardinalBelow100(n % 100, gender) : '']);
}

/** The thousands of a cardinal: ألف, ألفان, ثلاثة آلاف … عشرة آلاف (the
 *  plural, counted as a masculine noun), أحد عشر ألفًا … تسعة وتسعون ألفًا
 *  (the singular in the accusative). */
function thousandsWords(k: number): string {
  if (k === 1) return 'ألف';
  if (k === 2) return 'ألفان';
  if (k <= 10) return `${CARDINAL_UNITS.masculine[k]} آلاف`;
  return `${cardinalBelow100(k, 'masculine')} ألفًا`;
}

/**
 * `n` as an Arabic cardinal, nominative, counting a noun of `gender`:
 * واحد / واحدة, اثنان / اثنتان, ثلاثة / ثلاث, أحد عشر / إحدى عشرة, واحد
 * وعشرون / واحدة وعشرون, مئة وخمسة, ألفان وثلاثمئة. Zero is صفر; past
 * 99 999, and below zero, the number prints in digits.
 */
export function arabicCardinal(n: number, options: ArabicWordsOptions = {}): string {
  if (!Number.isSafeInteger(n) || n < 0 || n > MAX_CARDINAL_AR) return String(n);
  if (n === 0) return 'صفر';
  const gender = options.gender ?? 'masculine';
  const k = Math.floor(n / 1000);
  const rest = n % 1000;
  const words = joinAnd([k ? thousandsWords(k) : '', rest ? cardinalBelow1000(rest, gender) : '']);
  return spelled(words, options.spelling);
}

// --- Ordinals ---------------------------------------------------------------

const ORDINAL_UNITS: Record<ArabicGender, readonly string[]> = {
  masculine: ['', 'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر'],
  feminine: ['', 'الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة', 'السادسة', 'السابعة', 'الثامنة', 'التاسعة', 'العاشرة'],
};

/** The first unit inside a compound ordinal: الحادي عشر, الحادي والعشرون
 *  (not الأول). */
function compoundUnit(unit: number, gender: ArabicGender): string {
  if (unit === 1) return gender === 'feminine' ? 'الحادية' : 'الحادي';
  return ORDINAL_UNITS[gender][unit]!;
}

/** The ordinal 1–99: الأول … العاشر, الحادي عشر … التاسع عشر (feminine:
 *  الحادية عشرة), العشرون, الحادي والعشرون. 11–19 are indeclinable; the
 *  tens are nominative. */
function ordinalBelow100(n: number, gender: ArabicGender): string {
  if (n <= 10) return ORDINAL_UNITS[gender][n]!;
  if (n < 20) return `${compoundUnit(n - 10, gender)} ${gender === 'feminine' ? 'عشرة' : 'عشر'}`;
  const tens = `ال${TENS[Math.floor(n / 10)]}`;
  const unit = n % 10;
  return unit === 0 ? tens : joinAnd([compoundUnit(unit, gender), tens]);
}

/** A round number (a multiple of 100 below 10 000) made definite, every
 *  term with ال: المئة, الثلاثمئة, الألف, الألف والمئتان. The duals مئتان
 *  and ألفان take the genitive (مئتين, ألفين) after بعد. */
function definiteRound(n: number, genitive: boolean): string {
  const k = Math.floor(n / 1000);
  const h = Math.floor((n % 1000) / 100);
  const dual = (word: string): string => (genitive ? word.replace(/ان$/, 'ين') : word);
  let thousands = '';
  if (k === 1) thousands = 'الألف';
  else if (k === 2) thousands = dual('الألفان');
  else if (k > 2) thousands = `ال${CARDINAL_UNITS.masculine[k]} آلاف`;
  const hundreds = h === 0 ? '' : h === 2 ? dual('المئتان') : `ال${HUNDREDS[h]}`;
  return joinAnd([thousands, hundreds]);
}

/**
 * `n` as a definite Arabic ordinal, nominative, agreeing with a noun of
 * `gender`, as a heading names a chapter or a night: الأول / الأولى, الحادي
 * عشر / الحادية عشرة, الحادي والعشرون / الحادية والعشرون, المئة, الخامس
 * والأربعون بعد المئة, الحادية بعد المئتين, الخامسة والأربعون بعد الثلاثمئة,
 * الألف, الحادية بعد الألف. A round hundred or thousand is the definite
 * number itself (المئتان, الألف والمئة); any other number above 100 is
 * the ordinal of its last two digits "after" the round part. Past 9 999,
 * and below 1, the number prints in digits.
 */
export function arabicOrdinal(n: number, options: ArabicWordsOptions = {}): string {
  if (!Number.isSafeInteger(n) || n < 1 || n > MAX_ORDINAL_AR) return String(n);
  const gender = options.gender ?? 'masculine';
  const rest = n % 100;
  const round = n - rest;
  let words: string;
  if (round === 0) words = ordinalBelow100(rest, gender);
  else if (rest === 0) words = definiteRound(round, false);
  // One after a round number is the compound form, as in 21: الحادي بعد
  // المئة, الحادية بعد الألف (the alternatives الأولى / الواحدة بعد الألف
  // are not generated).
  else words = `${rest === 1 ? compoundUnit(1, gender) : ordinalBelow100(rest, gender)} بعد ${definiteRound(round, true)}`;
  return spelled(words, options.spelling);
}
