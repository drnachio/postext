/**
 * Photoshop documents (PSD, and the large-document PSB): the composite
 * image Photoshop saves beside the layers ("Maximize compatibility"), in
 * grey, RGB or CMYK, 8 or 16 bits, raw or RLE; with the ICC profile and the
 * resolution of its image resources. Layers are not composed here: a file
 * saved without the composite has nothing to read.
 */

import { checkSize, guarded, within } from './limits.js';
import { packBits } from './tiff.js';
import { RasterDecodeError, colorChannels, type DecodedRaster, type RasterColor } from './types.js';

/** Whether `bytes` start as a Photoshop document (`8BPS`). */
export function isPsd(bytes: Uint8Array): boolean {
  return bytes.length >= 26 && bytes[0] === 0x38 && bytes[1] === 0x42 && bytes[2] === 0x50 && bytes[3] === 0x53;
}

const MODES: Record<number, RasterColor> = { 1: 'gray', 3: 'rgb', 4: 'cmyk', 8: 'gray' };

/** Decode a Photoshop document's composite image. Sizes, lengths and
 *  offsets are checked against the file and the limits (`limits.ts`); a
 *  file that breaks one, or is cut short, is a {@link RasterDecodeError}. */
export function decodePsd(bytes: Uint8Array): DecodedRaster {
  if (!isPsd(bytes)) throw new RasterDecodeError('not a Photoshop document');
  return guarded('Photoshop document', () => readPsd(bytes));
}

function readPsd(bytes: Uint8Array): DecodedRaster {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint16(4);
  if (version !== 1 && version !== 2) throw new RasterDecodeError(`Photoshop version ${version} is not supported`);
  const big = version === 2;
  const channels = view.getUint16(12);
  const height = view.getUint32(14);
  const width = view.getUint32(18);
  const depth = view.getUint16(22);
  const mode = view.getUint16(24);
  const color = MODES[mode];
  if (!color) throw new RasterDecodeError(`Photoshop colour mode ${mode} is not supported`);
  if (depth !== 8 && depth !== 16) throw new RasterDecodeError(`Photoshop documents of ${depth} bits are not supported`);
  const ch = colorChannels(color);
  if (channels < ch) throw new RasterDecodeError('Photoshop document without its colour channels');
  checkSize(width, height, channels, 'Photoshop document');

  let at = 26;
  // Colour mode data.
  at += 4 + view.getUint32(at);
  within(bytes, at, 4, 'Photoshop document');
  // Image resources: the ICC profile (1039) and the resolution (1005).
  const resourcesEnd = at + 4 + view.getUint32(at);
  within(bytes, at, resourcesEnd - at, 'Photoshop image resources');
  let icc: Uint8Array | undefined;
  let resolution: number | undefined;
  at += 4;
  while (at + 12 <= resourcesEnd) {
    if (view.getUint32(at) !== 0x3842494d) break; // '8BIM'
    const id = view.getUint16(at + 4);
    const nameLength = bytes[at + 6]!;
    const nameSize = (nameLength + 2) & ~1; // length byte + name, padded to even
    const sizeAt = at + 6 + nameSize;
    const size = view.getUint32(sizeAt);
    const data = sizeAt + 4;
    if (data + size > resourcesEnd) throw new RasterDecodeError('truncated Photoshop image resource');
    if (id === 1039) icc = bytes.slice(data, data + size);
    if (id === 1005 && size >= 16) {
      // Fixed 16.16 pixels per unit; unit 1 = per inch, 2 = per cm.
      const res = view.getUint32(data) / 65536;
      const unit = view.getUint16(data + 4);
      resolution = unit === 2 ? res * 2.54 : res;
    }
    at = data + size + (size & 1);
  }
  at = resourcesEnd;
  // Layer and mask information: skipped.
  at += (big ? 8 : 4) + (big ? Number(view.getBigUint64(at)) : view.getUint32(at));
  within(bytes, at, 2, 'Photoshop document');

  // The composite image, channel after channel.
  const compression = view.getUint16(at);
  at += 2;
  const pixels = width * height;
  const sampleBytes = depth / 8;
  const rowBytes = width * sampleBytes;
  const planes: Uint8Array[] = [];
  if (compression === 0) {
    // Only the colour channels are read; the others may be cut off.
    for (let c = 0; c < ch; c++) {
      planes.push(within(bytes, at, rowBytes * height, 'Photoshop composite image'));
      at += rowBytes * height;
    }
  } else if (compression === 1) {
    // Every row's byte count, all channels, then the rows.
    const countSize = big ? 4 : 2;
    within(bytes, at, channels * height * countSize, 'Photoshop row counts');
    const counts: number[] = [];
    for (let i = 0; i < channels * height; i++) counts.push(big ? view.getUint32(at + i * 4) : view.getUint16(at + i * 2));
    at += channels * height * countSize;
    for (let c = 0; c < ch; c++) {
      const plane = new Uint8Array(rowBytes * height);
      for (let y = 0; y < height; y++) {
        const n = counts[c * height + y]!;
        const row = packBits(within(bytes, at, n, 'Photoshop composite image'), rowBytes);
        if (row.length < rowBytes) throw new RasterDecodeError('truncated Photoshop row');
        plane.set(row, y * rowBytes);
        at += n;
      }
      planes.push(plane);
    }
  } else {
    throw new RasterDecodeError(`Photoshop compression ${compression} is not supported`);
  }
  if (planes.some((p) => p.length < rowBytes * height)) throw new RasterDecodeError('truncated Photoshop document');

  const data = new Uint8Array(pixels * ch);
  for (let c = 0; c < ch; c++) {
    const plane = planes[c]!;
    for (let i = 0; i < pixels; i++) {
      const v = plane[i * sampleBytes]!; // the high byte of a 16-bit sample
      // Photoshop stores CMYK as 255 = no ink.
      data[i * ch + c] = color === 'cmyk' ? 255 - v : v;
    }
  }
  const out: DecodedRaster = { width, height, color, data };
  if (icc) out.icc = icc;
  if (resolution) out.resolution = resolution;
  return out;
}
