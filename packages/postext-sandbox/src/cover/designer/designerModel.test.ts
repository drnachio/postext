import { describe, expect, it } from 'vitest';
import { versionSheets, type ProductionSheet } from 'postext/production';
import { addElement, addFinish, addTextBox, designerItems, freeId, itemOf, nudge, placeItem, removeItem, reorderItem } from './designerModel.js';

function sheet(): ProductionSheet {
  const s = versionSheets({ id: 'pb', name: 'P', binding: 'perfect' }, { width: 150, height: 230 }, [{ pages: 240, grammage: 80, bulk: 1.2 }]);
  if (!('cover' in s)) throw new Error('no sheet');
  return s.cover;
}

const red = { hex: '#cc0000', model: 'hex' as const };

describe('cover designer model', () => {
  it('adds a text box in the middle of the front and moves it', () => {
    const sh = sheet();
    const { cover, ref } = addTextBox(undefined, sh);
    expect(ref).toEqual({ layer: 'textBoxes', id: 'text-1' });
    const item = designerItems(cover, sh)[0]!;
    const front = sh.zones.find((z) => z.name === 'front')!.rect;
    expect(item.rect!.x).toBeGreaterThan(front.x);
    const moved = placeItem(cover, sh, ref, nudge(item.rect!, 5, -2));
    expect(designerItems(moved, sh)[0]!.rect!.x).toBeCloseTo(item.rect!.x + 5, 2);
  });

  it('places an element by its zone and keeps it there when moved across the spine', () => {
    const sh = sheet();
    const { cover, ref } = addElement(undefined, sh, 'elements', { resourceId: 'art', aspect: 1.5 });
    const el = itemOf(cover, ref) as { zone: string; width: number; height: number };
    expect(el.zone).toBe('front');
    expect(el.height / el.width).toBeCloseTo(1.5, 1);
    const back = sh.zones.find((z) => z.name === 'back')!.rect;
    const onBack = placeItem(cover, sh, ref, { x: back.x + 10, y: back.y + 10, width: 40, height: 60 });
    expect((itemOf(onBack, ref) as { zone: string }).zone).toBe('back');
  });

  it('removes an element with the finish on its shape, and reorders a layer', () => {
    const sh = sheet();
    let { cover } = addElement(undefined, sh, 'elements', { color: red });
    const second = addElement(cover, sh, 'elements', { color: red });
    cover = second.cover;
    const fin = addFinish(cover, sh, 'foil', second.ref);
    expect(fin.cover.finishes![0]!.shape).toEqual({ element: 'box-2' });
    expect(designerItems(fin.cover, sh).find((i) => i.layer === 'finishes')!.rect).toBeUndefined();
    const front = reorderItem(fin.cover, { layer: 'elements', id: 'box-1' }, 1);
    expect(front.elements!.map((e) => e.id)).toEqual(['box-2', 'box-1']);
    const gone = removeItem(fin.cover, second.ref);
    expect(gone.elements!.map((e) => e.id)).toEqual(['box-1']);
    expect(gone.finishes).toBeUndefined();
  });

  it('gives a finish a box of its own, and ids that are free across layers', () => {
    const sh = sheet();
    const { cover } = addFinish(undefined, sh, 'varnish');
    expect('box' in cover.finishes![0]!.shape).toBe(true);
    expect(designerItems(cover, sh)[0]!.rect).toBeDefined();
    expect(freeId(new Set(['text-1', 'text-2']), 'text')).toBe('text-3');
  });
});
