// #631: the Resources panel shows a bitmap's pixels, the resolution its
// file states, its natural print size and the effective ppi where the
// current layout places it, styled against the preflight thresholds.

import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildDocument, type PostextConfig, type Resource, type VDTDocument } from 'postext';
import { SandboxStoreContext } from '../../context/SandboxContext';
import { DEFAULT_LABELS } from '../../types/defaultLabels';
import { BitmapResolutionField } from './BitmapResolutionField';

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

const L = DEFAULT_LABELS;
const px = (value: number) => ({ value, unit: 'px' as const });

/** A 150 dpi page with a single column `width` px wide. */
const config = (width: number, extra: PostextConfig = {}): PostextConfig => ({
  page: { dpi: 150, width: px(width), height: px(3000), margins: { top: px(0), bottom: px(0), left: px(0), right: px(0) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  ...extra,
});

const photo = (bitmap: Partial<NonNullable<Resource['bitmap']>> = {}): Resource => ({
  id: 'photo', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: 'photo.jpg', format: 'jpeg', width: 2400, height: 1600, ...bitmap },
  placement: { position: 'here' },
});

function render(resource: Resource, cfg: PostextConfig): string {
  const doc: VDTDocument = buildDocument({ markdown: 'Text.\n\n::resource{id="photo"}', resources: [resource] }, cfg);
  const state = { config: cfg, resources: [resource], labels: L, locale: 'en', docVersion: 1 };
  const store = { getSnapshot: () => state, subscribe: () => () => {}, dispatch: () => {}, docRef: { current: doc } };
  return renderToString(
    h(SandboxStoreContext, { value: store as never },
      h(BitmapResolutionField, { bitmap: resource.bitmap!, onChange: () => {} })),
  );
}

const fill = (label: string, values: Record<string, string | number>) =>
  label.replace(/__(\w+)__/g, (m, k: string) => (k in values ? String(values[k]) : m));

describe('BitmapResolutionField', () => {
  it('shows the pixels, the file resolution and the natural size at the page dpi', () => {
    const html = render(photo({ fileResolution: 300 }), config(3000));
    expect(html).toContain('2400 × 1600 px · jpeg');
    expect(html).toContain(fill(L.resourceBitmapPpi, { ppi: 300 }));
    // 2400 px at 150 dpi: 406.4 mm.
    expect(html).toContain(fill(L.resourceBitmapNaturalSizeValue, { width: '406.4', height: '270.9', ppi: 150 }));
  });

  it('marks a file that states 72 ppi as read as unset, and one that states none', () => {
    expect(render(photo({ fileResolution: 72 }), config(3000))).toContain(fill(L.resourceBitmapFileResolutionPlaceholder, { ppi: 72 }));
    expect(render(photo(), config(3000))).toContain(L.resourceBitmapFileResolutionNone);
  });

  it('a declared resolution sets the natural size, and the placement prints at it', () => {
    const html = render(photo({ resolution: 300 }), config(3000));
    expect(html).toContain(fill(L.resourceBitmapNaturalSizeValue, { width: '203.2', height: '135.5', ppi: 300 }));
    expect(html).toContain(`>${fill(L.resourceBitmapPpi, { ppi: 300 })}<`);
    expect(html).not.toContain('var(--destructive)');
  });

  it('styles the effective ppi against the preflight thresholds', () => {
    // At its pixels on a 150 dpi page: 150 ppi, under the 300 minimum.
    const warning = render(photo(), config(3000));
    expect(warning).toContain(fill(L.resourceBitmapBelowMinimum, { min: 300 }));
    expect(warning).toContain('var(--brand)');
    // At 72 ppi the picture would be 5000 layout px wide; the 3000 px
    // column caps it at 20 in, so 2400 px print at 120 ppi, under the
    // critical 150.
    const critical = render(photo({ resolution: 72 }), config(3000));
    expect(critical).toContain(fill(L.resourceBitmapBelowCritical, { min: 150 }));
    expect(critical).toContain('var(--destructive)');
    // The Checks link only for a book set up for print.
    expect(warning).not.toContain(L.resourceBitmapOpenChecks);
    expect(render(photo(), config(3000, { print: { standard: 'pdfx4' } }))).toContain(L.resourceBitmapOpenChecks);
  });

  it("offers the file's resolution as a one-click fill", () => {
    expect(render(photo({ fileResolution: 300 }), config(3000))).toContain(fill(L.resourceBitmapResolutionFromFile, { ppi: 300 }));
    expect(render(photo({ fileResolution: 300, resolution: 300 }), config(3000))).not.toContain(fill(L.resourceBitmapResolutionFromFile, { ppi: 300 }));
  });
});
