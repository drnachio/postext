import { describe, expect, it } from 'vitest';
import { EditorState, type TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { CompletionContext, type Completion } from '@codemirror/autocomplete';
import { poemLayout, verseCompletionSource, verseLineKinds, verseLineMarks, verseSeparator } from './verseSyntax';

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

describe(':::verse line by line (#620)', () => {
  it('reads a poem with no separator as lines, and never marks a || it does not carry', () => {
    const lines = [':::verse', 'Whose woods these are', '  His house is', '', 'He will not see', ':::', 'A || B'];
    expect(verseLineKinds(lines)).toEqual(['fence', 'line', 'line', 'line', 'line', 'fence', null]);
    // `layout=lines` sets a line with || as text; `layout=bayt` the other way.
    expect(verseLineKinds([':::verse{layout=lines}', 'A || B', ':::'])).toEqual(['fence', 'line', 'fence']);
    expect(verseLineKinds([':::verse{layout=bayt}', 'single', ':::'])).toEqual(['fence', 'bayt', 'fence']);
    expect(verseLineKinds(['indented', ':::'], 'lines')).toEqual(['line', 'fence']);
  });

  it('picks the layout as the engine does', () => {
    expect(poemLayout(':::verse', ['a', 'b || c'])).toBe('bayt');
    expect(poemLayout(':::verse', ['a', 'b'])).toBe('lines');
    expect(poemLayout(':::verse{layout="lines"}', ['a || b'])).toBe('lines');
  });

  it('finds a line\'s indent and the + of a stepped line', () => {
    expect(verseLineMarks('  His house')).toEqual({ indent: 2 });
    expect(verseLineMarks('\t\u3000Line')).toEqual({ indent: 2 });
    expect(verseLineMarks('+ Nay, answer me')).toEqual({ indent: 0, step: 0 });
    expect(verseLineMarks('  + Stand')).toEqual({ indent: 2, step: 2 });
    expect(verseLineMarks('+Plus')).toEqual({ indent: 0 });
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
