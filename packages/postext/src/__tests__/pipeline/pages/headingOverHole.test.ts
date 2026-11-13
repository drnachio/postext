// #1577: a heading that opens a page holding a fixed die-cut hole goes
// under the hole, as the paragraphs after it run beside it.
import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/index.js';
import { pathBounds } from '../../../dieCut/index.js';
import { flattenPath, rectPolygonDistance } from '../../../dieCut/geometry.js';
import type { PostextConfig } from '../../../types.js';
import type { VDTPage } from '../../../vdt.js';

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

// A 100 pt porthole in the top-left corner of the text area of page 3.
const config: PostextConfig = {
  page: {
    width: pt(360),
    height: pt(480),
    dpi: 72,
    margins: { top: pt(36), bottom: pt(36), left: pt(36), right: pt(36) },
  },
  layout: { layoutType: 'single' },
  headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }] },
  dieCuts: {
    shapes: [{ id: 'porthole', shape: 'circle', x: pt(36), y: pt(36), width: pt(100), height: pt(100),
      wrap: { gap: pt(8) } }],
    pages: [{ pages: '3', die: 'porthole' }],
  },
};

const words = (tag: string, n: number) => Array.from({ length: n }, () => tag).join(' ');
const markdown = [
  '# One', words('Alpha', 20),
  '# Two', words('Beta', 20),
  '# Three opens the holed page', words('Gamma', 120),
].join('\n\n');

const headingLines = (page: VDTPage) => page.columns.flatMap((c) => c.blocks)
  .filter((b) => b.type === 'heading').flatMap((b) => b.lines);
const bodyLines = (page: VDTPage) => page.columns.flatMap((c) => c.blocks)
  .filter((b) => b.type !== 'heading').flatMap((b) => b.lines);

describe('a heading at the top of a page with a fixed die-cut hole', () => {
  const doc = buildDocument({ markdown }, config);
  const page = doc.pages[2]!;

  it('sets up the case: page 3 is holed and opens with the heading', () => {
    expect(page.dieCut?.sources).toEqual(['porthole']);
    expect(headingLines(page).length).toBeGreaterThan(0);
  });

  it('keeps the paragraph lines clear of the hole', () => {
    const polys = flattenPath(page.dieCut!.holes[0]!);
    for (const l of bodyLines(page)) expect(rectPolygonDistance(l.bbox, polys)).toBeGreaterThan(0);
  });

  it('keeps the heading clear of the hole too', () => {
    const hole = pathBounds(page.dieCut!.holes[0]!)!;
    const polys = flattenPath(page.dieCut!.holes[0]!);
    for (const l of headingLines(page)) {
      // Either beside the hole, clear of its curve, or settled under it.
      const clear = rectPolygonDistance(l.bbox, polys) > 0 || l.bbox.y >= hole.y + hole.height;
      expect(clear, `heading line at (${l.bbox.x}, ${l.bbox.y}) over the hole at (${hole.x}, ${hole.y})`).toBe(true);
    }
  });
});
