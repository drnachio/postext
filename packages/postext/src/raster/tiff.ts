/**
 * TIFF, as print work saves it: the first image of the file, in strips or
 * tiles, chunky or planar, uncompressed, LZW, Deflate or PackBits (with the
 * horizontal predictor), 1, 8 or 16 bits a sample; grey, RGB, palette or
 * CMYK (`Separated`), with an alpha channel, and the ICC profile and the
 * resolution it carries. JPEG-compressed TIFF is refused.
 */

import { checkSize, guarded, inflateBounded, within } from './limits.js';
import { RasterDecodeError, colorChannels, type DecodedRaster, type RasterColor } from './types.js';

/** Whether `bytes` start as a TIFF file (`II*\0` or `MM\0*`). */
export function isTiff(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 42 && bytes[3] === 0) || (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0 && bytes[3] === 42));
}

/** The most a stored byte can unpack to, per compression: PackBits 128
 *  bytes from 2, Deflate some 1 032 to 1, LZW a 12-bit code for a string
 *  of at most 4 096 bytes. */
const MAX_RATIO: Record<number, number> = { 1: 1, 32773: 64, 8: 1032, 32946: 1032, 5: 4096 };

const TYPE_SIZE:Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8 };

interface Entry {
  type: number;
  count: number;
  /** Where the values are: in the entry itself or at its offset. */
  at: number;
}

/** Decode the first image of a TIFF file. Every size, count and offset is
 *  checked against the file and the limits (`limits.ts`); a file that
 *  breaks one, or is cut short, is a {@link RasterDecodeError}, never a
 *  picture with blank rows. The input is not modified. */
export function decodeTiff(bytes: Uint8Array): DecodedRaster {
  if (!isTiff(bytes)) throw new RasterDecodeError('not a TIFF file');
  return guarded('TIFF', () => readTiff(bytes));
}

