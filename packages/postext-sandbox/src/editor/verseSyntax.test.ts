import { describe, expect, it } from 'vitest';
import { verseLineKinds, verseSeparator } from './verseSyntax';

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
