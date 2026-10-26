import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PdfFontAnswer, PdfFontFile } from 'postext-pdf';

// #770: the PDF sets a character two files of a face hold in the file the
// previews took it from, the one declared last among those whose
// `unicode-range` holds it. The provider hands each file of a cut marked
// with its range and its place in the order the loader declares the cut
// (`PdfFontFile`: two properties on the bytes), still listed with the one
// declared last first, which is the order a document that keeps the
// host's language reads them in.

/** A cut as the loader declares a Japanese family: `latin` first, then the
 *  numbered slices, which answer for the letters and the `_` they repeat. */
const CUT = [
  { family: 'Noto Serif JP', weight: '400', style: 'normal', unicodeRange: 'U+0000-00FF,U+2000-206F', url: 'https://fonts.test/latin.woff2' },
  { family: 'Noto Serif JP', weight: '400', style: 'normal', unicodeRange: 'U+20,U+3001-3002,U+3041-3093', url: 'https://fonts.test/119.woff2' },
  { family: 'Noto Serif JP', weight: '400', style: 'normal', unicodeRange: 'U+41-5A,U+61-7A', url: 'https://fonts.test/118.woff2' },
  { family: 'Noto Serif JP', weight: '400', style: 'normal', unicodeRange: 'U+5F', url: 'https://fonts.test/113.woff2' },
];
const holds = (range: string, cp: number): boolean => range.split(',').some((part) => {
  const [lo, hi = lo] = part.slice(2).split('-');
  return cp >= parseInt(lo!, 16) && cp <= parseInt(hi!, 16);
});

vi.mock('../../controls/fonts/fontLoader.js', () => ({
  getCustomFontFamily: () => undefined,
  fontFamilyWeights: async () => [400],
  isUncataloguedFontFamily: () => false,
  staticFaceFiles: async () => CUT,
  fontsourcePackageVersion: () => null,
  // The loader's rule: for each character, the last face declared whose
  // range holds it; the faces picked, in the order of the cut.
  facesForCodePoints: (faces: typeof CUT, codePoints?: Iterable<number>) => {
    const picked = new Set<number>();
    for (const cp of codePoints ?? []) {
      for (let i = faces.length - 1; i >= 0; i--) {
        if (holds(faces[i]!.unicodeRange, cp)) {
          picked.add(i);
          break;
        }
      }
    }
    return faces.filter((_, i) => picked.has(i));
  },
}));
vi.mock('../../storage/fontStorage.js', () => ({ getFontFile: async () => null }));
vi.mock('postext-pdf', () => ({ decompressWoff2: async (bytes: Uint8Array) => bytes }));

const cps = (text: string) => new Set([...text].map((ch) => ch.codePointAt(0)!));
const filesOf = (answer: PdfFontAnswer): PdfFontFile[] => (Array.isArray(answer) ? answer : [answer]);
const name = (file: Uint8Array): string => new TextDecoder().decode(file);

describe('createPdfFontProvider: the files of a cut the loader declares (#770)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', async (url: string) => new Response(new TextEncoder().encode(url.slice(url.lastIndexOf('/') + 1))));
  });

  it('hands each file with its range and its place in the cut, the one declared last first', async () => {
    const { createPdfFontProvider } = await import('./pdfFontProvider.js');
    const files = filesOf(await createPdfFontProvider()('Noto Serif JP', 400, 'normal', { codePoints: cps('Shift_JIS \u00E9') }));
    // The letters are slice 118's and the `_` slice 113's, declared after
    // `latin`, which keeps the e acute it alone holds; the space is slice 119's.
    expect(files.map((file) => [name(file), file.order, file.unicodeRange])).toEqual([
      ['113.woff2', 3, 'U+5F'],
      ['118.woff2', 2, 'U+41-5A,U+61-7A'],
      ['119.woff2', 1, 'U+20,U+3001-3002,U+3041-3093'],
      ['latin.woff2', 0, 'U+0000-00FF,U+2000-206F'],
    ]);
    expect(files.every((file) => file instanceof Uint8Array)).toBe(true);
  });

  it('keeps a file\u2019s place whatever files an answer leaves out', async () => {
    const { createPdfFontProvider } = await import('./pdfFontProvider.js');
    const files = filesOf(await createPdfFontProvider()('Noto Serif JP', 400, 'normal', { codePoints: cps('_\u00E9') }));
    expect(files.map((file) => [name(file), file.order])).toEqual([['113.woff2', 3], ['latin.woff2', 0]]);
  });

  it('answers an SVG picture with the bytes as they are', async () => {
    const { createPdfFontProvider } = await import('./pdfFontProvider.js');
    const files = filesOf(await createPdfFontProvider({ raw: true })('Noto Serif JP', 400, 'normal', { codePoints: cps('S_') }));
    expect(files.map((file) => [name(file), file.order, file.unicodeRange])).toEqual([['113.woff2', undefined, undefined], ['118.woff2', undefined, undefined]]);
  });
});
