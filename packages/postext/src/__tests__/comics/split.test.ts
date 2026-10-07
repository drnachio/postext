import { describe, it, expect } from 'vitest';
import {
  comicSplitLeaves,
  comicSplitLines,
  comicSplitListAt,
  mergeComicCells,
  moveComicSplitLine,
  parseComicSplit,
  serializeComicSplit,
  splitComicCell,
} from '../../comics/split';

describe('parseComicSplit', () => {
  it("reads the owner's example: a top tier of three, a bottom tier", () => {
    const src = '30 [30 | 20 | *] / *';
    const { tree, tokens, issues } = parseComicSplit(src);
    expect(issues).toEqual([]);
    expect(tree.axis).toBe('rows');
    expect(tree.items).toHaveLength(2);
    expect(tree.items[0]!.children!.axis).toBe('columns');
    expect(comicSplitLines(tree)).toEqual({ start: [30], end: [30] });
    expect(comicSplitLines(tree.items[0]!.children!)).toEqual({ start: [30, 50], end: [30, 50] });
    expect(comicSplitLeaves(tree)).toEqual([[0, 0], [0, 1], [0, 2], [1]]);
    // Every size with its source range, in source order.
    expect(tokens.map((t) => [t.path, t.index, src.slice(t.size.sourceStart, t.size.sourceEnd)])).toEqual([
      [[], 0, '30'],
      [[0], 0, '30'],
      [[0], 1, '20'],
      [[0], 2, '*'],
      [[], 1, '*'],
    ]);
  });

  it('reads a splash, tiers, and stars sharing what is left', () => {
    expect(comicSplitLeaves(parseComicSplit('*').tree)).toEqual([[0]]);
    expect(comicSplitLeaves(parseComicSplit('').tree)).toEqual([[0]]);
    expect(comicSplitLines(parseComicSplit('33/33/*').tree).start).toEqual([33, 66]);
    expect(comicSplitLines(parseComicSplit('20 / * / *').tree).start).toEqual([20, 60]);
    const nested = parseComicSplit('50 [*|*] / 50 [*|*|*]').tree;
    expect(comicSplitLeaves(nested)).toHaveLength(5);
    expect(comicSplitLines(nested.items[1]!.children!).start.map((v) => Math.round(v * 10) / 10)).toEqual([33.3, 66.7]);
  });

  it('reads slanted sizes, each end on its own', () => {
    const { tree, issues } = parseComicSplit('* [40~55 | *] / 35');
    expect(issues).toEqual([]);
    expect(comicSplitLines(tree)).toEqual({ start: [65], end: [65] });
    expect(comicSplitLines(tree.items[0]!.children!)).toEqual({ start: [40], end: [55] });
    expect(tree.items[0]!.children!.items[0]!.size).toMatchObject({ start: 40, end: 55 });
  });

  it('reads a column list on top, the right column split in two', () => {
    const { tree } = parseComicSplit('60 | * [50 / *]');
    expect(tree.axis).toBe('columns');
    expect(tree.items[1]!.children!.axis).toBe('rows');
    expect(comicSplitLeaves(tree)).toEqual([[0], [1, 0], [1, 1]]);
  });

  it('keeps percent signs and the last cell runs to 100', () => {
    const { tree } = parseComicSplit('30% / 40%');
    expect(comicSplitLines(tree).start).toEqual([30]);
    expect(serializeComicSplit(tree)).toBe('30% / 40%');
  });

  it('reports mixed separators, stray characters, unclosed brackets and overflow', () => {
    expect(parseComicSplit('30 / 40 | 2').issues.map((i) => i.kind)).toEqual(['syntax']);
    expect(parseComicSplit('30 [a] / *').issues[0]!.message).toContain('"a"');
    expect(parseComicSplit('30 [10 | 20 / *').issues.some((i) => i.message.includes('never closed'))).toBe(true);
    expect(parseComicSplit('30 [10 / 20] / *').issues[0]!.message).toContain('other axis');
    const over = parseComicSplit('80/80');
    expect(over.issues).toMatchObject([{ kind: 'overflow', total: 160 }]);
    // Scaled down to fit.
    expect(comicSplitLines(over.tree).start).toEqual([50]);
    // A star keeps 5 %.
    expect(comicSplitLines(parseComicSplit('80 / 80 / *').tree).start).toEqual([47.5, 95]);
  });

  it('serialises a parsed tree back', () => {
    for (const src of ['30 [30 | 20 | *] / *', '* [40~55 | *] / 35', '60 | * [50 / *]', '*', '33 / 33 / *']) {
      expect(serializeComicSplit(parseComicSplit(src).tree)).toBe(src);
    }
    expect(serializeComicSplit(parseComicSplit('30[30|20|*]/*').tree)).toBe('30 [30 | 20 | *] / *');
    expect(serializeComicSplit(parseComicSplit('33.333/*').tree)).toBe('33.3 / *');
  });
});

