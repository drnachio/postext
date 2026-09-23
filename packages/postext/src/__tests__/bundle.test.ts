import { describe, it, expect } from 'vitest';
import { zipSync } from 'fflate';
import {
  bitmapSize,
  buildBundle,
  bundleFontProvider,
  bundleResourceBytes,
  createBundle,
  isBundleManifest,
  openBundle,
  openBundleZip,
  svgSize,
} from '../bundle';
import type { PostextConfig, Resource } from '../types';

// Deterministic text measurement stub (no DOM in the node test env).
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const enc = new TextEncoder();
const pt = (value: number) => ({ value, unit: 'pt' as const });

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect width="200" height="100" fill="#2a6f97"/></svg>';
// 1×1 PNG header with a 3×2 size (only the header is read).
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
  0, 0, 0, 3, 0, 0, 0, 2, 8, 6, 0, 0, 0, 0, 0, 0,
]);
const FONT = new Uint8Array([0, 1, 0, 0, 1, 2, 3, 4]);

const svgResource: Resource = {
  id: 'fig-map',
  typeId: 'figure',
  kind: 'svg',
  caption: 'A map.',
  createdAt: 1,
  updatedAt: 1,
  svg: { fileId: 'map-upload', width: 200, height: 100 },
};

const config: PostextConfig = {
  page: { width: pt(360), height: pt(480), margins: { top: pt(18), bottom: pt(18), left: pt(18), right: pt(18) } },
  bodyText: { fontFamily: 'House Serif' },
  headings: { levels: [{ level: 1, numberingTemplate: 'Chapter {1}' }] },
  customFonts: [{ name: 'House Serif', variants: [{ weight: 400, style: 'normal', fileId: 'font-1', format: 'ttf', fileName: 'HouseSerif-Regular.ttf' }] }],
};

async function sample() {
  return createBundle({
    name: 'The Lantern',
    locale: 'en',
    chapters: [
      { markdown: '# Dusk\n\nThe lantern hung by the door. ::resource{id=fig-map}\n' },
      { title: 'Night', markdown: '# Night\n\nNobody moved it.\n' },
    ],
    config,
    resources: [svgResource],
    files: { 'map-upload': SVG, 'font-1': FONT },
  });
}

describe('createBundle', () => {
  it('writes a version 2 manifest, chapter files, resources and fonts', async () => {
    const { bytes, manifest, files, warnings } = await sample();
    expect(warnings).toEqual([]);
    expect(manifest.version).toBe(2);
    expect(manifest.id).toBe('the-lantern');
    expect(manifest.chapters).toEqual([
      { title: 'Dusk', file: 'chapters/01-dusk.md' },
      { title: 'Night', file: 'chapters/02-night.md' },
    ]);
    expect(manifest.resources?.[0]).toMatchObject({ id: 'fig-map', file: 'resources/fig-map.svg', width: 200, height: 100 });
    expect(manifest.fonts).toEqual([{ name: 'House Serif', variants: [{ weight: 400, style: 'normal', file: 'fonts/houseserif-regular.ttf' }] }]);
    // Fonts travel as files, never inside the config.
    expect(manifest.config?.customFonts).toBeUndefined();
    expect(Object.keys(files).sort()).toEqual([
      'chapters/01-dusk.md', 'chapters/02-night.md', 'fonts/houseserif-regular.ttf', 'preset.json', 'resources/fig-map.svg',
    ]);
    expect(isBundleManifest(JSON.parse(new TextDecoder().decode(files['preset.json'])))).toBe(true);
    expect(bytes[0]).toBe(0x50); // PK
  });

  it('drops a resource whose payload is missing, with a warning', async () => {
    const { manifest, warnings } = await createBundle({ name: 'x', markdown: '# X', resources: [svgResource] });
    expect(manifest.resources).toBeUndefined();
    expect(warnings).toEqual(['fig-map: missing file, skipped']);
  });

  it('requires some content', async () => {
    await expect(createBundle({ name: 'empty' })).rejects.toThrow(/chapters/);
  });
});

