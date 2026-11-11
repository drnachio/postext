/**
 * Print formats a browser cannot show — TIFF, Photoshop — decoded to their
 * own pixels, and turned into the sRGB preview a screen shows of them.
 */

import { parseIccProfile, type IccProfile } from '../color/icc.js';
import { buildRgbLut, deviceToXyz, sampleRgbLut, xyzToSrgb } from '../color/transform.js';
import { decodePsd, isPsd } from './psd.js';
import { decodeTiff, isTiff } from './tiff.js';
import { RasterDecodeError, type DecodedRaster } from './types.js';

export { decodePsd, isPsd } from './psd.js';
export { decodeTiff, isTiff } from './tiff.js';
export { RasterDecodeError, colorChannels, type DecodedRaster, type RasterColor } from './types.js';

/** The print format of `bytes`, when it is one a browser cannot show. */
export function printRasterFormat(bytes: Uint8Array): 'tiff' | 'psd' | undefined {
  return isTiff(bytes) ? 'tiff' : isPsd(bytes) ? 'psd' : undefined;
}

/** Decode a TIFF or a Photoshop document. */
export function decodePrintRaster(bytes: Uint8Array): DecodedRaster {
  if (isTiff(bytes)) return decodeTiff(bytes);
  if (isPsd(bytes)) return decodePsd(bytes);
  throw new RasterDecodeError('neither a TIFF nor a Photoshop document');
}

/** The raster's embedded profile, when it parses and fits its pixels. */
export function rasterProfile(raster: DecodedRaster): IccProfile | undefined {
  if (!raster.icc) return undefined;
  try {
    const profile = parseIccProfile(raster.icc);
    const want = raster.color === 'gray' ? 'GRAY' : raster.color === 'rgb' ? 'RGB' : 'CMYK';
    return profile.colorSpace === want ? profile : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The raster as 8-bit sRGB RGBA, as a screen shows it: through its own
 * profile when it has one (a CMYK one simulating the press), else grey and
 * RGB as they are and CMYK through the plain formula.
 */
export function rasterToRgba(raster: DecodedRaster): Uint8ClampedArray {
  const { width, height, color, data, alpha } = raster;
  const n = width * height;
  const out = new Uint8ClampedArray(n * 4);
  const profile = rasterProfile(raster);
  const toXyz = profile ? deviceToXyz(profile) : undefined;
  if (color === 'rgb') {
    const lut = toXyz ? buildRgbLut(33, 3, (r, g, b) => xyzToSrgb(toXyz([r, g, b]))) : undefined;
    const px = new Float32Array(3);
    for (let i = 0; i < n; i++) {
      const [r, g, b] = [data[i * 3]!, data[i * 3 + 1]!, data[i * 3 + 2]!];
      if (lut) {
        sampleRgbLut(lut, r, g, b, px);
        out.set([px[0]! * 255, px[1]! * 255, px[2]! * 255], i * 4);
      } else out.set([r, g, b], i * 4);
      out[i * 4 + 3] = alpha?.[i] ?? 255;
    }
    return out;
  }
  const memo = new Map<number, [number, number, number]>();
  const ch = color === 'gray' ? 1 : 4;
  for (let i = 0; i < n; i++) {
    let key = 0;
    for (let c = 0; c < ch; c++) key = key * 256 + data[i * ch + c]!;
    let rgb = memo.get(key);
    if (!rgb) {
      const v = Array.from({ length: ch }, (_, c) => data[i * ch + c]! / 255);
      if (toXyz) rgb = xyzToSrgb(toXyz(v)).map((x) => x * 255) as [number, number, number];
      else if (color === 'gray') rgb = [v[0]! * 255, v[0]! * 255, v[0]! * 255];
      else {
        const k = 1 - v[3]!;
        rgb = [255 * (1 - v[0]!) * k, 255 * (1 - v[1]!) * k, 255 * (1 - v[2]!) * k];
      }
      if (memo.size > 65536) memo.clear();
      memo.set(key, rgb);
    }
    out.set(rgb, i * 4);
    out[i * 4 + 3] = alpha?.[i] ?? 255;
  }
  return out;
}
