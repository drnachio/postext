import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import type { PageTemplate } from '../../../composed/types.js';
import type { DesignElement, PostextConfig, VDTDesignBlock, VDTDocument, VDTFrame, VDTPage } from '../../../index.js';

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

const mm = (value: number) => ({ value, unit: 'mm' as const });
const DPI = 300;
const MM = DPI / 25.4;

const PAGE: PostextConfig = {
  page: { width: mm(200), height: mm(260), dpi: DPI, margins: { top: mm(20), bottom: mm(20), left: mm(20), right: mm(20) } } as never,
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] } as never,
};
const build = (md: string, templates: PageTemplate[]): VDTDocument =>
  buildDocument({ markdown: md }, { ...PAGE, pageTemplates: templates }, createMeasurementCache());
const composedPage = (doc: VDTDocument): VDTPage => doc.pages.find((p) => p.composed)!;
const frame = (doc: VDTDocument, name: string): VDTFrame => composedPage(doc).composed!.frames.find((f) => f.name === name)!;
const deco = (doc: VDTDocument, id: string): VDTDesignBlock => composedPage(doc).composed!.decoration!.blocks.find((b) => b.elementId === id)!;
const words = (n: number, w = 'word'): string => Array.from({ length: n }, (_, i) => `${w}${i}`).join(' ');

/** A band at the head of a stack under an intro that grows; a ground from
 *  the band's foot down to the bleed, and a strip from the band's right
 *  edge to the trim's. */
const timeline: PageTemplate = {
  id: 'tl',
  frames: [
    { name: 'intro', placement: { anchor: { to: 'container', edge: 'top-left' } } },
    { name: 'band', height: mm(12), width: mm(100) },
  ],
  groups: [{ name: 'g', kind: 'stack', gap: mm(4), frames: ['intro', 'band'] }],
  decoration: { elements: [
    { kind: 'box', id: 'ground', placement: { anchor: { to: '#band', edge: 'below' }, size: { width: mm(100), height: { to: 'bleed', edge: 'bottom' } } }, style: { backgroundColor: { hex: '#f6efe0', model: 'hex' } } },
    { kind: 'box', id: 'strip', placement: { anchor: { to: '#band', edge: 'right-of' }, size: { width: { to: 'page', edge: 'right' }, height: mm(12) } }, style: { backgroundColor: { hex: '#cc3300', model: 'hex' } } },
    // To the top edge of another element of the slot, laid after it.
    { kind: 'box', id: 'post', placement: { anchor: { to: 'page', edge: 'top-left' }, offset: { x: mm(2) }, size: { width: mm(2), height: { to: '#ground', edge: 'top' } } }, style: { backgroundColor: { hex: '#000000', model: 'hex' } } },
  ] as DesignElement[] },
};
const page = (n: number): string => `::::page{template="tl"}\n\n:::frame{slot="intro"}\n\n${words(n)}\n\n:::\n\n::::`;

describe('decoration sizes that run to an edge (#928)', () => {
  it('a ground runs from the band’s foot down to the bleed, and follows the band when it moves', () => {
    for (const n of [20, 400]) {
      const doc = build(page(n), [timeline]);
      const band = frame(doc, 'band').rect;
      const ground = deco(doc, 'ground').bbox;
      expect(ground.y).toBeCloseTo(band.y + band.height, 3);
      // No cut lines: the bleed is the trim.
      expect(ground.y + ground.height).toBeCloseTo(260 * MM, 3);
      const strip = deco(doc, 'strip').bbox;
      expect(strip.x).toBeCloseTo(band.x + band.width, 3);
      expect(strip.x + strip.width).toBeCloseTo(200 * MM, 3);
      const post = deco(doc, 'post').bbox;
      expect(post.y).toBeCloseTo(0, 3);
      expect(post.y + post.height).toBeCloseTo(ground.y, 3);
    }
    const short = build(page(20), [timeline]);
    const long = build(page(400), [timeline]);
    expect(frame(long, 'band').rect.y).toBeGreaterThan(frame(short, 'band').rect.y + 10);
  });

  it('an edge behind the anchor point gives 0; an edge across the axis, or a box that is not there, reads as fill', () => {
    const odd: PageTemplate = { ...timeline, decoration: { elements: [
      { kind: 'box', id: 'behind', placement: { anchor: { to: '#band', edge: 'below' }, size: { width: mm(10), height: { to: 'page', edge: 'top' } } }, style: {} },
      { kind: 'box', id: 'across', placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: { to: 'page', edge: 'bottom' }, height: mm(5) } }, style: {} },
      { kind: 'box', id: 'missing', placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: mm(5), height: { to: '#nothing', edge: 'bottom' } } }, style: {} },
    ] as DesignElement[] } };
    const doc = build(page(20), [odd]);
    expect(deco(doc, 'behind').bbox.height).toBe(0);
    const area = composedPage(doc).contentArea;
    expect(deco(doc, 'across').bbox.width).toBeCloseTo(area.width, 3);
    expect(deco(doc, 'missing').bbox.y + deco(doc, 'missing').bbox.height).toBeCloseTo(area.y + area.height, 3);
  });
});
