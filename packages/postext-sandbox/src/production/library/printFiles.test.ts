import { describe, expect, it } from 'vitest';
import { galleryPicturesFrom } from './coverGallery.js';
import { sniffPrintFile } from './printFiles.js';

const text = (s: string) => new TextEncoder().encode(s);

describe('print files', () => {
  it('are told apart by their first bytes', () => {
    expect(sniffPrintFile(new Uint8Array([0x49, 0x49, 0x2a, 0x00, 8, 0]))).toBe('tiff');
    expect(sniffPrintFile(new Uint8Array([0x4d, 0x4d, 0x00, 0x2a, 0, 8]))).toBe('tiff');
    // An Illustrator file saved PDF-compatible is a PDF.
    expect(sniffPrintFile(text('%PDF-1.6\n%âãÏÓ'))).toBe('pdf');
    expect(sniffPrintFile(text('%!PS-Adobe-3.0 EPSF-3.0\n'))).toBe('postscript');
    expect(sniffPrintFile(new Uint8Array([0xc5, 0xd0, 0xd3, 0xc6, 0, 0]))).toBe('postscript');
    expect(sniffPrintFile(text('hello'))).toBeUndefined();
  });

  it('that a browser cannot read are named, to say how to save them', async () => {
    const eps = new File([text('%!PS-Adobe-3.0 EPSF-3.0\n')], 'Banderola.eps');
    const junk = new File([text('hello')], 'notas.txt');
    const read = async (f: File) => (f.name.endsWith('.eps') ? 'postscript' as const : undefined);
    const pdf = new File([text('%PDF-1.6')], 'solapas.ai');
    const pages = await galleryPicturesFrom([pdf], async () => ({ width: 1, height: 1 }), async () => [1, 2].map((page) => ({ bytes: new Uint8Array(), mime: 'image/png' as const, page })));
    expect(pages.pictures.map((p) => p.name)).toEqual(['solapas · 1', 'solapas · 2']);
    const got = await galleryPicturesFrom([eps, junk], async () => ({ width: 1, height: 1 }), read);
    expect(got).toEqual({ pictures: [], unreadable: 1, postscript: ['Banderola.eps'] });
  });
});
