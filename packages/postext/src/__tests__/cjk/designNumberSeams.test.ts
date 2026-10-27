import { describe, it, expect, afterEach } from 'vitest';
import { measureRichBlock } from '../../measure/rich.js';
import { measureBlock } from '../../measure/plain.js';
import { cachedMeasureBlock, createMeasurementCache } from '../../measure/index.js';
import { cjkCompositionOf, setCjkComposition, type CjkComposition } from '../../measure/cjk/cjkPunctuation.js';
import { resolveCjkConfig } from '../../defaults/text/cjk.js';
import { buildDocument } from '../../pipeline/index.js';
import type { DesignElement, Dimension, PostextConfig } from '../../types.js';
import type { MeasureBlockOptions } from '../../measure/types.js';
import type { VDTDesignTextBlock, VDTDocument, VDTLine } from '../../vdt.js';
import { installSizedStub } from '../vertical/stub.js';

// A number the layout wrote is not half of a number with the title a
// design text prints after it (#724). In Japanese text a 、 or ・ between
// two kanji numerals is set solid (二、三日, JLReq §3.1.3); a running head
// or a heading design that prints `{chapterNumber}{chapterTitle}` is one
// string, so 二、八月の行事 had its 、 at half an em. Column headings were
// fixed in #679 (`labelLength`); design text now passes the seams between
// its placeholders (`numberSeams`). The stub measures kana, kanji and
// full-width marks one em.
installSizedStub();
afterEach(() => setCjkComposition(undefined));

const FONT = '16px Test';
const comp = (locale = 'ja'): CjkComposition => cjkCompositionOf(resolveCjkConfig({}, locale), 96, locale);