describe('openBundle', () => {
  it('round-trips a bundle written by createBundle', async () => {
    const { bytes } = await sample();
    const bundle = await openBundle(bytes);
    expect(bundle.name).toBe('The Lantern');
    expect(bundle.locale).toBe('en');
    expect(bundle.chapters.map((c) => c.title)).toEqual(['Dusk', 'Night']);
    expect(bundle.chapters[1]!.markdown).toBe('# Night\n\nNobody moved it.\n');
    // fileIds are paths inside the bundle.
    const figure = bundle.resources[0]!;
    expect(figure.svg).toEqual({ fileId: 'resources/fig-map.svg', width: 200, height: 100 });
    expect(new TextDecoder().decode(bundle.files.get(figure.svg!.fileId))).toBe(SVG);
    expect(bundle.config.customFonts).toEqual([
      { name: 'House Serif', variants: [{ weight: 400, style: 'normal', fileId: 'fonts/houseserif-regular.ttf', format: 'ttf', fileName: 'houseserif-regular.ttf' }] },
    ]);
    expect(bundle.config.bodyText?.fontFamily).toBe('House Serif');
    // The base configuration: localised resource types and the default palette.
    expect(bundle.config.resourceTypes?.length).toBeGreaterThan(0);
    expect(bundle.config.colorPalette?.length).toBeGreaterThan(0);
    expect(bundle.fonts).toHaveLength(1);
    expect(new Uint8Array(bundle.fonts[0]!.bytes)).toEqual(FONT);
  });

  it('accepts a Blob and a bundle zipped with its top-level folder', async () => {
    const { files } = await sample();
    const nested: Record<string, Uint8Array> = { '__MACOSX/._preset.json': new Uint8Array([1]) };
    for (const [p, data] of Object.entries(files)) nested[`lantern/${p}`] = data;
    const bundle = await openBundle(new Blob([zipSync(nested)]));
    expect(bundle.chapters).toHaveLength(2);
    expect(bundle.files.has('resources/fig-map.svg')).toBe(true);
  });

  it('reads sizes from the files when the manifest omits them', async () => {
    const manifest = {
      version: 2, id: 'b', name: 'B',
      chapters: [{ title: '', file: 'a.md' }],
      resources: [
        { id: 'p', typeId: 'figure', kind: 'bitmap', file: 'p.png' },
        { id: 's', typeId: 'figure', kind: 'svg', file: 's.svg' },
      ],
    };
    const zip = zipSync({ 'preset.json': enc.encode(JSON.stringify(manifest)), 'a.md': enc.encode('Text.'), 'p.png': PNG, 's.svg': enc.encode(SVG) });
    const bundle = await openBundle(zip);
    expect(bundle.resources.find((r) => r.id === 'p')!.bitmap).toMatchObject({ fileId: 'p.png', format: 'png', width: 3, height: 2 });
    expect(bundle.resources.find((r) => r.id === 's')!.svg).toMatchObject({ width: 200, height: 100 });
    expect(bundle.chapters[0]!.title).toBe('Chapter 1');
  });

  it('picks the locale of a bilingual bundle and its overrides', async () => {
    const manifest = {
      version: 2, id: 'bi', name: 'Bi', locale: 'en',
      chapters: { en: [{ title: 'One', file: 'en.md' }], es: [{ title: 'Uno', file: 'es.md' }] },
      resources: [{ id: 't', typeId: 'table', kind: 'table', caption: 'Table', table: { rows: [[{ content: 'x' }]] } }],
      localized: { es: { resources: [{ id: 't', caption: 'Tabla' }] } },
    };
    const zip = zipSync({ 'preset.json': enc.encode(JSON.stringify(manifest)), 'en.md': enc.encode('# One'), 'es.md': enc.encode('# Uno') });
    const es = await openBundle(zip, { locale: 'es-ES' });
    expect(es.locale).toBe('es');
    expect(es.chapters[0]!.markdown).toBe('# Uno');
    expect(es.resources[0]!.caption).toBe('Tabla');
    const en = await openBundle(zip);
    expect(en.locale).toBe('en');
    expect(en.resources[0]!.caption).toBe('Table');
  });

  it('rejects what is not a bundle', async () => {
    await expect(openBundle(new Uint8Array([1, 2, 3]))).rejects.toThrow('Not a zip archive');
    await expect(openBundle(zipSync({ 'a.md': enc.encode('x') }))).rejects.toThrow('no preset.json');
    await expect(openBundle(zipSync({ 'preset.json': enc.encode('{"version":9}') }))).rejects.toThrow('Invalid bundle manifest');
  });

  it('refuses paths that escape the bundle', async () => {
    const manifest = { version: 2, id: 'e', name: 'E', chapters: [{ title: 'x', file: '../outside.md' }] };
    const opened = openBundleZip(zipSync({ 'b/preset.json': enc.encode(JSON.stringify(manifest)), 'outside.md': enc.encode('x') }));
    await expect(opened.readFile('../outside.md')).rejects.toThrow('Invalid bundle path');
  });
});

