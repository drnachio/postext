import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { CompletionContext, type Completion } from '@codemirror/autocomplete';
import { chipCompletionSource, chipRanges } from './chipSyntax';

const complete = (doc: string, styles = [{ id: 'chip', name: 'Chip' }, { id: 'key', name: 'Key' }]) => {
  const state = EditorState.create({ doc });
  return chipCompletionSource(() => styles)(new CompletionContext(state, doc.length, false));
};

describe('chip highlighting', () => {
  it('marks the directive, the chip text and the attributes', () => {
    const text = 'Bank :chip[pila] and :chip[a \\] b]{style="key"}.';
    const pick = (kind: string) => chipRanges(text).filter((r) => r.kind === kind).map((r) => text.slice(r.from, r.to));
    expect(pick('text')).toEqual(['pila', 'a \\] b']);
    expect(pick('delim')).toEqual([':chip[', ']', ':chip[', ']']);
    expect(pick('attr')).toEqual(['{style="key"}']);
    expect(chipRanges('no :chip[] here')).toEqual([]);
  });
});

describe('chip completion', () => {
  it('offers the directive after `:c…` at the start of a word', () => {
    const r = complete('Bank :ch');
    expect(r?.options.map((o: Completion) => o.label)).toEqual([':chip[…]']);
    expect(r?.from).toBe('Bank '.length);
    expect(complete('ratio:ch')).toBeNull();
  });

  it('offers the style ids inside `style="…"`', () => {
    const r = complete('A :chip[x]{style="k');
    expect(r?.options.map((o: Completion) => o.label)).toEqual(['chip', 'key']);
    expect(r?.from).toBe('A :chip[x]{style="'.length);
    // Without a quote the id is inserted quoted.
    expect(complete('A :chip[x]{style=')?.options[1]!.apply).toBe('"key"');
  });
});
