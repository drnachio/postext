import { describe, it, expect } from 'vitest';
import { zipSync } from 'fflate';
import {
  bitmapSize,
  buildBundle,
  bundleFontProvider,
  bundleResourceBytes,
  CONFIG_VERSION,
  createBundle,
  isBundleManifest,
  migrateConfig,
  openBundle,
  openBundleZip,
  pickLocaleOverrides,
  resolveBundleLocale,
  svgSize,
} from '../bundle';
import type { BundleManifestV2 } from '../bundle';
import { buildDocument } from '../pipeline';
import { resolveHeadingsConfig } from '../defaults';
import type { PostextConfig, Resource } from '../types';
import type { VDTDesignTextBlock, VDTPage } from '../vdt';

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

const filler = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    `Paragraph ${i} with enough words to consume vertical space and force the column and page to overflow onto following pages.`,
  ).join('\n\n');

/** `config` with a one-element running head. */
const withHeader = (content: string): PostextConfig => ({
  ...config,
  header: {
    elements: [{
      kind: 'text', id: 'rh', content, fontSize: pt(8), overflow: 'wrap',
      placement: { anchor: { to: 'container', edge: 'bottom' }, size: { width: 'auto', height: 'auto' } },
    }],
  },
});

const headerText = (page: VDTPage): string =>
  (page.header?.blocks ?? []).filter((b): b is VDTDesignTextBlock => b.kind === 'text').map((b) => b.lines.map((l) => l.text).join(' ')).join(' | ');

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

  it('writes a bilingual bundle that openBundle reads in either locale', async () => {
    const SVG_ES = SVG.replace('#2a6f97', '#97432a');
    const table: Resource = {
      id: 'tbl', typeId: 'table', kind: 'table', caption: 'Hours of light.', createdAt: 1, updatedAt: 1,
      table: { model: { rows: [[{ content: 'Dusk' }, { content: '19:40' }]] } },
    };
    const { bytes, manifest, files, warnings } = await createBundle({
      name: 'The Lantern',
      locale: 'en',
      chapters: [
        { markdown: '# Dusk\n\nThe lantern hung by the door. ::resource{id=fig-map}\n' },
        { title: 'Night', markdown: '# Night\n\nNobody moved it.\n' },
      ],
      config: { ...config, layout: { layoutType: 'single' } },
      resources: [svgResource, table],
      files: { 'map-upload': SVG, 'map-es': SVG_ES, 'font-1': FONT },
      localized: {
        es: {
          chapters: [
            { markdown: '# Anochecer\n\nEl farol colgaba junto a la puerta. ::resource{id=fig-map}\n' },
            { title: 'Noche', markdown: '# Noche\n\nNadie lo movió.\n' },
          ],
          // Top-level keys replace the shared ones; `layout: {}` goes back
          // to the default two columns; `bodyText` repeats the shared
          // value and is not written.
          config: { headings: { levels: [{ level: 1, numberingTemplate: 'Capítulo {1}' }] }, layout: {}, bodyText: { fontFamily: 'House Serif' } },
          resources: [
            { id: 'fig-map', caption: 'Un mapa.', svg: { fileId: 'map-es', width: 200, height: 100 } },
            { id: 'tbl', caption: 'Horas de luz.', table: { model: { rows: [[{ content: 'Anochecer' }, { content: '19:40' }]] } } },
            { id: 'nope', caption: '¿?' },
          ],
        },
      },
    });
    expect(warnings).toEqual(['nope: not among the resources, its es wording left out']);
    expect(manifest.locale).toBe('en');
    expect(manifest.locales).toEqual(['en', 'es']);
    expect(manifest.chapters).toEqual({
      en: [{ title: 'Dusk', file: 'chapters/en/01-dusk.md' }, { title: 'Night', file: 'chapters/en/02-night.md' }],
      es: [{ title: 'Anochecer', file: 'chapters/es/01-anochecer.md' }, { title: 'Noche', file: 'chapters/es/02-noche.md' }],
    });
    expect(manifest.localized).toEqual({
      es: {
        config: { headings: { levels: [{ level: 1, numberingTemplate: 'Capítulo {1}' }] }, layout: {} },
        resources: [
          { id: 'fig-map', caption: 'Un mapa.', file: 'resources/es/fig-map.svg', width: 200, height: 100 },
          { id: 'tbl', caption: 'Horas de luz.', table: { model: { rows: [[{ content: 'Anochecer' }, { content: '19:40' }]] } } },
        ],
      },
    });
    expect(isBundleManifest(JSON.parse(new TextDecoder().decode(files['preset.json'])))).toBe(true);
    expect(Object.keys(files).sort()).toEqual([
      'chapters/en/01-dusk.md', 'chapters/en/02-night.md', 'chapters/es/01-anochecer.md', 'chapters/es/02-noche.md',
      'fonts/houseserif-regular.ttf', 'preset.json', 'resources/es/fig-map.svg', 'resources/fig-map.svg',
    ]);

    const es = await openBundle(bytes, { locale: 'es' });
    expect(es.locale).toBe('es');
    expect(es.locales).toEqual(['en', 'es']);
    expect(es.chapters.map((c) => c.title)).toEqual(['Anochecer', 'Noche']);
    expect(es.config.headings?.levels?.[0]?.numberingTemplate).toBe('Capítulo {1}');
    expect(es.config.layout).toEqual({});
    const esMap = es.resources.find((r) => r.id === 'fig-map')!;
    expect(esMap.caption).toBe('Un mapa.');
    expect(new TextDecoder().decode(es.files.get(esMap.svg!.fileId))).toBe(SVG_ES);
    expect(es.resources.find((r) => r.id === 'tbl')!.caption).toBe('Horas de luz.');
    const docs = buildBundle(es);
    expect(docs.map((d) => d.blocks.find((b) => b.type === 'heading')?.numberPrefix?.trim())).toEqual(['Capítulo 1', 'Capítulo 2']);

    const en = await openBundle(bytes);
    expect(en.locale).toBe('en');
    expect(en.chapters.map((c) => c.title)).toEqual(['Dusk', 'Night']);
    expect(en.config.layout).toEqual({ layoutType: 'single' });
    const enMap = en.resources.find((r) => r.id === 'fig-map')!;
    expect(enMap.caption).toBe('A map.');
    expect(new TextDecoder().decode(en.files.get(enMap.svg!.fileId))).toBe(SVG);
  });

  it('shares the chapters when only the wording is localized', async () => {
    const { manifest, bytes } = await createBundle({
      name: 'Shared',
      locale: 'en',
      markdown: '# One\n\n::resource{id=fig-map}',
      resources: [svgResource],
      files: { 'map-upload': SVG },
      localized: { es: { resources: [{ id: 'fig-map', caption: 'Un mapa.' }] }, fr: { resources: [{ id: 'fig-map', caption: 'Une carte.' }] } },
    });
    expect(manifest.chapters).toEqual([{ title: 'One', file: 'chapters/01-one.md' }]);
    expect(manifest.locales).toEqual(['en', 'es', 'fr']);
    expect(manifest.localized).toEqual({ es: { resources: [{ id: 'fig-map', caption: 'Un mapa.' }] }, fr: { resources: [{ id: 'fig-map', caption: 'Une carte.' }] } });
    const fr = await openBundle(bytes, { locale: 'fr' });
    expect(fr.locale).toBe('fr');
    expect(fr.chapters.map((c) => c.markdown)).toEqual(['# One\n\n::resource{id=fig-map}']);
    expect(fr.resources[0]!.caption).toBe('Une carte.');
    const es = await openBundle(bytes, { locale: 'es-MX' });
    expect(es.locale).toBe('es');
    expect(es.resources[0]!.caption).toBe('Un mapa.');
    // The primary locale, and one the bundle does not carry, keep the
    // shared wording — and say so.
    const en = await openBundle(bytes);
    expect(en.locale).toBe('en');
    expect(en.resources[0]!.caption).toBe('A map.');
    const de = await openBundle(bytes, { locale: 'de' });
    expect(de.locale).toBe('en');
    expect(de.resources[0]!.caption).toBe('A map.');
  });

  it('never gives the primary locale the wording of a regional variant', async () => {
    // Shared chapters: pt-PT is the primary, pt-BR only rewords.
    const shared = await createBundle({
      name: 'Variants',
      locale: 'pt-PT',
      markdown: '# Um\n\n::resource{id=fig-map}',
      resources: [{ ...svgResource, caption: 'Um mapa.' }],
      files: { 'map-upload': SVG },
      localized: { 'pt-BR': { resources: [{ id: 'fig-map', caption: 'Um mapa (BR).' }] } },
    });
    const read = async (locale?: string) => {
      const b = await openBundle(shared.bytes, locale ? { locale } : {});
      return `${b.locale}:${b.resources[0]!.caption}`;
    };
    expect(await read()).toBe('pt-PT:Um mapa.');
    expect(await read('pt-PT')).toBe('pt-PT:Um mapa.');
    expect(await read('pt')).toBe('pt-PT:Um mapa.');
    expect(await read('pt-BR')).toBe('pt-BR:Um mapa (BR).');

    // Chapter map: en is the primary, en-GB brings chapters, a config key
    // and wording of its own. Reading en (or en-US) must not mix the en
    // chapters with the en-GB overrides.
    const mapped = await createBundle({
      name: 'Colours',
      locale: 'en',
      chapters: [{ markdown: '# Color\n\n::resource{id=fig-map}' }],
      config: { layout: { layoutType: 'single' } },
      resources: [svgResource],
      files: { 'map-upload': SVG },
      localized: {
        'en-GB': {
          chapters: [{ markdown: '# Colour\n\n::resource{id=fig-map}' }],
          config: { layout: {} },
          resources: [{ id: 'fig-map', caption: 'A map (GB).' }],
        },
      },
    });
    for (const locale of ['en', 'en-US']) {
      const b = await openBundle(mapped.bytes, { locale });
      expect(b.locale).toBe('en');
      expect(b.chapters.map((c) => c.title)).toEqual(['Color']);
      expect(b.config.layout).toEqual({ layoutType: 'single' });
      expect(b.resources[0]!.caption).toBe('A map.');
    }
    const gb = await openBundle(mapped.bytes, { locale: 'en-GB' });
    expect(gb.locale).toBe('en-GB');
    expect(gb.chapters.map((c) => c.title)).toEqual(['Colour']);
    expect(gb.config.layout).toEqual({});
    expect(gb.resources[0]!.caption).toBe('A map (GB).');
  });

  it('keeps a locale on the shared artwork when its own picture is missing', async () => {
    const { manifest, warnings } = await createBundle({
      name: 'Missing',
      locale: 'en',
      markdown: '# One',
      resources: [svgResource],
      files: { 'map-upload': SVG },
      localized: { es: { resources: [{ id: 'fig-map', caption: 'Un mapa.', svg: { fileId: 'gone' } }] } },
    });
    expect(warnings).toEqual(['fig-map: missing es file, the shared one is used']);
    expect(manifest.localized).toEqual({ es: { resources: [{ id: 'fig-map', caption: 'Un mapa.' }] } });
  });

  it('needs the primary locale to write a bilingual bundle', async () => {
    await expect(createBundle({ name: 'x', markdown: '# X', localized: { es: {} } })).rejects.toThrow(/locale/);
    await expect(createBundle({ name: 'x', locale: 'es', markdown: '# X', localized: { es: {} } })).rejects.toThrow(/locale/);
  });
});

