import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import type { PostextConfig, Resource } from '../../types';
import type { VDTDocument } from '../../vdt';

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

/** Two-column page, ~23.6 grid lines tall, balancing on. */
const CFG: PostextConfig = {
  headings: { balancing: { enabled: true } },
  page: { width: mm(160), height: mm(120), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'double' },
};

/** A page-span figure `height` px tall at 1400 px wide (≈ 1654 px placed). */
const figure = (height: number): Resource => ({
  id: 'f1',
  typeId: 'figure',
  kind: 'bitmap',
  caption: 'Escala de valoración.',
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: 'f1.png', format: 'png', width: 1400, height },
  placement: { span: 'page' },
});

/** ~7 grid lines at the page width. */
const KEY_POINTS = [':::callout{type="key" span="page" title="Puntos clave"}', filler(2), '', '- Uno.', '- Dos.', ':::'].join('\n');

/** Page 0 fills with text; the closing text (5 lines), the figure reference,
 *  the key-points box and a bibliography land on page 1 — the way a
 *  chapter closes in the reference book. */
const closing = (fig: Resource) => ({
  markdown: [filler(49), '', filler(2), '', 'Ver :ref{id="f1"} aquí.', '', KEY_POINTS, '', '## BIBLIOGRAFÍA', '', filler(6)].join('\n'),
  resources: [fig],
});

const build = (fig: Resource): VDTDocument =>
  buildDocument(closing(fig), CFG, createMeasurementCache());

const figureBlock = (doc: VDTDocument) => doc.blocks.find((b) => b.resourceBlock?.resource.id === 'f1');
const boxFrame = (doc: VDTDocument) => doc.blocks.find((b) => b.type === 'callout' && b.callout?.part === undefined || (b.type === 'callout' && b.callout?.part === 0))!;
const linesOf = (v: number, page: VDTDocument['pages'][number]) => (v - page.contentArea.y) / GRID;

