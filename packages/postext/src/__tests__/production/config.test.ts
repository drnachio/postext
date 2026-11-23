import { describe, it, expect } from 'vitest';
import { readProductionConfig } from '../../production/index.js';
import { collectConfigWarnings } from '../../checks/configWarnings.js';
import { createBundle, openBundle } from '../../bundle/index.js';
import { buildDocument } from '../../pipeline/index.js';
import { isBookOwnKey, isBookWideKey } from '../../defaults/index.js';
import type { PostextConfig, ProductionConfig } from '../../types.js';

// Deterministic text measurement (no DOM in the node test env).
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext() {
    return { font: '', measureText: (t: string) => ({ width: t.length * 7 }) };
  }
};

const production: ProductionConfig = {
  versions: [
    { id: 'pb', name: 'Paperback', binding: 'perfect', flaps: true, isbn: '978-0-306-40615-7' },
    { id: 'hc', name: 'Hardcover', binding: 'case-flat', isbn: '0-8044-2957-X', caseMaterial: 'cloth' },
  ],
  collection: { name: 'Pocket Classics', isbn: '978-0-306-40615-7', catalogue: [{ id: 'v1', title: 'The Lantern' }] },
};

describe('readProductionConfig', () => {
  it('keeps a production that reads, untouched', () => {
    expect(readProductionConfig(production)).toEqual({ production, issues: [] });
    expect(readProductionConfig(undefined)).toEqual({ issues: [] });
  });

  it('leaves out what does not read and lists it', () => {
    const read = readProductionConfig({
      versions: [
        { id: 'a', binding: 'perfect', isbnAddOn: '12', flaps: 'yes', overrides: { bleed: 3, colour: 1, joint: -2 }, spineText: { direction: 'up' } },
        { name: 'no id', binding: 'perfect' },
        { id: 'b' },
        { id: 'a', binding: 'perfect' },
        { id: 'c', binding: { id: 'x', style: 'spiral' } },
      ],
      bindings: 'perfect',
      collection: { name: 'C', catalogue: [{ id: 'v', title: 3 }] },
    });
    expect(read.production?.versions).toEqual([{ id: 'a', name: 'a', binding: 'perfect', overrides: { bleed: 3 }, spineText: {} }]);
    expect(read.production?.bindings).toBeUndefined();
    expect(read.production?.collection).toEqual({ name: 'C', catalogue: [] });
    expect(read.issues.map((i) => `${i.where}:${i.reason}`)).toEqual([
      'versions[0].isbnAddOn:badText',
      'versions[0].flaps:badText',
      'versions[0].overrides.colour:badMeasure',
      'versions[0].overrides.joint:badNumber',
      'versions[0].spineText.direction:badText',
      'versions[1]:missingId',
      'versions[2].binding:missingId',
      'versions[3]:missingId',
      'versions[4].binding:unknownStyle',
      'bindings:badText',
      'collection.catalogue[0]:badText',
    ]);
  });
});

describe('production in a book', () => {
  it("is the book's own and book-wide: never a design's or a chapter style's", () => {
    expect(isBookOwnKey('production')).toBe(true);
    expect(isBookWideKey('production')).toBe(true);
  });

  it('warns about what the cover reader leaves out and an ISBN that does not read', () => {
    const config: PostextConfig = {
      production: { versions: [{ id: 'pb', name: 'P', binding: 'perfect', isbn: '978-0-306-40615-0' }], extra: 1 } as unknown as ProductionConfig,
    };
    const warnings = collectConfigWarnings(config).filter((w) => w.path.startsWith('production'));
    expect(warnings).toEqual([
      { kind: 'unknownConfigKey', path: 'production.extra', value: 'extra', used: '' },
      { kind: 'unknownConfigValue', path: 'production.versions[0].isbn', value: '978-0-306-40615-0', used: '' },
    ]);
    expect(collectConfigWarnings({ production }).filter((w) => w.path.startsWith('production'))).toEqual([]);
  });

  it('travels in a bundle', async () => {
    const { bytes, manifest } = await createBundle({ name: 'The Lantern', markdown: '# Dusk\n\nThe lantern.', config: { production } });
    expect(manifest.config?.production).toEqual(production);
    expect((await openBundle(bytes)).config.production).toEqual(production);
  });

  it('never changes a page', () => {
    const markdown = '# Dusk\n\nThe lantern hung by the door, and nobody moved it all night.';
    const plain = buildDocument({ markdown }, {});
    const published = buildDocument({ markdown }, { production });
    expect(JSON.stringify(published.pages)).toBe(JSON.stringify(plain.pages));
  });
});
