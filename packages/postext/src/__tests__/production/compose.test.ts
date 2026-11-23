import { describe, it, expect } from 'vitest';
import {
  caseSheet,
  coverSource,
  coverElementRect,
  coverPage,
  PROMO_FORMATS,
  placeCoverElement,
  promoSheet,
  resolveBindingMeasures,
  sheetGuides,
  softcoverSheet,
  type ProductionSheet,
} from '../../production/index.js';
import type { TrimMm } from '../../types.js';

const trim: TrimMm = { width: 150, height: 230 };
const zone = (sheet: ProductionSheet, name: string) => sheet.zones.find((z) => z.name === name)!;

describe('coverPage', () => {
  const m = resolveBindingMeasures({ id: 'x', name: 'X', style: 'perfect' }, trim);

  it('gives each zone a frame in its safe area, measured from the trim', () => {
    const sheet = softcoverSheet(trim, 20, m, true);
    const cover = coverPage(sheet);
    expect(cover.slots).toEqual(['flapBack', 'back', 'spine', 'front', 'flapFront']);
    const front = cover.template.frames!.find((f) => f.name === 'front')!;
    const safe = zone(sheet, 'front').safe;
    expect(front.placement!.offset!.x!.value).toBeCloseTo(safe.x - sheet.trim.x, 3);
    expect(front.width).toEqual({ value: Math.round(safe.width * 1000) / 1000, unit: 'mm' });
    expect(cover.page.width).toEqual({ value: sheet.trim.width, unit: 'mm' });
    expect(cover.page.cutLines!.bleed).toEqual({ value: m.bleed, unit: 'mm' });
  });

  it('turns the spine frame to read down it by default, or up it', () => {
    const sheet = softcoverSheet(trim, 20, m, false);
    // Falling (ISO 6357, #1677): right way up with the book face up.
    const down = coverPage(sheet).template.frames!.find((f) => f.name === 'spine')!;
    expect(down.rotate).toBe(90);
    expect(down.width).toEqual({ value: zone(sheet, 'spine').safe.height, unit: 'mm' });
    const up = coverPage(sheet, { spineText: { direction: 'bottomToTop' } }).template.frames!.find((f) => f.name === 'spine')!;
    expect(up.rotate).toBe(-90);
  });

  it('leaves a spine too thin for text without a frame', () => {
    expect(coverPage(softcoverSheet(trim, 4, m, false)).slots).not.toContain('spine');
  });

  it("marks the folds inside the trim, not a case's turn-in folds", () => {
    const soft = softcoverSheet(trim, 20, m, true);
    expect(coverPage(soft).page.cutLines!.foldMarks!.length).toBe(soft.lines.length);
    const c = resolveBindingMeasures({ id: 'y', name: 'Y', style: 'caseFlat' }, trim);
    const cs = caseSheet(trim, 26, c);
    expect(coverPage(cs).page.cutLines!.foldMarks!.length).toBe(4);
  });

  it('draws the barcode in the back cover by the spine and the foot', () => {
    const sheet = softcoverSheet(trim, 20, m, false);
    const cover = coverPage(sheet, { isbn: '978-0-306-40615-7' });
    const el = cover.template.decoration!.elements[0] as { placement: { offset: { x: { value: number } }; size: { width: { value: number } } } };
    const back = zone(sheet, 'back').safe;
    expect(el.placement.offset.x.value + el.placement.size.width.value).toBeCloseTo(back.x + back.width - sheet.trim.x, 2);
    expect(new TextDecoder().decode(cover.files['postext-cover-isbn.svg'])).toContain('ISBN 978-0-306-40615-7');
    expect(coverPage(sheet, { isbn: 'nope' }).resources).toEqual([]);
  });

  it('reports an ISBN that does not read and makes no barcode', () => {
    const sheet = softcoverSheet(trim, 20, m, false);
    const cover = coverPage(sheet, { isbn: 'nope' });
    expect(cover.issues).toEqual([{ kind: 'coverIsbnInvalid', isbn: 'nope' }]);
    expect(cover.template.decoration).toBeUndefined();
  });

  it('wraps the cover Markdown in the cover page fence', () => {
    const { markdown, issues } = coverSource(':::frame{slot="back"}\nBlurb.\n:::', ['back', 'front']);
    expect(markdown).toBe('::::page{template="postext-cover"}\n:::frame{slot="back"}\nBlurb.\n:::\n::::');
    expect(issues).toEqual([]);
  });
});

