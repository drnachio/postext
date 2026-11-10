import { describe, expect, it } from 'vitest';
import { parseInlineFormatting } from '../../parse/inlineFormatting.js';
import { findAnnotations, stripAnnotations } from '../../parse/annotations.js';

const styled = (text: string) =>
  parseInlineFormatting(text).map((s) => ({ text: s.text, style: s.charStyle?.style, id: s.charStyle?.id, bold: s.bold }));

describe('character styles: [text]|style|', () => {
  it('sets the run in the named style, the bars and brackets left out', () => {
    expect(styled('Un [texto marcado]|rotulador| aquí.')).toEqual([
      { text: 'Un ', style: undefined, id: undefined, bold: false },
      { text: 'texto marcado', style: 'rotulador', id: 1, bold: false },
      { text: ' aquí.', style: undefined, id: undefined, bold: false },
    ]);
  });

  it('keeps other marks inside and tells two runs apart', () => {
    const spans = styled('[a **b**]|x| [c]|x|');
    expect(spans.filter((s) => s.style === 'x').map((s) => [s.text, s.bold, s.id])).toEqual([
      ['a ', false, 1],
      ['b', true, 1],
      ['c', false, 2],
    ]);
  });

  it('the innermost style wins in a nested run', () => {
    expect(styled('[a [b]|y| c]|x|').map((s) => [s.text, s.style])).toEqual([
      ['a ', 'x'],
      ['b', 'y'],
      [' c', 'x'],
    ]);
  });

  it('leaves text that is not a style alone', () => {
    for (const text of ['[a] |x|', '[a]|x', '[]|x|', '\\[a]|x|', '[a]|x y|', 'el valor [0, 1]']) {
      expect(styled(text).every((s) => s.style === undefined)).toBe(true);
    }
    expect(parseInlineFormatting('\\[a]|x|').map((s) => s.text).join('')).toBe('[a]|x|');
  });

  it('is plain text for running heads and index terms, and found by the editor', () => {
    expect(stripAnnotations('Un [texto]|rotulador| aquí')).toBe('Un texto aquí');
    expect(findAnnotations('Un [texto]|rotulador|').map((f) => [f.name, f.start, f.contentStart, f.contentEnd, f.end, f.style])).toEqual([
      ['charstyle', 3, 4, 9, 21, 'rotulador'],
    ]);
  });
});
