import { describe, it, expect } from 'vitest';
import { columnClipRect, designOverlayOverhang } from '../columnClip';
import type { VDTBlock, VDTColumn, VDTDesignBlock } from '../vdt';

const DPI = 72; // 1pt = 1px: the 2pt glyph buffer reads as 2.

const rect = (x: number, width: number): VDTDesignBlock => ({
  kind: 'box',
  bbox: { x, y: 100, width, height: 10 },
  box: { borderWidthPx: 0, borderRadiusPx: 0 },
});

const block = (overlay: VDTDesignBlock[], extra: Partial<VDTBlock> = {}): VDTBlock =>
  ({ designOverlay: { bbox: { x: 0, y: 0, width: 0, height: 0 }, blocks: overlay }, ...extra }) as VDTBlock;

const column = (blocks: VDTBlock[]): VDTColumn =>
  ({ index: 0, bbox: { x: 60, y: 40, width: 200, height: 300 }, blocks, availableHeight: 300, baselineOffset: 0 }) as VDTColumn;

describe('columnClipRect', () => {
  it('widens a plain column by the 2pt glyph buffer on each side', () => {
    expect(columnClipRect(column([]), DPI)).toEqual({ x: 58, y: 40, width: 204, height: 300 });
  });

  it('takes in a design overlay hanging left of the column (a heading tab, #121)', () => {
    const clip = columnClipRect(column([block([rect(45, 40), rect(45, 6)])]), DPI);
    expect(clip.x).toBe(43);
    expect(clip.x + clip.width).toBe(262);
  });

  it('takes in overlays hanging past either edge, and ignores hidden blocks', () => {
    const blocks = [block([rect(250, 30)]), block([rect(0, 10)], { hidden: true })];
    expect(designOverlayOverhang(blocks, 60, 260)).toEqual([0, 20]);
    const clip = columnClipRect(column(blocks), DPI);
    expect(clip).toEqual({ x: 58, y: 40, width: 224, height: 300 });
  });
});

describe('columnClipRect above and below the column (EF-113)', () => {
  const at = (y: number, height: number): VDTDesignBlock => ({
    kind: 'box',
    bbox: { x: 60, y, width: 200, height },
    box: { borderWidthPx: 0, borderRadiusPx: 0 },
  });

  it('takes in a heading design reaching above the column top', () => {
    const heading = block([at(0, 120)], { type: 'heading' });
    expect(columnClipRect(column([heading]), DPI)).toEqual({ x: 58, y: 0, width: 204, height: 340 });
  });

  it('still cuts a heading design at the column foot, where the flow ends', () => {
    const foot = block([at(300, 80)], { type: 'heading' });
    expect(columnClipRect(column([foot]), DPI)).toEqual({ x: 58, y: 40, width: 204, height: 300 });
  });

  it('keeps clipping a box frame at the column top and foot', () => {
    // A callout frame taller than its column is cut with its text.
    const frame = block([at(20, 400)], { type: 'callout' });
    expect(columnClipRect(column([frame]), DPI)).toEqual({ x: 58, y: 40, width: 204, height: 300 });
  });
});
