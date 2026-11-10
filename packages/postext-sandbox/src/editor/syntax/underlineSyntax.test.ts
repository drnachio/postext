import { describe, expect, it } from 'vitest';
import { underlineRanges } from './underlineSyntax.js';

describe('underline highlighting', () => {
  const pick = (text: string, kind: string, plus = false) => underlineRanges(text, plus).filter((r) => r.kind === kind).map((r) => text.slice(r.from, r.to));

  it('marks the directive and its text, always', () => {
    const text = 'Please :underline[sign **all** pages] and :underline[[return](https://example.org)] them.';
    expect(pick(text, 'text')).toEqual(['sign **all** pages', '[return](https://example.org)']);
    expect(pick(text, 'delim')).toEqual([':underline[', ']', ':underline[', ']']);
  });

  it('marks ++…++ only when the document reads it', () => {
    const text = 'Please ++sign all pages++ and :underline[return] them.';
    expect(pick(text, 'text')).toEqual(['return']);
    expect(pick(text, 'text', true)).toEqual(['sign all pages', 'return']);
    expect(pick(text, 'delim', true)).toEqual(['++', '++', ':underline[', ']']);
  });

  it('marks every pair when on, the increment operator too, but not what the engine keeps literal', () => {
    expect(pick('use ++i rather than i++ here', 'text', true)).toEqual(['i rather than i']);
    for (const t of ['C++ and g++', 'Notepad++', 'a ++ b', '\\++not++', '\\+\\+not\\+\\+']) {
      expect(underlineRanges(t, true)).toEqual([]);
    }
  });
});
