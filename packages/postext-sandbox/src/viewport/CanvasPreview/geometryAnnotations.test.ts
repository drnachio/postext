import { describe, expect, it } from 'vitest';
import type { VDTDocument } from 'postext';
import { pixelToSourceOffset, segmentPlainLength, xForPlainInLine } from './geometry';

type VDTBlock = VDTDocument['blocks'][number];
type VDTSegment = NonNullable<VDTBlock['lines'][number]['segments']>[number];

// 寶玉〔甲戌側批此是〕道: a warichu note of 6 characters folded into rows of
// 3 at 10 px, between brackets the layout added (#195). 20 px text, the
// baseline at 16.
const TEXT = '寶玉甲戌側批此是道';
const segments: VDTSegment[] = [
  { kind: 'text', text: '寶玉', width: 40 },
  { kind: 'text', text: '〔', width: 20, inserted: true },
  {
    kind: 'text',
    text: '甲戌側批此是',
    width: 30,
    warichu: { upper: '甲戌側', lower: '批此是', fontString: '10px Test', upperDy: -8.4, lowerDy: 1.6, runs: [] },
  },
  { kind: 'text', text: '〕', width: 20, inserted: true },
  { kind: 'text', text: '道', width: 20 },
] as VDTSegment[];
const width = 130;
const sourceMap = Array.from({ length: TEXT.length }, (_, i) => 100 + i);
const block = {
  type: 'paragraph',
  pageIndex: 0,
  textAlign: 'left',
  bbox: { x: 0, y: 0, width, height: 20 },
  sourceStart: 100,
  sourceEnd: 100 + TEXT.length,
  sourceMap,
  plainPrefixLen: 0,
  lines: [{
    text: '寶玉〔甲戌側批此是〕道',
    bbox: { x: 0, y: 0, width, height: 20 },
    baseline: 16,
    segments,
    plainStart: 0,
    plainEnd: TEXT.length,
    isLastLine: true,
    hyphenated: false,
  }],
} as unknown as VDTBlock;
const doc = { pages: [{}], blocks: [block] } as unknown as VDTDocument;

describe('caret over Chinese annotations', () => {
  it('added brackets take no plain character', () => {
    expect(segmentPlainLength(segments[1]!, false)).toBe(0);
  });

  it('a click on a row of a warichu note maps to its character', () => {
    // Upper row (above the axis, 16 − 7.6 px): 甲 at 60–70, 戌 70–80.
    expect(pixelToSourceOffset(doc, 0, 61, 6)).toBe(102);
    expect(pixelToSourceOffset(doc, 0, 72, 6)).toBe(103);
    // Lower row: 批 at 60–70, 此 70–80.
    expect(pixelToSourceOffset(doc, 0, 61, 14)).toBe(105);
    expect(pixelToSourceOffset(doc, 0, 72, 14)).toBe(106);
    // Past the closing bracket: 道.
    expect(pixelToSourceOffset(doc, 0, 112, 10)).toBe(108);
  });

  it('puts the caret on the row its character sits in', () => {
    // 戌, the upper row's second character.
    expect(xForPlainInLine(block, block.lines[0]!, 3)).toBe(70);
    expect(xForPlainInLine(block, block.lines[0]!, 4)).toBe(80);
    // 此 is the lower row's second character.
    expect(xForPlainInLine(block, block.lines[0]!, 6)).toBe(70);
  });
});
