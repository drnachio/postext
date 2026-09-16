import { describe, it, expect } from 'vitest';
import { layoutResourceBlock } from '../../pipeline/resourceLayout';
import { resolveAllConfig } from '../../pipeline/config';
import { defaultResourceTypes } from '../../defaults/resourceTypes';
import type { Resource, TableModel } from '../../types';

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

const tableResource = (model: TableModel): Resource => ({
  id: 'tab-1',
  typeId: 'table',
  kind: 'table',
  caption: 'A table.',
  createdAt: 0,
  updatedAt: 0,
  table: { model },
});

function layout(model: TableModel) {
  const resourceTypes = defaultResourceTypes();
  const resource = tableResource(model);
  const resolved = resolveAllConfig();
  return layoutResourceBlock({
    resource,
    resourceType: resourceTypes.find((t) => t.id === 'table'),
    number: '1',
    resolved,
    columnWidth: COLUMN_WIDTH,
    resourceNumbering: { [resource.id]: { number: '1', typeId: 'table', heading: { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 } } },
    resourceTypes,
    resources: [resource],
  });
}

const cellLines = (model: TableModel, row: number, col: number) =>
  layout(model).block.table!.cells.find((c) => c.row === row && c.col === col)!.lines;

describe('lists inside table cells', () => {
  it('a hard line break starts a new paragraph', () => {
    const lines = cellLines({ rows: [[{ content: 'one\ntwo' }]] }, 0, 0);
    expect(lines.map((l) => l.text)).toEqual(['one', 'two']);
    expect(lines[1]!.bbox.y).toBeGreaterThan(lines[0]!.bbox.y);
  });

  it('bullet paragraphs keep their marker and hang wrapped text off it', () => {
    // 400px column, two cells of 200px, ~180px of text room: the second item wraps.
    const lines = cellLines({ rows: [[{ content: '• Short\n• A much longer item that wraps onto more lines' }, { content: 'x' }]] }, 0, 0);
    expect(lines.length).toBeGreaterThan(2);
    expect(lines[0]!.text).toBe('• Short');
    expect(lines[0]!.segments![0]).toEqual(expect.objectContaining({ kind: 'text', text: '•' }));
    expect(lines[0]!.segments![1]).toEqual(expect.objectContaining({ kind: 'space', text: ' ' }));
    expect(lines[1]!.text.startsWith('• A much')).toBe(true);
    // Wrapped lines of the second item align with its text, past the marker.
    const markerLine = lines[1]!;
    const wrapped = lines[2]!;
    expect(markerLine.bbox.x).toBeCloseTo(wrapped.bbox.x - (markerLine.segments![0]!.width + markerLine.segments![1]!.width), 6);
    expect(wrapped.bbox.x).toBeGreaterThan(markerLine.bbox.x);
    // The marker segment plus its gap is what the text starts after.
    expect(wrapped.segments![0]!.kind).toBe('text');
  });

  it('two leading spaces nest a level; dashes and numbers are markers too', () => {
    const lines = cellLines({ rows: [[{ content: '- top\n  – nested\n1. numbered' }]] }, 0, 0);
    expect(lines.map((l) => l.text)).toEqual(['- top', '– nested', '1. numbered']);
    expect(lines[1]!.bbox.x).toBeGreaterThan(lines[0]!.bbox.x);
    expect(lines[2]!.bbox.x).toBe(lines[0]!.bbox.x);
    expect(lines[2]!.segments![0]!.text).toBe('1.');
  });

  it('a lone dash is text, not a marker', () => {
    const lines = cellLines({ rows: [[{ content: '-' }]] }, 0, 0);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.segments![0]!.text).toBe('-');
    expect(lines[0]!.segments).toHaveLength(1);
  });

  it('every plain character of the content survives in the segments', () => {
    const content = 'Intro\n• first item\n  – nested one\n• last';
    const lines = cellLines({ rows: [[{ content }]] }, 0, 0);
    const painted = lines.map((l) => (l.segments ?? []).map((s) => s.text).join('')).join('\n');
    // Leading indentation is the only thing the measurer drops.
    expect(painted).toBe(content.replace(/\n\s+/g, '\n'));
  });

  it('the row grows with the list', () => {
    const one = layout({ rows: [[{ content: 'one' }]] }).block.table!.rowEdges[1]!;
    const three = layout({ rows: [[{ content: '• a\n• b\n• c' }]] }).block.table!.rowEdges[1]!;
    expect(three).toBeGreaterThan(one * 2);
  });
});
