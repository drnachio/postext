import { describe, expect, it } from 'vitest';
import { caseSheet, endpaperSheet, resolveBindingMeasures } from 'postext';
import { coverDocumentInput, endpaperDesignOf, newVersion, readBookProduction } from './bookProduction.js';
import { coverChecks } from './coverChecks.js';
import { endpaperInput, readEndpapers, type CatalogueAd, type CollectionRecord } from '../library/collections.js';
import { productionBundleFiles, readProductionBundle } from './productionBundle.js';

const trim = { width: 150, height: 230 };
const m = resolveBindingMeasures({ id: 'c', name: 'C', style: 'caseFlat' }, trim);
const sheet = endpaperSheet(trim, m, 'back');
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const ad: CatalogueAd = { id: 'novedades', title: 'Novedades', mime: 'image/png', bytes: png, width: 1200, height: 1800 };
const collection: CollectionRecord = { id: 'col', name: 'Biblioteca Médica', ads: [ad], updatedAt: 1 };

describe('endpapers', () => {
  it('read what is stored, leaving out what does not read', () => {
    expect(readEndpapers({ collectionId: 'col', front: { colour: '#aa0000', flyleaf: { ad: 'novedades' } }, back: { colour: 'red', pastedown: { text: '  ' } } }))
      .toEqual({ collectionId: 'col', front: { colour: '#aa0000', flyleaf: { ad: 'novedades' } } });
    expect(readBookProduction({ projectId: 'p', versions: [], texts: {}, endpapers: { back: { flyleaf: { text: 'Fin' } } } })!.endpapers)
      .toEqual({ back: { flyleaf: { text: 'Fin' } } });
  });

  it('draw the paper colour, an ad run to the outer bleed and a text in its page', () => {
    const side = { colour: '#f4e9d8', flyleaf: { ad: 'novedades' }, pastedown: { text: 'Otros títulos de la colección' } };
    const { design, ads } = endpaperDesignOf(sheet, side, [ad]);
    expect(design.background).toEqual({ hex: '#f4e9d8', model: 'hex' });
    expect(ads).toEqual([ad]);
    const el = design.elements![0]!;
    const flyleaf = sheet.zones.find((z) => z.name === 'flyleaf')!.rect;
    // From the page's inner edge out to the sheet's, bleed included, head to foot.
    const x = flyleaf.x + el.x;
    expect(x === 0 || Math.abs(x + el.width - sheet.width) < 0.01).toBe(true);
    expect(el.height).toBe(sheet.height);

    const version = newVersion('hardcover', 'Cartoné');
    const input = coverDocumentInput(sheet, version, {}, { page: { dpi: 72 } }, undefined, [], { endpaper: { side, ads: [ad] } });
    expect(input.resources.some((r) => r.id === 'ad:novedades')).toBe(true);
    expect(input.cover.files['ad-novedades.png']).toBe(png);
    expect(input.markdown).toContain('Otros títulos de la colección');
  });

  it('take the side of the sheet on show, and nothing on another sheet', () => {
    const endpapers = { collectionId: 'col', front: { colour: '#ffffff' } };
    expect(endpaperInput('endpaperFront', endpapers, [collection])).toEqual({ side: { colour: '#ffffff' }, ads: [ad] });
    expect(endpaperInput('endpaperBack', endpapers, [collection])!.side).toBeUndefined();
    expect(endpaperInput('cover', endpapers, [collection])).toBeUndefined();
  });

  it('warn how much of an ad the hinge hides', () => {
    const checks = coverChecks(sheet, undefined, { pictures: new Set(), endpaperAds: ['flyleaf'] });
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({ kind: 'endpaperHinge', zone: 'flyleaf', severity: 'warning' });
    expect(checks[0]!.mm).toBeGreaterThan(0);
    // A softcover has no endpapers, no hinge.
    expect(coverChecks(caseSheet(trim, 20, m), undefined, { pictures: new Set(), endpaperAds: ['flyleaf'] })).toEqual([]);
  });

  it('take their collection along in the book’s bundle', () => {
    const record = { projectId: 'p', versions: [newVersion('hardcover', 'Cartoné')], texts: {}, endpapers: { collectionId: 'col', back: { flyleaf: { ad: 'novedades' } } }, updatedAt: 1 };
    const files = productionBundleFiles(record, null, { logos: [], profiles: [], collections: [collection, { ...collection, id: 'other' }] });
    expect(Object.keys(files)).toContain('production/files/ad-novedades.png');
    const back = readProductionBundle('new', new Map(Object.entries(files)))!;
    expect(back.record.endpapers).toEqual(record.endpapers);
    expect(back.collection).toMatchObject({ id: 'col', name: 'Biblioteca Médica' });
    expect(back.collection!.ads[0]).toMatchObject({ id: 'novedades', title: 'Novedades', mime: 'image/png' });
  });
});
