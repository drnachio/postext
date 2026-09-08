import { describe, it, expect } from 'vitest';
import { computeColumnEdges, layoutResourceBlock } from '../../pipeline/resourceLayout';
import { resolveAllConfig } from '../../pipeline/config';
import { defaultResourceTypes } from '../../defaults/resourceTypes';
import { dimensionToPx } from '../../units';
import type { PostextConfig, Resource, ResourceType, TableModel } from '../../types';

// Deterministic text measurement stub (no DOM in the node test env). Widths
// are proportional to length; captions here are short enough never to wrap.
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const COLUMN_WIDTH = 400;

const figure = (extra: Partial<Resource> = {}): Resource => ({
  id: 'fig-1',
  typeId: 'figure',
  kind: 'bitmap',
  caption: 'A figure.',
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: 'fig-1.png', format: 'png', width: 400, height: 300 },
  ...extra,
});

const tableModel = (columnWidths?: number[]): TableModel => ({
  rows: [
    [{ content: 'a' }, { content: 'b' }, { content: 'c' }],
    [{ content: 'd' }, { content: 'e' }, { content: 'f' }],
  ],
  ...(columnWidths ? { columnWidths } : {}),
});

const tableResource = (model: TableModel, extra: Partial<Resource> = {}): Resource => ({
  id: 'tab-1',
  typeId: 'table',
  kind: 'table',
  caption: 'A table.',
  createdAt: 0,
  updatedAt: 0,
  table: { model },
  ...extra,
});

/** Lay out one resource with the given config (+ optional type overrides). */
function layout(resource: Resource, config?: PostextConfig, types?: ResourceType[]) {
  const resourceTypes = types ?? config?.resourceTypes ?? defaultResourceTypes();
  const resolved = resolveAllConfig(config);
  return layoutResourceBlock({
    resource,
    resourceType: resourceTypes.find((t) => t.id === resource.typeId),
    number: '1',
    resolved,
    columnWidth: COLUMN_WIDTH,
    resourceNumbering: { [resource.id]: { number: '1', typeId: resource.typeId, heading: { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 } } },
    resourceTypes,
    resources: [resource],
  });
}

/** Caption gap in px for a resolved config (em relative to the caption size). */
function captionMetrics(config?: PostextConfig) {
  const resolved = resolveAllConfig(config);
  const dpi = resolved.page.dpi;
  const fontPx = dimensionToPx(resolved.captionStyle.fontSize, dpi);
  return {
    gapPx: dimensionToPx(resolved.captionStyle.gap, dpi, fontPx),
    paddingPx: dimensionToPx(resolved.captionStyle.padding, dpi, fontPx),
    noteGapPx: dimensionToPx(resolved.captionStyle.note.gap, dpi, dimensionToPx(resolved.captionStyle.note.fontSize, dpi)),
  };
}

describe('caption position', () => {
  it('below (default): body at y=0, caption after the gap, height = body + gap + caption', () => {
    const { block, totalHeight } = layout(figure());
    const { gapPx } = captionMetrics();
    expect(block.bodyRect.y).toBe(0);
    expect(block.bodyRect.height).toBe(300);
    expect(block.captionLines).toHaveLength(1);
    const line = block.captionLines[0]!;
    expect(line.bbox.y).toBeCloseTo(300 + gapPx, 6);
    expect(line.bbox.x).toBe(0);
    expect(totalHeight).toBeCloseTo(300 + gapPx + line.bbox.height, 6);
    expect(block.captionBar).toBeUndefined();
    expect(block.noteLines).toEqual([]);
  });

  it('above: caption first, body shifted down by caption height + gap, same total height', () => {
    const config: PostextConfig = { captionStyle: { position: 'above' } };
    const { block, totalHeight } = layout(figure(), config);
    const below = layout(figure());
    const { gapPx } = captionMetrics(config);
    const line = block.captionLines[0]!;
    expect(line.bbox.y).toBe(0);
    expect(block.bodyRect.y).toBeCloseTo(line.bbox.height + gapPx, 6);
    expect(block.bodyRect.height).toBe(300);
    expect(totalHeight).toBeCloseTo(below.totalHeight, 6);
  });

  it('above: table cells move down with the body', () => {
    const config: PostextConfig = { captionStyle: { position: 'above' } };
    const { block } = layout(tableResource(tableModel()), config);
    expect(block.bodyRect.y).toBeGreaterThan(0);
    const firstRow = block.table!.cells.filter((c) => c.row === 0);
    for (const cell of firstRow) {
      expect(cell.rect.y).toBeCloseTo(block.bodyRect.y, 6);
      expect(cell.lines[0]!.bbox.y).toBeGreaterThanOrEqual(block.bodyRect.y);
    }
    // Row edges stay table-relative.
    expect(block.table!.rowEdges[0]).toBe(0);
  });
});

