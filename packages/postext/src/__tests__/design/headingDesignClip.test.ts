import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { columnClipRect } from '../../columnClip';
import type { PostextConfig } from '../../types';

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

// EF-113, repro A: a 156 × 234 mm page with a 22 mm top margin, one column,
// an H1 whose design (kept in the column) draws a dark box anchored to the
// top of the page. The box ran into the side margins but stopped at the
// column top: the canvas and PDF clip cut the part in the top margin.
describe('a heading design kept in the column paints where it is placed (EF-113)', () => {
  const config = (anchor: 'page' | 'bleed'): PostextConfig => ({
    page: {
      width: mm(156), height: mm(234), dpi: 96,
      margins: { top: mm(22), bottom: mm(24), left: mm(20), right: mm(20) },
      ...(anchor === 'bleed' ? { cutLines: { enabled: true, bleed: mm(3) } } : {}),
    },
    layout: { layoutType: 'single' },
    header: { elements: [] },
    footer: { elements: [] },
    headings: {
      levels: [{
        level: 1, breakBefore: { enabled: true, parity: 'any' },
        advancedDesign: {
          enabled: true,
          slot: {
            elements: [{
              kind: 'box', id: 'band', style: { backgroundColor: { hex: '#1f1c19', model: 'hex' } },
              placement: { anchor: { to: anchor, edge: 'top-left' }, size: { width: 'fill', height: mm(112) } },
            }],
          },
        },
      }],
    },
  });

  for (const anchor of ['page', 'bleed'] as const) {
    it(`takes the ${anchor}-anchored band into the column clip, top margin included`, () => {
      const doc = buildDocument({ markdown: '# Opening\n\nSome text under the band.' }, config(anchor));
      const page = doc.pages[0]!;
      const col = page.columns[0]!;
      const band = col.blocks.find((b) => b.type === 'heading')!.designOverlay!.blocks[0]!;
      expect(band.bbox.y).toBeLessThan(col.bbox.y - 50);
      const clip = columnClipRect(col, 96);
      expect(clip.y).toBeLessThanOrEqual(band.bbox.y);
      expect(clip.x).toBeLessThanOrEqual(band.bbox.x);
      expect(clip.x + clip.width).toBeGreaterThanOrEqual(band.bbox.x + band.bbox.width);
    });
  }
});
