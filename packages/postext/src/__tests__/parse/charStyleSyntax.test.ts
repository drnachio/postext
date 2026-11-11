import { describe, expect, it } from 'vitest';
import { parseInlineFormatting } from '../../parse/inlineFormatting.js';
import { findAnnotations, markAnnotations, stripAnnotations } from '../../parse/annotations.js';

const styled = (text: string) =>
  parseInlineFormatting(text).map((s) => ({ text: s.text, style: s.charStyle?.style, id: s.charStyle?.id, bold: s.bold }));

describe('character styles: :span[words]{style="id"}', () => {
  it('sets the run in the named style, the directive left out', () => {
    expect(styled('Un :span[texto marcado]{style="rotulador"} aquí.')).toEqual([
      { text: 'Un ', style: undefined, id: undefined, bold: false },
      { text: 'texto marcado', style: 'rotulador', id: 1, bold: false },
      { text: ' aquí.', style: undefined, id: undefined, bold: false },
    ]);
  });

  it('reads an unquoted style too', () => {
    expect(styled(':span[a]{style=x}').find((s) => s.text === 'a')?.style).toBe('x');
  });

  it('keeps other marks inside and tells two runs apart', () => {
    const spans = styled(':span[a **b**]{style="x"} :span[c]{style="x"}');
    expect(spans.filter((s) => s.style === 'x').map((s) => [s.text, s.bold, s.id])).toEqual([
      ['a ', false, 1],
      ['b', true, 1],
      ['c', false, 2],
    ]);
  });

  it('the innermost style wins in a nested run', () => {
    expect(styled(':span[a :span[b]{style="y"} c]{style="x"}').map((s) => [s.text, s.style])).toEqual([
      ['a ', 'x'],
      ['b', 'y'],
      [' c', 'x'],
    ]);
  });

  it('leaves the old bar form as text', () => {
    for (const text of ['[a]|x|', 'el valor [0, 1]', '[a] |x|']) {
      expect(styled(text).every((s) => s.style === undefined)).toBe(true);
      expect(parseInlineFormatting(text).map((s) => s.text).join('')).toBe(text);
    }
  });

  it('is plain text for running heads and index terms, and found by the editor', () => {
    expect(stripAnnotations('Un :span[texto]{style="rotulador"} aquí')).toBe('Un texto aquí');
    const found = findAnnotations('Un :span[texto]{style="rotulador"}');
    expect(found.map((f) => [f.name, f.start, f.contentStart, f.contentEnd, f.end, f.attrs])).toEqual([
      ['span', 3, 9, 14, 34, 'style="rotulador"'],
    ]);
  });
});

describe('annotation scan time', () => {
  // The reviewer's measure of the bar form's scanner: 6.9 s for 80 000
  // `\[`, 14.9 s for 80 000 `[`. The annotation reader (which finds
  // `:span[…]` with the other annotations, for the layout, running heads
  // and the editor) reads each in one pass; the bound leaves room for a
  // loaded machine.
  const time = (text: string): number => {
    const t0 = performance.now();
    findAnnotations(text);
    stripAnnotations(text);
    markAnnotations(text, [], (s) => s);
    return performance.now() - t0;
  };
  for (const unit of ['[', '\\[', ':span[', ':span[a]{', ':', ']', '{', '[a]|x|']) {
    it(`reads 80 000 × ${unit} in linear time`, () => {
      const small = time(unit.repeat(10_000));
      const large = time(unit.repeat(80_000));
      expect(large).toBeLessThan(5000);
      // Eight times the text, well under 64 times the time.
      expect(large).toBeLessThan(Math.max(250, small * 30));
    });
  }
});
