import { describe, it, expect } from 'vitest';
import { measureRichBlock } from '../measure/rich.js';
import { measureBlock } from '../measure/plain.js';
import { justifiedSpaceRatios } from '../measure/spaceRatios.js';
import { raggedLooseLines } from '../pipeline/text/raggedLines.js';
import { buildDocument } from '../pipeline/build.js';
import { createMeasurementCache } from '../measure/index.js';
import { findLooseLines, lineLooseness, lineWordSpacing } from '../looseLines.js';
import type { InlineSpan } from '../parse/index.js';
import type { PostextConfig, VDTDocument, VDTLine } from '../index.js';

// Every character is 7 px wide, but the space of the italic face is 5 px
// (regular 7 px) and the space of the bold face 9 px: as with real faces,
// the spaces of a line are not all the regular one.
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const space = /italic/i.test(this.font) ? 5 : /bold|\b[6-9]00\b/i.test(this.font) ? 9 : 7;
    let w = 0;
    for (const ch of s) w += ch === ' ' ? space : 7;
    return { width: w };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const R = '16px Test';
const B = '16px TestBold';
const I = '16px TestItalic';
const MIN = 0.7;
const MAX = 2;
const KP = { textAlign: 'justify' as const, optimal: true, maxStretchRatio: MAX, minShrinkRatio: MIN };
const mixed = (bold: boolean): InlineSpan[] => [
  { text: 'aaaa bbbb ', bold: false, italic: false },
  { text: 'cccc dddd eeee ffff', bold, italic: !bold },
  { text: ' gggg hhhh iiii jjjj kkkk llll mmmm', bold: false, italic: false },
];
const justified = (lines: VDTLine[]): VDTLine[] => lines.filter((l) => !l.isLastLine && l.justifiedSpaceRatio !== undefined);
/** The formula of #704 from the line's own segments. */
const fromSegments = (line: VDTLine, measure: number, normal = 7): number => {
  const segs = line.segments!;
  const natural = segs.reduce((a, s) => a + s.width, 0);
  return 1 + (measure - natural) / (segs.filter((s) => s.kind === 'space').length * normal);
};

