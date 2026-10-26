import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { elementsForSource } from '../../../composed/sourceMap.js';
import type { PageTemplate } from '../../../composed/types.js';
import type { PostextConfig, Resource, VDTDocument, VDTPage } from '../../../index.js';

// #990: a label near the spine of a spread stands at the binding band's edge,
// on the side of its anchor point, instead of being cut by the fold.

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

const mm = (value: number) => ({ value, unit: 'mm' as const });
const PAGE: PostextConfig = {
  page: { width: mm(200), height: mm(260), margins: { top: mm(20), bottom: mm(20), left: mm(20), right: mm(20) } } as never,
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] } as never,
  resourceTypes: [{ id: 'map', name: 'Map', shortLabel: '', numberingTemplate: '', resetOn: 'never', counterFormat: 'decimal', captionPrefix: '', defaultPlacement: { position: 'here' } }] as never,
};
const spreadTemplate = (gutter?: number): PageTemplate => ({
  id: 'atlas',
  spread: true,
  ...(gutter !== undefined ? { gutter: mm(gutter) } : {}),
  frames: [
    { name: 'map', crossGutter: true, placement: { anchor: { to: 'container', edge: 'top-left' } } },
    { name: 'text', flow: true, width: mm(160), placement: { anchor: { to: '#map', edge: 'below' } } },
  ],
});
const mapOf = (anchors: Resource['anchors']): Resource => ({
  id: 'relief', typeId: 'map', kind: 'svg', createdAt: 0, updatedAt: 0,
  svg: { fileId: 'relief.svg', width: 3600, height: 1500 },
  anchors,
} as Resource);
const MD = [
  '::::page{template="atlas" spread}',
  'A text under the map.',
  '',
  ':::figure{resource="relief" slot="map"}',
  '::label[Stone bridge across the river]{at="bridge"}',
  ':::',
  '::::',
].join('\n');

const build = (anchors: Resource['anchors'], extra: PostextConfig = {}, gutter?: number): VDTDocument =>
  buildDocument({ markdown: MD, resources: [mapOf(anchors)] }, { ...PAGE, ...extra, pageTemplates: [spreadTemplate(gutter)] }, createMeasurementCache());
const pages = (doc: VDTDocument): VDTPage[] => doc.pages.filter((p) => p.composed?.spread);
const labelRect = (doc: VDTDocument) => {
  for (const page of pages(doc)) {
    const c = page.composed!;
    for (const m of elementsForSource(doc, c.sourceStart!, c.sourceEnd!)) {
      if (m.pageIndex === page.index && m.element.level === 'label') return { page, rect: m.element.rect! };
    }
  }
  throw new Error('no label');
};

for (const [name, extra] of [['left to right', {}], ['right to left', { direction: 'rtl' }]] as const) {
  describe(`a label near the spine, ${name} (#990)`, () => {
    it('moves a label that straddles the spine to the side of its anchor', () => {
      // Anchor at 49.5 % of the width: left of the spine of a map that fills the sheet.
      const doc = build([{ id: 'bridge', x: 0.495, y: 0.5 }], extra as PostextConfig);
      const { page, rect } = labelRect(doc);
      expect(page.composed!.spread).toBeDefined();
      // Whole inside its page, not cut: its box is within the page's width.
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(page.width + 0.01);
    });

    it('keeps the label whole on the page of its anchor for anchors on either side', () => {
      for (const x of [0.495, 0.505]) {
        const doc = build([{ id: 'bridge', x, y: 0.5 }], extra as PostextConfig);
        const { page, rect } = labelRect(doc);
        // The picture is drawn in the flow's frame: the anchor left of the spine is on the
        // flow's first page, the left one of a left-to-right book, the right one when mirrored.
        const [left, right] = pages(doc);
        const rtl = 'direction' in extra;
        const expected = (x < 0.5) !== rtl ? left : right;
        expect(page).toBe(expected);
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.width).toBeLessThanOrEqual(page.width + 0.01);
      }
    });
  });
}

describe('the binding band (#990)', () => {
  it('leaves a gutter between the label and the spine', () => {
    const doc = build([{ id: 'bridge', x: 0.49, y: 0.5 }], {}, 10);
    const { page, rect } = labelRect(doc);
    const gutterPx = (10 / 25.4) * 96;
    // The first page is the left one: its label ends before the band starts.
    expect(rect.x + rect.width).toBeLessThanOrEqual(page.width - gutterPx / 2 + 0.6);
  });

  it('leaves a label alone when the anchor says gutter cross', () => {
    const kept = build([{ id: 'bridge', x: 0.5, y: 0.5 }]);
    const crossed = build([{ id: 'bridge', x: 0.5, y: 0.5, gutter: 'cross' }]);
    const a = labelRect(kept);
    const b = labelRect(crossed);
    // Centred on the spine, the label is wider than either side keeps: left alone, it
    // is read on the page of its centre and reaches past that page's edge.
    expect(b.rect.x + b.rect.width).toBeGreaterThan(b.page.width + 0.5);
    expect(a.rect.x + a.rect.width).toBeLessThanOrEqual(a.page.width + 0.01);
  });

  it('does not move a label that is clear of the band', () => {
    const doc = build([{ id: 'bridge', x: 0.2, y: 0.5 }]);
    const base = build([{ id: 'bridge', x: 0.2, y: 0.5, gutter: 'cross' }]);
    expect(labelRect(doc).rect).toEqual(labelRect(base).rect);
  });
});
