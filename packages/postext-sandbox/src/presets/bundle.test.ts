import { describe, expect, it } from 'vitest';
import type { PostextConfig, Resource } from 'postext';
import { createDefaultConfig } from '../context/defaultConfig';
import { buildBundleFiles, parseBundle, planBundle, MARKDOWN_FILE } from './bundle';
import { openBundleZip, zipBundle } from './zip';
import type { PresetManifest, PresetSummary } from './types';

const enc = new TextEncoder();
const dec = new TextDecoder();

const summary: PresetSummary = { id: 'brochure', name: 'Brochure', source: 'private', available: true };

function readerFrom(files: Record<string, Uint8Array | string>) {
  const map = new Map(Object.entries(files).map(([k, v]) => [k, typeof v === 'string' ? enc.encode(v) : v]));
  return (path: string) => {
    const data = map.get(path);
    return data ? Promise.resolve(data.slice().buffer) : Promise.reject(new Error(`missing ${path}`));
  };
}

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"></svg>';

const manifest = (over: Partial<PresetManifest> = {}): PresetManifest => ({
  version: 1,
  id: 'brochure',
  name: 'Brochure',
  markdown: 'doc.md',
  ...over,
});

describe('parseBundle', () => {
  it('reads markdown, inline tables, files and fonts with preset ids by default', async () => {
    const loaded = await parseBundle(
      manifest({
        resources: [
          { id: 'fig', typeId: 'figure', kind: 'svg', file: 'resources/fig.svg' },
          { id: 'tbl', typeId: 'table', kind: 'table', table: { model: { rows: [] } } },
        ],
        fonts: [{ name: 'Body', variants: [{ weight: 400, style: 'normal', file: 'fonts/body.ttf' }] }],
      }),
      readerFrom({ 'doc.md': '# Hi', 'resources/fig.svg': SVG, 'fonts/body.ttf': new Uint8Array([1, 2, 3]) }),
      { locale: 'en', summary },
    );
    expect(loaded.markdown).toBe('# Hi');
    expect(loaded.resources.map((r) => r.id)).toEqual(['fig', 'tbl']);
    // Intrinsic size needs DOMParser (browser only); node yields just the id.
    expect(loaded.resources[0].svg).toEqual({ fileId: 'preset:brochure:resources-fig-svg' });
    expect(loaded.resources[1].table).toEqual({ model: { rows: [] } });
    expect(loaded.blobs).toHaveLength(1);
    expect(loaded.blobs[0].mime).toBe('image/svg+xml');
    expect(loaded.fonts[0].fileId).toBe('preset-font:brochure:fonts-body-ttf');
    expect(loaded.config.customFonts?.[0].variants[0].fileId).toBe('preset-font:brochure:fonts-body-ttf');
  });

  it('honours a custom id scheme and picks locale markdown', async () => {
    const loaded = await parseBundle(
      manifest({
        markdown: { en: 'en.md', es: 'es.md' },
        resources: [{ id: 'fig', typeId: 'figure', kind: 'svg', file: 'resources/fig.svg' }],
      }),
      readerFrom({ 'en.md': 'EN', 'es.md': 'ES', 'resources/fig.svg': SVG }),
      { locale: 'es-ES', summary, ids: { blob: (f) => `project:p1:${f}`, font: (f) => `project-font:p1:${f}` } },
    );
    expect(loaded.markdown).toBe('ES');
    expect(loaded.resources[0].svg?.fileId).toBe('project:p1:resources/fig.svg');
    expect(loaded.blobs[0].fileId).toBe('project:p1:resources/fig.svg');
  });

  it('warns on .woff fonts and rejects invalid manifests / missing files', async () => {
    const warnings: string[] = [];
    const loaded = await parseBundle(
      manifest({ fonts: [{ name: 'Old', variants: [{ weight: 400, style: 'normal', file: 'fonts/old.woff' }] }] }),
      readerFrom({ 'doc.md': 'x' }),
      { locale: 'en', summary, onWarning: (w) => warnings.push(w) },
    );
    expect(loaded.fonts).toHaveLength(0);
    expect(warnings.length).toBeGreaterThan(0);

    await expect(parseBundle({ nope: true }, readerFrom({}), { locale: 'en', summary })).rejects.toThrow(/Invalid preset manifest/);
    await expect(parseBundle(manifest(), readerFrom({}), { locale: 'en', summary })).rejects.toThrow(/missing doc.md/);
  });
});

function sampleContent(): { config: PostextConfig; resources: Resource[]; markdown: string } {
  const config: PostextConfig = {
    ...createDefaultConfig('en'),
    customFonts: [
      {
        name: 'Body',
        variants: [
          { weight: 400, style: 'normal', fileId: 'f-regular', format: 'ttf', fileName: 'Body Regular.ttf' },
          { weight: 700, style: 'normal', fileId: 'f-bold', format: 'woff', fileName: 'Body Bold.woff' },
        ],
      },
    ],
  };
  const resources: Resource[] = [
    { id: 'Fig A', typeId: 'figure', kind: 'svg', createdAt: 1, updatedAt: 2, svg: { fileId: 'b-svg', width: 40, height: 20 }, caption: 'A' },
    { id: 'fig-a', typeId: 'figure', kind: 'bitmap', createdAt: 1, updatedAt: 2, bitmap: { fileId: 'b-jpg', format: 'jpeg', width: 10, height: 5 } },
    { id: 'tbl', typeId: 'table', kind: 'table', createdAt: 1, updatedAt: 2, table: { model: { rows: [] } } },
  ];
  return { config, resources, markdown: '# Doc' };
}

