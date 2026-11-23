import { describe, expect, it } from 'vitest';
import { versionSheets, type ProductionSheet } from 'postext/production';
import { continuedFrom, renameTextBoxRefs, addCatalogue, addElement, addFinish, addTextBox, designerItems, freeId, itemOf, nudge, placeItem, removeItem, reorderItem } from './designerModel.js';

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

  it('adds a catalogue across the front, the book’s own outlined (#1673)', () => {
    const sh = sheet();
    const { cover, ref } = addCatalogue(undefined, sh, 4);
    expect(ref).toEqual({ layer: 'elements', id: 'catalogue-1' });
    const el = itemOf(cover, ref) as { kind: string; zone: string; gap: number; stroke?: unknown };
    expect(el).toMatchObject({ kind: 'catalogue', zone: 'front', gap: 3 });
    expect(el.stroke).toBeDefined();
    expect(designerItems(cover, sh)[0]).toMatchObject({ kind: 'catalogue' });
  });

  // #1679: a text box anchored to a panel or a box, continued in another.
  it('moves an anchored text box by its offset and lets go of a removed box', () => {
    const sh = sheet();
    const front = sh.zones.find((z) => z.name === 'front')!.safe;
    const cover = { textBoxes: [
      { name: 'a', rect: { x: 0, y: 0, width: 40, height: 10 }, anchor: { to: 'front', edge: 'top-left' as const } },
      { name: 'b', rect: { x: 0, y: 0, width: 40, height: 10 }, anchor: { to: 'a', edge: 'below' as const, y: 2 }, next: 'c' },
      { name: 'c', rect: { x: 0, y: 0, width: 40, height: 10 } },
    ] };
    const items = designerItems(cover, sh);
    expect(items[1]!.rect!.y).toBeCloseTo(front.y + 12, 6);
    const moved = placeItem(cover, sh, { layer: 'textBoxes', id: 'b' }, nudge(items[1]!.rect!, 3, 1));
    expect((itemOf(moved, { layer: 'textBoxes', id: 'b' }) as { anchor: unknown }).anchor).toEqual({ to: 'a', edge: 'below', x: 3, y: 3 });
    expect(continuedFrom(cover, 'c')).toBe('b');
    const renamed = renameTextBoxRefs(cover, 'a', 'head');
    expect(renamed.textBoxes![1]!.anchor!.to).toBe('head');
    const without = removeItem(cover, { layer: 'textBoxes', id: 'a' }, sh);
    const b = itemOf(without, { layer: 'textBoxes', id: 'b' }) as { anchor?: unknown; rect: { y: number } };
    expect(b.anchor).toBeUndefined();
    expect(b.rect.y).toBeCloseTo(front.y + 12, 1);
    expect((itemOf(removeItem(cover, { layer: 'textBoxes', id: 'c' }, sh), { layer: 'textBoxes', id: 'b' }) as { next?: string }).next).toBeUndefined();
  });
});
