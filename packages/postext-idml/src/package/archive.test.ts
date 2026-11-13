// A zipped InDesign package (#1538): its documents, the links they name
// and the fonts it carries, read into a book.

import { readFileSync } from 'node:fs';
import { strFromU8, strToU8, zipSync, type Zippable } from 'fflate';
import { describe, expect, it } from 'vitest';
import { idmlToPostext } from '../import/index.js';
import { pack, referenceBytes, referenceFiles } from '../read/fixture.test-helper.js';
import { openIdmlArchive } from './archive.js';
import { buildCollection } from './collection.test-helper.js';
import { IdmlError } from './errors.js';
import { readFontFace } from './fontFace.js';

const font = (name: string): Uint8Array => new Uint8Array(readFileSync(new URL(`../../../../apps/web/public/presets/alf-layla/fonts/${name}`, import.meta.url)));
const zip = (files: Record<string, Uint8Array | string>): Uint8Array => {
  const entries: Zippable = {};
  for (const [name, data] of Object.entries(files)) entries[name] = typeof data === 'string' ? strToU8(data) : data;
  return zipSync(entries);
};
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 2, 0, 0, 0, 2, 8, 2, 0, 0, 0, 0xfd, 0xd4, 0x9a, 0x73]);

/** The reference document with Minion Pro's regular and bold recorded
 *  under the PostScript names of Amiri's, whose files the tests carry. */
function amiriDocument(): Uint8Array {
  const files = referenceFiles();
  const fonts = strFromU8(files['Resources/Fonts.xml']!)
    .replace('PostScriptName="MinionPro-Regular"', 'PostScriptName="Amiri-Regular"')
    .replace('PostScriptName="MinionPro-Bold"', 'PostScriptName="Amiri-Bold"');
  delete files.mimetype;
  return pack({ ...files, 'Resources/Fonts.xml': fonts });
}

describe('openIdmlArchive', () => {
  it('lists the documents nearest the root first and leaves macOS litter out', () => {
    const a = openIdmlArchive(zip({
      'Book Folder/old/Book v1.idml': referenceBytes(),
      'Book Folder/Book.idml': referenceBytes(),
      'Book Folder/Book.indd': new Uint8Array([6, 6, 0xed, 0xf5]),
      'Book Folder/Document fonts/Amiri-Regular.ttf': font('Amiri-Regular.ttf'),
      'Book Folder/Document fonts/Old Face': new Uint8Array([0, 0]),
      'Book Folder/Document fonts/Licence.txt': 'licence',
      '__MACOSX/Book Folder/._Book.idml': new Uint8Array([0]),
      'Book Folder/.DS_Store': new Uint8Array([0]),
    }));
    expect(a.documents).toEqual(['Book Folder/Book.idml', 'Book Folder/old/Book v1.idml']);
    expect(a.indd).toEqual(['Book Folder/Book.indd']);
    expect(a.fonts).toEqual(['Book Folder/Document fonts/Amiri-Regular.ttf', 'Book Folder/Document fonts/Old Face']);
    expect(a.files.some((f) => f.includes('__MACOSX') || f.endsWith('.DS_Store'))).toBe(false);
    expect(a.document('Book Folder/Book.idml')).toEqual(referenceBytes());
    expect(() => a.document('Book Folder/Book.indd')).toThrow(IdmlError);
  });

  it('reads a zip that is itself an IDML package as one document', () => {
    const a = openIdmlArchive(referenceBytes());
    expect(a.documents).toEqual(['']);
    expect(a.document('')).toBe(referenceBytes());
  });

  it('refuses what is no zip, and an .indd', () => {
    expect(() => openIdmlArchive(new Uint8Array(40))).toThrow(/not a zip/);
    expect(() => openIdmlArchive(new Uint8Array([6, 6, 0xed, 0xf5, ...new Array(40).fill(0)]))).toThrow(/\.indd/);
  });

  it('finds a link by its name, and between two of the same name by its folders', () => {
    const near = PNG;
    const other = new Uint8Array([...PNG, 1]);
    const a = openIdmlArchive(zip({
      'Pkg/Book.idml': referenceBytes(),
      'Pkg/Links/pic.png': other,
      'Pkg/reference/pic.png': near,
      'Pkg/Links/Mapa%201.PNG': other,
    }));
    expect(a.linkBytes({ name: 'pic.png', uri: 'file:/Volumes/Work/reference/pic.png' }, 'Pkg/Book.idml')).toEqual(near);
    expect(a.linkBytes({ name: 'mapa 1.png' })).toEqual(other);
    expect(a.linkBytes({ name: 'absent.png' })).toBeUndefined();
  });
});

describe('readFontFace', () => {
  it('reads the names, weight and slant of a TrueType face', () => {
    const face = readFontFace('Amiri-Bold.ttf', font('Amiri-Bold.ttf'));
    expect(face).toMatchObject({ format: 'ttf', family: 'Amiri', style: 'Bold', postScriptName: 'Amiri-Bold', weight: 700, italic: false });
  });

  it('names the formats a book cannot carry', () => {
    expect(readFontFace('a.ttc', strToU8('ttcf....'))).toEqual({ unusable: 'collection' });
    expect(readFontFace('a.pfb', new Uint8Array([0x80, 1, 0, 0]))).toEqual({ unusable: 'type1' });
    expect(readFontFace('Old Face', new Uint8Array([0, 0]))).toEqual({ unusable: 'suitcase' });
    expect(readFontFace('a.woff', strToU8('wOFF....'))).toEqual({ unusable: 'woff' });
  });
});

