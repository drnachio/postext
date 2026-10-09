import { describe, it, expect } from 'vitest';
import { measureBlock, measureRichBlock, createMeasurementCache } from '../measure';
import { cachedMeasureBlock } from '../measure/index';
import { mirrorLineSpans } from '../measure/bidiLines';
import { lineInsetsAt, lineWidthAt, uniformMeasureFrom, type LineInsetStep, type MeasureBlockOptions } from '../measure/types';
import { lineTextAlign, type VDTLine } from '../vdt';

// #627 Phase 1: lines set short on either side (`lineInsets`), the lines
// of a paragraph beside a picture that text wraps round.

// 7 px a character, whatever the font.
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

const font = '10px Test';
const bold = 'bold 10px Test';
const W = 300;
const LH = 14;
const text = Array.from({ length: 9 }, () => 'The heap needs about a cubic metre of mixed material before it holds its heat, and few of us fill that much.').join(' ');
const chinese = '春眠不觉晓处处闻啼鸟夜来风雨声花落知多少'.repeat(20);

/** Lines 2–6 (1-based) 40 % shorter, from the start or the end side. */
const inset = (side: 'start' | 'end'): LineInsetStep[] => [{
  fromLine: 1,
  toLine: 5,
  startInsetPx: side === 'start' ? 0.4 * W : 0,
  endInsetPx: side === 'end' ? 0.4 * W : 0,
}];

/** Width of a line's words and spaces as measured. */
const inkWidth = (line: VDTLine): number =>
  line.segments && line.segments.length > 0 ? line.segments.reduce((a, s) => a + s.width, 0) : line.bbox.width;

const words = (lines: readonly VDTLine[]): string[] => lines.map((l) => l.text).join(' ').replace(/-\s+/g, '').split(/\s+/).filter(Boolean);

function expectWrapped(lines: readonly VDTLine[], side: 'start' | 'end', opts: { ragged: boolean }) {
  expect(lines.length).toBeGreaterThan(7);
  const narrow = 0.6 * W;
  lines.forEach((line, i) => {
    const beside = i >= 1 && i <= 5;
    if (!beside) {
      expect(line.bbox.x).toBeCloseTo(0, 5);
      expect(line.measure).toBeUndefined();
      return;
    }
    // Beside the picture: set from past it (start) or short of it (end).
    expect(line.bbox.x).toBeCloseTo(side === 'start' ? 0.4 * W : 0, 5);
    expect(line.measure).toEqual({ x: line.bbox.x, width: narrow, wrap: true });
    expect(inkWidth(line)).toBeLessThanOrEqual(narrow + 0.5);
    // Justified lines are set to their own measure, not ragged against it.
    if (!opts.ragged && !line.isLastLine) expect(inkWidth(line)).toBeGreaterThan(narrow - 40);
  });
  // Below the picture: the full measure again.
  expect(Math.max(...lines.slice(6, -1).map(inkWidth))).toBeGreaterThan(narrow + 30);
}

const base = (textAlign: 'justify' | 'left', optimal: boolean): MeasureBlockOptions => ({
  textAlign,
  optimal,
  maxStretchRatio: 2,
  minShrinkRatio: 0.8,
  ...(textAlign === 'left' && optimal ? { optimalRagged: true } : {}),
});

