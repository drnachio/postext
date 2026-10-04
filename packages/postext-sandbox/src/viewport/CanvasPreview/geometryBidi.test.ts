import { describe, expect, it } from 'vitest';
import type { VDTDocument } from 'postext';
import { pixelToSourceOffset, placeLineSegments, plainRangeInLine, xForPlainInLine } from './geometry';

type VDTBlock = VDTDocument['blocks'][number];
type VDTLine = VDTBlock['lines'][number];
type VDTSegment = NonNullable<VDTLine['segments']>[number];

const word = (text: string, width: number, extra: Partial<VDTSegment> = {}): VDTSegment =>
  ({ kind: 'text', text, width, ...extra }) as VDTSegment;
const space = (extra: Partial<VDTSegment> = {}): VDTSegment => ({ kind: 'space', text: ' ', width: 5, ...extra }) as VDTSegment;

/** A one-line paragraph whose plain text maps one to one onto its source. */
function paragraph(text: string, segments: VDTSegment[], extra: Partial<VDTLine> = {}, width?: number): VDTBlock {
  const natural = segments.reduce((s, seg) => s + seg.width, 0);
  return {
    type: 'paragraph',
    pageIndex: 0,
    textAlign: 'left',
    bbox: { x: 0, y: 0, width: width ?? natural, height: 20 },
    sourceStart: 0,
    sourceEnd: text.length,
    sourceMap: Array.from({ length: text.length }, (_, i) => i),
    plainPrefixLen: 0,
    lines: [{
      text,
      bbox: { x: 0, y: 0, width: natural, height: 20 },
      baseline: 15,
      segments,
      plainStart: 0,
      plainEnd: text.length,
      isLastLine: true,
      ...extra,
    }],
  } as unknown as VDTBlock;
}

// An English line holding an Arabic phrase: «abc كتاب جميل xyz». The two
// Arabic words are painted right to left, so جميل (logically after كتاب)
// stands to its left: order 0 1 4 3 2 5 6.
//   x:  abc 0–30 · sp 30–35 · جميل 35–75 · sp 75–80 · كتاب 80–120 · sp 120–125 · xyz 125–155
//   plain: abc 0–3 · sp 3 · كتاب 4–8 · sp 8 · جميل 9–13 · sp 13 · xyz 14–17
const MIXED = 'abc كتاب جميل xyz';
const mixed = paragraph(MIXED, [
  word('abc', 30), space(), word('كتاب', 40, { rtl: true }), space({ rtl: true }),
  word('جميل', 40, { rtl: true }), space(), word('xyz', 30),
], { order: [0, 1, 4, 3, 2, 5, 6] });
const ltrDoc = { pages: [{}], blocks: [mixed] } as unknown as VDTDocument;

describe('a bidi line on a left-to-right page', () => {
  it('places the segments in their paint order', () => {
    const placed = placeLineSegments(mixed, mixed.lines[0]!, false)!;
    expect(placed.map((p) => p.x)).toEqual([0, 30, 80, 75, 35, 120, 125]);
    expect(placed.map((p) => p.reversed)).toEqual([false, false, true, true, true, false, false]);
  });

  it('maps a click on a word to that word, its first letter on its right', () => {
    // Right edge of كتاب: its logical start.
    expect(pixelToSourceOffset(ltrDoc, 0, 118, 10)).toBe(MIXED.indexOf('كتاب'));
    // Left edge of كتاب: its logical end.
    expect(pixelToSourceOffset(ltrDoc, 0, 82, 10)).toBe(MIXED.indexOf('كتاب') + 4);
    // Inside جميل, painted left of كتاب though it comes after it.
    expect(pixelToSourceOffset(ltrDoc, 0, 64, 10)).toBe(MIXED.indexOf('جميل') + 1);
    // The Latin words keep their places.
    expect(pixelToSourceOffset(ltrDoc, 0, 136, 10)).toBe(MIXED.indexOf('xyz') + 1);
    expect(pixelToSourceOffset(ltrDoc, 0, 11, 10)).toBe(1);
  });

  it('puts the caret where the character is painted', () => {
    const line = mixed.lines[0]!;
    expect(xForPlainInLine(mixed, line, MIXED.indexOf('كتاب'))).toBe(120);
    expect(xForPlainInLine(mixed, line, MIXED.indexOf('جميل') + 1)).toBe(65);
    expect(xForPlainInLine(mixed, line, MIXED.indexOf('xyz') + 1)).toBe(135);
  });

  it('shows a selection across the direction change as the pieces painted', () => {
    // «اب جميل x»: the end of كتاب, جميل, and the x of xyz.
    const line = mixed.lines[0]!;
    expect(plainRangeInLine(mixed, line, 6, 15)).toEqual([{ x1: 35, x2: 100 }, { x1: 120, x2: 135 }]);
    // An unmixed range is one piece.
    expect(plainRangeInLine(mixed, line, 0, 3)).toEqual([{ x1: 0, x2: 30 }]);
  });

  it('places a centred line by its slack', () => {
    const centred = { ...mixed, textAlign: 'center', bbox: { ...mixed.bbox, width: 255 } } as VDTBlock;
    expect(xForPlainInLine(centred, centred.lines[0]!, 0)).toBe(50);
  });
});

