// A bundle that leaves a licensed family's files out names an open family
// of about the same width for it (#978).
import { describe, it, expect } from 'vitest';
import { zipSync } from 'fflate';
import { bundleFontProvider, createBundle, isBundleManifest, openBundle } from '../../bundle/index.js';
import type { BundleManifestV2 } from '../../bundle/index.js';
import { exportStandInOf, fontFallbackFamilies, fontFallbackOf, hasOwnStyle } from '../../fonts/fallback.js';
import type { PostextConfig } from '../../types.js';

const enc = new TextEncoder();
const OPEN = new Uint8Array([0, 1, 0, 0, 9, 9]);
const LICENSED = new Uint8Array([0, 1, 0, 0, 1, 2]);

const config: PostextConfig = {
  bodyText: { fontFamily: 'Frutiger Serif' },
  customFonts: [
    {
      name: 'Frutiger Serif',
      redistributable: false,
      fallback: 'Source Serif 4',
      variants: [{ weight: 400, style: 'normal', fileId: 'lic-1', format: 'otf', fileName: 'Frutiger-Regular.otf' }],
    },
  ],
};

async function packed() {
  return createBundle({
    name: 'Licensed',
    locale: 'en',
    chapters: [{ title: 'One', markdown: '# One\n\nText.\n' }],
    config,
    files: { 'lic-1': LICENSED },
  });
}

