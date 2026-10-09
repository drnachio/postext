import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { resolveLayoutConfig, stripLayoutDefaults } from '../../defaults/layout';
import { bitmapLayoutSize, bitmapResolutionFor, effectiveBitmapResolution, withBitmapResolutions } from '../../bitmapResolution';
import type { PostextConfig, Resource, VDTDocument } from '../../index';

// #631: a bitmap takes its natural print size from its own resolution
// (declared, or the document's `layout.bitmapResolution`), not only from
// its pixels read at `page.dpi`.

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

const px = (value: number) => ({ value, unit: 'px' as const });

/** A 150 dpi page whose single column is `width` px wide. */
const page = (width: number, layout: PostextConfig['layout'] = {}): PostextConfig => ({
  page: { dpi: 150, width: px(width), height: px(2400), margins: { top: px(0), bottom: px(0), left: px(0), right: px(0) } },
  layout: { layoutType: 'single', ...layout },
  headings: { balancing: { enabled: false } },
  header: { elements: [] },
  footer: { elements: [] },
});

const photo = (bitmap: Partial<NonNullable<Resource['bitmap']>> = {}, id = 'photo'): Resource => ({
  id, typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: `${id}.jpg`, format: 'jpeg', width: 2400, height: 1600, ...bitmap },
  placement: { position: 'here' },
});

const body = (doc: VDTDocument, id = 'photo') => {
  for (const p of doc.pages) {
    for (const b of [...p.columns.flatMap((c) => c.blocks), ...(p.floats ?? [])]) {
      if (b.resourceBlock?.resource.id === id) return b.resourceBlock.bodyRect;
    }
  }
  throw new Error(`no ${id}`);
};

const md = (...ids: string[]) => ['Text before.', ...ids.map((id) => `::resource{id="${id}"}`), 'Text after.'].join('\n\n');

