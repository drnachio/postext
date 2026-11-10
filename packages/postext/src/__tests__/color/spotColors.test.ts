import { describe, expect, it } from 'vitest';
import { authoredSpotColors, normalizeSpotColor, spotColorCmyk, spotInks } from '../../color/index.js';

const PANTONE = { name: ' PANTONE 286 C ', cmyk: { c: 100, m: 66, y: 0, k: 2 } };

describe('spot colours', () => {
  it('normalizes the name, the tint and the defaults', () => {
    expect(normalizeSpotColor(PANTONE)).toEqual({ name: 'PANTONE 286 C', cmyk: { c: 100, m: 66, y: 0, k: 2 }, tint: 100, overprint: false });
    expect(normalizeSpotColor({ ...PANTONE, tint: 140, cmyk: { c: -5, m: 66, y: 0, k: 2 } })).toMatchObject({ tint: 100, cmyk: { c: 0 } });
  });

  it('scales the ink by the tint for its process equivalent', () => {
    expect(spotColorCmyk({ ...PANTONE, tint: 50 })).toEqual({ c: 50, m: 33, y: 0, k: 1 });
  });

  it('collects the spot colours of a configuration by screen hex, the palette included', () => {
    const spots = authoredSpotColors({
      colorPalette: [{ id: 'a', name: 'A', value: { hex: '#1F3F99', model: 'spot', spot: PANTONE } }],
      bodyText: { color: { hex: '#a5b6dd', model: 'spot', spot: { ...PANTONE, tint: 40 } } },
      // Not spot colours: a nameless ink, a plain colour.
      headings: { color: { hex: '#000000', model: 'spot', spot: { name: ' ', cmyk: { c: 0, m: 0, y: 0, k: 100 } } } },
      footer: { color: { hex: '#ff0000', model: 'hex' } },
    });
    expect([...spots.keys()]).toEqual(['#1f3f99', '#a5b6dd']);
    expect(spots.get('#a5b6dd')!.tint).toBe(40);
  });

  it('groups colours by ink and reports inks defined twice', () => {
    const a = normalizeSpotColor(PANTONE);
    const b = normalizeSpotColor({ ...PANTONE, tint: 40 });
    const c = normalizeSpotColor({ ...PANTONE, overprint: true });
    const v = normalizeSpotColor({ name: 'Varnish', cmyk: { c: 0, m: 0, y: 0, k: 0 }, overprint: true });
    const { inks, conflicts } = spotInks([a, b, c, v]);
    expect(inks.map((i) => [i.name, i.tints])).toEqual([['PANTONE 286 C', [100, 40]], ['Varnish', [100]]]);
    expect(conflicts).toEqual(['PANTONE 286 C']);
  });
});
