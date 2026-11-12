import { describe, it, expect } from 'vitest';
import type { PostextConfig } from '../../index.js';
import { extractDesign } from '../../index.js';
import { createBundle, createDesignBundle, openBundle, openBundleZip, openDesignBundle, isBundleManifest, zipBundle, CONFIG_VERSION } from '../../bundle/index.js';

const FONT = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 1, 2, 3, 4]);
const ICC = new Uint8Array([0, 0, 1, 2, 3, 4, 5, 6]);

const BOOK: PostextConfig = {
  locale: 'es',
  bodyText: { fontFamily: 'Lora' } as PostextConfig['bodyText'],
  layout: { columnCount: 2 } as PostextConfig['layout'],
  customFonts: [
    { name: 'Lora', variants: [{ weight: 400, style: 'normal', fileId: 'f1', format: 'woff2' }] },
    { name: 'Closed', redistributable: false, variants: [{ weight: 400, style: 'normal', fileId: 'f2', format: 'woff2' }] },
  ] as PostextConfig['customFonts'],
  print: { outputProfile: 'custom', customProfile: { name: 'Press', fileId: 'icc1' } } as PostextConfig['print'],
};

describe('design bundles', () => {
  it('writes a manifest with the design marker and no chapters', async () => {
    const design = extractDesign(BOOK, ['page', 'text', 'output']);
    const made = await createDesignBundle({
      name: 'Novel', locale: 'en', design,
      localized: { es: { name: 'Novela', description: 'Una columna' } },
      files: { f1: FONT, icc1: ICC },
      mtime: new Date(1980, 0, 1),
    });
    expect(made.manifest.design).toEqual({ parts: ['page', 'text', 'output'] });
    expect(made.manifest.chapters).toEqual([]);
    expect(made.manifest.configVersion).toBe(CONFIG_VERSION);
    expect(isBundleManifest(made.manifest)).toBe(true);
    expect(Object.keys(made.files).some((p) => p.startsWith('fonts/'))).toBe(true);
    expect(Object.keys(made.files).some((p) => p.startsWith('profiles/'))).toBe(true);
    expect(Object.keys(made.files).some((p) => p.startsWith('chapters/'))).toBe(false);

    const opened = await openDesignBundle(made.bytes, { locale: 'es' });
    expect(opened.fromBook).toBe(false);
    expect(opened.name).toBe('Novela');
    expect(opened.names.en?.name).toBe('Novel');
    expect(opened.design.parts).toEqual(['page', 'text', 'output']);
    expect(opened.design.config.layout?.columnCount).toBe(2);
    expect(opened.design.config.locale).toBeUndefined();
    expect(opened.design.config.resourceTypes).toBeUndefined();
    expect(opened.design.config.colorPalette).toBeUndefined();
    expect(opened.design.config.customFonts?.map((f) => f.name)).toEqual(['Lora']);
    const fontId = opened.design.config.customFonts![0]!.variants[0]!.fileId;
    expect(opened.files.get(fontId)).toEqual(FONT);
    const profileId = opened.design.config.print?.customProfile?.fileId;
    expect(profileId && opened.files.get(profileId)).toEqual(ICC);
    // A design bundle opens as a bundle too: no chapters.
    const asBundle = await openBundle(made.bytes);
    expect(asBundle.chapters).toEqual([]);
    expect(asBundle.design).toEqual({ parts: ['page', 'text', 'output'] });
  });

  it('leaves out a family marked not redistributable', async () => {
    const design = extractDesign({ ...BOOK, bodyText: { fontFamily: 'Closed' } as PostextConfig['bodyText'] }, ['text']);
    const made = await createDesignBundle({ name: 'Closed', design, files: { f2: FONT } });
    expect(Object.keys(made.files).some((p) => p.startsWith('fonts/'))).toBe(false);
    expect(made.warnings.length).toBeGreaterThan(0);
  });

  it('names the files with the scheme given', async () => {
    const made = await createDesignBundle({ name: 'N', design: extractDesign(BOOK, ['text']), files: { f1: FONT } });
    const opened = await openDesignBundle(made.bytes, { ids: { font: (f) => `d1:${f}`, blob: (f) => `d1:${f}` } });
    const id = opened.design.config.customFonts![0]!.variants[0]!.fileId;
    expect(id.startsWith('d1:fonts/')).toBe(true);
    expect(opened.files.has(id)).toBe(true);
  });

  it('reads a book as the design of its whole configuration', async () => {
    const made = await createBundle({ name: 'Book', locale: 'es', markdown: '# Uno\n\nTexto.', config: BOOK, files: { f1: FONT, icc1: ICC } });
    const opened = await openDesignBundle(made.bytes);
    expect(opened.fromBook).toBe(true);
    expect(opened.design.parts.length).toBeGreaterThan(10);
    expect(opened.design.config.layout?.columnCount).toBe(2);
    expect(opened.design.config.resourceTypes).toBeUndefined();
    await expect(openDesignBundle(made.bytes, { acceptBooks: false })).rejects.toThrow(/Not a design/);
  });

  it('refuses a design file over the size limit or carrying chapters', async () => {
    const made = await createDesignBundle({ name: 'N', design: extractDesign(BOOK, ['page']) });
    await expect(openDesignBundle(made.bytes, { maxBytes: 10 })).rejects.toThrow(/larger/);
    const files = { ...made.files, 'chapters/01.md': new TextEncoder().encode('# X') };
    await expect(openDesignBundle(zipBundle(files))).rejects.toThrow(/fonts and profiles only/);
    expect(openBundleZip(made.bytes).manifest).toBeTruthy();
  });

  it('refuses a design marker in createBundle with chapters', async () => {
    await expect(createBundle({ name: 'X', markdown: '# A', design: { parts: ['page'] } })).rejects.toThrow(/no chapters/);
  });
});
