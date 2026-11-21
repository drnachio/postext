import { describe, expect, it } from 'vitest';
import { newVersion } from '../model/bookProduction.js';
import { dominantColour, folioBindingOf, folioWithCover } from './folioCover.js';

describe('the cover on Folio’s book', () => {
  it('binds the book as its version is bound', () => {
    expect(folioBindingOf(newVersion('hardcover', 'Cartoné'), [])).toEqual({ type: 'hardcover', coverMaterial: 'paper' });
    expect(folioBindingOf({ ...newVersion('hardcover', 'Cartoné'), caseMaterial: 'cloth' }, [])).toEqual({ type: 'hardcover', coverMaterial: 'cloth' });
    expect(folioBindingOf(newVersion('paperback', 'Rústica'), [])).toEqual({ type: 'paperback', coverMaterial: 'paper' });
    expect(folioBindingOf({ ...newVersion('paperback', 'Rústica'), binding: 'sewn-softcover' }, [])).toMatchObject({ type: 'sewn' });
  });

  it('binds the book as its version, over what Folio guessed, and keeps the rest', () => {
    const cover = { binding: { type: 'hardcover' as const, coverMaterial: 'paper' as const }, color: '#123456' };
    expect(folioWithCover(undefined, cover)!.binding).toEqual({ type: 'hardcover', coverMaterial: 'paper', cover: 'case', coverColor: { hex: '#123456', model: 'hex' } });
    const guide = { tilt: 44, binding: { type: 'saddleStitch' as const, cover: 'pages' as const, spineImage: 'lomo' } };
    const shown = folioWithCover(guide, cover)!;
    expect(shown.tilt).toBe(44);
    expect(shown.binding).toMatchObject({ type: 'hardcover', cover: 'case', spineImage: 'lomo' });
    expect(folioWithCover({ tilt: 30 }, null)).toEqual({ tilt: 30 });
  });

  it('takes the colour most of the cover is, not its text', () => {
    const data = new Uint8ClampedArray(100 * 4);
    for (let p = 0; p < 100; p++) data.set(p < 85 ? [20, 60, 120, 255] : [255, 255, 255, 255], 4 * p);
    expect(dominantColour(data)).toBe('#143c78');
    expect(dominantColour(new Uint8ClampedArray(8))).toBeUndefined();
  });
});