function readTiff(bytes: Uint8Array): DecodedRaster {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const le = bytes[0] === 0x49;
  const u16 = (at: number) => view.getUint16(at, le);
  const u32 = (at: number) => view.getUint32(at, le);
  const ifd = u32(4);
  if (ifd < 8 || ifd + 2 > bytes.length) throw new RasterDecodeError('truncated TIFF');
  const entries = new Map<number, Entry>();
  const n = u16(ifd);
  within(bytes, ifd + 2, n * 12, 'TIFF directory');
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12;
    const type = u16(e + 2);
    const count = u32(e + 4);
    const size = (TYPE_SIZE[type] ?? 1) * count;
    const at = size <= 4 ? e + 8 : u32(e + 8);
    // The values must lie in the file: a count can claim four billion.
    within(bytes, at, size, 'TIFF tag');
    entries.set(u16(e), { type, count, at });
  }
  const values = (tag: number): number[] => {
    const entry = entries.get(tag);
    if (!entry) return [];
    if (entry.count > bytes.length) throw new RasterDecodeError('truncated TIFF tag');
    const out: number[] = [];
    for (let i = 0; i < entry.count; i++) {
      if (entry.type === 3) out.push(u16(entry.at + i * 2));
      else if (entry.type === 4) out.push(u32(entry.at + i * 4));
      else if (entry.type === 5) out.push(u32(entry.at + i * 8) / (u32(entry.at + i * 8 + 4) || 1));
      else out.push(bytes[entry.at + i]!);
    }
    return out;
  };
  const one = (tag: number, fallback: number): number => values(tag)[0] ?? fallback;

  const width = one(256, 0);
  const height = one(257, 0);
  const bits = one(258, 1);
  const compression = one(259, 1);
  const photometric = one(262, 1);
  const spp = one(277, 1);
  checkSize(width, height, spp, 'TIFF');
  const planar = one(284, 1);
  const predictor = one(317, 1);
  if (compression === 6 || compression === 7) throw new RasterDecodeError('JPEG-compressed TIFF is not supported');
  if (![1, 5, 8, 32946, 32773].includes(compression)) throw new RasterDecodeError(`TIFF compression ${compression} is not supported`);
  if (![1, 8, 16].includes(bits)) throw new RasterDecodeError(`TIFF with ${bits} bits a sample is not supported`);

  let color: RasterColor;
  if (photometric === 0 || photometric === 1 || photometric === 3) color = photometric === 3 ? 'rgb' : 'gray';
  else if (photometric === 2) color = 'rgb';
  else if (photometric === 5 && spp >= 4) color = 'cmyk';
  else throw new RasterDecodeError(`TIFF photometric interpretation ${photometric} is not supported`);
  const base = photometric === 3 ? 1 : colorChannels(color);
  if (spp < base) throw new RasterDecodeError('TIFF without its colour samples');
  // An extra sample is alpha when ExtraSamples says so (1 associated, 2 unassociated).
  const extra = values(338);
  const alphaAt = spp > base && (extra[0] === 1 || extra[0] === 2) ? base : -1;

  // The image as stored: strips or tiles, each a block of rows / a tile.
  const tiled = entries.has(322);
  const tileW = tiled ? one(322, 0) : width;
  // RowsPerStrip defaults to "the whole image" (2³² − 1).
  const tileH = tiled ? one(323, 0) : Math.min(one(278, height), height);
  if (tileW < 1 || tileH < 1) throw new RasterDecodeError('TIFF with empty tiles or strips');
  // A tile may overhang the picture (padding), never pass the limits.
  if (tiled) checkSize(tileW, tileH, spp, 'TIFF tile');
  const across = Math.ceil(width / tileW);
  const down = Math.ceil(height / tileH);
  const planes = planar === 2 ? spp : 1;
  const perPixel = planar === 2 ? 1 : spp;
  const rowBytes = Math.ceil((tileW * perPixel * bits) / 8);
  const blocks = planes * across * down;
  const offsets = values(tiled ? 324 : 273);
  const counts = values(tiled ? 325 : 279);
  if (offsets.length < blocks || counts.length < blocks) throw new RasterDecodeError(`TIFF with ${Math.min(offsets.length, counts.length)} of its ${blocks} strips or tiles`);
  // The stored bytes must be able to hold the picture before anything is
  // allocated for it: a header of a few bytes cannot claim gigabytes.
  let stored = 0;
  for (let i = 0; i < blocks; i++) stored += counts[i]!;
  if (stored * MAX_RATIO[compression]! < (width * height * spp * bits) / 8) throw new RasterDecodeError('truncated TIFF: its strips cannot hold the picture');
  // Every sample, 8 bits, planar: [plane][y][x].
  const samples = Array.from({ length: spp }, () => new Uint8Array(width * height));
  for (let plane = 0; plane < planes; plane++) {
    for (let ty = 0; ty < down; ty++) {
      for (let tx = 0; tx < across; tx++) {
        const index = plane * across * down + ty * across + tx;
        const raw = within(bytes, offsets[index]!, counts[index]!, 'TIFF strip');
        const rows = tiled ? tileH : Math.min(tileH, height - ty * tileH);
        const block = decompress(raw, compression, rowBytes * rows);
        if (predictor === 2) undoPredictor(block, rowBytes, rows, perPixel, bits, le);
        for (let y = 0; y < rows; y++) {
          const py = ty * tileH + y;
          if (py >= height) break;
          for (let x = 0; x < tileW; x++) {
            const px = tx * tileW + x;
            if (px >= width) break;
            for (let s = 0; s < perPixel; s++) {
              const sample = planar === 2 ? plane : s;
              samples[sample]![py * width + px] = readSample(block, y * rowBytes, x * perPixel + s, bits, le);
            }
          }
        }
      }
    }
  }

  const pixels = width * height;
  let data: Uint8Array;
  if (photometric === 3) {
    // Palette: 16-bit red, then green, then blue tables.
    const map = values(320);
    const size = 1 << bits;
    if (map.length < 3 * size) throw new RasterDecodeError('TIFF palette without its colour map');
    data = new Uint8Array(pixels * 3);
    const index = samples[0]!;
    const scale = bits === 8 ? 1 : 255 / (size - 1);
    for (let i = 0; i < pixels; i++) {
      const v = Math.round(index[i]! / scale);
      data[i * 3] = (map[v] ?? 0) >> 8;
      data[i * 3 + 1] = (map[size + v] ?? 0) >> 8;
      data[i * 3 + 2] = (map[2 * size + v] ?? 0) >> 8;
    }
  } else {
    const ch = colorChannels(color);
    data = new Uint8Array(pixels * ch);
    for (let i = 0; i < pixels; i++) {
      for (let c = 0; c < ch; c++) data[i * ch + c] = samples[c]![i]!;
    }
    // WhiteIsZero: 0 is white.
    if (photometric === 0) for (let i = 0; i < data.length; i++) data[i] = 255 - data[i]!;
  }
  const out: DecodedRaster = { width, height, color, data };
  if (alphaAt >= 0) {
    out.alpha = samples[alphaAt]!;
    // Associated (premultiplied) alpha: back to straight colour.
    if (extra[0] === 1 && color !== 'cmyk') {
      const ch = colorChannels(color);
      for (let i = 0; i < pixels; i++) {
        const a = out.alpha[i]!;
        if (a > 0 && a < 255) for (let c = 0; c < ch; c++) data[i * ch + c] = Math.min(255, Math.round((data[i * ch + c]! * 255) / a));
      }
    }
  }
  const icc = entries.get(34675);
  if (icc) out.icc = within(bytes, icc.at, icc.count, 'TIFF profile').slice();
  const xres = values(282)[0];
  if (xres) {
    const unit = one(296, 2);
    if (unit === 2) out.resolution = xres;
    else if (unit === 3) out.resolution = xres * 2.54;
  }
  return out;
}