describe('cover design', () => {
  const m = resolveBindingMeasures({ id: 'x', name: 'X', style: 'perfect' }, trim);
  const ink = (hex: string) => ({ hex, model: 'hex' as const });
  type Placed = { id: string; kind: string; fit?: string; placement: { offset: { x: { value: number }; y: { value: number } }; size: { width: { value: number }; height: { value: number } } } };

  it('draws the ground, the picture and the zones under the barcode, into the bleed', () => {
    const sheet = softcoverSheet(trim, 20, m, true);
    const cover = coverPage(sheet, {
      isbn: '978-0-306-40615-7',
      cover: { background: ink('#123456'), image: { resourceId: 'photo' }, zones: { spine: ink('#ffcc00'), flapFront: ink('#eeeeee') } },
    });
    const els = cover.template.decoration!.elements as Placed[];
    expect(els.map((e) => e.id)).toEqual(['cover-ground', 'cover-image', 'cover-zone-spine', 'cover-zone-flapFront', 'cover-isbn']);
    const ground = els[0]!;
    expect(ground.placement.size.width.value).toBeCloseTo(sheet.width, 3);
    expect(els[1]!.fit).toBe('cover');
    // The spine runs from the top of the bleed to its foot, between its folds.
    const spine = els[2]!;
    expect(spine.placement.offset.y.value).toBe(0);
    expect(spine.placement.size.height.value).toBeCloseTo(sheet.height, 3);
    expect(spine.placement.offset.x.value).toBeCloseTo(zone(sheet, 'spine').rect.x, 3);
    // The front flap reaches the right edge of the bleed.
    const flap = els[3]!;
    expect(flap.placement.offset.x.value + flap.placement.size.width.value).toBeCloseTo(sheet.width, 3);
  });

  it('puts the picture on the front cover only when asked', () => {
    const sheet = softcoverSheet(trim, 20, m, false);
    const els = coverPage(sheet, { cover: { image: { resourceId: 'photo', area: 'front' } } }).template.decoration!.elements as Placed[];
    const front = zone(sheet, 'front').rect;
    expect(els[0]!.placement.offset.x.value).toBeCloseTo(front.x, 3);
    expect(els[0]!.placement.offset.x.value + els[0]!.placement.size.width.value).toBeCloseTo(sheet.width, 3);
  });

  it('draws nothing without a design', () => {
    expect(coverPage(softcoverSheet(trim, 20, m, false)).template.decoration).toBeUndefined();
  });
});

describe('zone placement', () => {
  it('sets a zone’s text at the top, middle or foot of it', () => {
    const m = resolveBindingMeasures({ id: 'x', name: 'X', style: 'perfect' }, trim);
    const cover = coverPage(softcoverSheet(trim, 20, m, false), { cover: { verticalAlign: { front: 'bottom', back: 'top' } } });
    const frames = Object.fromEntries(cover.template.frames!.map((f) => [f.name, f]));
    expect(frames.front!.verticalAlign).toBe('bottom');
    expect(frames.back!.verticalAlign).toBeUndefined();
    expect(frames.spine!.verticalAlign).toBe('middle');
  });
});

describe('promoSheet', () => {
  it('recomposes the front cover in a screen format, without bleed or marks', () => {
    const sheet = promoSheet(trim, 'epub', 5);
    expect(sheet.width).toBe(150);
    expect(sheet.height).toBeCloseTo(240, 6);
    expect(sheet.zones.map((z) => z.name)).toEqual(['front']);
    expect(promoSheet(trim, 'square', 5).height).toBe(150);
    const cover = coverPage(sheet, { isbn: '978-0-306-40615-7', cover: { image: { resourceId: 'p', area: 'front' } } });
    expect(cover.page.cutLines).toEqual({ enabled: false });
    expect(cover.slots).toEqual(['front']);
    expect(cover.resources).toEqual([]);
    expect((cover.template.decoration!.elements[0] as { placement: { size: { height: { value: number } } } }).placement.size.height.value).toBeCloseTo(240, 3);
    expect(PROMO_FORMATS.story).toEqual({ width: 1080, height: 1920 });
  });
});

