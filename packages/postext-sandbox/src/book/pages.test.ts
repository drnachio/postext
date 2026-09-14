import { describe, expect, it } from 'vitest';
import type { VDTDocument } from 'postext';
import { computeBookPages } from './pages';
import { composeBook } from './compose';
import { newChapter } from './chapterOps';

function doc(blocks: Array<{ sourceStart: number; pageIndex: number }>, pageCount: number): VDTDocument {
  return {
    blocks: blocks as unknown as VDTDocument['blocks'],
    pages: Array.from({ length: pageCount }, (_, i) => ({ index: i, pageNumberValue: i + 1 })) as unknown as VDTDocument['pages'],
  } as VDTDocument;
}

describe('computeBookPages', () => {
  const chapters = [newChapter('a', 'A', '# A\n\nfirst', 1), newChapter('b', 'B', '# B\n\nsecond', 1), newChapter('c', 'C', '', 1)];
  const book = composeBook(chapters);
  const bStart = book.segments[1]!.start;

  it('maps each chapter to its first page and page count', () => {
    const d = doc([{ sourceStart: 0, pageIndex: 0 }, { sourceStart: 5, pageIndex: 1 }, { sourceStart: bStart, pageIndex: 3 }, { sourceStart: bStart + 5, pageIndex: 4 }], 5);
    const pages = computeBookPages(d, book);
    expect(pages.a).toEqual({ pageIndex: 0, pageNumberValue: 1, pageCount: 2 });
    // page 2 is blank (parity) and precedes chapter b's heading → belongs to b
    expect(pages.b).toEqual({ pageIndex: 2, pageNumberValue: 3, pageCount: 3 });
    expect(pages.c).toEqual({ pageIndex: 4, pageNumberValue: 5, pageCount: 0 });
  });
  it('returns nothing for an empty layout', () => {
    expect(computeBookPages(doc([], 0), book)).toEqual({});
  });
});
