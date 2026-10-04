import { describe, it, expect } from 'vitest';
import { arabicCardinal, arabicOrdinal } from '../arabicNumberWords';
import { numberToWords } from '../numberWords';
import { computeHeadingNumbers, formatCounter } from '../numbering';
import { parseMarkdown } from '../parse';

// ---------------------------------------------------------------------------
// An independent reading of the generation rules of the typography brief
// (arabic-typography.md §7.4), written as the brief states them: a table of
// units, the compound unit for 1, عشر/عشرة for 11–19, unit + و + tens, and
// "rest بعد round" above 100 with the round part definite and genitive.

const UNITS_M = ['', 'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر'];
const UNITS_F = ['', 'الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة', 'السادسة', 'السابعة', 'الثامنة', 'التاسعة', 'العاشرة'];
const TENS_NOM: Record<number, string> = {
  20: 'العشرون', 30: 'الثلاثون', 40: 'الأربعون', 50: 'الخمسون', 60: 'الستون', 70: 'السبعون', 80: 'الثمانون', 90: 'التسعون',
};
const HUNDREDS_GEN: Record<number, string> = {
  100: 'المئة', 200: 'المئتين', 300: 'الثلاثمئة', 400: 'الأربعمئة', 500: 'الخمسمئة',
  600: 'الستمئة', 700: 'السبعمئة', 800: 'الثمانمئة', 900: 'التسعمئة', 1000: 'الألف',
};
const HUNDREDS_NOM: Record<number, string> = { ...HUNDREDS_GEN, 200: 'المئتان' };

function refBelow100(r: number, f: boolean): string {
  const units = f ? UNITS_F : UNITS_M;
  const compound = (u: number) => (u === 1 ? (f ? 'الحادية' : 'الحادي') : units[u]!);
  if (r <= 10) return units[r]!;
  if (r <= 19) return `${compound(r - 10)} ${f ? 'عشرة' : 'عشر'}`;
  if (r % 10 === 0) return TENS_NOM[r]!;
  return `${compound(r % 10)} و${TENS_NOM[r - (r % 10)]}`;
}

function refOrdinal(n: number, f: boolean): string {
  if (n < 100) return refBelow100(n, f);
  if (HUNDREDS_NOM[n]) return HUNDREDS_NOM[n]!;
  const base = n > 1000 ? 1000 : Math.floor(n / 100) * 100;
  const rest = n - base;
  // One after a round number: الحادي / الحادية, as in the brief's table.
  const restWord = rest === 1 ? (f ? 'الحادية' : 'الحادي') : refBelow100(rest, f);
  return `${restWord} بعد ${HUNDREDS_GEN[base]}`;
}

