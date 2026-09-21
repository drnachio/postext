import { describe, it, expect } from 'vitest';
import { pickPageGeometry } from './pageGeometry';

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
