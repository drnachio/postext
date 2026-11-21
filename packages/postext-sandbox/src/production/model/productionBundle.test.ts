import { describe, expect, it } from 'vitest';
import { openBundleZip, zipBundle } from 'postext/bundle';
import { newVersion, type BookProduction } from './bookProduction.js';
import type { CoverGallery } from '../library/coverGallery.js';
import type { LogoRecord } from '../library/logoLibrary.js';
import { PRODUCTION_BUNDLE_FILE, productionBundleFiles, readProductionBundle } from './productionBundle.js';
import type { StoredProfile } from '../store/productionStore.js';

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');

const version = { ...newVersion('hardcover', 'Cartoné'), binding: 'my-case', isbn: '978-0-306-40615-7', workIsbn: '978-84-9835-000-5' };
const record: BookProduction = {
  projectId: 'old',
  versions: [version],
  activeVersionId: version.id,
  texts: { front: '# Título' },
  design: {
    background: '#123456',
    elements: [{ id: 'pic', kind: 'image', resourceId: 'cover:pic-1', zone: 'front', x: 10, y: 10, width: 50, height: 50 }],
    logos: [{ id: 'l1', kind: 'image', logoId: 'seal', resourceId: 'logo:seal', zone: 'back', x: 5, y: 5, width: 20, height: 10, clearance: 3 }],
  },
  paper: { profileId: 'offset', inserts: [{ pages: 16, grammage: 115, bulk: 0.9 }] },
  updatedAt: 1,
};
const gallery: CoverGallery = {
  projectId: 'old',
  pictures: [{ id: 'pic-1', name: 'Foto', mime: 'image/png', bytes: png, width: 100, height: 80, outline: [[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]], updatedAt: 1 }],
  traces: [{ id: 't1', name: 'Foto (trazado)', outline: [[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]], aspect: 1.25, updatedAt: 1 }],
};
const logos: LogoRecord[] = [
  { id: 'seal', name: 'Sello', group: 'publisher', clearance: 3, mime: 'image/svg+xml', bytes: svg, width: 10, height: 10, updatedAt: 1 },
  { id: 'other', name: 'Otro', group: 'seal', clearance: 2, mime: 'image/png', bytes: png, width: 10, height: 10, updatedAt: 1 },
];
const profiles: StoredProfile[] = [
  { id: 'binding:my-case', kind: 'binding', profile: { id: 'my-case', name: 'Cartoné de la imprenta', style: 'caseFlat' }, updatedAt: 1 },
  { id: 'paper:offset', kind: 'paper', profile: { id: 'offset', name: 'Offset 80', grammage: 80, bulk: 1.3 }, updatedAt: 1 },
  { id: 'paper:unused', kind: 'paper', profile: { id: 'unused', name: 'Otro', grammage: 100 }, updatedAt: 1 },
];

describe('a book’s production in its bundle', () => {
  it('goes along and comes back for the new book, with what it uses of the library', () => {
    const files = productionBundleFiles(record, gallery, { logos, profiles });
    expect(Object.keys(files).sort()).toEqual([
      'production/files/gallery-pic-1.png',
      'production/files/logo-seal.svg',
      PRODUCTION_BUNDLE_FILE,
    ]);
    // Through a real archive, beside the book's own files.
    const zip = zipBundle({ 'preset.json': new TextEncoder().encode('{}'), ...files });
    const opened = openBundleZip(zip);
    const back = readProductionBundle('new', opened.files)!;
    expect(back.record).toMatchObject({ projectId: 'new', versions: [version], activeVersionId: version.id, texts: record.texts, design: record.design, paper: record.paper });
    expect(back.gallery.projectId).toBe('new');
    expect(back.gallery.pictures[0]).toMatchObject({ id: 'pic-1', name: 'Foto', mime: 'image/png', outline: gallery.pictures[0]!.outline });
    expect(Array.from(back.gallery.pictures[0]!.bytes)).toEqual(Array.from(png));
    expect(back.gallery.traces[0]).toMatchObject({ id: 't1', aspect: 1.25 });
    // Only the logo the design places, and the profiles the book names.
    expect(back.logos.map((l) => l.id)).toEqual(['seal']);
    expect(back.bindings.map((p) => p.id)).toEqual(['my-case']);
    expect(back.papers.map((p) => p.id)).toEqual(['offset']);
  });

  it('adds nothing for a book with no production, and reads nothing from a bundle without one', () => {
    expect(productionBundleFiles(null, null, { logos, profiles })).toEqual({});
    expect(readProductionBundle('new', new Map())).toBeNull();
    expect(readProductionBundle('new', new Map([[PRODUCTION_BUNDLE_FILE, new TextEncoder().encode('{"format":"other"}')]]))).toBeNull();
  });
});
