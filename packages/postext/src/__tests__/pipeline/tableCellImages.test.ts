import { describe, it, expect } from 'vitest';
import { layoutResourceBlock } from '../../pipeline/resourceLayout';
import { resolveAllConfig } from '../../pipeline/config';
import { defaultResourceTypes } from '../../defaults/resourceTypes';
import { setCellImage } from '../../table/model';
import type { PostextConfig, Resource, TableModel } from '../../types';

// Deterministic text measurement stub (no DOM in the node test env).
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

const bitmap: Resource = {
  id: 'fig-arm',
  typeId: 'figure',
  kind: 'bitmap',
  caption: '',
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: 'blob-arm', format: 'png', width: 100, height: 200 },
};

const svg: Resource = {
  id: 'fig-vec',
  typeId: 'figure',
  kind: 'svg',
  caption: '',
  createdAt: 0,
  updatedAt: 0,
  svg: { fileId: 'blob-vec', width: 40, height: 20 },
};

const tableResource = (model: TableModel): Resource => ({
  id: 'tab-1',
  typeId: 'table',
  kind: 'table',
  caption: 'A table.',
  createdAt: 0,
  updatedAt: 0,
  table: { model },
});

function layout(model: TableModel, config?: PostextConfig) {
  const resourceTypes = defaultResourceTypes();
  const resource = tableResource(model);
  const resolved = resolveAllConfig(config);
  return layoutResourceBlock({
    resource,
    resourceType: resourceTypes.find((t) => t.id === 'table'),
    number: '1',
    resolved,
    columnWidth: COLUMN_WIDTH,
    resourceNumbering: { [resource.id]: { number: '1', typeId: 'table', heading: { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 } } },
    resourceTypes,
    resources: [resource, bitmap, svg],
  });
}

const cellAt = (model: TableModel, row: number, col: number, config?: PostextConfig) =>
  layout(model, config).block.table!.cells.find((c) => c.row === row && c.col === col)!;

/** Two equal columns; the second cell of the body row carries the image. */
const model = (image: { resourceId: string; width?: number }, content = '', align?: 'left' | 'center' | 'right'): TableModel => ({
  rows: [
    [{ content: 'A', isHeader: true }, { content: 'B', isHeader: true }],
    [{ content: 'text' }, { content, image, ...(align ? { align } : {}) }],
  ],
  headerRowCount: 1,
});

