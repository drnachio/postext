/**
 * Pictures decoded from the print formats a browser cannot show (TIFF,
 * PSD): their own pixels, as the file holds them, for the print render,
 * and for the screen preview a host derives from them.
 */

/** The colours a decoded picture's pixels are in. */
export type RasterColor = 'gray' | 'rgb' | 'cmyk';

export interface DecodedRaster {
  width: number;
  height: number;
  color: RasterColor;
  /** 8 bits a channel, channels interleaved, rows top-down. CMYK is ink
   *  (0 paper, 255 solid), whatever the file's own convention. */
  data: Uint8Array;
  /** Opacity, one byte a pixel, when the file has an alpha channel. */
  alpha?: Uint8Array;
  /** The ICC profile the file embeds. */
  icc?: Uint8Array;
  /** Pixels per inch, horizontal, when the file states it. */
  resolution?: number;
}

export class RasterDecodeError extends Error {}

/** Channels a pixel has in `color`. */
export function colorChannels(color: RasterColor): number {
  return color === 'gray' ? 1 : color === 'rgb' ? 3 : 4;
}
