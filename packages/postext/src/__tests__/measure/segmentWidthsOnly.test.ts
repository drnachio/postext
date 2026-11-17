import { describe, it, expect } from 'vitest';
import { prepareInLanguage } from '../../measure/pretextLanguage.js';
import { measureBlock } from '../../measure/plain.js';

// #1614: a paragraph Knuth–Plass breaks asks the text library for its
// segments and their widths alone. The library then leaves out what it
// measures for its own line breaker: the two neighbours of each soft hyphen
// set joined, and where a long word may be cut between letters.

/** Every text the canvas was asked to measure, by font. */
const asked = new Map<string, string[]>();
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const list = asked.get(this.font) ?? [];
    list.push(s);
    asked.set(this.font, list);
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};
const askedIn = (font: string): string[] => asked.get(font) ?? [];

const SHY = '­';
const TEXT = `re${SHY}pli${SHY}qué yo, oyen${SHY}do lo que me de${SHY}cía, in${SHY}com${SHY}pren${SHY}si${SHY}ble${SHY}men${SHY}te`;

describe('segments and widths alone', () => {
  it('are the segments, kinds and widths of a full preparation, for fewer measures', () => {
    // A font each: the library keeps the widths it measured by font.
    const full = prepareInLanguage(TEXT, '16px Whole');
    const lean = prepareInLanguage(TEXT, '16px Lean', true);
    expect(lean.segments).toEqual(full.segments);
    expect(lean.kinds).toEqual(full.kinds);
    expect(Array.from(lean.widths)).toEqual(Array.from(full.widths));

    // Two syllables joined are measured for the library's breaker only.
    expect(askedIn('16px Whole')).toContain('repli');
    expect(askedIn('16px Whole')).toContain('pliqué');
    for (const joined of ['repli', 'pliqué', 'oyendo', 'decía', 'incom']) expect(askedIn('16px Lean')).not.toContain(joined);
    // Every segment is still measured.
    for (const piece of ['re', 'pli', 'qué', 'yo,', 'oyen', 'do']) expect(askedIn('16px Lean')).toContain(piece);
    expect(askedIn('16px Lean').length).toBeLessThan(askedIn('16px Whole').length / 1.5);
  });

  it('is what a justified paragraph set by Knuth–Plass asks for', () => {
    const block = measureBlock(TEXT, '16px Justified', 180, 20, { optimal: true, textAlign: 'justify' });
    expect(block.breaks?.path).toBe('plain');
    expect(block.lines.length).toBeGreaterThan(1);
    expect(askedIn('16px Justified')).not.toContain('repli');
    expect(askedIn('16px Justified')).not.toContain('pliqué');
  });

  it('is prepared in full again when the library breaks the lines after all', () => {
    // A word wider than the measure: Knuth–Plass finds no setting, and the
    // library's breaker cuts the word between letters, which it can only do
    // on a text prepared in full.
    const long = `corto ${'x'.repeat(60)} final`;
    const optimal = measureBlock(long, '16px Fallback', 140, 20, { optimal: true, textAlign: 'justify' });
    const greedy = measureBlock(long, '16px Greedy', 140, 20, { textAlign: 'justify' });
    expect(optimal.breaks).toBeUndefined();
    expect(optimal.lines.map((l) => l.text)).toEqual(greedy.lines.map((l) => l.text));
    expect(optimal.lines.every((l) => l.bbox.width <= 140)).toBe(true);
  });
});
