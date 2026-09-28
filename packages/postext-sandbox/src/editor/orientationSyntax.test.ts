import { describe, expect, it } from 'vitest';
import { orientationRanges } from './orientationSyntax';

describe('orientation marks highlighting (#190)', () => {
  it('marks the directive and the text of :tcy, :upright and :sideways', () => {
    const text = '第:tcy[12]回，:upright[GDP]與:sideways[3\\]4]，:tcy[] 不算。';
    const pick = (kind: string) => orientationRanges(text).filter((r) => r.kind === kind).map((r) => text.slice(r.from, r.to));
    expect(pick('text')).toEqual(['12', 'GDP', '3\\]4']);
    expect(pick('delim')).toEqual([':tcy[', ']', ':upright[', ']', ':sideways[', ']']);
  });
});
