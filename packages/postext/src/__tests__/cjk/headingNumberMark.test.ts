import { describe, it, expect, afterEach } from 'vitest';
import { measureRichBlock } from '../../measure/rich.js';
import { measureBlock } from '../../measure/plain.js';
import { cjkCompositionOf, setCjkComposition, type CjkComposition } from '../../measure/cjk/cjkPunctuation.js';
import { resolveCjkConfig } from '../../defaults/text/cjk.js';
import { buildDocument } from '../../pipeline/index.js';
import type { Dimension, PostextConfig } from '../../types.js';
import type { MeasureBlockOptions } from '../../measure/types.js';
import type { VDTDocument, VDTLine } from '../../vdt.js';
import { installSizedStub } from '../vertical/stub.js';

// A heading's number is not half of a number with its title (#679). In
// Japanese text a 、 or ・ between two kanji numerals is set solid (二、三日,
// 三・一四, JLReq §3.1.3); a numbered heading is measured as one string, so
// 二、八月の行事 (the second section, "Events in August") had its 、 at half
// an em where 一、… and 三、… kept theirs whole. The stub measures kana and
// kanji one em (16 px at 16 px).
installSizedStub();
afterEach(() => setCjkComposition(undefined));

const FONT = '16px Test';
const comp = (locale = 'ja'): CjkComposition => cjkCompositionOf(resolveCjkConfig({}, locale), 96, locale);

function lines(text: string, width: number, options: MeasureBlockOptions = {}): VDTLine[] {
  const all = { cjkComposition: comp(), textAlign: 'left' as const, ...options };
  const rich = measureRichBlock([{ text, bold: false, italic: false }], FONT, FONT, FONT, FONT, width, 24, all).lines;
  const plain = measureBlock(text, FONT, width, 24, all).lines;
  expect(plain.map((l) => l.text)).toEqual(rich.map((l) => l.text));
  return rich;
}

/** The advance of each 、 and ・ of a line, in order. */
function marks(line: VDTLine): number[] {
  const out: number[] = [];
  for (const seg of line.segments ?? []) {
    if (seg.kind === 'space') continue;
    const chars = [...seg.text];
    for (const ch of chars) if (ch === '、' || ch === '・') out.push(seg.width / chars.length);
  }
  return out;
}

describe('the mark that ends a heading number (#679)', () => {
  it('is set solid without the label, as a number is', () => {
    expect(marks(lines('二、八月の行事', 2000)[0]!)).toEqual([8]);
  });

  it('keeps its em when it ends the label', () => {
    expect(marks(lines('二、八月の行事', 2000, { labelLength: 2 })[0]!)).toEqual([16]);
    // A longer number: 第二、 then a title that opens with a numeral.
    expect(marks(lines('第二、三月の予定', 2000, { labelLength: 3 })[0]!)).toEqual([16]);
  });

  it('a number inside the title stays solid', () => {
    expect(marks(lines('二、二、三日の旅', 2000, { labelLength: 2 })[0]!)).toEqual([16, 8]);
    expect(marks(lines('一、三・一四の話', 2000, { labelLength: 2 })[0]!)).toEqual([16, 8]);
  });

  it('a label that ends in a numeral is not joined to a mark that opens the title', () => {
    expect(marks(lines('二・三の法則', 2000, { labelLength: 1 })[0]!)).toEqual([16]);
    expect(marks(lines('二・三の法則', 2000)[0]!)).toEqual([8]);
  });

  it('lets a line break after the label, as after any 、', () => {
    // 三 characters fit: without the label 二、八 may not break after its 、.
    const free = lines('あ二、八月', 48, { labelLength: 3 });
    expect(free.map((l) => l.text)).toEqual(['あ二、', '八月']);
    const number = lines('あ二、八月', 48);
    expect(number[0]!.text.endsWith('、')).toBe(false);
  });
});

const pt = (value: number): Dimension => ({ value, unit: 'pt' });

function config(vertical: boolean, template = '{2:一}、', separator = ''): PostextConfig {
  return {
    locale: 'ja',
    page: { width: pt(400), height: pt(400), dpi: 72, margins: { top: pt(20), right: pt(20), bottom: pt(20), left: pt(20) } },
    bodyText: { fontFamily: 'Test Serif', fontSize: pt(10), lineHeight: pt(16), textAlign: 'left', firstLineIndent: pt(0) },
    layout: { layoutType: 'single', ...(vertical ? { writingMode: 'vertical-rl' as const } : {}) },
    header: { elements: [] },
    footer: { elements: [] },
    headings: {
      levels: [
        { level: 1, numberingTemplate: '', breakBefore: { enabled: false } },
        { level: 2, numberingTemplate: template, numberSeparator: separator, fontSize: pt(10), lineHeight: pt(16) },
      ],
    },
  };
}

const MD = '# 東若葉台だより\n\n## 夏祭りのお知らせ\n\n本文。\n\n## 八月の行事\n\n本文。\n\n## 町会費のお願い\n\n本文。\n\n## 三・一四の話\n';

function headings(doc: VDTDocument): VDTLine[] {
  return doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks.filter((b) => b.type === 'heading' && b.headingLevel === 2).flatMap((b) => b.lines ?? [])));
}

describe('numbered headings 一、 二、 三、 in a Japanese document (#679)', () => {
  for (const vertical of [false, true]) {
    it(`every number keeps the em of its 、 (${vertical ? 'vertical' : 'horizontal'})`, () => {
      const hs = headings(buildDocument({ markdown: MD }, config(vertical)));
      expect(hs.map((l) => l.text)).toEqual(['一、夏祭りのお知らせ', '二、八月の行事', '三、町会費のお願い', '四、三・一四の話']);
      // The 、 of each number one em (10 px); the ・ of 三・一四 in the last
      // title is a decimal point, solid.
      expect(hs.map(marks)).toEqual([[10], [10], [10], [10, 5]]);
      // Each heading as long as its characters.
      expect(hs[1]!.bbox.width).toBeCloseTo(70, 6);
    });
  }

  it('a number joined to its title by a separator of its own', () => {
    // 二 then the separator 、: the same label, written the other way.
    const hs = headings(buildDocument({ markdown: MD }, config(false, '{2:一}', '、')));
    expect(hs.map((l) => l.text)).toEqual(['一、夏祭りのお知らせ', '二、八月の行事', '三、町会費のお願い', '四、三・一四の話']);
    expect(hs.map(marks)).toEqual([[10], [10], [10], [10, 5]]);
  });

  it('a number with no mark reads on into the title as before', () => {
    // 二 and a title that opens ・三: no label mark, nothing passed.
    const hs = headings(buildDocument({ markdown: '# 題\n\n## 甲\n\n## 乙\n\n## 三日の旅\n' }, config(false, '{2:一}', '　')));
    expect(hs.map((l) => l.text)).toEqual(['一　甲', '二　乙', '三　三日の旅']);
  });
});
