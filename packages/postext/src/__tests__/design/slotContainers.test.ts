import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { computePageMetrics } from '../../pipeline/buildHelpers';
import { resolveAllConfig } from '../../pipeline/config';
import type { DesignElement, ElementAnchor, PostextConfig } from '../../types';
import type { VDTPage } from '../../vdt';

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

const base: PostextConfig = {
  page: {
    dpi: 72,
    width: pt(360),
    height: pt(480),
    margins: { top: pt(48), bottom: pt(60), left: pt(36), right: pt(36) },
  },
};
const withCutLines: PostextConfig = {
  page: { ...base.page, cutLines: { enabled: true, bleed: pt(14), markOffset: pt(6), markLength: pt(12) } },
};

const folio = (edge: ElementAnchor['edge'], y: number): DesignElement => ({
  kind: 'text',
  id: 'folio',
  content: '{pageNumber}',
  fontSize: pt(9),
  overflow: 'clip',
  placement: { anchor: { to: 'container', edge }, offset: { y: pt(y) }, size: { width: 'auto', height: 'auto' } },
});

/** A slot block's box relative to the page's trim box. */
const trimRelative = (config: PostextConfig, slot: 'header' | 'footer') => {
  const doc = buildDocument({ markdown: 'Some body text.' }, { ...config, [slot]: { elements: [slot === 'header' ? folio('top-left', 10) : folio('bottom-left', -10)] } });
  const { trimBox } = computePageMetrics(resolveAllConfig(config));
  const block = (doc.pages[0] as VDTPage)[slot]!.blocks[0]!;
  return { x: block.bbox.x - trimBox.x, y: block.bbox.y - trimBox.y, bottom: block.bbox.y + block.bbox.height - trimBox.y };
};

describe('header / footer slot containers', () => {
  it('a header anchored to its outer edge sits at the same trim position with cut lines on and off', () => {
    const off = trimRelative(base, 'header');
    const on = trimRelative(withCutLines, 'header');
    expect(off.y).toBeCloseTo(10, 6);
    expect(on.x).toBeCloseTo(off.x, 6);
    expect(on.y).toBeCloseTo(off.y, 6);
  });

  it('a footer anchored to its outer edge stays inside the trim box with bleed and marks', () => {
    const off = trimRelative(base, 'footer');
    const on = trimRelative(withCutLines, 'footer');
    expect(off.bottom).toBeLessThanOrEqual(480 - 10);
    expect(on.x).toBeCloseTo(off.x, 6);
    expect(on.y).toBeCloseTo(off.y, 6);
    expect(on.bottom).toBeCloseTo(off.bottom, 6);
  });

  it('body-facing anchors keep measuring from the body edge', () => {
    const doc = buildDocument(
      { markdown: 'Some body text.' },
      { ...withCutLines, header: { elements: [folio('bottom-left', -6)] }, footer: { elements: [folio('top-left', 6)] } },
    );
    const page = doc.pages[0]!;
    const area = page.contentArea;
    const head = page.header!.blocks[0]!.bbox;
    const foot = page.footer!.blocks[0]!.bbox;
    expect(head.y + head.height).toBeCloseTo(area.y - 6, 6);
    expect(foot.y).toBeCloseTo(area.y + area.height + 6, 6);
  });
});
