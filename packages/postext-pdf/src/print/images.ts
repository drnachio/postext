/**
 * Pictures in a colour-managed print render (#603): RGB bitmaps are
 * separated through the output profile into DeviceCMYK image XObjects.
 * PDF/X-1a, which has no transparency, gets each picture composed over the
 * paper; PDF/X-4 keeps its alpha as a DeviceGray soft mask. CMYK and
 * grayscale JPEGs pass through untouched (they are already print data).
 */

import { PDFDocument, PDFImage, PDFName, PDFRef, type PDFContext } from 'pdf-lib';
import UPNG from '@pdf-lib/upng';
import { buildRgbLut, outputTransform, sampleRgbLut, type RgbLut } from 'postext';
import type { PrintColorMode } from './colorMode';

/** Decoded pixels, 8-bit RGBA, rows top-down. */
export interface RgbaPixels {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}

/** Channels of a JPEG from its SOF marker (1 gray, 3 YCbCr/RGB, 4 CMYK). */
export function jpegComponents(bytes: Uint8Array): number | null {
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1]!;
    const len = (bytes[i + 2]! << 8) | bytes[i + 3]!;
    // SOF0–SOF15 except DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return bytes[i + 9]!;
    }
    i += 2 + len;
  }
  return null;
}

async function decodeWithCanvas(bytes: Uint8Array, type: string): Promise<RgbaPixels | null> {
  const g = globalThis as unknown as {
    createImageBitmap?: (b: Blob) => Promise<ImageBitmap>;
    OffscreenCanvas?: new (w: number, h: number) => { getContext(t: '2d'): { drawImage(i: ImageBitmap, x: number, y: number): void; getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray } } | null };
  };
  if (!g.createImageBitmap || !g.OffscreenCanvas) return null;
  try {
    const bitmap = await g.createImageBitmap(new Blob([bytes as BlobPart], { type }));
    const canvas = new g.OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0);
    const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    return { width: bitmap.width, height: bitmap.height, data };
  } catch {
    return null;
  }
}

/** Decode a PNG or JPEG to RGBA. */
export async function decodeRgba(bytes: Uint8Array, format: 'png' | 'jpeg'): Promise<RgbaPixels | null> {
  if (format === 'png') {
    try {
      const img = UPNG.decode(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
      const frames = UPNG.toRGBA8(img);
      const first = frames[0];
      if (!first) return null;
      return { width: img.width, height: img.height, data: new Uint8Array(first) };
    } catch {
      return decodeWithCanvas(bytes, 'image/png');
    }
  }
  const viaCanvas = await decodeWithCanvas(bytes, 'image/jpeg');
  if (viaCanvas) return viaCanvas;
  try {
    const jpeg = (await import('jpeg-js')) as unknown as {
      decode?: typeof import('jpeg-js').decode;
      default?: { decode: typeof import('jpeg-js').decode };
    };
    const decode = jpeg.decode ?? jpeg.default?.decode;
    if (!decode) return null;
    const out = decode(bytes, { useTArray: true, formatAsRGBA: true });
    return { width: out.width, height: out.height, data: out.data };
  } catch {
    return null;
  }
}

const lutCache = new WeakMap<PrintColorMode, RgbLut>();

/** The sRGB → CMYK pixel LUT of a mode: the profile's own black
 *  generation (no K-only neutrals, which suit flat colours, not tones). */
function pixelLut(mode: PrintColorMode): RgbLut {
  let lut = lutCache.get(mode);
  if (!lut) {
    const t = outputTransform(mode.profile, {
      intent: mode.config.renderingIntent,
      blackPointCompensation: mode.config.blackPointCompensation,
      preserveNeutrals: false,
    });
    lut = buildRgbLut(33, 4, (r, g, b) => {
      const k = t.fromRgb(r, g, b);
      return [k.c, k.m, k.y, k.k];
    });
    lutCache.set(mode, lut);
  }
  return lut;
}

/** Separate RGBA pixels into CMYK bytes (and an alpha plane when any pixel
 *  is translucent and the mode keeps transparency). */
export function separatePixels(px: RgbaPixels, mode: PrintColorMode): { cmyk: Uint8Array; alpha?: Uint8Array } {
  const lut = pixelLut(mode);
  const n = px.width * px.height;
  const cmyk = new Uint8Array(n * 4);
  const keepAlpha = !mode.flattenTransparency;
  let alpha: Uint8Array | undefined;
  const out = new Float32Array(4);
  // Flat areas repeat colours: remember the last few conversions.
  const memo = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    let r = px.data[i * 4]!;
    let g = px.data[i * 4 + 1]!;
    let b = px.data[i * 4 + 2]!;
    const a = px.data[i * 4 + 3]!;
    if (a < 255) {
      if (keepAlpha) {
        alpha ??= new Uint8Array(n).fill(255);
        alpha[i] = a;
      } else {
        // Over the paper.
        const f = a / 255;
        r = Math.round(r * f + 255 * (1 - f));
        g = Math.round(g * f + 255 * (1 - f));
        b = Math.round(b * f + 255 * (1 - f));
      }
    }
    const key = (r << 16) | (g << 8) | b;
    const hit = memo.get(key);
    if (hit !== undefined) {
      cmyk[i * 4] = hit >>> 24;
      cmyk[i * 4 + 1] = (hit >>> 16) & 255;
      cmyk[i * 4 + 2] = (hit >>> 8) & 255;
      cmyk[i * 4 + 3] = hit & 255;
      continue;
    }
    sampleRgbLut(lut, r, g, b, out);
    const c = Math.round(out[0]! * 255);
    const m = Math.round(out[1]! * 255);
    const y = Math.round(out[2]! * 255);
    const k = Math.round(out[3]! * 255);
    cmyk[i * 4] = c;
    cmyk[i * 4 + 1] = m;
    cmyk[i * 4 + 2] = y;
    cmyk[i * 4 + 3] = k;
    if (memo.size > 4096) memo.clear();
    memo.set(key, ((c << 24) | (m << 16) | (y << 8) | k) >>> 0);
  }
  return alpha ? { cmyk, alpha } : { cmyk };
}

