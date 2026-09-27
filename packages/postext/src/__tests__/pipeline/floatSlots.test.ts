import { describe, it, expect } from 'vitest';
import { createVDTPage, createVDTColumn, createBoundingBox, type VDTBlock, type VDTColumn, type VDTPage } from '../../vdt';
import {
  enumerateCurrentPageSlots,
  measureFloatBand,
  measureSideStack,
  clearSideObstacles,
  columnHasFloatBand,
  fitsStrict,
  type ColumnCapKind,
} from '../../pipeline/floatSlots';
import type { PlannedFloat } from '../../pipeline/floatPlacement';

const GRID = 12;
const CONTENT = createBoundingBox(20, 20, 400, 600);

/** Two-column page; `used` = height already consumed per column. */
function twoColumnPage(used: [number, number], opts: { spanColumn?: boolean } = {}): VDTPage {
  const page = createVDTPage(0, 440, 640, CONTENT);
  const w = 190;
  const cols = [0, 1].map((i) => {
    const col = createVDTColumn(i, createBoundingBox(CONTENT.x + i * (w + 20), CONTENT.y, w, CONTENT.height));
    if (used[i]! > 0) {
      col.availableHeight -= used[i]!;
      col.blocks.push({ id: `b${i}` } as VDTBlock);
    }
    return col;
  });
  page.columns.push(...cols);
  if (opts.spanColumn) {
    const span = createVDTColumn(2, createBoundingBox(CONTENT.x, 300, CONTENT.width, 40));
    span.kind = 'span';
    page.columns.push(span);
  }
  return page;
}

const planned = (position: PlannedFloat['position'], span: PlannedFloat['span'] = 'column'): PlannedFloat =>
  ({ resourceId: 'f', firstBlockIdx: 0, position, span });

const noCaps = (): ColumnCapKind => undefined;
const describeSlots = (slots: ReturnType<typeof enumerateCurrentPageSlots>) =>
  slots.map((s) => `${s.pageSpan ? 'page' : `c${s.cols[0]!.index}`}:${s.position}`);

describe('float slots (pure)', () => {
  it('auto: bottom of the referencing column, then top and bottom of the next empty column', () => {
    const page = twoColumnPage([100, 0]);
    expect(describeSlots(enumerateCurrentPageSlots(page, 0, planned('auto'), noCaps)))
      .toEqual(['c0:bottom', 'c1:top', 'c1:bottom']);
  });

  it('auto: an empty referencing column also offers its top', () => {
    const page = twoColumnPage([0, 0]);
    expect(describeSlots(enumerateCurrentPageSlots(page, 0, planned('auto'), noCaps)))
      .toEqual(['c0:top', 'c0:bottom', 'c1:top', 'c1:bottom']);
  });

  it('top / bottom restrict the search to that kind of slot', () => {
    const page = twoColumnPage([100, 0]);
    expect(describeSlots(enumerateCurrentPageSlots(page, 0, planned('top'), noCaps))).toEqual(['c1:top']);
    expect(describeSlots(enumerateCurrentPageSlots(page, 0, planned('bottom'), noCaps))).toEqual(['c0:bottom', 'c1:bottom']);
  });

  it('later columns that already hold content are not slots', () => {
    const page = twoColumnPage([100, 50]);
    expect(describeSlots(enumerateCurrentPageSlots(page, 0, planned('auto'), noCaps))).toEqual(['c0:bottom']);
    expect(describeSlots(enumerateCurrentPageSlots(page, 1, planned('auto'), noCaps))).toEqual(['c1:bottom']);
  });

  it('page-span floats get the band bottom only, never a top slot', () => {
    const page = twoColumnPage([100, 0]);
    const slots = enumerateCurrentPageSlots(page, 0, planned('auto', 'page'), noCaps);
    expect(describeSlots(slots)).toEqual(['page:bottom']);
    expect(slots[0]!.cols.map((c) => c.index)).toEqual([0, 1]);
    expect(enumerateCurrentPageSlots(page, 0, planned('top', 'page'), noCaps)).toEqual([]);
  });

  it('a span-capped column keeps its bottom off the list; a trailing cap does not', () => {
    const page = twoColumnPage([100, 0]);
    const spanCapped = (col: VDTColumn): ColumnCapKind => (col.index === 0 ? 'span' : undefined);
    expect(describeSlots(enumerateCurrentPageSlots(page, 0, planned('auto'), spanCapped)))
      .toEqual(['c1:top', 'c1:bottom']);
    expect(enumerateCurrentPageSlots(page, 0, planned('auto', 'page'), spanCapped)).toEqual([]);
    const trailingCapped = (): ColumnCapKind => 'trailing';
    expect(describeSlots(enumerateCurrentPageSlots(page, 0, planned('auto'), trailingCapped)))
      .toEqual(['c0:bottom', 'c1:top', 'c1:bottom']);
  });

  it('no slots from a span column or on a part page', () => {
    const page = twoColumnPage([100, 0], { spanColumn: true });
    expect(enumerateCurrentPageSlots(page, 2, planned('auto'), noCaps)).toEqual([]);
    const part = twoColumnPage([0, 0]);
    part.partInfo = { number: 'I', title: 'Part' };
    expect(enumerateCurrentPageSlots(part, 0, planned('auto'), noCaps)).toEqual([]);
  });

  it('measures a top band rounded up to the grid and a bottom band anchored to the grid', () => {
    const page = twoColumnPage([100, 0]);
    const col = page.columns[0]!;
    const bottomOf = (c: VDTColumn) => c.bbox.y + c.bbox.height;
    const top = measureFloatBand('top', { height: 50 }, [col], CONTENT, GRID, GRID, bottomOf);
    expect(top.y).toBe(col.bbox.y);
    expect(top.need).toBe(Math.ceil((50 + GRID) / GRID) * GRID);
    const bottom = measureFloatBand('bottom', { height: 50, lastCaptionBaseline: 45 }, [col], CONTENT, GRID, GRID, bottomOf);
    // Caption baseline sits 0.2 × grid above the last grid slot.
    const gridBottom = CONTENT.y + Math.floor((bottomOf(col) - CONTENT.y + 0.01) / GRID) * GRID;
    expect(bottom.y).toBeCloseTo(gridBottom - 0.2 * GRID - 45, 6);
    expect(bottom.need).toBeCloseTo(bottomOf(col) - (bottom.y - GRID), 6);
  });

  it('strict fit keeps three lines of text only next to another float band', () => {
    const page = twoColumnPage([100, 0]);
    const col = page.columns[0]!;
    expect(fitsStrict(col.availableHeight, col, false, 36)).toBe(true);
    expect(fitsStrict(col.availableHeight, col, true, 36)).toBe(false);
    expect(fitsStrict(col.availableHeight + 1, col, false, 36)).toBe(false);
    expect(columnHasFloatBand(page, col)).toBe(false);
    page.floats = [{ bbox: createBoundingBox(col.bbox.x, 500, col.bbox.width, 80) } as VDTBlock];
    expect(columnHasFloatBand(page, col)).toBe(true);
    expect(columnHasFloatBand(page, page.columns[1]!)).toBe(false);
  });
});

