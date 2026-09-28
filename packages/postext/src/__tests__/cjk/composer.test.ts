import { describe, it, expect, afterEach } from 'vitest';
import { measureRichBlock } from '../../measure/rich';
import { measureBlock } from '../../measure/plain';
import { setCjkLineBreak, type CjkLineBreakLevel } from '../../measure/cjkClasses';
import { setCjkComposition } from '../../measure/cjkPunctuation';
import type { InlineSpan } from '../../parse';
import type { MeasureBlockOptions } from '../../measure/types';
import type { VDTLine } from '../../vdt';

// Stub: CJK characters and the marks Chinese sets full width (— … · “ ” ‘ ’)
// are 16 px, a space 4 px, everything else 8 px; `chars` counts what
// reaches measureText.
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
const BOLD = 'bold 16px Test';
const run = (text: string, bold = false): InlineSpan => ({ text, bold, italic: false });
const texts = (lines: VDTLine[]): string[] => lines.map((l) => l.text);
const width = (l: VDTLine): number => l.segments!.reduce((s, seg) => s + seg.width, 0);

afterEach(() => {
  setCjkLineBreak('gb');
  setCjkComposition(undefined);
});

/** The lines of `text` on both paths (plain, and formatted with one span),
 *  which must agree. */
function both(text: string, w: number, options: MeasureBlockOptions = {}): string[] {
  const plain = texts(measureBlock(text, FONT, w, 20, options).lines);
  const rich = texts(measureRichBlock([run(text)], FONT, FONT, FONT, FONT, w, 20, options).lines);
  expect(rich).toEqual(plain);
  return plain;
}

describe('CJK line breaking (clreq)', () => {
  it('never opens a line with 。 after a number: the number goes down with it', () => {
    // 共有多人约 = 80 px, 50% = 24 px: the full stop does not fit.
    expect(both('共有多人约50%。其后', 104)).toEqual(['共有多人约', '50%。其后']);
  });

  it('keeps —— whole and, at the strict level, off a line start', () => {
    expect(both('他说他说——我不去', 80)).toEqual(['他说他说', '——我不去']);
    expect(both('他说他说——我不去', 80, { cjkLineBreak: 'strict' })).toEqual(['他说他', '说——我不', '去']);
    // Never split between the two dashes, even where the first would fit.
    expect(both('他说他说——我不去', 88)).toEqual(['他说他说', '——我不去']);
  });

  it('keeps …… whole and, at the strict level, off a line start', () => {
    expect(both('他说他说……我不去', 80)).toEqual(['他说他说', '……我不去']);
    expect(both('他说他说……我不去', 80, { cjkLineBreak: 'strict' })).toEqual(['他说他', '说……我不', '去']);
  });

  it('never opens a line with a closing quote', () => {
    expect(both('這是單引號’的例子', 80)).toEqual(['這是單引', '號’的例子']);
    expect(both('你来了吗？”她笑道', 64)).toEqual(['你来了', '吗？”她', '笑道']);
    // An opening quote never ends a line: it goes down with what it opens.
    expect(both('他说：“你来了吗？”', 64)).toEqual(['他说：', '“你来了', '吗？”']);
  });

  it('never opens a line with an interpunct, except at the level none', () => {
    // The mainland interpunct takes half an em: 4 em hold 约翰约翰 and no
    // more, and · may not open the next line.
    expect(both('约翰约翰·史密斯', 64)).toEqual(['约翰约', '翰·史密', '斯']);
    expect(both('约翰约翰·史密斯', 64, { cjkLineBreak: 'none' })).toEqual(['约翰约翰', '·史密斯']);
  });

  it('never ends a line with an opening bracket', () => {
    // 《 would fit at the end of the first line.
    expect(both('此书名曰《石头记》也', 80)).toEqual(['此书名曰', '《石头记》', '也']);
  });

  it('keeps the solidus off both line ends at the gb level only', () => {
    expect(both('甲乙丙丁／戊己', 80, { cjkLineBreak: 'basic' })).toEqual(['甲乙丙丁／', '戊己']);
    expect(both('甲乙丙丁／戊己', 80, { cjkLineBreak: 'gb' })).toEqual(['甲乙丙', '丁／戊己']);
  });

  it('reads the document level when the measurement names none', () => {
    setCjkLineBreak('strict');
    expect(both('他说他说——我不去', 80)).toEqual(['他说他', '说——我不', '去']);
  });

  it('keeps a number with its currency sign and its unit', () => {
    const text = '1999年的iPhone 15售价为¥5,999。';
    // From 64 px on, where ¥5,999。 fits a line: in a narrower one nothing
    // may end the line before 。, and it opens the next one after all.
    for (let w = 64; w <= 260; w += 8) {
      const lines = both(text, w);
      expect(lines.join('')).toBe(text.replace(' ', lines.some((l) => l.endsWith('iPhone')) ? '' : ' '));
      for (const l of lines) {
        expect(l.startsWith('。')).toBe(false);
        expect(/^[\d,]/.test(l) && !/^1999|^15/.test(l)).toBe(false);
        if (l.includes('¥')) expect(l).toContain('¥5,999');
      }
    }
  });

  it('breaks nowhere inside a Latin word or before a footnote marker', () => {
    const spans: InlineSpan[] = [run('甲乙丙丁戊己庚辛'), { text: '1', bold: false, italic: false, footnote: { id: 'n' }, script: 'sup' }, run('壬癸')];
    // The marker would fit alone at the end of the first line: it stays
    // with 辛.
    const lines = texts(measureRichBlock(spans, FONT, FONT, FONT, FONT, 128, 20, { textAlign: 'left' }).lines);
    expect(lines[0]).toBe('甲乙丙丁戊己庚');
    expect(lines[1]!.startsWith('辛1')).toBe(true);
    expect(both('我用iPhone拍照了', 72)).toEqual(['我用', 'iPhone拍', '照了']);
  });

  it('keeps an ideographic space as a character: never dropped, never a break before it', () => {
    const lines = measureRichBlock([run('\u3000\u3000此开卷第一回也')], FONT, FONT, FONT, FONT, 400, 20, { textAlign: 'justify' }).lines;
    expect(lines[0]!.text).toBe('\u3000\u3000此开卷第一回也');
    expect(lines[0]!.segments!.every((s) => s.kind === 'text')).toBe(true);
    // 甲乙丙丁 fills the line: the space after 丁 cannot open the next one.
    expect(both('甲乙丙丁\u3000戊己', 64)).toEqual(['甲乙丙', '丁\u3000戊己']);
  });

  it('flags no CJK line hyphenated, on either path', () => {
    const text = '此开卷第一回也。作者自云：因曾历过一番梦幻之后，故将真事隐去，而借“通灵”之说，撰此《石头记》一书也。';
    for (const options of [{ textAlign: 'left' as const }, { textAlign: 'justify' as const, optimal: true, hyphenate: true }]) {
      for (const lines of [measureBlock(text, FONT, 150, 20, options).lines, measureRichBlock([run('此', true), run(text.slice(1))], FONT, BOLD, FONT, FONT, 150, 20, options).lines]) {
        expect(lines.length).toBeGreaterThan(3);
        expect(lines.every((l) => !l.hyphenated)).toBe(true);
      }
    }
  });

  it('gives the same lines on both paths for a real paragraph, at every level', () => {
    const text = '此开卷第一回也。作者自云：因曾历过一番梦幻之后，故将真事隐去，而借“通灵”之说，撰此《石头记》一书也。故曰“甄士隐”云云。但书中所记何事何人？自又云：“今风尘碌碌，一事无成，忽念及当日所有之女子，一一细考较去，觉其行止见识，皆出于我之上。”';
    for (const level of ['none', 'basic', 'gb', 'strict'] as CjkLineBreakLevel[]) {
      for (let w = 100; w <= 400; w += 37) {
        const lines = both(text, w, { textAlign: 'justify', cjkLineBreak: level });
        expect(lines.join('')).toBe(text);
        if (level !== 'none') for (const l of lines.slice(1)) expect(/^[，。、：；！？”’）》·]/.test(l)).toBe(false);
      }
    }
  });
});

