import { describe, it, expect } from 'vitest';
import { measureRichBlock } from '../../measure/rich.js';
import { setHyphenationLocale } from '../../hyphenation/hyphenate.js';
import type { InlineSpan } from '../../parse/index.js';

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

const FONT = '16px Test';
const span = (text: string): InlineSpan[] => [{ text, bold: false, italic: false }];
type Lines = ReturnType<typeof measureRichBlock>['lines'];
const texts = (lines: Lines): string[] => lines.map((l) => l.text);
const widths = (lines: Lines): number[] => lines.map((l) => l.segments!.reduce((s, seg) => s + seg.width, 0));
/** Every glyph laid out, spaces dropped. */
const joined = (lines: Lines): string => lines.map((l) => l.segments!.map((s) => s.text).join('')).join('').replace(/\s+/g, '');

describe('breaks inside words', () => {
  it('a hard hyphen between letters is a break opportunity that adds no hyphen (greedy)', () => {
    // 12 characters per line: "enseñanza-aprendizaje" (21) is wider than
    // the line, "enseñanza-" (10) ends it on its own hyphen.
    const block = measureRichBlock(span('Proceso de enseñanza-aprendizaje'), FONT, FONT, FONT, FONT, 84, 20, { textAlign: 'left' });
    expect(texts(block.lines)).toEqual(['Proceso de', 'enseñanza-', 'aprendizaje']);
    expect(joined(block.lines)).toBe('Procesodeenseñanza-aprendizaje');
    for (const w of widths(block.lines)) expect(w).toBeLessThanOrEqual(84);
  });

  it('…and on the Knuth-Plass path', () => {
    const text = 'Proceso de enseñanza-aprendizaje continuo y más';
    const block = measureRichBlock(span(text), FONT, FONT, FONT, FONT, 84, 20, {
      textAlign: 'justify', optimal: true, maxStretchRatio: 2, minShrinkRatio: 0.6,
    });
    expect(joined(block.lines)).toBe(text.replace(/\s+/g, ''));
    expect(texts(block.lines)).toContain('enseñanza-');
    for (const w of widths(block.lines)) expect(w).toBeLessThanOrEqual(84);
  });

  it('a word wider than the line is divided at a syllable, never overflowing its measure', () => {
    setHyphenationLocale('es');
    // 8 characters per line; "aprendizaje" is 11: apren-di-za-je → "aprendi-" (8) fits.
    const block = measureRichBlock(span('aprendizaje'), FONT, FONT, FONT, FONT, 56, 20, { textAlign: 'left' });
    expect(texts(block.lines)).toEqual(['aprendi-', 'zaje']);
    for (const w of widths(block.lines)) expect(w).toBeLessThanOrEqual(56);
    // Nothing hyphenated where the words fit.
    const fine = measureRichBlock(span('apren dizaje'), FONT, FONT, FONT, FONT, 56, 20, { textAlign: 'left' });
    expect(texts(fine.lines)).toEqual(['apren', 'dizaje']);
  });

  it('…and at the last character that fits when no syllable does', () => {
    setHyphenationLocale('es');
    // 6 characters per line: a run of one letter has no syllables; the last
    // six fit a line as they are.
    const block = measureRichBlock(span('xxxxxxxxxxxxxxxx'), FONT, FONT, FONT, FONT, 42, 20, { textAlign: 'left' });
    expect(texts(block.lines)).toEqual(['xxxxx-', 'xxxxx-', 'xxxxxx']);
    for (const w of widths(block.lines)) expect(w).toBeLessThanOrEqual(42);
    expect(joined(block.lines).replace(/-/g, '')).toBe('xxxxxxxxxxxxxxxx');
    // A run of digits is a number, never divided as a word (#1549): it runs
    // past the measure whole.
    const number = measureRichBlock(span('1234567890123456'), FONT, FONT, FONT, FONT, 42, 20, { textAlign: 'left' });
    expect(texts(number.lines)).toEqual(['1234567890123456']);
    expect(number.lines[0]!.numberOverflow).toBe(true);
  });
});
