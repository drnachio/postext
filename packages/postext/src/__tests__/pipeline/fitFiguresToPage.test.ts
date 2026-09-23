import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import type { PostextConfig, Resource, VDTDocument } from '../../index';

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

const px = (value: number) => ({ value, unit: 'px' as const });

/** A screen-like page: 600 × 400 px, no margins, one column. */
const PAGE: PostextConfig = {
  page: { dpi: 144, width: px(600), height: px(400), margins: { top: px(0), bottom: px(0), left: px(0), right: px(0) } },
  layout: { layoutType: 'single' },
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] },
};

/** A portrait plate: at the 600 px measure it stands 900 px tall. */
const plate: Resource = {
  id: 'plate',
  typeId: 'figure',
  kind: 'bitmap',
  caption: 'A tall plate.',
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: 'f', format: 'jpeg', width: 2000, height: 3000 },
  placement: { position: 'here' },
};

const para = (i: number) => `Paragraph ${i} carries enough words to take a few lines of the column so the flow advances.`;

const figure = (doc: VDTDocument) => {
  for (const page of doc.pages) {
    for (const col of page.columns) {
      for (const b of col.blocks) if (b.type === 'resource') return { page, block: b };
    }
  }
  throw new Error('no figure placed');
};

describe('layout.fitFiguresToPage', () => {
  it('leaves a figure taller than the page as it is by default', () => {
    const doc = buildDocument({ markdown: '::resource{id="plate"}', resources: [plate] }, PAGE);
    expect(figure(doc).block.bbox.height).toBeGreaterThan(400);
  });

  it('shrinks a figure until image and caption fit the page', () => {
    const config = { ...PAGE, layout: { ...PAGE.layout, fitFiguresToPage: true } };
    const doc = buildDocument({ markdown: '::resource{id="plate"}', resources: [plate] }, config);
    const { block } = figure(doc);
    expect(block.bbox.height).toBeLessThanOrEqual(400);
    const body = block.resourceBlock!.bodyRect;
    // Aspect kept: the image narrows as it shortens.
    expect(body.height / body.width).toBeCloseTo(1.5, 3);
    expect(body.width).toBeLessThan(600);
  });

  it('sets a figure a little too tall for the room left smaller to keep it with its text', () => {
    const wide: Resource = { ...plate, bitmap: { fileId: 'f', format: 'jpeg', width: 3000, height: 2000 } };
    // Two paragraphs, then a 400 px plate (at the 600 px measure) that the
    // rest of the page cannot hold at full size.
    const markdown = `${para(1)}\n\n${para(2)}\n\n::resource{id="plate"}\n\n${para(3)}`;
    const config = { ...PAGE, layout: { ...PAGE.layout, fitFiguresToPage: true } };
    const doc = buildDocument({ markdown, resources: [wide] }, config);
    const { page, block } = figure(doc);
    expect(page.index).toBe(0);
    expect(block.bbox.y + block.bbox.height).toBeLessThanOrEqual(400 + 0.5);
    // Only the image shrinks: the caption keeps the column's measure.
    expect(block.resourceBlock!.bodyRect.width).toBeLessThan(600);
    expect(block.resourceBlock!.bodyRect.width).toBeGreaterThanOrEqual(300);
    // Without the option the plate waits for the next page.
    expect(figure(buildDocument({ markdown, resources: [wide] }, PAGE)).page.index).toBe(1);
  });
});