describe('Latin paragraphs that quote Chinese', () => {
  const text = 'The novel 紅樓夢 was written by 曹雪芹 in the eighteenth century and tells the story of the 賈 family, whose fortunes rise and fall over one hundred and twenty chapters of prose and verse.';

  it('keep Knuth–Plass, on both paths, breaking next to the characters they quote', () => {
    for (const w of [120, 150, 190, 230]) {
      const plain = measureBlock(text, FONT, w, 20, { textAlign: 'justify', optimal: true });
      const rich = measureRichBlock([run(text)], FONT, FONT, FONT, FONT, w, 20, { textAlign: 'justify', optimal: true });
      expect(plain.breaks).toBeDefined();
      expect(rich.breaks).toBeDefined();
      expect(texts(rich.lines)).toEqual(texts(plain.lines));
      // Justified by their word spaces, as Latin text is.
      expect(plain.lines.slice(0, -1).some((l) => l.justifiedSpaceRatio !== undefined)).toBe(true);
      expect(plain.lines.every((l) => !l.hyphenated || l.text.endsWith('-'))).toBe(true);
    }
    // 紅樓夢 may part between its characters where the line needs it.
    const narrow = texts(measureBlock('Read 紅樓夢紅樓夢紅樓夢紅樓夢 today, then read it once more tomorrow.', FONT, 100, 20, { textAlign: 'justify', optimal: true }).lines);
    expect(narrow.join('').replace(/ /g, '')).toBe('Read紅樓夢紅樓夢紅樓夢紅樓夢today,thenreaditoncemoretomorrow.');
    expect(narrow.some((l) => /[紅樓夢]$/.test(l) && !l.endsWith(' '))).toBe(true);
  });
});