/** One sample as a byte: 1-bit samples to 0/255, 16-bit to their high byte. */
function readSample(block: Uint8Array, rowStart: number, index: number, bits: number, le: boolean): number {
  if (bits === 8) return block[rowStart + index] ?? 0;
  if (bits === 16) return block[rowStart + index * 2 + (le ? 1 : 0)] ?? 0;
  const byte = block[rowStart + (index >> 3)] ?? 0;
  return (byte >> (7 - (index & 7))) & 1 ? 255 : 0;
}

/** A strip or tile, decompressed to exactly `expected` bytes, in a buffer
 *  of its own (the predictor writes to it). Short data is an error. */
function decompress(raw: Uint8Array, compression: number, expected: number): Uint8Array {
  let out: Uint8Array;
  switch (compression) {
    case 1:
      out = raw.slice(0, expected);
      break;
    case 8:
    case 32946:
      out = inflateBounded(raw, expected, 'TIFF strip');
      break;
    case 32773:
      out = packBits(raw, expected);
      break;
    case 5:
      out = lzw(raw, expected);
      break;
    default:
      throw new RasterDecodeError(`TIFF compression ${compression} is not supported`);
  }
  if (out.length < expected) throw new RasterDecodeError('truncated TIFF strip');
  return out;
}

/** PackBits (Apple's run-length encoding), as TIFF and PSD use it. */
export function packBits(raw: Uint8Array, expected: number): Uint8Array {
  const out = new Uint8Array(expected);
  let o = 0;
  let i = 0;
  while (i < raw.length && o < expected) {
    const n = (raw[i++]! << 24) >> 24;
    if (n >= 0) {
      if (i + n + 1 > raw.length) break;
      for (let k = 0; k <= n && o < expected; k++) out[o++] = raw[i++]!;
    } else if (n !== -128) {
      if (i >= raw.length) break;
      const v = raw[i++]!;
      for (let k = 0; k < 1 - n && o < expected; k++) out[o++] = v;
    }
  }
  // Fewer bytes than the rows need: the data is cut short.
  return o < expected ? out.subarray(0, o) : out;
}

/** TIFF's LZW: MSB-first codes, 9 to 12 bits, early change. */
function lzw(raw: Uint8Array, expected: number): Uint8Array {
  const out = new Uint8Array(expected);
  let o = 0;
  const table: Uint8Array[] = [];
  const reset = () => {
    table.length = 0;
    for (let i = 0; i < 256; i++) table.push(new Uint8Array([i]));
    table.push(new Uint8Array(), new Uint8Array());
  };
  reset();
  let bitPos = 0;
  let width = 9;
  let prev: Uint8Array | undefined;
  const next = (): number => {
    let code = 0;
    for (let k = 0; k < width; k++) {
      const byte = raw[(bitPos + k) >> 3] ?? 0;
      code = (code << 1) | ((byte >> (7 - ((bitPos + k) & 7))) & 1);
    }
    bitPos += width;
    return code;
  };
  const write = (s: Uint8Array) => {
    for (let k = 0; k < s.length && o < expected; k++) out[o++] = s[k]!;
  };
  while (bitPos + width <= raw.length * 8 && o < expected) {
    const code = next();
    if (code === 257) break;
    if (code === 256) {
      reset();
      width = 9;
      prev = undefined;
      continue;
    }
    let entry: Uint8Array;
    if (code < table.length) {
      entry = table[code]!;
      if (prev && table.length < 4096) table.push(concat(prev, entry[0]!));
    } else if (prev && code === table.length) {
      entry = concat(prev, prev[0]!);
      table.push(entry);
    } else {
      throw new RasterDecodeError('corrupt LZW data');
    }
    write(entry);
    prev = entry;
    // Twelve-bit codes: the table never grows past 4 096 entries.
    if (table.length > 4096) throw new RasterDecodeError('corrupt LZW data');
    if (table.length >= (1 << width) - 1 && width < 12) width++;
  }
  return o < expected ? out.subarray(0, o) : out;
}

function concat(a: Uint8Array, b: number): Uint8Array {
  const out = new Uint8Array(a.length + 1);
  out.set(a);
  out[a.length] = b;
  return out;
}

/** Horizontal differencing (Predictor 2), per row, sample by sample. */
function undoPredictor(block: Uint8Array, rowBytes: number, rows: number, perPixel: number, bits: number, le: boolean): void {
  if (bits === 8) {
    for (let y = 0; y < rows; y++) {
      const start = y * rowBytes;
      for (let i = start + perPixel; i < start + rowBytes; i++) block[i] = (block[i]! + block[i - perPixel]!) & 255;
    }
  } else if (bits === 16) {
    const view = new DataView(block.buffer, block.byteOffset, block.byteLength);
    for (let y = 0; y < rows; y++) {
      const start = y * rowBytes;
      for (let i = start + perPixel * 2; i + 1 < start + rowBytes; i += 2) {
        view.setUint16(i, (view.getUint16(i, le) + view.getUint16(i - perPixel * 2, le)) & 0xffff, le);
      }
    }
  }
}