/** A pdf-lib PDFImage over an image XObject already written to `ref`. */
function imageOf(pdfDoc: PDFDocument, ref: PDFRef, width: number, height: number): PDFImage {
  const embedder = {
    width,
    height,
    bitsPerComponent: 8,
    embedIntoContext: async (_context: PDFContext, r?: PDFRef) => r ?? ref,
  };
  return (PDFImage as unknown as { of(ref: PDFRef, doc: PDFDocument, embedder: unknown): PDFImage }).of(ref, pdfDoc, embedder);
}

/** Write separated pixels as a DeviceCMYK image XObject. */
export function embedCmykPixels(pdfDoc: PDFDocument, width: number, height: number, sep: { cmyk: Uint8Array; alpha?: Uint8Array }): PDFImage {
  const context = pdfDoc.context;
  let smask: PDFRef | undefined;
  if (sep.alpha) {
    smask = context.register(
      context.flateStream(sep.alpha, { Type: 'XObject', Subtype: 'Image', Width: width, Height: height, ColorSpace: 'DeviceGray', BitsPerComponent: 8 }),
    );
  }
  const dict: Record<string, unknown> = {
    Type: 'XObject',
    Subtype: 'Image',
    Width: width,
    Height: height,
    ColorSpace: 'DeviceCMYK',
    BitsPerComponent: 8,
  };
  const stream = context.flateStream(sep.cmyk, dict as never);
  if (smask) stream.dict.set(PDFName.of('SMask'), smask);
  const ref = context.register(stream);
  return imageOf(pdfDoc, ref, width, height);
}

/**
 * Embed a raster picture for a print render: separated into CMYK when the
 * mode converts pictures and the bitmap is RGB, else as pdf-lib embeds it.
 * PDF/X-1a always flattens a PNG's alpha (over paper) even when it keeps
 * a picture's colours.
 */
export async function embedPrintRaster(
  pdfDoc: PDFDocument,
  bytes: Uint8Array,
  format: 'png' | 'jpeg',
  mode: PrintColorMode,
): Promise<PDFImage> {
  if (format === 'jpeg') {
    const channels = jpegComponents(bytes);
    if (channels !== 3 || !mode.convertImages) return pdfDoc.embedJpg(bytes);
  }
  if (!mode.convertImages && !mode.flattenTransparency) {
    return format === 'png' ? pdfDoc.embedPng(bytes) : pdfDoc.embedJpg(bytes);
  }
  const px = await decodeRgba(bytes, format);
  if (!px) return format === 'png' ? pdfDoc.embedPng(bytes) : pdfDoc.embedJpg(bytes);
  return embedCmykPixels(pdfDoc, px.width, px.height, separatePixels(px, mode));
}
