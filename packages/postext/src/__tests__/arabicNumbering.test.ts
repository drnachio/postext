import { describe, it, expect } from 'vitest';
import {
  ARABIC_NUMERAL_STYLES,
  buildPageLabels,
  computeHeadingNumbers,
  documentNumeralStyle,
  formatCounter,
  formatNumeral,
  headingCounterStart,
  parseNumberFormat,
} from '../numbering';
import { abjadNumeral, arabicLettering, asciiDigits, withDigits, ABJAD_LETTERS, HIJAI_LETTERS } from '../arabicNumerals';
import { defaultNumeralsFor, resolveNumerals } from '../locale';
import { formatListNumber } from '../pipeline/lists';
import { parsePartNumber } from '../pipeline/parts';
import { continuationAfter } from '../pipeline/continuation';
import { resolveAllConfig } from '../pipeline/config';
import { parseMarkdown, spaceDirectiveLines } from '../parse';
import { buildDocument } from '../pipeline';
import { createMeasurementCache } from '../measure';
import { collectConfigWarnings } from '../configWarnings';
import { stripConfigDefaults } from '../defaults';
import type { NumeralsSetting, PostextConfig, Resource } from '../types';
import type { VDTDocument } from '../vdt';

// Deterministic text measurement stub (no DOM in the node test env).
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const PAGE = { width: pt(400), height: pt(500), margins: { top: pt(30), bottom: pt(30), left: pt(30), right: pt(30) } };

describe('Arabic numeral styles', () => {
  it('writes Arabic-Indic and Persian digits, each with its own zero', () => {
    expect(formatNumeral(2026, 'arabic-indic')).toBe('٢٠٢٦');
    expect(formatNumeral(7, 'arabic-indic')).toBe('٧');
    expect(formatNumeral(0, 'arabic-indic')).toBe('٠');
    expect(formatNumeral(1446, 'persian')).toBe('۱۴۴۶');
    expect(formatNumeral(0, 'persian')).toBe('۰');
    expect(formatNumeral(-3, 'arabic-indic')).toBe('');
  });

  it('writes additive abjad numerals, highest value first', () => {
    const cases: Array<[number, string]> = [
      [1, 'ا'], [2, 'ب'], [4, 'د'], [9, 'ط'], [10, 'ي'], [11, 'يا'], [15, 'يه'], [19, 'يط'],
      [20, 'ك'], [99, 'صط'], [100, 'ق'], [400, 'ت'], [900, 'ظ'], [1000, 'غ'],
      [1002, 'غب'], [2000, 'بغ'], [1446, 'غتمو'], [1835, 'غضله'], [12_000, 'يبغ'],
    ];
    for (const [n, text] of cases) expect(formatNumeral(n, 'arabic-abjad'), String(n)).toBe(text);
    expect(formatNumeral(0, 'arabic-abjad')).toBe('');
    expect(abjadNumeral(1_000_000)).toBe('1000000');
  });

  it('a heh that would stand alone takes a tatweel, a joined one does not', () => {
    expect(formatNumeral(5, 'arabic-abjad')).toBe('هـ');
    // After ا (1), ر (200), و (6) — letters that do not join forward.
    expect(formatNumeral(205, 'arabic-abjad')).toBe('رهـ');
    expect(formatNumeral(1005, 'arabic-abjad')).toBe('غه');
    expect(formatNumeral(5000, 'arabic-abjad')).toBe('هغ');
    expect(formatNumeral(45, 'arabic-abjad')).toBe('مه');
  });

  it('writes the Maghrebi values', () => {
    const cases: Array<[number, string]> = [
      [50, 'ن'], [60, 'ص'], [90, 'ض'], [300, 'س'], [800, 'ظ'], [900, 'غ'], [1000, 'ش'], [1446, 'شتمو'], [2000, 'بش'],
    ];
    for (const [n, text] of cases) expect(formatNumeral(n, 'arabic-abjad-maghrebi'), String(n)).toBe(text);
  });

  it('letters list items in abjad and in alphabetical order, doubling past 28', () => {
    expect([1, 2, 3, 4, 5, 6].map((n) => formatNumeral(n, 'abjad'))).toEqual(['أ', 'ب', 'ج', 'د', 'هـ', 'و']);
    expect(formatNumeral(28, 'abjad')).toBe('غ');
    expect(formatNumeral(29, 'abjad')).toBe('أأ');
    expect(formatNumeral(57, 'abjad')).toBe('بأ');
    expect([1, 2, 3, 4].map((n) => formatNumeral(n, 'hijai'))).toEqual(['أ', 'ب', 'ت', 'ث']);
    expect(formatNumeral(26, 'hijai')).toBe('هـ');
    expect(formatNumeral(28, 'hijai')).toBe('ي');
    expect(formatNumeral(29, 'hijai')).toBe('أأ');
    expect(ABJAD_LETTERS).toHaveLength(28);
    expect(HIJAI_LETTERS).toHaveLength(28);
    expect(new Set(ABJAD_LETTERS)).toEqual(new Set(HIJAI_LETTERS));
    // A doubled marker ending in heh: alone after د, joined after ب.
    expect(arabicLettering(4 * 28 + 5, ABJAD_LETTERS)).toBe('دهـ');
    expect(arabicLettering(2 * 28 + 5, ABJAD_LETTERS)).toBe('به');
    expect(formatNumeral(0, 'abjad')).toBe('');
  });

  it('reads every name, alias and token of the Arabic styles', () => {
    for (const style of ARABIC_NUMERAL_STYLES) expect(parseNumberFormat(style)).toBe(style);
    expect(parseNumberFormat('Arabic-Indic')).toBe('arabic-indic');
    expect(parseNumberFormat('urdu')).toBe('persian');
    expect(parseNumberFormat('maghrebi-abjad')).toBe('arabic-abjad-maghrebi');
    expect(parseNumberFormat('arabic-alpha')).toBe('hijai');
    expect(parseNumberFormat('arabic-alphabetic')).toBe('hijai');
    expect(parseNumberFormat('١')).toBe('arabic-indic');
    expect(parseNumberFormat('۱')).toBe('persian');
    expect(parseNumberFormat('أبجد')).toBe('abjad');
    expect(parseNumberFormat('أبتث')).toBe('hijai');
    // `arabic` keeps its old meaning: European decimal.
    expect(parseNumberFormat('arabic')).toBe('decimal');
    expect(parseNumberFormat('أ')).toBeUndefined();
  });

  it('number heading templates with the tokens', () => {
    const blocks = parseMarkdown('# Alpha\n\n## Beta\n\n## Gamma\n\n# Delta');
    expect(computeHeadingNumbers(blocks, { 1: 'الباب {1:١}', 2: '{1:١}-{2:أبجد}' })).toEqual([
      'الباب ١', '١-أ', '١-ب', 'الباب ٢',
    ]);
  });
});

