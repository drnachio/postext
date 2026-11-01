import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/index.js';
import { createMeasurementCache } from '../../../measure/index.js';
import type { BoundingBox, PostextConfig, Resource, VDTDocument } from '../../../index.js';

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

const SENTENCE = 'La linterna del faro debe permanecer encendida toda la noche para guiar a los barcos que cruzan la bahía.';
const paras = (n: number): string => Array.from({ length: n }, () => SENTENCE).join('\n\n');
const mm = (value: number) => ({ value, unit: 'mm' as const });

/** Two-column page, 23 lines a column. */
const TWO_COL: PostextConfig = {
  headings: { balancing: { enabled: false } },
  page: { width: mm(160), height: mm(120), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'double' },
};

const figure = (citingPage: boolean): Resource => ({
  id: 'fig',
  typeId: 'figure',
  kind: 'bitmap',
  caption: 'Figura.',
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: 'fig.png', format: 'png', width: 1000, height: 300 },
  placement: { position: 'top', span: 'page', citingPage },
});

/** A column box floated to the head of the next free column, written at the
 *  foot of page 0 (so it heads page 1's first column), and a page-wide
 *  figure cited near the head of page 1's second column. */
const MD = [
  paras(44),
  [':::callout{placement="top" title="Ficha"}', SENTENCE, SENTENCE, ':::'].join('\n'),
  paras(2),
  `${SENTENCE} Vea la figura (:ref{id="fig"}). ${SENTENCE}`,
  paras(80),
].join('\n\n');

const build = (citingPage: boolean): VDTDocument =>
  buildDocument({ markdown: MD, resources: [figure(citingPage)] }, TWO_COL, createMeasurementCache());

const intersects = (a: BoundingBox, b: BoundingBox): boolean =>
  a.x < b.x + b.width - 0.5 && a.x + a.width > b.x + 0.5 && a.y < b.y + b.height - 0.5 && a.y + a.height > b.y + 0.5;

describe('a citingPage page-span top float on a page a column box heads (#1366)', () => {
  it('takes the band above both columns; the box and the text go under it', () => {
    const doc = build(true);
    const page = doc.pages[1]!;
    const fig = (page.floats ?? []).find((f) => f.resourceBlock?.resource.id === 'fig');
    const box = (page.floats ?? []).find((f) => f.type === 'callout');
    expect(fig).toBeDefined();
    expect(box).toBeDefined();
    expect(fig!.bbox.y).toBeCloseTo(page.contentArea.y, 0);
    expect(box!.bbox.y).toBeGreaterThanOrEqual(fig!.bbox.y + fig!.bbox.height - 0.5);
    // Nothing of either column, nor the box, runs under the figure.
    expect(intersects(box!.bbox, fig!.bbox)).toBe(false);
    for (const c of page.columns) {
      expect(c.bbox.y).toBeGreaterThanOrEqual(fig!.bbox.y + fig!.bbox.height - 0.5);
      for (const b of c.blocks) expect(intersects(b.bbox, fig!.bbox), `${b.id} in column ${c.index}`).toBe(false);
    }
  }, 60_000);

  it('without citingPage the figure goes on to the next page, as before', () => {
    const doc = build(false);
    expect(doc.pages[2]!.floats?.some((f) => f.resourceBlock?.resource.id === 'fig')).toBe(true);
  }, 60_000);
});
