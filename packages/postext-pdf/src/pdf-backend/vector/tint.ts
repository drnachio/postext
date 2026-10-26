// A picture painted in one colour (`VDTDesignImageBlock.tint`, #995).
//
// - An SVG drawing (the vector subset) is converted once, then recoloured:
//   every fill, stroke and text run takes the colour, keeping its opacity;
//   the copy is its own Form XObject, written once per colour and colour
//   space. A raster inside the SVG keeps its pixels.
// - A bitmap (or an SVG that went through the raster fallback) is painted
//   through a stencil: a 1-bit `ImageMask` of its alpha, cut at half
//   transparency and filled with the colour. A stencil is no transparency,
//   so it is valid in PDF/X-1a, and it takes the colour in whichever space
//   the render paints (RGB, grayscale, CMYK, an ICC print mode).

import type { PDFDocument, PDFImage } from 'pdf-lib';
import { decodeRgba, imageOf } from '../../print/images.js';
import type { VectorDrawing, VectorItem } from './svgVector.js';

/** A bitmap's alpha as a stencil: an `ImageMask` image XObject. */
export interface AlphaStencil {
  /** The stencil as an image the page can draw (`drawImage`). */
  image: PDFImage;
}

/** The stencil of a PNG or JPEG: a sample is painted (0) where the
 *  picture is at least half opaque. A JPEG has no alpha, so its stencil
 *  is the whole rectangle. Null when the bitmap does not decode. */
export async function alphaStencil(
  pdfDoc: PDFDocument,
  bytes: Uint8Array,
  format: 'png' | 'jpeg',
): Promise<AlphaStencil | null> {
  const px = await decodeRgba(bytes, format);
  if (!px || px.width <= 0 || px.height <= 0) return null;
  const rowBytes = Math.ceil(px.width / 8);
  const bits = new Uint8Array(rowBytes * px.height);
  // 1 leaves a sample unpainted: start with nothing painted.
  bits.fill(0xff);
  for (let y = 0; y < px.height; y++) {
    for (let x = 0; x < px.width; x++) {
      if (px.data[(y * px.width + x) * 4 + 3]! >= 128) bits[y * rowBytes + (x >> 3)]! &= ~(0x80 >> (x & 7));
    }
  }
  const context = pdfDoc.context;
  const ref = context.register(context.flateStream(bits, {
    Type: 'XObject',
    Subtype: 'Image',
    Width: px.width,
    Height: px.height,
    ImageMask: true,
    BitsPerComponent: 1,
  } as never));
  return { image: imageOf(pdfDoc, ref, px.width, px.height) };
}

const tinted = new WeakMap<VectorDrawing, Map<string, VectorDrawing>>();

function recolored(item: VectorItem, hex: string): VectorItem {
  if (item.kind === 'path') {
    return {
      ...item,
      fill: item.fill ? { ...item.fill, hex } : null,
      stroke: item.stroke ? { ...item.stroke, hex } : null,
    };
  }
  if (item.kind === 'text') {
    return { ...item, runs: item.runs.map((run) => ({ ...run, fill: { ...run.fill, hex } })) };
  }
  return item;
}

/** `drawing` with every paint set to `hex` (`#rrggbb`), opacities kept.
 *  The same object for the same drawing and colour, so the form it makes
 *  is written once. */
export function tintedDrawing(drawing: VectorDrawing, hex: string): VectorDrawing {
  const key = hex.toLowerCase();
  let byColor = tinted.get(drawing);
  if (!byColor) tinted.set(drawing, (byColor = new Map()));
  let out = byColor.get(key);
  if (!out) {
    out = { ...drawing, shapes: drawing.shapes.map((item) => recolored(item, key)) };
    byColor.set(key, out);
  }
  return out;
}
