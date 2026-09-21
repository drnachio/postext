import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { createMeasurementCache } from '../../measure';
import type { PostextConfig, PostextContent, Resource, VDTBlock, VDTColumn, VDTDocument, VDTPage } from '../../index';

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
const BODY_PX = (8 * 300) / 72;
const GRID = BODY_PX * 1.5;

const SENTENCE =
  'La linterna del faro debe permanecer encendida toda la noche para guiar a los barcos que cruzan la bahía. ';
const filler = (n: number): string => SENTENCE.repeat(n).trim();
const paras = (n: number): string => Array.from({ length: n }, () => filler(1)).join('\n\n');

const mm = (value: number) => ({ value, unit: 'mm' as const });

/** Two-column page, ~23 grid lines tall. */
const TWO_COL: PostextConfig = {
  headings: { balancing: { enabled: false } },
  page: { width: mm(160), height: mm(120), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'double' },
};

function build(md: string, resources?: Resource[], config: PostextConfig = TWO_COL): VDTDocument {
  const content: PostextContent = resources ? { markdown: md, resources } : { markdown: md };
  return buildDocument(content, config, createMeasurementCache());
}

const frames = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.type === 'callout');
const textColumns = (page: VDTPage): VDTColumn[] => page.columns.filter((c) => c.kind !== 'span' && c.kind !== 'side');
const spanColumns = (page: VDTPage): VDTColumn[] => page.columns.filter((c) => c.kind === 'span');
const paragraphsOn = (doc: VDTDocument, page: number): VDTBlock[] =>
  doc.blocks.filter((b) => b.type === 'paragraph' && b.pageIndex === page && b.containerId === undefined);

const BOX = [':::callout{span="page" placement="top" title="Recuerda"}', filler(1), ':::'].join('\n');

const figure = (id: string, height: number, position: 'top' | 'bottom' = 'bottom'): Resource => ({
  id,
  typeId: 'figure',
  kind: 'bitmap',
  caption: `Figura ${id}.`,
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: `${id}.png`, format: 'png', width: 1000, height },
  placement: { position, span: 'page' },
});