describe('page-span figure before a page-span box', () => {
  it('cuts the band under the balanced text, sets the figure there and the box below it', () => {
    const doc = build(figure(340));
    const page = doc.pages[1]!;
    // The closing text is balanced across both columns of the first band.
    const band0 = page.columns.filter((c) => c.kind !== 'span' && (c.band ?? 0) === 0);
    expect(band0).toHaveLength(2);
    expect(band0.every((c) => c.blocks.length > 0)).toBe(true);
    const used = band0.map((c) => (c.bbox.height - c.availableHeight) / GRID);
    expect(Math.abs(used[0]! - used[1]!)).toBeLessThanOrEqual(1);
    // The figure is a span block on that page, right under the text — not a float.
    const fig = figureBlock(doc)!;
    expect(fig).toBeDefined();
    expect(fig.pageIndex).toBe(1);
    expect(page.columns[fig.columnIndex]!.kind).toBe('span');
    expect(page.floats ?? []).toHaveLength(0);
    const textBottom = Math.max(...band0.map((c) => c.bbox.y + (c.bbox.height - c.availableHeight)));
    expect(fig.bbox.y).toBeGreaterThanOrEqual(textBottom);
    expect(linesOf(fig.bbox.y, page) - linesOf(textBottom, page)).toBeLessThanOrEqual(2);
    // The box follows below the figure on the same page.
    const box = boxFrame(doc);
    expect(box.pageIndex).toBe(1);
    expect(box.bbox.y).toBeGreaterThanOrEqual(fig.bbox.y + fig.bbox.height);
    // Bibliography goes on after the box.
    const heading = doc.blocks.find((b) => b.type === 'heading')!;
    expect(heading.pageIndex).toBeGreaterThanOrEqual(1);
    expect(heading.bbox.y > box.bbox.y || heading.pageIndex > 1).toBe(true);
  }, 30000);

  it('a box that no longer fits under the figure moves on; the figure stays under the text', () => {
    // A taller figure (~15 lines): text 3 + figure 17 leave no room for the box.
    const doc = build(figure(620));
    const page = doc.pages[1]!;
    const fig = figureBlock(doc)!;
    expect(fig.pageIndex).toBe(1);
    expect(page.columns[fig.columnIndex]!.kind).toBe('span');
    const band0 = page.columns.filter((c) => c.kind !== 'span' && (c.band ?? 0) === 0);
    const textBottom = Math.max(...band0.map((c) => c.bbox.y + (c.bbox.height - c.availableHeight)));
    expect(fig.bbox.y).toBeGreaterThanOrEqual(textBottom);
    const box = boxFrame(doc);
    expect(box.pageIndex).toBe(2);
  }, 30000);

  it('a figure that cannot follow the levelled text opens the next page; the text still ends level', () => {
    // Twenty-one lines of closing text (one-line paragraphs) in one column
    // and a ~15-line figure: even balanced (11 + 10) the figure does not
    // fit under the text.
    const closingLines = Array.from({ length: 20 }, () => filler(1)).join('\n\n');
    const doc = buildDocument(
      {
        markdown: [filler(49), '', closingLines, '', 'Ver :ref{id="f1"} aquí.', '', KEY_POINTS, '', '## BIBLIOGRAFÍA', '', filler(6)].join('\n'),
        resources: [figure(620)],
      },
      { ...CFG, calloutStyles: [{ id: 'key', name: 'Key', span: 'page', floatBarrier: true, keepTogether: false }] },
      createMeasurementCache(),
    );
    const page1 = doc.pages[1]!;
    const band0 = page1.columns.filter((c) => c.kind !== 'span' && (c.band ?? 0) === 0);
    expect(band0).toHaveLength(2);
    expect(band0.every((c) => c.blocks.length > 0)).toBe(true);
    const used = band0.map((c) => (c.bbox.height - c.availableHeight) / GRID);
    expect(Math.abs(used[0]! - used[1]!)).toBeLessThanOrEqual(1);
    expect(page1.floats ?? []).toHaveLength(0);
    // The figure heads page 2 and the box follows it there.
    const fl = (doc.pages[2]!.floats ?? []).find((f) => f.resourceBlock?.resource.id === 'f1')!;
    expect(fl).toBeDefined();
    expect(fl.bbox.y).toBeCloseTo(doc.pages[2]!.contentArea.y, 5);
    const box = doc.blocks.find((b) => b.type === 'callout')!;
    expect(box.pageIndex).toBe(2);
    expect(box.bbox.y).toBeGreaterThanOrEqual(fl.bbox.y + fl.bbox.height - 1e-6);
  }, 30000);

  it('a column figure before a barrier box: the closing band levels with the figure counted, the figure under the text', () => {
    // Twenty one-line paragraphs, a column figure (~9 lines with its
    // caption) referenced by the last one, a ~10-line box: the band levels
    // at ~15 lines with the figure sitting under the shorter column's text.
    const closingLines = Array.from({ length: 19 }, () => filler(1)).join('\n\n');
    const columnFigure: Resource = {
      ...figure(700),
      placement: { span: 'column' },
    };
    const box = [':::callout{type="key" span="page" title="Puntos clave"}', ...Array.from({ length: 5 }, () => `- ${filler(3)}`), ':::'].join('\n');
    const doc = buildDocument(
      {
        markdown: [filler(49), '', closingLines, '', 'Ver :ref{id="f1"} aquí.', '', box, '', '## BIBLIOGRAFÍA', '', filler(6)].join('\n'),
        resources: [columnFigure],
      },
      { ...CFG, calloutStyles: [{ id: 'key', name: 'Key', span: 'page', floatBarrier: true, keepTogether: false }] },
      createMeasurementCache(),
    );
    const page1 = doc.pages[1]!;
    const fl = (page1.floats ?? []).find((f) => f.resourceBlock?.resource.id === 'f1')!;
    expect(fl, 'figure on the closing page').toBeDefined();
    const col = page1.columns[fl.columnIndex]!;
    // The figure hugs the text of its column (within a gap), not the page foot.
    const textBottom = col.bbox.y + (col.bbox.height - col.availableHeight);
    expect(fl.bbox.y - textBottom).toBeLessThanOrEqual(2 * GRID + 0.01);
    expect(fl.bbox.y + fl.bbox.height).toBeLessThan(page1.contentArea.y + page1.contentArea.height - 2 * GRID);
    // Text plus figure level with the other column within a line.
    const other = page1.columns.find((c) => c.kind !== 'span' && c !== col)!;
    const figBottom = fl.bbox.y + fl.bbox.height;
    const otherBottom = other.bbox.y + (other.bbox.height - other.availableHeight);
    expect(Math.abs(figBottom - otherBottom)).toBeLessThanOrEqual(1.5 * GRID);
    // The box follows below both (or on the next page when it does not fit).
    const boxFrame = doc.blocks.find((b) => b.type === 'callout')!;
    expect(boxFrame.pageIndex).toBeGreaterThanOrEqual(1);
    if (boxFrame.pageIndex === 1) expect(boxFrame.bbox.y).toBeGreaterThanOrEqual(figBottom - 0.01);
  }, 30000);

  it('without a following span box the figure keeps its float slot', () => {
    const doc = buildDocument(
      { markdown: [filler(49), '', filler(2), '', 'Ver :ref{id="f1"} aquí.', '', filler(6)].join('\n'), resources: [figure(340)] },
      CFG,
      createMeasurementCache(),
    );
    expect(figureBlock(doc)).toBeUndefined();
    expect(doc.pages.some((p) => (p.floats ?? []).length > 0)).toBe(true);
  }, 30000);
});