describe('moveComicSplitLine', () => {
  const src = '30 [30 | 20 | *] / *';

  it('rewrites the sizes next to the line, in place, keeping stars', () => {
    expect(moveComicSplitLine(src, [], 0, 42)).toBe('42 [30 | 20 | *] / *');
    expect(moveComicSplitLine(src, [0], 0, 40)).toBe('30 [40 | 10 | *] / *');
    expect(moveComicSplitLine(src, [0], 1, 70)).toBe('30 [30 | 40 | *] / *');
    // Formatting outside the edited sizes is kept.
    expect(moveComicSplitLine('30[30|20|*]/*', [0], 0, 25.25)).toBe('30[25.3|24.7|*]/*');
  });

  it('moves a slanted line by its start, the slant kept, or one end alone', () => {
    expect(moveComicSplitLine('* [40~55 | *] / 35', [0], 0, 50)).toBe('* [50~65 | *] / 35');
    expect(moveComicSplitLine(src, [0], 1, 70, 60)).toBe('30 [30 | 40~30 | *] / *');
    const lines = comicSplitLines(comicSplitListAt(parseComicSplit(moveComicSplitLine(src, [0], 1, 70, 60)).tree, [0])!);
    expect(lines).toEqual({ start: [30, 70], end: [30, 60] });
  });

  it('keeps every cell at least 5 % and ignores a line that does not exist', () => {
    expect(moveComicSplitLine(src, [], 0, 99)).toBe('95 [30 | 20 | *] / *');
    expect(moveComicSplitLine(src, [0], 0, 0)).toBe('30 [5 | 45 | *] / *');
    expect(moveComicSplitLine(src, [], 3, 50)).toBe(src);
    expect(moveComicSplitLine(src, [7], 0, 50)).toBe(src);
  });

  it('writes stars out only when they would move', () => {
    // Two stars sharing a tier: the first becomes a number, the second stays.
    expect(moveComicSplitLine('* | *', [], 0, 30)).toBe('30 | *');
    // A line between fixed sizes leaves the star elsewhere untouched.
    expect(moveComicSplitLine('20 | 20 | *', [], 0, 30)).toBe('30 | 10 | *');
  });
});

describe('splitComicCell and mergeComicCells', () => {
  const src = '30 [30 | 20 | *] / *';

  it('splits a cell along its own list or across it', () => {
    expect(splitComicCell(src, [1], 'rows')).toBe('30 [30 | 20 | *] / 35 / *');
    expect(splitComicCell(src, [1], 'columns')).toBe('30 [30 | 20 | *] / * [* | *]');
    expect(splitComicCell(src, [0, 1], 'columns')).toBe('30 [30 | 10 | 10 | *] / *');
    expect(splitComicCell(src, [0, 0], 'rows')).toBe('30 [30 [* / *] | 20 | *] / *');
    expect(splitComicCell('*', [0], 'rows')).toBe('50 / *');
  });

  it('merges two cells, keeping the lines around them', () => {
    expect(mergeComicCells(src, [0], 0)).toBe('30 [50 | *] / *');
    expect(mergeComicCells(src, [0], 1)).toBe('30 [30 | *] / *');
    expect(mergeComicCells(src, [], 0)).toBe('* [30 | 20 | *]');
    // A bracketed list left with one cell loses its brackets.
    expect(mergeComicCells('30 [* | *] / *', [0], 0)).toBe('30 / *');
  });

  it('round-trips: a split then a merge gives the lines back', () => {
    const split = splitComicCell(src, [0, 2], 'columns');
    const merged = mergeComicCells(split, [0], 2);
    expect(comicSplitLines(comicSplitListAt(parseComicSplit(merged).tree, [0])!)).toEqual(
      comicSplitLines(comicSplitListAt(parseComicSplit(src).tree, [0])!),
    );
  });
});
