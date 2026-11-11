import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import type { Resource, VDTDocument } from 'postext';
import { preloadResourceImages } from '../pdf-backend/blocks/renderResourceBlock.js';
import type { PdfWarning } from '../pdf-backend/renderToPdf/warnings.js';

// #1484: a TIFF or Photoshop original that does not decode prints its
// preview, with a warning; without a preview it is a placeholder, still
// with the warning.

const fixtures = new URL('../../../postext/src/__tests__/raster/fixtures/', import.meta.url);
const png = new Uint8Array(fs.readFileSync(new URL('src.png', fixtures)));
const tiff = new Uint8Array(fs.readFileSync(new URL('rgb.tif', fixtures)));
// The header and directory of a real TIFF, its strips cut off.
const brokenTiff = tiff.slice(0, 40);

function vdt(): VDTDocument {
  return {
    config: { page: { dpi: 72 } },
    blocks: [{ bbox: { x: 0, y: 0, width: 100, height: 80 }, resourceBlock: { kind: 'bitmap', fileId: 'photo.png', resource: { id: 'photo', kind: 'bitmap', bitmap: { fileId: 'photo.png', printFileId: 'photo.tif' } } as Resource, bodyRect: { x: 0, y: 0, width: 100, height: 50 } } }],
    pages: [],
  } as unknown as VDTDocument;
}

async function preload(original: Uint8Array, preview?: Uint8Array) {
  const warnings: PdfWarning[] = [];
  const images = await preloadResourceImages(await PDFDocument.create(), vdt(), (id) => (id === 'photo.png' ? original : undefined),
    undefined, undefined, undefined, undefined, undefined, undefined,
    { previewBytes: (id) => (id === 'photo.png' ? preview : undefined), warn: (w) => warnings.push(w) });
  return { image: images.get('photo.png'), warnings };
}

describe('an original that does not decode', () => {
  it('prints from the original when it decodes, without a warning', async () => {
    const { image, warnings } = await preload(tiff, png);
    expect(image?.kind).toBe('image');
    expect(image?.kind === 'image' && image.image.width).toBe(20);
    expect(warnings).toEqual([]);
  });

  it('prints its preview, and says so', async () => {
    const { image, warnings } = await preload(brokenTiff, png);
    expect(image?.kind).toBe('image');
    expect(warnings.map((w) => w.kind)).toEqual(['pictureOriginalUnreadable']);
    expect((warnings[0] as { message: string }).message).toMatch(/preview was printed/);
  });

  it('is a placeholder without a preview, and says so', async () => {
    const { image, warnings } = await preload(brokenTiff);
    expect(image).toBeUndefined();
    expect((warnings[0] as { message: string }).message).toMatch(/placeholder/);
  });
});
