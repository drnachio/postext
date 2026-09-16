import { describe, it, expect } from 'vitest';
import { parseInlineFormatting, stripInlineFormatting } from '../../parse/inlineFormatting';
import { measureRichBlock, scriptMetrics, SCRIPT_SIZE_RATIO } from '../../measure/rich';

// Deterministic text measurement stub (no DOM in the node test env): the
// width follows the font size so a script span measures narrower.
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const size = parseFloat(/(\d*\.?\d+)px/.exec(this.font)?.[1] ?? '10');
    return { width: s.length * size * 0.5 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

describe('inline superscript / subscript', () => {
  it('parses ^…^ and ~…~ into script spans, inside bold and italic runs too', () => {
    const spans = parseInlineFormatting('H~2~O and 10^-8^ cm, **Na^+^** and *p*K~a~');
    expect(spans.map((s) => [s.text, s.script ?? '', s.bold, s.italic])).toEqual([
      ['H', '', false, false], ['2', 'sub', false, false], ['O and 10', '', false, false],
      ['-8', 'sup', false, false], [' cm, ', '', false, false],
      ['Na', '', true, false], ['+', 'sup', true, false], [' and ', '', false, false],
      ['p', '', false, true], ['K', '', false, false], ['a', 'sub', false, false],
    ]);
  });

  it('leaves a lone caret or tilde, and marks around spaces, literal', () => {
    expect(parseInlineFormatting('a ^ b ~ c').map((s) => s.text).join('')).toBe('a ^ b ~ c');
    expect(parseInlineFormatting('x^ y^ z').map((s) => s.script)).toEqual([undefined]);
    expect(parseInlineFormatting('~ not sub ~').every((s) => !s.script)).toBe(true);
  });

  it('stripInlineFormatting drops the markers', () => {
    expect(stripInlineFormatting('H~2~O at 10^-8^ **m**')).toBe('H2O at 10-8 m');
  });

  it('script metrics scale the font and shift the baseline', () => {
    const sup = scriptMetrics('700 20px Serif', 'sup');
    expect(sup.font).toBe(`700 ${20 * SCRIPT_SIZE_RATIO}px Serif`);
    expect(sup.baselineShift).toBeLessThan(0);
    const sub = scriptMetrics('italic 20px Serif', 'sub');
    expect(sub.baselineShift).toBeGreaterThan(0);
    expect(sub.baselineShift).toBeCloseTo(-sup.baselineShift, 6);
  });

  it('lays out script segments at the script size with a baseline shift', () => {
    const spans = parseInlineFormatting('H~2~O');
    const { lines } = measureRichBlock(spans, '20px Serif', '700 20px Serif', 'italic 20px Serif', 'italic 700 20px Serif', 1000, 24);
    expect(lines.length).toBe(1);
    const segs = lines[0]!.segments!;
    expect(segs.map((s) => s.text)).toEqual(['H', '2', 'O']);
    const two = segs[1]!;
    expect(two.script).toBe('sub');
    expect(two.fontString).toBe(`${20 * SCRIPT_SIZE_RATIO}px Serif`);
    expect(two.baselineShift).toBeGreaterThan(0);
    // Narrower than a full-size character.
    expect(two.width).toBeLessThan(segs[0]!.width);
  });
});
