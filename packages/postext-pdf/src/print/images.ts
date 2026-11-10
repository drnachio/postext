/**
 * Pictures in a colour-managed print render (#603): RGB bitmaps are
 * separated through the output profile into DeviceCMYK image XObjects.
 * PDF/X-1a, which has no transparency, gets each picture composed over the
 * paper; PDF/X-4 keeps its alpha as a DeviceGray soft mask. CMYK and
 * grayscale JPEGs pass through untouched (they are already print data).
 * A job on a few plates (`print.plates`) sets every picture as a monotone
 * or duotone on its picture plates instead (see `plates.ts`).
 */

import { PDFDocument, PDFImage, PDFName, PDFRef } from 'pdf-lib';
import UPNG from '@pdf-lib/upng';
import { buildRgbLut, deviceToXyz, outputTransform, rasterProfile, rasterToRgba, sampleRgbLut, type DecodedRaster, type IccProfile, type RgbLut } from 'postext';
import type { PrintColorMode } from './colorMode.js';
import { rgbToCmyk, rgbToGrayscale } from '../colors.js';
import { platePixels } from './plates.js';
import { convertCmykPixels, foreignCmyk, grayInkLut, isSrgb, pictureKind, sourceProfile } from './imageProfiles.js';
import { inkSpace } from './spot.js';

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