describe('a package read into a book', () => {
  const archive = openIdmlArchive(zip({
    'Pkg/Book.idml': amiriDocument(),
    'Pkg/Links/pic.png': PNG,
    'Pkg/Document fonts/Amiri-Regular.ttf': font('Amiri-Regular.ttf'),
    'Pkg/Document fonts/Amiri-Bold.ttf': font('Amiri-Bold.ttf'),
    'Pkg/Document fonts/MinionPro-It.pfb': new Uint8Array([0x80, 1, 0, 0]),
  }));
  const path = archive.documents[0]!;
  const result = idmlToPostext(archive.document(path), {
    linkBytes: (link) => archive.linkBytes(link, path),
    fontFiles: archive.fontFiles(),
  });

  it('takes the linked pictures from the package', () => {
    expect(result.missingLinks).toEqual([]);
  });

  it('carries the faces the text is set in, matched by PostScript name', () => {
    const minion = result.config.customFonts?.find((f) => f.name === 'Minion Pro');
    expect(minion).toBeDefined();
    const regular = minion!.variants.find((v) => v.weight === 400 && v.style === 'normal');
    expect(regular).toMatchObject({ format: 'ttf', fileName: 'Amiri-Regular.ttf' });
    expect(result.files.get(regular!.fileId)).toEqual(font('Amiri-Regular.ttf'));
    const used = result.fonts.find((f) => f.family === 'Minion Pro')!;
    expect(used.styles.find((s) => s.name === 'Regular')?.file).toBe('Pkg/Document fonts/Amiri-Regular.ttf');
    expect(result.report.findings.find((f) => f.id === 'fontsCarried')).toBeDefined();
  });

  it('reports a file it cannot use and a face with no file', () => {
    const ids = result.report.findings.map((f) => f.id);
    expect(ids).toContain('fontFile.type1');
    // Georgia is set in the document and the package has no file of it.
    expect(result.report.findings.find((f) => f.id === 'fontNotInPackage')?.examples.join(' ')).toMatch(/Georgia/);
  });

  it('leaves the book as it was without font files', () => {
    const plain = idmlToPostext(archive.document(path));
    expect(plain.config.customFonts).toBeUndefined();
    expect(plain.report.findings.some((f) => f.id === 'fontNotInPackage')).toBe(false);
  });
});

describe('a package whose fonts come in a collection (#1558)', () => {
  // InDesign packages a font as the file the system holds: on a Mac, often a collection.
  const ttc = buildCollection([font('ArefRuqaa-Bold.ttf'), font('Amiri-Regular.ttf'), font('Amiri-Bold.ttf')]);
  const archive = openIdmlArchive(zip({
    'Pkg/Book.idml': amiriDocument(),
    'Pkg/Document fonts/Fonts.ttc': ttc,
  }));
  const path = archive.documents[0]!;
  const result = idmlToPostext(archive.document(path), { fontFiles: archive.fontFiles() });

  it('carries the faces the text is set in as single fonts', () => {
    const minion = result.config.customFonts?.find((f) => f.name === 'Minion Pro');
    // The reference document sets Minion Pro in its regular only.
    expect(minion?.variants).toHaveLength(1);
    const regular = minion?.variants.find((v) => v.weight === 400 && v.style === 'normal');
    expect(regular).toMatchObject({ format: 'ttf', fileName: 'Amiri-Regular.ttf', fileId: 'fonts/Amiri-Regular.ttf' });
    const carried = readFontFace('Amiri-Regular.ttf', result.files.get(regular!.fileId)!);
    expect(carried).toMatchObject({ format: 'ttf', postScriptName: 'Amiri-Regular', weight: 400 });
    const used = result.fonts.find((f) => f.family === 'Minion Pro')!;
    expect(used.styles.find((s) => s.name === 'Regular')?.file).toBe('Pkg/Document fonts/Fonts.ttc/Amiri-Regular.ttf');
  });

  it('leaves out the faces of the collection the book does not use, and says nothing of the collection', () => {
    const fontFiles = [...result.files.keys()].filter((id) => id.startsWith('fonts/'));
    expect(fontFiles).toEqual(['fonts/Amiri-Regular.ttf']);
    const ids = result.report.findings.map((f) => f.id);
    expect(ids).not.toContain('fontFile.collection');
    expect(result.report.findings.find((f) => f.id === 'fontNotInPackage')?.examples.join(' ') ?? '').not.toMatch(/Minion/);
  });

  it('names a face it cannot take out of the collection', () => {
    const cut = ttc.slice();
    new DataView(cut.buffer).setUint32(12, cut.length + 100);
    const broken = idmlToPostext(archive.document(path), { fontFiles: [{ name: 'Pkg/Document fonts/Fonts.ttc', bytes: cut }] });
    expect(broken.report.findings.find((f) => f.id === 'fontFile.collection')?.examples).toEqual(['Fonts.ttc (face 1)']);
    expect(broken.files.has('fonts/Amiri-Regular.ttf')).toBe(true);
  });
});
