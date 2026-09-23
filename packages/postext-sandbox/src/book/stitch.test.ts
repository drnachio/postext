import { describe, expect, it } from 'vitest';
import type { VDTDocument } from 'postext';
import { composeBook } from './compose';
import { composedBookPageMap } from './stitch';

const chapters = [
  { id: 'a', title: 'A', markdown: '# A\n\nOne.', createdAt: 0, updatedAt: 0 },
  { id: 'b', title: 'B', markdown: '# B\n\nTwo.', createdAt: 0, updatedAt: 0 },
  { id: 'c', title: 'C', markdown: '# C\n\nThree.', createdAt: 0, updatedAt: 0 },
];

function docWith(pageBlocks: (number | null)[][]): VDTDocument {
  // pageBlocks[i] lists the source offsets of the blocks on page i (null: a
  // block without a source range).
  const blocks = pageBlocks.flatMap((offsets, pageIndex) =>
    offsets.map((sourceStart, n) => ({ id: `${pageIndex}-${n}`, pageIndex, ...(sourceStart === null ? {} : { sourceStart, sourceEnd: sourceStart + 1 }) })));
  return { pages: pageBlocks.map((_, index) => ({ index })), blocks } as unknown as VDTDocument;
}

describe('composedBookPageMap', () => {
  it('reads each page\'s chapter from its blocks and records first content pages', () => {
    const book = composeBook(chapters);
    const b = book.segments[1]!.start;
    const c = book.segments[2]!.start;
    // page 0: chapter A; page 1: A then B (B opens mid-page); page 2: blank;
    // page 3: C.
    const map = composedBookPageMap(docWith([[0, 4], [6, b + 2], [], [c]]), book);
    expect(map.pageChapters).toEqual([0, 0, 0, 2]);
    expect(map.chapterFirstPages).toEqual([0, -1, 3]);
  });

  it('gives leading blank pages to the first content page\'s chapter', () => {
    const book = composeBook(chapters);
    const b = book.segments[1]!.start;
    const map = composedBookPageMap(docWith([[], [null], [b]]), book);
    expect(map.pageChapters).toEqual([1, 1, 1]);
    expect(map.chapterFirstPages).toEqual([-1, 2, -1]);
  });
});
