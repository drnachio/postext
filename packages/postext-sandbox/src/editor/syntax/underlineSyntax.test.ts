import { describe, expect, it } from 'vitest';
import { underlineRanges } from './underlineSyntax.js';

describe('underline highlighting', () => {
  it('marks the markers and the text of each underlined run', () => {
    const text = 'Please ++sign all pages++ and ++return++ them.';
    const pick = (kind: string) => underlineRanges(text).filter((r) => r.kind === kind).map((r) => text.slice(r.from, r.to));
    expect(pick('text')).toEqual(['sign all pages', 'return']);
    expect(pick('delim')).toEqual(['++', '++', '++', '++']);
  });

  it('leaves what the engine reads as plain text alone', () => {
    for (const t of ['use ++i rather than i++ here', 'C++ and g++', 'Notepad++', 'a ++ b', '\\++not++']) {
      expect(underlineRanges(t)).toEqual([]);
    }
  });
});
