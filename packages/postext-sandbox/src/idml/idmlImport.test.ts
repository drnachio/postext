import { describe, expect, it } from 'vitest';
import { zipSync } from 'fflate';
import { openBundle } from 'postext/bundle';
import type { IdmlImportResult } from 'postext/idml';
import { DEFAULT_LABELS as defaultLabels } from '../types/defaultLabels.js';
import { IDML_NOTE_LABEL, idmlBundleBytes, linksFound, linksFromZip, noteText } from './idmlImport.js';

describe('the Links folder', () => {
  it('reads a ZIP by file name, leaving out macOS copies and hidden files', () => {
    const zip = zipSync({
      'Libro/Links/fig 1.tif': new Uint8Array([1]),
      'Libro/Links/fig 1.png': new Uint8Array([2]),
      'Libro/Links/.DS_Store': new Uint8Array([3]),
      '__MACOSX/Libro/Links/._fig 1.png': new Uint8Array([4]),
    });
    const links = linksFromZip(zip);
    expect([...links.keys()].sort()).toEqual(['fig 1.png', 'fig 1.tif']);
  });

  it('counts a TIFF as found when its screen version is there', () => {
    const links = new Map([['fig1.png', new Uint8Array([1])]]);
    expect(linksFound(['fig1.tif', 'FIG1.png', 'gone.jpg'], links)).toBe(2);
  });
});

describe('the new book', () => {
  it('is a .postext that opens with its chapters, design and pictures', async () => {
    const result = {
      chapters: [{ title: 'Uno', markdown: '# Uno\n\n::resource{id="fig"}\n' }],
      config: { locale: 'es', page: { width: { value: 170, unit: 'mm' }, height: { value: 240, unit: 'mm' } } },
      resources: [{ id: 'fig', typeId: 'figure', kind: 'bitmap', caption: 'Una figura', createdAt: 0, updatedAt: 0, bitmap: { fileId: 'idml-1-fig.png', format: 'png', width: 10, height: 10 } }],
      files: new Map([['idml-1-fig.png', { bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), mime: 'image/png' }]]),
      notes: [],
    } as unknown as IdmlImportResult;
    const bundle = await openBundle(await idmlBundleBytes(result, { name: 'Libro', locale: 'es' }));
    expect(bundle.name).toBe('Libro');
    expect(bundle.chapters.map((c) => c.title)).toEqual(['Uno']);
    expect(bundle.config.page?.width).toEqual({ value: 170, unit: 'mm' });
    expect(bundle.resources[0]).toMatchObject({ id: 'fig', caption: 'Una figura' });
    // The picture is in the bundle, under the path the bundle gives it.
    const fileId = (bundle.resources[0] as { bitmap: { fileId: string } }).bitmap.fileId;
    expect(bundle.files.get(fileId)).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
  });

  it('words every note', () => {
    for (const id of Object.keys(IDML_NOTE_LABEL) as Array<keyof typeof IDML_NOTE_LABEL>) {
      expect(noteText(defaultLabels, id, 3)).toMatch(/3/);
    }
  });
});
