import { describe, expect, it } from 'vitest';
import { EditorState, type TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { CompletionContext, type Completion } from '@codemirror/autocomplete';
import { verseCompletionSource, verseLineKinds, verseSeparator } from './verseSyntax';

describe(':::verse highlighting (#378)', () => {
  it('marks the fences and the bayt lines of a poem, nothing outside it', () => {
    const lines = ['Text || not verse', ':::verse{gap=2em}', 'A || B', 'single', ':::', 'After || text'];
    expect(verseLineKinds(lines)).toEqual([null, 'fence', 'bayt', 'bayt', 'fence', null]);
    // A viewport that starts inside a poem.
    expect(verseLineKinds(['C || D', ':::'], true)).toEqual(['bayt', 'fence']);
  });

  it('finds the separator: || first, else a spaced \\\\', () => {
    expect(verseSeparator('قفا نبك || من ذكرى')).toEqual({ from: 8, to: 10 });
    expect(verseSeparator('a \\\\ b')).toEqual({ from: 2, to: 4 });
    expect(verseSeparator('a\\\\b')).toBeNull();
    expect(verseSeparator('one hemistich')).toBeNull();
  });
});

describe('verse completion', () => {
  const complete = (doc: string) => verseCompletionSource(new CompletionContext(EditorState.create({ doc }), doc.length, false));
  it('offers the block after :::v at the start of a line only', () => {
    expect(complete(':::v')?.options.map((o) => o.label)).toEqual([':::verse']);
    expect(complete('text\n:::vers')?.from).toBe('text\n'.length);
    expect(complete(':::')).toBeNull();
    expect(complete('a :::v')).toBeNull();
    expect(complete(':::verse{')).toBeNull();
  });

  it('inserts one bayt with the caret before its separator', () => {
    const doc = ':::ve';
    const r = complete(doc)!;
    let spec: TransactionSpec | undefined;
    const view = { dispatch: (s: TransactionSpec) => { spec = s; } } as unknown as EditorView;
    (r.options[0]!.apply as (v: EditorView, c: Completion, from: number, to: number) => void)(view, r.options[0]!, r.from, r.to ?? doc.length);
    const next = EditorState.create({ doc }).update(spec!).state;
    expect(next.doc.toString()).toBe(':::verse\n || \n:::');
    expect(next.selection.main.head).toBe(':::verse\n'.length);
  });
});