async function decodeWithCanvas(bytes: Uint8Array, type: string, raw = false): Promise<RgbaPixels | null> {
  const g = globalThis as unknown as {
    createImageBitmap?: (b: Blob, o?: { colorSpaceConversion?: 'none' | 'default' }) => Promise<ImageBitmap>;
    OffscreenCanvas?: new (w: number, h: number) => { getContext(t: '2d'): { drawImage(i: ImageBitmap, x: number, y: number): void; getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray } } | null };
  };
  if (!g.createImageBitmap || !g.OffscreenCanvas) return null;
  try {
    // `raw`: the file's own values, its profile applied by the caller, not
    // by the browser.
    const blob = new Blob([bytes as BlobPart], { type });
    const bitmap = await (raw ? g.createImageBitmap(blob, { colorSpaceConversion: 'none' }) : g.createImageBitmap(blob));
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

/** Decode a PNG or JPEG to RGBA. `raw`: the file's own values, for a
 *  caller that reads them through the picture's profile (in a browser,
 *  the canvas would otherwise convert them to sRGB). */
export async function decodeRgba(bytes: Uint8Array, format: 'png' | 'jpeg', raw = false): Promise<RgbaPixels | null> {
  if (format === 'png') {
    try {
      const img = UPNG.decode(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
      const frames = UPNG.toRGBA8(img);
      const first = frames[0];
      if (!first) return null;
      return { width: img.width, height: img.height, data: new Uint8Array(first) };
    } catch {
      return decodeWithCanvas(bytes, 'image/png', raw);
    }
  }
  const viaCanvas = await decodeWithCanvas(bytes, 'image/jpeg', raw);
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

const lutCache = new WeakMap<PrintColorMode, Map<string, RgbLut>>();

/** The RGB → CMYK pixel LUT of a mode, reading the pixels through
 *  `source` (sRGB when absent): the profile's own black generation (no
 *  K-only neutrals, which suit flat colours, not tones). */
function pixelLut(mode: PrintColorMode, source?: IccProfile): RgbLut {
  let perMode = lutCache.get(mode);
  if (!perMode) lutCache.set(mode, (perMode = new Map()));
  const key = source?.hash ?? 'srgb';
  let lut = perMode.get(key);
  if (!lut) {
    const t = outputTransform(mode.profile, {
      intent: mode.config.renderingIntent,
      blackPointCompensation: mode.config.blackPointCompensation,
      preserveNeutrals: false,
    });
    const toXyz = source ? deviceToXyz(source, mode.config.renderingIntent) : undefined;
    lut = buildRgbLut(33, 4, (r, g, b) => {
      const k = toXyz ? t.fromXyz(toXyz([r, g, b])) : t.fromRgb(r, g, b);
      return [k.c, k.m, k.y, k.k];
    });
    perMode.set(key, lut);
  }
  return lut;
}

/** Separate RGBA pixels into CMYK bytes (and an alpha plane when any pixel
 *  is translucent and the mode keeps transparency). */
export function separatePixels(px: RgbaPixels, mode: PrintColorMode, source?: IccProfile): { cmyk: Uint8Array; alpha?: Uint8Array } {
  const lut = pixelLut(mode, source);
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

/** A pdf-lib PDFImage over an image XObject already written to `ref`.
 *  `PDFImage.of` takes only pdf-lib's own JPEG and PNG embedders (any
 *  other throws, and every converted picture was dropped for a
 *  placeholder, #800), so the image is made on its prototype: the page's
 *  `drawImage` accepts it, and with no embedder there is nothing left to
 *  embed when the document is saved. */
export function imageOf(pdfDoc: PDFDocument, ref: PDFRef, width: number, height: number): PDFImage {
  const image = Object.create(PDFImage.prototype) as PDFImage;
  Object.assign(image, { ref, doc: pdfDoc, width, height, embedder: undefined });
  return image;
}

/** Write separated pixels as a DeviceCMYK image XObject. */
export function embedCmykPixels(pdfDoc: PDFDocument, width: number, height: number, sep: { cmyk: Uint8Array; alpha?: Uint8Array }): PDFImage {
  return embedDevicePixels(pdfDoc, width, height, 'DeviceCMYK', sep.cmyk, sep.alpha);
}

/** Write device pixels (one byte a channel) as an image XObject, its alpha
 *  plane as a DeviceGray soft mask; `space` a device space's name or a
 *  colour space object. */
function embedDevicePixels(pdfDoc: PDFDocument, width: number, height: number, space: 'DeviceCMYK' | 'DeviceGray' | 'DeviceRGB' | PDFRef, pixels: Uint8Array, alpha?: Uint8Array): PDFImage {
  const context = pdfDoc.context;
  let smask: PDFRef | undefined;
  if (alpha) {
    smask = context.register(
      context.flateStream(alpha, { Type: 'XObject', Subtype: 'Image', Width: width, Height: height, ColorSpace: 'DeviceGray', BitsPerComponent: 8 }),
    );
  }
  const dict: Record<string, unknown> = {
    Type: 'XObject',
    Subtype: 'Image',
    Width: width,
    Height: height,
    ColorSpace: space,
    BitsPerComponent: 8,
  };
  if (space instanceof PDFRef) delete dict.ColorSpace;
  const stream = context.flateStream(pixels, dict as never);
  if (space instanceof PDFRef) stream.dict.set(PDFName.of('ColorSpace'), space);
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
  const channels = format === 'jpeg' ? jpegComponents(bytes) : null;
  const kind = pictureKind(bytes, format, channels);
  const source = sourceProfile(bytes, kind, mode);
  if (mode.plates) {
    // A job on a few plates: a monotone or duotone on its picture plates,
    // the tones read through the picture's own profile.
    const px = await decodeRgba(bytes, format, source !== undefined);
    if (px) {
      const { pixels, alpha } = platePixels(px, mode.plates, mode.flattenTransparency, source && kind !== 'cmyk' ? luminanceOf(source) : undefined);
      return embedDevicePixels(pdfDoc, px.width, px.height, inkSpace(pdfDoc.context, mode.plates.images), pixels, alpha);
    }
  }
  const gray = mode.config.imageColor.grayDotGain;
  if (kind === 'gray' && mode.convertImages && gray !== 'none') {
    // On black alone, its tones matched through the press's dot gain.
    const px = await decodeRgba(bytes, format, source !== undefined);
    if (px) {
      const { pixels, alpha } = grayPixels(px, grayInkLut(mode, source), mode.flattenTransparency);
      return embedDevicePixels(pdfDoc, px.width, px.height, 'DeviceGray', pixels, alpha);
    }
  }
  if (kind === 'rgb' && source && !mode.convertImages && !mode.flattenTransparency) {
    // Kept in its own colours for the printer's RIP: tagged with its profile.
    const px = await decodeRgba(bytes, format, true);
    if (px) return embedIccPixels(pdfDoc, px, source);
  }
  // A CMYK JPEG separated for another press: its pixels are not decoded
  // here, so PDF/X-4 tags it with its own profile for the RIP to convert;
  // PDF/X-1a, which allows no ICC-based picture, passes it through.
  if (kind === 'cmyk' && format === 'jpeg' && !mode.flattenTransparency && foreignCmyk(source, mode)) {
    const tagged = embedJpegIcc(pdfDoc, bytes, source);
    if (tagged) return tagged;
  }
  if (format === 'jpeg' && (channels !== 3 || !mode.convertImages)) return pdfDoc.embedJpg(bytes);
  if (!mode.convertImages && !mode.flattenTransparency) {
    return format === 'png' ? pdfDoc.embedPng(bytes) : pdfDoc.embedJpg(bytes);
  }
  const px = await decodeRgba(bytes, format, kind === 'rgb' && source !== undefined);
  if (!px) return format === 'png' ? pdfDoc.embedPng(bytes) : pdfDoc.embedJpg(bytes);
  return embedCmykPixels(pdfDoc, px.width, px.height, separatePixels(px, mode, kind === 'rgb' ? source : undefined));
}

/** A pixel's luminance (bytes in, 0..1 out) through `profile`: a grey
 *  profile reads the first channel. */
function luminanceOf(profile: IccProfile): (r: number, g: number, b: number) => number {
  const toXyz = deviceToXyz(profile);
  const memo = new Map<number, number>();
  return (r, g, b) => {
    const key = (r << 16) | (g << 8) | b;
    let y = memo.get(key);
    if (y === undefined) {
      y = toXyz(profile.colorSpace === 'GRAY' ? [r / 255] : [r / 255, g / 255, b / 255]).Y;
      if (memo.size > 65536) memo.clear();
      memo.set(key, y);
    }
    return y;
  };
}

/** A grey picture's DeviceGray bytes through `lut` (its first channel),
 *  its alpha over the paper when `flatten`, else as a plane. */
function grayPixels(px: RgbaPixels, lut: Uint8Array, flatten: boolean): { pixels: Uint8Array; alpha?: Uint8Array } {
  const n = px.width * px.height;
  const pixels = new Uint8Array(n);
  let alpha: Uint8Array | undefined;
  for (let i = 0; i < n; i++) {
    let v = px.data[i * 4]!;
    const a = px.data[i * 4 + 3]!;
    if (a < 255) {
      if (flatten) v = Math.round(v * (a / 255) + 255 * (1 - a / 255));
      else {
        alpha ??= new Uint8Array(n).fill(255);
        alpha[i] = a;
      }
    }
    pixels[i] = lut[v]!;
  }
  return alpha ? { pixels, alpha } : { pixels };
}

/** Pixels as they are, in an ICCBased colour space of `profile`, the alpha
 *  as a soft mask: RGBA pixels (written as RGB), or `components`-channel
 *  device pixels with their own alpha plane. */
function embedIccPixels(pdfDoc: PDFDocument, px: RgbaPixels, profile: IccProfile, components: 3 | 4 = 3, deviceAlpha?: Uint8Array): PDFImage {
  const context = pdfDoc.context;
  if (components === 4) {
    const icc = context.register(context.flateStream(profile.bytes, { N: 4, Alternate: 'DeviceCMYK' }));
    const space = context.register(context.obj([PDFName.of('ICCBased'), icc]));
    return embedDevicePixels(pdfDoc, px.width, px.height, space, px.data as Uint8Array, deviceAlpha);
  }
  const n = px.width * px.height;
  const rgb = new Uint8Array(n * 3);
  let alpha: Uint8Array | undefined;
  for (let i = 0; i < n; i++) {
    rgb[i * 3] = px.data[i * 4]!;
    rgb[i * 3 + 1] = px.data[i * 4 + 1]!;
    rgb[i * 3 + 2] = px.data[i * 4 + 2]!;
    const a = px.data[i * 4 + 3]!;
    if (a < 255) (alpha ??= new Uint8Array(n).fill(255))[i] = a;
  }
  const icc = context.register(context.flateStream(profile.bytes, { N: 3, Alternate: 'DeviceRGB' }));
  const space = context.register(context.obj([PDFName.of('ICCBased'), icc]));
  return embedDevicePixels(pdfDoc, px.width, px.height, space, rgb, alpha);
}

/** RGBA pixels as device pixels with the flat colours' formulas (#800):
 *  grayscale the Rec. 601 luma, CMYK the naive separation; an alpha plane
 *  when any pixel is translucent. */
export function devicePixels(px: RgbaPixels, space: 'grayscale' | 'cmyk'): { pixels: Uint8Array; alpha?: Uint8Array } {
  const n = px.width * px.height;
  const channels = space === 'grayscale' ? 1 : 4;
  const pixels = new Uint8Array(n * channels);
  const alpha = new Uint8Array(n);
  let translucent = false;
  const d = px.data;
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    const a = d[i + 3]!;
    alpha[p] = a;
    if (a < 255) translucent = true;
    const rgb = { r: d[i]! / 255, g: d[i + 1]! / 255, b: d[i + 2]! / 255 };
    if (space === 'grayscale') {
      pixels[p] = Math.round(rgbToGrayscale(rgb) * 255);
    } else {
      const k = rgbToCmyk(rgb);
      const o = p * 4;
      pixels[o] = Math.round(k.c * 255);
      pixels[o + 1] = Math.round(k.m * 255);
      pixels[o + 2] = Math.round(k.y * 255);
      pixels[o + 3] = Math.round(k.k * 255);
    }
  }
  return translucent ? { pixels, alpha } : { pixels };
}

/**
 * Embed a raster picture in a render forced to a device colour space with
 * no output profile behind it (#800): a grayscale PDF writes its pictures
 * in DeviceGray, a plain CMYK one (its profile unavailable) in DeviceCMYK,
 * as their text and flat colours already are. A JPEG already in that space
 * passes through; one that cannot be decoded is embedded as it is.
 */
export async function embedDeviceRaster(
  pdfDoc: PDFDocument,
  bytes: Uint8Array,
  format: 'png' | 'jpeg',
  space: 'grayscale' | 'cmyk',
): Promise<PDFImage> {
  if (format === 'jpeg' && jpegComponents(bytes) === (space === 'grayscale' ? 1 : 4)) return pdfDoc.embedJpg(bytes);
  const px = await decodeRgba(bytes, format);
  if (!px) return format === 'png' ? pdfDoc.embedPng(bytes) : pdfDoc.embedJpg(bytes);
  const { pixels, alpha } = devicePixels(px, space);
  return embedDevicePixels(pdfDoc, px.width, px.height, space === 'grayscale' ? 'DeviceGray' : 'DeviceCMYK', pixels, alpha);
}

/** A decoded TIFF or Photoshop picture as RGBA: grey in every channel (its
 *  own values), RGB as it is, CMYK as the screen preview shows it. */
function rasterRgba(raster: DecodedRaster): RgbaPixels {
  const { width, height, color, data, alpha } = raster;
  if (color === 'cmyk') return { width, height, data: rasterToRgba(raster) };
  const n = width * height;
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    if (color === 'gray') out.fill(data[i]!, i * 4, i * 4 + 3);
    else out.set(data.subarray(i * 3, i * 3 + 3), i * 4);
    out[i * 4 + 3] = alpha?.[i] ?? 255;
  }
  return { width, height, data: out };
}

/** The profile a decoded picture is read through in `mode`, as for a PNG
 *  or JPEG (`sourceProfile`). */
function rasterSource(raster: DecodedRaster, mode: PrintColorMode): IccProfile | undefined {
  if (raster.color === 'rgb' && mode.assignedRgbProfile) return mode.assignedRgbProfile;
  if (mode.config.imageColor.embeddedProfile === 'ignore') return undefined;
  const profile = rasterProfile(raster);
  return profile && !(raster.color === 'rgb' && isSrgb(profile)) ? profile : undefined;
}

/**
 * Embed a decoded TIFF or Photoshop picture for a print render, from its
 * own pixels: CMYK as it is, on its plates; grey on black, through the dot
 * gain; RGB separated from its profile (or kept, tagged with it, when the
 * mode keeps pictures); on a job's few plates, as its monotone or duotone.
 */
export function embedPrintDecoded(pdfDoc: PDFDocument, raster: DecodedRaster, mode: PrintColorMode): PDFImage {
  const { width, height, color } = raster;
  const source = rasterSource(raster, mode);
  if (mode.plates) {
    const { pixels, alpha } = platePixels(rasterRgba(raster), mode.plates, mode.flattenTransparency, source && color !== 'cmyk' ? luminanceOf(source) : undefined);
    return embedDevicePixels(pdfDoc, width, height, inkSpace(pdfDoc.context, mode.plates.images), pixels, alpha);
  }
  if (color === 'cmyk') {
    let data = raster.data;
    let alpha = raster.alpha;
    // Separated for another press: converted for the output's, or kept
    // and tagged with its profile for the RIP when pictures are kept.
    if (foreignCmyk(source, mode)) {
      if (!mode.convertImages && !mode.flattenTransparency) return embedIccPixels(pdfDoc, { width, height, data }, source, 4, alpha);
      data = convertCmykPixels(data, mode, source);
    }
    if (alpha && mode.flattenTransparency) {
      // Over the paper: less of every ink.
      data = data.map((v, i) => Math.round((v * alpha![i >> 2]!) / 255));
      alpha = undefined;
    }
    return embedDevicePixels(pdfDoc, width, height, 'DeviceCMYK', data, alpha);
  }
  const px = rasterRgba(raster);
  if (color === 'gray') {
    const keep = !mode.convertImages || mode.config.imageColor.grayDotGain === 'none';
    const lut = keep ? Uint8Array.from({ length: 256 }, (_, i) => i) : grayInkLut(mode, source);
    const { pixels, alpha } = grayPixels(px, lut, mode.flattenTransparency);
    return embedDevicePixels(pdfDoc, width, height, 'DeviceGray', pixels, alpha);
  }
  if (!mode.convertImages && !mode.flattenTransparency) {
    if (source) return embedIccPixels(pdfDoc, px, source);
    const { pixels, alpha } = rgbPixels(px);
    return embedDevicePixels(pdfDoc, width, height, 'DeviceRGB', pixels, alpha);
  }
  return embedCmykPixels(pdfDoc, width, height, separatePixels(px, mode, source));
}

/**
 * Embed a decoded TIFF or Photoshop picture in a render without a print
 * mode: in the device space it is forced to (#800), CMYK and grey kept when
 * they are that space already; else as the screen shows it, in RGB.
 */
export function embedDeviceDecoded(pdfDoc: PDFDocument, raster: DecodedRaster, space: 'grayscale' | 'cmyk' | 'rgb'): PDFImage {
  const { width, height, color } = raster;
  if (space === 'cmyk' && color === 'cmyk') return embedDevicePixels(pdfDoc, width, height, 'DeviceCMYK', raster.data, raster.alpha);
  if (space === 'grayscale' && color === 'gray') return embedDevicePixels(pdfDoc, width, height, 'DeviceGray', raster.data, raster.alpha);
  const px = rasterRgba(raster);
  if (space === 'rgb') {
    const { pixels, alpha } = rgbPixels({ width, height, data: rasterToRgba(raster) });
    return embedDevicePixels(pdfDoc, width, height, 'DeviceRGB', pixels, alpha);
  }
  const { pixels, alpha } = devicePixels(px, space);
  return embedDevicePixels(pdfDoc, width, height, space === 'grayscale' ? 'DeviceGray' : 'DeviceCMYK', pixels, alpha);
}

/** RGBA as RGB bytes and an alpha plane when any pixel is translucent. */
function rgbPixels(px: RgbaPixels): { pixels: Uint8Array; alpha?: Uint8Array } {
  const n = px.width * px.height;
  const pixels = new Uint8Array(n * 3);
  let alpha: Uint8Array | undefined;
  for (let i = 0; i < n; i++) {
    pixels[i * 3] = px.data[i * 4]!;
    pixels[i * 3 + 1] = px.data[i * 4 + 1]!;
    pixels[i * 3 + 2] = px.data[i * 4 + 2]!;
    const a = px.data[i * 4 + 3]!;
    if (a < 255) (alpha ??= new Uint8Array(n).fill(255))[i] = a;
  }
  return alpha ? { pixels, alpha } : { pixels };
}

/** A CMYK JPEG as it is (DCTDecode), in an ICCBased colour space of its
 *  own profile, inverted as Adobe writes CMYK JPEGs (as pdf-lib embeds
 *  them); undefined when its size cannot be read. */
function embedJpegIcc(pdfDoc: PDFDocument, bytes: Uint8Array, profile: IccProfile): PDFImage | undefined {
  let i = 2;
  let size: { width: number; height: number } | undefined;
  while (i + 9 < bytes.length && bytes[i] === 0xff) {
    const marker = bytes[i + 1]!;
    const len = (bytes[i + 2]! << 8) | bytes[i + 3]!;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      size = { height: (bytes[i + 5]! << 8) | bytes[i + 6]!, width: (bytes[i + 7]! << 8) | bytes[i + 8]! };
      break;
    }
    i += 2 + len;
  }
  if (!size) return undefined;
  const context = pdfDoc.context;
  const icc = context.register(context.flateStream(profile.bytes, { N: 4, Alternate: 'DeviceCMYK' }));
  const space = context.register(context.obj([PDFName.of('ICCBased'), icc]));
  const stream = context.stream(bytes, { Type: 'XObject', Subtype: 'Image', Width: size.width, Height: size.height, BitsPerComponent: 8, Filter: 'DCTDecode', Decode: [1, 0, 1, 0, 1, 0, 1, 0] });
  stream.dict.set(PDFName.of('ColorSpace'), space);
  return imageOf(pdfDoc, context.register(stream), size.width, size.height);
}