describe('adapters', () => {
  it('resolves resource bytes and fonts for the PDF backend', async () => {
    const bundle = await openBundle((await sample()).bytes);
    const bytes = bundleResourceBytes(bundle);
    expect(new TextDecoder().decode(bytes('resources/fig-map.svg'))).toBe(SVG);
    const provider = bundleFontProvider(bundle, { fallback: async () => new Uint8Array([9]) });
    expect(await provider('House Serif', 700, 'italic')).toEqual(FONT);
    expect(await provider('Open Sans', 700, 'normal')).toEqual(new Uint8Array([9]));
    await expect(bundleFontProvider(bundle)('Open Sans', 400, 'normal')).rejects.toThrow(/not in the bundle/);
  });

  it('asks for a WOFF2 decoder when a face is WOFF2', async () => {
    const provider = bundleFontProvider({ fonts: [{ fileId: 'f.woff2', file: 'f.woff2', fileName: 'f.woff2', family: 'F', weight: 400, style: 'normal', format: 'woff2', bytes: new ArrayBuffer(4) }] });
    await expect(provider('F', 400, 'normal')).rejects.toThrow(/decodeWoff2/);
  });
});

describe('buildBundle', () => {
  it('lays the chapters out as one book: counters, page offsets and numbering carry over', async () => {
    const bundle = await openBundle((await sample()).bytes);
    const docs = buildBundle(bundle);
    expect(docs).toHaveLength(2);
    const prefixes = docs.map((d) => d.blocks.find((b) => b.type === 'heading')?.numberPrefix?.trim());
    expect(prefixes).toEqual(['Chapter 1', 'Chapter 2']);
    expect(docs[1]!.pageIndexOffset).toBe(docs[0]!.pages.length);
    expect(docs[1]!.pages[0]!.pageNumberValue).toBe(docs[0]!.pages.at(-1)!.pageNumberValue + 1);
  });

  it('gives a chapter with a table of contents the whole book outline', async () => {
    const docs = buildBundle({
      config,
      resources: [],
      chapters: [
        { markdown: ':::toc\n:::\n' },
        { markdown: '# Dusk\n\nText.' },
        { markdown: '# Night\n\nText.' },
      ],
    });
    const text = JSON.stringify(docs[0]!.blocks);
    expect(text).toContain('Dusk');
    expect(text).toContain('Night');
  });
});

describe('intrinsic sizes', () => {
  it('reads SVG sizes from attributes or the viewBox', () => {
    expect(svgSize('<svg width="10pt" height="20pt"></svg>')).toEqual({ width: 10 * (96 / 72), height: 20 * (96 / 72) });
    expect(svgSize("<?xml version='1.0'?><!-- <svg width='1'> --><svg viewBox='0,0,30,40'/>")).toEqual({ width: 30, height: 40 });
    expect(svgSize('<svg width="100%"></svg>')).toBeUndefined();
  });

  it('reads bitmap headers', () => {
    expect(bitmapSize(PNG)).toEqual({ width: 3, height: 2 });
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 5, 0, 7, 0]);
    expect(bitmapSize(gif)).toEqual({ width: 5, height: 7 });
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0, 9, 0, 12, 3, 0, 0]);
    expect(bitmapSize(jpeg)).toEqual({ width: 12, height: 9 });
    expect(bitmapSize(new Uint8Array([1, 2, 3]))).toBeUndefined();
  });
});
