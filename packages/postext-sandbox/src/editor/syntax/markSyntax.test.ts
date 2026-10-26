import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { CompletionContext, type Completion } from '@codemirror/autocomplete';
import { markCompletionSource, markRanges } from './markSyntax.js';

// #888: the editor marks `:mark[…]{style="…"}` and completes it.

const complete = (doc: string, styles = [{ id: 'mark', name: 'Mark' }, { id: 'key', name: 'Key' }]) => {
  const state = EditorState.create({ doc });
  return markCompletionSource(() => styles)(new CompletionContext(state, doc.length, false));
};

describe('mark highlighting', () => {
  it('marks the directive, the marked text and the attributes', () => {
    const text = 'The :mark[water cycle] and :mark[a [link](u) \\] b]{style="key"}.';
    const pick = (kind: string) => markRanges(text).filter((r) => r.kind === kind).map((r) => text.slice(r.from, r.to));
    expect(pick('text')).toEqual(['water cycle', 'a [link](u) \\] b']);
    expect(pick('delim')).toEqual([':mark[', ']', ':mark[', ']']);
    expect(pick('attr')).toEqual(['{style="key"}']);
    expect(markRanges('no :mark[] here')).toEqual([]);
    expect(markRanges('open :mark[runs on')).toEqual([]);
  });
});

describe('mark completion', () => {
  it('offers the directive after `:m…` at the start of a word', () => {
    const r = complete('The :ma');
    expect(r?.options.map((o: Completion) => o.label)).toEqual([':mark[…]']);
    expect(r?.from).toBe('The '.length);
    expect(complete('ratio:ma')).toBeNull();
  });

  it('offers the style ids inside `style="…"`', () => {
    const r = complete('A :mark[x]{style="k');
    expect(r?.options.map((o: Completion) => o.label)).toEqual(['mark', 'key']);
    expect(complete('A :mark[x]{style=')?.options[1]!.apply).toBe('"key"');
  });
});
