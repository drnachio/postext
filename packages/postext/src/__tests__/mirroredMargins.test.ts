import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline';
import { computePageMetrics, contentAreaForPage, mirrorContentArea } from '../pipeline/buildHelpers';
import { resolveAllConfig } from '../pipeline/config';
import type { PostextConfig, Resource } from '../types';

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

/** Small page with asymmetric inner/outer margins so mirroring is visible. */
const mirrored: PostextConfig = {
  page: {
    width: pt(360),
    height: pt(240),
    margins: { top: pt(18), bottom: pt(18), left: pt(40), right: pt(10), mirror: true },
  },
};

const filler = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    `Paragraph ${i} with enough words to consume vertical space and force the column and page to overflow onto following pages.`,
  ).join('\n\n');

const figure = (id: string, placement?: Resource['placement']): Resource => ({
  id,
  typeId: 'figure',
  kind: 'bitmap',
  caption: `Figure ${id}.`,
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: `${id}.png`, format: 'png', width: 400, height: 300 },
  ...(placement ? { placement } : {}),
});

describe('mirrored margins — geometry helpers', () => {
  it('mirrorContentArea flips the area about the page centre line', () => {
    const area = { x: 40, y: 18, width: 310, height: 204 };
    const m = mirrorContentArea(area, 360);
    expect(m).toEqual({ x: 10, y: 18, width: 310, height: 204 });
    // Involution: mirroring twice restores the original.
    expect(mirrorContentArea(m, 360)).toEqual(area);
  });

  it('contentAreaForPage mirrors even pages only when mirror is on', () => {
    const resolved = resolveAllConfig(mirrored);
    const metrics = computePageMetrics(resolved);
    const odd = contentAreaForPage(metrics, resolved, 0);
    const even = contentAreaForPage(metrics, resolved, 1);
    expect(odd).toEqual(metrics.contentArea);
    expect(even.x).not.toBe(odd.x);
    expect(even.width).toBe(odd.width);
    expect(even.y).toBe(odd.y);

    const plain = resolveAllConfig({ ...mirrored, page: { ...mirrored.page, margins: { ...mirrored.page!.margins, mirror: false } } });
    const plainMetrics = computePageMetrics(plain);
    expect(contentAreaForPage(plainMetrics, plain, 1)).toEqual(plainMetrics.contentArea);
  });

  it('exposes trim and bleed boxes; bleed equals trim without cut lines', () => {
    const resolved = resolveAllConfig(mirrored);
    const metrics = computePageMetrics(resolved);
    expect(metrics.trimBox).toEqual({ x: 0, y: 0, width: metrics.trimWidthPx, height: metrics.trimHeightPx });
    expect(metrics.bleedBox).toEqual(metrics.trimBox);

    const withBleed = resolveAllConfig({
      ...mirrored,
      page: { ...mirrored.page, cutLines: { enabled: true, bleed: pt(9), markOffset: pt(3), markLength: pt(6) } },
    });
    const bm = computePageMetrics(withBleed);
    const dpi = withBleed.page.dpi;
    const bleedPx = 9 * dpi / 72;
    expect(bm.trimBox.x).toBeCloseTo(bm.trimOffset, 6);
    expect(bm.bleedBox.x).toBeCloseTo(bm.trimOffset - bleedPx, 6);
    expect(bm.bleedBox.width).toBeCloseTo(bm.trimWidthPx + 2 * bleedPx, 6);
  });
});

describe('mirrored margins — built documents', () => {
  it('even pages mirror the content area and their columns', () => {
    const doc = buildDocument({ markdown: filler(30) }, { ...mirrored, layout: { layoutType: 'double' } });
    expect(doc.pages.length).toBeGreaterThanOrEqual(2);
    const p0 = doc.pages[0]!;
    const p1 = doc.pages[1]!;
    const resolved = resolveAllConfig(mirrored);
    const metrics = computePageMetrics(resolved);

    expect(p0.contentArea).toEqual(metrics.contentArea);
    expect(p1.contentArea).toEqual(mirrorContentArea(metrics.contentArea, metrics.pageWidthPx));

    // Columns derive from the page's own area.
    expect(p0.columns[0]!.bbox.x).toBeCloseTo(p0.contentArea.x, 6);
    expect(p1.columns[0]!.bbox.x).toBeCloseTo(p1.contentArea.x, 6);
    const p1Right = p1.columns[1]!.bbox.x + p1.columns[1]!.bbox.width;
    expect(p1Right).toBeCloseTo(p1.contentArea.x + p1.contentArea.width, 6);
    // Inner margin (40pt) is on the left of odd pages and on the right of even pages.
    expect(p1.contentArea.x).toBeLessThan(p0.contentArea.x);
  });

  it('page-span floats on even pages use the mirrored x', () => {
    const doc = buildDocument(
      {
        markdown: `${filler(6)}\n\nSee :ref{id="f1"}.\n\n${filler(30)}`,
        resources: [figure('f1', { position: 'top', span: 'page' })],
      },
      { ...mirrored, layout: { layoutType: 'double' } },
    );
    const placed = doc.pages.flatMap((p) => (p.floats ?? []).map((b) => ({ page: p, block: b })));
    expect(placed).toHaveLength(1);
    const { page, block } = placed[0]!;
    expect(block.bbox.x).toBeCloseTo(page.contentArea.x, 6);
    expect(block.bbox.width).toBeCloseTo(page.contentArea.width, 6);
    // The float lands on an even page (index 1), i.e. a mirrored one.
    expect(page.index % 2).toBe(1);
    expect(page.contentArea.x).not.toBe(doc.pages[0]!.contentArea.x);
  });

  it('header container follows page.contentArea on mirrored pages', () => {
    const doc = buildDocument(
      { markdown: filler(30), metadata: { title: 'Book' } },
      {
        ...mirrored,
        header: {
          elements: [{
            kind: 'text', id: 'title', content: '{title}', fontSize: pt(8), overflow: 'ellipsis-end',
            placement: { anchor: { to: 'container', edge: 'bottom-left' }, size: { width: 'auto', height: 'auto' } },
          }],
        },
      },
    );
    const p0 = doc.pages[0]!;
    const p1 = doc.pages[1]!;
    expect(p0.header?.bbox.x).toBeCloseTo(p0.contentArea.x, 6);
    expect(p1.header?.bbox.x).toBeCloseTo(p1.contentArea.x, 6);
    expect(p1.header!.bbox.x).not.toBe(p0.header!.bbox.x);
    // The bottom-left anchored text moves with the container.
    expect(p1.header!.blocks[0]!.bbox.x).toBeCloseTo(p1.contentArea.x, 6);
  });

  it('mirror:false leaves every page with the same content area', () => {
    const cfg: PostextConfig = {
      ...mirrored,
      page: { ...mirrored.page, margins: { ...mirrored.page!.margins, mirror: false } },
    };
    const doc = buildDocument({ markdown: filler(30) }, cfg);
    expect(doc.pages.length).toBeGreaterThanOrEqual(2);
    for (const p of doc.pages) expect(p.contentArea).toEqual(doc.pages[0]!.contentArea);
  });
});