describe('bitmap resolution (#631)', () => {
  it('a 2400 × 1600 px bitmap at 300 ppi on a 150 dpi page is 1200 layout px (203.2 mm) wide', () => {
    const doc = buildDocument({ markdown: md('photo'), resources: [photo({ resolution: 300 })] }, page(1500));
    const rect = body(doc);
    expect(rect.width).toBeCloseTo(1200, 6);
    expect(rect.height).toBeCloseTo(800, 6);
    expect((rect.width / 150) * 25.4).toBeCloseTo(203.2, 6);
  });

  it('the column still caps it, and a smaller picture keeps its size', () => {
    const capped = buildDocument({ markdown: md('photo'), resources: [photo({ resolution: 300 })] }, page(600));
    expect(body(capped).width).toBeCloseTo(600, 6);
    expect(body(capped).height).toBeCloseTo(400, 6);
  });

  it('without a resolution the pixels are read at page.dpi, exactly as before', () => {
    const plain = buildDocument({ markdown: md('photo'), resources: [photo()] }, page(3000));
    expect(body(plain).width).toBeCloseTo(2400, 6);
    const explicit = buildDocument({ markdown: md('photo'), resources: [photo()] }, page(3000, { bitmapResolution: 'document' }));
    expect(JSON.stringify(explicit.pages)).toBe(JSON.stringify(plain.pages));
    // `'file'` with a placeholder resolution in the file changes nothing either.
    const placeholder = [photo({ fileResolution: 72 })];
    const file72 = buildDocument({ markdown: md('photo'), resources: placeholder }, page(3000, { bitmapResolution: 'file' }));
    const doc72 = buildDocument({ markdown: md('photo'), resources: placeholder }, page(3000));
    expect(JSON.stringify(file72.pages)).toBe(JSON.stringify(doc72.pages));
  });

  it('layout.bitmapResolution: a number applies to every bitmap without its own', () => {
    const resources = [photo({}, 'a'), photo({ resolution: 150 }, 'b')];
    const doc = buildDocument({ markdown: md('a', 'b'), resources }, page(3000, { bitmapResolution: 300 }));
    expect(body(doc, 'a').width).toBeCloseTo(1200, 6);
    // Its own resolution wins: 150 ppi on a 150 dpi page is its pixels.
    expect(body(doc, 'b').width).toBeCloseTo(2400, 6);
  });

  it("layout.bitmapResolution: 'file' uses the file's resolution, 72 and 96 counting as unset", () => {
    const resources = [
      photo({ fileResolution: 300 }, 'a'),
      photo({ fileResolution: 72 }, 'b'),
      photo({ fileResolution: 96 }, 'c'),
      photo({}, 'd'),
      photo({ fileResolution: 300, resolution: 72 }, 'e'),
    ];
    const doc = buildDocument({ markdown: md('a', 'b', 'c', 'd', 'e'), resources }, page(3000, { bitmapResolution: 'file' }));
    expect(body(doc, 'a').width).toBeCloseTo(1200, 6);
    expect(body(doc, 'b').width).toBeCloseTo(2400, 6);
    expect(body(doc, 'c').width).toBeCloseTo(2400, 6);
    expect(body(doc, 'd').width).toBeCloseTo(2400, 6);
    // A declared 72 is the author's: 2400 px at 72 ppi is 5000 layout px,
    // capped by the column.
    expect(body(doc, 'e').width).toBeCloseTo(3000, 6);
  });

  it('sizes a table-cell picture at its natural size too', () => {
    const icon: Resource = { ...photo({ width: 300, height: 300, resolution: 600 }, 'icon'), placement: undefined };
    const table: Resource = {
      id: 'tab', typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0,
      table: { model: { rows: [[{ content: 'x', image: { resourceId: 'icon' } }]] } },
      placement: { position: 'here' },
    };
    const doc = buildDocument({ markdown: md('tab'), resources: [icon, table] }, page(1500));
    let width: number | undefined;
    for (const p of doc.pages) {
      for (const b of p.columns.flatMap((c) => c.blocks)) {
        const cell = b.resourceBlock?.table?.cells?.find((c) => c.image);
        if (cell?.image) width = cell.image.rect.width;
      }
    }
    // 300 px at 600 ppi on a 150 dpi page: 75 layout px.
    expect(width).toBeCloseTo(75, 6);
  });

  it('resolves, strips and validates the setting', () => {
    expect(resolveLayoutConfig().bitmapResolution).toBe('document');
    expect(resolveLayoutConfig({ bitmapResolution: 'file' }).bitmapResolution).toBe('file');
    expect(resolveLayoutConfig({ bitmapResolution: 300 }).bitmapResolution).toBe(300);
    expect(resolveLayoutConfig({ bitmapResolution: -4 }).bitmapResolution).toBe('document');
    expect(resolveLayoutConfig({ bitmapResolution: 'dpi' as never }).bitmapResolution).toBe('document');
    expect(stripLayoutDefaults({ bitmapResolution: 'document' })).toBeUndefined();
    expect(stripLayoutDefaults({ bitmapResolution: 300 })).toEqual({ bitmapResolution: 300 });
  });

  it('helpers: the effective resolution, the natural size, and the stamp that leaves defaults untouched', () => {
    expect(bitmapResolutionFor({}, 'document')).toBeUndefined();
    expect(bitmapResolutionFor({ fileResolution: 300 }, 'document')).toBeUndefined();
    expect(bitmapResolutionFor({ fileResolution: 300 }, 'file')).toBe(300);
    expect(bitmapResolutionFor({ fileResolution: 96 }, 'file')).toBeUndefined();
    expect(bitmapResolutionFor({ resolution: 96 }, 'file')).toBe(96);
    expect(effectiveBitmapResolution({}, 240, 150)).toBe(240);
    expect(effectiveBitmapResolution({}, 'document', 150)).toBe(150);
    expect(bitmapLayoutSize({ width: 2400, height: 1600, resolution: 300 }, 150)).toEqual({ width: 1200, height: 800 });
    expect(bitmapLayoutSize({ width: 2400, height: 1600 }, 150)).toEqual({ width: 2400, height: 1600 });
    const resources = [photo()];
    expect(withBitmapResolutions(resources, 'document')).toBe(resources);
    expect(withBitmapResolutions(resources, 'file')).toBe(resources);
    const stamped = withBitmapResolutions(resources, 300);
    expect(stamped).not.toBe(resources);
    expect(stamped[0]!.bitmap!.resolution).toBe(300);
    expect(resources[0]!.bitmap!.resolution).toBeUndefined();
    expect(withBitmapResolutions(resources, 300)).toBe(stamped);
  });
});