describe('document digits', () => {
  it('follow the language: Mashriq Arabic ٠–٩, the Maghreb 0–9, Persian ۰–۹', () => {
    const table: Array<[string | undefined, string]> = [
      ['ar', 'arab'], ['ar-EG', 'arab'], ['ar-SA', 'arab'], ['ar-AE', 'arab'], ['ar-LB', 'arab'], ['ar-001', 'arab'],
      ['ar-MA', 'latn'], ['ar-DZ', 'latn'], ['ar-TN', 'latn'], ['ar-LY', 'latn'], ['ar-MR', 'latn'], ['ar_EH', 'latn'],
      ['fa', 'arabext'], ['fa-AF', 'arabext'], ['ps', 'arabext'], ['ur-IN', 'arabext'], ['ur', 'latn'], ['ur-PK', 'latn'],
      ['en-us', 'latn'], ['es', 'latn'], ['zh-Hant', 'latn'], ['he', 'latn'], [undefined, 'latn'], ['', 'latn'],
      ['ar-MA-u-nu-arab', 'arab'], ['ar-u-nu-latn', 'latn'], ['fa-u-nu-arab', 'arab'],
    ];
    for (const [tag, digits] of table) expect(defaultNumeralsFor(tag), String(tag)).toBe(digits);
    expect(resolveNumerals('latn', 'ar')).toBe('latn');
    expect(resolveNumerals('auto', 'ar')).toBe('arab');
    expect(resolveNumerals('hindi' as NumeralsSetting, 'fa')).toBe('arabext');
  });

  it('rewrite only the ASCII digits of a generated string', () => {
    expect(withDigits('12-3', 'arab')).toBe('١٢-٣');
    expect(withDigits('12-3', 'arabext')).toBe('۱۲-۳');
    expect(withDigits('12-3', 'latn')).toBe('12-3');
    expect(withDigits('12-3', undefined)).toBe('12-3');
    expect(asciiDigits('٣٤ and ۵۶ and 7')).toBe('34 and 56 and 7');
  });

  it('turn decimal into the document digits and leave a named style alone', () => {
    expect(documentNumeralStyle('decimal', 'arab')).toBe('arabic-indic');
    expect(documentNumeralStyle('decimal', 'arabext')).toBe('persian');
    expect(documentNumeralStyle('decimal', 'latn')).toBe('decimal');
    expect(documentNumeralStyle('lower-roman', 'arab')).toBe('lower-roman');
    expect(formatNumeral(7, 'decimal-02', 'arab')).toBe('٠٧');
    expect(formatNumeral(12, 'decimal', 'arabext')).toBe('۱۲');
    expect(formatNumeral(0, 'decimal', 'arab')).toBe('');
    expect(formatNumeral(4, 'upper-roman', 'arab')).toBe('IV');
    expect(formatCounter(3, 'decimal', 'ar', 'arab')).toBe('٣');
    expect(formatListNumber(3, 'arabic', 'arab')).toBe('٣');
    expect(formatListNumber(0, 'arabic', 'arab')).toBe('٠');
    expect(formatListNumber(4000, 'upper-roman', 'arab')).toBe('٤٠٠٠');
    expect(formatListNumber(0, 'persian')).toBe('۰');
    expect(formatListNumber(5, 'lower-roman', 'arab')).toBe('v');
  });

  it('label pages in the document digits and record the style they print', () => {
    const labels = buildPageLabels(3, [{ startPageIndex: 0, format: 'decimal', startAt: 9 }], 'arab');
    expect(labels.map((l) => l.label)).toEqual(['٩', '١٠', '١١']);
    expect(labels.map((l) => l.format)).toEqual(['arabic-indic', 'arabic-indic', 'arabic-indic']);
    const roman = buildPageLabels(2, [{ startPageIndex: 0, format: 'lower-roman', startAt: 1 }], 'arab');
    expect(roman.map((l) => [l.label, l.format])).toEqual([['i', 'lower-roman'], ['ii', 'lower-roman']]);
    expect(buildPageLabels(2, [], 'arabext').map((l) => l.label)).toEqual(['۱', '۲']);
  });

  it('resolve only when not European, so a Latin config resolves as before', () => {
    expect(resolveAllConfig({ locale: 'en' }).numerals).toBeUndefined();
    expect('numerals' in resolveAllConfig({ locale: 'ar-MA' })).toBe(false);
    expect(resolveAllConfig({ locale: 'ar' }).numerals).toBe('arab');
    expect(resolveAllConfig({ locale: 'ar', numerals: 'latn' }).numerals).toBeUndefined();
    expect(resolveAllConfig({ locale: 'en', numerals: 'arabext' }).numerals).toBe('arabext');
    expect(resolveAllConfig({ bodyText: { hyphenation: { locale: 'fa' } } }).numerals).toBe('arabext');
  });

  it('report an unknown value and drop the default', () => {
    expect(collectConfigWarnings({ locale: 'ar', numerals: 'hindi' as NumeralsSetting })).toEqual([
      { kind: 'unknownNumerals', path: 'numerals', value: 'hindi', used: 'arab' },
    ]);
    expect(collectConfigWarnings({ numerals: 'arab' })).toEqual([]);
    expect(collectConfigWarnings({ orderedLists: { numberFormat: 'abjad' }, page: { pageNumbering: { format: 'arabic-indic' } } })).toEqual([]);
    expect(stripConfigDefaults({ numerals: 'auto' }).numerals).toBeUndefined();
    expect(stripConfigDefaults({ numerals: 'latn' }).numerals).toBe('latn');
  });
});

