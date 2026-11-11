import { describe, expect, it } from 'vitest';
import type { PostextConfig } from 'postext';
import { formatCurve, offeredSpotPlates, parseCurve, setCurve, setImagePlates, togglePlate, withPlates } from './plateEdits.js';

describe('plate edits (#1476)', () => {
  it('offers the book’s spot inks under their plate names, once each', () => {
    const config = {
      bodyText: { color: { hex: '#1f3f99', model: 'spot', spot: { name: 'Azul corporativo', cmyk: { c: 100, m: 66, y: 0, k: 2 } } } },
      print: { inks: [{ name: 'Azul corporativo', pdfName: 'PANTONE 286 C' }, { name: 'Oro' }, { name: 'Rojo', output: 'process' }], plates: { inks: ['Black', 'Barniz'] } },
    } as unknown as PostextConfig;
    expect(offeredSpotPlates(config)).toEqual(['PANTONE 286 C', 'Oro', 'Barniz']);
  });

  it('switches plates on and off, taking their picture plate and curve along', () => {
    let plates = togglePlate(undefined, 'Black', true);
    plates = togglePlate(plates, 'PANTONE 286 C', true);
    plates = setCurve(setImagePlates(plates!, ['PANTONE 286 C', 'Black']), 'PANTONE 286 C', '0 0, 100 60');
    expect(plates).toEqual({ inks: ['Black', 'PANTONE 286 C'], images: ['PANTONE 286 C', 'Black'], curves: { 'PANTONE 286 C': [[0, 0], [100, 60]] } });
    plates = togglePlate(plates, 'PANTONE 286 C', false);
    expect(plates).toEqual({ inks: ['Black'], images: ['Black'] });
    expect(togglePlate(plates, 'Black', false)).toBeUndefined();
    expect(withPlates({ standard: 'pdfx4', plates: { inks: ['Black'] } }, undefined)).toEqual({ standard: 'pdfx4' });
  });

  it('reads a curve as text and skips what does not read', () => {
    expect(parseCurve('0 0, 40 x, 75 50; 100 100')).toEqual([[0, 0], [75, 50], [100, 100]]);
    expect(formatCurve([[0, 0], [100, 75]])).toBe('0 0, 100 75');
    expect(setCurve({ inks: ['Black'], curves: { Black: [[0, 0], [100, 50]] } }, 'Black', '')).toEqual({ inks: ['Black'] });
  });
});
