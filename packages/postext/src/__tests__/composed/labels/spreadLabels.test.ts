import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { flowToPage, renderPageToCanvas } from '../../../index.js';
import { elementsForSource, sourceAt } from '../../../composed/sourceMap.js';
import { composedPaintOrder } from '../../../composed/paint.js';
import type { PageTemplate } from '../../../composed/types.js';
import type { PostextConfig, Resource, VDTBlock, VDTDocument, VDTPage } from '../../../index.js';

// #876 (R3, the school atlas): a map across the spine of a spread, its
// labels on both halves, in a left-to-right and a right-to-left book.

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
const SPREAD: PageTemplate = {
  id: 'atlas',
  spread: true,
  frames: [
    { name: 'map', crossGutter: true, placement: { anchor: { to: 'container', edge: 'top-left' } } },
    { name: 'text', flow: true, width: mm(160), placement: { anchor: { to: '#map', edge: 'below' } } },
  ],
};
const MAP: Resource = {
  id: 'relief', typeId: 'map', kind: 'svg', createdAt: 0, updatedAt: 0,
  svg: { fileId: 'relief.svg', width: 3600, height: 1500 },
  anchors: [{ id: 'west', x: 0.2, y: 0.5 }, { id: 'east', x: 0.8, y: 0.5 }],
} as Resource;
const MD = [
  '::::page{template="atlas" spread}',
  'A text under the map.',
  '',
  ':::figure{resource="relief" slot="map"}',
  '::label[West]{at="west"}',
  '::label[East]{at="east"}',
  ':::',
  '::::',
].join('\n');

const build = (extra: PostextConfig = {}): VDTDocument =>
  buildDocument({ markdown: MD, resources: [MAP] }, { ...PAGE, ...extra, pageTemplates: [SPREAD] }, createMeasurementCache());
const spreadPages = (doc: VDTDocument): [VDTPage, VDTPage] => doc.pages.filter((p) => p.composed?.spread) as [VDTPage, VDTPage];
const labelsOn = (doc: VDTDocument, page: VDTPage) => {
  const c = page.composed!;
  return elementsForSource(doc, c.sourceStart!, c.sourceEnd!).filter((m) => m.pageIndex === page.index && m.element.level === 'label');
};
const mapBlocks = (page: VDTPage): VDTBlock[] => {
  const frame = page.composed!.frames.find((f) => f.name === 'map')!;
  return frame.facingBlocks ?? frame.blockIds.map((id) => page.floats!.find((b) => b.id === id)!).filter(Boolean);
};

for (const [name, extra] of [['left to right', {}], ['right to left', { direction: 'rtl' }]] as const) {
  describe(`figure labels on a map across the spine, ${name} (#876)`, () => {
    const doc = build(extra as PostextConfig);
    const pages = spreadPages(doc);

    it('lists each label on the one page that paints it, inside that page, and finds it there again', () => {
      const found = new Map<string, number>();
      for (const page of pages) {
        for (const { element } of labelsOn(doc, page)) {
          const r = element.rect!;
          expect(found.has(element.id)).toBe(false);
          found.set(element.id, page.index);
          // Inside the page's part of the sheet, not on the facing page.
          expect(r.x).toBeGreaterThanOrEqual(0);
          expect(r.x + r.width).toBeLessThanOrEqual(page.width);
          // sourceAt reads sheet points; the label's box is in the flow frame on a
          // right-to-left page (#929).
          const at = element.flow ? flowToPage(page, r.x + r.width / 2, r.y + r.height / 2) : { x: r.x + r.width / 2, y: r.y + r.height / 2 };
          const chain = sourceAt(doc, page.index, at.x, at.y);
          expect(chain.find((e) => e.level === 'label')?.id).toBe(element.id);
        }
      }
      expect([...found.keys()].sort()).toEqual(['cp0:map:label:east', 'cp0:map:label:west']);
      // The two labels stand on different pages, the half of the picture each is drawn on.
      expect(new Set(found.values()).size).toBe(2);
    });

    it('sets the facing half’s labels as the half that reads them, its run order and turn included', () => {
      const [reading, facing] = pages[0]!.composed!.frames.find((f) => f.name === 'map')!.facingBlocks ? [pages[1]!, pages[0]!] : [pages[0]!, pages[1]!];
      const own = mapBlocks(reading).find((b) => b.resourceBlock)!.resourceBlock!.labels!;
      const copy = mapBlocks(facing).find((b) => b.resourceBlock)!.resourceBlock!.labels!;
      expect(copy.map((l) => l.layout!.x)).toEqual(own.map((l) => l.layout!.x));
      expect(copy.every((l) => l.rect !== undefined)).toBe(true);
    });
  });
}

describe('a title frame over the decoration of a right-to-left page (#876)', () => {
  const t: PageTemplate = {
    id: 'sheet',
    frames: [
      { name: 'title', takes: 'h1', placement: { anchor: { to: 'container', edge: 'top-left' } } },
      { name: 'under', layer: -1, width: mm(40), height: mm(10), placement: { anchor: { to: 'container', edge: 'bottom-left' } } },
    ],
    decoration: { elements: [{ kind: 'box', id: 'band', style: { backgroundColor: { hex: '#1d5f73', model: 'hex' } },
      placement: { anchor: { to: 'bleed', edge: 'top-left' }, size: { width: 'fill', height: mm(50) } } }] } as never,
  };
  const md = '::::page{template="sheet"}\n# Title on the band\n\n:::frame{slot="under"}\nUnder the band\n:::\n::::\n';

  for (const [name, extra] of [['left to right', {}], ['right to left', { direction: 'rtl' }]] as const) {
    it(`${name}: paints the frames under layer 0, the band, then the title`, () => {
      const doc = buildDocument({ markdown: md }, { ...PAGE, ...extra, pageTemplates: [t] } as PostextConfig, createMeasurementCache());
      const page = doc.pages.find((p) => p.composed)!;
      expect(composedPaintOrder(page, 'below').map((i) => i.kind === 'frame' && i.frame.name)).toEqual(['under']);
      expect(composedPaintOrder(page, 'above').map((i) => i.kind === 'frame' && i.frame.name)).toEqual(['title']);
      const ops: string[] = [];
      const ctx = new Proxy({} as Record<string | symbol, unknown>, {
        get(target, key) {
          if (key === 'measureText') return (s: string) => ({ width: s.length * 7 });
          if (key === 'fillText') return (s: string) => { ops.push(`text:${s}`); };
          if (key === 'fillRect' || key === 'fill') return () => { if (String(target.fillStyle).toLowerCase() === '#1d5f73') ops.push('fill:band'); };
          if (key in target) return target[key];
          return () => undefined;
        },
        set(target, key, value) { target[key] = value; return true; },
      });
      renderPageToCanvas(page, doc, { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement);
      const at = (op: string) => ops.indexOf(op);
      expect(at('text:Under the band')).toBeGreaterThanOrEqual(0);
      expect(at('fill:band')).toBeGreaterThan(at('text:Under the band'));
      expect(at('text:Title on the band')).toBeGreaterThan(at('fill:band'));
    });
  }
});
