import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import type { PageTemplate } from '../../../composed/types.js';
import type { DesignElement, PostextConfig, VDTDesignBlock, VDTDocument, VDTPage } from '../../../index.js';
import { flowRectToPage } from '../../../vdt.js';
import { physicalEdge, physicalPlacement } from '../../../design/logicalEdges.js';

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
const composedPage = (doc: VDTDocument): VDTPage => doc.pages.find((p) => p.composed)!;
const deco = (page: VDTPage, id: string): VDTDesignBlock => page.composed!.decoration!.blocks.find((b) => b.elementId === id)!;

/** A school atlas plate: a title frame at the template's top start, and a
 *  kicker of decoration over it, written once for every edition. */
const plate: PageTemplate = {
  id: 'plate',
  frames: [{ name: 'title', takes: 'h1', width: mm(90), height: mm(20), placement: { anchor: { to: 'container', edge: 'top-start' }, offset: { y: mm(12) } } }],
  decoration: { elements: [
    { kind: 'box', id: 'kicker', placement: { anchor: { to: 'container', edge: 'top-start' }, offset: { x: mm(4) }, size: { width: mm(30), height: mm(8) } }, style: { backgroundColor: { hex: '#1d5f73', model: 'hex' } } },
    { kind: 'box', id: 'tab', placement: { anchor: { to: 'container', edge: 'bottom-end' }, size: { width: mm(10), height: mm(10) } }, style: { backgroundColor: { hex: '#cc3300', model: 'hex' } } },
    { kind: 'box', id: 'rule', placement: { anchor: { to: '#kicker', edge: 'align-end' }, offset: { y: mm(9) }, size: { width: mm(12), height: mm(1) } }, style: { backgroundColor: { hex: '#000000', model: 'hex' } } },
  ] as DesignElement[] },
};
const md = '::::page{template="plate"}\n# Varenia\n::::\n';
const build = (extra: Partial<PostextConfig>): VDTDocument =>
  buildDocument({ markdown: md }, { ...PAGE, ...extra, pageTemplates: [plate] } as PostextConfig, createMeasurementCache());

describe('start and end edges (#936)', () => {
  it('maps each logical edge to the physical one, the offset reversed on a page that starts on the right', () => {
    expect(physicalEdge('top-start', false)).toBe('top-left');
    expect(physicalEdge('top-start', true)).toBe('top-right');
    expect(physicalEdge('end', true)).toBe('left');
    expect(physicalEdge('align-end', false)).toBe('align-right');
    expect(physicalEdge('below', true)).toBe('below');
    const p = physicalPlacement({ anchor: { to: 'container', edge: 'bottom-start' }, offset: { x: mm(4), y: mm(2) } }, true);
    expect(p).toEqual({ anchor: { to: 'container', edge: 'bottom-right' }, offset: { x: mm(-4), y: mm(2) } });
    const same = { anchor: { to: 'container' as const, edge: 'top-left' as const }, offset: { x: mm(4) } };
    expect(physicalPlacement(same, true)).toBe(same);
  });

  it('left to right: the kicker stands at the left, over the title frame', () => {
    const page = composedPage(build({}));
    const area = page.contentArea;
    const kicker = deco(page, 'kicker').bbox;
    expect(kicker.x).toBeCloseTo(area.x + 4 * MM, 3);
    const title = page.composed!.frames.find((f) => f.name === 'title')!.rect;
    expect(title.x).toBeCloseTo(area.x, 3);
    expect(deco(page, 'tab').bbox.x + deco(page, 'tab').bbox.width).toBeCloseTo(area.x + area.width, 3);
    // Aligned with the kicker's end edge.
    expect(deco(page, 'rule').bbox.x + deco(page, 'rule').bbox.width).toBeCloseTo(kicker.x + kicker.width, 3);
  });

  for (const [name, extra] of [
    ['right to left', { direction: 'rtl' }],
    ['vertical', { locale: 'ja', layout: { layoutType: 'single', writingMode: 'vertical-rl' } }],
  ] as const) {
    it(`${name}: the kicker follows the title frame to the right of the sheet`, () => {
      const page = composedPage(build(extra as Partial<PostextConfig>));
      expect(page.flow).toBeDefined();
      const sheetArea = flowRectToPage(page, page.contentArea);
      const kicker = deco(page, 'kicker').bbox;
      // 4 mm in from the area's right edge: the offset runs from the start.
      expect(kicker.x + kicker.width).toBeCloseTo(sheetArea.x + sheetArea.width - 4 * MM, 3);
      expect(deco(page, 'tab').bbox.x).toBeCloseTo(sheetArea.x, 3);
      expect(deco(page, 'rule').bbox.x).toBeCloseTo(kicker.x, 3);
      if (name === 'right to left') {
        // The frame is laid at the flow's start, which the sheet shows at the right.
        const title = flowRectToPage(page, page.composed!.frames.find((f) => f.name === 'title')!.rect);
        expect(title.x + title.width).toBeCloseTo(sheetArea.x + sheetArea.width, 3);
      }
    });
  }

  it('a running head at the top end stands at the left of a right-to-left page', () => {
    const header = { elements: [{ kind: 'text', id: 'run', content: 'Atlas', fontSize: { value: 9, unit: 'pt' }, placement: { anchor: { to: 'container', edge: 'bottom-end' } } }] };
    const ltr = buildDocument({ markdown: 'Body text.' }, { ...PAGE, header } as unknown as PostextConfig, createMeasurementCache()).pages[0]!;
    const rtl = buildDocument({ markdown: 'Body text.' }, { ...PAGE, direction: 'rtl', header } as unknown as PostextConfig, createMeasurementCache()).pages[0]!;
    const at = (p: VDTPage) => p.header!.blocks.find((b) => b.elementId === 'run')!.bbox;
    const l = at(ltr);
    const r = at(rtl);
    // Mirror images across the sheet.
    expect(r.x).toBeCloseTo(ltr.width - (l.x + l.width), 3);
  });
});
