/**
 * The ISBN barcode as an SVG drawing in millimetres: the EAN-13 bars (and
 * the add-on's), the digits under them, the ISBN line above, and a white
 * ground over the quiet zones so the symbol reads on any cover.
 */

import {
  EAN13_BAR_HEIGHT_MM,
  EAN13_MODULE_MM,
  EAN13_QUIET_ZONE,
  ean13Symbol,
  isbnCaption,
  parseIsbn,
  type BarcodeBar,
} from './isbn.js';

/** The smallest a barcode may be printed (GS1: 80 … 200 %). */
export const EAN13_MIN_MAGNIFICATION = 0.8;

export interface IsbnBarcodeOptions {
  /** Size against the nominal 100 % (0.8 … 2). Default 1. */
  magnification?: number;
  /** Five digits after the symbol. */
  addOn?: string;
  /** Font of the digits and the ISBN line. Default OCR-B, then Arial. */
  fontFamily?: string;
  /** Draw a white ground under the symbol and its quiet zones. Default
   *  true. */
  ground?: boolean;
}

export interface IsbnBarcodeSvg {
  svg: string;
  /** Size of the drawing, mm. */
  width: number;
  height: number;
}

const fmt = (n: number): string => String(Math.round(n * 1000) / 1000);
const DIGIT_MODULES = 7;
/** Height of the digits under the bars, in modules (GS1 draws them in the
 *  band the guard bars run down into, and below). */
const DIGIT_SIZE = 9;
const CAPTION_SIZE = 9.5;

function rects(bars: BarcodeBar[], left: number, top: number, x: number, h: number, guardExtra: number): string {
  return bars
    .map((b) => `<rect x="${fmt(left + b.x * x)}" y="${fmt(top)}" width="${fmt(b.width * x)}" height="${fmt(h + (b.guard ? guardExtra : 0))}"/>`)
    .join('');
}

/** The barcode of an ISBN as written, or undefined when it cannot be read
 *  (see `parseIsbn`). Black is drawn as `#000`: a PDF writes it as 100 % K. */
export function isbnBarcodeSvg(isbn: string, options: IsbnBarcodeOptions = {}): IsbnBarcodeSvg | undefined {
  const read = parseIsbn(isbn);
  if (!read.ok) return undefined;
  const mag = Math.min(2, Math.max(EAN13_MIN_MAGNIFICATION, options.magnification ?? 1));
  const x = EAN13_MODULE_MM * mag;
  const font = options.fontFamily ?? "'OCR-B', 'OCR B', Arial, sans-serif";
  const symbol = ean13Symbol(read.isbn13, options.addOn);
  const captionH = CAPTION_SIZE * x * 1.25;
  const barTop = captionH;
  const barH = EAN13_BAR_HEIGHT_MM * mag;
  const guardExtra = 5 * x;
  const left = EAN13_QUIET_ZONE.left * x;
  const addOn = symbol.addOn;
  const rightModules = addOn ? addOn.x + addOn.width + 5 : symbol.width + EAN13_QUIET_ZONE.right;
  const width = left + rightModules * x;
  const height = barTop + barH + guardExtra + DIGIT_SIZE * x * 0.4;
  const digitY = barTop + barH + DIGIT_SIZE * x * 0.95;
  const text = (s: string, cx: number, y: number, size: number, anchor = 'middle') =>
    `<text x="${fmt(cx)}" y="${fmt(y)}" font-size="${fmt(size)}" text-anchor="${anchor}">${s}</text>`;

  const d = symbol.digits;
  const digits = [
    text(d[0]!, left - 1.5 * x, digitY, DIGIT_SIZE * x, 'end'),
    ...[...d.slice(1, 7)].map((c, i) => text(c, left + (3 + i * DIGIT_MODULES + 3.5) * x, digitY, DIGIT_SIZE * x)),
    ...[...d.slice(7)].map((c, i) => text(c, left + (50 + i * DIGIT_MODULES + 3.5) * x, digitY, DIGIT_SIZE * x)),
  ];
  let addOnSvg = '';
  if (addOn) {
    // The add-on's bars start below its digits, level with the guard bars' feet.
    const addTop = barTop + DIGIT_SIZE * x;
    addOnSvg = rects(addOn.bars, left, addTop, x, barH + guardExtra - DIGIT_SIZE * x, 0)
      + [...addOn.digits].map((c, i) => text(c, left + (addOn.x + 4 + i * 9 + 3.5) * x, barTop + DIGIT_SIZE * x * 0.85, DIGIT_SIZE * x)).join('');
  }
  const caption = text(isbnCaption(isbn, read.isbn13), left + (95 / 2) * x, captionH * 0.8, CAPTION_SIZE * x);
  const ground = options.ground === false ? '' : `<rect x="0" y="0" width="${fmt(width)}" height="${fmt(height)}" fill="#fff"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(width)}mm" height="${fmt(height)}mm" viewBox="0 0 ${fmt(width)} ${fmt(height)}">`
    + ground
    + `<g fill="#000">${rects(symbol.bars, left, barTop, x, barH, guardExtra)}${addOnSvg}</g>`
    + `<g fill="#000" font-family="${font}">${caption}${digits.join('')}</g>`
    + '</svg>';
  return { svg, width, height };
}