describe('lineInsets on every breaker (#627)', () => {
  for (const side of ['start', 'end'] as const) {
    for (const textAlign of ['justify', 'left'] as const) {
      for (const optimal of [true, false]) {
        const label = `${side} side, ${textAlign}, ${optimal ? 'Knuth–Plass' : 'line by line'}`;
        it(`plain text: ${label}`, () => {
          const m = measureBlock(text, font, W, LH, { ...base(textAlign, optimal), lineInsets: inset(side) });
          expectWrapped(m.lines, side, { ragged: textAlign === 'left' });
          expect(words(m.lines)).toEqual(text.split(/\s+/));
          if (optimal) expect(m.breaks).toBeDefined();
        });
        it(`formatted text: ${label}`, () => {
          const spans = [
            { text: text.slice(0, 40), bold: false, italic: false },
            { text: text.slice(40, 90), bold: true, italic: false },
            { text: text.slice(90), bold: false, italic: false },
          ];
          const m = measureRichBlock(spans, font, bold, font, bold, W, LH, { ...base(textAlign, optimal), lineInsets: inset(side) });
          expectWrapped(m.lines, side, { ragged: textAlign === 'left' });
          expect(words(m.lines)).toEqual(text.split(/\s+/));
        });
      }
    }
    it(`Chinese text (the CJK composer): ${side} side`, () => {
      const m = measureRichBlock([{ text: chinese, bold: false, italic: false }], font, font, font, font, W, LH, { textAlign: 'justify', lineInsets: inset(side) });
      expect(m.lines.length).toBeGreaterThan(7);
      m.lines.forEach((line, i) => {
        const beside = i >= 1 && i <= 5;
        expect(line.bbox.x).toBeCloseTo(beside && side === 'start' ? 0.4 * W : 0, 5);
        if (beside) {
          expect(line.measure).toEqual({ x: line.bbox.x, width: 0.6 * W, wrap: true });
          expect(line.bbox.width).toBeLessThanOrEqual(0.6 * W + 0.5);
        } else {
          expect(line.measure).toBeUndefined();
        }
      });
      // Characters per line: fewer beside the picture.
      expect([...m.lines[2]!.text].length).toBeLessThan([...m.lines[7]!.text].length);
      expect(m.lines.map((l) => l.text).join('')).toBe(chinese);
    });
  }

  it('keeps a first-line indent additive with an inset that covers line 0', () => {
    const m = measureBlock(text, font, W, LH, { ...base('justify', true), firstLineIndentPx: 21, lineInsets: [{ fromLine: 0, toLine: 2, startInsetPx: 100, endInsetPx: 0 }] });
    expect(m.lines[0]!.bbox.x).toBeCloseTo(121, 5);
    expect(m.lines[0]!.measure).toEqual({ x: 121, width: W - 121, wrap: true });
    expect(m.lines[1]!.bbox.x).toBeCloseTo(100, 5);
    expect(m.lines[3]!.bbox.x).toBeCloseTo(0, 5);
  });

  it('counts insets through a paragraph cut by forced breaks', () => {
    const broken = `${text.slice(0, 120)} ${text.slice(121)}`;
    const m = measureRichBlock([{ text: broken, bold: false, italic: false }], font, font, font, font, W, LH, { ...base('justify', true), lineInsets: inset('start') });
    m.lines.forEach((line, i) => expect(line.bbox.x).toBeCloseTo(i >= 1 && i <= 5 ? 0.4 * W : 0, 5));
  });

  it('keeps the breaks of the lines already placed (keepBreaks) and breaks the rest short', () => {
    const opts = base('justify', true);
    const first = measureBlock(text, font, W, LH, opts);
    const keep = { path: first.breaks!.path, at: first.breaks!.at.slice(0, 3) };
    const again = measureBlock(text, font, W, LH, { ...opts, keepBreaks: keep, lineInsets: [{ fromLine: 3, toLine: 6, startInsetPx: 0, endInsetPx: 120 }] });
    expect(again.lines.slice(0, 3).map((l) => l.text)).toEqual(first.lines.slice(0, 3).map((l) => l.text));
    for (const l of again.lines.slice(3, 7)) expect(inkWidth(l)).toBeLessThanOrEqual(W - 120 + 0.5);
  });

  it('is never cached, and leaves the cache as it was', () => {
    const cache = createMeasurementCache();
    const opts = base('justify', true);
    const plain = cachedMeasureBlock(text, font, W, LH, opts, cache);
    const wrapped = cachedMeasureBlock(text, font, W, LH, { ...opts, lineInsets: inset('start') }, cache);
    expect(wrapped.lines[2]!.bbox.x).toBeCloseTo(0.4 * W, 5);
    const again = cachedMeasureBlock(text, font, W, LH, opts, cache);
    expect(again.lines.map((l) => [l.text, l.bbox.x])).toEqual(plain.lines.map((l) => [l.text, l.bbox.x]));
    expect(again.lines.some((l) => l.measure)).toBe(false);
  });
});

describe('inset helpers (#627)', () => {
  it('sums the steps covering a line and widens again after toLine', () => {
    const steps: LineInsetStep[] = [{ fromLine: 1, toLine: 3, startInsetPx: 50, endInsetPx: 0 }, { fromLine: 2, startInsetPx: 0, endInsetPx: 20 }];
    expect(lineInsetsAt(steps, 0)).toEqual({ start: 0, end: 0 });
    expect(lineInsetsAt(steps, 2)).toEqual({ start: 50, end: 20 });
    expect(lineInsetsAt(steps, 4)).toEqual({ start: 0, end: 20 });
    expect(lineWidthAt(300, { lineInsets: steps, firstLineIndentPx: 10 }, 0)).toBe(290);
    expect(lineWidthAt(300, { lineInsets: steps }, 2)).toBe(230);
    expect(uniformMeasureFrom(undefined, undefined, [{ fromLine: 1, toLine: 5, startInsetPx: 9, endInsetPx: 0 }])).toBe(6);
  });

  it('mirrors a paragraph set against its frame: the indent changes side, the insets stay', () => {
    const lines = [0, 1, 2].map((i) => ({ text: 'x', bbox: { x: i === 1 ? 120 + 15 : 0, y: i * LH, width: 50, height: LH }, baseline: 0, hyphenated: false, isLastLine: false } as VDTLine));
    mirrorLineSpans(lines, W, undefined, [{ fromLine: 1, toLine: 1, startInsetPx: 120, endInsetPx: 0 }]);
    // Line 1: past the picture on the left, its indent of 15 now on the right.
    expect(lines[1]!.measure).toEqual({ x: 120, width: W - 120 - 15 });
    expect(lines[1]!.bbox.x).toBe(120);
    expect(lines[0]!.measure).toEqual({ x: 0, width: W });
    // A mirrored span reads from the right; a wrap span keeps its block's side.
    expect(lineTextAlign(lines[1]!, 'left')).toBe('right');
    expect(lineTextAlign({ measure: { x: 0, width: 10, wrap: true } }, 'left')).toBe('left');
  });
});
