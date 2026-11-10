import { describe, expect, it } from 'vitest';
import { charStyleEdit, charStyleRemoval, charStyleRuns, runAt } from './charStyleSyntax.js';
import { annotationRanges } from './annotationSyntax.js';

const apply = (text: string, from: number, to: number, id: string): string => {
  const e = charStyleEdit(text, from, to, id);
  return text.slice(0, e.from) + e.insert + text.slice(e.to);
};

describe('character style commands', () => {
  it('wraps the selection in the style', () => {
    expect(apply('Un texto aquí', 3, 8, 'marker')).toBe('Un [texto]|marker| aquí');
    const e = charStyleEdit('Un texto aquí', 3, 8, 'marker');
    expect([e.anchor, e.head]).toEqual([4, 9]);
  });

  it('inserts an empty run at the caret', () => {
    const e = charStyleEdit('ab', 1, 1, 'x');
    expect(e.insert).toBe('[]|x|');
    expect(e.anchor).toBe(2);
  });

  it('changes the style of the run the selection is in', () => {
    expect(apply('Un [texto]|marker| aquí', 5, 7, 'underline')).toBe('Un [texto]|underline| aquí');
    expect(apply('Un [texto]|marker| aquí', 3, 18, 'underline')).toBe('Un [texto]|underline| aquí');
  });

  it('takes a run\'s style off', () => {
    const text = 'Un [texto **fuerte**]|marker| aquí';
    const e = charStyleRemoval(text, 6, 6)!;
    expect(text.slice(0, e.from) + e.insert + text.slice(e.to)).toBe('Un texto **fuerte** aquí');
    expect(charStyleRemoval('sin estilo', 2, 2)).toBeUndefined();
  });

  it('finds the innermost run', () => {
    const text = '[a [b]|y| c]|x|';
    expect(charStyleRuns(text).map((r) => r.style)).toEqual(['x', 'y']);
    expect(runAt(text, 4, 4)?.style).toBe('y');
    expect(runAt(text, 1, 1)?.style).toBe('x');
  });

  it('is highlighted in the editor', () => {
    expect(annotationRanges('Un [texto]|marker|').map((r) => [r.from, r.to, r.kind])).toEqual([
      [3, 4, 'delim'],
      [4, 9, 'charstyle'],
      [9, 18, 'delim'],
    ]);
  });
});
