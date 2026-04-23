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

  it('blankForForce pages stay with the previous chapter and stop the walk', () => {
    // Scenario: chapter 1 ends on page 1 (odd). Chapter 2 uses
    // `always-odd`, so the placement inserts a mandatory blank separator
    // on page 2 (blankForForce — belongs to chapter 1), then parity
    // padding on page 3 (blankForParity — belongs to chapter 2), then
    // the H1 lands on page 4... but page 4 is even. Let's re-shift:
    // end on page 0 odd → force blank page 1 (Ch1) → parity blank page 2
    // (Ch2, because page 2 is even and we want odd) → H1 page 3 odd.
    // Wait, that's still not quite right — after force blank on page 1
    // (even), we need to reach odd. Page 2 is odd naturally, so we land
    // there; page 2 becomes H1 directly. That skips the parity blank.
    // Let's use a scenario that actually exercises both flags:
    //   Ch1 H1 on page 0, content ends at page 1.
    //   Ch2 `always-odd`: force blank at page 2 (Ch1), then page 3 is
    //   odd so H1 lands at page 3.
    const blocks = [h1(0, 'Chapter 1'), h1(3, 'Chapter 2')];
    const pages = [
      { blankForParity: false, blankForForce: false },
      { blankForParity: false, blankForForce: false },
      { blankForParity: false, blankForForce: true }, // mandatory separator — Ch1.
      { blankForParity: false, blankForForce: false },
    ];
    expect(computeChapterTitles(blocks, 4, pages)).toEqual([
      'Chapter 1',
      'Chapter 1',
      'Chapter 1', // force-blank stays with Ch1.
      'Chapter 2',
    ]);
  });

  it('blankForForce followed by blankForParity: force stays with prev, parity goes with next', () => {
    // Ch2 `always-odd`, previous ends on odd page 0:
    //   page 1 = blankForForce (Ch1 separator)
    //   page 2 = blankForParity (Ch2 — page 2 is even, parity needs odd)
    //   page 3 = H1 Ch2 (odd ✓)
    const blocks = [h1(0, 'Chapter 1'), h1(3, 'Chapter 2')];
    const pages = [
      { blankForParity: false, blankForForce: false },
      { blankForParity: false, blankForForce: true },
      { blankForParity: true, blankForForce: false },
      { blankForParity: false, blankForForce: false },
    ];
    expect(computeChapterTitles(blocks, 4, pages)).toEqual([
      'Chapter 1',
      'Chapter 1', // force-blank — prev.
      'Chapter 2', // parity-blank — next.
      'Chapter 2',
    ]);
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