describe('table cell images', () => {
  it('fits a bitmap into the cell inner width and grows the row to hold it', () => {
    const cell = cellAt(model({ resourceId: 'fig-arm' }), 1, 1);
    expect(cell.image).toBeDefined();
    const img = cell.image!;
    expect(img.kind).toBe('bitmap');
    expect(img.fileId).toBe('blob-arm');
    expect(img.format).toBe('png');
    // A 100×200 bitmap narrower than the cell keeps its size (like a figure).
    expect(img.rect.width).toBe(100);
    expect(img.rect.height).toBe(200);
    // Padded inside the cell, at the top.
    const padding = img.rect.y - cell.rect.y;
    expect(padding).toBeGreaterThan(0);
    expect(img.rect.x - cell.rect.x).toBe(padding);
    // Empty content: the row is the image plus padding on both sides.
    expect(cell.rect.height).toBeCloseTo(200 + padding * 2, 5);
    expect(cell.lines).toHaveLength(0);
  });

  it('fills a fraction of the inner width and keeps the aspect ratio', () => {
    const cell = cellAt(model({ resourceId: 'fig-vec', width: 0.5 }), 1, 1);
    const img = cell.image!;
    const padding = img.rect.y - cell.rect.y;
    const inner = cell.rect.width - padding * 2;
    expect(img.rect.width).toBeCloseTo(inner * 0.5, 5);
    expect(img.rect.height).toBeCloseTo(img.rect.width / 2, 5);
  });

  it('clamps the fraction to the inner width and ignores nonsense', () => {
    const wide = cellAt(model({ resourceId: 'fig-vec', width: 3 }), 1, 1).image!;
    const bad = cellAt(model({ resourceId: 'fig-vec', width: -1 }), 1, 1).image!;
    const full = cellAt(model({ resourceId: 'fig-vec' }), 1, 1).image!;
    expect(wide.rect.width).toBe(full.rect.width);
    expect(bad.rect.width).toBe(full.rect.width);
  });

  it('follows the cell alignment', () => {
    const left = cellAt(model({ resourceId: 'fig-arm' }, '', 'left'), 1, 1);
    const center = cellAt(model({ resourceId: 'fig-arm' }, '', 'center'), 1, 1);
    const right = cellAt(model({ resourceId: 'fig-arm' }, '', 'right'), 1, 1);
    const padding = left.image!.rect.y - left.rect.y;
    const inner = left.rect.width - padding * 2;
    expect(left.image!.rect.x - left.rect.x).toBe(padding);
    expect(center.image!.rect.x - center.rect.x).toBeCloseTo(padding + (inner - 100) / 2, 5);
    expect(right.image!.rect.x - right.rect.x).toBeCloseTo(padding + inner - 100, 5);
  });

  it('centres and right-aligns plain cell text like the image', () => {
    const text = (align: 'left' | 'center' | 'right') =>
      cellAt({ rows: [[{ content: 'A', isHeader: true }, { content: 'B', isHeader: true }], [{ content: 'text' }, { content: 'short', align }]], headerRowCount: 1 }, 1, 1);
    const left = text('left');
    const center = text('center');
    const right = text('right');
    const padding = left.lines[0]!.bbox.x - left.rect.x;
    const inner = left.rect.width - padding * 2;
    const w = left.lines[0]!.bbox.width;
    expect(center.lines[0]!.bbox.x - center.rect.x).toBeCloseTo(padding + (inner - w) / 2, 5);
    expect(right.lines[0]!.bbox.x - right.rect.x).toBeCloseTo(padding + inner - w, 5);
    // A list item stays flush left whatever the alignment.
    const item = cellAt({ rows: [[{ content: 'A', isHeader: true }, { content: 'B', isHeader: true }], [{ content: 'text' }, { content: '• item', align: 'center' }]], headerRowCount: 1 }, 1, 1);
    expect(item.lines[0]!.bbox.x - item.rect.x).toBe(padding);
  });

  it('runs the cell text under the image', () => {
    const cell = cellAt(model({ resourceId: 'fig-arm' }, 'Caption-like text'), 1, 1);
    const img = cell.image!;
    expect(cell.lines.length).toBeGreaterThan(0);
    const first = cell.lines[0]!;
    expect(first.bbox.y).toBeGreaterThanOrEqual(img.rect.y + img.rect.height);
    expect(cell.rect.y + cell.rect.height).toBeGreaterThanOrEqual(first.bbox.y + first.bbox.height);
    // The text-only sibling row cell is stretched to the same row height.
    const sibling = cellAt(model({ resourceId: 'fig-arm' }, 'Caption-like text'), 1, 0);
    expect(sibling.rect.height).toBe(cell.rect.height);
  });

  it('lays out text-only when the id matches no image resource', () => {
    const unknown = cellAt(model({ resourceId: 'nope' }, 'text'), 1, 1);
    expect(unknown.image).toBeUndefined();
    const table = cellAt(model({ resourceId: 'tab-1' }, 'text'), 1, 1);
    expect(table.image).toBeUndefined();
    const plain = cellAt({ rows: [[{ content: 'A', isHeader: true }, { content: 'B', isHeader: true }], [{ content: 'text' }, { content: 'text' }]], headerRowCount: 1 }, 1, 1);
    expect(unknown.rect.height).toBe(plain.rect.height);
  });

  it('moves with the body when the caption sits above', () => {
    const below = cellAt(model({ resourceId: 'fig-arm' }), 1, 1);
    const above = cellAt(model({ resourceId: 'fig-arm' }), 1, 1, { captionStyle: { position: 'above' } });
    const shift = above.rect.y - below.rect.y;
    expect(shift).toBeGreaterThan(0);
    expect(above.image!.rect.y - below.image!.rect.y).toBeCloseTo(shift, 5);
  });

  it('setCellImage sets, replaces and clears the image', () => {
    const m: TableModel = { rows: [[{ content: 'a' }, { content: 'b' }]] };
    const withImage = setCellImage(m, { row: 0, col: 1 }, { resourceId: 'fig-arm', width: 0.5 });
    expect(withImage.rows[0]![1]!.image).toEqual({ resourceId: 'fig-arm', width: 0.5 });
    expect(m.rows[0]![1]!.image).toBeUndefined();
    const replaced = setCellImage(withImage, { row: 0, col: 1 }, { resourceId: 'fig-vec' });
    expect(replaced.rows[0]![1]!.image).toEqual({ resourceId: 'fig-vec' });
    const cleared = setCellImage(replaced, { row: 0, col: 1 }, undefined);
    expect(cleared.rows[0]![1]!.image).toBeUndefined();
    expect(setCellImage(m, { row: 5, col: 0 }, { resourceId: 'x' })).toEqual(m);
  });
});
