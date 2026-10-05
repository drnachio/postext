import { describe, expect, it } from 'vitest';
import { annotationRanges } from './annotationSyntax';

describe('annotation highlighting', () => {
  it('marks the brackets, the attributes and the text of each annotation', () => {
    const line = '撰此:book[石頭記]，:ruby[紅樓]{rt="hóng lóu"}夢';
    const ranges = annotationRanges(line).map((r) => [r.kind, line.slice(r.from, r.to)]);
    expect(ranges).toEqual([
      ['delim', ':book['],
      ['book', '石頭記'],
      ['delim', ']'],
      ['delim', ':ruby['],
      ['ruby', '紅樓'],
      ['delim', ']{rt="hóng lóu"}'],
    ]);
  });

  it('reads the compact ruby and nested marks, and leaves Latin braces alone', () => {
    const line = '{紅樓|hóng|lóu}與:warichu[:name[寶玉]也] {x|x>0}';
    const kinds = annotationRanges(line).map((r) => [r.kind, line.slice(r.from, r.to)]);
    expect(kinds).toContainEqual(['ruby', '紅樓']);
    expect(kinds).toContainEqual(['delim', '|hóng|lóu}']);
    expect(kinds).toContainEqual(['name', '寶玉']);
    expect(kinds).toContainEqual(['warichu', '也']);
    expect(kinds.some(([, t]) => t.includes('x>0'))).toBe(false);
  });

  it('marks a side line and its attributes', () => {
    const line = '漱石の:sideline[こころ]{style="wavy" pos="over"}を';
    expect(annotationRanges(line).map((r) => [r.kind, line.slice(r.from, r.to)])).toEqual([
      ['delim', ':sideline['],
      ['sideline', 'こころ'],
      ['delim', ']{style="wavy" pos="over"}'],
    ]);
  });
});
