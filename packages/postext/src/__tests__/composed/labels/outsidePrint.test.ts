import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { composedPaintOrder, composedReadingOrder } from '../../../composed/paint.js';
import { altWithLabels } from '../../../composed/labelText.js';
import { renderToHtmlIndexed } from '../../../html-backend/html-backend.js';
import type { PostextConfig, Resource, VDTBlock, VDTDocument } from '../../../index.js';

// #862: what the outputs that do not draw a composed page as print read
// from the VDT — a `:::figure`'s labels on its resource block, wherever the
// figure is set, and the frames in reading order.

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
};
const MAP: Resource = {
  id: 'mapa', typeId: 'figure', kind: 'bitmap', caption: 'Europe.', altText: 'A map of Europe', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: 'mapa.png', format: 'png', width: 400, height: 300 },
};
const FIGURE = [':::figure{resource="mapa"}', '::label[OCÉANO **ATLÁNTICO**]{at="atlantico" style="mar"}', '::label[Madrid]{at="40% 60%"}', ':::'].join('\n');

const build = (markdown: string, config: PostextConfig = {}, resources: Resource[] = [MAP]): VDTDocument =>
  buildDocument({ markdown, resources }, { ...PAGE, ...config }, createMeasurementCache());
const allBlocks = (doc: VDTDocument): VDTBlock[] => [...doc.blocks, ...doc.pages.flatMap((p) => p.floats ?? [])];
const figureBlock = (doc: VDTDocument): VDTBlock => allBlocks(doc).find((b) => b.resourceBlock?.resource.id === 'mapa')!;

describe('figure labels in the VDT (#862)', () => {
  it('carries a figure’s labels on its resource block, in the order written, with their source', () => {
    const md = `Some text.\n\n${FIGURE}\n`;
    const labels = figureBlock(build(md)).resourceBlock!.labels!;
    expect(labels.map((l) => l.text)).toEqual(['OCÉANO ATLÁNTICO', 'Madrid']);
    expect(labels[0]!.at).toEqual({ anchor: 'atlantico' });
    expect(labels[0]!.style).toBe('mar');
    expect(labels[1]!.at).toEqual({ x: 0.4, y: 0.6 });
    expect(md.slice(labels[1]!.sourceStart, labels[1]!.sourceEnd)).toBe('Madrid');
  });

  it('carries them on a figure that floats, and on one set in a frame', () => {
    const floated = build(`Some text.\n\n${FIGURE}\n`, {}, [{ ...MAP, placement: { position: 'top' } }]);
    const fb = figureBlock(floated);
    expect(fb.id.startsWith('float-')).toBe(true);
    expect(fb.resourceBlock!.labels!.map((l) => l.text)).toEqual(['OCÉANO ATLÁNTICO', 'Madrid']);
    const framed = build(`::::page{template="t"}\n${FIGURE.replace('resource="mapa"', 'resource="mapa" slot="map"')}\n::::\n`, { pageTemplates: [{ id: 't', frames: [{ name: 'map' }] }] });
    expect(framed.pages[0]!.composed).toBeDefined();
    expect(figureBlock(framed).resourceBlock!.labels!.map((l) => l.text)).toEqual(['OCÉANO ATLÁNTICO', 'Madrid']);
  });

  it('leaves a resource set with ::resource without labels, after a labelled layout of it in the same cache', () => {
    const cache = createMeasurementCache();
    const labelled = buildDocument({ markdown: `${FIGURE}\n`, resources: [MAP] }, PAGE, cache);
    expect(figureBlock(labelled).resourceBlock!.labels).toHaveLength(2);
    const plain = buildDocument({ markdown: '::resource{id="mapa"}\n', resources: [MAP] }, PAGE, cache);
    expect(figureBlock(plain).resourceBlock!.labels).toBeUndefined();
  });
});

describe('the reading order of a composed page (#862)', () => {
  it('puts the decoration first, then the frames by the Markdown order of their content, whatever their layers', () => {
    const config: PostextConfig = {
      pageTemplates: [{
        id: 't',
        frames: [
          { name: 'late', layer: 3 },
          { name: 'early', layer: -1, placement: { anchor: { to: 'container', edge: 'bottom-left' } } },
          { name: 'middle', layer: 1, placement: { anchor: { to: 'container', edge: 'left' } } },
        ],
      }],
    };
    const md = ['::::page{template="t"}', ':::frame{slot="early"}', 'Early.', ':::', '', ':::frame{slot="middle"}', 'Middle.', ':::', '', ':::frame{slot="late"}', 'Late.', ':::', '::::'].join('\n');
    const page = build(md, config).pages[0]!;
    const paint = composedPaintOrder(page);
    const name = (i: (typeof paint)[number]) => (i.kind === 'frame' ? i.frame.name : 'decoration');
    expect(paint.map(name)).toEqual(['early', 'decoration', 'middle', 'late']);
    expect(composedReadingOrder(paint).map(name)).toEqual(['decoration', 'early', 'middle', 'late']);
  });

  it('reads a chained frame after the frame its story starts in', () => {
    const config: PostextConfig = {
      pageTemplates: [{
        id: 't',
        frames: [
          { name: 'b', layer: -2, height: mm(30), placement: { anchor: { to: 'container', edge: 'bottom-left' } } },
          { name: 'a', next: 'b', height: mm(12) },
        ],
      }],
    };
    const md = ['::::page{template="t"}', ':::frame{slot="a"}', Array.from({ length: 90 }, (_, i) => `w${i}`).join(' '), ':::', '::::'].join('\n');
    const page = build(md, config).pages[0]!;
    const paint = composedPaintOrder(page);
    const frames = paint.filter((i) => i.kind === 'frame');
    expect(frames.find((i) => i.frame.name === 'b')!.frame.continuedFrom).toBeDefined();
    const name = (i: (typeof paint)[number]) => (i.kind === 'frame' ? i.frame.name : 'decoration');
    expect(paint.map(name).filter((n) => n !== 'decoration')).toEqual(['b', 'a']);
    expect(composedReadingOrder(paint).map(name).filter((n) => n !== 'decoration')).toEqual(['a', 'b']);
  });
});

describe('labels as a figure\'s text (#862)', () => {
  const labels = (...texts: string[]) => texts.map((text) => ({ text }));
  it('follows the alternative text, in the order written', () => {
    expect(altWithLabels('A map', labels('Madrid', ' Mar  Negro '))).toBe('A map (Madrid, Mar Negro)');
    expect(altWithLabels('', labels('Madrid'))).toBe('Madrid');
    expect(altWithLabels('A map', undefined)).toBe('A map');
  });

  it('takes the brackets and the comma of Chinese, Japanese and Arabic labels', () => {
    expect(altWithLabels('地图', labels('北京', '上海'))).toBe('地图（北京、上海）');
    expect(altWithLabels('地図', labels('東京'))).toBe('地図（東京）');
    expect(altWithLabels('خريطة', labels('القاهرة', 'دمشق'))).toBe('خريطة (القاهرة، دمشق)');
  });

  it('is the alternative text of the picture in the HTML viewer, for the labels not drawn on it (#860)', () => {
    // The map has no anchor `atlantico`: that label is not drawn and stays
    // in the alt; Madrid, placed by percentages, is drawn as text.
    const html = renderToHtmlIndexed(build(`${FIGURE}\n`), { resourceImageUrl: (id) => `https://example.org/${id}` }).pages[0]!.innerHtml;
    expect(html).toContain('alt="A map of Europe (OCÉANO ATLÁNTICO)"');
    expect(html).toContain('>Madrid<');
  });
});
