import { describe, it, expect } from 'vitest';
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
import { buildDocument } from '../../pipeline/build/drivers.js';
import { composedPaintOrder, decorationOver } from '../../composed/paint.js';
import { caseSheet, coverElementRect, coverMarkdown, coverPage, placeCoverElement, resolveBindingMeasures, softcoverSheet, type CoverDesign } from '../../production/index.js';
import type { Resource } from '../../types.js';

const trim = { width: 150, height: 230 };
const m = resolveBindingMeasures({ id: 'x', name: 'X', style: 'perfect' }, trim);
const sheet = softcoverSheet(trim, 20, m, false);
const ink = (hex: string) => ({ hex, model: 'hex' as const });
const logo: Resource = {
  id: 'seal', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: 'seal.png', format: 'png', width: 200, height: 100 },
  contour: { points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: 1 }] },
};
const design: CoverDesign = {
  background: ink('#123456'),
  effects: [{ id: 'veil', kind: 'box', color: ink('#000000'), opacity: 0.5, zone: 'front', x: 0, y: 0, width: 150, height: 40 }],
  logos: [{ id: 'pub', kind: 'image', resourceId: 'seal', zone: 'front', x: 10, y: 200, width: 40, height: 20, clearance: 4 }],
  finishes: [
    { id: 'gloss', kind: 'varnish', ink: 'Barniz UVI', shape: { box: { zone: 'front', x: 20, y: 20, width: 50, height: 30 } } },
    { id: 'gold', kind: 'foilGold', ink: 'Oro', shape: { element: 'pub' } },
  ],
};

function ids(cover: ReturnType<typeof coverPage>): string[] {
  return (cover.template.decoration?.elements ?? []).map((e) => ('id' in e ? e.id : ''));
}

