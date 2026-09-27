import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import { resolveHeadingsConfig, stripHeadingsDefaults } from '../../defaults';
import type { PostextConfig, ColumnBalancingConfig } from '../../types';
import type { VDTBlock, VDTDocument } from '../../vdt';

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

// Default 300 dpi: body 8pt → 33.33px, grid (1.5em) → 50px.
const GRID = ((8 * 300) / 72) * 1.5;
const SENTENCE =
  'La linterna del faro debe permanecer encendida toda la noche para guiar a los barcos que cruzan la bahía. ';
const filler = (n: number): string => SENTENCE.repeat(n).trim();
const mm = (value: number) => ({ value, unit: 'mm' as const });

const config = (balancing: ColumnBalancingConfig = {}): PostextConfig => ({
  headings: { balancing },
  page: { width: mm(160), height: mm(120), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'double' },
});

// The first column: two sections and a note that annotates the text above
// it and closes the column about three lines short (the heading after it
// keeps with its paragraph and moves on) — the EF-105 shape.
const NOTE = [':::callout{title="Nota"}', filler(2), ':::'].join('\n');
const md = ['## Uno', '', filler(3), '', '## Dos', '', filler(5), '', NOTE, '', '## Sección', '', filler(9), '', filler(30)].join('\n');

const build = (balancing?: ColumnBalancingConfig): VDTDocument =>
  buildDocument({ markdown: md }, config(balancing), createMeasurementCache());
const frame = (doc: VDTDocument): VDTBlock => doc.blocks.find((b) => b.type === 'callout')!;
const heading = (doc: VDTDocument, text: string): VDTBlock =>
  doc.blocks.find((b) => b.type === 'heading' && b.lines[0]?.text.includes(text))!;
const lines = (px: number | undefined): number => (px ?? 0) / GRID;
/** Room between the box's foot and the foot of its column. */
const roomUnder = (doc: VDTDocument): number => {
  const f = frame(doc);
  const col = doc.pages[f.pageIndex!]!.columns[f.columnIndex!]!;
  return col.bbox.y + col.bbox.height - (f.bbox.y + f.bbox.height);
};

describe('headings.balancing.closingBox (EF-105)', () => {
  it('defaults to first, and is stripped when first', () => {
    expect(resolveHeadingsConfig().balancing.closingBox).toBe('first');
    expect(resolveHeadingsConfig({ balancing: { closingBox: 'last' } }).balancing.closingBox).toBe('last');
    // Any other value reads as the default.
    expect(resolveHeadingsConfig({ balancing: { closingBox: 'never' as ColumnBalancingConfig['closingBox'] } }).balancing.closingBox).toBe('first');
    expect(stripHeadingsDefaults({ balancing: { closingBox: 'first' } })).toBeUndefined();
    expect(stripHeadingsDefaults({ balancing: { closingBox: 'off' } })).toEqual({ balancing: { closingBox: 'off' } });
  });

  it('first: the box takes the whole gap before the headings get a line (1.4 behaviour)', () => {
    const plain = build({ enabled: false });
    const doc = build();
    expect(build({ closingBox: 'first' }).pages.map((p) => p.columns.map((c) => c.blocks.map((b) => b.bbox.y)))).toEqual(
      doc.pages.map((p) => p.columns.map((c) => c.blocks.map((b) => b.bbox.y))),
    );
    // Non-vacuous: the plain pass leaves more than two lines under the box.
    expect(lines(roomUnder(plain))).toBeGreaterThan(2);
    expect(frame(doc).balancing?.levers).toEqual(['trailingCallout']);
    expect(lines(frame(doc).balancing?.spaceAbove)).toBeGreaterThan(2);
    expect(heading(doc, 'Dos').balancing).toBeUndefined();
  });

  it('last: the heading takes the whole lines, the box only what they leave', () => {
    const plain = build({ enabled: false });
    const doc = build({ closingBox: 'last' });
    const dos = heading(doc, 'Dos');
    expect(dos.balancing?.levers).toEqual(['heading']);
    expect(lines(dos.balancing?.spaceAbove)).toBeCloseTo(2, 6);
    // The box moves down with the text above it, and takes the fraction of
    // a line left under it: its foot meets the last grid slot all the same.
    const f = frame(doc);
    expect(lines(f.balancing?.spaceAbove)).toBeGreaterThan(0);
    expect(lines(f.balancing?.spaceAbove)).toBeLessThan(1);
    expect(roomUnder(doc)).toBeCloseTo(roomUnder(build()), 3);
    // Nothing moved to another column.
    expect(f.pageIndex).toBe(frame(plain).pageIndex);
    expect(f.columnIndex).toBe(frame(plain).columnIndex);
  });

  it('off: the box never moves; the headings take the whole lines', () => {
    const plain = build({ enabled: false });
    const doc = build({ closingBox: 'off' });
    expect(frame(doc).balancing).toBeUndefined();
    expect(lines(heading(doc, 'Dos').balancing?.spaceAbove)).toBeCloseTo(2, 6);
    // The fraction of a line under the box stays.
    expect(lines(roomUnder(doc))).toBeGreaterThan(lines(roomUnder(build())));
    expect(lines(roomUnder(doc))).toBeCloseTo(lines(roomUnder(plain)) - 2, 3);
  });
});
