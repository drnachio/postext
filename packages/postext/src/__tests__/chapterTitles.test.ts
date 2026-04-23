import { describe, it, expect } from 'vitest';
import { computeChapterTitles } from '../pipeline/placeholders';
import type { VDTBlock } from '../vdt';

function h1(pageIndex: number, text: string): VDTBlock {
  return {
    id: `h1-${pageIndex}`,
    type: 'heading',
    bbox: { x: 0, y: 0, width: 0, height: 0 },
    lines: [
      {
        text,
        bbox: { x: 0, y: 0, width: 0, height: 0 },
        baseline: 0,
        hyphenated: false,
      },
    ],
    pageIndex,
    columnIndex: 0,
    dirty: false,
    snappedToGrid: false,
    fontString: '',
    color: '',
    textAlign: 'left',
    headingLevel: 1,
  };
}

describe('computeChapterTitles', () => {
  it('assigns the most recent H1 title to each page', () => {
    const blocks = [h1(0, 'Chapter 1'), h1(3, 'Chapter 2')];
    expect(computeChapterTitles(blocks, 5)).toEqual([
      'Chapter 1',
      'Chapter 1',
      'Chapter 1',
      'Chapter 2',
      'Chapter 2',
    ]);
  });

  it('leaves blank parity page before a new chapter with the previous title when `pages` is not provided', () => {
    // Chapter 2 forced onto an odd page; blank even padding on page 2.
    const blocks = [h1(0, 'Chapter 1'), h1(3, 'Chapter 2')];
    // Without pages, legacy behavior: blank page 2 gets Chapter 1.
    expect(computeChapterTitles(blocks, 4)).toEqual([
      'Chapter 1',
      'Chapter 1',
      'Chapter 1',
      'Chapter 2',
    ]);
  });

  it('attributes a blank parity page preceding a new chapter to the upcoming title', () => {
    const blocks = [h1(0, 'Chapter 1'), h1(3, 'Chapter 2')];
    const pages = [
      { blankForParity: false },
      { blankForParity: false },
      { blankForParity: true }, // padding inserted to push Chapter 2 onto page 3 (odd).
      { blankForParity: false },
    ];
    expect(computeChapterTitles(blocks, 4, pages)).toEqual([
      'Chapter 1',
      'Chapter 1',
      'Chapter 2', // <-- now belongs to the upcoming chapter
      'Chapter 2',
    ]);
  });

  it('walks back over multiple blank parity pages', () => {
    const blocks = [h1(0, 'Chapter 1'), h1(4, 'Chapter 2')];
    const pages = [
      { blankForParity: false },
      { blankForParity: false },
      { blankForParity: true },
      { blankForParity: true },
      { blankForParity: false },
    ];
    const out = computeChapterTitles(blocks, 5, pages);
    expect(out[2]).toBe('Chapter 2');
    expect(out[3]).toBe('Chapter 2');
    expect(out[4]).toBe('Chapter 2');
  });

  it('does not overwrite non-blank pages that carry the previous chapter', () => {
    const blocks = [h1(0, 'Chapter 1'), h1(3, 'Chapter 2')];
    const pages = [
      { blankForParity: false },
      { blankForParity: false },
      { blankForParity: false }, // real content from chapter 1
      { blankForParity: false },
    ];
    expect(computeChapterTitles(blocks, 4, pages)).toEqual([
      'Chapter 1',
      'Chapter 1',
      'Chapter 1', // stays with chapter 1 — it's real content, not padding.
      'Chapter 2',
    ]);
  });
});