describe('floated callouts (placement: top / bottom)', () => {
  it('a top page-span box floats to the head of the next page and the text after it fills the page it left', () => {
    const doc = build(['Intro.', '', BOX, '', paras(14)].join('\n'));
    const [frame] = frames(doc);
    expect(frame).toBeDefined();
    // Not a span block: no span column anywhere, the frame is a float.
    for (const p of doc.pages) expect(spanColumns(p)).toHaveLength(0);
    expect(frame!.pageIndex).toBe(1);
    const page1 = doc.pages[1]!;
    expect(page1.floats).toContain(frame);
    expect(frame!.bbox.y).toBeCloseTo(page1.contentArea.y, 5);
    expect(frame!.bbox.width).toBeCloseTo(page1.contentArea.width, 5);
    // Its children left the flow with it.
    for (const child of doc.blocks.filter((b) => b.containerId === frame!.containerId && b !== frame)) {
      expect(child.pageIndex).toBe(1);
      expect(page1.floats).toContain(child);
    }
    // The text columns of page 1 open under the band, on the grid.
    for (const col of textColumns(page1)) {
      expect(col.bbox.y).toBeGreaterThanOrEqual(frame!.bbox.y + frame!.bbox.height - 0.01);
      const lines = (col.bbox.y - page1.contentArea.y) / GRID;
      expect(Math.abs(lines - Math.round(lines))).toBeLessThan(1e-6);
    }
    // Page 0 is full of the text that follows the box in reading order.
    const page0Paras = paragraphsOn(doc, 0);
    expect(page0Paras.length).toBeGreaterThan(4);
    expect(page0Paras.some((b) => b.contentIndex! > frame!.contentIndex!)).toBe(true);
    // And the box keeps its source range.
    expect(frame!.sourceStart).toBeLessThan(frame!.sourceEnd!);
  });

  it('a bottom page-span box takes the foot of the current page when it fits', () => {
    const doc = build(['Intro.', '', ':::callout{span="page" placement="bottom"}', filler(1), ':::', '', paras(2)].join('\n'));
    const [frame] = frames(doc);
    const page = doc.pages[0]!;
    expect(frame!.pageIndex).toBe(0);
    expect(page.floats).toContain(frame);
    expect(frame!.bbox.y + frame!.bbox.height).toBeLessThanOrEqual(page.contentArea.y + page.contentArea.height + 0.01);
    for (const col of textColumns(page)) expect(col.bbox.y + col.bbox.height).toBeLessThanOrEqual(frame!.bbox.y + 0.01);
    expect(paragraphsOn(doc, 0).length).toBe(3);
  });

  it('a side box keeps stacking beside the text: placement top does not float it', () => {
    const config: PostextConfig = {
      ...TWO_COL,
      layout: { layoutType: 'oneAndHalf', gutterWidth: mm(6), sideColumnPercent: 30, sideColumnRole: 'floats', sideColumnSide: 'right' },
      calloutStyles: [{ id: 'key', name: 'Key', title: 'Key', span: 'side', placement: 'top' }],
    };
    const doc = build(['Intro.', '', ':::callout{type="key"}', filler(1), ':::', '', paras(2)].join('\n'), undefined, config);
    const [frame] = frames(doc);
    const side = doc.pages[0]!.columns.find((c) => c.kind === 'side')!;
    expect(frame!.pageIndex).toBe(0);
    expect(frame!.bbox.x).toBeCloseTo(side.bbox.x, 5);
  });

  it('gallery page: a figure cited before the box takes the rest of the box\'s page instead of leaving a stranded line', () => {
    // Probe 1: the band the box takes at the head of page 1.
    const probe = build(['Intro.', '', BOX, '', paras(14)].join('\n'));
    const page1 = probe.pages[1]!;
    const boxBand = textColumns(page1)[0]!.bbox.y - page1.contentArea.y;
    const free = page1.contentArea.height - boxBand;
    // Probe 2: a page-span figure's float height for a known bitmap.
    const probe2 = build(['Intro :ref{id="f"}.', '', paras(14)].join('\n'), [figure('f', 500, 'top')]);
    const fb = probe2.pages.flatMap((p) => p.floats ?? []).find((b) => b.id === 'float-f')!;
    const width = probe2.pages[0]!.contentArea.width;
    // The bitmap is set at its own pixel size (narrower than the page).
    const captionPx = fb.bbox.height - 500;
    // A figure whose band (height + the float gap, on the grid) leaves less
    // than the three-line text minimum under the box but still fits the
    // page: a little under `free` less one grid line and the gap.
    const target = free - GRID - BODY_PX - 10;
    const bitmapH = Math.round(target - captionPx);
    expect(width).toBeGreaterThan(1000);
    // Page 0 is nearly full when the figure is cited (its band no longer
    // fits the foot) and the box follows at once: the box floats to the
    // head of page 1, the paragraphs after it fill page 0.
    const doc = build([paras(12), '', 'Cita :ref{id="f"}.', '', BOX, '', paras(14)].join('\n'), [figure('f', bitmapH)]);
    const [frame] = frames(doc);
    expect(frame!.pageIndex).toBe(1);
    const gallery = doc.pages[1]!;
    const fig = (gallery.floats ?? []).find((b) => b.id === 'float-f');
    expect(fig).toBeDefined();
    expect(fig!.bbox.y).toBeGreaterThan(frame!.bbox.y + frame!.bbox.height - 0.01);
    // No text between the bands: the page's text columns keep no room.
    for (const col of textColumns(gallery)) expect(col.availableHeight).toBe(0);
    expect(paragraphsOn(doc, 1)).toHaveLength(0);
    // Every paragraph after the box filled page 0; page 1 is the gallery.
    expect(doc.pages).toHaveLength(2);
  });
});
