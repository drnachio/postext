import { describe, it, expect } from 'vitest';
import { parseMarkdown } from '../../parse';
import { indentColumn, listDepth, nestListItem, MAX_LIST_DEPTH } from '../../parse/listNesting';

// #465: a list item's depth follows the item it is indented past (the
// content column of the enclosing item, as CommonMark nests lists), not a
// count of two spaces per level.

/** Depth of every list item, in order. */
const depths = (markdown: string): number[] =>
  parseMarkdown(markdown).filter((b) => b.type === 'listItem').map((b) => b.depth!);

/** The depth formula used up to postext 1.15. */
const oldDepth = (line: string): number => Math.max(1, Math.min(5, Math.floor(line.match(/^\s*/)![0].length / 2) + 1));

describe('indentColumn', () => {
  it('counts spaces one column each and advances tabs to the next multiple of four', () => {
    expect(indentColumn('')).toBe(0);
    expect(indentColumn('   ')).toBe(3);
    expect(indentColumn('\t')).toBe(4);
    expect(indentColumn('  \t')).toBe(4);
    expect(indentColumn('\t\t')).toBe(8);
    expect(indentColumn('\t  ')).toBe(6);
  });
});

describe('nestListItem', () => {
  it('nests an item two or more columns past the open one and closes those it is not past', () => {
    let open = nestListItem([], 0);
    expect(open).toEqual([0]);
    open = nestListItem(open, 3);
    expect(open).toEqual([0, 3]);
    open = nestListItem(open, 6);
    expect(open).toEqual([0, 3, 6]);
    // Back to the second level: closes the third and the second, opens a
    // sibling of the second.
    open = nestListItem(open, 3);
    expect(open).toEqual([0, 3]);
    // One column past the outer marker is no nesting.
    expect(nestListItem([0], 1)).toEqual([1]);
  });

  it('caps the depth at the fifth level but keeps the stack', () => {
    let open: number[] = [];
    for (let col = 0; col <= 12; col += 2) open = nestListItem(open, col);
    expect(open).toHaveLength(7);
    expect(listDepth(open)).toBe(MAX_LIST_DEPTH);
    open = nestListItem(open, 2);
    expect(listDepth(open)).toBe(2);
  });
});

describe('list depth in the block parser (#465)', () => {
  it('puts a third-level item at the content column of a `1.` item at depth 3', () => {
    const md = [
      '1. 第一章のまとめ A',
      '   1. ひらがなとカタカナ B',
      '      1. 漢字の読み方 C',
      '      2. 送り仮名 D',
      '   2. 句読点 E',
      '2. 第二章 F',
    ].join('\n');
    expect(depths(md)).toEqual([1, 2, 3, 3, 2, 1]);
  });

  it('nests unordered and task items at the content column of a `1.` item', () => {
    const md = [
      '1. 準備 A',
      '   - 材料 B',
      '     - [ ] 米 C',
      '     - [x] 水 D',
      '   - 道具 E',
    ].join('\n');
    expect(depths(md)).toEqual([1, 2, 3, 3, 2]);
  });

  it('nests under a multi-digit marker at its content column', () => {
    const md = [
      '9. 九 A',
      '10. 十 B',
      '    1. 十の一 C',
      '       - 点 D',
      '11. 十一 E',
    ].join('\n');
    expect(depths(md)).toEqual([1, 1, 2, 3, 1]);
  });

  it('keeps right-aligned numbers (` 9.` over `10.`) at one level', () => {
    const md = [' 8. 八 A', ' 9. 九 B', '10. 十 C', '11. 十一 D'].join('\n');
    expect(depths(md)).toEqual([1, 1, 1, 1]);
  });

  it('nests four-space indents one level at a time', () => {
    const md = ['- 一 A', '    - 二 B', '        - 三 C', '    - 二 D', '- 一 E'].join('\n');
    expect(depths(md)).toEqual([1, 2, 3, 2, 1]);
    const ordered = ['1. 一 A', '    1. 二 B', '        1. 三 C'].join('\n');
    expect(depths(ordered)).toEqual([1, 2, 3]);
  });

  it('still nests an item indented two spaces under `1.` (wider than CommonMark allows)', () => {
    const md = ['1. 問題 A', '  - ヒント B', '  - 答え C', '2. 問題 D', '  1. 小問 E', '    1. 枝問 F'].join('\n');
    expect(depths(md)).toEqual([1, 2, 2, 1, 2, 3]);
  });

  it('nests tab-indented items (a tab reaches column four)', () => {
    const md = ['- 一 A', '\t- 二 B', '\t\t- 三 C', '\t- 二 D'].join('\n');
    expect(depths(md)).toEqual([1, 2, 3, 2]);
  });

  it('treats a one-space indent as no nesting, and a dedent between two levels as the shallower one', () => {
    expect(depths(['- 一 A', ' - 一 B'].join('\n'))).toEqual([1, 1]);
    // `c` at column 3 is past `a` (0) but not past `b` (4): `b`'s sibling.
    expect(depths(['- 一 A', '    - 二 B', '   - 二 C'].join('\n'))).toEqual([1, 2, 2]);
    // `d` at column 1 is past none of them.
    expect(depths(['- 一 A', '  - 二 B', '    - 三 C', ' - 一 D'].join('\n'))).toEqual([1, 2, 3, 1]);
  });

  it('opens a list at depth 1 wherever its first item is indented', () => {
    const md = ['本文の段落です。', '', '   1. 一 A', '      1. 二 B'].join('\n');
    expect(depths(md)).toEqual([1, 2]);
  });

  it('carries the nesting across blank lines, and restarts it after any other block', () => {
    const md = ['- 一 A', '', '', '  - 二 B', '', '段落。', '', '  - 一 C'].join('\n');
    expect(depths(md)).toEqual([1, 2, 1]);
    const fenced = ['- 一 A', ':::callout', '  - 一 B', ':::'].join('\n');
    expect(depths(fenced)).toEqual([1, 1]);
  });

  it('caps a sixth level at depth 5 and finds the right level after it', () => {
    const md = [0, 2, 4, 6, 8, 10, 4].map((n, k) => `${' '.repeat(n)}- 項目 ${k}`).join('\n');
    expect(depths(md)).toEqual([1, 2, 3, 4, 5, 5, 3]);
  });

  it('nests Arabic-Indic numbered items at their content column', () => {
    const md = ['١. أولا A', '   ١. ثانيا B', '      ١. ثالثا C'].join('\n');
    expect(depths(md)).toEqual([1, 2, 3]);
  });

  it('gives the depth the old formula gave for two-space steps', () => {
    // Every list whose levels change one at a time, in two-space steps,
    // with bullets, numbers and tasks mixed: the layout of books written
    // that way does not move.
    const markers = ['- ', '* ', '1. ', '10. ', '- [ ] '];
    let seed = 7;
    const rand = (n: number): number => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    for (let run = 0; run < 200; run++) {
      const lines: string[] = [];
      let level = 0;
      for (let k = 0; k < 12; k++) {
        level = k === 0 ? 0 : Math.max(0, Math.min(6, level + rand(3) - 1 - (rand(4) === 0 ? rand(level + 1) : 0)));
        lines.push(`${'  '.repeat(level)}${markers[rand(markers.length)]}項目 ${k}`);
      }
      expect(depths(lines.join('\n'))).toEqual(lines.map(oldDepth));
    }
  });
});