describe('Arabic ordinals', () => {
  it('the feminine ordinals of الليلة, 1 to 1001', () => {
    for (let n = 1; n <= 1001; n++) expect(arabicOrdinal(n, { gender: 'feminine' }), String(n)).toBe(refOrdinal(n, true));
  });

  it('the masculine ordinals of الفصل, 1 to 1001', () => {
    for (let n = 1; n <= 1001; n++) expect(arabicOrdinal(n), String(n)).toBe(refOrdinal(n, false));
  });

  it('the rows of the brief, word for word', () => {
    const rows: Array<[number, string, string]> = [
      [1, 'الأول', 'الأولى'],
      [2, 'الثاني', 'الثانية'],
      [3, 'الثالث', 'الثالثة'],
      [8, 'الثامن', 'الثامنة'],
      [10, 'العاشر', 'العاشرة'],
      [11, 'الحادي عشر', 'الحادية عشرة'],
      [12, 'الثاني عشر', 'الثانية عشرة'],
      [13, 'الثالث عشر', 'الثالثة عشرة'],
      [19, 'التاسع عشر', 'التاسعة عشرة'],
      [20, 'العشرون', 'العشرون'],
      [21, 'الحادي والعشرون', 'الحادية والعشرون'],
      [22, 'الثاني والعشرون', 'الثانية والعشرون'],
      [29, 'التاسع والعشرون', 'التاسعة والعشرون'],
      [30, 'الثلاثون', 'الثلاثون'],
      [90, 'التسعون', 'التسعون'],
      [100, 'المئة', 'المئة'],
      [101, 'الحادي بعد المئة', 'الحادية بعد المئة'],
      [110, 'العاشر بعد المئة', 'العاشرة بعد المئة'],
      [111, 'الحادي عشر بعد المئة', 'الحادية عشرة بعد المئة'],
      [120, 'العشرون بعد المئة', 'العشرون بعد المئة'],
      [145, 'الخامس والأربعون بعد المئة', 'الخامسة والأربعون بعد المئة'],
      [200, 'المئتان', 'المئتان'],
      [201, 'الحادي بعد المئتين', 'الحادية بعد المئتين'],
      [300, 'الثلاثمئة', 'الثلاثمئة'],
      [345, 'الخامس والأربعون بعد الثلاثمئة', 'الخامسة والأربعون بعد الثلاثمئة'],
      [900, 'التسعمئة', 'التسعمئة'],
      [1000, 'الألف', 'الألف'],
      [1001, 'الحادي بعد الألف', 'الحادية بعد الألف'],
    ];
    for (const [n, m, f] of rows) {
      expect(arabicOrdinal(n), `${n} m`).toBe(m);
      expect(arabicOrdinal(n, { gender: 'feminine' }), `${n} f`).toBe(f);
    }
  });

  it('every feminine ordinal agrees: no masculine unit, عشرة in the teens', () => {
    for (let n = 1; n <= 1001; n++) {
      const words = arabicOrdinal(n, { gender: 'feminine' }).split(/\s+/);
      expect(words.some((w) => /^و?ال(أول|حادي|ثاني|ثالث|رابع|خامس|سادس|سابع|ثامن|تاسع|عاشر)$/.test(w)), String(n)).toBe(false);
      if (n % 100 > 10 && n % 100 < 20) expect(words).toContain('عشرة');
    }
  });

  it('above a thousand and in the classical spelling', () => {
    expect(arabicOrdinal(1100)).toBe('الألف والمئة');
    expect(arabicOrdinal(1145, { gender: 'feminine' })).toBe('الخامسة والأربعون بعد الألف والمئة');
    expect(arabicOrdinal(1201)).toBe('الحادي بعد الألف والمئتين');
    expect(arabicOrdinal(2000)).toBe('الألفان');
    expect(arabicOrdinal(2001)).toBe('الحادي بعد الألفين');
    expect(arabicOrdinal(3333)).toBe('الثالث والثلاثون بعد الثلاثة آلاف والثلاثمئة');
    expect(arabicOrdinal(9999)).toBe('التاسع والتسعون بعد التسعة آلاف والتسعمئة');
    expect(arabicOrdinal(10_000)).toBe('10000');
    expect(arabicOrdinal(0)).toBe('0');
    expect(arabicOrdinal(100, { spelling: 'classical' })).toBe('المائة');
    expect(arabicOrdinal(201, { gender: 'feminine', spelling: 'classical' })).toBe('الحادية بعد المائتين');
    expect(arabicOrdinal(845, { spelling: 'classical' })).toBe('الخامس والأربعون بعد الثمانمائة');
  });
});

