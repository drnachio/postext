import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import { collectHeadingDesignCuts, formatWarning } from '../../index';
import type { VDTDocument } from '../../vdt';
import type { DesignElement, LayoutType, PostextConfig } from '../../types';

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

// EF-91: a heading design taller than the page loses what lies past the
// page's foot (an opener) or its column's (an in-column design). The layout
// raises no warning — a cover that claims its page loses nothing — and a
// host runs `collectHeadingDesignCuts` on the finished layout instead.

/** 400 × 400pt page at 72 dpi, 20pt margins: a 360pt column. */
function config(layoutType: LayoutType, elements: DesignElement[], span: 'page' | 'column' = 'page', minHeight?: number): PostextConfig {
  return {
    page: { dpi: 72, width: pt(400), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
    layout: { layoutType },
    bodyText: { fontSize: pt(10), lineHeight: pt(14) },
    header: { elements: [] },
    footer: { elements: [] },
    headings: {
      balancing: { enabled: false },
      levels: [{
        level: 1,
        span,
        breakBefore: { enabled: true, parity: 'any' },
        advancedDesign: { enabled: true, ...(minHeight !== undefined ? { minHeight: pt(minHeight) } : {}), slot: { elements } },
      }],
    },
  };
}

const title: DesignElement = {
  kind: 'text', id: 'title', content: '{titleText}', fontSize: pt(20), overflow: 'wrap',
  placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: 'fill' } },
};
/** A lead under the title, `words` long: 400 words run to some 40 lines of
 *  24pt, far past a 400pt page. */
const lead = (words: number): DesignElement => ({
  kind: 'text', id: 'lead', content: Array.from({ length: words }, (_, i) => `word${i}`).join(' '), fontSize: pt(20), overflow: 'wrap',
  placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { x: pt(0), y: pt(40) }, size: { width: 'fill' } },
});

const TEXT = '# Rain\n\nThe first paragraph after the opener.\n\nMore text.';
const build = (cfg: PostextConfig): VDTDocument => buildDocument({ markdown: TEXT }, cfg, createMeasurementCache());

describe('collectHeadingDesignCuts (EF-91)', () => {
  it('finds an opener whose text runs past the foot of the page', () => {
    const doc = build(config('single', [title, lead(400)]));
    const cuts = collectHeadingDesignCuts(doc);
    expect(cuts).toHaveLength(1);
    const [cut] = cuts;
    expect(cut).toMatchObject({ kind: 'headingDesignCut', pageIndex: 0, level: 1, where: 'page' });
    expect(cut!.overflowPx).toBeGreaterThan(100);
    // It points at the heading in the source.
    expect(TEXT.slice(cut!.sourceStart!, cut!.sourceEnd!)).toContain('Rain');
    expect(formatWarning(cut!)).toMatch(/^The design of an H1 runs \d+px past the foot of its page — that part is cut off \(page 1, offset \d+\)$/);
  });

  it('finds an in-column design whose text runs past the foot of its column', () => {
    const doc = build(config('double', [title, lead(200)], 'column'));
    const cuts = collectHeadingDesignCuts(doc);
    expect(cuts).toHaveLength(1);
    expect(cuts[0]).toMatchObject({ where: 'column', pageIndex: 0, level: 1 });
  });

  it('stays silent for designs that fit, a cover that claims its page included', () => {
    expect(collectHeadingDesignCuts(build(config('single', [title, lead(10)])))).toEqual([]);
    expect(collectHeadingDesignCuts(build(config('single', [title], 'page', 1000)))).toEqual([]);
    expect(collectHeadingDesignCuts(build(config('double', [title, lead(10)], 'column')))).toEqual([]);
  });

  it('measures an opener against the trim, not the canvas the cut lines widen', () => {
    // A hand-made layout: a 400px trim inside 20px of cut-line margin.
    const line = (baselineY: number) => ({ text: 'Lead', xOffset: 0, baselineY, width: 20 });
    const doc = {
      trimOffset: 20,
      pages: [{
        index: 0, width: 440, height: 440,
        columns: [{ index: 0, bbox: { x: 40, y: 40, width: 360, height: 360 }, availableHeight: 0, blocks: [{ type: 'heading', headingLevel: 1, hidden: true, columnIndex: 0, pageIndex: 0, bbox: { x: 40, y: 40, width: 360, height: 360 }, lines: [] }] }],
        openerBand: { bbox: { x: 40, y: 40, width: 360, height: 360 }, blocks: [{ kind: 'text', bbox: { x: 40, y: 40, width: 360, height: 400 }, fontString: '10px serif', color: '#000', lines: [line(60), line(425)], clip: false }] },
      }],
      blocks: [],
    } as unknown as VDTDocument;
    const cuts = collectHeadingDesignCuts(doc);
    expect(cuts).toHaveLength(1);
    expect(cuts[0]!.overflowPx).toBeCloseTo(5, 5);
    // The same line on the trim's foot is on the page.
    (doc.pages[0]!.openerBand!.blocks[0] as unknown as { lines: unknown[] }).lines = [line(60), line(419)];
    expect(collectHeadingDesignCuts(doc)).toEqual([]);
  });
});
