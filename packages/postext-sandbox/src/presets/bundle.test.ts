import { describe, expect, it } from 'vitest';
import type { PostextConfig, Resource } from 'postext';
import { createDefaultConfig } from '../context/defaultConfig';
import { buildBundleFiles, parseBundle, planBundle } from './bundle';
import { fontsToCustomFonts } from './manifest';
import { newChapter } from '../book/chapterOps';
import type { Chapter, ChapterLayout } from '../book/types';
import { ENGINE_KEY, configKeyOf, resourcesKeyOf } from '../book/layoutKeys';
import { openBundleZip, zipBundle } from './zip';
import type { PresetManifestV1, PresetSummary } from './types';

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

const manifest = (over: Partial<PresetManifestV1> = {}): PresetManifestV1 => ({
  version: 1,
  id: 'brochure',
  name: 'Brochure',
  markdown: 'doc.md',
  ...over,
});

describe('parseBundle', () => {
  it('applies the locale overrides to resources and config', async () => {
    const m = manifest({
      markdown: { en: 'en.md', es: 'es.md' },
      resources: [{ id: 'fig', typeId: 'figure', kind: 'svg', file: 'resources/fig.svg', caption: 'shared' }],
      config: { resourceTypes: [{ id: 'figure', name: 'Figure', shortLabel: 'Fig.', numberingTemplate: '{n}', resetOn: 'never', counterFormat: 'decimal', captionPrefix: 'Plate' }] },
      localized: {
        es: {
          config: { resourceTypes: [{ id: 'figure', name: 'Lámina', shortLabel: 'Lám.', numberingTemplate: '{n}', resetOn: 'never', counterFormat: 'decimal', captionPrefix: 'Lámina' }] },
          resources: [{ id: 'fig', caption: 'La biblioteca', note: 'Doré' }],
        },
      },
    });
    const files = { 'en.md': 'EN', 'es.md': 'ES', 'resources/fig.svg': SVG };
    const es = await parseBundle(m, readerFrom(files), { locale: 'es', summary });
    expect(es.resources[0]!.caption).toBe('La biblioteca');
    expect(es.resources[0]!.note).toBe('Doré');
    expect(es.config.resourceTypes?.[0]!.captionPrefix).toBe('Lámina');
    const en = await parseBundle(m, readerFrom(files), { locale: 'en', summary });
    expect(en.resources[0]!.caption).toBe('shared');
    expect(en.config.resourceTypes?.[0]!.captionPrefix).toBe('Plate');
  });
  it('lets a locale bring its own artwork, and reads that file\'s own size', async () => {
    const m = manifest({
      markdown: { en: 'en.md', es: 'es.md' },
      resources: [{ id: 'fig', typeId: 'figure', kind: 'svg', file: 'resources/fig.svg', width: 40, height: 20 }],
      localized: { en: { resources: [{ id: 'fig', file: 'resources/en/fig.svg' }] } },
    });
    const files = {
      'en.md': 'EN', 'es.md': 'ES',
      'resources/fig.svg': SVG,
      'resources/en/fig.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="30"></svg>',
    };
    const en = await parseBundle(m, readerFrom(files), { locale: 'en', summary });
    expect(en.blobs.map((b) => b.fileId)).toEqual(['preset:brochure:resources-en-fig-svg']);
    // The shared spec's size describes the other file, so it is dropped.
    expect(en.resources[0]!.svg).toEqual({ fileId: 'preset:brochure:resources-en-fig-svg' });
    const es = await parseBundle(m, readerFrom(files), { locale: 'es', summary });
    expect(es.blobs.map((b) => b.fileId)).toEqual(['preset:brochure:resources-fig-svg']);
    expect(es.resources[0]!.svg).toEqual({ fileId: 'preset:brochure:resources-fig-svg', width: 40, height: 20 });
  });

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
    expect(loaded.chapters.map((c) => c.markdown)).toEqual(['# Hi']);
    expect(loaded.chapters[0]!.title).toBe('Hi');
    expect(loaded.resources.map((r) => r.id)).toEqual(['fig', 'tbl']);
    // Intrinsic size needs DOMParser (browser only); node yields just the id.
    expect(loaded.resources[0].svg).toEqual({ fileId: 'preset:brochure:resources-fig-svg' });
    expect(loaded.resources[1].table).toEqual({ model: { rows: [] } });
    expect(loaded.blobs).toHaveLength(1);
    expect(loaded.blobs[0].mime).toBe('image/svg+xml');
    expect(loaded.fonts[0].fileId).toBe('preset-font:brochure:fonts-body-ttf');
    expect(loaded.config.customFonts?.[0].variants[0].fileId).toBe('preset-font:brochure:fonts-body-ttf');
  });

  it('gives preset chapters ids that survive applying the preset again', async () => {
    const m = manifest({ markdown: { en: 'en.md' } });
    const once = await parseBundle(m, readerFrom({ 'en.md': 'EN' }), { locale: 'en', summary });
    const twice = await parseBundle(m, readerFrom({ 'en.md': 'EN' }), { locale: 'en', summary });
    expect(once.chapters.map((c) => c.id)).toEqual(twice.chapters.map((c) => c.id));
    expect(once.chapters[0]!.id).toBe(`preset-chapter:${m.id}:en-md`);
    let n = 0;
    const custom = await parseBundle(m, readerFrom({ 'en.md': 'EN' }), { locale: 'en', summary, chapterIds: () => `c${++n}` });
    expect(custom.chapters[0]!.id).toBe('c1');
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
    expect(loaded.chapters[0]!.markdown).toBe('ES');
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

function sampleContent(): { config: PostextConfig; resources: Resource[]; chapters: Chapter[] } {
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
  return { config, resources, chapters: [newChapter('c1', 'Doc', '# Doc', 1), newChapter('c2', 'Two', '# Two', 1)] };
}

describe('planBundle', () => {
  it('names files from resource ids, dedupes, keeps sizes, strips storage-only fields', () => {
    const plan = planBundle({ id: 'p', name: 'P' }, sampleContent());
    expect(plan.files.map((f) => f.path)).toEqual(['resources/fig-a.svg', 'resources/fig-a-2.jpg', 'fonts/body-regular.ttf']);
    const [svg, jpg, tbl] = plan.manifest.resources!;
    expect(svg).toEqual({ id: 'Fig A', typeId: 'figure', kind: 'svg', caption: 'A', file: 'resources/fig-a.svg', width: 40, height: 20 });
    expect(jpg.file).toBe('resources/fig-a-2.jpg');
    expect(tbl).toEqual({ id: 'tbl', typeId: 'table', kind: 'table', table: { model: { rows: [] } } });
    expect(plan.manifest.version).toBe(2);
    expect(plan.manifest.chapters).toEqual([{ title: 'Doc', file: 'chapters/01-doc.md' }, { title: 'Two', file: 'chapters/02-two.md' }]);
    expect(plan.manifest.config?.customFonts).toBeUndefined();
    expect(plan.manifest.fonts).toEqual([{ name: 'Body', variants: [{ weight: 400, style: 'normal', file: 'fonts/body-regular.ttf' }] }]);
    expect(plan.warnings).toHaveLength(1);
    expect(plan.warnings[0]).toMatch(/woff/);
  });
});

describe('planBundle (a family that may not be passed on)', () => {
  it('leaves a non-redistributable family behind, files and entry alike', () => {
    const content = sampleContent();
    content.config.customFonts = content.config.customFonts!.map((f) => ({ ...f, redistributable: false }));
    const plan = planBundle({ id: 'p', name: 'P' }, content);
    expect(plan.files.some((f) => f.kind === 'font')).toBe(false);
    expect(plan.manifest.fonts).toBeUndefined();
    expect(plan.warnings.some((w) => /not redistributable/.test(w))).toBe(true);
  });

  it('carries the flag back out of a manifest that sets it', () => {
    const { families } = fontsToCustomFonts('p', [
      { name: 'Body', variants: [{ weight: 400, style: 'normal', file: 'fonts/body.ttf' }], redistributable: false },
      { name: 'Free', variants: [{ weight: 400, style: 'normal', file: 'fonts/free.ttf' }] },
    ]);
    expect(families[0]!.redistributable).toBe(false);
    expect(families[1]).not.toHaveProperty('redistributable');
  });
});

describe('planBundle (cover picture)', () => {
  it('writes the cover under the bundle thumbnail name and declares it', () => {
    const content = { ...sampleContent(), thumbnail: { fileId: 'b-cover', mime: 'image/jpeg' } };
    const plan = planBundle({ id: 'p', name: 'P' }, content);
    expect(plan.files.find((f) => f.fileId === 'b-cover')?.path).toBe('thumbnail.jpg');
    expect(plan.manifest.thumbnail).toBe('thumbnail.jpg');
  });

  it('declares no cover for a media type that is not an image', () => {
    const content = { ...sampleContent(), thumbnail: { fileId: 'b-cover', mime: 'application/pdf' } };
    const plan = planBundle({ id: 'p', name: 'P' }, content);
    expect(plan.manifest.thumbnail).toBeUndefined();
    expect(plan.files.some((f) => f.fileId === 'b-cover')).toBe(false);
  });

  it('drops the cover from the manifest when its bytes are gone', async () => {
    const content = { ...sampleContent(), thumbnail: { fileId: 'b-cover', mime: 'image/png' } };
    const built = await buildBundleFiles({ id: 'p', name: 'P' }, content, {
      readBlob: (id) => Promise.resolve(id === 'b-cover' ? null : enc.encode(SVG).buffer),
      readFont: () => Promise.resolve(new Uint8Array([1, 2]).buffer),
    });
    expect(built.manifest.thumbnail).toBeUndefined();
    expect(built.files['thumbnail.png']).toBeUndefined();
  });

  it('carries the cover bytes into the built bundle', async () => {
    const content = { ...sampleContent(), thumbnail: { fileId: 'b-cover', mime: 'image/png' } };
    const built = await buildBundleFiles({ id: 'p', name: 'P' }, content, {
      readBlob: (id) => Promise.resolve(id === 'b-cover' ? new Uint8Array([137, 80]).buffer : enc.encode(SVG).buffer),
      readFont: () => Promise.resolve(new Uint8Array([1, 2]).buffer),
    });
    expect(built.manifest.thumbnail).toBe('thumbnail.png');
    expect(Array.from(built.files['thumbnail.png']!)).toEqual([137, 80]);
  });
});

describe('planBundle (print masters)', () => {
  it('exports an SVG print master next to the SVG and drops it when its bytes are gone', async () => {
    const content = sampleContent();
    const withMaster: Resource = {
      ...content.resources[0]!,
      svg: { ...content.resources[0]!.svg!, pdfFileId: 'b-master' },
    };
    const next = { ...content, resources: [withMaster] };
    const plan = planBundle({ id: 'p', name: 'P' }, next);
    expect(plan.files.map((f) => f.path)).toEqual(['resources/fig-a.svg', 'resources/fig-a.pdf', 'fonts/body-regular.ttf']);
    expect(plan.manifest.resources![0]).toMatchObject({ file: 'resources/fig-a.svg', pdfFile: 'resources/fig-a.pdf' });

    const built = await buildBundleFiles({ id: 'p', name: 'P' }, next, {
      readBlob: (id) => Promise.resolve(id === 'b-svg' ? enc.encode(SVG).buffer : null),
      readFont: () => Promise.resolve(null),
    });
    expect(built.manifest.resources![0]!.pdfFile).toBeUndefined();
    expect(built.manifest.resources![0]!.file).toBe('resources/fig-a.svg');
  });

  it('loads a print master from a bundle and tolerates a missing one', async () => {
    const m = manifest({ resources: [
      { id: 'a', typeId: 'figure', kind: 'svg', file: 'resources/a.svg', pdfFile: 'resources/a.pdf' },
      { id: 'b', typeId: 'figure', kind: 'svg', file: 'resources/b.svg', pdfFile: 'resources/b.pdf' },
    ] });
    const warnings: string[] = [];
    const loaded = await parseBundle(m, readerFrom({
      'doc.md': '# Doc', 'resources/a.svg': SVG, 'resources/a.pdf': '%PDF-1.4\n', 'resources/b.svg': SVG,
    }), { locale: 'en', summary, onWarning: (w) => warnings.push(w) });
    expect(loaded.resources[0]!.svg).toMatchObject({ fileId: 'preset:brochure:resources-a-svg', pdfFileId: 'preset:brochure:resources-a-pdf' });
    expect(loaded.resources[1]!.svg!.pdfFileId).toBeUndefined();
    expect(loaded.blobs.map((b) => b.fileId)).toContain('preset:brochure:resources-a-pdf');
    expect(loaded.blobs.find((b) => b.fileId === 'preset:brochure:resources-a-pdf')?.mime).toBe('application/pdf');
    expect(warnings.some((w) => w.includes('b.pdf'))).toBe(true);
  });
});

describe('buildBundleFiles', () => {
  it('drops resources and fonts whose bytes are missing', async () => {
    const built = await buildBundleFiles({ id: 'p', name: 'P' }, sampleContent(), {
      readBlob: (id) => Promise.resolve(id === 'b-svg' ? enc.encode(SVG).buffer : null),
      readFont: () => Promise.resolve(null),
    });
    expect(Object.keys(built.files).sort()).toEqual(['chapters/01-doc.md', 'chapters/02-two.md', 'preset.json', 'resources/fig-a.svg']);
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
    expect(loaded.chapters.map((c) => [c.title, c.markdown])).toEqual([['Doc', '# Doc'], ['Two', '# Two']]);
    expect(loaded.chapters[0]!.id).not.toBe('c1');
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

describe('parseBundle (v2)', () => {
  it('reads every chapter in order with fresh ids and derived titles', async () => {
    let n = 0;
    const loaded = await parseBundle(
      { version: 2, id: 'book', name: 'Book', chapters: [{ title: 'Intro', file: 'chapters/01.md' }, { title: '', file: 'chapters/02.md' }, { title: '', file: 'chapters/03.md' }] },
      readerFrom({ 'chapters/01.md': 'one', 'chapters/02.md': '# Second', 'chapters/03.md': 'plain' }),
      { locale: 'en', summary, chapterIds: () => `id${++n}`, untitledChapter: (k) => `Cap. ${k}` },
    );
    expect(loaded.chapters.map((c) => [c.id, c.title, c.markdown])).toEqual([
      ['id1', 'Intro', 'one'],
      ['id2', 'Second', '# Second'],
      ['id3', 'Cap. 3', 'plain'],
    ]);
  });
});

describe('layouts.json round trip', () => {
  const layoutOf = (chapter: Chapter, config: PostextConfig, resources: Resource[]): ChapterLayout => ({
    chapterId: chapter.id,
    markdown: chapter.markdown,
    configKey: configKeyOf(config),
    resourcesKey: resourcesKeyOf(resources),
    engine: ENGINE_KEY,
    continuationKey: 'first',
    pageCount: 3,
    leadingBlankPages: 0,
    firstContentPageNumber: { delta: 0 },
    firstContentPageFormat: 'decimal',
    lastPageNumber: { delta: 2 },
    lastPageFormat: 'decimal',
    outlinePages: [{ index: 0, number: { delta: 0 }, format: 'decimal' }],
    outlineKey: '',
  });
  const chapters = [newChapter('c1', 'One', '# One\n\nText.', 1), newChapter('c2', 'Two', '# Two', 1)];
  const config: PostextConfig = { ...createDefaultConfig('en'), bodyText: { fontSize: { value: 11, unit: 'pt' } } };
  const resources: Resource[] = [
    { id: 'tbl', typeId: 'table', kind: 'table', caption: 'Sizes.', createdAt: 5, updatedAt: 6, table: { model: { rows: [[{ content: 'a' }]] } } },
    { id: 'fig', typeId: 'figure', kind: 'svg', caption: 'A figure.', createdAt: 5, updatedAt: 6, svg: { fileId: 'blob-1', width: 40, height: 20 } },
  ];
  const meta = { id: 'book', name: 'Book' };
  const sources = { readBlob: async () => enc.encode(SVG).buffer as ArrayBuffer, readFont: async () => null };

  it('carries current records and re-keys them to the imported chapters', async () => {
    const layouts = { c1: layoutOf(chapters[0]!, config, resources), c2: layoutOf(chapters[1]!, config, resources) };
    const built = await buildBundleFiles(meta, { chapters, config, resources, layouts }, sources);
    expect(Object.keys(built.files)).toContain('layouts.json');
    const opened = openBundleZip(zipBundle(built.files));
    let n = 0;
    const loaded = await parseBundle(opened.manifest, opened.readFile, { locale: 'en', summary, chapterIds: () => `new-${++n}` });
    expect(loaded.layouts).toBeDefined();
    expect(Object.keys(loaded.layouts!)).toEqual(['new-1', 'new-2']);
    const first = loaded.layouts!['new-1']!;
    expect(first.markdown).toBe('# One\n\nText.');
    expect(first.pageCount).toBe(3);
    expect(first.outlinePages[0]).toEqual({ index: 0, number: { delta: 0 }, format: 'decimal' });
    // The imported configuration and resources fingerprint like the exported ones.
    expect(first.configKey).toBe(configKeyOf(loaded.config));
    expect(first.resourcesKey).toBe(resourcesKeyOf(loaded.resources));
  });

  it('carries the current records only, and no file without any', async () => {
    const chapterFiles = (built: Awaited<ReturnType<typeof buildBundleFiles>>): string[] =>
      Object.keys((JSON.parse(dec.decode(built.files['layouts.json']!)) as { chapters: Record<string, unknown> }).chapters);
    // The chapter files, in book order (their names are numbered).
    const mdFiles = (built: Awaited<ReturnType<typeof buildBundleFiles>>): string[] => Object.keys(built.files).filter((f) => f.endsWith('.md')).sort();
    const stale = { c1: { ...layoutOf(chapters[0]!, config, resources), markdown: 'edited' }, c2: layoutOf(chapters[1]!, config, resources) };
    const built = await buildBundleFiles(meta, { chapters, config, resources, layouts: stale }, sources);
    expect(chapterFiles(built)).toEqual([mdFiles(built)[1]]);
    const partial = await buildBundleFiles(meta, { chapters, config, resources, layouts: { c1: layoutOf(chapters[0]!, config, resources) } }, sources);
    expect(chapterFiles(partial)).toEqual([mdFiles(partial)[0]]);
    const none = await buildBundleFiles(meta, { chapters, config, resources }, sources);
    expect(Object.keys(none.files)).not.toContain('layouts.json');
    const empty = await buildBundleFiles(meta, { chapters, config, resources, layouts: {} }, sources);
    expect(Object.keys(empty.files)).not.toContain('layouts.json');
  });

  it('opens a pagination that stops short up to the gap', async () => {
    const partial = await buildBundleFiles(meta, { chapters, config, resources, layouts: { c1: layoutOf(chapters[0]!, config, resources) } }, sources);
    const opened = openBundleZip(zipBundle(partial.files));
    const loaded = await parseBundle(opened.manifest, opened.readFile, { locale: 'en', summary });
    expect(Object.keys(loaded.layouts!)).toHaveLength(1);
    expect(Object.values(loaded.layouts!)[0]!.markdown).toBe('# One\n\nText.');
  });

  it('drops a pagination built by another engine or configuration', async () => {
    const layouts = { c1: layoutOf(chapters[0]!, config, resources), c2: layoutOf(chapters[1]!, config, resources) };
    const built = await buildBundleFiles(meta, { chapters, config, resources, layouts }, sources);
    const text = dec.decode(built.files['layouts.json']!);
    const files = { ...built.files, 'layouts.json': enc.encode(text.replace(ENGINE_KEY, '0.0.0')) };
    const opened = openBundleZip(zipBundle(files));
    const loaded = await parseBundle(opened.manifest, opened.readFile, { locale: 'en', summary });
    expect(loaded.layouts).toBeUndefined();
  });
});

describe('parseBundle locale', () => {
  const bilingual = manifest({ locale: 'es', locales: ['es', 'en'], markdown: { es: 'es.md', en: 'en.md' } });
  const files = { 'es.md': 'Hola', 'en.md': 'Hello' };

  it('reports the locale it served, region and case folded', async () => {
    const es = await parseBundle(bilingual, readerFrom(files), { locale: 'es-ES', summary });
    expect(es.locale).toBe('es');
    expect(es.summary.locale).toBe('es');
    const en = await parseBundle(bilingual, readerFrom(files), { locale: 'EN', summary });
    expect(en.locale).toBe('en');
    expect(en.summary.locale).toBe('en');
    expect(en.chapters[0]!.markdown).toBe('Hello');
  });

  it('falls back to the bundle locale for a language it does not carry', async () => {
    const loaded = await parseBundle(bilingual, readerFrom(files), { locale: 'fr', summary });
    expect(loaded.locale).toBe('es');
    expect(loaded.chapters[0]!.markdown).toBe('Hola');
  });

  it('keeps a single-language bundle on its own locale, else the requested one', async () => {
    const own = await parseBundle(manifest({ locale: 'en' }), readerFrom({ 'doc.md': 'x' }), { locale: 'es', summary });
    expect(own.locale).toBe('en');
    const none = await parseBundle(manifest(), readerFrom({ 'doc.md': 'x' }), { locale: 'es', summary });
    expect(none.locale).toBe('es');
  });
});
