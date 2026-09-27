import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { createMeasurementCache } from '../../measure';
import type { PostextConfig, VDTBlock, VDTColumn, VDTDocument, VDTPage } from '../../index';

// EF-144: `calloutStyles[].marginBottom` had no effect on a floated box: the
// band under a `placement="top"` box kept one body line (the float gap)
// whatever the margin, where a box set in the side column keeps the larger
// of the two. A floated box's margins now set the space next to its band
// when they are wider than the float gap (top band: `marginBottom`, bottom
// band: `marginTop`); a narrower margin keeps the gap, so the default boxes
// are placed as before.

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

// Default 300 dpi: body 8pt → 33.33px, grid (1.5em) → 50px.
const GRID = ((8 * 300) / 72) * 1.5;
const mm = (value: number) => ({ value, unit: 'mm' as const });
const pt = (value: number) => ({ value, unit: 'pt' as const });

const SENTENCE = 'La linterna del faro debe permanecer encendida toda la noche para guiar a los barcos que cruzan la bahía. ';
const paras = (n: number): string => Array.from({ length: n }, () => SENTENCE.trim()).join('\n\n');

function config(margins: { marginTop?: ReturnType<typeof pt>; marginBottom?: ReturnType<typeof pt> }): PostextConfig {
  return {
    headings: { balancing: { enabled: false } },
    page: { width: mm(160), height: mm(120), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
    layout: { layoutType: 'double' },
    calloutStyles: [{ id: 'note', ...margins }],
  };
}

const build = (md: string, cfg: PostextConfig): VDTDocument => buildDocument({ markdown: md }, cfg, createMeasurementCache());
const frameOf = (doc: VDTDocument): VDTBlock => doc.blocks.find((b) => b.type === 'callout')!;
const textColumns = (page: VDTPage): VDTColumn[] => page.columns.filter((c) => c.kind !== 'span' && c.kind !== 'side');

const box = (placement: 'top' | 'bottom') => `:::callout{type="note" span="page" placement="${placement}" title="Recuerda"}\n${SENTENCE.trim()}\n:::`;

describe('the margins of a floated box (EF-144)', () => {
  it('a top band keeps the box’s marginBottom under it when it is wider than the float gap', () => {
    const md = ['Intro.', '', box('top'), '', paras(14)].join('\n');
    const topOfText = (cfg: PostextConfig): number => {
      const doc = build(md, cfg);
      const frame = frameOf(doc);
      const page = doc.pages[frame.pageIndex]!;
      return Math.min(...textColumns(page).map((c) => c.bbox.y)) - (frame.bbox.y + frame.bbox.height);
    };
    const unset = topOfText(config({}));
    // A margin narrower than the float gap (one body line) keeps the gap.
    expect(topOfText(config({ marginBottom: pt(6) }))).toBeCloseTo(unset, 6);
    // A wider one sets the space: at least the margin, on the grid.
    const wide = topOfText(config({ marginBottom: pt(30) }));
    const marginPx = (30 * 300) / 72;
    expect(wide).toBeGreaterThanOrEqual(marginPx - 0.01);
    expect(wide).toBeGreaterThanOrEqual(unset + GRID - 0.01);
  });

  it('a bottom band keeps the box’s marginTop above it when it is wider than the float gap', () => {
    const md = ['Intro.', '', box('bottom'), '', paras(14)].join('\n');
    const room = (cfg: PostextConfig): number => {
      const doc = build(md, cfg);
      const frame = frameOf(doc);
      const page = doc.pages[frame.pageIndex]!;
      return frame.bbox.y - Math.max(...textColumns(page).map((c) => c.bbox.y + c.bbox.height));
    };
    const unset = room(config({}));
    expect(unset).toBeGreaterThanOrEqual(GRID - 0.01);
    expect(room(config({ marginTop: pt(6) }))).toBeCloseTo(unset, 6);
    const marginPx = (30 * 300) / 72;
    expect(room(config({ marginTop: pt(30) }))).toBeGreaterThanOrEqual(marginPx - 0.01);
  });
});

describe('a floated page-wide box still waiting when a page-wide box is set', () => {
  // The fixed box cuts the band, and the pending page-span floats referenced
  // before it are set at the cut. That cut is for figures: a floated box has
  // no resource block and threw there ("reading 'rotation'"). It keeps to
  // the bands a floated box takes, the head or foot of a page.
  const md = [
    paras(3), '',
    ':::callout{type="note" span="page" placement="top" title="Flotante"}', SENTENCE.trim(), ':::', '',
    paras(2), '',
    ':::callout{type="plain" span="page" title="Fijo"}', SENTENCE.trim(), ':::', '',
    paras(10),
  ].join('\n');
  const cfg = (marginBottom?: ReturnType<typeof pt>, floatBarrier = false): PostextConfig => ({
    ...config(marginBottom ? { marginBottom } : {}),
    calloutStyles: [{ id: 'note', ...(marginBottom ? { marginBottom } : {}) }, { id: 'plain', floatBarrier }],
  });

  it('lays the document out, the floated box at the head of a page', () => {
    for (const [mb, barrier] of [[undefined, false], [pt(30), false], [undefined, true], [pt(30), true]] as const) {
      const doc = build(md, cfg(mb, barrier));
      const frames = doc.blocks.filter((b) => b.type === 'callout');
      expect(frames).toHaveLength(2);
      const floated = frames.find((b) => (doc.pages[b.pageIndex]!.floats ?? []).includes(b))!;
      expect(floated).toBeDefined();
      // At the head of its page, over the columns.
      const page = doc.pages[floated.pageIndex]!;
      expect(floated.bbox.y).toBeCloseTo(page.contentArea.y, 1);
      // Every paragraph is set.
      expect(doc.blocks.filter((b) => b.type === 'paragraph' && b.pageIndex >= 0).length).toBeGreaterThanOrEqual(15);
    }
  });
});