describe('sheetGuides', () => {
  const m = resolveBindingMeasures({ id: 'x', name: 'X', style: 'perfect' }, trim);

  it('puts a guide on every fold and score, measured from the trim, and none on its edges', () => {
    const sheet = softcoverSheet(trim, 20, m, true);
    const guides = sheetGuides(sheet);
    for (const l of sheet.lines) {
      expect(guides).toContainEqual(expect.objectContaining({ orientation: 'vertical', at: expect.closeTo(l.x - sheet.trim.x, 3), kind: l.kind }));
    }
    expect(guides.every((g) => g.at > 0 && g.at < (g.orientation === 'vertical' ? sheet.trim.width : sheet.trim.height))).toBe(true);
  });

  it('marks each safe area once, the spine’s included', () => {
    const sheet = softcoverSheet(trim, 20, m, false);
    const guides = sheetGuides(sheet);
    const spine = zone(sheet, 'spine').safe;
    expect(guides).toContainEqual({ orientation: 'vertical', at: expect.closeTo(spine.x - sheet.trim.x, 3), kind: 'safe' });
    const top = guides.filter((g) => g.orientation === 'horizontal');
    expect(top.map((g) => g.at)).toEqual([...new Set(top.map((g) => g.at))]);
    expect(top).toContainEqual({ orientation: 'horizontal', at: expect.closeTo(zone(sheet, 'front').safe.y - sheet.trim.y, 3), kind: 'safe' });
  });

  it('marks a case’s joints', () => {
    const c = resolveBindingMeasures({ id: 'y', name: 'Y', style: 'caseFlat' }, trim);
    expect(sheetGuides(caseSheet(trim, 26, c)).filter((g) => g.kind === 'joint').length).toBeGreaterThan(0);
  });
});

describe('cover elements', () => {
  const m = resolveBindingMeasures({ id: 'x', name: 'X', style: 'perfect' }, trim);

  it('stand by their zone, so they move with it when the spine grows', () => {
    const el = { id: 'a', kind: 'box' as const, color: { hex: '#ff0000', model: 'hex' as const }, zone: 'front' as const, x: 10, y: 20, width: 30, height: 40 };
    const thin = coverElementRect(softcoverSheet(trim, 10, m, false), el)!;
    const thick = coverElementRect(softcoverSheet(trim, 30, m, false), el)!;
    expect(thick.x - thin.x).toBeCloseTo(20, 3);
    expect(thick.y).toBe(thin.y);
  });

  it('fall back to the board when the sheet has no flap', () => {
    const el = { id: 'a', kind: 'box' as const, zone: 'flapFront' as const, x: 0, y: 0, width: 5, height: 5 };
    expect(coverElementRect(softcoverSheet(trim, 10, m, false), el)!.x).toBeCloseTo(zone(softcoverSheet(trim, 10, m, false), 'front').rect.x, 3);
  });

  it('are placed by the zone their centre falls in when moved', () => {
    const sheet = softcoverSheet(trim, 20, m, false);
    const back = zone(sheet, 'back').rect;
    const el = { id: 'a', kind: 'box' as const, zone: 'front' as const, x: 0, y: 0, width: 10, height: 10 };
    const moved = placeCoverElement(sheet, el, { x: back.x + 5, y: back.y + 5, width: 10, height: 10 });
    expect(moved).toMatchObject({ zone: 'back', x: 5, y: 5 });
    expect(coverElementRect(sheet, moved)).toEqual({ x: back.x + 5, y: back.y + 5, width: 10, height: 10 });
  });

  it('are drawn over the grounds, in order, and a box without a colour is left out', () => {
    const sheet = softcoverSheet(trim, 20, m, false);
    const red = { hex: '#ff0000', model: 'hex' as const };
    const cover = coverPage(sheet, {
      cover: {
        background: red,
        elements: [
          { id: 'pic', kind: 'image', resourceId: 'logo', zone: 'front', x: 1, y: 1, width: 10, height: 10 },
          { id: 'none', kind: 'box', zone: 'front', x: 1, y: 1, width: 10, height: 10 },
          { id: 'band', kind: 'box', color: red, zone: 'back', x: 0, y: 0, width: 10, height: 10 },
        ],
      },
    });
    expect(cover.template.decoration!.elements.map((e) => e.id)).toEqual(['cover-ground', 'cover-el-pic', 'cover-el-band']);
  });
});
