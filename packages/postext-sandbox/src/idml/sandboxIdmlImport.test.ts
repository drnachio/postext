import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { buildDocument, type PostextConfig, type Resource } from 'postext';
import { openBundle } from 'postext/bundle';
import { idmlDocument } from 'postext-idml';
import { addLinkFiles, convertIdml, describeIdmlImport, findingsBySeverity, fontsCarried, fontsNeeded, idmlBookBundle, linkFileName, linkLookup, mainPageSize, readIdmlFile, readIdmlPackage, readIdmlPackageDocument } from './sandboxIdmlImport.js';

// Text measured without a DOM: a fixed advance per character.
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext() {
    return { font: '', measureText: (s: string) => ({ width: s.length * 7 }) };
  }
};

const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

/** An IDML package as InDesign would hand one over: a small book the
 *  engine laid out, written by the exporter, its picture linked. */
function sample(): { idml: Uint8Array; link: { path: string; bytes: Uint8Array } } {
  const config = { page: { width: { value: 120, unit: 'mm' }, height: { value: 180, unit: 'mm' } } } as PostextConfig;
  const resources = [{ id: 'pic', typeId: 'figure', kind: 'bitmap', bitmap: { fileId: 'f-pic', format: 'png', width: 1, height: 1 }, createdAt: 0, updatedAt: 0 }] as unknown as Resource[];
  const doc = buildDocument({ markdown: '# The harbour\n\nBoats come in at dusk.\n\n::resource{id="pic"}\n\nNets dry on the quay.', resources }, config);
  const result = idmlDocument({ docs: [doc], resourceBytes: (id) => (id === 'f-pic' ? PNG : undefined), images: 'link', title: 'Harbour' });
  return { idml: result.bytes, link: result.links[0]! };
}

