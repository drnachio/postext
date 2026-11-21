import { describe, expect, it } from 'vitest';
import { resolveBindingMeasures, softcoverSheet, type Resource } from 'postext';
import {
  designShowing,
  elementAt,
  elementRect,
  elementUnder,
  newElement,
  readCoverElements,
  restack,
  type CoverElementSetting,
} from './coverLayers.js';
import { coverDocumentInput } from './bookProduction.js';

const trim = { width: 150, height: 230 };
const sheet = softcoverSheet(trim, 20, resolveBindingMeasures({ id: 'x', name: 'X', style: 'perfect' }, trim), false);
const box = (id: string, over: Partial<CoverElementSetting> = {}): CoverElementSetting => ({ id, kind: 'box', color: '#ff0000', zone: 'front', x: 10, y: 10, width: 20, height: 20, ...over });
const picture = { id: 'pic', kind: 'bitmap', typeId: 'figure', createdAt: 0, updatedAt: 0, bitmap: { fileId: 'f', width: 400, height: 200 } } as unknown as Resource;

describe('cover layers', () => {
  it('reads only the elements that hold together', () => {
    expect(readCoverElements([box('a'), { ...box('b'), zone: 'nowhere' }, { ...box('c'), width: 0 }, { ...box('d'), color: 'red' }, { id: 'e', kind: 'image', zone: 'front', x: 0, y: 0, width: 1, height: 1 }])).toEqual([box('a')]);
  });

  it('starts a picture in the middle of the front cover at its proportions', () => {
    const el = newElement(sheet, 'image', picture)!;
    expect(el.width / el.height).toBeCloseTo(2, 2);
    const front = sheet.zones.find((z) => z.name === 'front')!.rect;
    const r = elementRect(sheet, el)!;
    expect(r.x + r.width / 2).toBeCloseTo(front.x + front.width / 2, 1);
  });

  it('moves an element onto the back cover and keeps it there by that zone', () => {
    const back = sheet.zones.find((z) => z.name === 'back')!.rect;
    const moved = elementAt(sheet, box('a'), { x: back.x + 3, y: back.y + 4, width: 20, height: 20 });
    expect(moved).toMatchObject({ zone: 'back', x: 3, y: 4, color: '#ff0000' });
  });

  it('picks the front-most element under the pointer, and restacks', () => {
    const r = elementRect(sheet, box('a'))!;
    expect(elementUnder(sheet, [box('a'), box('b')], r.x + 1, r.y + 1)?.id).toBe('b');
    expect(restack([box('a'), box('b')], 'a', 1).map((e) => e.id)).toEqual(['b', 'a']);
    expect(restack([box('a'), box('b')], 'b', 1).map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('leaves a hidden layer out of the sheet', () => {
    const design = { background: '#000000', elements: [box('a')] };
    expect(designShowing(design, new Set(['background']))).toEqual({ elements: [box('a')] });
    const config = { page: { width: { value: 150, unit: 'mm' }, height: { value: 230, unit: 'mm' } } } as never;
    const version = { id: 'v', name: 'V', binding: 'perfect' } as never;
    const shown = coverDocumentInput(sheet, version, { front: '# Title' }, config, design);
    const hidden = coverDocumentInput(sheet, version, { front: '# Title' }, config, design, [], { hidden: new Set(['elements', 'texts']) });
    expect(shown.cover.template.decoration!.elements.map((e) => e.id)).toContain('cover-el-a');
    expect(hidden.cover.template.decoration!.elements.map((e) => e.id)).not.toContain('cover-el-a');
    expect(shown.markdown).toContain('Title');
    expect(hidden.markdown).not.toContain('Title');
  });
});

describe('effects, logos and finishes', () => {
  it('reads an effect’s opacity, a logo’s clear space and a finish’s shape', async () => {
    const { readCoverElements, readCoverLogos, readCoverFinishes } = await import('./coverLayers.js');
    expect(readCoverElements([{ id: 'v', kind: 'box', color: '#000000', zone: 'front', x: 0, y: 0, width: 10, height: 10, opacity: 0.4 }])[0]!.opacity).toBe(0.4);
    expect(readCoverElements([{ id: 'v', kind: 'box', color: '#000000', zone: 'front', x: 0, y: 0, width: 10, height: 10, opacity: 1 }])[0]!.opacity).toBeUndefined();
    expect(readCoverLogos([{ id: 'l', logoId: 'pub', zone: 'back', x: 1, y: 2, width: 20, height: 10, clearance: 3 }])).toEqual([
      { id: 'l', kind: 'image', resourceId: 'logo:pub', logoId: 'pub', zone: 'back', x: 1, y: 2, width: 20, height: 10, clearance: 3 },
    ]);
    expect(readCoverLogos([{ id: 'l', zone: 'back', x: 1, y: 2, width: 20, height: 10 }])).toEqual([]);
    expect(readCoverFinishes([
      { id: 'a', kind: 'varnish', ink: 'Barniz', shape: { box: { zone: 'front', x: 1, y: 2, width: 3, height: 4 } } },
      { id: 'b', kind: 'foilGold', ink: 'Oro', shape: { element: 'l' } },
      { id: 'c', kind: 'glitter', ink: 'X', shape: { element: 'l' } },
      { id: 'd', kind: 'emboss', ink: 'X', shape: {} },
    ]).map((f) => f.id)).toEqual(['a', 'b']);
  });

  it('moves a finish’s own box on the canvas, and places new logos and finishes on the front', async () => {
    const { finishAsElement, finishFromElement, newFinish, newLogo } = await import('./coverLayers.js');
    const finish = { id: 'a', kind: 'varnish' as const, ink: 'Barniz', shape: { box: { zone: 'front' as const, x: 1, y: 2, width: 3, height: 4 } } };
    const el = finishAsElement(finish, '#7fb2e5')!;
    expect(el).toMatchObject({ id: 'a', kind: 'box', color: '#7fb2e5', zone: 'front', x: 1 });
    expect(finishFromElement(finish, { ...el, x: 9 }).shape).toEqual({ box: { zone: 'front', x: 9, y: 2, width: 3, height: 4 } });
    expect(finishAsElement({ ...finish, shape: { element: 'x' } }, '#fff')).toBeUndefined();
    const logo = newLogo(sheet, { logoId: 'pub' }, 2, 3)!;
    expect(logo).toMatchObject({ kind: 'image', logoId: 'pub', resourceId: 'logo:pub', zone: 'front', clearance: 3 });
    expect(logo.width / logo.height).toBeCloseTo(2, 1);
    expect(newFinish(sheet, 'foilGold', 'Oro')).toMatchObject({ kind: 'foilGold', ink: 'Oro', shape: { box: { zone: 'front' } } });
  });
});

describe('elements when the format changes', () => {
  const sheetOf = (width: number, height: number) => softcoverSheet({ width, height }, 20, resolveBindingMeasures({ id: 'x', name: 'X', style: 'perfect' }, { width, height }), false);

  it('keeps the zone’s size each element was placed in, and reads it back', () => {
    const small = sheetOf(150, 230);
    const el = newElement(small, 'box')!;
    const front = small.zones.find((z) => z.name === 'front')!.rect;
    expect(el.basis).toEqual({ width: front.width, height: front.height });
    const [read] = readCoverElements([el]);
    expect(read!.basis).toEqual(el.basis);
    // Moved on a larger format: placed again by that format's zone.
    const large = sheetOf(170, 240);
    const moved = elementAt(large, el, elementRect(large, el)!);
    expect(moved.basis!.width).toBeCloseTo(large.zones.find((z) => z.name === 'front')!.rect.width, 1);
    expect(elementRect(large, el)!.width).toBeGreaterThan(el.width);
  });
});
