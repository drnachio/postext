import { describe, it, expect } from 'vitest';
import { lineRuns, markerRuns, resolveParagraph } from '../../writing/bidi.js';
import { buildDocument } from '../../pipeline/index.js';
import { createMeasurementCache } from '../../measure/index.js';
import { cachedMeasureBlock } from '../../measure/cache.js';
import { measureRichBlock } from '../../measure/rich.js';
import { getMeasureArabicNumbers, setMeasureArabicNumbers } from '../../measure/rtl/bidiLines.js';
import { arabicNumbersOf, resolveAllConfig } from '../../pipeline/config.js';
import type { PostextConfig, Resource } from '../../types.js';
import type { VDTBlock, VDTDocument, VDTLine } from '../../vdt.js';

// #665: in an Arabic-script document a European number with no letter
// before it reads as the numbers after the paragraph's letters do, as an
// Arabic number: `3-1` orders like `٣-١`, the 3 on the right, wherever it
// stands. Found on Cookbook Nº 109 (#660): a heading `3-1 …` against the
// caption `شكل 3-1`.

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

/** The runs of `text` from the sheet's left to its right. */
const order = (text: string, arabicNumbers = false, base: 'ltr' | 'rtl' = 'rtl'): string[] =>
  lineRuns(resolveParagraph(text, base, undefined, arabicNumbers ? { arabicNumbers: true } : undefined)).map((r) => text.slice(r.start, r.end));

describe('resolveParagraph: arabicNumbers', () => {
  it('UAX #9 as written orders a leading number one way and the same number after a letter the other', () => {
    expect(order('شكل 3-1')).toEqual(['1', '-', '3', 'شكل ']);
    expect(order('3-1 الأبواب')).toEqual([' الأبواب', '3-1']);
    expect(order('٣-١ الأبواب')).toEqual([' الأبواب', '١', '-', '٣']);
  });

  it('reads a number that opens an Arabic paragraph as the numbers after its letters', () => {
    expect(order('3-1 الأبواب', true)).toEqual([' الأبواب', '1', '-', '3']);
    // After a letter nothing changes, nor for Arabic-Indic digits.
    expect(order('شكل 3-1', true)).toEqual(order('شكل 3-1'));
    expect(order('٣-١ الأبواب', true)).toEqual(order('٣-١ الأبواب'));
  });

  it('reads a number with no letter at all as an Arabic number', () => {
    expect(order('3-1', true)).toEqual(['1', '-', '3']);
    expect(order('(3-1)', true)).toEqual([')', '1', '-', '3', '(']);
    expect(order('3-41', true)).toEqual(['41', '-', '3']);
    expect(order('3-1')).toEqual(['3-1']);
  });

  it('keeps a number whole: its digits, a solidus, a colon, a decimal point', () => {
    for (const text of ['1913 باب', '13/90 باب', '10:30 باب', '3.5 باب', '12 باب']) {
      expect(order(text, true).map((t) => t.trim()).filter(Boolean)).toEqual(order(text).map((t) => t.trim()).filter(Boolean));
    }
    expect(order('1913 باب', true)).toEqual([' باب', '1913']);
  });

  it('reads it so whatever follows: a Latin title keeps the book\'s order', () => {
    expect(order('3-1 Gates')).toEqual(['Gates', ' ', '3-1']);
    expect(order('3-1 Gates', true)).toEqual(['Gates', ' ', '1', '-', '3']);
  });

  it('leaves left-to-right paragraphs alone, and reads a right-to-left isolate inside one', () => {
    expect(order('3-1 Gates', true, 'ltr')).toEqual(['3-1 Gates']);
    expect(order('Gates 3-1 الأبواب', true, 'ltr')).toEqual(order('Gates 3-1 الأبواب', false, 'ltr'));
    const isolate = [{ start: 4, end: 15, direction: 'rtl' as const }];
    const text = 'See 3-1 الأبواب.';
    const runs = (arabicNumbers: boolean): string[] =>
      lineRuns(resolveParagraph(text, 'ltr', isolate, arabicNumbers ? { arabicNumbers: true } : undefined)).map((r) => text.slice(r.start, r.end));
    expect(runs(false)).toEqual(['See ', ' الأبواب', '3-1', '.']);
    expect(runs(true)).toEqual(['See ', ' الأبواب', '1', '-', '3', '.']);
  });

  it('a percent sign after a leading number goes to its left, as after a letter', () => {
    expect(order('نحو 50% منها', true)).toEqual(order('نحو 50% منها'));
    expect(order('50% منها', true)).toEqual(['% منها', '50']);
    expect(order('50% منها')).toEqual([' منها', '50%']);
  });
});