describe('the Sandbox InDesign import', () => {
  it('matches a link by its file name alone, never by its path', () => {
    expect(linkFileName('file:/Volumes/Work/Job%20one/Links/Map%201.PNG')).toBe('map 1.png');
    expect(linkFileName('C:\\Jobs\\Links\\map.png')).toBe('map.png');
    expect(linkFileName('100%.png')).toBe('100%.png');
    const bytes = new Uint8Array([1]);
    const lookup = linkLookup([{ name: 'Pictures/MAP.png', bytes }]);
    expect(lookup({ name: 'map.png' })).toBe(bytes);
    expect(lookup({ name: 'other.png' })).toBeUndefined();
    const replaced = addLinkFiles([{ name: 'map.png', bytes }, { name: 'a.png', bytes }], [{ name: 'Map.png', bytes: new Uint8Array([2]) }]);
    expect(replaced.map((f) => f.name)).toEqual(['a.png', 'Map.png']);
  });

  it('reads a package and says what it holds', async () => {
    const file = await readIdmlFile('harbour.idml', sample().idml);
    expect(file.summary.pages).toBe(1);
    expect(mainPageSize(file.summary)).toMatchObject({ mixed: false });
    expect(Math.round(mainPageSize(file.summary)!.width)).toBe(340);
    expect(file.summary.pictures).toMatchObject({ linked: 1, embedded: 0 });
  });

  it('refuses what is no IDML package in the reader\'s own words', async () => {
    const indd = new Uint8Array(64);
    indd.set([0x06, 0x06, 0xed, 0xf5]);
    await expect(readIdmlFile('book.indd', indd)).rejects.toThrow(/\.indd.*IDML/);
    await expect(readIdmlFile('notes.txt', strToU8('Plain words, long enough to be read as a file.'))).rejects.toThrow(/not a zip archive/);
    await expect(readIdmlFile('other.zip', zipSync({ 'a.txt': strToU8('a') }))).rejects.toThrow(/designmap\.xml/);
  });

  it('imports the document, names the links nobody gave, and takes them by name', async () => {
    const { idml, link } = sample();
    const file = await readIdmlFile('harbour.idml', idml);
    const without = await convertIdml(file);
    expect(without.name).toBe('harbour');
    expect(without.reason).toBeTruthy();
    expect(without.chapters.map((c) => c.markdown).join('\n')).toContain('Boats come in at dusk.');
    expect(without.missingLinks.map((l) => linkFileName(l.name))).toEqual([linkFileName(link.path)]);

    const withLink = await convertIdml(file, { links: [{ name: `Somewhere/Else/${link.path.split('/').pop()!.toUpperCase()}`, bytes: link.bytes }] });
    expect(withLink.missingLinks).toEqual([]);
    expect(withLink.files.size).toBe(1);

    const flow = await convertIdml(file, { layout: 'flow', name: 'Quay' });
    expect(flow).toMatchObject({ layout: 'flow', name: 'Quay' });
    const pages = await convertIdml(file, { layout: 'pages' });
    expect(pages.layout).toBe('pages');
  });

  it('orders the report: what was lost first, each severity with its total', () => {
    const finding = (id: string, severity: 'info' | 'warning' | 'loss', count: number) => ({ id, severity, message: id, count, examples: [] });
    const groups = findingsBySeverity({ findings: [finding('a', 'info', 2), finding('b', 'loss', 1), finding('c', 'info', 5), finding('d', 'warning', 3)] });
    expect(groups.map((g) => [g.severity, g.total, g.findings.map((f) => f.id)])).toEqual([['loss', 1, ['b']], ['warning', 3, ['d']], ['info', 7, ['c', 'a']]]);
    expect(fontsNeeded({ fonts: [{ family: 'Lora', styles: [{ name: 'Regular', weight: 400, italic: false, characters: 9 }, { name: 'Bold', weight: 700, italic: false, characters: 2 }] }, { family: 'Inter', styles: [] }] })).toEqual(['Lora (Regular, Bold)', 'Inter']);
  });

  it('writes the book as an archive the Books panel opens, and describes the import', async () => {
    const { idml, link } = sample();
    const file = await readIdmlFile('harbour.idml', idml);
    const result = await convertIdml(file, { links: [{ name: link.path, bytes: link.bytes }] });
    const bundle = await idmlBookBundle(result);
    expect(bundle.fileName).toBe('harbour.postext');
    const opened = await openBundle(bundle.bytes);
    expect(opened.name).toBe('harbour');
    expect(opened.chapters.length).toBe(result.chapters.length);
    expect(opened.resources.length).toBe(result.resources.length);
    expect(opened.resources.length).toBeGreaterThan(0);

    const said = describeIdmlImport(result);
    expect(said).toMatchObject({ name: 'harbour', layout: result.layout, reason: result.reason, verdict: result.report.verdict, resources: result.resources.length });
    expect(said.missingLinks).toBeUndefined();
  });

  it('reads a zipped InDesign package: its document, its links and its fonts (#1538)', async () => {
    const amiri = new Uint8Array(readFileSync(new URL('../../../../apps/web/public/presets/alf-layla/fonts/Amiri-Regular.ttf', import.meta.url)));
    const config = { page: { width: { value: 120, unit: 'mm' }, height: { value: 180, unit: 'mm' } }, bodyText: { fontFamily: 'Amiri' } } as PostextConfig;
    const resources = [{ id: 'pic', typeId: 'figure', kind: 'bitmap', bitmap: { fileId: 'f-pic', format: 'png', width: 1, height: 1 }, createdAt: 0, updatedAt: 0 }] as unknown as Resource[];
    const doc = buildDocument({ markdown: 'Boats come in at dusk.\n\n::resource{id="pic"}\n\nNets dry on the quay.', resources }, config);
    const exported = idmlDocument({ docs: [doc], resourceBytes: () => PNG, images: 'link', title: 'Harbour' });
    const link = exported.links[0]!;
    const zip = zipSync({
      'Harbour Folder/Harbour.idml': exported.bytes,
      [`Harbour Folder/${link.path}`]: link.bytes,
      'Harbour Folder/Document fonts/Amiri-Regular.ttf': amiri,
      '__MACOSX/Harbour Folder/._Harbour.idml': strToU8('x'),
    });

    const pkg = await readIdmlPackage('harbour.zip', zip);
    expect(pkg.archive.documents).toEqual(['Harbour Folder/Harbour.idml']);
    const file = await readIdmlPackageDocument({ ...pkg, path: pkg.archive.documents[0]! });
    expect(file.name).toBe('Harbour.idml');
    const result = await convertIdml(file);
    expect(result.missingLinks).toEqual([]);
    expect(result.packageLinks).toHaveLength(1);
    expect(fontsCarried(result)).toEqual(['Amiri (Regular)']);
    expect(fontsNeeded(result).join(' ')).not.toMatch(/Amiri \(Regular/);
    expect(describeIdmlImport(result)).toMatchObject({ fontsFromPackage: ['Amiri (Regular)'], linksFromPackage: 1 });

    // The book carries the face: its file and the family that names it.
    const opened = await openBundle((await idmlBookBundle(result)).bytes);
    const family = opened.config.customFonts?.find((f) => f.name === 'Amiri');
    expect(family?.variants.some((v) => v.weight === 400 && v.style === 'normal')).toBe(true);
    expect(opened.files.get(family!.variants[0]!.fileId)).toEqual(amiri);
  });
});