describe('planBundle', () => {
  it('names files from resource ids, dedupes, keeps sizes, strips storage-only fields', () => {
    const plan = planBundle({ id: 'p', name: 'P' }, sampleContent());
    expect(plan.files.map((f) => f.path)).toEqual(['resources/fig-a.svg', 'resources/fig-a-2.jpg', 'fonts/body-regular.ttf']);
    const [svg, jpg, tbl] = plan.manifest.resources!;
    expect(svg).toEqual({ id: 'Fig A', typeId: 'figure', kind: 'svg', caption: 'A', file: 'resources/fig-a.svg', width: 40, height: 20 });
    expect(jpg.file).toBe('resources/fig-a-2.jpg');
    expect(tbl).toEqual({ id: 'tbl', typeId: 'table', kind: 'table', table: { model: { rows: [] } } });
    expect(plan.manifest.markdown).toBe(MARKDOWN_FILE);
    expect(plan.manifest.config?.customFonts).toBeUndefined();
    expect(plan.manifest.fonts).toEqual([{ name: 'Body', variants: [{ weight: 400, style: 'normal', file: 'fonts/body-regular.ttf' }] }]);
    expect(plan.warnings).toHaveLength(1);
    expect(plan.warnings[0]).toMatch(/woff/);
  });
});

describe('buildBundleFiles', () => {
  it('drops resources and fonts whose bytes are missing', async () => {
    const built = await buildBundleFiles({ id: 'p', name: 'P' }, sampleContent(), {
      readBlob: (id) => Promise.resolve(id === 'b-svg' ? enc.encode(SVG).buffer : null),
      readFont: () => Promise.resolve(null),
    });
    expect(Object.keys(built.files).sort()).toEqual(['document.md', 'preset.json', 'resources/fig-a.svg']);
    expect(built.manifest.resources?.map((r) => r.id)).toEqual(['Fig A', 'tbl']);
    expect(built.manifest.fonts).toBeUndefined();
    expect(built.warnings.some((w) => w.startsWith('fig-a'))).toBe(true);
    expect(JSON.parse(dec.decode(built.files['preset.json'])).id).toBe('p');
  });
});

describe('zip round trip', () => {
  it('build → zip → open → parse yields the same document', async () => {
    const content = sampleContent();
    const built = await buildBundleFiles({ id: 'p', name: 'P', locale: 'en' }, content, {
      readBlob: (id) => Promise.resolve(id === 'b-svg' ? enc.encode(SVG).buffer : new Uint8Array([9, 9]).buffer),
      readFont: () => Promise.resolve(new Uint8Array([1, 2]).buffer),
    });
    const zipped = zipBundle(built.files);
    const opened = openBundleZip(zipped);
    expect(opened.rootPrefix).toBe('');
    const loaded = await parseBundle(opened.manifest, opened.readFile, { locale: 'en', summary });
    expect(loaded.markdown).toBe('# Doc');
    expect(loaded.resources.map((r) => r.id)).toEqual(['Fig A', 'fig-a', 'tbl']);
    expect(loaded.resources[0].svg).toMatchObject({ width: 40, height: 20 });
    expect(loaded.resources[1].bitmap).toMatchObject({ format: 'jpeg', width: 10, height: 5 });
    expect(dec.decode(loaded.blobs[0].bytes)).toBe(SVG);
    expect(loaded.fonts).toHaveLength(1);
    expect(loaded.config.customFonts?.[0].variants).toHaveLength(1);
    expect(loaded.summary.locale).toBe('en');
  });

  it('accepts a bundle nested under one folder and ignores __MACOSX', () => {
    const files = {
      'acme/preset.json': enc.encode(JSON.stringify(manifest())),
      'acme/doc.md': enc.encode('nested'),
      '__MACOSX/acme/._preset.json': enc.encode('junk'),
      'acme/.DS_Store': enc.encode('junk'),
    };
    const opened = openBundleZip(zipBundle(files));
    expect(opened.rootPrefix).toBe('acme/');
    expect(opened.entries).toEqual(['acme/preset.json', 'acme/doc.md']);
    return expect(opened.readFile('doc.md').then((b) => dec.decode(b))).resolves.toBe('nested');
  });

  it('rejects archives without, or with several, manifests, and path escapes', () => {
    expect(() => openBundleZip(zipBundle({ 'a.txt': enc.encode('x') }))).toThrow(/no preset.json/);
    expect(() => openBundleZip(zipBundle({
      'a/preset.json': enc.encode('{}'),
      'b/preset.json': enc.encode('{}'),
    }))).toThrow(/several/);
    expect(() => openBundleZip(new Uint8Array([1, 2, 3]))).toThrow(/Not a zip/);
    const opened = openBundleZip(zipBundle({ 'preset.json': enc.encode('{}') }));
    return expect(opened.readFile('../x')).rejects.toThrow(/Invalid bundle path/);
  });
});