describe('reading Arabic digits', () => {
  it('in part numbers, start values, space lines and list markers', () => {
    expect(parsePartNumber('٣')).toBe(3);
    expect(parsePartNumber('۱۲')).toBe(12);
    expect(headingCounterStart({ attrs: { startAt: '٤' } })).toBe(4);
    expect(spaceDirectiveLines({ lines: '٢' })).toBe(2);
    const [list] = parseMarkdown('٣. Alpha\n٤. Beta');
    expect(list!.type).toBe('listItem');
    expect(list!.startNumber).toBe(3);
    expect(parseMarkdown('۷) Alpha')[0]!.startNumber).toBe(7);
    // Digits of two systems in one marker are not a number.
    expect(parseMarkdown('٣3. Alpha')[0]!.type).toBe('paragraph');
  });
});

describe('a document in Arabic digits', () => {
  const figure: Resource = {
    id: 'plate', typeId: 'figure', kind: 'bitmap', caption: 'Plate', createdAt: 0, updatedAt: 0,
    bitmap: { fileId: 'p.png', format: 'png', width: 120, height: 60 },
  };
  const md = [
    '# Alpha',
    'Text Beta[^n] see :ref{id="plate"}.',
    '1. One',
    '2. Two',
    '::resource{id="plate"}',
    '# Gamma {startAt=٥}',
    'Text Delta.',
    '[^n]: Note Epsilon.',
  ].join('\n\n');
  const config = (extra: PostextConfig = {}): PostextConfig => ({
    locale: 'ar',
    page: PAGE,
    bodyText: { hyphenation: { enabled: false } },
    headings: { levels: [{ level: 1, numberingTemplate: '{1}. ', breakBefore: { enabled: true } }] },
    footer: { elements: [{ kind: 'text', id: 'f', content: '{pageNumber}/{totalPages} {chapterNumber}', placement: { anchor: { to: 'container', edge: 'top-left' } } }] } as unknown as PostextConfig['footer'],
    resourceTypes: [{
      id: 'figure', name: 'Figure', pluralName: 'Figures', shortLabel: 'Fig.', numberingTemplate: '{h1}.{n}', resetOn: 'h1',
      counterFormat: 'decimal', captionPrefix: 'Figure', refTemplate: 'Fig. {n}', placement: 'auto',
    }] as unknown as PostextConfig['resourceTypes'],
    ...extra,
  });
  const build = (extra?: PostextConfig): VDTDocument =>
    buildDocument({ markdown: md, resources: [figure] }, config(extra), createMeasurementCache());
  const footerText = (doc: VDTDocument, page: number): string =>
    (doc.pages[page]!.footer?.blocks ?? []).flatMap((b) => (b.kind === 'text' ? b.lines.map((l) => l.text) : [])).join('');

  it('prints every generated number in ٠–٩', () => {
    const doc = build();
    // The second chapter opens on a recto, after a blank verso.
    expect(doc.pages.map((p) => p.pageLabel)).toEqual(['١', '٢', '٣']);
    expect(doc.pages[0]!.pageNumberFormat).toBe('arabic-indic');
    expect(doc.blocks.filter((b) => b.type === 'heading').map((b) => b.numberPrefix)).toEqual(['١. ', '٥. ']);
    expect(doc.blocks.filter((b) => b.type === 'listItem').map((b) => b.bulletText)).toEqual(['١.', '٢.']);
    const marker = doc.blocks.flatMap((b) => b.lines).flatMap((l) => l.segments ?? []).find((s) => s.footnoteId === 'n');
    expect(marker?.text).toBe('١');
    const note = doc.blocks.find((b) => b.footnoteNote === 'n')!;
    expect(note.lines[0]!.text.startsWith('١')).toBe(true);
    const all = [...doc.blocks, ...doc.pages.flatMap((p) => p.floats ?? [])];
    const caption = all.find((b) => b.type === 'resource')!.resourceBlock!.captionLines!.map((l) => l.text).join('');
    expect(caption).toContain('١.١');
    expect(footerText(doc, 0)).toBe('١/٣ ١.');
    expect(footerText(doc, 2)).toBe('٣/٣ ٥.');
  });

  it('keeps a style the author names', () => {
    const doc = build({
      page: { ...PAGE, pageNumbering: { format: 'lower-roman' } },
      orderedLists: { numberFormat: 'abjad', separator: '-' },
    });
    expect(doc.pages.map((p) => p.pageLabel)).toEqual(['i', 'ii', 'iii']);
    expect(doc.blocks.filter((b) => b.type === 'listItem').map((b) => b.bulletText)).toEqual(['أ-', 'ب-']);
  });

  it('prints European digits in the Maghreb, or when the config says so', () => {
    for (const extra of [{ locale: 'ar-MA' }, { numerals: 'latn' as const }]) {
      const doc = build(extra);
      expect(doc.pages.map((p) => p.pageLabel), JSON.stringify(extra)).toEqual(['1', '2', '3']);
      expect(doc.pages[0]!.pageNumberFormat).toBe('decimal');
      expect(footerText(doc, 2)).toBe('3/3 5.');
    }
  });

  it('a Latin document with numerals: latn lays out exactly as one without', () => {
    const latin = (extra: PostextConfig) => {
      const doc = buildDocument({ markdown: md, resources: [figure] }, { ...config(extra), locale: 'en' }, createMeasurementCache());
      return JSON.stringify({ ...doc, config: undefined });
    };
    expect(latin({ numerals: 'latn' })).toBe(latin({}));
    expect(latin({ numerals: 'auto' })).toBe(latin({}));
    expect(latin({ numerals: 'arabext' })).not.toBe(latin({}));
  });

  it('numbers resources carried to the next chapter in the same digits', () => {
    const next = continuationAfter({ markdown: md, resources: [figure] }, config());
    expect(next.resourceNumbers?.plate?.number).toBe('١.١');
  });
});
