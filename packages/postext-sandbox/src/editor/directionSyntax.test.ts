import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';
import { directionCompletionSource } from './directionSyntax';

const complete = (doc: string) => {
  const state = EditorState.create({ doc });
  const r = directionCompletionSource(new CompletionContext(state, doc.length, false));
  return r ? { from: r.from, labels: r.options.map((o) => o.label) } : null;
};

describe('dir attribute completion', () => {
  it('offers both directions inside a heading or a container opener', () => {
    expect(complete('## مقدمة {d')).toEqual({ from: '## مقدمة {'.length, labels: ['dir=rtl', 'dir=ltr'] });
    expect(complete(':::callout{d')?.labels).toEqual(['dir=rtl', 'dir=ltr']);
    expect(complete(':::callout{type=note di')?.from).toBe(':::callout{type=note '.length);
    expect(complete('::::paragraphs{dir=')?.labels).toEqual(['dir=rtl', 'dir=ltr']);
  });

  it('narrows to the value being typed', () => {
    expect(complete('# Title {dir=r')?.labels).toEqual(['dir=rtl']);
    expect(complete('# Title {dir=lt')?.labels).toEqual(['dir=ltr']);
    expect(complete('# Title {dir=x')).toBeNull();
  });

  it('stays out of paragraphs, closed braces and other attributes', () => {
    expect(complete('A paragraph {d')).toBeNull();
    expect(complete('# Title {id=x} d')).toBeNull();
    expect(complete('# Title {id=d')).toBeNull();
    expect(complete('# Title {#ad')).toBeNull();
  });
});
