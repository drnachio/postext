import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import type { VDTDocument } from '../../../vdt.js';
import type { PostextConfig, Resource } from '../../../types.js';

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

/** `layout.pullFloatsToCitation` (#1492) on two columns, with column
 *  balancing on (the default): what the pull wins survives the balancing
 *  passes, a picture is cropped only within its safe area and every crop
 *  is reported. */

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (pull: boolean): PostextConfig => ({
  page: { dpi: 96, sizePreset: '17x24' },
  layout: { layoutType: 'double', pullFloatsToCitation: pull },
  bodyText: { fontSize: pt(9), lineHeight: pt(12) },
  header: { elements: [] },
  footer: { elements: [] },
});
const words = 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua'.split(' ');
const para = (i: number) => Array.from({ length: 30 + (i * 17) % 45 }, (_, k) => words[(k * 7 + i) % words.length]).join(' ') + '.';
/** Fifty paragraphs, the figure cited in paragraph `k`; `box` puts a
 *  page-wide box before paragraph 3 (a band cap on the first page). */
const md = (k: number, box = false) => Array.from({ length: 50 }, (_, i) =>
  (box && i === 3 ? ':::callout{span="page"}\nA box across the page.\n:::\n\n' : '') + (i === k ? 'See :ref{id="f"}. ' : '') + para(i)).join('\n\n');
const fig = (h: number, safe: boolean): Resource => ({
  id: 'f', typeId: 'figure', kind: 'svg', caption: 'f', createdAt: 0, updatedAt: 0,
  svg: { fileId: 'f.svg', width: 600, height: h },
  ...(safe ? { safeArea: { x: 0.1, y: 0.25, width: 0.8, height: 0.5 } } : {}),
});
function where(doc: VDTDocument) {
  let cite = -1;
  for (const b of doc.blocks) for (const l of b.lines) if (cite < 0 && l.segments?.some((s) => s.refResourceId === 'f')) cite = b.pageIndex!;
  const float = doc.pages.flatMap((p) => p.floats ?? []).find((x) => x.resourceBlock?.resource.id === 'f')!;
  const cropped = (doc.contentWarnings ?? []).filter((w) => w.kind === 'floatCropped');
  return { cite, page: float.pageIndex!, pages: doc.pages.length, delta: float.resourceBlock!.bodyFlex?.delta ?? 0, cropped };
}
const build = (k: number, h: number, safe: boolean, pull: boolean, box = false, offset = 0) =>
  buildDocument({ markdown: md(k, box), resources: [fig(h, safe)], ...(offset ? { continuation: { pageIndexOffset: offset } } : {}) }, config(pull), createMeasurementCache());

/** Cases where the figure misses its citing page with the option off. */
const CASES = [{ k: 8, h: 500 }, { k: 17, h: 700 }, { k: 26, h: 900 }];

describe('floats pulled back to their citing page, on two balanced columns', () => {
  it('keeps a cropped picture on its citing page through the balancing, and reports the crop', () => {
    for (const { k, h } of CASES) {
      const off = where(build(k, h, true, false));
      const on = where(build(k, h, true, true));
      expect(off.page, `${k}/${h}`).toBeGreaterThan(off.cite);
      expect(on.page, `${k}/${h}`).toBe(on.cite);
      expect(on.pages).toBeLessThanOrEqual(off.pages);
      expect(on.delta).toBeLessThan(0);
      expect(on.cropped).toEqual([expect.objectContaining({ kind: 'floatCropped', resourceId: 'f', pageIndex: on.page })]);
      expect(on.cropped[0]!.kind === 'floatCropped' && on.cropped[0]!.share).toBeGreaterThan(0);
      expect(off.cropped).toEqual([]);
    }
  });

  it('never crops a picture without a safe area, and then moves it on as without the option', () => {
    for (const { k, h } of CASES) {
      const on = where(build(k, h, false, true));
      const off = where(build(k, h, false, false));
      expect(on.cropped).toEqual([]);
      expect(on.delta).toBe(0);
      expect(on.pages).toBeLessThanOrEqual(off.pages);
    }
  });

  it('keeps the band a page-wide box levels', () => {
    for (const pull of [false, true]) {
      const doc = build(8, 500, true, pull, true);
      const page = doc.pages[0]!;
      const box = page.columns.flatMap((c) => c.blocks).concat(doc.blocks.filter((b) => b.pageIndex === 0))
        .find((b) => b.lines.some((l) => l.text.includes('A box across')))!;
      expect(box).toBeDefined();
      // The text columns above the box end level, on the same grid line.
      const above = page.columns.filter((c) => c.kind !== 'side').map((c) =>
        Math.max(...c.blocks.filter((b) => b.bbox.y + b.bbox.height <= box.bbox.y + 0.5).map((b) => b.bbox.y + b.bbox.height), -Infinity));
      const ends = above.filter((y) => Number.isFinite(y));
      if (ends.length > 1) expect(Math.max(...ends) - Math.min(...ends)).toBeLessThan(doc.baselineGrid + 0.5);
    }
  });

  it('pulls the same way in a chapter that continues a book', () => {
    const alone = where(build(17, 700, true, true));
    const later = where(build(17, 700, true, true, false, 12));
    // Page indexes are the chapter's own; the offset numbers them.
    expect(later.page).toBe(alone.page);
    expect(later.cite).toBe(alone.cite);
    expect(later.page).toBe(later.cite);
    expect(later.delta).toBeCloseTo(alone.delta, 3);
  });
});
