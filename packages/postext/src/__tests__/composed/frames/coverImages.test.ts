import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { renderToHtml } from '../../../html-backend/html-backend.js';
import { placedImageResolutions } from '../../../checks/preflight.js';
import type { PageTemplate } from '../../../composed/types.js';
import type { DesignElement, PostextConfig, Resource, VDTDesignImageBlock, VDTDocument, VDTPage } from '../../../index.js';

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
/** A landscape photograph, twice as wide as tall. */
const photo = (extra: Partial<Resource> = {}): Resource => ({ id: 'foto', typeId: 'figure', kind: 'bitmap', caption: '', altText: 'A harbour at dawn', createdAt: 0, updatedAt: 0, bitmap: { fileId: 'f', format: 'jpeg', width: 4000, height: 2000 }, ...extra } as Resource);
/** The photo in a square box of 100 mm. */
const hero = (extra: Record<string, unknown> = {}): PageTemplate => ({
  id: 'hero',
  frames: [{ name: 'texto', flow: true, placement: { anchor: { to: 'container', edge: 'bottom-left' } }, height: mm(20) }],
  decoration: { elements: [{ kind: 'image', id: 'foto', resourceId: 'foto', placement: { anchor: { to: 'page', edge: 'top-left' }, size: { width: mm(100), height: mm(100) } }, ...extra } as DesignElement] },
});
const build = (tpl: PageTemplate, resources: Resource[] = [photo()]): VDTDocument =>
  buildDocument({ markdown: '::::page{template="hero"}\n\nA line.\n\n::::', resources }, { ...PAGE, pageTemplates: [tpl] }, createMeasurementCache());
const composedPage = (doc: VDTDocument): VDTPage => doc.pages.find((p) => p.composed)!;
const image = (doc: VDTDocument): VDTDesignImageBlock => composedPage(doc).composed!.decoration!.blocks.find((b): b is VDTDesignImageBlock => b.kind === 'image')!;

describe('design images that cover their box (#923)', () => {
  it('contain, the default, fits the whole picture inside the box', () => {
    const b = image(build(hero()));
    expect(b.crop).toBeUndefined();
    expect(b.bbox.width).toBeCloseTo(100 * MM, 3);
    expect(b.bbox.height).toBeCloseTo(50 * MM, 3);
  });

  it('cover fills the box and crops the sides, centred', () => {
    const b = image(build(hero({ fit: 'cover' })));
    expect(b.bbox).toMatchObject({ x: 0, y: 0 });
    expect(b.bbox.width).toBeCloseTo(100 * MM, 3);
    expect(b.bbox.height).toBeCloseTo(100 * MM, 3);
    expect(b.crop!.width).toBeCloseTo(0.5, 6);
    expect(b.crop!.height).toBeCloseTo(1, 6);
    expect(b.crop!.x).toBeCloseTo(0.25, 6);
  });

  it('a focus point moves the window; the safe area stays in view', () => {
    expect(image(build(hero({ fit: 'cover', focus: { x: 0.9, y: 0.5 } }))).crop!.x).toBeCloseTo(0.5, 6);
    expect(image(build(hero({ fit: 'cover', focus: { x: 0.1, y: 0.5 } }))).crop!.x).toBeCloseTo(0, 6);
    // The subject on the left third: the crop keeps it.
    const kept = image(build(hero({ fit: 'cover', focus: { x: 0.9, y: 0.5 } }), [photo({ safeArea: { x: 0.05, y: 0, width: 0.3, height: 1 } })])).crop!;
    expect(kept.x).toBeLessThanOrEqual(0.05 + 1e-6);
    expect(kept.x + kept.width).toBeGreaterThanOrEqual(0.35 - 1e-6);
    // A safe area wider than the box allows: the smallest window holding
    // it, the box not filled across.
    const wide = image(build(hero({ fit: 'cover' }), [photo({ safeArea: { x: 0.1, y: 0, width: 0.8, height: 1 } })]));
    expect(wide.crop!.width).toBeCloseTo(0.8, 6);
    expect(wide.bbox.height).toBeLessThan(100 * MM - 1);
  });

  it('the HTML clips the whole picture to the box; preflight reads the share shown', () => {
    const doc = build(hero({ fit: 'cover' }));
    const html = renderToHtml(doc, { resourceImageUrl: () => 'photo.jpg' } as never);
    expect(html).toMatch(/overflow:hidden;"><img src="photo\.jpg"[^>]*width:2362\.\d+px;height:1181\.\d+px/);
    // The share shown, 2000 × 2000 px of the picture, across 100 mm: 508 ppi
    // both ways (the whole picture's 4000 px over the box would read 1016).
    const [placed] = placedImageResolutions(doc, { resources: [photo()] });
    expect(placed!.ppi).toBeCloseTo(2000 / (100 / 25.4), 0);
  });
});