// An Arabic line on a right-to-left page with an English word: «كتاب Data جميل».
// On the sheet: جميل · Data · كتاب, from the left. In the mirrored flow
// frame the order is logical (no `order`): كتاب 0–40 · sp · Data 45–85 · sp · جميل 90–130.
const ARABIC = 'كتاب Data جميل';
const arabic = paragraph(ARABIC, [
  word('كتاب', 40, { rtl: true }), space({ rtl: true }), word('Data', 40), space({ rtl: true }), word('جميل', 40, { rtl: true }),
]);
const W = 200;
const rtlDoc = {
  pages: [{ flow: { writingMode: 'horizontal-tb', direction: 'rtl', mirror: { originX: W } } }],
  blocks: [arabic],
} as unknown as VDTDocument;

describe('a line on a mirrored (right-to-left) page', () => {
  it('maps clicks in the flow frame to the word painted there', () => {
    // Flow x 2 is the sheet's right end of كتاب: its first letter.
    expect(pixelToSourceOffset(rtlDoc, 0, 2, 10)).toBe(0);
    // Flow x 48 is the sheet's right end of «Data»: its last letter.
    expect(pixelToSourceOffset(rtlDoc, 0, 48, 10)).toBe(ARABIC.indexOf('Data') + 4);
    // Flow x 82 is the sheet's left end of «Data»: its first letter.
    expect(pixelToSourceOffset(rtlDoc, 0, 82, 10)).toBe(ARABIC.indexOf('Data'));
    expect(pixelToSourceOffset(rtlDoc, 0, 101, 10)).toBe(ARABIC.indexOf('جميل') + 1);
  });

  it('puts the caret on the same characters', () => {
    const line = arabic.lines[0]!;
    expect(xForPlainInLine(arabic, line, 0, true)).toBe(0);
    expect(xForPlainInLine(arabic, line, ARABIC.indexOf('Data'), true)).toBe(85);
    expect(xForPlainInLine(arabic, line, ARABIC.indexOf('Data') + 1, true)).toBe(75);
    expect(xForPlainInLine(arabic, line, ARABIC.indexOf('جميل') + 1, true)).toBe(100);
  });

  it('reverses a line of an opposite block set in its measure', () => {
    // A Latin line in its own span (a `{dir=ltr}` quotation): ragged from
    // its start, the right of the span in the flow frame.
    const quote = paragraph('ab cd', [word('ab', 20), space(), word('cd', 20)], { measure: { x: 0, width: 100 }, order: [2, 1, 0] }, 100);
    const line = quote.lines[0]!;
    const placed = placeLineSegments(quote, line, true)!;
    expect(placed.map((p) => p.x)).toEqual([80, 75, 55]);
    // Its first letter on the sheet's left: the flow's right.
    expect(xForPlainInLine(quote, line, 0, true)).toBe(100);
  });
});