describe('side stack obstacles (EF-78)', () => {
  const snap = (v: number) => CONTENT.y + Math.ceil((v - CONTENT.y - 0.01) / GRID) * GRID;
  const sideCol = (used = 0): VDTColumn => {
    const col = createVDTColumn(0, createBoundingBox(300, CONTENT.y, 100, CONTENT.height));
    col.kind = 'side';
    col.availableHeight -= used;
    return col;
  };

  it('keeps an item that fits above an obstacle where it is', () => {
    expect(clearSideObstacles(20, 100, [{ top: 300, bottom: 340 }], 12, snap)).toBe(20);
    expect(clearSideObstacles(20, 100, undefined, 12, snap)).toBe(20);
  });

  it('moves an item that would reach an obstacle (gap included) under it, on the grid', () => {
    // 20 + 100 + 12 reaches 132 > 125: under the obstacle, 12 below it.
    expect(clearSideObstacles(20, 100, [{ top: 125, bottom: 150 }], 12, snap)).toBe(snap(162));
    // An obstacle at the head of the column holds the item under it.
    expect(clearSideObstacles(20, 30, [{ top: 20, bottom: 70 }], 12, snap)).toBe(snap(82));
  });

  it('clears every obstacle it meets on the way down, whatever their order', () => {
    const obstacles = [{ top: 200, bottom: 230 }, { top: 40, bottom: 60 }];
    // Under the first, the item (150 tall) would reach the second.
    expect(clearSideObstacles(20, 150, obstacles, 12, snap)).toBe(snap(242));
  });

  it('measureSideStack consumes the room the obstacle took above the item', () => {
    const col = sideCol(0);
    const plain = measureSideStack({ height: 100 }, col, undefined, CONTENT, GRID, 12);
    expect(plain).toEqual({ need: 112, y: 20 });
    const under = measureSideStack({ height: 100 }, col, undefined, CONTENT, GRID, 12, [{ top: 20, bottom: 70 }]);
    expect(under.y).toBe(snap(82));
    expect(under.need).toBe(under.y - 20 + 100 + 12);
    // An obstacle further down leaves the head of the column to the item.
    expect(measureSideStack({ height: 100 }, col, undefined, CONTENT, GRID, 12, [{ top: 400, bottom: 420 }])).toEqual(plain);
  });
});