describe('a justified line records the word spacing its limits bound (#704)', () => {
  it('the italic line: painted at 0.524 of a regular space, bounded at 0.714', () => {
    const line = measureRichBlock(mixed(false), R, B, I, B, 123, 20, KP).lines.find((l) => l.text === 'dddd eeee ffff gggg')!;
    expect(line.segments!.filter((s) => s.kind === 'space').map((s) => s.width)).toEqual([5, 5, 7]);
    expect(line.justifiedSpaceRatio).toBeCloseTo(0.5238, 4);
    expect(line.justifiedSpaceLimitRatio).toBeCloseTo(0.7143, 4);
    expect(lineWordSpacing(line)).toBeCloseTo(0.7143, 4);
  });

  it('the bold line: painted at 2.095 of a regular space, bounded at 2.000', () => {
    const line = measureRichBlock(mixed(true), R, B, I, B, 156, 20, KP).lines.find((l) => l.text === 'aaaa bbbb cccc dddd')!;
    expect(line.segments!.filter((s) => s.kind === 'space').map((s) => s.width)).toEqual([7, 7, 9]);
    expect(line.justifiedSpaceRatio).toBeCloseTo(2.0952, 4);
    expect(line.justifiedSpaceLimitRatio).toBeCloseTo(2, 9);
    expect(lineWordSpacing(line)).toBeCloseTo(2, 9);
  });

  it('over a sweep of measures no Knuth–Plass line reads past the limits through lineWordSpacing', () => {
    let underPainted = 0;
    let overPainted = 0;
    let overBound = 0;
    for (const bold of [false, true]) {
      for (let w = 120; w < 200; w++) {
        for (const line of justified(measureRichBlock(mixed(bold), R, B, I, B, w, 20, KP).lines)) {
          const spacing = lineWordSpacing(line)!;
          // No space shrinks past the limit, ever.
          expect(spacing, `${w} ${line.text}`).toBeGreaterThanOrEqual(MIN - 1e-9);
          expect(spacing).toBeCloseTo(fromSegments(line, w), 9);
          if (line.justifiedSpaceRatio! < MIN - 1e-9) underPainted++;
          // Past the stretch bound only where no break keeps within it (a
          // measure of three words). With bold spaces the painted number
          // reads past it on lines the breaker set within the bound.
          if (bold && line.justifiedSpaceRatio! > MAX + 1e-9) overPainted++;
          if (bold && spacing > MAX + 1e-9) overBound++;
        }
      }
    }
    // Non-vacuous: the painted ratio reads past both limits, and past the
    // upper one more often than the breaker went.
    expect(underPainted).toBeGreaterThan(0);
    expect(overPainted).toBeGreaterThan(overBound);
  });

  it('a paragraph in one face carries no new field, on any breaker', () => {
    const text = 'aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj kkkk llll mmmm';
    const one: InlineSpan[] = [{ text, bold: false, italic: false }];
    for (let w = 120; w < 200; w += 3) {
      const all = [
        ...measureRichBlock(one, R, B, I, B, w, 20, KP).lines,
        ...measureRichBlock(one, R, B, I, B, w, 20, { textAlign: 'justify' }).lines,
        ...measureBlock(text, R, w, 20, KP).lines,
        ...measureBlock(text, R, w, 20, { textAlign: 'justify' }).lines,
      ];
      expect(justified(all).length).toBeGreaterThan(0);
      for (const line of all) {
        expect('justifiedSpaceLimitRatio' in line, `${w} ${line.text}`).toBe(false);
        if (line.justifiedSpaceRatio !== undefined) expect(lineWordSpacing(line)).toBe(line.justifiedSpaceRatio);
      }
    }
  });

  it('the line-by-line breaker writes it on a mixed-face line too, and the last line has neither', () => {
    let seen = 0;
    for (let w = 120; w < 200; w += 2) {
      const lines = measureRichBlock(mixed(true), R, B, I, B, w, 20, { textAlign: 'justify' }).lines;
      const last = lines[lines.length - 1]!;
      expect(last.justifiedSpaceRatio).toBeUndefined();
      expect(last.justifiedSpaceLimitRatio).toBeUndefined();
      for (const line of justified(lines)) {
        const own = line.segments!.filter((s) => s.kind === 'space').some((s) => s.width !== 7);
        expect(line.justifiedSpaceLimitRatio !== undefined, `${w} ${line.text}`).toBe(own);
        if (own) {
          seen++;
          expect(line.justifiedSpaceLimitRatio).toBeCloseTo(fromSegments(line, w), 9);
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('a tracked line counts its tracking before the spaces', () => {
    // Justification tracking widens the letters; the spaces keep their own
    // widths, so a line in one face still carries one number.
    const one: InlineSpan[] = [{ text: 'aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj kkkk llll mmmm', bold: false, italic: false }];
    let tracked = 0;
    for (let w = 120; w < 200; w++) {
      for (const [spans, face] of [[one, 'one'], [mixed(true), 'mixed']] as const) {
        for (const line of justified(measureRichBlock(spans, R, B, I, B, w, 20, { ...KP, maxStretchRatio: 1.2, justifyTrackingPx: 0.5 }).lines)) {
          if (!line.letterSpacing) continue;
          tracked++;
          const own = line.segments!.filter((s) => s.kind === 'space').some((s) => s.width !== 7);
          if (face === 'one') expect(line.justifiedSpaceLimitRatio).toBeUndefined();
          else if (own) expect(line.justifiedSpaceLimitRatio).toBeCloseTo(fromSegments(line, w), 9);
        }
      }
    }
    expect(tracked).toBeGreaterThan(0);
  });

  it('a line stretched with kashidas measures its spaces again, both numbers', () => {
    const words = 'كتاب جميل عن تاريخ الطباعة العربية وفنون الخط في المشرق والمغرب منذ القرن الثامن عشر حتى يومنا هذا';
    const one: InlineSpan[] = [{ text: words, bold: false, italic: false }];
    const [head, tail] = words.split('تاريخ الطباعة العربية');
    const bold: InlineSpan[] = [
      { text: head!, bold: false, italic: false },
      { text: 'تاريخ الطباعة العربية', bold: true, italic: false },
      { text: tail!, bold: false, italic: false },
    ];
    const options = { ...KP, direction: 'rtl' as const, kashida: { patterns: 'naskh' as const, perWord: 1, maxLengthPx: 15 } };
    let stretched = 0;
    let mixedLines = 0;
    for (let w = 150; w < 260; w += 5) {
      for (const [spans, face] of [[one, 'one'], [bold, 'mixed']] as const) {
        for (const line of measureRichBlock(spans, R, B, I, B, w, 20, options).lines) {
          if (!line.kashida || line.justifiedSpaceRatio === undefined) continue;
          stretched++;
          const own = line.segments!.filter((s) => s.kind === 'space').some((s) => s.width !== 7);
          if (face === 'one') expect(line.justifiedSpaceLimitRatio).toBeUndefined();
          expect(line.justifiedSpaceLimitRatio !== undefined, `${w} ${face}`).toBe(own);
          if (own) {
            mixedLines++;
            expect(line.justifiedSpaceLimitRatio).toBeCloseTo(fromSegments(line, w), 6);
          }
        }
      }
    }
    expect(stretched).toBeGreaterThan(0);
    expect(mixedLines).toBeGreaterThan(0);
  });

  it('the sums give both numbers, and one when the spaces are regular', () => {
    const seg = (kind: 'text' | 'space', width: number) => ({ kind, text: kind === 'space' ? ' ' : 'x', width });
    expect(justifiedSpaceRatios([seg('text', 28), seg('space', 7), seg('text', 28)], 70, 7)).toEqual({ justifiedSpaceRatio: 2 });
    const bold = justifiedSpaceRatios([seg('text', 28), seg('space', 9), seg('text', 28)], 70, 7);
    expect(bold.justifiedSpaceRatio).toBeCloseTo(2, 9);
    expect(bold.justifiedSpaceLimitRatio).toBeCloseTo(1 + (70 - 65) / 7, 9);
    expect(justifiedSpaceRatios([seg('text', 28)], 70, 7)).toEqual({});
    expect(justifiedSpaceRatios([seg('text', 28), seg('space', 7)], 70, 0)).toEqual({});
  });

  it('a line set ragged for being too loose drops both numbers', () => {
    const loose = { text: 'a b', bbox: { x: 0, y: 0, width: 21, height: 20 }, baseline: 16, hyphenated: false, isLastLine: false, justifiedSpaceRatio: 9, justifiedSpaceLimitRatio: 8.7, segments: [] } as unknown as VDTLine;
    const [out] = raggedLooseLines([loose], 'justify');
    expect(out!.ragged).toBe(true);
    expect(out!.justifiedSpaceRatio).toBeUndefined();
    expect(out!.justifiedSpaceLimitRatio).toBeUndefined();
  });
});

describe('the loose-line reading uses the bounded number (#704)', () => {
  const pt = (value: number) => ({ value, unit: 'pt' as const });
  const config = (measurePx: number): PostextConfig => ({
    page: { dpi: 96, width: pt(measurePx * 72 / 96 + 40), height: pt(600), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
    layout: { layoutType: 'single' },
    bodyText: { textAlign: 'justify', firstLineIndent: pt(0), hyphenation: { enabled: false }, minWordSpacing: MIN, maxWordSpacing: MAX },
    headings: { levels: [] },
  }) as PostextConfig;
  const MD = 'aaaa bbbb **cccc dddd eeee ffff** gggg hhhh iiii jjjj kkkk llll mmmm';
  const linesOf = (doc: VDTDocument): VDTLine[] => doc.blocks.flatMap((b) => b.lines);

  it('a line at the limit that holds a bold space is not reported at a threshold of maxWordSpacing', () => {
    let atLimit = 0;
    for (let w = 120; w < 200; w++) {
      const doc = buildDocument({ markdown: MD }, config(w), createMeasurementCache());
      for (const line of linesOf(doc)) {
        if (line.justifiedSpaceRatio === undefined) continue;
        const spacing = lineWordSpacing(line)!;
        // The line was set within the limit, and is painted past it.
        if (!(spacing <= MAX + 1e-9 && line.justifiedSpaceRatio > MAX + 1e-9)) continue;
        atLimit++;
        expect(findLooseLines(doc, { threshold: MAX }).some((l) => l.line === line)).toBe(false);
        expect(lineLooseness(line, 16)).toBe(spacing);
      }
      // And what it does report carries the bounded number.
      for (const l of findLooseLines(doc, { threshold: 1.5 })) expect(l.ratio).toBe(lineWordSpacing(l.line));
    }
    expect(atLimit).toBeGreaterThan(0);
  });
});
