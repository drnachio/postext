import { describe, expect, it, vi } from 'vitest';
import { unzipSync, strFromU8, zipSync } from 'fflate';
import { buildDocument, type PostextConfig, type Resource } from 'postext';
import { openBundle } from 'postext/bundle';
import { idmlDocument } from 'postext-idml';
import type { ProjectActions } from '../../context/projectActions.js';

vi.mock('../../storage/blobStore.js', () => ({ getBlob: async () => null, putBlob: async () => 'blob' }));
// No fonts are fetched here: every face is named from its weight and slant.
vi.mock('../../idml/idmlFonts.js', () => ({ sandboxIdmlFaces: async () => [], idmlFontWithheld: () => false }));
vi.mock('../../controls/fonts/fontLoader.js', async (original) => ({ ...(await original<Record<string, unknown>>()), ensureConfigFontsLoaded: async () => undefined }));

const { harness } = await import('./testHarness.js');

const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

const base64 = (bytes: Uint8Array): string => btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''));
const fromBase64 = (text: string): Uint8Array => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

/** A small book written as IDML, its picture linked. */
function sample(): { file: { base64: string; fileName: string }; link: { base64: string; fileName: string } } {
  const config = { page: { width: { value: 120, unit: 'mm' }, height: { value: 180, unit: 'mm' } } } as PostextConfig;
  const resources = [{ id: 'pic', typeId: 'figure', kind: 'bitmap', bitmap: { fileId: 'f-pic', format: 'png', width: 1, height: 1 }, createdAt: 0, updatedAt: 0 }] as unknown as Resource[];
  const doc = buildDocument({ markdown: '# The harbour\n\nBoats come in at dusk.\n\n::resource{id="pic"}\n\nNets dry on the quay.', resources }, config);
  const result = idmlDocument({ docs: [doc], resourceBytes: () => PNG, images: 'link' });
  const link = result.links[0]!;
  return { file: { base64: base64(result.bytes), fileName: 'harbour.idml' }, link: { base64: base64(link.bytes), fileName: link.path.split('/').pop()! } };
}

describe('the InDesign tools', () => {
  it('say what a document holds and how it would be imported, creating nothing', async () => {
    let imported = 0;
    const { call } = harness({}, { projectActions: { importBundleBytes: async () => { imported++; return 'new'; } } as unknown as ProjectActions });
    const { file } = sample();
    const dry = await call('sandbox_import_idml', { file, dryRun: true });
    expect(dry).toMatchObject({ ok: true, dryRun: true, imported: false, file: 'harbour.idml', name: 'harbour' });
    expect(dry.holds).toMatchObject({ pages: 1, pictures: { linked: 1, embedded: 0 } });
    expect(['pages', 'flow']).toContain(dry.layout);
    expect(dry.reason).toBeTruthy();
    expect(['faithful', 'approximate', 'lossy']).toContain(dry.verdict);
    expect(dry.missingLinks).toHaveLength(1);
    expect(imported).toBe(0);
  });

  it('create a new book from the document, its linked pictures matched by name', async () => {
    const got: { bytes: Uint8Array; name: string }[] = [];
    const { call } = harness({}, { projectActions: { importBundleBytes: async (bytes: Uint8Array, name: string) => { got.push({ bytes, name }); return 'new'; } } as unknown as ProjectActions });
    const { file, link } = sample();
    const done = await call('sandbox_import_idml', { file, layout: 'flow', name: 'Quay', links: [link], wait: false });
    expect(done).toMatchObject({ ok: true, imported: true, project: 'new', layout: 'flow', name: 'Quay', laidOut: false });
    expect(done.missingLinks).toBeUndefined();
    expect(got).toHaveLength(1);
    expect(got[0]!.name).toBe('Quay.postext');
    const book = await openBundle(got[0]!.bytes);
    expect(book.name).toBe('Quay');
    expect(book.chapters.map((c) => c.markdown).join('\n')).toContain('Nets dry on the quay.');
    expect(book.resources.length).toBeGreaterThan(0);
  });

  it('refuse what is no IDML package, in the reader\'s words', async () => {
    const { call } = harness();
    const indd = new Uint8Array(64);
    indd.set([0x06, 0x06, 0xed, 0xf5]);
    const refused = await call('sandbox_import_idml', { file: { base64: base64(indd), fileName: 'book.indd' } });
    expect(refused.error).toMatch(/book\.indd could not be read as an InDesign document: .*\.indd/);
  });

  it('import a zipped InDesign package, asking which document when it holds several (#1538)', async () => {
    const { call } = harness({}, { projectActions: { importBundleBytes: async () => 'new' } as unknown as ProjectActions });
    const { file, link } = sample();
    const idml = fromBase64(file.base64);
    const pkg = (docs: string[]) => ({ fileName: 'harbour.zip', base64: base64(zipSync({ ...Object.fromEntries(docs.map((d) => [d, idml])), [`Pkg/Links/${link.fileName}`]: fromBase64(link.base64) })) });
    const one = await call('sandbox_import_idml', { file: pkg(['Pkg/Harbour.idml']), dryRun: true });
    expect(one).toMatchObject({ ok: true, dryRun: true, document: 'Pkg/Harbour.idml', linksFromPackage: 1 });
    expect(one.missingLinks).toBeUndefined();
    const two = pkg(['Pkg/Harbour.idml', 'Pkg/old/Harbour v1.idml']);
    const asked = await call('sandbox_import_idml', { file: two, dryRun: true });
    expect(asked.ok).toBe(false);
    expect(JSON.stringify(asked)).toMatch(/document/);
    const chosen = await call('sandbox_import_idml', { file: two, document: 'Pkg/old/Harbour v1.idml', dryRun: true });
    expect(chosen).toMatchObject({ ok: true, document: 'Pkg/old/Harbour v1.idml', documents: ['Pkg/Harbour.idml', 'Pkg/old/Harbour v1.idml'] });
    const none = await call('sandbox_import_idml', { file: { fileName: 'job.zip', base64: base64(zipSync({ 'Job/Job.indd': new Uint8Array([6, 6, 0xed, 0xf5]) })) }, dryRun: true });
    expect(JSON.stringify(none)).toMatch(/Include IDML/);
  });

  it('export the book as IDML with the options of the dialog', async () => {
    const { call } = harness();
    const plain = await call('sandbox_export', { format: 'idml', deliver: 'data' });
    expect(plain).toMatchObject({ ok: true, format: 'idml', file: 'Guide.idml', mimeType: 'application/vnd.adobe.indesign-idml-package' });
    expect(plain.pages).toBeGreaterThan(1);
    const zip = unzipSync(fromBase64(plain.base64));
    expect(strFromU8(zip['mimetype']!)).toBe('application/vnd.adobe.indesign-idml-package');
    expect(strFromU8(zip['Resources/Preferences.xml']!)).toContain('FacingPages="false"');

    const facing = await call('sandbox_export', { format: 'idml', deliver: 'data', idmlSpreads: 'facing', idmlLines: 'reflow' });
    expect(strFromU8(unzipSync(fromBase64(facing.base64))['Resources/Preferences.xml']!)).toContain('FacingPages="true"');

    expect((await call('sandbox_export', { format: 'pdf', idmlLines: 'keep' })).error).toMatch(/"idmlLines" goes with format "idml"/);
  });
});
