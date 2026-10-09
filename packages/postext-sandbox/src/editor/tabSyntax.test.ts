import { describe, expect, it } from 'vitest';
import { EditorState, type TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { CompletionContext, type Completion } from '@codemirror/autocomplete';
import { tabCompletionSource, tabRanges, tabbableLines } from './tabSyntax';

const marked = (text: string, kind: 'tab' | 'attr') => tabRanges(text).filter((r) => r.kind === kind).map((r) => text.slice(r.from, r.to));

const complete = (doc: string) => {
  const state = EditorState.create({ doc });
  return tabCompletionSource(new CompletionContext(state, doc.length, false));
};

describe('tab highlighting (#622)', () => {
  it('marks :tab and the attributes of a one-off stop', () => {
    const text = 'Soup :tab 8.50, wine :tab{at=120mm align=end leader="."} 4.00 and:tab.';
    expect(marked(text, 'tab')).toEqual([':tab', ':tab', ':tab']);
    expect(marked(text, 'attr')).toEqual(['{at=120mm align=end leader="."}']);
  });

  it('leaves a :tab followed by a letter, and one in code, maths or a link, alone', () => {
    expect(tabRanges('3:table and :tabs')).toEqual([]);
    expect(tabRanges('code `a :tab b`, maths $x :tab y$ and [l](a:tab)')).toEqual([]);
    expect(marked('`code` then :tab', 'tab')).toEqual([':tab']);
  });

  it('leaves fenced code and display formulas alone', () => {
    const lines = ['A :tab', '```', 'b :tab', '```', '$$', 'c :tab', '$$', '$$x$$', 'D :tab'];
    expect(tabbableLines(lines)).toEqual([true, false, false, false, false, false, false, false, true]);
  });
});

describe('tab completion (#622)', () => {
  it('offers both forms after `:t…` at the start of a word, not after `:::`', () => {
    const r = complete('Soup :ta');
    expect(r?.options.map((o: Completion) => o.label)).toEqual([':tab', ':tab{at=… align=end leader="."}']);
    expect(r?.from).toBe('Soup '.length);
    expect(complete('ratio:t')).toBeNull();
    expect(complete(':::t')).toBeNull();
    expect(complete('Soup :x')).toBeNull();
  });

  it('inserts a one-off stop with its position selected', () => {
    const doc = 'Soup :t';
    const r = complete(doc)!;
    let spec: TransactionSpec | undefined;
    const view = { dispatch: (s: TransactionSpec) => { spec = s; } } as unknown as EditorView;
    const apply = r.options[1]!.apply as (v: EditorView, c: Completion, from: number, to: number) => void;
    apply(view, r.options[1]!, r.from, r.to ?? doc.length);
    const next = EditorState.create({ doc }).update(spec!).state;
    expect(next.doc.toString()).toBe('Soup :tab{at=end align=end leader="."}');
    const { from, to } = next.selection.main;
    expect(next.doc.sliceString(from, to)).toBe('end');
    expect(r.options[0]!.apply).toBe(':tab');
  });
});