describe('cover layers over the text', () => {
  it('stacks the grounds under the text and the effects, logos, barcode and finishes over it', () => {
    const cover = coverPage(sheet, { design, isbn: '978-0-306-40615-7', resources: [logo] });
    expect(ids(cover)).toEqual(['cover-ground', 'cover-fx-veil', 'cover-logo-pub', 'isbn-barcode', 'cover-finish-gloss', 'cover-finish-gold']);
    const over = (cover.template.decoration!.elements as { id: string; over?: boolean }[]).filter((e) => e.over).map((e) => e.id);
    expect(over).toEqual(['cover-fx-veil', 'cover-logo-pub', 'isbn-barcode', 'cover-finish-gloss', 'cover-finish-gold']);
  });

  it('draws a translucent box at its opacity, and a finish translucent on screen', () => {
    const els = coverPage(sheet, { design, resources: [logo] }).template.decoration!.elements as { id: string; style?: { backgroundColor?: { hex: string } }; fill?: { hex: string } }[];
    expect(els.find((e) => e.id === 'cover-fx-veil')!.style!.backgroundColor!.hex).toBe('#00000080');
    expect(els.find((e) => e.id === 'cover-finish-gloss')!.style!.backgroundColor!.hex).toMatch(/^#[0-9a-f]{6}73$/);
  });

  it('makes each finish a solid, overprinting spot plate for the press, a logo’s in its contour', () => {
    const els = coverPage(sheet, { design, resources: [logo], finishes: 'press' }).template.decoration!.elements as {
      id: string; kind: string; d?: string; style?: { backgroundColor?: { model: string; spot?: { name: string; overprint?: boolean; tint?: number } } }; fill?: { model: string; spot?: { name: string; overprint?: boolean } };
    }[];
    const gloss = els.find((e) => e.id === 'cover-finish-gloss')!;
    expect(gloss.style!.backgroundColor).toMatchObject({ model: 'spot', spot: { name: 'Barniz UVI', overprint: true, tint: 100 } });
    const gold = els.find((e) => e.id === 'cover-finish-gold')!;
    expect(gold.kind).toBe('path');
    expect(gold.d).toBe('M 0 0 L 1 0 L 0.5 1 Z');
    expect(gold.fill).toMatchObject({ model: 'spot', spot: { name: 'Oro', overprint: true } });
  });

  it('paints those blocks after every frame of the page', () => {
    const cover = coverPage(sheet, { design });
    const doc = buildDocument(
      { markdown: coverMarkdown('cover', { front: 'Título' }, cover.slots) },
      { page: { ...cover.page, dpi: 72 }, header: { elements: [] }, footer: { elements: [] }, pageTemplates: [cover.template] },
    );
    const page = doc.pages[0]!;
    const order = composedPaintOrder(page).map((i) => i.kind);
    expect(order[order.length - 1]).toBe('over');
    expect(order.indexOf('decoration')).toBeLessThan(order.indexOf('frame'));
    // The veil, the varnish and the gold (a box: the logo's picture is not
    // in this document, so it has no contour to take).
    const over = decorationOver(page.composed!.decoration)!.blocks.map((b) => b.kind);
    expect(over).toEqual(['box', 'box', 'box']);
  });
});

describe('finish inks', () => {
  it('gives each ink a screen colour of its own, so plates of one kind stay apart', () => {
    const two: CoverDesign = {
      finishes: [
        { id: 'a', kind: 'varnish', ink: 'Barniz brillo', shape: { box: { zone: 'front', x: 0, y: 0, width: 10, height: 10 } } },
        { id: 'b', kind: 'varnish', ink: 'Barniz mate', shape: { box: { zone: 'front', x: 20, y: 0, width: 10, height: 10 } } },
      ],
    };
    const els = coverPage(sheet, { design: two, finishes: 'press' }).template.decoration!.elements as { style: { backgroundColor: { hex: string } } }[];
    const [a, b] = els.map((e) => e.style.backgroundColor.hex);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('draws a veil with an outline as a path, and a finish laid on a saved outline', () => {
    const tri = [[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: 1 }]];
    const cover = coverPage(sheet, {
      design: {
        effects: [{ id: 'shade', kind: 'shape', color: ink('#000000'), opacity: 0.5, outline: tri, zone: 'front', x: 0, y: 0, width: 40, height: 40 }],
        finishes: [
          { id: 'traced', kind: 'varnish', ink: 'Barniz', shape: { outline: tri, box: { zone: 'front', x: 10, y: 10, width: 20, height: 20 } } },
          { id: 'onShade', kind: 'foilGold', ink: 'Oro', shape: { element: 'shade' } },
        ],
      },
    });
    const els = cover.template.decoration!.elements as { id: string; kind: string; d?: string; fill?: { hex: string } }[];
    const shade = els.find((e) => e.id === 'cover-fx-shade')!;
    expect(shade.kind).toBe('path');
    expect(shade.d).toBe('M 0 0 L 1 0 L 0.5 1 Z');
    expect(shade.fill!.hex).toBe('#00000080');
    expect(els.find((e) => e.id === 'cover-finish-traced')!.kind).toBe('path');
    expect(els.find((e) => e.id === 'cover-finish-onShade')!.d).toBe('M 0 0 L 1 0 L 0.5 1 Z');
  });

  it('cuts an effect’s picture to its outline as a picture of its own, and lays a finish on that cut', () => {
    const tri = [[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: 1 }]];
    const shine = { id: 'shine', kind: 'image' as const, resourceId: 'gloss', clip: tri, zone: 'front' as const, x: 10, y: 10, width: 40, height: 20 };
    const cover = coverPage(sheet, {
      mirrorPictures: { gloss: { href: 'data:image/png;base64,AAAA', width: 100, height: 100 } },
      design: { effects: [shine], finishes: [{ id: 'f', kind: 'varnish', ink: 'Barniz', shape: { element: 'shine' } }] },
    });
    const els = cover.template.decoration!.elements as { id: string; resourceId?: string; d?: string }[];
    expect(els.find((e) => e.id === 'cover-fx-shine')!.resourceId).toBe('cover-clip-shine');
    expect(els.find((e) => e.id === 'cover-finish-f')!.d).toBe('M 0 0 L 1 0 L 0.5 1 Z');
    const svg = new TextDecoder().decode(cover.files['cover-clip-shine.svg']);
    expect(svg).toContain('<clipPath id="shape"');
    expect(svg).toContain('matrix(40 0 0 20 0 0)');
    // The square picture fills the 40 × 20 box: 40 wide, cropped top and bottom.
    expect(svg).toContain('x="0" y="-10" width="40" height="40"');
    expect(cover.resources.map((r) => r.id)).toContain('cover-clip-shine');
    expect(cover.clipSkipped).toBeUndefined();
  });

  it('draws an effect whole when its picture is not at hand, and says so', () => {
    const cover = coverPage(sheet, { design: { effects: [{ id: 'shine', kind: 'image', resourceId: 'gloss', clip: [[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]], zone: 'front', x: 0, y: 0, width: 10, height: 10 }] } });
    const els = cover.template.decoration!.elements as { id: string; resourceId?: string }[];
    expect(els.find((e) => e.id === 'cover-fx-shine')!.resourceId).toBe('gloss');
    expect(cover.clipSkipped).toEqual(['gloss']);
  });

  it('prints the whole work’s ISBN as text over the barcode, as wide as it', () => {
    const cover = coverPage(sheet, { isbn: '978-0-306-40615-7', workIsbnCaption: 'ISBN obra completa 978-84-9835-000-2' });
    const els = cover.template.decoration!.elements as { id: string; kind: string; content?: string; placement: { offset: { y: { value: number } }; size: { width: { value: number } } } }[];
    const code = els.find((e) => e.id === 'isbn-barcode')!;
    const text = els.find((e) => e.id === 'isbn-work')!;
    expect(text.kind).toBe('text');
    expect(text.content).toBe('ISBN obra completa 978-84-9835-000-2');
    expect(text.placement.size.width.value).toBeCloseTo(code.placement.size.width.value, 3);
    expect(text.placement.offset.y.value).toBeLessThan(code.placement.offset.y.value);
    // Without the volume's barcode, nothing to print it by.
    expect((coverPage(sheet, { workIsbnCaption: 'x' }).template.decoration?.elements ?? []).some((e) => 'id' in e && e.id === 'isbn-work')).toBe(false);
  });

  it('cuts an element’s picture to its outline too, and folds it out cut', () => {
    const tri = [[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: 1 }]];
    const m = resolveBindingMeasures({ id: 'c', name: 'C', style: 'caseFlat' }, { width: 150, height: 230 });
    const cs = caseSheet({ width: 150, height: 230 }, 20, m);
    const cover = coverPage(cs, {
      mirrorMargin: m.designMargin,
      mirrorPictures: { art: { href: 'data:image/png;base64,AAAA', width: 100, height: 100 } },
      design: { elements: [{ id: 'figure', kind: 'image', resourceId: 'art', clip: tri, zone: 'front', x: -5, y: 10, width: 40, height: 40 }] },
    });
    const els = cover.template.decoration!.elements as { id: string; resourceId?: string }[];
    expect(els.find((e) => e.id === 'cover-el-figure')!.resourceId).toBe('cover-clip-figure');
    const mirror = new TextDecoder().decode(cover.files['cover-mirror.svg']);
    expect(mirror).toContain('<clipPath id="mclip');
  });
});

