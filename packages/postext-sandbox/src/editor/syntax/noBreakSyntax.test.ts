import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { noBreakDecorator, toggleNoBreak } from './noBreakSyntax.js';

describe('toggleNoBreak', () => {
  it('turns the spaces of a selection into no-break spaces, and back', () => {
    const kept = toggleNoBreak('LR+ = 18,29');
    expect(kept).toBe('LR+\u00A0=\u00A018,29');
    expect(toggleNoBreak(kept)).toBe('LR+ = 18,29');
  });

  it('binds a selection that mixes both kinds, and leaves line ends alone', () => {
    expect(toggleNoBreak('a\u00A0b c')).toBe('a\u00A0b\u00A0c');
    expect(toggleNoBreak('a b\nc d')).toBe('a\u00A0b\nc\u00A0d');
    expect(toggleNoBreak('palabra')).toBe('palabra');
  });
});

describe('noBreakDecorator', () => {
  it('marks the three no-break spaces, each with its own name', () => {
    const names = { noBreak: 'nb', narrow: 'nn', figure: 'fs' };
    const doc = 'a\u00A0b\u202Fc\u2007d e';
    // The decorator reads the document, the viewport and the visible ranges.
    const view = { state: EditorState.create({ doc }), visibleRanges: [{ from: 0, to: doc.length }], viewport: { from: 0, to: doc.length } } as unknown as EditorView;
    const marks: [number, string][] = [];
    noBreakDecorator(names).createDeco(view).between(0, doc.length, (from, _to, deco) => {
      marks.push([from, (deco.spec as { attributes: { title: string } }).attributes.title]);
    });
    expect(marks).toEqual([[1, 'nb'], [3, 'nn'], [5, 'fs']]);
  });
});