describe('locale resolution', () => {
  const chapters = [{ title: 'One', file: 'one.md' }];
  const manifestOf = (locale: string, localized: Record<string, object>, map = false): BundleManifestV2 => ({
    version: 2,
    id: 'b',
    name: 'B',
    locale,
    chapters: map ? Object.fromEntries([locale, ...Object.keys(localized)].map((l) => [l, chapters])) : chapters,
    localized,
  });

  it('rewords the primary locale only with an entry naming it exactly', () => {
    const own = { config: {} };
    const bare = { config: {} };
    const br = { config: {} };
    for (const map of [false, true]) {
      expect(pickLocaleOverrides(manifestOf('pt-PT', { 'pt-BR': br }, map), 'pt-PT')).toBeNull();
      expect(pickLocaleOverrides(manifestOf('pt-PT', { pt: bare, 'pt-BR': br }, map), 'pt-PT')).toBeNull();
      expect(pickLocaleOverrides(manifestOf('pt-PT', { 'pt-PT': own, 'pt-BR': br }, map), 'pt-PT')).toBe(own);
      expect(pickLocaleOverrides(manifestOf('pt-PT', { pt: bare, 'pt-BR': br }, map), 'pt-BR')).toBe(br);
    }
    // Another language takes its bare base entry, else a regional variant,
    // before the wording of the primary.
    const shared = manifestOf('en', { pt: bare, 'pt-BR': br });
    expect(pickLocaleOverrides({ ...shared, chapters: { en: chapters, 'pt-AO': chapters } }, 'pt-AO')).toBe(bare);
    const gb = { config: {} };
    const mapped: BundleManifestV2 = { ...manifestOf('es', { 'en-GB': gb }), chapters: { es: chapters, en: chapters } };
    expect(resolveBundleLocale(mapped, 'en-US')).toBe('en');
    expect(pickLocaleOverrides(mapped, 'en-US')).toBe(gb);
    expect(pickLocaleOverrides(mapped, 'es')).toBeNull();
  });

  it('reports the locale whose wording shared chapters are read with', () => {
    const m = manifestOf('en', { es: {}, 'pt-BR': {} });
    expect(resolveBundleLocale(m, 'es-AR')).toBe('es');
    expect(resolveBundleLocale(m, 'PT-br')).toBe('pt-BR');
    expect(resolveBundleLocale(m, 'de')).toBe('en');
    // A single-language bundle keeps its own locale.
    expect(resolveBundleLocale({ ...m, localized: undefined }, 'es')).toBe('en');
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

  it('names an untitled chapter after its heading, with line breaks read as spaces', async () => {
    const manifest = { version: 2, id: 'b', name: 'B', chapters: [{ title: '', file: 'a.md' }] };
    const md = '# Tortilla \\\\ de *patatas* {#t}\n\nText.';
    const bundle = await openBundle(zipSync({ 'preset.json': enc.encode(JSON.stringify(manifest)), 'a.md': enc.encode(md) }));
    expect(bundle.chapters[0]!.title).toBe('Tortilla de patatas');
  });

  it('picks the locale of a bilingual bundle and its overrides', async () => {
    const manifest = {
      version: 2, id: 'bi', name: 'Bi', locale: 'en',
      chapters: { en: [{ title: 'One', file: 'en.md' }], es: [{ title: 'Uno', file: 'es.md' }] },
      resources: [{ id: 't', typeId: 'table', kind: 'table', caption: 'Table', table: { model: { rows: [[{ content: 'x' }]] } } }],
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

  it('hands the fallback the characters of the face and passes several files through', async () => {
    const bundle = await openBundle((await sample()).bytes);
    const heard: Array<ReadonlySet<number> | undefined> = [];
    const slices = [new Uint8Array([1]), new Uint8Array([2])];
    const provider = bundleFontProvider(bundle, {
      fallback: async (_family, _weight, _style, request) => {
        heard.push(request?.codePoints);
        return slices;
      },
    });
    const codePoints = new Set([...'紅樓夢'].map((ch) => ch.codePointAt(0)!));
    expect(await provider('Noto Serif TC', 400, 'normal', { codePoints })).toEqual(slices);
    expect(heard).toEqual([codePoints]);
    // The bundle's own faces ignore the request.
    expect(await provider('House Serif', 700, 'italic', { codePoints })).toEqual(FONT);
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

  it('carries the book metadata — the first chapter\'s front matter — to every chapter', () => {
    const docs = buildBundle({
      config: withHeader('{title}|{author}'),
      resources: [],
      chapters: [
        { markdown: `---\ntitle: The Lantern\nauthor: A. Author\n---\n# Dusk\n\n${filler(6)}` },
        { markdown: `# Night\n\n${filler(6)}` },
        // A later chapter's front matter is not the book's: ignored, as in
        // the Sandbox.
        { markdown: `---\ntitle: Elsewhere\n---\n# Dawn\n\n${filler(2)}` },
      ],
    });
    expect(docs).toHaveLength(3);
    for (const doc of docs) {
      expect(doc.metadata.title).toBe('The Lantern');
      expect(doc.pages.map(headerText)).toEqual(doc.pages.map(() => 'The Lantern|A. Author'));
    }
  });

  it('blanks a later chapter\'s front matter without parsing it, as the Sandbox does', () => {
    // YAML that gray-matter rejects: the block is not the book's, so it is
    // blanked by its `---` lines and never read.
    const later = '---\ntitle: [unclosed\n---\n# Night\n\nText.';
    const docs = buildBundle({
      config: withHeader('{title}'),
      resources: [],
      chapters: [{ markdown: '---\ntitle: The Lantern\n---\n# Dusk\n\nText.' }, { markdown: later }],
    });
    expect(docs).toHaveLength(2);
    expect(headerText(docs[1]!.pages.at(-1)!)).toBe('The Lantern');
    const heading = docs[1]!.blocks.find((b) => b.type === 'heading')!;
    expect(heading.lines[0]!.text).toContain('Night');
    // Offsets still point into the chapter's own text.
    expect(later.slice(heading.sourceStart, heading.sourceEnd)).toContain('Night');
  });

  it('takes book metadata from the options, under the first chapter\'s front matter', () => {
    const docs = buildBundle(
      {
        config: withHeader('{title}|{subtitle}'),
        resources: [],
        chapters: [{ markdown: '---\ntitle: The Lantern\n---\n# Dusk\n\nText.' }, { markdown: '# Night\n\nText.' }],
      },
      { metadata: { title: 'Overridden', subtitle: 'A Tale' } },
    );
    expect(docs.map((d) => headerText(d.pages[0]!))).toEqual(['The Lantern|A Tale', 'The Lantern|A Tale']);
  });

  it('counts the whole book in {bookTotalPages} and the chapter in {totalPages}', () => {
    const docs = buildBundle({
      config: withHeader('{pageNumber}|{totalPages}|{bookTotalPages}'),
      resources: [],
      chapters: [{ markdown: `# Dusk\n\n${filler(80)}` }, { markdown: `# Night\n\n${filler(40)}` }, { markdown: `# Dawn\n\n${filler(60)}` }],
    });
    const total = docs.reduce((n, d) => n + d.pages.length, 0);
    expect(docs.every((d) => d.pages.length > 1)).toBe(true);
    for (const doc of docs) {
      expect(doc.bookPageCount).toBe(total);
      for (const page of doc.pages) {
        if (!page.header) continue;
        expect(headerText(page)).toBe(`${page.pageLabel}|${doc.pages.length}|${total}`);
      }
    }
    // A document laid out on its own counts its own pages, continued ones
    // the pages before them too, unless the host names the book's total.
    const alone = buildDocument({ markdown: `# Dusk\n\n${filler(80)}` }, withHeader('{bookTotalPages}'));
    expect(headerText(alone.pages[0]!)).toBe(String(alone.pages.length));
    const later = buildDocument({ markdown: `# Night\n\n${filler(40)}`, continuation: { pageIndexOffset: 5 } }, withHeader('{bookTotalPages}'));
    expect(headerText(later.pages[0]!)).toBe(String(5 + later.pages.length));
    const told = buildDocument({ markdown: `# Night\n\n${filler(40)}`, continuation: { pageIndexOffset: 5, bookPageCount: 40 } }, withHeader('{bookTotalPages}'));
    expect(headerText(told.pages[0]!)).toBe('40');
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

  it('labels a part row with the next chapter\'s first page when the part closes its chapter without a page', () => {
    // `parts.page: false`: the fence closing chapter 2 reaches no page of
    // it; the part starts with chapter 3 (after an empty chapter), where its
    // running heads switch.
    const docs = buildBundle({
      config: { ...config, parts: { page: false } },
      resources: [],
      chapters: [
        { markdown: ':::toc\n:::\n' },
        { markdown: '# Dusk\n\nText.\n\n:::part{number="I" title="Mud"}\n:::' },
        { markdown: '' },
        { markdown: '# Night\n\nText.' },
      ],
    });
    const night = docs[3]!.blocks.find((b) => b.type === 'heading')!;
    const nightPage = docs[3]!.pages[night.pageIndex]!;
    const row = docs[0]!.blocks.find((b) => b.tocPart)!;
    expect(row.tocPart).toMatchObject({ number: 'I', title: 'Mud', pageLabel: nightPage.pageLabel, pageIndex: (docs[3]!.pageIndexOffset ?? 0) + night.pageIndex });
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

// EF-05: up to postext 1.4 any `headings` object turned the H1 page break
// off, and stripping the defaults dropped an H1 `enabled: false`, so the
// bundles 1.4 wrote carry `headings` with no H1 break — laid out with none.
// The engine now keeps H1's `always-odd`; a manifest written before the
// `configVersion` stamp is read with the breaks it laid out then.
describe('bundles written by postext 1.4 or earlier', () => {
  // docs/examples/open-bundle/lantern.postext as postext 1.4 wrote it (its
  // config and chapters; fonts and pictures left out).
  const lantern14 = {
    version: 2,
    id: 'the-lantern',
    name: 'The Lantern',
    locale: 'en',
    chapters: [{ title: 'Dusk', file: 'chapters/01-dusk.md' }, { title: 'Night', file: 'chapters/02-night.md' }],
    config: {
      bodyText: { fontSize: { value: 10.5, unit: 'pt' } },
      headings: { fontFamily: 'EB Garamond', levels: [{ level: 1, numberingTemplate: 'Chapter {1}' }] },
    },
  };
  const para = 'The lantern hung from a nail by the door, and every evening someone lit it. Nobody remembered who had put the nail there.';
  const chapterFiles = {
    'chapters/01-dusk.md': enc.encode(`# Dusk\n\n${para}\n\n${para}\n`),
    'chapters/02-night.md': enc.encode(`# Night\n\n${para}\n\n${para}\n`),
  };
  const zipManifest = (manifest: object) => zipSync({ 'preset.json': enc.encode(JSON.stringify(manifest)), ...chapterFiles });
  const h1Break = (c: PostextConfig) => resolveHeadingsConfig(c.headings).levels.find((l) => l.level === 1)!.breakBefore;
  const pageCounts = (docs: { pages: unknown[] }[]) => docs.map((d) => d.pages.length);

  it('stamps every manifest it writes with the configuration rules', async () => {
    const { manifest } = await sample();
    expect(CONFIG_VERSION).toBe(8);
    expect(manifest.configVersion).toBe(CONFIG_VERSION);
  });

  it('reads a 1.4 bundle with the H1 break it laid out, and lays it out as 1.4 did', async () => {
    const old = await openBundle(zipManifest(lantern14));
    expect(old.config.headings?.levels?.[0]).toEqual({ level: 1, numberingTemplate: 'Chapter {1}', breakBefore: { enabled: false } });
    expect(h1Break(old.config)).toMatchObject({ enabled: false });
    // 1.4's layout: the chapters run on, no recto break, no blank verso.
    const asIn14 = buildBundle({
      ...old,
      config: { ...old.config, headings: { fontFamily: 'EB Garamond', levels: [{ level: 1, numberingTemplate: 'Chapter {1}', breakBefore: { enabled: false } }] } },
    });
    const docs = buildBundle(old);
    expect(pageCounts(docs)).toEqual(pageCounts(asIn14));
    expect(docs[1]!.pageIndexOffset).toBe(docs[0]!.pages.length);
    expect(docs[1]!.blocks.find((b) => b.type === 'heading')!.pageIndex).toBe(0);
    // The same manifest stamped for today's rules keeps H1's always-odd;
    // so does one stamped 3 (a 1.5 prerelease, heading rules already
    // today's). The lantern sets no maths: its config gains no maths size.
    const v3 = await openBundle(zipManifest({ ...lantern14, configVersion: 3 }));
    // (a version-8 pin keeps its split under a heading as it was)
    expect(v3.config.headings).toEqual({ ...lantern14.config.headings, keepWithNextSplit: 'fill' });
    expect(v3.config.math).toBeUndefined();
    const today = await openBundle(zipManifest({ ...lantern14, configVersion: CONFIG_VERSION }));
    expect(today.config.headings).toEqual(lantern14.config.headings);
    expect(h1Break(today.config)).toEqual({ enabled: true, parity: 'always-odd' });
    const todayDocs = buildBundle(today);
    const pages = (list: { pages: unknown[] }[]) => list.reduce((n, d) => n + d.pages.length, 0);
    expect(pages(todayDocs)).toBeGreaterThan(pages(docs));
  });

  it('pins a locale\'s own configuration and heading-style breaks too', async () => {
    const manifest = {
      ...lantern14,
      config: { ...lantern14.config, headingStyles: [{ id: 'part', breakBefore: { enabled: true } }] },
      localized: { es: { config: { headings: { levels: [{ level: 1, numberingTemplate: 'Capítulo {1}' }] } } } },
    };
    const es = await openBundle(zipManifest(manifest), { locale: 'es' });
    expect(es.config.headings?.levels?.[0]).toEqual({ level: 1, numberingTemplate: 'Capítulo {1}', breakBefore: { enabled: false } });
    expect(es.config.headingStyles?.[0]?.breakBefore).toEqual({ enabled: true, parity: 'any' });
  });

  it('writes a bundle that reads back as written: nothing is pinned', async () => {
    const { bytes } = await createBundle({ name: 'Now', chapters: [{ markdown: '# One\n\nText.' }], config: { headings: { fontFamily: 'Georgia' } } });
    const bundle = await openBundle(bytes);
    expect(bundle.config.headings).toEqual({ fontFamily: 'Georgia' });
    expect(h1Break(bundle.config)).toEqual({ enabled: true, parity: 'always-odd' });
  });

  it('migrates a configuration by its version, and leaves one that needs nothing as it is', () => {
    // (No maths in the content: only the heading rules are at stake here;
    // the maths size has tests of its own in mathSizeMigration.test.ts.)
    const prose = { content: 'Prose.' };
    const old: PostextConfig = { headings: { levels: [{ level: 1, breakBefore: { parity: 'odd' } }] } };
    expect(migrateConfig(old, CONFIG_VERSION)).toBe(old);
    expect(migrateConfig(old, 99)).toBe(old);
    expect(migrateConfig(old, 3, prose)).toBe(old);
    expect(migrateConfig(old, undefined, prose).headings?.levels?.[0]?.breakBefore).toEqual({ parity: 'odd', enabled: false });
    expect(migrateConfig(old, '3', prose).headings?.levels?.[0]?.breakBefore).toEqual({ parity: 'odd', enabled: false });
    const plain: PostextConfig = { bodyText: { fontFamily: 'Georgia' } };
    expect(migrateConfig(plain, undefined, prose)).toBe(plain);
    const full: PostextConfig = { headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'odd' } }] } };
    expect(migrateConfig(full, undefined, prose)).toBe(full);
  });
});
