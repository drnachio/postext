// #1644: the places in the source an edit moves, source maps walked by
// index.

import { describe, expect, it } from 'vitest';
import { moveSourcePlaces } from '../../pipeline/build/passMade.js';

describe('moveSourcePlaces', () => {
  it('moves the places at or after the edit, and only those', () => {
    const line = { sourceStart: 10, sourceEnd: 30, sourceMap: [8, 9, 10, 11, 29, 30], width: 40, words: [{ text: 'x', x: 12 }] };
    moveSourcePlaces({ lines: [line] }, 10, 3, new Set());
    expect(line).toEqual({ sourceStart: 13, sourceEnd: 33, sourceMap: [8, 9, 13, 14, 32, 33], width: 40, words: [{ text: 'x', x: 12 }] });
  });

  it('moves a source map two blocks share once', () => {
    const sourceMap = [5, 20, 40];
    const blocks = [{ sourceStart: 5, sourceMap }, { sourceStart: 20, sourceMap }];
    moveSourcePlaces(blocks, 0, 2, new Set());
    expect(sourceMap).toEqual([7, 22, 42]);
    expect(blocks.map((b) => b.sourceStart)).toEqual([7, 22]);
  });

  it('moves the starts and ends of the attributes, and lists of them', () => {
    const block = { attrSources: { alt: { start: 4, end: 9 }, title: { start: 12, end: 18 } }, sourceMap: [[3, 4], [11, 12]] };
    moveSourcePlaces(block, 10, -1, new Set());
    expect(block).toEqual({ attrSources: { alt: { start: 4, end: 9 }, title: { start: 11, end: 17 } }, sourceMap: [[3, 4], [10, 11]] });
  });
});