describe('font fallback in a bundle (#978)', () => {
  it('writes a family it may not hand on as a name with its fallback and no files', async () => {
    const { manifest, files, warnings } = await packed();
    expect(manifest.fonts).toEqual([{ name: 'Frutiger Serif', variants: [], redistributable: false, fallback: 'Source Serif 4' }]);
    expect(Object.keys(files).some((f) => f.startsWith('fonts/'))).toBe(false);
    expect(warnings).toEqual(['Frutiger Serif: font files left out of the export (the family is not redistributable); the bundle names Source Serif 4 to set it in']);
    expect(isBundleManifest(manifest)).toBe(true);
  });

  it('writes an exportable family with its fallback beside its files', async () => {
    const { manifest } = await createBundle({
      name: 'Open',
      markdown: '# Open',
      config: { customFonts: [{ name: 'Wide Face', fallback: 'Noto Serif', variants: [{ weight: 400, style: 'normal', fileId: 'f1', format: 'ttf', fileName: 'wide.ttf' }] }] },
      files: { f1: OPEN },
    });
    expect(manifest.fonts).toEqual([{ name: 'Wide Face', variants: [{ weight: 400, style: 'normal', file: 'fonts/wide.ttf' }], fallback: 'Noto Serif' }]);
  });

  it('opens it with the family kept, no file warnings and one note', async () => {
    const { bytes } = await packed();
    const bundle = await openBundle(bytes);
    expect(bundle.config.customFonts).toEqual([{ name: 'Frutiger Serif', variants: [], redistributable: false, fallback: 'Source Serif 4' }]);
    expect(bundle.config.bodyText?.fontFamily).toBe('Frutiger Serif');
    expect(bundle.fonts).toEqual([]);
    expect(bundle.warnings).toEqual(['Frutiger Serif: none of its font files are in the bundle, those faces are set in Source Serif 4']);
  });

  it('names the fallback once for the files a pack left out of a family that names one', async () => {
    const { files } = await createBundle({
      name: 'Partial',
      markdown: '# Partial',
      config: { customFonts: [{ name: 'Wide Face', fallback: 'Noto Serif', variants: [{ weight: 400, style: 'normal', fileId: 'f1', format: 'ttf', fileName: 'wide.ttf' }, { weight: 700, style: 'normal', fileId: 'f2', format: 'ttf', fileName: 'wide-bold.ttf' }] }] },
      files: { f1: OPEN, f2: OPEN },
    });
    const manifest = JSON.parse(new TextDecoder().decode(files['preset.json'])) as BundleManifestV2;
    const pack: Record<string, Uint8Array> = { ...files, 'preset.json': enc.encode(JSON.stringify(manifest)) };
    delete pack['fonts/wide-bold.ttf'];
    const bundle = await openBundle(zipSync(pack));
    expect(bundle.config.customFonts?.[0]).toMatchObject({ name: 'Wide Face', fallback: 'Noto Serif' });
    expect(bundle.config.customFonts?.[0]?.variants.map((v) => v.weight)).toEqual([400]);
    expect(bundle.warnings).toEqual(['Wide Face: some of its font files are not in the bundle, those faces are set in Noto Serif']);
  });

  it('still drops a family with no fallback and no files, as before (#904)', async () => {
    const { files } = await createBundle({ name: 'Plain', markdown: '# P', config: { customFonts: [{ name: 'Gone', variants: [{ weight: 400, style: 'normal', fileId: 'f1', format: 'ttf', fileName: 'gone.ttf' }] }] }, files: { f1: OPEN } });
    const pack: Record<string, Uint8Array> = { ...files };
    delete pack['fonts/gone.ttf'];
    const bundle = await openBundle(zipSync(pack));
    expect(bundle.config.customFonts).toBeUndefined();
    expect(bundle.warnings).toEqual([
      'Gone: font file "fonts/gone.ttf" is not in the bundle, the face is left out',
      'Gone: none of its font files are in the bundle, it is left out',
    ]);
  });

  it('rejects a manifest whose fallback is not a name', () => {
    const base = { version: 2, id: 'x', name: 'X', chapters: [{ title: 't', file: 'a.md' }] };
    expect(isBundleManifest({ ...base, fonts: [{ name: 'A', variants: [], fallback: 'B' }] })).toBe(true);
    expect(isBundleManifest({ ...base, fonts: [{ name: 'A', variants: [], fallback: 3 }] })).toBe(false);
    expect(isBundleManifest({ ...base, fonts: [{ name: 'A', variants: [], fallback: '' }] })).toBe(false);
  });

  it('ignores a fallback that is the family itself', () => {
    expect(fontFallbackOf([{ name: 'A', fallback: 'a' }], 'A')).toBeUndefined();
    expect(fontFallbackOf([{ name: 'A', fallback: 'B' }], '"A", serif'.replace(/"/g, ''))).toBe('B');
    expect(fontFallbackFamilies([{ name: 'A', fallback: 'B', variants: [] }, { name: 'C', variants: [] }])).toEqual([{ family: 'A', fallback: 'B', variants: [] }]);
    expect(hasOwnStyle([{ weight: 400, style: 'normal' }], 'normal')).toBe(true);
    expect(hasOwnStyle([{ weight: 400, style: 'normal' }], 'italic')).toBe(false);
  });

  it('takes the faces a family lacks from its fallback in the PDF font provider', async () => {
    const { bytes } = await createBundle({
      name: 'Mixed',
      markdown: '# M',
      config: {
        customFonts: [
          { name: 'Open Wide', variants: [{ weight: 400, style: 'normal', fileId: 'o1', format: 'ttf', fileName: 'open.ttf' }] },
          { name: 'Frutiger Serif', redistributable: false, fallback: 'Open Wide', variants: [] },
          { name: 'Licensed', redistributable: false, fallback: 'Source Serif 4', variants: [] },
        ],
      },
      files: { o1: OPEN },
    });
    const bundle = await openBundle(bytes);
    const asked: string[] = [];
    const provider = bundleFontProvider(bundle, {
      fallback: async (family, weight, style) => {
        asked.push(`${family} ${weight} ${style}`);
        return new Uint8Array([7]);
      },
    });
    // A fallback the bundle carries is read from it, whatever weight is asked.
    expect(await provider('Frutiger Serif', 700, 'italic')).toEqual(OPEN);
    // One it does not carry is asked of the host, by its own name.
    expect(await provider('Licensed', 400, 'normal')).toEqual(new Uint8Array([7]));
    expect(asked).toEqual(['Source Serif 4 400 normal']);
    // A family with no fallback is asked for as itself.
    expect(await provider('Other', 400, 'normal')).toEqual(new Uint8Array([7]));
    expect(asked[1]).toBe('Other 400 normal');
    // Its own files win where it has them.
    expect(await provider('Open Wide', 400, 'normal')).toEqual(OPEN);
  });
});

// #993: a file that leaves the app (an EPUB, an HTML export) sets a family it
// may not hand on in its fallback, under the family's name.
describe('exportStandInOf (#993)', () => {
  const list = [
    { name: 'Licensed', redistributable: false, fallback: 'Open One' },
    { name: 'Bare', redistributable: false },
    { name: 'Open', fallback: 'Open Two' },
    { name: 'Self', redistributable: false, fallback: 'self' },
  ];

  it('names the fallback of a family marked not redistributable, whatever the case and the stack', () => {
    expect(exportStandInOf(list, 'Licensed')).toBe('Open One');
    expect(exportStandInOf(list, 'licensed')).toBe('Open One');
    expect(exportStandInOf(list, '"Licensed", serif')).toBe('Open One');
  });

  it('names none for a family without a fallback, one that may be handed on, a stand-in for itself, or an unknown one', () => {
    expect(exportStandInOf(list, 'Bare')).toBeUndefined();
    expect(exportStandInOf(list, 'Open')).toBeUndefined();
    expect(exportStandInOf(list, 'Self')).toBeUndefined();
    expect(exportStandInOf(list, 'Nobody')).toBeUndefined();
    expect(exportStandInOf(undefined, 'Licensed')).toBeUndefined();
  });
});