describe('cover text boxes', () => {
  it('are frames of their own where they were put, a turned one with its sides swapped', () => {
    const trim = { width: 150, height: 230 };
    const sheet = softcoverSheet(trim, 20, resolveBindingMeasures({ id: 'x', name: 'X', style: 'perfect' }, trim), false);
    const cover = coverPage(sheet, { textBoxes: [
      { name: 'box-title', rect: { x: 200, y: 20, width: 100, height: 30 }, verticalAlign: 'bottom' },
      { name: 'box-spine', rect: { x: 168, y: 20, width: 10, height: 150 }, rotate: -90 },
    ] });
    expect(cover.slots).toContain('box-title');
    const frames = cover.template.frames ?? [];
    const title = frames.find((f) => f.name === 'box-title')!;
    expect(title.width).toEqual({ value: 100, unit: 'mm' });
    expect(title.verticalAlign).toBe('bottom');
    const spine = frames.find((f) => f.name === 'box-spine')!;
    expect(spine.width).toEqual({ value: 150, unit: 'mm' });
    expect(spine.rotate).toBe(-90);
    expect(coverMarkdown('cover', { 'box-title': 'Título' }, cover.slots)).toContain(':::frame{slot="box-title"}');
  });
});

describe('an element across zones', () => {
  it('keeps each edge on its own zone when the spine grows', () => {
    const trim = { width: 150, height: 230 };
    const m = resolveBindingMeasures({ id: 'x', name: 'X', style: 'perfect' }, trim);
    const thin = softcoverSheet(trim, 6, m, false);
    const thick = softcoverSheet(trim, 30, m, false);
    const back = thin.zones.find((z) => z.name === 'back')!.rect;
    const front = thin.zones.find((z) => z.name === 'front')!.rect;
    // A band from the middle of the back cover to the middle of the front.
    const band = placeCoverElement(thin, { id: 'b', kind: 'box', zone: 'front', x: 0, y: 0, width: 1, height: 1 }, { x: back.x + 50, y: 10, width: front.x + 50 - back.x - 50, height: 5 });
    expect(band.zone).toBe('back');
    expect(band.to?.zone).toBe('front');
    const r = coverElementRect(thick, band)!;
    const backT = thick.zones.find((z) => z.name === 'back')!.rect;
    const frontT = thick.zones.find((z) => z.name === 'front')!.rect;
    expect(r.x).toBeCloseTo(backT.x + 50, 6);
    expect(r.x + r.width).toBeCloseTo(frontT.x + 50, 6);
    // Within one zone, as before: no `to`.
    expect(placeCoverElement(thin, band, { x: front.x + 10, y: 10, width: 20, height: 5 }).to).toBeUndefined();
  });
});
