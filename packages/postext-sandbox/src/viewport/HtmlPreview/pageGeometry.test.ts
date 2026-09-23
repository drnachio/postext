import { describe, it, expect } from 'vitest';
import type { VDTDocument } from 'postext';
import { fitPagesToContent, pickPageGeometry, singleScrollPageWidthPx } from './pageGeometry';

const base = { columnGapPx: 50, gutterPx: 20, targetColumnPx: 400, sideFraction: 0.3 };

describe('pickPageGeometry', () => {
  it('shows two columns of a double layout when two fit the measure', () => {
    // 2 × 400 + 20 = 820 → exactly one page.
    const g = pickPageGeometry({ ...base, layoutType: 'double', innerViewportW: 820 });
    expect(g).toEqual({ pageWidthPx: 820, visibleColumns: 2 });
  });

  it('shows three columns of a double layout instead of stretching two or squeezing four', () => {
    // Three columns at target: 3 × 400 + 20 + 50 = 1270.
    const g = pickPageGeometry({ ...base, layoutType: 'double', innerViewportW: 1270 });
    expect(g.visibleColumns).toBe(3);
    // One full page (two columns + gutter): the third column is the first
    // column of the next page, half in view.
    expect(g.pageWidthPx).toBe(820);
  });

  it('picks the nearest column count around the midpoint', () => {
    // Between 2 (820) and 3 (1270): just under the proportional midpoint
    // still stretches two, just over squeezes three.
    const two = pickPageGeometry({ ...base, layoutType: 'double', innerViewportW: 1000 });
    const three = pickPageGeometry({ ...base, layoutType: 'double', innerViewportW: 1100 });
    expect(two.visibleColumns).toBe(2);
    expect(three.visibleColumns).toBe(3);
  });

  it('shows four columns as two full pages', () => {
    // 4 × 400 + 2 × 20 + 50 = 1690.
    const g = pickPageGeometry({ ...base, layoutType: 'double', innerViewportW: 1690 });
    expect(g).toEqual({ pageWidthPx: 820, visibleColumns: 4 });
  });

  it('falls back to half a page on a narrow viewer', () => {
    const g = pickPageGeometry({ ...base, layoutType: 'double', innerViewportW: 420 });
    expect(g.visibleColumns).toBe(1);
    expect(g.pageWidthPx).toBe(420 * 2 + 20);
  });

  it('counts whole pages for single and one-and-a-half layouts', () => {
    // Three single pages at target: 3 × 400 + 2 × 50 = 1300.
    const single = pickPageGeometry({ ...base, layoutType: 'single', innerViewportW: 1300 });
    expect(single).toEqual({ pageWidthPx: 400, visibleColumns: 3 });
    // One-and-a-half page at target: (400 + 20) / 0.7 = 600.
    const oneAndHalf = pickPageGeometry({ ...base, layoutType: 'oneAndHalf', innerViewportW: 1250 });
    expect(oneAndHalf).toEqual({ pageWidthPx: 600, visibleColumns: 2 });
  });

  it('never returns a page narrower than 80px', () => {
    const g = pickPageGeometry({ ...base, layoutType: 'single', innerViewportW: 30 });
    expect(g).toEqual({ pageWidthPx: 80, visibleColumns: 1 });
  });
});

describe('singleScrollPageWidthPx', () => {
  it('gives a flat document the measure itself', () => {
    expect(singleScrollPageWidthPx({ ...base, layoutType: 'single', innerViewportW: 1300 })).toBe(400);
  });

  it('widens a one-and-a-half book so its main column reads at the measure', () => {
    // (400 + 20) / 0.7 = 600: main column 400, side column beside it.
    expect(singleScrollPageWidthPx({ ...base, layoutType: 'oneAndHalf', innerViewportW: 1300 })).toBe(600);
  });

  it('never exceeds the viewer, nor drops under 80px', () => {
    expect(singleScrollPageWidthPx({ ...base, layoutType: 'oneAndHalf', innerViewportW: 500 })).toBe(500);
    expect(singleScrollPageWidthPx({ ...base, layoutType: 'single', innerViewportW: 30 })).toBe(80);
  });
});

const box = (y: number, height: number) => ({ x: 0, y, width: 100, height });

describe('fitPagesToContent', () => {
  it('shrinks every page to what it holds, floats and bands included', () => {
    const doc = {
      pages: [
        {
          height: 200_000,
          columns: [{ blocks: [{ bbox: box(0, 40) }, { bbox: box(40, 60) }] }],
          openerBand: { blocks: [{ bbox: box(0, 30) }] },
        },
        {
          height: 200_000,
          columns: [{ blocks: [{ bbox: box(0, 20), hidden: true }] }],
          floats: [{ bbox: box(10, 300) }],
        },
      ],
    } as unknown as VDTDocument;
    fitPagesToContent(doc, 24);
    expect(doc.pages[0]!.height).toBe(124);
    // The hidden block (a heading its band draws) never holds a page open.
    expect(doc.pages[1]!.height).toBe(334);
  });

  it('brings a float parked past the end of the text back under it', () => {
    const doc = {
      pages: [{
        height: 200_000,
        columns: [{ blocks: [{ bbox: box(0, 400), lines: [] }] }],
        floats: [
          { bbox: box(199_000, 300), lines: [], resourceBlock: { captionLines: [{ bbox: box(199_280, 20), baseline: 199_295 }], noteLines: [], continuesLines: [] } },
          { bbox: box(199_400, 100), lines: [{ bbox: box(199_400, 20), baseline: 199_415 }] },
        ],
      }],
    } as unknown as VDTDocument;
    fitPagesToContent(doc, 24);
    const [figure, note] = doc.pages[0]!.floats!;
    // The pair keeps its arrangement: the first lands a gap under the text.
    expect(figure!.bbox.y).toBe(424);
    expect(note!.bbox.y).toBe(824);
    expect(figure!.resourceBlock!.captionLines[0]!.bbox.y).toBe(704);
    expect(figure!.resourceBlock!.captionLines[0]!.baseline).toBe(719);
    expect(note!.lines[0]!.baseline).toBe(839);
    expect(doc.pages[0]!.height).toBe(948);
  });

  it('leaves a float that sits within the text where it is', () => {
    const doc = {
      pages: [{
        height: 200_000,
        columns: [{ blocks: [{ bbox: box(0, 400), lines: [] }] }],
        floats: [{ bbox: box(100, 80), lines: [] }],
      }],
    } as unknown as VDTDocument;
    fitPagesToContent(doc, 24);
    expect(doc.pages[0]!.floats![0]!.bbox.y).toBe(100);
    expect(doc.pages[0]!.height).toBe(424);
  });

  it('counts a block\u2019s design overlay, which may hang past its box', () => {
    const doc = {
      pages: [{
        height: 200_000,
        columns: [{ blocks: [{ bbox: box(0, 40), designOverlay: { blocks: [{ bbox: box(20, 90) }] } }] }],
      }],
    } as unknown as VDTDocument;
    fitPagesToContent(doc, 0);
    expect(doc.pages[0]!.height).toBe(110);
  });
});