describe('inter-character justification', () => {
  const TEXT = '此开卷第一回也。作者自云：因曾历过一番梦幻之后，故将真事隐去，而借「通灵」之说，撰此《石头记》一书也。';

  it('sets every line but the last exactly to the measure', () => {
    for (const w of [150, 173, 211, 250]) {
      const lines = measureBlock(TEXT, FONT, w, 20, { textAlign: 'justify' }).lines;
      for (const l of lines.slice(0, -1)) {
        expect(Math.abs(width(l) - w)).toBeLessThan(0.01);
        expect(Math.abs(l.bbox.width - w)).toBeLessThan(0.01);
        expect(l.ragged).toBeUndefined();
      }
      const last = lines[lines.length - 1]!;
      expect(last.segments!.every((s) => s.tracking === undefined)).toBe(true);
    }
  });

  it('spreads nothing inside a Latin word: the slack goes to the spaces, then between characters', () => {
    // 用 iPhone 拍照 … with one word space each side of the word.
    const text = '我们用 iPhone 拍照，然后回家。今天天气很好。';
    const lines = measureRichBlock([run(text)], FONT, FONT, FONT, FONT, 244, 20, { textAlign: 'justify' }).lines;
    const first = lines[0]!;
    expect(first.text).toBe('我们用 iPhone 拍照，然后回家。');
    expect(Math.abs(width(first) - 244)).toBeLessThan(0.01);
    const word = first.segments!.find((s) => s.text.startsWith('iPhon'))!;
    expect(word.text).toBe('iPhone');
    expect(word.tracking).toBeUndefined();
    expect(word.width).toBe(6 * 8);
    // The spaces took their half em before the characters took anything.
    for (const s of first.segments!.filter((x) => x.kind === 'space')) expect(s.width).toBe(8);
    expect(first.segments!.some((s) => (s.tracking ?? 0) > 0)).toBe(true);
  });

  it('counts a supplementary-plane ideograph as one character', () => {
    const bmp = measureBlock('甲乙丙字丁戊己庚辛壬癸子丑', FONT, 170, 20, { textAlign: 'justify' }).lines[0]!;
    const astral = measureBlock('甲乙丙\u{20E95}丁戊己庚辛壬癸子丑', FONT, 170, 20, { textAlign: 'justify' }).lines[0]!;
    const track = (l: VDTLine) => l.segments!.map((s) => s.tracking ?? 0).reduce((a, b) => Math.max(a, b), 0);
    expect(track(astral)).toBeCloseTo(track(bmp), 9);
    expect(width(astral)).toBeCloseTo(width(bmp), 9);
  });

  it('caps the spread and flags the line when a long word cannot come up', () => {
    const word = 'Pneumonoultramicroscopicsilicovolcanoconiosis';
    const lines = measureRichBlock([run(`甲乙丙丁戊${word}己庚辛`)], FONT, FONT, FONT, FONT, 300, 20, { textAlign: 'justify' }).lines;
    const first = lines[0]!;
    expect(first.text).toBe('甲乙丙丁戊');
    expect(first.cjkLoose).toBe(true);
    expect(first.ragged).toBe(true);
    for (const s of first.segments!) expect(s.tracking ?? 0).toBeLessThanOrEqual(8 + 1e-9);
  });

  it('leaves a ragged paragraph untracked, one segment per style run', () => {
    const lines = measureRichBlock([run(TEXT)], FONT, FONT, FONT, FONT, 150, 20, { textAlign: 'left' }).lines;
    for (const l of lines) {
      expect(l.segments!.length).toBe(1);
      expect(l.segments![0]!.tracking).toBeUndefined();
    }
  });

  it('spreads no space next to a connector or a solidus', () => {
    const lines = measureBlock('北京～上海的火车和汽车都很快也很舒服', FONT, 150, 20, { textAlign: 'justify' }).lines;
    const segs = lines[0]!.segments!;
    const i = segs.findIndex((s) => s.text.includes('～'));
    // The character before ～ and ～ itself carry no gap after them.
    const before = segs.slice(0, i + 1).map((s) => s.text).join('');
    expect(before.endsWith('京～') || segs[i]!.tracking === undefined).toBe(true);
  });
});

describe('linear time', () => {
  it('measures each character once, however long the paragraph', () => {
    const han = '却说甄士隐梦中所见之事便忘了大半又见奶母正抱了英莲走来士隐见女儿越发生得粉妆玉琢乖觉可喜';
    let text = '';
    for (let i = 0; text.length < 7000; i++) text += han[(i * 7) % han.length] + (i % 13 === 0 ? '，' : '');
    chars = 0;
    const spans = [run('士隐', true), run(text)];
    const block = measureRichBlock(spans, FONT, BOLD, FONT, FONT, 480, 20, { textAlign: 'justify', optimal: true, hyphenate: true, letterSpacingPx: 0.2 });
    expect(block.lines.length).toBeGreaterThan(200);
    expect(chars).toBeLessThan(3 * text.length);
  });
});
