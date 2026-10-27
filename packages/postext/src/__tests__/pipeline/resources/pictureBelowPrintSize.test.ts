import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/index.js';
import { formatWarning } from '../../../pipeline/contentWarnings.js';
import type { PostextConfig, Resource } from '../../../types.js';
import type { ContentWarning, VDTDocument } from '../../../vdt.js';

// #901: a full-page picture in the flow is set at its column's width,
// and the default page has two columns. Nothing in the figure sizing caps
// it below that; the layout says so when a picture with a print size is
// held at under half of it by a column narrower than the page.

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
const px = (v: number): number => (v / 25.4) * DPI;

/** The map of the issue: 1066 × 929 px at 200 ppi (135.4 × 118 mm), on a
 *  135.2 × 127.8 mm page with no margins. */
const map = (bitmap: Partial<NonNullable<Resource['bitmap']>> = { resolution: 200 }, placement: Resource['placement'] = { position: 'here', width: 1 }): Resource => ({
  id: 'mapa', typeId: 'mapa', kind: 'bitmap', caption: '', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: 'mapa.png', format: 'png', width: 1066, height: 929, ...bitmap },
  placement,
} as Resource);

const config = (extra: PostextConfig = {}): PostextConfig => ({
  page: { width: mm(135.2), height: mm(127.8), dpi: DPI, margins: { top: mm(0), bottom: mm(0), left: mm(0), right: mm(0) } },
  header: { elements: [] },
  footer: { elements: [] },
  resourceTypes: [{ id: 'mapa', name: 'Mapa', shortLabel: 'Mapa', numberingTemplate: '', resetOn: 'never', counterFormat: 'decimal', captionPrefix: '', defaultPlacement: { position: 'here' } }],
  ...extra,
});

const build = (resource: Resource, extra?: PostextConfig): VDTDocument =>
  buildDocument({ markdown: '::resource{id="mapa"}', resources: [resource] }, config(extra));
const warnings = (doc: VDTDocument): Extract<ContentWarning, { kind: 'pictureBelowPrintSize' }>[] =>
  (doc.contentWarnings ?? []).filter((w): w is Extract<ContentWarning, { kind: 'pictureBelowPrintSize' }> => w.kind === 'pictureBelowPrintSize');
const body = (doc: VDTDocument) => [...doc.pages[0]!.columns.flatMap((c) => c.blocks), ...(doc.pages[0]!.floats ?? [])].find((b) => b.resourceBlock)!.resourceBlock!.bodyRect;

describe('a full-page picture in the flow (#901)', () => {
  it('fills its column, which on the default two-column page is under half the page', () => {
    const doc = build(map());
    const col = doc.pages[0]!.columns[0]!.bbox.width;
    expect(doc.pages[0]!.columns.length).toBe(2);
    expect(body(doc).width).toBeCloseTo(col, 3);
    expect(body(doc).width / px(135.2)).toBeCloseTo(0.472, 2);
  });

  it('says so, with the sizes and the way out', () => {
    const doc = build(map());
    const [w] = warnings(doc);
    expect(w).toMatchObject({ resourceId: 'mapa', pageIndex: 0 });
    expect(w!.scale).toBeCloseTo(0.472, 2);
    expect(w!.printWidthPx).toBe(Math.round((1066 * DPI) / 200));
    expect(w!.pageWidthPx).toBe(Math.round(px(135.2)));
    expect(w!.sourceStart).toBe(0);
    const text = formatWarning(w!);
    expect(text).toContain('47 % of its print size');
    expect(text).toContain("layout.layoutType: 'single'");
    expect(text).toContain("placement.span: 'page'");
  });

  it('sets it at the page’s width in one column, and is quiet', () => {
    const doc = build(map(), { layout: { layoutType: 'single' } });
    expect(body(doc).width).toBeCloseTo(px(135.2), 3);
    expect(warnings(doc)).toEqual([]);
  });

  it('takes a number in layout.bitmapResolution as a print size, not a resolution read from the file', () => {
    expect(warnings(build(map({}), { layout: { bitmapResolution: 200 } }))).toHaveLength(1);
    expect(warnings(build(map({ fileResolution: 200 }), { layout: { bitmapResolution: 'file' } }))).toEqual([]);
    // No print size at all: its pixels at the page's dpi.
    expect(warnings(build(map({})))).toEqual([]);
  });

  it('leaves a picture narrowed on purpose alone, and one its column holds at half its size or more', () => {
    expect(warnings(build(map({ resolution: 200 }, { position: 'here', width: 0.8 })))).toEqual([]);
    // 1066 px at 400 ppi: 67.7 mm, a little wider than the 63.9 mm column.
    expect(warnings(build(map({ resolution: 400 })))).toEqual([]);
  });

  it('says nothing of a picture spanning the page as a float', () => {
    const doc = build(map({ resolution: 200 }, { position: 'top', span: 'page' }));
    expect(body(doc).width).toBeCloseTo(px(135.2), 3);
    expect(warnings(doc)).toEqual([]);
  });
});
