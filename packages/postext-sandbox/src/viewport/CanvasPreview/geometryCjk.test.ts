import { describe, expect, it } from 'vitest';
import { measureBlock, type VDTDocument } from 'postext';
import { pixelToSourceOffset, segmentGraphemeStarts, xForPlainInLine } from './geometry';

type VDTBlock = VDTDocument['blocks'][number];
type VDTSegment = NonNullable<VDTBlock['lines'][number]['segments']>[number];

// A justified CJK line, as the composer sets it: 16 px characters spread
// 2 px apart (segment tracking), the Ext-B ideograph 𠺕 (two UTF-16 units)
// in the middle, and the last character untracked at the measure.
const TEXT = '甲乙\u{20E95}丙丁';
const seg = (text: string, width: number, tracking?: number): VDTSegment =>
  ({ kind: 'text', text, width, ...(tracking !== undefined ? { tracking } : {}) }) as VDTSegment;
const segments: VDTSegment[] = [seg('甲乙\u{20E95}丙', 4 * 18, 2), seg('丁', 16)];
const width = 4 * 18 + 16;
const sourceMap = Array.from({ length: TEXT.length }, (_, i) => 100 + i);
const block = {
  type: 'paragraph',
  pageIndex: 0,
  textAlign: 'justify',
  bbox: { x: 0, y: 0, width, height: 20 },
  sourceStart: 100,
  sourceEnd: 100 + TEXT.length,
  sourceMap,
  plainPrefixLen: 0,
  lines: [{
    text: TEXT,
    bbox: { x: 0, y: 0, width, height: 20 },
    segments,
    plainStart: 0,
    plainEnd: TEXT.length,
    isLastLine: false,
    hyphenated: false,
  }],
} as unknown as VDTBlock;
const doc = { pages: [{}], blocks: [block] } as unknown as VDTDocument;

describe('caret on a tracked CJK line', () => {
  it('reads grapheme boundaries, the surrogate pair as one', () => {
    expect(segmentGraphemeStarts(segments[0]!)).toEqual([0, 1, 2, 4, 5]);
    expect(segmentGraphemeStarts({ text: 'abc' })).toBeNull();
  });

  it('maps a click to the character under it, never inside 𠺕', () => {
    // Each tracked character takes 18 px: 甲 0–18, 乙 18–36, 𠺕 36–54, 丙 54–72.
    expect(pixelToSourceOffset(doc, 0, 2, 10)).toBe(100);
    expect(pixelToSourceOffset(doc, 0, 20, 10)).toBe(101);
    expect(pixelToSourceOffset(doc, 0, 38, 10)).toBe(102);
    expect(pixelToSourceOffset(doc, 0, 50, 10)).toBe(104);
    expect(pixelToSourceOffset(doc, 0, 58, 10)).toBe(104);
    expect(pixelToSourceOffset(doc, 0, 76, 10)).toBe(105);
  });

  it('puts the caret at the start of each character', () => {
    expect(xForPlainInLine(block, block.lines[0]!, 0)).toBe(0);
    expect(xForPlainInLine(block, block.lines[0]!, 2)).toBe(36);
    expect(xForPlainInLine(block, block.lines[0]!, 4)).toBe(54);
    expect(xForPlainInLine(block, block.lines[0]!, 5)).toBe(72);
    expect(xForPlainInLine(block, block.lines[0]!, 6)).toBe(88);
  });
});

// The composer on a mixed Han–Latin line: a stub font sets CJK characters
// 16 px wide, spaces 4 px and everything else 8 px.
const stubWidth = (ch: string): number => (ch === ' ' ? 4 : ch.codePointAt(0)! >= 0x2e80 ? 16 : 8);
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext() {
    return {
      font: '',
      letterSpacing: '0px',
      measureText(t: string) {
        let w = 0;
        for (const ch of t) w += stubWidth(ch);
        return { width: w };
      },
    };
  }
};

describe('caret on a ragged line of Chinese and Latin', () => {
  it('lands on every character of what the composer set', () => {
    const text = '1999年的iPhone 15售价为¥5,999。我们买了';
    const measured = measureBlock(text, '16px Stub', 400, 20, { textAlign: 'left' }).lines;
    expect(measured.length).toBe(1);
    const line = { ...measured[0]!, plainStart: 0, plainEnd: text.length, isLastLine: true };
    const mixed = { ...block, textAlign: 'left', bbox: { x: 0, y: 0, width: 400, height: 20 }, lines: [line] } as unknown as VDTBlock;
    let x = 0;
    for (let i = 0; i < text.length; i++) {
      expect(xForPlainInLine(mixed, line, i)).toBeCloseTo(x, 6);
      x += stubWidth(text[i]!);
    }
  });
});
