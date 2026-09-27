import { describe, it, expect } from 'vitest';
import { layoutDesignSlot } from '../../design/layout';
import { resolveDesignSlot } from '../../defaults/headerFooter';
import { buildDocument } from '../../pipeline';
import type { DesignPlaceholderContext } from '../../design/placeholders';
import type { DesignElement, PostextConfig } from '../../types';
import type { VDTDesignRuleBlock, VDTPage } from '../../vdt';

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

const DPI = 72; // 1pt = 1px keeps the arithmetic readable.
const stubPage = { index: 0, pageLabel: '1' } as unknown as VDTPage;
const placeholders: DesignPlaceholderContext = {
  kind: 'header', page: stubPage, allPages: [stubPage], metadata: {}, chapterTitleByPageIndex: [],
};

// A rule written as the docs allow: no thickness, no colour, no direction.
const bareRule = { kind: 'rule', id: 'r', placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: 'fill' } } } as unknown as DesignElement;

describe('a design rule without thickness or colour (EF-136)', () => {
  it('resolves to the documented 0.5 pt, black, horizontal', () => {
    const [el] = resolveDesignSlot({ elements: [bareRule] }).elements;
    expect(el).toMatchObject({ kind: 'rule', direction: 'horizontal', thickness: { value: 0.5, unit: 'pt' }, color: { hex: '#000000' } });
  });

  it('lays out a line 0.5 pt thick across its room', () => {
    const { primitives } = layoutDesignSlot(
      resolveDesignSlot({ elements: [bareRule] }),
      { container: { x: 0, y: 0, width: 200, height: 40 }, dpi: DPI, placeholders },
      0,
    );
    expect(primitives[0]).toMatchObject({ kind: 'rule', width: 200, height: 0.5, thicknessPx: 0.5, color: '#000000' });
  });

  it('paints it in a heading design', () => {
    const config: PostextConfig = {
      page: { dpi: 72 },
      layout: { layoutType: 'single' },
      headings: {
        levels: [{
          level: 1,
          span: 'page',
          breakBefore: { enabled: false, parity: 'any' },
          advancedDesign: {
            enabled: true,
            slot: { elements: [{ kind: 'rule', id: 'r', color: { hex: '#000000', model: 'hex' }, placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: 'fill' } } } as unknown as DesignElement] },
          },
        }],
      },
    };
    const doc = buildDocument({ markdown: '# Title\n\nBody.' }, config);
    const rule = doc.pages[0]!.openerBand?.blocks.find((b): b is VDTDesignRuleBlock => b.kind === 'rule');
    expect(rule?.thicknessPx).toBeCloseTo(0.5, 6);
    expect(rule?.bbox.height).toBeCloseTo(0.5, 6);
  });

  it('keeps a thickness and colour that are set', () => {
    const [el] = resolveDesignSlot({ elements: [{ ...bareRule, thickness: { value: 2, unit: 'pt' }, color: { hex: '#ff0000', model: 'hex' } } as DesignElement] }).elements;
    expect(el).toMatchObject({ thickness: { value: 2, unit: 'pt' }, color: { hex: '#ff0000' } });
  });
});
