import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline';
import { renderPageToCanvas } from '../canvas-backend';
import { renderToHtml } from '../html-backend';
import { tableCellFillRects } from '../vdt';
import type { BoundingBox, VDTResourceTableCell } from '../vdt';
import type { PostextConfig, Resource, TableCell } from '../types';

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

const pt = (value: number) => ({ value, unit: 'pt' as const });
const hex = (h: string) => ({ hex: h, model: 'hex' as const });
const cell = (content: string, extra: Partial<TableCell> = {}): TableCell => ({ content, ...extra });

const HEADER = '#dbe4f3';
const BODY = '#eef3fa';
const config: PostextConfig = {
  tableStyle: {
    borderWidth: pt(0),
    headerBackground: hex(HEADER),
    bodyBackgroundEnabled: true,
    bodyBackground: hex(BODY),
  },
};
const resource: Resource = {
  id: 't',
  typeId: 'table',
  kind: 'table',
  caption: 'Fills.',
  createdAt: 0,
  updatedAt: 0,
  table: {
    model: {
      headerRowCount: 1,
      rows: [
        [cell('Name', { isHeader: true }), cell('Value', { isHeader: true }), cell('Unit', { isHeader: true })],
        ...Array.from({ length: 5 }, (_, i) => [cell(`Row ${i + 1}`), cell(String(i * 3.7)), cell('m')]),
      ],
    },
  },
  placement: { position: 'here' },
};

interface Fill { x: number; y: number; w: number; h: number; style: string }
type Matrix = { a: number; b: number; c: number; d: number; e: number; f: number };