describe('markerRuns', () => {
  it('reads a marker at a right-to-left level, in visual order', () => {
    expect(markerRuns('1-', 'rtl')).toEqual([{ text: '-', start: 1, rtl: true }, { text: '1', start: 0 }]);
    expect(markerRuns('12-', 'rtl').map((r) => r.text)).toEqual(['-', '12']);
    expect(markerRuns('١.', 'rtl').map((r) => r.text)).toEqual(['.', '١']);
    expect(markerRuns('(١)', 'rtl')).toEqual([{ text: ')', start: 2, rtl: true }, { text: '١', start: 1 }, { text: '(', start: 0, rtl: true }]);
    expect(markerRuns('أ-', 'rtl')).toEqual([{ text: 'أ-', start: 0, rtl: true }]);
    expect(markerRuns('•', 'rtl')).toEqual([{ text: '•', start: 0, rtl: true }]);
  });

  it('orders a compound number as an Arabic one in an Arabic-script document', () => {
    expect(markerRuns('3-1', 'rtl').map((r) => r.text)).toEqual(['3-1']);
    expect(markerRuns('3-1', 'rtl-arabic').map((r) => r.text)).toEqual(['1', '-', '3']);
    expect(markerRuns('٣-١', 'rtl').map((r) => r.text)).toEqual(['١', '-', '٣']);
    expect(markerRuns('1-', 'rtl-arabic')).toEqual(markerRuns('1-', 'rtl'));
  });
});

const pt = (value: number) => ({ value, unit: 'pt' as const });
const PAGE = { width: pt(400), height: pt(500), dpi: 72, margins: { top: pt(30), bottom: pt(30), left: pt(30), right: pt(30) } };
const visual = (line: VDTLine): string[] => (line.order ?? line.segments!.map((_, i) => i)).map((i) => line.segments![i]!.text);
/** A line's segments from the sheet's left: a mirrored page's lines are
 *  ordered along its flow, which runs from the right. */
const onSheet = (doc: VDTDocument, line: VDTLine): string[] => (doc.config.direction === 'rtl' ? visual(line).reverse() : visual(line)).filter((t) => t.trim());

describe('arabicNumbersOf', () => {
  it('is on for a right-to-left document in the Arabic script only', () => {
    const of = (config: PostextConfig): boolean => arabicNumbersOf(resolveAllConfig(config));
    expect(of({ locale: 'ar' })).toBe(true);
    expect(of({ locale: 'ar-MA' })).toBe(true);
    expect(of({ locale: 'fa' })).toBe(true);
    expect(of({ locale: 'ur' })).toBe(true);
    expect(of({ locale: 'he' })).toBe(false);
    expect(of({ locale: 'en' })).toBe(false);
    expect(of({ locale: 'en', direction: 'rtl' })).toBe(false);
    expect(of({ locale: 'ar', direction: 'ltr' })).toBe(false);
  });
});