describe('caption bar', () => {
  it('spans the block width and wraps the caption lines plus padding (above)', () => {
    const config: PostextConfig = {
      captionStyle: { position: 'above', backgroundEnabled: true, background: { hex: '#112233', model: 'hex' } },
    };
    const { block, totalHeight } = layout(figure(), config);
    const { gapPx, paddingPx } = captionMetrics(config);
    expect(paddingPx).toBeGreaterThan(0);
    const bar = block.captionBar!;
    expect(bar).toBeDefined();
    expect(bar.background).toBe('#112233');
    expect(bar.rect.x).toBe(0);
    expect(bar.rect.y).toBe(0);
    expect(bar.rect.width).toBe(COLUMN_WIDTH);
    const line = block.captionLines[0]!;
    expect(bar.rect.height).toBeCloseTo(line.bbox.height + paddingPx * 2, 6);
    // Caption text is inset by the padding on both axes.
    expect(line.bbox.x).toBeCloseTo(paddingPx, 6);
    expect(line.bbox.y).toBeCloseTo(paddingPx, 6);
    // The body starts after the bar + gap; the total grows by the padding.
    expect(block.bodyRect.y).toBeCloseTo(bar.rect.height + gapPx, 6);
    expect(totalHeight).toBeCloseTo(bar.rect.height + gapPx + 300, 6);
  });

  it('sits under the body when the caption is below', () => {
    const config: PostextConfig = { captionStyle: { backgroundEnabled: true } };
    const { block } = layout(figure(), config);
    const { gapPx, paddingPx } = captionMetrics(config);
    const bar = block.captionBar!;
    expect(bar.rect.y).toBeCloseTo(300 + gapPx, 6);
    expect(block.captionLines[0]!.bbox.y).toBeCloseTo(300 + gapPx + paddingPx, 6);
    // Default bar colour is the main palette colour.
    expect(bar.background).toBe('#295AA3');
  });

  it('is absent without a caption even when enabled', () => {
    const noCaptionType: ResourceType = { ...defaultResourceTypes()[0]!, captionPrefix: '' };
    const { block } = layout(figure({ caption: '' }), { captionStyle: { backgroundEnabled: true } }, [noCaptionType]);
    expect(block.captionLines).toEqual([]);
    expect(block.captionBar).toBeUndefined();
    expect(block.bodyRect.y).toBe(0);
  });
});

describe('per-type caption override', () => {
  it('applies only to resources of that type', () => {
    const types = defaultResourceTypes().map((t) =>
      t.id === 'table'
        ? { ...t, captionStyle: { position: 'above' as const, labelBold: false, color: { hex: '#ff0000', model: 'hex' as const } } }
        : t,
    );
    const config: PostextConfig = { resourceTypes: types };
    const tab = layout(tableResource(tableModel()), config);
    const fig = layout(figure(), config);
    expect(tab.block.bodyRect.y).toBeGreaterThan(0);
    expect(tab.block.captionColor).toBe('#ff0000');
    // Label colour follows the overridden caption colour.
    expect(tab.block.captionLabelColor).toBe('#ff0000');
    expect(tab.block.captionLines[0]!.segments![0]!.bold).toBeFalsy();
    // The figure keeps the global style.
    expect(fig.block.bodyRect.y).toBe(0);
    expect(fig.block.captionLines[0]!.segments![0]!.bold).toBe(true);
    expect(fig.block.captionColor).not.toBe('#ff0000');
  });

  it('resolves palette colours inside the override', () => {
    const types = defaultResourceTypes().map((t) =>
      t.id === 'figure'
        ? { ...t, captionStyle: { backgroundEnabled: true, background: { hex: '#000000', model: 'hex' as const, paletteId: 'accent' } } }
        : t,
    );
    const config: PostextConfig = {
      resourceTypes: types,
      colorPalette: [{ id: 'accent', name: 'Accent', value: { hex: '#abcdef', model: 'hex' } }],
    };
    const { block } = layout(figure(), config);
    expect(block.captionBar?.background).toBe('#abcdef');
  });
});