/** Paint page 1 on a recording context whose current transform is `m`. */
function paintFills(m: Matrix | undefined): Fill[] {
  const doc = buildDocument({ markdown: '::resource{id="t"}\n', resources: [resource] }, config);
  const fills: Fill[] = [];
  const ctx: Record<string | symbol, unknown> = new Proxy({}, {
    get(target: Record<string | symbol, unknown>, key) {
      if (key === 'fillRect') return (x: number, y: number, w: number, h: number) => { fills.push({ x, y, w, h, style: String(target.fillStyle) }); };
      if (key === 'getTransform') return () => m;
      if (key === 'measureText') return (s: string) => ({ width: s.length * 7 });
      if (key in target) return target[key];
      return () => undefined;
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  renderPageToCanvas(doc.pages[0]!, doc, canvas);
  return fills.filter((f) => f.style === HEADER || f.style === BODY);
}

const device = (m: Matrix, x: number, y: number) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f });
const isWhole = (v: number) => Math.abs(v - Math.round(v)) < 1e-6;

// EF-64. Two cell fills that meet on a fractional device pixel are each
// anti-aliased there, and the page shows through the shared pixel: a faint
// seam between cells of the same colour. The canvas snaps each fill's
// edges to device pixels, so neighbours meet on a pixel boundary.
describe('table cell fills on canvas (EF-64)', () => {
  it('snaps every cell fill to device pixels, neighbours meeting edge to edge', () => {
    const m: Matrix = { a: 0.3719, b: 0, c: 0, d: 0.3719, e: 13.37, f: 7.77 };
    const fills = paintFills(m);
    expect(fills.filter((f) => f.style === HEADER)).toHaveLength(3);
    expect(fills.filter((f) => f.style === BODY)).toHaveLength(15);
    const boxes = fills.map((f) => {
      const p0 = device(m, f.x, f.y);
      const p1 = device(m, f.x + f.w, f.y + f.h);
      return { x0: p0.x, y0: p0.y, x1: p1.x, y1: p1.y };
    });
    for (const b of boxes) {
      for (const v of [b.x0, b.y0, b.x1, b.y1]) expect(isWhole(v)).toBe(true);
    }
    // Same row: each fill starts where the one before it ends.
    const rows = new Map<number, typeof boxes>();
    for (const b of boxes) rows.set(Math.round(b.y0), [...(rows.get(Math.round(b.y0)) ?? []), b]);
    expect(rows.size).toBe(6);
    for (const row of rows.values()) {
      row.sort((p, q) => p.x0 - q.x0);
      for (let i = 1; i < row.length; i++) expect(row[i]!.x0).toBeCloseTo(row[i - 1]!.x1, 6);
    }
    // Consecutive rows: each starts where the one above ends.
    const tops = [...rows.keys()].sort((p, q) => p - q);
    for (let i = 1; i < tops.length; i++) {
      expect(rows.get(tops[i]!)![0]!.y0).toBeCloseTo(rows.get(tops[i - 1]!)![0]!.y1, 6);
    }
  });

  it('snaps under a quarter turn too (rotated tables)', () => {
    const m: Matrix = { a: 0, b: 0.4123, c: -0.4123, d: 0, e: 900.3, f: 11.1 };
    for (const f of paintFills(m)) {
      const p0 = device(m, f.x, f.y);
      const p1 = device(m, f.x + f.w, f.y + f.h);
      for (const v of [p0.x, p0.y, p1.x, p1.y]) expect(isWhole(v)).toBe(true);
    }
  });

  it('leaves the fills as laid out when the transform is not axis-aligned or unknown', () => {
    const plain = paintFills(undefined);
    const skewed = paintFills({ a: 0.3, b: 0.1, c: -0.1, d: 0.3, e: 1, f: 2 });
    expect(skewed).toEqual(plain);
    expect(plain.some((f) => !isWhole(f.x) || !isWhole(f.w))).toBe(true);
  });
});

// The HTML and PDF backends cannot snap: each opaque fill runs across the
// edge it shares with a neighbour painted after it, so the edge's pixels
// are covered by one shape and the later cell's anti-aliased edge blends
// over the earlier fill, not over the page (EF-64).
describe('tableCellFillRects (EF-64)', () => {
  const box = (x: number, y: number, width: number, height: number): BoundingBox => ({ x, y, width, height });
  const vcell = (rect: BoundingBox, isHeader = false): VDTResourceTableCell =>
    ({ rect, isHeader, lines: [], row: 0, col: 0, rowSpan: 1, colSpan: 1 } as unknown as VDTResourceTableCell);
  const inside = (r: BoundingBox, outer: BoundingBox) =>
    r.x >= outer.x - 1e-9 && r.y >= outer.y - 1e-9
    && r.x + r.width <= outer.x + outer.width + 1e-9 && r.y + r.height <= outer.y + outer.height + 1e-9;
  const a = box(0, 0, 10.3, 5.2);
  const b = box(10.3, 0, 10.3, 5.2);
  const c = box(0, 5.2, 10.3, 5.2);
  const d = box(10.3, 5.2, 10.3, 5.2);
  const grid = (body = BODY) => ({ cells: [vcell(a, true), vcell(b, true), vcell(c), vcell(d)], headerBackground: HEADER, bodyBackground: body });

  const union = (p: BoundingBox, q: BoundingBox): BoundingBox => {
    const x = Math.min(p.x, q.x);
    const y = Math.min(p.y, q.y);
    return box(x, y, Math.max(p.x + p.width, q.x + q.width) - x, Math.max(p.y + p.height, q.y + q.height) - y);
  };

  it('runs each opaque fill across the edge it shares with a later neighbour, never past the two cells', () => {
    const fills = tableCellFillRects(grid());
    expect(fills.map((f) => f.fill)).toEqual([HEADER, HEADER, BODY, BODY]);
    expect(fills.map((f) => f.rects.length)).toEqual([3, 2, 2, 1]);
    // A: its rect, then a strip over its edge with B (half of the narrower
    // cell each side) and one over its edge with C.
    expect(fills[0]!.rects).toEqual([a, box(5.15, 0, 10.3, 5.2), box(0, 2.6, 10.3, 5.2)]);
    expect(inside(fills[0]!.rects[1]!, union(a, b))).toBe(true);
    expect(inside(fills[0]!.rects[2]!, union(a, c))).toBe(true);
    expect(inside(fills[1]!.rects[1]!, union(b, d))).toBe(true);
    expect(inside(fills[2]!.rects[1]!, union(c, d))).toBe(true);
  });

  it('keeps translucent fills to their own cell', () => {
    const fills = tableCellFillRects(grid('#eef3fa80'));
    expect(fills.map((f) => f.rects.length)).toEqual([2, 1, 1, 1]);
  });

  it('follows spanning cells along the part of the edge they share', () => {
    const tall = box(0, 0, 10, 10.4);
    const top = box(10, 0, 10, 5.2);
    const low = box(10, 5.2, 10, 5.2);
    const fills = tableCellFillRects({ cells: [vcell(tall), vcell(top), vcell(low)], bodyBackground: BODY });
    expect(fills[0]!.rects.slice(1)).toEqual([box(5, 0, 10, 5.2), box(5, 5.2, 10, 5.2)]);
    // A later cell to the left (a row-spanning one painted after) is run under too.
    const left = tableCellFillRects({ cells: [vcell(top), vcell(tall)], bodyBackground: BODY });
    expect(left[0]!.rects.slice(1)).toEqual([box(5, 0, 10, 5.2)]);
  });

  it('paints the strips in the HTML, each cell before the neighbours it runs under', () => {
    const doc = buildDocument({ markdown: '::resource{id="t"}\n', resources: [resource] }, config);
    const html = renderToHtml(doc);
    const header = (html.match(new RegExp(`background:${HEADER};`, 'g')) ?? []).length;
    const body = (html.match(new RegExp(`background:${BODY};`, 'g')) ?? []).length;
    // 3 header cells: two with a strip right and one below, the last one below.
    expect(header).toBe(3 + 2 * 2 + 1);
    // 15 body cells in 5 rows of 3: strips right (10) and below (12).
    expect(body).toBe(15 + 10 + 12);
  });
});
