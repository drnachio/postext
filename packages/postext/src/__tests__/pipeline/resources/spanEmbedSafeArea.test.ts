import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import type { VDTBlock, VDTDocument } from '../../../vdt.js';
import type { PostextConfig, Resource, ResourceSafeArea } from '../../../types.js';

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

const config = (layoutType: 'double' | 'single'): PostextConfig => ({
  page: { width: mm(160), height: mm(240), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType },
  headings: { balancing: { enabled: false }, levels: [{ level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' } }] },
});

const hero = (height: number, safeArea?: ResourceSafeArea): Resource => ({
  id: 'hero', typeId: 'figure', kind: 'bitmap', caption: 'Una nebulosa.', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: 'hero.jpg', format: 'jpeg', width: 1000, height },
  placement: { position: 'here', span: 'page' },
  ...(safeArea ? { safeArea } : {}),
});

const MD = ['# Capítulo', '', '::resource{id="hero"}', '', filler(12)].join('\n');

const build = (r: Resource, layoutType: 'double' | 'single' = 'double'): VDTDocument =>
  buildDocument({ markdown: MD, resources: [r] }, config(layoutType), createMeasurementCache());

const heroBlock = (doc: VDTDocument): VDTBlock => doc.blocks.find((b) => b.type === 'resource')!;

const SAFE: ResourceSafeArea = { x: 0, y: 0.1, width: 1, height: 0.8 };

describe('a page-span embed at position here with a safe area (#1364)', () => {
  for (const layoutType of ['double', 'single'] as const) {
    it(`is cropped to the room under the opener rather than moved on (${layoutType})`, () => {
      // Without a safe area the picture is a little too tall for the room
      // under the opener and moves to the next page.
      const plain = heroBlock(build(hero(2350), layoutType));
      expect(plain.pageIndex).toBe(1);
      // With one, it is cropped top and bottom and stays under the opener.
      const doc = build(hero(2350, SAFE), layoutType);
      const fig = heroBlock(doc);
      expect(fig.pageIndex).toBe(0);
      const page = doc.pages[0]!;
      expect(fig.bbox.y + fig.bbox.height).toBeLessThanOrEqual(page.contentArea.y + page.contentArea.height + 0.5);
      const rb = fig.resourceBlock!;
      expect(rb.bodyRect.width).toBeCloseTo(plain.resourceBlock!.bodyRect.width, 3);
      expect(rb.bodyRect.height).toBeLessThan(plain.resourceBlock!.bodyRect.height);
      expect(rb.bodySource!.height).toBeLessThan(1);
      expect(rb.bodySource!.height).toBeGreaterThanOrEqual(SAFE.height - 1e-6);
      // On a two-column page the box keeps the widow minimum of text under
      // it; in a one-column flow it fills the room, as a column embed does.
      if (layoutType === 'double') expect(doc.blocks.some((b) => b.type === 'paragraph' && b.pageIndex === 0)).toBe(true);
    });
  }

  it('still moves on when the crop the safe area allows is not enough', () => {
    const doc = build(hero(2350, { x: 0, y: 0.01, width: 1, height: 0.98 }));
    const fig = heroBlock(doc);
    expect(fig.pageIndex).toBe(1);
    expect(fig.resourceBlock!.bodySource).toBeUndefined();
  });
});
