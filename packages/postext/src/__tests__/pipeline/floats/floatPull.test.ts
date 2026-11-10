import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { resolveLayoutConfig } from '../../../defaults/layout.js';
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

/** A float that misses the page citing it by a little is pulled back
 *  (`layout.pullFloatsToCitation`): the citing page's paragraphs set a
 *  line shorter, a picture with a safe area cropped within it. */

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (pull?: boolean): PostextConfig => ({
  page: { dpi: 96, sizePreset: '17x24' },
  layout: { layoutType: 'single', ...(pull === undefined ? {} : { pullFloatsToCitation: pull }) },
  bodyText: { fontSize: pt(10), lineHeight: pt(14) },
  header: { elements: [] },
  footer: { elements: [] },
});
const words = 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua'.split(' ');
const para = (i: number) => Array.from({ length: 30 + (i * 17) % 45 }, (_, k) => words[(k * 7 + i) % words.length]).join(' ') + '.';
/** Forty paragraphs, the figure cited in paragraph `k`. */
const md = (k: number) => Array.from({ length: 40 }, (_, i) => (i === k ? 'See :ref{id="f"}. ' : '') + para(i)).join('\n\n');
const fig = (h: number, safe: boolean): Resource => ({
  id: 'f', typeId: 'figure', kind: 'svg', caption: 'f', createdAt: 0, updatedAt: 0,
  svg: { fileId: 'f.svg', width: 600, height: h },
  ...(safe ? { safeArea: { x: 0.1, y: 0.25, width: 0.8, height: 0.5 } } : {}),
});
function where(doc: VDTDocument) {
  let cite = -1;
  for (const b of doc.blocks) for (const l of b.lines) if (cite < 0 && l.segments?.some((s) => s.refResourceId === 'f')) cite = b.pageIndex!;
  const float = doc.pages.flatMap((p) => p.floats ?? []).find((x) => x.resourceBlock?.resource.id === 'f')!;
  return { cite, page: float.pageIndex!, pages: doc.pages.length, cropped: float.resourceBlock!.bodySource !== undefined };
}
const build = (k: number, h: number, safe: boolean, pull?: boolean) =>
  where(buildDocument({ markdown: md(k), resources: [fig(h, safe)] }, config(pull), createMeasurementCache()));

describe('floats pulled back to the page citing them', () => {
  it('is off by default, and then leaves the layout as it was', () => {
    expect(resolveLayoutConfig().pullFloatsToCitation).toBe(false);
    expect(build(5, 180, false)).toEqual(build(5, 180, false, false));
    expect(build(14, 240, true)).toEqual(build(14, 240, true, false));
  });

  it('sets the citing page a line shorter where that is enough', () => {
    const off = build(5, 180, false, false);
    const on = build(5, 180, false, true);
    expect(off.page).toBeGreaterThan(off.cite);
    expect(on.page).toBe(on.cite);
    expect(on.pages).toBeLessThanOrEqual(off.pages);
  });

  it('crops a picture with a safe area to keep it on the citing page', () => {
    const off = build(14, 240, true, false);
    const on = build(14, 240, true, true);
    expect(off.page).toBeGreaterThan(off.cite);
    expect(on.page).toBe(on.cite);
    expect(on.cropped).toBe(true);
  });

  it('leaves a picture without a safe area whole, on the next page, when nothing else brings it back', () => {
    const on = build(14, 240, false, true);
    expect(on.page).toBeGreaterThan(on.cite);
    expect(on.cropped).toBe(false);
  });
});
