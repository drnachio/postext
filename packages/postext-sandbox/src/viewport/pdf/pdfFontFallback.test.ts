import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PdfFontAnswer } from 'postext-pdf';

// #978: the PDF sets the faces a family has no file of in the fallback the
// bundle names for it, as the previews do.

const CUT = [{ family: 'Source Serif 4', weight: '400', style: 'normal', unicodeRange: 'U+0000-00FF', url: 'https://fonts.test/serif-latin.woff2' }];
const SHEET = [
  { family: 'Sheet Serif', weight: '400', style: 'normal', unicodeRange: 'U+0000-00FF', url: 'https://fonts.test/sheet-400.woff2' },
  { family: 'Sheet Serif', weight: '700', style: 'normal', unicodeRange: 'U+0000-00FF', url: 'https://fonts.test/sheet-700.woff2' },
];
const FAMILIES: Record<string, { name: string; variants: { weight: number; style: 'normal' | 'italic'; fileId: string; format: 'ttf' }[]; fallback?: string }> = {
  'Licensed Serif': { name: 'Licensed Serif', variants: [], fallback: 'Source Serif 4' },
  'Sheet Licensed': { name: 'Sheet Licensed', variants: [], fallback: 'Sheet Serif' },
  'Half Licensed': { name: 'Half Licensed', variants: [{ weight: 400, style: 'normal', fileId: 'own', format: 'ttf' }], fallback: 'Source Serif 4' },
};

vi.mock('../../controls/fonts/fontLoader.js', () => ({
  getCustomFontFamily: (name: string) => FAMILIES[name],
  fontFamilyWeights: async () => null,
  sheetFaceFiles: async (family: string, weight: number) => (family === 'Sheet Serif' ? SHEET.filter((f) => f.weight === String(weight >= 600 ? 700 : 400)) : null),
  isUncataloguedFontFamily: () => false,
  staticFaceFiles: async (family: string) => (family === 'Source Serif 4' ? CUT : null),
  fontsourcePackageVersion: () => null,
  facesForCodePoints: (faces: typeof CUT) => faces,
}));
vi.mock('../../storage/fontStorage.js', () => ({ getFontFile: async (id: string) => (id === 'own' ? { buffer: new TextEncoder().encode('own-file').buffer } : null) }));
vi.mock('postext-pdf', () => ({ decompressWoff2: async (bytes: Uint8Array) => bytes }));

const filesOf = (answer: PdfFontAnswer): Uint8Array[] => (Array.isArray(answer) ? answer : [answer]);
const name = (file: Uint8Array): string => new TextDecoder().decode(file);

describe('createPdfFontProvider: a family with a fallback (#978)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', async (url: string) => new Response(new TextEncoder().encode(url.slice(url.lastIndexOf('/') + 1))));
  });

  it('embeds the fallback\'s files for a family that has none', async () => {
    const { createPdfFontProvider } = await import('./pdfFontProvider.js');
    const provider = createPdfFontProvider();
    expect(filesOf(await provider('Licensed Serif', 400, 'normal')).map(name)).toEqual(['serif-latin.woff2']);
    expect(filesOf(await provider('Licensed Serif', 700, 'italic')).map(name)).toEqual(['serif-latin.woff2']);
  });

  // #993: a fallback only Google's style sheet serves (no static cuts, none
  // at Fontsource) gives the files the previews declare.
  it('embeds the style sheet\'s files for a fallback that has no static cut and is not at Fontsource', async () => {
    const { createPdfFontProvider } = await import('./pdfFontProvider.js');
    const provider = createPdfFontProvider();
    expect(filesOf(await provider('Sheet Licensed', 400, 'normal')).map(name)).toEqual(['sheet-400.woff2']);
    expect(filesOf(await provider('Sheet Licensed', 700, 'normal')).map(name)).toEqual(['sheet-700.woff2']);
  });

  it('keeps the family\'s own file for the slant it has, the fallback\'s for the one it lacks', async () => {
    const { createPdfFontProvider } = await import('./pdfFontProvider.js');
    const provider = createPdfFontProvider();
    expect(filesOf(await provider('Half Licensed', 700, 'normal')).map(name)).toEqual(['own-file']);
    expect(filesOf(await provider('Half Licensed', 400, 'italic')).map(name)).toEqual(['serif-latin.woff2']);
  });
});
