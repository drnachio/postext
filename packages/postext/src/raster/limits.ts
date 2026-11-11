/**
 * The bounds every print-format decoder keeps (#1484): a file's header
 * says how big its picture is, and nothing is allocated, read or inflated
 * past what that size needs, nor past these limits, whatever the header
 * says. A file that breaks them is a {@link RasterDecodeError}.
 */

import { Unzlib } from 'fflate';
import { RasterDecodeError } from './types.js';

/** Pixels a picture may have: some 100 million (a 600 ppi scan of an A2
 *  sheet). */
export const MAX_PIXELS = 100_000_000;
/** Pixels on a side. */
export const MAX_SIDE = 100_000;
/** Samples a pixel may carry (CMYK, alpha and a few spot channels). */
export const MAX_CHANNELS = 16;
/** Samples a picture may hold in all (pixels × channels): what a
 *  decoder allocates is bounded by it. */
export const MAX_SAMPLES = 400_000_000;
/** Bytes an embedded ICC profile may inflate to. */
export const MAX_ICC_BYTES = 16 * 1024 * 1024;

/** Check a picture's size and channel count against the limits. */
export function checkSize(width: number, height: number, channels: number, what: string): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new RasterDecodeError(`${what} without a size`);
  if (width > MAX_SIDE || height > MAX_SIDE || width * height > MAX_PIXELS) throw new RasterDecodeError(`${what} of ${width} × ${height} pixels is over the limit`);
  if (!Number.isInteger(channels) || channels < 1 || channels > MAX_CHANNELS) throw new RasterDecodeError(`${what} with ${channels} channels is not supported`);
  if (width * height * channels > MAX_SAMPLES) throw new RasterDecodeError(`${what} of ${width} × ${height} pixels in ${channels} channels is over the limit`);
}

/** `bytes[at, at + length)` when it lies inside `bytes`, else an error. */
export function within(bytes: Uint8Array, at: number, length: number, what: string): Uint8Array {
  if (!Number.isFinite(at) || !Number.isFinite(length) || at < 0 || length < 0 || at + length > bytes.length) throw new RasterDecodeError(`truncated ${what}`);
  return bytes.subarray(at, at + length);
}

/** Inflate a zlib stream to at most `max` bytes: past that, or on a
 *  corrupt stream, an error. */
export function inflateBounded(raw: Uint8Array, max: number, what: string): Uint8Array {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const z = new Unzlib((chunk) => {
    total += chunk.length;
    if (total > max) throw new RasterDecodeError(`${what} inflates past its size`);
    chunks.push(chunk);
  });
  try {
    z.push(raw, true);
  } catch (err) {
    if (err instanceof RasterDecodeError) throw err;
    throw new RasterDecodeError(`corrupt ${what} (${(err as Error).message})`);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/** Run a decoder, turning whatever it throws (a read past the end of a
 *  DataView, a range error) into a {@link RasterDecodeError}. */
export function guarded<T>(what: string, decode: () => T): T {
  try {
    return decode();
  } catch (err) {
    if (err instanceof RasterDecodeError) throw err;
    throw new RasterDecodeError(`corrupt ${what} (${(err as Error).message})`);
  }
}
