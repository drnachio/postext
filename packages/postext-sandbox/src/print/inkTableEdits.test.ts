import { describe, expect, it } from 'vitest';
import { resolvePrintInks } from 'postext';
import {
  addInk,
  formatAliases,
  inkOverprint,
  normaliseInk,
  overprintValue,
  parseAliases,
  removeInk,
  resetInkField,
  setInkChannel,
  unlistedInks,
  updateInk,
  withInks,
} from './inkTableEdits.js';

describe('the ink table edits', () => {
  it('adds, changes and removes inks', () => {
    let inks = addInk(undefined, 'PANTONE 286 C');
    inks = addInk(inks);
    expect(inks).toEqual([{ name: 'PANTONE 286 C' }, { name: '' }]);
    inks = updateInk(inks, 1, { name: 'Varnish', output: 'spot', overprint: true });
    expect(inks[1]).toEqual({ name: 'Varnish', output: 'spot', overprint: true });
    inks = removeInk(inks, 0);
    expect(inks).toEqual([{ name: 'Varnish', output: 'spot', overprint: true }]);
  });

  it('drops the members given no value', () => {
    const inks = [{ name: 'Blue', pdfName: 'PANTONE 286 C', output: 'process' as const, cmyk: { c: 100, m: 60, y: 0, k: 0 } }];
    expect(updateInk(inks, 0, { pdfName: '  ' })[0]).toEqual({ name: 'Blue', output: 'process', cmyk: { c: 100, m: 60, y: 0, k: 0 } });
    expect(resetInkField(inks, 0, 'cmyk')[0]).toEqual({ name: 'Blue', pdfName: 'PANTONE 286 C', output: 'process' });
    expect(updateInk(inks, 0, { aliases: [] })[0]).not.toHaveProperty('aliases');
  });

  it('leaves the table alone for an index outside it', () => {
    const inks = [{ name: 'Blue' }];
    expect(updateInk(inks, 3, { name: 'Red' })).toEqual(inks);
  });

  it('removes an empty table from print, and print when nothing is left', () => {
    expect(withInks({ inks: [{ name: 'Blue' }] }, [])).toBeUndefined();
    expect(withInks({ standard: 'pdfx4', inks: [{ name: 'Blue' }] }, [])).toEqual({ standard: 'pdfx4' });
    expect(withInks(undefined, [{ name: 'Blue', aliases: [' '] }])).toEqual({ inks: [{ name: 'Blue' }] });
  });

  it('reads aliases from one line and writes them back the same', () => {
    const aliases = parseAliases(' Pantone 286C,Corporate blue , ,corporate BLUE');
    expect(aliases).toEqual(['Pantone 286C', 'Corporate blue']);
    expect(formatAliases(aliases)).toBe('Pantone 286C, Corporate blue');
    expect(parseAliases(formatAliases(aliases))).toEqual(aliases);
    expect(formatAliases(undefined)).toBe('');
  });

  it('maps overprint to three choices', () => {
    expect(inkOverprint({ name: 'a' })).toBe('colours');
    expect(inkOverprint({ name: 'a', overprint: true })).toBe('overprint');
    expect(inkOverprint({ name: 'a', overprint: false })).toBe('knockout');
    for (const c of ['colours', 'overprint', 'knockout'] as const) {
      expect(inkOverprint(normaliseInk({ name: 'a', overprint: overprintValue(c) }))).toBe(c);
    }
  });

  it('sets one channel of the alternate from a seed, clamped to 0–100', () => {
    const seed = { c: 100, m: 60, y: 0, k: 0 };
    const inks = setInkChannel([{ name: 'Blue' }], 0, 'k', 140, seed);
    expect(inks[0]!.cmyk).toEqual({ c: 100, m: 60, y: 0, k: 100 });
    expect(setInkChannel(inks, 0, 'c', 50, seed)[0]!.cmyk).toEqual({ c: 50, m: 60, y: 0, k: 100 });
  });

  it('offers the inks the colours use that no name or alias lists', () => {
    expect(unlistedInks(['PANTONE 286 C', 'Gold', 'Varnish'], [{ name: 'pantone  286 c' }, { name: 'Metal', aliases: ['GOLD'] }])).toEqual(['Varnish']);
    expect(unlistedInks(['Gold'], undefined)).toEqual(['Gold']);
  });

  it('writes what the engine resolves', () => {
    const inks = updateInk(addInk(undefined, ' Blue '), 0, { aliases: parseAliases('Azul, Bleu'), pdfName: 'PANTONE 286 C' });
    expect(resolvePrintInks(withInks(undefined, inks)!.inks)).toEqual([
      { name: 'Blue', aliases: ['Azul', 'Bleu'], pdfName: 'PANTONE 286 C', output: 'spot' },
    ]);
  });
});

describe('the ink table keeps a finish (#1570)', () => {
  it('as written once checked, and drops an unknown one', () => {
    expect(normaliseInk({ name: 'Gold', finish: { kind: 'metallic', sheen: 'gloss' } })).toEqual({ name: 'Gold', finish: { kind: 'metallic', sheen: 'gloss' } });
    expect(normaliseInk({ name: 'Gold', finish: { kind: 'shiny' } as never })).toEqual({ name: 'Gold' });
    const inks = updateInk([{ name: 'Varnish' }], 0, { finish: { kind: 'varnish', sheen: 'softTouch' } });
    expect(inks[0]!.finish).toEqual({ kind: 'varnish', sheen: 'softTouch' });
    expect(resetInkField(inks, 0, 'finish')[0]).toEqual({ name: 'Varnish' });
    expect(resolvePrintInks(inks)[0]!.finish).toEqual({ kind: 'varnish', sheen: 'softTouch' });
  });
});