describe('a Maghreb edition orders its compound numbers as a Mashriq one', () => {
  const MD = ['# أبواب فاس {startAt=3}', '', '::resource{id="z"}', '', '## الأبواب الكبرى', '', 'نص الفقرة هنا.', '', '## Gates', '', 'نص.'].join('\n');
  const figure = { id: 'z', typeId: 'figure', kind: 'image', createdAt: 0, updatedAt: 0, width: 100, height: 40,
    placement: { position: 'here' }, caption: 'زليج' } as unknown as Resource;
  const config = (locale: string): PostextConfig => ({
    locale, page: PAGE, layout: { layoutType: 'single' },
    headings: { levels: [
      { level: 1, numberingTemplate: 'الفصل {1}', breakBefore: { enabled: false } },
      { level: 2, numberingTemplate: '{1}-{2}' },
    ] } as unknown as PostextConfig['headings'],
    header: { elements: [] }, footer: { elements: [] },
  });
  const build = (locale: string): VDTDocument => buildDocument({ markdown: MD, resources: [figure] }, config(locale), createMeasurementCache());
  const heading = (doc: VDTDocument, n: number): VDTBlock => doc.blocks.filter((b) => b.type === 'heading' && b.headingLevel === 2)[n]!;
  const caption = (doc: VDTDocument): VDTLine => [...doc.blocks, ...doc.pages.flatMap((p) => p.floats ?? [])].find((b) => b.type === 'resource')!.resourceBlock!.captionLines[0]!;

  it('the section number of a heading reads from the right, as in its caption', () => {
    const maghreb = build('ar-MA');
    const mashriq = build('ar');
    expect(heading(maghreb, 0).numberPrefix).toBe('3-1');
    expect(heading(mashriq, 0).numberPrefix).toBe('٣-١');
    // Sheet order, left to right: the title, then 1 - 3 (the chapter on the right).
    expect(onSheet(maghreb, heading(maghreb, 0).lines[0]!)).toEqual(['الكبرى', 'الأبواب', '1', '-', '3']);
    expect(onSheet(mashriq, heading(mashriq, 0).lines[0]!)).toEqual(['الكبرى', 'الأبواب', '١', '-', '٣']);
    const cap = onSheet(maghreb, caption(maghreb)).join(' ');
    expect(cap).toContain('1 - 3');
    expect(onSheet(mashriq, caption(mashriq)).join(' ')).toContain('١ - ٣');
  });

  it('a heading whose title is Latin orders its number as the others', () => {
    const maghreb = build('ar-MA');
    expect(onSheet(maghreb, heading(maghreb, 1).lines[0]!)).toEqual(['Gates', '2', '-', '3']);
  });

  it('no line moves: the heading keeps the width it was measured with', () => {
    const maghreb = build('ar-MA');
    const line = heading(maghreb, 0).lines[0]!;
    const widths = line.segments!.reduce((a, s) => a + s.width, 0);
    // 7 px a character in the stub: "3-1 الأبواب الكبرى" is 18 characters.
    expect(widths).toBeCloseTo(18 * 7, 6);
  });

  it('a Hebrew document resolves as UAX #9 writes it', () => {
    const doc = buildDocument({ markdown: '## שערים\n\nטקסט.' }, { ...config('he'), headings: { levels: [{ level: 2, numberingTemplate: '3-{2}' }] } as unknown as PostextConfig['headings'] }, createMeasurementCache());
    const h = doc.blocks.find((b) => b.type === 'heading')!;
    expect(onSheet(doc, h.lines[0]!)).toEqual(['שערים', '3-1']);
  });
});

describe('the measurer', () => {
  const FONT = '16px Test';
  const spans = [{ text: '3-1 الأبواب', bold: false, italic: false }];

  it('reads the build\'s setting, off outside a build', () => {
    expect(getMeasureArabicNumbers()).toBe(false);
    const plain = measureRichBlock(spans, FONT, FONT, FONT, FONT, 1000, 20, { direction: 'rtl' }).lines[0]!;
    expect(visual(plain)).toEqual(['الأبواب', ' ', '3-1']);
    setMeasureArabicNumbers(true);
    try {
      const arabic = measureRichBlock(spans, FONT, FONT, FONT, FONT, 1000, 20, { direction: 'rtl' }).lines[0]!;
      expect(visual(arabic)).toEqual(['الأبواب', ' ', '1', '-', '3']);
    } finally {
      setMeasureArabicNumbers(false);
    }
  });

  it('keys its cache on it', () => {
    const cache = createMeasurementCache();
    const measure = (): VDTLine => cachedMeasureBlock('3-1 الأبواب', FONT, 1000, 20, { direction: 'rtl' }, cache).lines[0]!;
    const plain = visual(measure());
    setMeasureArabicNumbers(true);
    let arabic: string[];
    try {
      arabic = visual(measure());
    } finally {
      setMeasureArabicNumbers(false);
    }
    expect(plain).toEqual(['الأبواب', ' ', '3-1']);
    expect(arabic).toEqual(['الأبواب', ' ', '1', '-', '3']);
    expect(visual(measure())).toEqual(plain);
  });

  it('puts the setting back after a build', () => {
    buildDocument({ markdown: 'نص.' }, { locale: 'ar-MA', page: PAGE }, createMeasurementCache());
    expect(getMeasureArabicNumbers()).toBe(false);
  });
});
