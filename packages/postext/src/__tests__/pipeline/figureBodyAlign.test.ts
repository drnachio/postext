import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import type { PostextConfig, Resource, ResourcePlacement, VDTBlock, VDTDocument } from '../../index';

// EF-98: a figure body narrower than its slot — shrunk by
// `layout.fitFiguresToPage`, or a bitmap smaller than the column — sits in
// the slot per `placement.align`, like a float narrowed by `placement.width`.
// The caption and note keep the slot's measure.

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
const FIT: PostextConfig = { ...PAGE, layout: { ...PAGE.layout, fitFiguresToPage: true } };

/** A portrait plate: at the 600 px measure it stands 900 px tall. */
const plate = (placement: ResourcePlacement, bitmap = { width: 2000, height: 3000 }): Resource => ({
  id: 'plate',
  typeId: 'figure',
  kind: 'bitmap',
  caption: 'A tall plate.',
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: 'f', format: 'jpeg', ...bitmap },
  placement,
});

const figure = (doc: VDTDocument): VDTBlock => {
  for (const page of doc.pages) {
    for (const b of [...page.columns.flatMap((c) => c.blocks), ...(page.floats ?? [])]) {
      if (b.type === 'resource') return b;
    }
  }
  throw new Error('no figure placed');
};

/** The body's left edge on the page and the free room beside it. */
const bodyOf = (b: VDTBlock) => {
  const body = b.resourceBlock!.bodyRect;
  return { left: b.bbox.x + body.x, width: body.width, room: b.bbox.width - body.width };
};

describe('EF-98: a narrowed figure body follows placement.align', () => {
  it('centres a body shrunk by fitFiguresToPage', () => {
    const b = figure(buildDocument({ markdown: '::resource{id="plate"}', resources: [plate({ position: 'here', align: 'center' })] }, FIT));
    const { left, width, room } = bodyOf(b);
    expect(width).toBeLessThan(600);
    expect(room).toBeGreaterThan(100);
    expect(left - b.bbox.x).toBeCloseTo(room / 2, 5);
    // The caption keeps the column's measure: it starts at the slot's edge.
    expect(b.resourceBlock!.captionLines[0]!.bbox.x).toBeCloseTo(b.bbox.x, 5);
  });

  it('sets it flush right with align: right', () => {
    const b = figure(buildDocument({ markdown: '::resource{id="plate"}', resources: [plate({ position: 'here', align: 'right' })] }, FIT));
    const { left, width } = bodyOf(b);
    expect(left + width).toBeCloseTo(b.bbox.x + b.bbox.width, 5);
  });

  it('keeps it flush left by default (unchanged output)', () => {
    const b = figure(buildDocument({ markdown: '::resource{id="plate"}', resources: [plate({ position: 'here' })] }, FIT));
    expect(bodyOf(b).left).toBeCloseTo(b.bbox.x, 5);
  });

  it('aligns a float\'s shrunk body too', () => {
    const b = figure(buildDocument({ markdown: 'See :ref{id="plate"}.', resources: [plate({ position: 'top', align: 'center' })] }, FIT));
    const { left, room } = bodyOf(b);
    expect(room).toBeGreaterThan(100);
    expect(left - b.bbox.x).toBeCloseTo(room / 2, 5);
  });

  it('aligns a bitmap narrower than its column', () => {
    const small = plate({ position: 'here', align: 'center' }, { width: 300, height: 100 });
    const b = figure(buildDocument({ markdown: '::resource{id="plate"}', resources: [small] }, PAGE));
    const { left, width } = bodyOf(b);
    expect(width).toBeCloseTo(300, 5);
    expect(left - b.bbox.x).toBeCloseTo(150, 5);
  });

  it('aligns inside a slot narrowed by placement.width', () => {
    // Half the column (300 px), centred; the 200 px bitmap centred in it.
    const small = plate({ position: 'here', width: 0.5, align: 'center' }, { width: 200, height: 100 });
    const b = figure(buildDocument({ markdown: '::resource{id="plate"}', resources: [small] }, PAGE));
    const { left, width } = bodyOf(b);
    expect(width).toBeCloseTo(200, 5);
    expect(left - b.bbox.x).toBeCloseTo(150 + 50, 5);
  });
});