describe('Arabic cardinals', () => {
  it('count masculine and feminine nouns', () => {
    const rows: Array<[number, string, string]> = [
      [1, 'واحد', 'واحدة'],
      [2, 'اثنان', 'اثنتان'],
      [3, 'ثلاثة', 'ثلاث'],
      [8, 'ثمانية', 'ثماني'],
      [10, 'عشرة', 'عشر'],
      [11, 'أحد عشر', 'إحدى عشرة'],
      [12, 'اثنا عشر', 'اثنتا عشرة'],
      [13, 'ثلاثة عشر', 'ثلاث عشرة'],
      [19, 'تسعة عشر', 'تسع عشرة'],
      [20, 'عشرون', 'عشرون'],
      [21, 'واحد وعشرون', 'واحدة وعشرون'],
      [45, 'خمسة وأربعون', 'خمس وأربعون'],
      [99, 'تسعة وتسعون', 'تسع وتسعون'],
      [100, 'مئة', 'مئة'],
      [101, 'مئة وواحد', 'مئة وواحدة'],
      [200, 'مئتان', 'مئتان'],
      [345, 'ثلاثمئة وخمسة وأربعون', 'ثلاثمئة وخمس وأربعون'],
      [1000, 'ألف', 'ألف'],
      [1001, 'ألف وواحد', 'ألف وواحدة'],
      [2000, 'ألفان', 'ألفان'],
      [2345, 'ألفان وثلاثمئة وخمسة وأربعون', 'ألفان وثلاثمئة وخمس وأربعون'],
      [3000, 'ثلاثة آلاف', 'ثلاثة آلاف'],
      [10_000, 'عشرة آلاف', 'عشرة آلاف'],
      [11_000, 'أحد عشر ألفًا', 'أحد عشر ألفًا'],
      [21_500, 'واحد وعشرون ألفًا وخمسمئة', 'واحد وعشرون ألفًا وخمسمئة'],
    ];
    for (const [n, m, f] of rows) {
      expect(arabicCardinal(n), `${n} m`).toBe(m);
      expect(arabicCardinal(n, { gender: 'feminine' }), `${n} f`).toBe(f);
    }
    expect(arabicCardinal(0)).toBe('صفر');
    expect(arabicCardinal(100_000)).toBe('100000');
    expect(arabicCardinal(300, { spelling: 'classical' })).toBe('ثلاثمائة');
    expect(arabicCardinal(1200, { spelling: 'classical' })).toBe('ألف ومائتان');
  });
});

describe('templates in an Arabic document', () => {
  it('spell the counter with a gender and spelling modifier', () => {
    expect(numberToWords(1, 'ordinal', 'ar')).toBe('الأول');
    expect(numberToWords(1, 'ordinal', 'ar-EG', { gender: 'feminine' })).toBe('الأولى');
    expect(formatCounter(1001, 'ordinal-feminine', 'ar')).toBe('الحادية بعد الألف');
    expect(formatCounter(1001, 'ordinal-f', 'ar')).toBe('الحادية بعد الألف');
    expect(formatCounter(100, 'ordinal-f-classical', 'ar')).toBe('المائة');
    expect(formatCounter(11, 'words-feminine', 'ar')).toBe('إحدى عشرة');
    expect(formatCounter(11, 'words-m', 'ar')).toBe('أحد عشر');
    // Arabic has no capitals: the case variants print alike.
    expect(formatCounter(21, 'ORDINAL-F', 'ar')).toBe('الحادية والعشرون');
    expect(formatCounter(21, 'Ordinal', 'ar')).toBe('الحادي والعشرون');
    // Other languages ignore the modifiers.
    expect(formatCounter(21, 'Ordinal-feminine', 'en')).toBe('Twenty-first');
    expect(formatCounter(3, 'ordinal-f', 'es')).toBe('tercero');
  });

  it('number the nights and the chapters', () => {
    const blocks = parseMarkdown('# Alpha\n\n## Beta\n\n## Gamma\n\n# Delta {startAt=1001}');
    const prefixes = computeHeadingNumbers(blocks, { 1: 'الليلة {1:ordinal-feminine}: ', 2: 'الفصل {2:ordinal}: ' }, undefined, undefined, { locale: 'ar' });
    expect(prefixes).toEqual(['الليلة الأولى: ', 'الفصل الأول: ', 'الفصل الثاني: ', 'الليلة الحادية بعد الألف: ']);
  });

  it('an unknown modifier is no spelled style', () => {
    const blocks = parseMarkdown('# Alpha');
    expect(computeHeadingNumbers(blocks, { 1: '{1:ordinal-plural}' }, undefined, undefined, { locale: 'ar' })).toEqual(['1']);
  });
});
