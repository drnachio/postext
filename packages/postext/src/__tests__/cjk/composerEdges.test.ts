import { describe, it, expect, afterEach } from 'vitest';
import { measureRichBlock } from '../../measure/rich';
import { measureBlock } from '../../measure/plain';
import { linkSegments } from '../../measure/links';
import { buildDocument, cachedMeasureRichBlock, createMeasurementCache } from '../../index';
import type { PostextConfig } from '../../types';
import { hasCJK } from '../../measure/cjk';
import { cjkClassOf, setCjkLineBreak, type CjkLineBreakLevel } from '../../measure/cjkClasses';
import { setCjkComposition } from '../../measure/cjkPunctuation';
import type { InlineSpan } from '../../parse';
import type { MeasureBlockOptions } from '../../measure/types';
import type { VDTLine } from '../../vdt';

// The composer's edge cases: links, segments the caret can map, spaces next
// to marks, unit squares, fullwidth numbers, CJK text without a run of two
// letters, long Western runs and lines with no CJK gap.

// Stub: CJK characters and the marks Chinese sets full width are 16 px, a
// space 4 px, everything else 8 px; `chars` counts what reaches measureText.
let chars = 0;
const FULL = new Set(['—', '…', '·', '“', '”', '‘', '’']);
function charWidth(ch: string): number {
  const cp = ch.codePointAt(0)!;
  if (ch === ' ') return 4;
  return cp >= 0x2e80 || FULL.has(ch) ? 16 : 8;
}
class StubCtx {
  font = '';
  letterSpacing = '0px';
  measureText(s: string): { width: number } {
    let w = 0;
    for (const ch of s) w += charWidth(ch);
    chars += s.length;
    return { width: w };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const FONT = '16px Test';
const run = (text: string, bold = false): InlineSpan => ({ text, bold, italic: false });
const texts = (lines: VDTLine[]): string[] => lines.map((l) => l.text);
const width = (l: VDTLine): number => l.segments!.reduce((s, seg) => s + seg.width, 0);
const LEVELS: CjkLineBreakLevel[] = ['none', 'basic', 'gb', 'strict'];

afterEach(() => {
  setCjkLineBreak('gb');
  setCjkComposition(undefined);
});

function both(text: string, w: number, options: MeasureBlockOptions = {}): string[] {
  const plain = texts(measureBlock(text, FONT, w, 20, options).lines);
  const rich = texts(measureRichBlock([run(text)], FONT, FONT, FONT, FONT, w, 20, options).lines);
  expect(rich).toEqual(plain);
  return plain;
}

/** The largest distance between where the caret math puts each offset of a
 *  line (linearly over each segment's UTF-16 units, as the Sandbox does for
 *  an untracked segment) and where the stub paints it. */
function caretError(line: VDTLine): number {
  const truth: number[] = [];
  let tx = 0;
  for (const seg of line.segments!) {
    for (const ch of seg.text) {
      for (let k = 0; k < ch.length; k++) truth.push(tx);
      tx += seg.kind === 'space' ? seg.width / [...seg.text].length : charWidth(ch) + (seg.tracking ?? 0);
    }
  }
  let x = 0;
  let at = 0;
  let worst = 0;
  for (const seg of line.segments!) {
    for (let i = 0; i < seg.text.length; i++) worst = Math.max(worst, Math.abs(x + (i / seg.text.length) * seg.width - truth[at + i]!));
    x += seg.width;
    at += seg.text.length;
  }
  return worst;
}

describe('links', () => {
  it('stamp the link on the linked characters only', () => {
    const text = '请点击这里查看详情，然后返回首页继续阅读本书的其他章节。';
    const spans: InlineSpan[] = [{ ...run(text), links: [{ start: 3, end: 5, href: 'https://example.org' }] }];
    for (const align of ['left', 'justify'] as const) {
      const lines = linkSegments(measureRichBlock(spans, FONT, FONT, FONT, FONT, 160, 20, { textAlign: align }).lines, spans);
      const linked = lines.flatMap((l) => l.segments!).filter((s) => s.href !== undefined);
      expect(linked.map((s) => s.text).join('')).toBe('这里');
      // The line is still one text, set as before.
      expect(texts(lines).join('')).toBe(text);
    }
  });

  it('stamp the link on its characters in a built paragraph, with or without formatting', () => {
    const pt = (value: number) => ({ value, unit: 'pt' as const });
    const config: PostextConfig = {
      locale: 'zh-Hans',
      page: { width: pt(221), height: pt(400), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
      layout: { layoutType: 'single' },
      header: { elements: [] },
      footer: { elements: [] },
      bodyText: { fontSize: pt(16), lineHeight: pt(24), textAlign: 'justify', firstLineIndent: pt(0), hyphenation: { enabled: false } },
    };
    for (const markdown of [
      '请点击[这里](https://example.org)查看详情，然后返回首页继续阅读本书的其他章节。',
      '请点击[这里](https://example.org)查看详情，然后**返回**首页继续阅读本书的其他章节。',
    ]) {
      const doc = buildDocument({ markdown }, config);
      const segments = doc.blocks.flatMap((b) => b.lines).flatMap((l) => l.segments ?? []);
      expect(segments.filter((seg) => seg.href !== undefined).map((seg) => seg.text).join('')).toBe('这里');
    }
  });

  it('keep link ranges apart in the measurement cache', () => {
    const cache = createMeasurementCache();
    const text = '请点击这里查看详情，然后返回首页继续阅读本书的其他章节。';
    const plain = cachedMeasureRichBlock([run(text)], FONT, FONT, FONT, FONT, 160, 20, {}, cache);
    const spans: InlineSpan[] = [{ ...run(text), links: [{ start: 3, end: 5, href: 'https://example.org' }] }];
    const linked = linkSegments(cachedMeasureRichBlock(spans, FONT, FONT, FONT, FONT, 160, 20, {}, cache).lines, spans);
    expect(plain.lines[0]!.segments!.length).toBe(1);
    expect(linked.flatMap((l) => l.segments!).filter((seg) => seg.href).map((seg) => seg.text).join('')).toBe('这里');
  });

  it('cut a Western run at a link edge without changing the lines', () => {
    const text = '请访问iPhone官网了解详情和价格。';
    const plain = texts(measureRichBlock([run(text)], FONT, FONT, FONT, FONT, 120, 20, {}).lines);
    const spans: InlineSpan[] = [{ ...run(text), links: [{ start: 4, end: 9, href: 'https://example.org' }] }];
    const lines = linkSegments(measureRichBlock(spans, FONT, FONT, FONT, FONT, 120, 20, {}).lines, spans);
    expect(texts(lines)).toEqual(plain);
    expect(lines.flatMap((l) => l.segments!).filter((s) => s.href).map((s) => s.text).join('')).toBe('Phone');
  });
});

describe('segments the caret can map', () => {
  it('never join a Western run and CJK characters in one segment', () => {
    const text = '1999年的iPhone 15售价为¥5,999。我们买了';
    for (const align of ['left', 'justify'] as const) {
      for (const w of [120, 200, 400]) {
        for (const line of measureBlock(text, FONT, w, 20, { textAlign: align }).lines) {
          expect(caretError(line)).toBeLessThan(1e-6);
          for (const s of line.segments!) {
            if (s.kind !== 'text') continue;
            const kinds = new Set([...s.text].map((ch) => charWidth(ch)));
            expect(kinds.size).toBe(1);
          }
        }
      }
    }
  });

  it('keep a line of plain Chinese in one segment', () => {
    const lines = measureBlock('此开卷第一回也作者自云因曾历过一番梦幻之后', FONT, 160, 20, { textAlign: 'left' }).lines;
    for (const l of lines) expect(l.segments!.length).toBe(1);
  });
});

describe('breaks at a space', () => {
  it('keep a number with its unit across a space, at every level', () => {
    for (const level of LEVELS) {
      for (let w = 64; w <= 128; w += 8) {
        const lines = both('今天气温是−3 ℃，很冷', w, { cjkLineBreak: level });
        for (const l of lines) expect(l.startsWith('℃')).toBe(false);
        const pct = both('约为50 %。好的', w, { cjkLineBreak: level });
        for (const l of pct) expect(l.startsWith('%')).toBe(false);
      }
    }
  });

  it('never open a line with a closing mark or end one with an opening mark after a space', () => {
    for (let w = 64; w <= 144; w += 8) {
      const lines = both('参见图表 （ 第三章 ）', w);
      for (const l of lines.slice(1)) expect(l.startsWith('）')).toBe(false);
      for (const l of lines.slice(0, -1)) expect(/（\s*$/.test(l)).toBe(false);
      // From 72 px on, where `iPhone 。` fits a line (in a narrower one the
      // full stop opens the next line after all).
      if (w >= 72) for (const l of both('他使用了 iPhone 。然后走了', w).slice(1)) expect(l.startsWith('。')).toBe(false);
    }
  });

  it('still break at a space the rules allow, at every level', () => {
    expect(both('我们用 iPhone 拍照', 80)).toEqual(['我们用', 'iPhone 拍', '照']);
    expect(both('参见图表 （ 第三章 ）', 80, { cjkLineBreak: 'none' })).toEqual(['参见图表', '（ 第三章', '）']);
  });
});

describe('unit squares', () => {
  it('are signs of a number, not CJK text', () => {
    for (const sq of ['㎡', '㎏', '㎞', '㏄', '㎎', '㍱']) {
      expect(hasCJK(sq)).toBe(false);
      expect(cjkClassOf(sq)).toBe('postfix');
    }
    // The enclosed and squared ideographs stay CJK.
    expect(hasCJK('㈠')).toBe(true);
    expect(hasCJK('㍻')).toBe(true);
  });

  it('leave a Latin paragraph as it was, on both paths', () => {
    for (const w of [112, 120, 128, 136]) {
      const text = 'El piso mide 120㎡ y es caro';
      // Pretext keeps the space a plain line ends with.
      const plain = texts(measureBlock(text, FONT, w, 20, { textAlign: 'justify' }).lines).map((l) => l.trimEnd());
      const rich = texts(measureRichBlock([run(text)], FONT, FONT, FONT, FONT, w, 20, { textAlign: 'justify' }).lines);
      expect(rich).toEqual(plain);
      expect(rich.some((l) => l.includes('120㎡'))).toBe(true);
    }
  });

  it('stay with their number in a Chinese paragraph', () => {
    for (const level of LEVELS) {
      for (let w = 96; w <= 144; w += 8) {
        const lines = both('房屋面积为120㎡，售价很高', w, { cjkLineBreak: level });
        expect(lines.some((l) => l.includes('120㎡'))).toBe(true);
      }
    }
  });
});

describe('fullwidth numbers and letters', () => {
  it('never split, at any level', () => {
    const cases: [string, string][] = [
      ['共有参加者１２３４５６人参加', '１２３４５６'],
      ['增长率达到了５０％以上', '５０％'],
      ['售价为人民币￥５９９元整', '￥５９９'],
      ['圆周率约为３．１４１５', '３．１４１５'],
      ['这是ＡＢＣＤＥＦ公司的产品', 'ＡＢＣＤＥＦ'],
    ];
    for (const level of LEVELS) {
      for (const [text, number] of cases) {
        // Every measure the number fits (16 px a character).
        for (let w = 16 * number.length; w <= 176; w += 8) {
          expect(both(text, w, { cjkLineBreak: level }).some((l) => l.includes(number))).toBe(true);
        }
      }
    }
  });

  it('keep a number of ASCII digits with a fullwidth unit, at every level', () => {
    for (const level of LEVELS) {
      for (let w = 64; w <= 144; w += 8) {
        expect(both('增长率达到了50％以上', w, { cjkLineBreak: level }).some((l) => l.includes('50％'))).toBe(true);
      }
    }
  });

  it('take the spread between their characters like Han', () => {
    const lines = measureBlock('共有参加者１２３４５６人参加了这次会议的讨论', FONT, 200, 20, { textAlign: 'justify' }).lines;
    const first = lines[0]!;
    expect(Math.abs(width(first) - 200)).toBeLessThan(0.01);
    const digits = first.segments!.filter((s) => /[０-９]/.test(s.text));
    expect(digits.length).toBeGreaterThan(0);
    expect(digits.every((s) => (s.tracking ?? 0) > 0)).toBe(true);
  });
});

describe('CJK text without two CJK letters in a row', () => {
  it('is composed, on both paths', () => {
    for (const w of [40, 56, 72, 88, 100, 120]) {
      for (const align of ['left', 'justify'] as const) {
        const lines = both('价¥5,999。好', w, { textAlign: align });
        // From 64 px on, where ¥5,999。 fits a line.
        if (w >= 64) for (const l of lines.slice(1)) expect(l.startsWith('。')).toBe(false);
      }
    }
  });

  it('is justified between its characters', () => {
    for (const text of ['第1条、第2条、第3条、第4条、第5条、第6条、第7条、第8条、第9条。', '1月、2月、3月、4月、5月、6月、7月、8月、9月、10月、11月、12月']) {
      const lines = measureBlock(text, FONT, 88, 20, { textAlign: 'justify' }).lines;
      expect(lines.length).toBeGreaterThan(2);
      for (const l of lines.slice(0, -1)) if (!l.cjkLoose) expect(Math.abs(width(l) - 88)).toBeLessThan(0.01);
    }
  });

  it('leaves Latin text with a CJK sign alone', () => {
    const text = 'The price rose by 50％ over the year and then fell back again.';
    const plain = measureBlock(text, FONT, 120, 20, { textAlign: 'justify', optimal: true });
    expect(plain.breaks).toBeDefined();
  });
});

describe('a long Western run in a CJK paragraph', () => {
  it('is divided in time linear in its length', () => {
    const measureRun = (n: number): { chars: number; ms: number } => {
      chars = 0;
      const t0 = performance.now();
      const lines = measureRichBlock([run(`中文${'x'.repeat(n)}中文`)], FONT, FONT, FONT, FONT, 160, 20, { textAlign: 'justify' }).lines;
      const ms = performance.now() - t0;
      expect(lines.length).toBeGreaterThan(n / 20);
      expect(lines.map((l) => l.text.replace(/-$/, '')).join('')).toBe(`中文${'x'.repeat(n)}中文`);
      return { chars, ms };
    };
    const small = measureRun(2000);
    const large = measureRun(32000);
    expect(large.chars).toBeLessThan(small.chars * 20);
    // Each line used to rescan the whole rest of the run: 32,000 characters
    // took five seconds; they now take a few dozen milliseconds.
    expect(large.ms).toBeLessThan(1500);
  });

  it('is cut at a web address joint or a syllable as before', () => {
    const url = 'https://example.org/' + 'segment/'.repeat(40) + 'end';
    const lines = measureRichBlock([run(`参见${url}的说明`)], FONT, FONT, FONT, FONT, 160, 20, { textAlign: 'left' }).lines;
    expect(lines.map((l) => l.text).join('')).toBe(`参见${url}的说明`);
    for (const l of lines.slice(1, -1)) expect(l.text.endsWith('/') || l.text.endsWith('segment')).toBe(true);
    const word = 'Pneumonoultramicroscopicsilicovolcanoconiosis'.repeat(4);
    const divided = measureRichBlock([run(`甲乙${word}丙丁`)], FONT, FONT, FONT, FONT, 120, 20, { textAlign: 'left' }).lines;
    expect(divided.map((l) => l.text.replace(/-$/, '')).join('')).toBe(`甲乙${word}丙丁`);
    for (const l of divided) expect(width(l)).toBeLessThanOrEqual(120 + 1e-6);
  });
});

describe('lines with no gap between CJK characters', () => {
  it('are left ragged without a CJK warning', () => {
    const text = `参见${'x'.repeat(60)}的说明和注释以及其他相关的内容`;
    const lines = measureRichBlock([run(text)], FONT, FONT, FONT, FONT, 164, 20, { textAlign: 'justify' }).lines;
    const latinOnly = lines.slice(0, -1).filter((l) => /^[x-]+$/.test(l.text));
    expect(latinOnly.length).toBeGreaterThan(0);
    for (const l of latinOnly) {
      expect(l.cjkLoose).toBeUndefined();
      if (width(l) < 164 - 0.01) expect(l.ragged).toBe(true);
    }
  });

  it('flag a line holding a lone CJK character that cannot be spread', () => {
    const lines = measureRichBlock([run(`甲${'x'.repeat(40)}乙丙`)], FONT, FONT, FONT, FONT, 300, 20, { textAlign: 'justify' }).lines;
    expect(lines[0]!.text).toBe('甲');
    expect(lines[0]!.cjkLoose).toBe(true);
  });
});

