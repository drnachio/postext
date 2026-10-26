import { describe, it, expect } from 'vitest';
import { columnClipRect, designOverlayOverhang, textInkOverhangAbove } from '../paint/columnClip.js';
import type { VDTBlock, VDTColumn, VDTDesignBlock } from '../vdt.js';

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

describe('columnClipRect above the head lines (#826)', () => {
  // A 40px Bangers heading set at the column's top: its line box starts at
  // the face's ascent (0.883 em), and its accented capitals rise to about
  // 1.1 em above the baseline, past the column's top.
  const line = (baseline: number, extra: Record<string, unknown> = {}) => ({
    text: 'UNA PÁGINA',
    bbox: { x: 60, y: baseline - 35.32, width: 200, height: 42.56 },
    baseline,
    ...extra,
  });
  const text = (type: string, lines: unknown[], extra: Partial<VDTBlock> = {}): VDTBlock =>
    ({ type, fontString: '400 40px Bangers', lines, bbox: { x: 60, y: 40, width: 200, height: 50 }, ...extra }) as unknown as VDTBlock;

  it('takes in the ink a display heading may raise above the column top', () => {
    const heading = text('heading', [line(75.32)]);
    // 2 em of 40px above the baseline: 75.32 − 80 = −4.68, 44.68 above the top.
    expect(textInkOverhangAbove([heading], 40)).toBeCloseTo(44.68, 5);
    const clip = columnClipRect(column([heading]), DPI);
    expect(clip.y).toBeCloseTo(40 - 44.68, 5);
    expect(clip.y + clip.height).toBeCloseTo(340, 5);
    // The tallest accent (Ó, 1.118 em) is inside.
    expect(clip.y).toBeLessThan(75.32 - 1.118 * 40);
  });

  it('reads the largest font of the line (a segment set bigger than its block)', () => {
    const big = text('paragraph', [line(75.32, { segments: [{ kind: 'text', text: 'Á', width: 20, fontString: '400 60px Bangers' }] })]);
    expect(textInkOverhangAbove([big], 40)).toBeCloseTo(120 - 35.32, 5);
  });

  it('leaves the top alone when the head lines stand well below it', () => {
    expect(textInkOverhangAbove([text('paragraph', [line(200)])], 40)).toBe(0);
    expect(columnClipRect(column([text('paragraph', [line(200)])]), DPI).y).toBe(40);
  });

  it('still cuts a box at the column top, with the text inside it', () => {
    const frame = block([], { type: 'callout', lines: [] } as Partial<VDTBlock>);
    const inner = text('paragraph', [line(75.32)], { containerId: 3 });
    expect(columnClipRect(column([frame, inner]), DPI).y).toBe(40);
    expect(textInkOverhangAbove([inner], 40)).toBe(0);
    // A listing at the head stops the look as well.
    expect(textInkOverhangAbove([text('code', [line(75.32)]), text('heading', [line(76)])], 40)).toBe(0);
  });

  it('skips hidden blocks at the head', () => {
    const hidden = text('heading', [line(41)], { hidden: true });
    const first = text('paragraph', [line(75.32)]);
    expect(textInkOverhangAbove([hidden, first], 40)).toBeCloseTo(44.68, 5);
  });
});