function lines(text: string, width: number, options: MeasureBlockOptions = {}, locale = 'ja'): VDTLine[] {
  const all = { cjkComposition: comp(locale), textAlign: 'left' as const, ...options };
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

describe('numberSeams: where the rule of 二、三日 stops reading (#724)', () => {
  it('a mark whose unit ends at a seam, or starts at one, keeps its em', () => {
    expect(marks(lines('二、八月の行事', 2000)[0]!)).toEqual([8]);
    // The number and its mark, then the title.
    expect(marks(lines('二、八月の行事', 2000, { numberSeams: [2] })[0]!)).toEqual([16]);
    // The number, then a mark typed in the template, then the title.
    expect(marks(lines('二・三の法則', 2000, { numberSeams: [1] })[0]!)).toEqual([16]);
    expect(marks(lines('二・三の法則', 2000, { numberSeams: [2] })[0]!)).toEqual([16]);
  });

  it('a number on one side of the seams is read as before', () => {
    // 三、 then the title 二、三日の旅: the first mark ends the number, the
    // second is inside the title.
    expect(marks(lines('三、二、三日の旅', 2000, { numberSeams: [2] })[0]!)).toEqual([16, 8]);
    // A title between two seams.
    expect(marks(lines('第三・一四の話、二', 2000, { numberSeams: [1, 7] })[0]!)).toEqual([8, 16]);
    // A seam elsewhere in the text changes nothing.
    expect(marks(lines('二、三日の旅', 2000, { numberSeams: [4] })[0]!)).toEqual([8]);
    expect(marks(lines('二、三日の旅', 2000, { numberSeams: [0, 6, 99] })[0]!)).toEqual([8]);
  });

  it('is the list labelLength is one case of', () => {
    for (const text of ['二、八月の行事', '二、二、三日の旅', '一、三・一四の話']) {
      const label = lines(text, 2000, { labelLength: 2 })[0]!;
      const seam = lines(text, 2000, { numberSeams: [2] })[0]!;
      expect(marks(seam), text).toEqual(marks(label));
    }
  });

  it('a line may break after the number\'s mark, as after any 、', () => {
    // Two characters and a half to the line.
    expect(lines('二、八月の行事', 40, { numberSeams: [2] }).map((l) => l.text)).toEqual(['二、', '八月', 'の行', '事']);
    // Inside a number the mark is solid and the numeral after it stays with it.
    expect(lines('二、三日の旅', 40).map((l) => l.text)).toEqual(['二、三', '日の', '旅']);
  });

  it('joins the measurement cache key only when set', () => {
    const cache = createMeasurementCache();
    const options = { cjkComposition: comp(), textAlign: 'left' as const };
    const plain = cachedMeasureBlock('二、八月の行事', FONT, 2000, 24, options, cache);
    const seamed = cachedMeasureBlock('二、八月の行事', FONT, 2000, 24, { ...options, numberSeams: [2] }, cache);
    expect(marks(plain.lines[0]!)).toEqual([8]);
    expect(marks(seamed.lines[0]!)).toEqual([16]);
    // An empty list is no seam: the entry of the plain text.
    expect(marks(cachedMeasureBlock('二、八月の行事', FONT, 2000, 24, { ...options, numberSeams: [] }, cache).lines[0]!)).toEqual([8]);
    expect(marks(cachedMeasureBlock('二、八月の行事', FONT, 2000, 24, options, cache).lines[0]!)).toEqual([8]);
  });

  it('is Japan\'s: Chinese text has no such rule to stop', () => {
    const zh = lines('二、八月的活动', 2000, {}, 'zh-Hans')[0]!;
    const seamed = lines('二、八月的活动', 2000, { numberSeams: [2] }, 'zh-Hans')[0]!;
    expect(marks(seamed)).toEqual(marks(zh));
  });
});

// The same in documents: design text built from a number and a title.
const pt = (value: number): Dimension => ({ value, unit: 'pt' });
const text = (id: string, content: string, y: number, extra: Record<string, unknown> = {}): DesignElement => ({
  kind: 'text', id, content, fontSize: pt(10), overflow: 'wrap',
  placement: { anchor: { to: 'container', edge: 'top-left' }, offsetY: pt(y) },
  ...extra,
} as unknown as DesignElement);

function config(locale: string, extra: Partial<PostextConfig> = {}, head = '{chapterNumber}{chapterTitle}', design: DesignElement[] = [
  text('a', '{number}{titleText}', 0),
  text('b', '{numberHan}、{titleText}', 20),
  text('c', '二、三日の旅', 40),
]): PostextConfig {
  return {
    locale,
    page: { width: pt(400), height: pt(400), dpi: 72, margins: { top: pt(40), right: pt(20), bottom: pt(40), left: pt(20) } },
    bodyText: { fontFamily: 'Test Serif', fontSize: pt(10), lineHeight: pt(16), textAlign: 'left', firstLineIndent: pt(0) },
    layout: { layoutType: 'single' },
    header: { elements: [text('head', head, 0)] },
    footer: { elements: [] },
    headings: {
      levels: [
        { level: 1, numberingTemplate: '{1:一}、', breakBefore: { enabled: false } },
        {
          level: 2, numberingTemplate: '{2:一}、', fontSize: pt(10), lineHeight: pt(16),
          advancedDesign: { enabled: true, minHeight: pt(60), slot: { elements: design } },
        },
      ],
    } as PostextConfig['headings'],
    ...extra,
  };
}
// The second chapter is 二、 and its title opens with 八; so does the
// second section. The third section is titled 二、三日の旅.
const MD = '# 一月の行事\n\n本文。\n\n# 八月の行事\n\n## 夏祭りのお知らせ\n\n本文。\n\n## 八月の行事\n\n本文。\n\n## 二、三日の旅\n\n本文。\n';

/** Each line of a design text as its runs, `text:width` (one run when the
 *  composer changed no width). */
function shape(b: VDTDesignTextBlock): string[] {
  return b.lines.map((l) => (l.runs ? l.runs.map((r) => `${r.text}:${r.width}`).join(' ') : `${l.text}:${l.width}`));
}
/** The running heads, and the texts of each heading design by the place
 *  of their element in the design (`a`, `b`, `c`…), one per section. */
function designTexts(doc: VDTDocument): { head: VDTDesignTextBlock[]; byId: Map<string, VDTDesignTextBlock[]> } {
  const head: VDTDesignTextBlock[] = [];
  const byId = new Map<string, VDTDesignTextBlock[]>();
  for (const p of doc.pages) {
    for (const b of p.header?.blocks ?? []) if (b.kind === 'text') head.push(b);
    for (const c of p.columns) {
      for (const blk of c.blocks) {
        const texts = (blk.designOverlay?.blocks ?? []).filter((b): b is VDTDesignTextBlock => b.kind === 'text');
        texts.forEach((b, i) => {
          const id = 'abc'[i]!;
          byId.set(id, [...(byId.get(id) ?? []), b]);
        });
      }
    }
  }
  return { head, byId };
}

describe('design text built from a number and a title (#724)', () => {
  it('the 、 after the number keeps its em; the 、 of 二、三日 stays solid', () => {
    const { head, byId } = designTexts(buildDocument({ markdown: MD }, config('ja')));
    // The running head: {chapterNumber}{chapterTitle}.
    expect(shape(head[0]!)).toEqual(['二、八月の行事:70']);
    // {number}{titleText} for sections 一, 二 and 三.
    expect(byId.get('a')!.map(shape)).toEqual([['一、夏祭りのお知らせ:100'], ['二、八月の行事:70'], ['三、二:30 、:5 三日の旅:40']]);
    // {numberHan}、{titleText}: the mark typed in the template.
    expect(byId.get('b')!.map(shape)[1]).toEqual(['二、八月の行事:70']);
    // Literal text of the template is a number, as it reads.
    expect(byId.get('c')!.map(shape)[0]).toEqual(['二:10 、:5 三日の旅:40']);
  });

  it('a wrapped opener may break between its number and its title', () => {
    const narrow = [text('a', '{number}{titleText}', 0, { placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(20) } } })];
    const { byId } = designTexts(buildDocument({ markdown: MD }, config('ja', {}, '{chapterNumber}{chapterTitle}', narrow)));
    const second = byId.get('a')![1]!;
    expect(second.lines.map((l) => l.text)).toEqual(['二、', '八月', 'の行', '事']);
  });

  it('holds in a vertical document', () => {
    const vertical = config('ja', { layout: { layoutType: 'single', writingMode: 'vertical-rl' } });
    const { head, byId } = designTexts(buildDocument({ markdown: MD }, vertical));
    expect(shape(head[0]!)).toEqual(['二、八月の行事:70']);
    expect(byId.get('a')!.map(shape)[1]).toEqual(['二、八月の行事:70']);
  });

  it('two number placeholders side by side are read as before', () => {
    // Chapter 二 on page 一: a compound folio, 二・一.
    const cfg = config('ja', { page: { width: pt(400), height: pt(400), dpi: 72, margins: { top: pt(40), right: pt(20), bottom: pt(40), left: pt(20) }, pageNumbering: { format: 'cjk-decimal' } } }, '{chapterNumber}・{pageNumber}');
    cfg.headings!.levels![0]!.numberingTemplate = '{1:一}';
    const { head } = designTexts(buildDocument({ markdown: MD }, cfg));
    expect(head[0]!.lines[0]!.text).toBe('二・一');
    expect(shape(head[0]!)).toEqual(['二:10 ・:5 一:10']);
  });

  it('a title with inline marks, and one set in capitals', () => {
    const marked = [
      text('a', '{number}{titleText}', 0, { inlineMarks: true }),
      text('b', '{number}{titleText}', 20, { textTransform: 'uppercase' }),
    ];
    const md = '# 一月\n\n本文。\n\n# 二月\n\n## 一の話\n\n本文。\n\n## *八月*の行事abc\n\n本文。\n';
    const cfg = config('ja', {}, '{chapterNumber}{chapterTitle}', marked);
    const { byId } = designTexts(buildDocument({ markdown: md }, cfg));
    const widthOfMark = (b: VDTDesignTextBlock): number => {
      const l = b.lines[0]!;
      if (!l.runs) return 10;
      const run = l.runs.find((r) => r.text.includes('、'))!;
      return run.text === '、' ? run.width : 10;
    };
    expect(byId.get('a')![1]!.lines[0]!.text).toBe('二、八月の行事abc');
    expect(widthOfMark(byId.get('a')![1]!)).toBe(10);
    expect(byId.get('b')![1]!.lines[0]!.text.startsWith('二、')).toBe(true);
    expect(byId.get('b')![1]!.lines[0]!.text).toContain('ABC');
    expect(widthOfMark(byId.get('b')![1]!)).toBe(10);
  });

  it('a Chinese and a Latin document set their design text as before', () => {
    // No seam is looked for outside the Japan region: the design text
    // built from placeholders is set like the same text typed.
    for (const locale of ['zh-Hans', 'en']) {
      const typed = [text('a', '{number}{titleText}', 0), text('c', '二、八月の行事', 40)];
      const { byId } = designTexts(buildDocument({ markdown: MD }, config(locale, {}, '{chapterNumber}{chapterTitle}', typed)));
      expect(shape(byId.get('a')![1]!), locale).toEqual(shape(byId.get('b')![1]!));
    }
  });

  it('a column heading keeps the fix of #679', () => {
    const doc = buildDocument({ markdown: MD }, config('ja'));
    const headings = doc.blocks.filter((b) => b.type === 'heading' && b.lines.length > 0 && !b.designOverlay);
    const second = headings.find((b) => b.lines[0]!.text.includes('八月'))!;
    const number = second.lines[0]!.segments!.find((s) => s.text.includes('、'))!;
    expect(number.text).toBe('二、');
    expect(number.width / 2).toBeCloseTo(second.lines[0]!.segments!.find((s) => s.text.includes('八'))!.width / 5, 6);
  });
});
