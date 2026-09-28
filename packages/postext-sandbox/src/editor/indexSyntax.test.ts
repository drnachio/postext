import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { CompletionContext, type Completion } from '@codemirror/autocomplete';
import { indexCompletionSource, indexRanges, indexTermsOf } from './indexSyntax';

describe('index mark highlighting', () => {
  it('marks the syntax, the indexed words and the attributes', () => {
    const text = 'The :index[heart]{main} and :index{term="Pulse"}, not :::index or \\:index{x}.';
    const pick = (kind: string) => indexRanges(text).filter((r) => r.kind === kind).map((r) => text.slice(r.from, r.to));
    expect(pick('delim')).toEqual([':index[', ']', ':index']);
    expect(pick('text')).toEqual(['heart']);
    expect(pick('attr')).toEqual(['{main}', '{term="Pulse"}']);
  });

  it('collects the book\'s terms', () => {
    expect(indexTermsOf(['A :index[*heart*] b', 'c :index{term="Heart!valves" main} :index{see="x"}'])).toEqual(['heart', 'Heart', 'Heart!valves']);
  });
});

describe('index completion', () => {
  const complete = (doc: string, terms = ['Heart', 'Pulse']) => {
    const state = EditorState.create({ doc });
    return indexCompletionSource(() => terms)(new CompletionContext(state, doc.length, false));
  };
  it('offers both forms after :in, not after :::', () => {
    expect(complete('The :ind')?.options.map((o: Completion) => o.label)).toEqual([':index[…]', ':index{term="…"}']);
    expect(complete(':::ind')).toBeNull();
  });
  it('offers the book\'s terms inside term="…"', () => {
    const r = complete('A :index{term="He');
    expect(r?.options.map((o: Completion) => o.label)).toEqual(['Heart', 'Pulse']);
    expect(r?.from).toBe('A :index{term="'.length);
    expect(complete('A :index{see=')?.options[0]!.apply).toBe('"Heart"');
  });
});