describe('resource note', () => {
  it('goes under the caption when the caption is below, and counts in the height', () => {
    const { block, totalHeight } = layout(figure({ note: 'Source: the archive.' }));
    const plain = layout(figure());
    const { noteGapPx } = captionMetrics();
    expect(block.noteLines).toHaveLength(1);
    const note = block.noteLines[0]!;
    const caption = block.captionLines[0]!;
    expect(note.bbox.y).toBeCloseTo(caption.bbox.y + caption.bbox.height + noteGapPx, 6);
    expect(totalHeight).toBeCloseTo(plain.totalHeight + noteGapPx + note.bbox.height, 6);
    // Note runs smaller than the caption and in the caption colour.
    expect(note.bbox.height).toBeLessThan(caption.bbox.height);
    expect(block.noteColor).toBe(block.captionColor);
    expect(block.noteFontString).not.toBe(block.captionFontString);
  });

  it('goes under the body when the caption is above', () => {
    const config: PostextConfig = { captionStyle: { position: 'above' } };
    const { block, totalHeight } = layout(figure({ note: 'Source: the archive.' }), config);
    const { noteGapPx } = captionMetrics(config);
    const note = block.noteLines[0]!;
    expect(note.bbox.y).toBeCloseTo(block.bodyRect.y + block.bodyRect.height + noteGapPx, 6);
    expect(totalHeight).toBeCloseTo(note.bbox.y + note.bbox.height, 6);
  });

  it('honours note styling (italic, colour, size) and inline marks', () => {
    const config: PostextConfig = {
      captionStyle: { note: { italic: true, color: { hex: '#123123', model: 'hex' }, fontSize: { value: 6, unit: 'pt' } } },
    };
    const { block } = layout(figure({ note: 'Plain **bold** :ref{id="fig-1"}' }), config);
    const segs = block.noteLines.flatMap((l) => l.segments ?? []).filter((s) => s.kind !== 'space');
    expect(segs.every((s) => s.italic)).toBe(true);
    expect(segs.find((s) => s.text === 'bold')?.bold).toBe(true);
    expect(segs.some((s) => s.refResourceId === 'fig-1')).toBe(true);
    expect(block.noteColor).toBe('#123123');
    expect(block.noteFontString).toContain(`${dimensionToPx({ value: 6, unit: 'pt' }, resolveAllConfig(config).page.dpi)}px`);
  });
});

describe('table column widths', () => {
  it('computeColumnEdges normalises weights', () => {
    expect(computeColumnEdges(tableModel([2, 1, 1]), 400)).toEqual([0, 200, 300, 400]);
    expect(computeColumnEdges(tableModel([50, 25, 25]), 400)).toEqual([0, 200, 300, 400]);
  });

  it('computeColumnEdges falls back to an equal split for invalid weights', () => {
    const equal = [0, 400 / 3, 800 / 3, 400];
    const close = (edges: number[]) => edges.forEach((e, i) => expect(e).toBeCloseTo(equal[i]!, 6));
    close(computeColumnEdges(tableModel(), 400));
    close(computeColumnEdges(tableModel([1, 1]), 400));
    close(computeColumnEdges(tableModel([1, 0, 1]), 400));
    close(computeColumnEdges(tableModel([1, -1, 1]), 400));
    close(computeColumnEdges(tableModel([1, Number.NaN, 1]), 400));
    expect(computeColumnEdges({ rows: [] }, 400)).toEqual([0]);
  });

  it('drives the laid-out cell rects', () => {
    const { block } = layout(tableResource(tableModel([2, 1, 1])));
    const t = block.table!;
    expect(t.columnEdges).toEqual([0, 200, 300, 400]);
    const row0 = t.cells.filter((c) => c.row === 0).sort((a, b) => a.col - b.col);
    expect(row0.map((c) => c.rect.width)).toEqual([200, 100, 100]);
    expect(row0.map((c) => c.rect.x)).toEqual([0, 200, 300]);
  });
});

describe('table borders', () => {
  it('keeps a 0.5pt rule fractional instead of rounding it up to 1px', () => {
    const config: PostextConfig = { tableStyle: { borderWidth: { value: 0.5, unit: 'pt' } } };
    const { block } = layout(tableResource(tableModel()), config);
    const dpi = resolveAllConfig(config).page.dpi;
    const expected = dimensionToPx({ value: 0.5, unit: 'pt' }, dpi);
    expect(block.table!.borderWidthPx).toBeCloseTo(expected, 6);
    expect(block.table!.borderWidthPx).not.toBe(Math.max(1, Math.round(expected)));
  });

  it('floors absurdly thin rules at 0.25px and disables them with borders:false', () => {
    const thin = layout(tableResource(tableModel()), { tableStyle: { borderWidth: { value: 0.01, unit: 'px' } } });
    expect(thin.block.table!.borderWidthPx).toBe(0.25);
    const off = layout(tableResource(tableModel()), { tableStyle: { borders: false } });
    expect(off.block.table!.borderWidthPx).toBe(0);
  });

  it('carries the rules mode; none zeroes the stroke', () => {
    expect(layout(tableResource(tableModel())).block.table!.rules).toBe('grid');
    const horizontal = layout(tableResource(tableModel()), { tableStyle: { rules: 'horizontal' } });
    expect(horizontal.block.table!.rules).toBe('horizontal');
    expect(horizontal.block.table!.borderWidthPx).toBeGreaterThan(0);
    const outer = layout(tableResource(tableModel()), { tableStyle: { rules: 'outer' } });
    expect(outer.block.table!.rules).toBe('outer');
    const none = layout(tableResource(tableModel()), { tableStyle: { rules: 'none' } });
    expect(none.block.table!.rules).toBe('none');
    expect(none.block.table!.borderWidthPx).toBe(0);
  });
});
