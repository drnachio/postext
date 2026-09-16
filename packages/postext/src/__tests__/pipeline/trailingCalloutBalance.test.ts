import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import type { PostextConfig } from '../../types';

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

/** Two-column page, ~23.6 grid lines tall. */
const page = (balancing: boolean): PostextConfig => ({
  headings: { balancing: { enabled: balancing } },
  page: { width: mm(160), height: mm(120), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'double' },
});

/** A column box of a few lines. */
const NOTE = [':::callout{title="Nota"}', filler(2), ':::'].join('\n');

/** Sixteen lines of text, the box (which ends the first column short of
 *  the page bottom — the heading after it keeps with its paragraph and
 *  moves on), then enough text to fill the second column and flow onto a
 *  second page. */
const md = [filler(16), '', NOTE, '', '## Sección', '', filler(9), '', filler(30)].join('\n');

describe('a callout closing a column', () => {
  it('takes the column gap above it so its foot meets the last grid line', () => {
    const plain = buildDocument({ markdown: md }, page(false), createMeasurementCache());
    const balanced = buildDocument({ markdown: md }, page(true), createMeasurementCache());
    const frameOf = (doc: typeof plain) => doc.blocks.find((b) => b.type === 'callout')!;
    const f0 = frameOf(plain);
    const f1 = frameOf(balanced);
    // Same column in both layouts, the box is its last block.
    expect(f0.pageIndex).toBe(0);
    expect(f1.pageIndex).toBe(0);
    expect(f1.columnIndex).toBe(f0.columnIndex);
    const col0 = plain.pages[0]!.columns[f0.columnIndex]!;
    const col1 = balanced.pages[0]!.columns[f1.columnIndex]!;
    expect(col0.blocks[col0.blocks.length - 1]!.containerId).toBe(f0.containerId);
    // The plain pass leaves a gap under the box; balancing pushes the box
    // down by it.
    const gapPlain = col0.bbox.y + col0.bbox.height - (f0.bbox.y + f0.bbox.height);
    expect(gapPlain).toBeGreaterThan(GRID - 0.01);
    expect(f1.bbox.y).toBeGreaterThan(f0.bbox.y + GRID - 0.01);
    const gapBalanced = col1.bbox.y + col1.bbox.height - (f1.bbox.y + f1.bbox.height);
    expect(gapBalanced).toBeLessThan(GRID);
    // The text above it did not move.
    const firstPara = (doc: typeof plain) => doc.blocks.find((b) => b.type === 'paragraph')!;
    expect(firstPara(balanced).bbox.y).toBeCloseTo(firstPara(plain).bbox.y, 5);
  }, 30000);
});
