import { describe, expect, it } from 'vitest';
import { orientationRanges } from './orientationSyntax';

describe('orientation marks highlighting (#190)', () => {
  it('marks the directive and the text of :tcy, :upright and :sideways', () => {
    const text = '第:tcy[12]回，:upright[GDP]與:sideways[3\\]4]，:tcy[] 不算。';
    const pick = (kind: string) => orientationRanges(text).filter((r) => r.kind === kind).map((r) => text.slice(r.from, r.to));
    expect(pick('text')).toEqual(['12', 'GDP', '3\\]4']);
    expect(pick('delim')).toEqual([':tcy[', ']', ':upright[', ']', ':sideways[', ']']);
  });

  it('marks a mark inside another one and a link inside a mark', () => {
    const text = ':tcy[:upright[AB]]，:sideways[[iPhone](https://a.b)]';
    const ranges = orientationRanges(text);
    expect(ranges.map((r) => [r.kind, text.slice(r.from, r.to)])).toEqual([
      ['delim', ':tcy['], ['delim', ':upright['], ['text', 'AB'], ['delim', ']'], ['delim', ']'],
      ['delim', ':sideways['], ['text', '[iPhone](https://a.b)'], ['delim', ']'],
    ]);
    // In order and apart, as the decoration builder wants them.
    for (let i = 1; i < ranges.length; i++) expect(ranges[i]!.from).toBeGreaterThanOrEqual(ranges[i - 1]!.to);
  });
});
