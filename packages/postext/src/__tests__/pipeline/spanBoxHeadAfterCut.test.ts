import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import type { PostextConfig, Resource } from '../../types';

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
const mm = (value: number) => ({ value, unit: 'mm' as const });

/** Two-column page, ~23.6 grid lines tall, with a splittable page-span
 *  barrier box style (a chapter's "key points"). */
const CFG: PostextConfig = {
  headings: { balancing: { enabled: true } },
  page: { width: mm(160), height: mm(120), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'double' },
  calloutStyles: [{ id: 'key', name: 'Key', span: 'page', floatBarrier: true, keepTogether: false }],
};

/** A column figure ~12 lines tall with its caption. */
const figure: Resource = {
  id: 'f1',
  typeId: 'figure',
  kind: 'bitmap',
  caption: 'Conceptos clave de la CIF y del marco de trabajo y su relación.',
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: 'f1.png', format: 'png', width: 1400, height: 1000 },
};

/** Three one-line items: a box of a few lines. */
const SMALL_BOX = [':::callout{type="key" title="Puntos clave"}', '- Uno.', '- Dos.', '- Tres.', ':::'].join('\n');

/** Six two-line items: too tall to fit whole under the figure. */
const KEY_POINTS = [':::callout{type="key" title="Puntos clave"}', ...Array.from({ length: 6 }, () => `- ${filler(4)}`), ':::'].join('\n');

/** Page 0 fills with text; on page 1 the closing text takes nine lines of
 *  the first column, the figure the head of the second, then the box. */
const md = [filler(49), '', filler(5), '', 'En la :ref{id="f1"} se resumen los conceptos clave.', '', KEY_POINTS, '', '## BIBLIOGRAFÍA', '', filler(6)].join('\n');

describe('a splittable span box after text beside a column figure', () => {
  it('a short closing text beside a much taller figure: the box cuts under both on the same page', () => {
    // Eight lines of text in the first column, a ~15-line figure heading the
    // second: no cut can level them, so a box that fits goes under both.
    const short = [filler(49), '', filler(5), '', 'En la :ref{id="f1"} se resumen los conceptos clave.', '', SMALL_BOX, '', '## BIBLIOGRAFÍA', '', filler(6)].join('\n');
    const tall: Resource = { ...figure, bitmap: { fileId: 'f1.png', format: 'png', width: 1400, height: 1100 } };
    const doc = buildDocument({ markdown: short, resources: [tall] }, CFG, createMeasurementCache());
    const page = doc.pages[1]!;
    const fl = (page.floats ?? []).find((f) => f.resourceBlock?.resource.id === 'f1')!;
    expect(fl).toBeDefined();
    expect(fl.bbox.y).toBeCloseTo(page.contentArea.y, 5);
    const head = doc.blocks.find((b) => b.type === 'callout')!;
    expect(head.pageIndex).toBe(1);
    expect(page.columns[head.columnIndex]!.kind).toBe('span');
    expect(head.bbox.y).toBeGreaterThanOrEqual(fl.bbox.y + fl.bbox.height - 1e-6);
  }, 30000);

  it('a box that does not fit under text and figure moves on; the figure keeps its page beside the text', () => {
    const short = [filler(49), '', filler(5), '', 'En la :ref{id="f1"} se resumen los conceptos clave.', '', KEY_POINTS, '', '## BIBLIOGRAFÍA', '', filler(6)].join('\n');
    const tall: Resource = { ...figure, bitmap: { fileId: 'f1.png', format: 'png', width: 1400, height: 1500 } };
    const doc = buildDocument({ markdown: short, resources: [tall] }, CFG, createMeasurementCache());
    const page = doc.pages[1]!;
    const fl = (page.floats ?? []).find((f) => f.resourceBlock?.resource.id === 'f1')!;
    expect(fl).toBeDefined();
    expect(fl.bbox.y).toBeCloseTo(page.contentArea.y, 5);
    // The text stays on the page beside it.
    expect(page.columns.some((c) => c.kind !== 'span' && c.blocks.length > 0)).toBe(true);
    const head = doc.blocks.find((b) => b.type === 'callout')!;
    expect(head.pageIndex).toBe(2);
  }, 30000);

  it('cuts the band under the text and figure and opens there, the rest on the next page', () => {
    const doc = buildDocument({ markdown: md, resources: [figure] }, CFG, createMeasurementCache());
    const page = doc.pages[1]!;
    // The figure floats at the head of the second column.
    const fl = (page.floats ?? []).find((f) => f.resourceBlock?.resource.id === 'f1')!;
    expect(fl).toBeDefined();
    expect(fl.bbox.y).toBeCloseTo(page.contentArea.y, 5);
    // The box's head is a span column on that page, under the figure.
    const frames = doc.blocks.filter((b) => b.type === 'callout');
    expect(frames.length).toBe(2);
    const head = frames.find((f) => f.callout?.part === 0 || f.callout?.part === undefined) ?? frames[0]!;
    expect(head.pageIndex).toBe(1);
    expect(page.columns[head.columnIndex]!.kind).toBe('span');
    expect(head.bbox.y).toBeGreaterThanOrEqual(fl.bbox.y + fl.bbox.height - 1e-6);
    // The rest continues on page 2, the bibliography after it.
    const rest = frames.find((f) => f !== head)!;
    expect(rest.pageIndex).toBe(2);
    expect(rest.callout?.part).toBe(1);
    const heading = doc.blocks.find((b) => b.type === 'heading')!;
    expect(heading.pageIndex).toBe(2);
    expect(heading.bbox.y).toBeGreaterThan(rest.bbox.y);
  }, 30000);
});
