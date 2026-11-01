import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/index.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { collectColumnGaps } from '../../../pipeline/columns/columnBalancing/columnGaps.js';
import type { PostextConfig, Resource, VDTDocument } from '../../../index.js';

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
const paras = (n: number, per: number): string =>
  Array.from({ length: n }, () => Array.from({ length: per }, () => SENTENCE).join(' ')).join('\n\n');
const mm = (value: number) => ({ value, unit: 'mm' as const });

/** Two-column page, 23 lines a column. */
const TWO_COL: PostextConfig = {
  page: { width: mm(160), height: mm(120), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'double' },
};

const picture = (id: string, height: number, span: 'page' | 'column'): Resource => ({
  id,
  typeId: 'figure',
  kind: 'bitmap',
  caption: `Figura ${id}.`,
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: `${id}.png`, format: 'png', width: 1000, height },
  placement: { position: 'here', span },
});

/** A box floated to the head of the first column, a page-wide picture set
 *  in the text under it (a span block cutting the page in two bands), and
 *  a column picture too tall for the room left in the lower band: that
 *  band's first column ends short. */
const MD = [
  [':::callout{placement="top" title="Ficha"}', SENTENCE, SENTENCE, ':::'].join('\n'),
  paras(1, 1),
  '::resource{id="wide"}',
  paras(1, 1),
  '::resource{id="col"}',
  paras(4, 3),
].join('\n\n');

const build = (): VDTDocument =>
  buildDocument({ markdown: MD, resources: [picture('wide', 300, 'page'), picture('col', 500, 'column')] }, TWO_COL, createMeasurementCache());

describe('balancing under a page-span block below a column-head float (#1368)', () => {
  it('offers no after-float room to the columns under the span block', () => {
    const doc = build();
    const page = doc.pages[0]!;
    // The setup: the box heads the first column, the picture spans the
    // page under it, and a band of columns follows.
    const box = (page.floats ?? []).find((f) => f.type === 'callout');
    const span = page.columns.find((c) => c.kind === 'span' && c.bbox.height > 0.5);
    expect(box).toBeDefined();
    expect(span).toBeDefined();
    expect(span!.bbox.y).toBeGreaterThanOrEqual(box!.bbox.y + box!.bbox.height - 0.5);
    const lower = page.columns.filter((c) => c.kind !== 'span' && (c.band ?? 0) > 0);
    expect(lower.length).toBeGreaterThan(0);
    // The box stands over the band above the span block, not over the
    // columns under it: no room goes between them and the box.
    for (const g of collectColumnGaps(doc, new Set())) {
      const col = doc.pages[g.pageIndex]!.columns[g.columnIndex]!;
      if ((col.band ?? 0) === 0) continue;
      expect(g.candidates.filter((c) => c.kind === 'afterFloat'), `page ${g.pageIndex} column ${g.columnIndex}`).toHaveLength(0);
    }
  }, 60_000);

  it('converges: no lever the pass cannot apply keeps the balancing going', () => {
    expect(build().converged).toBe(true);
  }, 60_000);
});
