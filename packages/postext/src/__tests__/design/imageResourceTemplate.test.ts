import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import type { DesignElement, PostextConfig, Resource } from '../../types';
import type { VDTDocument } from '../../vdt';

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

const picture = (id: string, width: number, height: number): Resource => ({
  id,
  typeId: 'figure',
  kind: 'bitmap',
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: `${id}.png`, format: 'png', width, height },
});
const resources = [picture('log', 400, 200), picture('wig', 400, 100), picture('map-2', 400, 100)];

const image = (resourceId: string): DesignElement => ({
  kind: 'image',
  id: 'vignette',
  resourceId,
  placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: 'fill' } },
});

const config = (elements: DesignElement[], header: DesignElement[] = []): PostextConfig => ({
  page: { dpi: 72, width: pt(400), height: pt(500), margins: { top: pt(40), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: header },
  footer: { elements: [] },
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }] },
  headingStyles: [{ id: 'opener', advancedDesign: { enabled: true, slot: { elements } } }],
});

/** The file ids the design images of each page paint (heading overlays and
 *  header/footer slots). */
function paintedFiles(doc: VDTDocument): string[][] {
  return doc.pages.map((page) => {
    const out: string[] = [];
    for (const b of doc.blocks) {
      if (b.pageIndex !== page.index) continue;
      for (const d of b.designOverlay?.blocks ?? []) if (d.kind === 'image') out.push(d.fileId);
    }
    for (const slot of [page.header, page.footer]) {
      for (const d of slot?.blocks ?? []) if (d.kind === 'image') out.push(d.fileId);
    }
    return out;
  });
}

const md = '# Chapter I {style="opener" art="log"}\n\nOne.\n\n# Chapter II {style="opener" art="wig"}\n\nTwo.\n\n# Chapter III {style="opener"}\n\nThree.';

describe('design image elements: placeholders in resourceId', () => {
  it('one heading style draws the picture each heading names', () => {
    const doc = buildDocument({ markdown: md, resources }, config([image('{attr.art}')]));
    expect(paintedFiles(doc)).toEqual([['log.png'], ['wig.png'], []]);
  });

  it('the picture a heading names sets the height it reserves', () => {
    const doc = buildDocument({ markdown: md, resources }, config([image('{attr.art}')]));
    const headings = doc.blocks.filter((b) => b.type === 'heading');
    // 360 wide: the log is 180 tall, the wig 90, no picture reserves nothing.
    expect(headings[0]!.bbox.height).toBeGreaterThanOrEqual(180);
    expect(headings[1]!.bbox.height).toBeGreaterThanOrEqual(90);
    expect(headings[1]!.bbox.height).toBeLessThan(180);
    expect(headings[2]!.bbox.height).toBeLessThan(90);
  });

  it('takes the other placeholders too', () => {
    const doc = buildDocument({ markdown: md, resources }, config([image('map-{chapterNumber}')]));
    expect(paintedFiles(doc)).toEqual([[], ['map-2.png'], []]);
  });

  it('a fixed id keeps working', () => {
    const doc = buildDocument({ markdown: md, resources }, config([image('wig')]));
    expect(paintedFiles(doc)).toEqual([['wig.png'], ['wig.png'], ['wig.png']]);
  });

  it('a running head draws the picture its chapter names', () => {
    const doc = buildDocument(
      { markdown: md, resources },
      config([], [{ ...image('{attr.art}'), placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(40) } } } as DesignElement]),
    );
    expect(paintedFiles(doc)).toEqual([['log.png'], ['wig.png'], []]);
  });
});
