import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import type { VDTBlock, VDTColumn, VDTDocument, VDTPage } from '../../vdt';
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

const SENTENCE =
  'La linterna del faro debe permanecer encendida toda la noche para guiar a los barcos que cruzan la bahía. ';
const filler = (n: number): string => SENTENCE.repeat(n).trim();
const words = (n: number): string => Array.from({ length: n }, (_, i) => `palabra${i % 7}`).join(' ');

const mm = (value: number) => ({ value, unit: 'mm' as const });

/** Two-column page, ~23 grid lines tall. */
const base = (keepWithNext: boolean): PostextConfig => ({
  headings: { balancing: { enabled: false }, keepWithNext },
  page: { width: mm(160), height: mm(120), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'double' },
});

/** A page-span box tall enough to leave only a short band under it, then a
 *  heading that opens a section of bibliography-like text. `n` words of
 *  filler inside the box tune the band's height. */
function markdown(n: number): string {
  return [
    filler(1),
    '',
    ':::callout{span="page" title="Puntos clave"}',
    words(n),
    ':::',
    '',
    '## Bibliografía',
    '',
    filler(3),
    '',
    filler(3),
    '',
  ].join('\n');
}

function build(md: string, keepWithNext: boolean): VDTDocument {
  return buildDocument({ markdown: md }, base(keepWithNext), createMeasurementCache());
}

const textColumns = (page: VDTPage, band: number): VDTColumn[] =>
  page.columns.filter((c) => c.kind !== 'span' && (c.band ?? 0) === band);
const heading = (doc: VDTDocument): VDTBlock | undefined => doc.blocks.find((b) => b.type === 'heading');
const bodyAfterHeading = (doc: VDTDocument): VDTBlock | undefined =>
  doc.blocks.find((b) => b.type === 'paragraph' && b.containerId === undefined && b.bbox.y > 0
    && b.contentIndex !== undefined && b.contentIndex > (heading(doc)?.contentIndex ?? -1));

/** Room under the heading in its column, in body grid lines, in a layout
 *  without keep-with-next (the oracle for what the band can hold). */
function roomUnderHeading(md: string): number {
  const loose = build(md, false);
  const h = heading(loose)!;
  expect(h.pageIndex).toBe(0);
  const page = loose.pages[0]!;
  expect(textColumns(page, 1).some((c) => c.index === h.columnIndex)).toBe(true);
  const col = page.columns[h.columnIndex]!;
  return (col.bbox.height - (h.bbox.y + h.bbox.height - col.bbox.y)) / loose.baselineGrid;
}

function expectHeadingOpensNextPage(md: string): void {
  const doc = build(md, true);
  const h = heading(doc)!;
  // The heading left page 0 and opens the next page with its text.
  expect(h.pageIndex).toBe(1);
  const body = bodyAfterHeading(doc)!;
  expect(body.pageIndex).toBe(1);
  expect(body.columnIndex).toBe(h.columnIndex);
  // The band under the box stays empty.
  for (const c of textColumns(doc.pages[0]!, 1)) expect(c.blocks).toHaveLength(0);
}

describe('heading opening a short band under a page-span box', () => {
  it('moves to the next page when fewer than the widow minimum of lines would follow it', () => {
    const md = markdown(336);
    const room = roomUnderHeading(md);
    expect(room).toBeGreaterThan(1);
    expect(room).toBeLessThan(2);
    expectHeadingOpensNextPage(md);
  }, 60_000);

  it('moves to the next page when the band cannot hold the heading at all', () => {
    const md = markdown(392);
    expect(roomUnderHeading(md)).toBeLessThan(0);
    expectHeadingOpensNextPage(md);
  }, 60_000);
});
