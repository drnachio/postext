import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';
import { charStyleCompletionSource, charStyleEdit, charStyleRemoval, charStyleRuns, runAt } from './charStyleSyntax.js';
import { annotationRanges } from './annotationSyntax.js';

const apply = (text: string, from: number, to: number, id: string): string => {
  const e = charStyleEdit(text, from, to, id);
  return text.slice(0, e.from) + e.insert + text.slice(e.to);
};

describe('character style commands', () => {
  it('wraps the selection in the style', () => {
    expect(apply('Un texto aquí', 3, 8, 'term')).toBe('Un :span[texto]{style="term"} aquí');
    const e = charStyleEdit('Un texto aquí', 3, 8, 'term');
    expect([e.anchor, e.head]).toEqual([9, 14]);
  });

  it('inserts an empty run at the caret', () => {
    const e = charStyleEdit('ab', 1, 1, 'x');
    expect(e.insert).toBe(':span[]{style="x"}');
    expect(e.anchor).toBe(7);
  });

  it('changes the style of the run the selection is in', () => {
    const text = 'Un :span[texto]{style="term"} aquí';
    expect(apply(text, 10, 12, 'foreign')).toBe('Un :span[texto]{style="foreign"} aquí');
    expect(apply(text, 3, 29, 'foreign')).toBe('Un :span[texto]{style="foreign"} aquí');
    const whole = charStyleEdit(text, 3, 29, 'foreign');
    expect([whole.anchor, whole.head]).toEqual([3, 32]);
    expect(apply('Un :span[texto]{style=term} aquí', 10, 12, 'x')).toBe('Un :span[texto]{style=x} aquí');
    // A run with no style yet gets one.
    expect(apply('Un :span[texto] aquí', 10, 12, 'x')).toBe('Un :span[texto]{style="x"} aquí');
  });

  it('takes a run\'s style off', () => {
    const text = 'Un :span[texto **fuerte**]{style="term"} aquí';
    const e = charStyleRemoval(text, 11, 11)!;
    expect(text.slice(0, e.from) + e.insert + text.slice(e.to)).toBe('Un texto **fuerte** aquí');
    expect(charStyleRemoval('sin estilo', 2, 2)).toBeUndefined();
  });

  it('finds the innermost run, and no bar form', () => {
    const text = ':span[a :span[b]{style="y"} c]{style="x"}';
    expect(charStyleRuns(text).map((r) => r.style)).toEqual(['x', 'y']);
    expect(runAt(text, 15, 15)?.style).toBe('y');
    expect(runAt(text, 6, 6)?.style).toBe('x');
    expect(charStyleRuns('[a]|x|')).toEqual([]);
  });

  it('is highlighted in the editor', () => {
    expect(annotationRanges('Un :span[texto]{style="term"}').map((r) => [r.from, r.to, r.kind])).toEqual([
      [3, 9, 'delim'],
      [9, 14, 'span'],
      [14, 29, 'delim'],
    ]);
    expect(annotationRanges('Un [texto]|term|')).toEqual([]);
  });
});

describe('character style completion', () => {
  const source = charStyleCompletionSource(() => [{ id: 'term', name: 'Key term' }, { id: 'foreign' }]);
  const at = (doc: string) => source(new CompletionContext(EditorState.create({ doc }), doc.length, true));

  it('offers the style ids inside a span\'s style attribute', () => {
    const r = at('Un :span[texto]{style="te');
    expect(r?.options.map((o) => o.label)).toEqual(['term', 'foreign']);
    expect(r?.from).toBe('Un :span[texto]{style="'.length);
    expect(at('Un :span[a [b] c]{style=')?.options[0]?.apply).toBe('"term"');
  });

  it('offers nothing in another directive or out of one', () => {
    expect(at('Un :chip[texto]{style="')).toBeNull();
    expect(at('Un [texto]{style="')).toBeNull();
    expect(at('Un texto')).toBeNull();
  });
});
