import { describe, expect, it } from 'vitest';
import { EditorState, type TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { CompletionContext, type Completion } from '@codemirror/autocomplete';
import { smallCapsCompletionSource, smallCapsRanges } from './smallCapsSyntax';

const complete = (doc: string) => {
  const state = EditorState.create({ doc });
  return smallCapsCompletionSource(new CompletionContext(state, doc.length, false));
};

describe('small-caps highlighting', () => {
  it('marks the directive and the text, a nested chip and an escaped bracket included', () => {
    const text = 'Enter :smallcaps[Hamlet] and :smallcaps[a \\] :chip[key] b].';
    const pick = (kind: string) => smallCapsRanges(text).filter((r) => r.kind === kind).map((r) => text.slice(r.from, r.to));
    expect(pick('text')).toEqual(['Hamlet', 'a \\] :chip[key] b']);
    expect(pick('delim')).toEqual([':smallcaps[', ']', ':smallcaps[', ']']);
    expect(smallCapsRanges('no :smallcaps[] here, nor :smallcaps[open')).toEqual([]);
  });
});

describe('small-caps completion', () => {
  it('offers the directive after `:sm…` at the start of a word or inside emphasis', () => {
    const r = complete('Enter :sma');
    expect(r?.options.map((o: Completion) => o.label)).toEqual([':smallcaps[…]']);
    expect(r?.from).toBe('Enter '.length);
    expect(complete('Enter **:smallcaps')?.from).toBe('Enter **'.length);
    expect(complete('Enter :s')).toBeNull();
    expect(complete('ratio:sm')).toBeNull();
  });

  it('inserts the directive with the caret between the brackets', () => {
    const doc = 'Enter :sm';
    const r = complete(doc)!;
    // No DOM in the node test env: capture the transaction the view would get.
    let spec: TransactionSpec | undefined;
    const view = { dispatch: (s: TransactionSpec) => { spec = s; } } as unknown as EditorView;
    const apply = r.options[0]!.apply as (v: EditorView, c: Completion, from: number, to: number) => void;
    apply(view, r.options[0]!, r.from, r.to ?? doc.length);
    const next = EditorState.create({ doc }).update(spec!).state;
    expect(next.doc.toString()).toBe('Enter :smallcaps[]');
    expect(next.selection.main.head).toBe('Enter :smallcaps['.length);
  });
});
