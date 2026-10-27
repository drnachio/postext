import { describe, expect, it } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import type { PostextConfig, VDTFrame } from '../../../index.js';

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

const mm = (value: number) => ({ value, unit: 'mm' as const });
const MM = 300 / 25.4;

// A row of three cards, a group with no box of its own: where it starts is
// the grid cell of its first frame, not an offset worked out by hand (#945).
const config = (first: object): PostextConfig => ({
  page: { width: mm(210), height: mm(297), margins: { top: mm(20), bottom: mm(20), left: mm(20), right: mm(20) } },
  headings: { levels: [{ level: 1, breakBefore: { enabled: false } }] },
  header: { elements: [] },
  footer: { elements: [] },
  pageTemplates: [{
    id: 'cards',
    grid: { columns: 2, rows: 6, columnGap: mm(10), rowGap: mm(4) },
    frames: [
      { name: 'c1', width: mm(40), height: mm(30), ...first },
      { name: 'c2', width: mm(40), height: mm(30) },
      { name: 'c3', width: mm(40), height: mm(30) },
    ],
    groups: [{ name: 'row', kind: 'row', frames: ['c1', 'c2', 'c3'], gap: mm(5) }],
  }],
} as PostextConfig);

const MARKDOWN = [
  '::::page{template="cards"}',
  ':::frame{slot="c1"}', 'One', ':::',
  ':::frame{slot="c2"}', 'Two', ':::',
  ':::frame{slot="c3"}', 'Three', ':::',
  '::::',
].join('\n');

function frames(first: object): Record<string, VDTFrame> {
  const doc = buildDocument({ markdown: MARKDOWN }, config(first));
  return Object.fromEntries(doc.pages[0]!.composed!.frames.map((f) => [f.name, f]));
}

describe('a group with no box of its own starts at the grid cell of its first frame (#945)', () => {
  it('lays the row from the cell, with no offset worked out by hand', () => {
    const cell = frames({ grid: { col: 1, row: 4 } });
    // The cell: column 1, row 4 of a 170 x 257 mm area in 2 x 6 cells.
    const rowH = (257 - 5 * 4) / 6;
    const top = 20 + 3 * (rowH + 4);
    expect(cell.c1!.rect.x / MM).toBeCloseTo(20, 1);
    expect(cell.c1!.rect.y / MM).toBeCloseTo(top, 1);
    // The others follow in the row, a gap apart, on the same line.
    expect(cell.c2!.rect.x).toBeCloseTo(cell.c1!.rect.x + cell.c1!.rect.width + 5 * MM, 1);
    expect(cell.c3!.rect.x).toBeCloseTo(cell.c2!.rect.x + cell.c2!.rect.width + 5 * MM, 1);
    expect(cell.c2!.rect.y).toBeCloseTo(cell.c1!.rect.y, 1);
    expect(cell.c3!.rect.y).toBeCloseTo(cell.c1!.rect.y, 1);
  });

  it('puts the row in the other column when the cell says so', () => {
    const right = frames({ grid: { col: 2, row: 1 } });
    // Column 2 starts after the first column and the gap: 80 mm + 10 mm in.
    expect(right.c1!.rect.x / MM).toBeCloseTo(20 + 80 + 10, 1);
    expect(right.c1!.rect.y / MM).toBeCloseTo(20, 1);
  });
});
