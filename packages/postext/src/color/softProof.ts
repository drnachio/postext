/**
 * Soft proofing (#606): how a page will print, painted on screen. The
 * canvas renderer paints the page as usual, then every pixel goes through
 * a proof lookup — sRGB separated through the output profile (K-only
 * neutrals, as the PDF sets them) and the separation shown back on screen,
 * on the paper's own white when paper is simulated. Black areas large
 * enough for the PDF's rich black (a square of `richBlackMinSize` fits in
 * them) show as rich black.
 */

import type { BoundingBox } from '../vdt';
import type { ResolvedPrintConfig } from '../types';
import { buildRgbLut, sampleRgbLut, type OutputTransform, type RgbLut } from './transform';
import { dimensionToPx } from '../units';

export interface PrintPreview {
  /** sRGB → proofed sRGB (0..1, 3 channels). */
  lut: RgbLut;
  /** Large K-only black areas print rich black: the proofed colour
   *  (0..255) and the smaller side, page px, an area needs. */
  richBlack?: { rgb: [number, number, number]; minSidePx: number };
  /** Screen guides drawn over the proof (Canvas): the trim and bleed boxes
   *  and the safe zone inside the trim, page px. */
  guides?: { safeZonePx: number };
  /** Areas preflight flagged on a page (page px, by `VDTPage.index`),
   *  outlined. */
  marksFor?: (pageIndex: number) => readonly BoundingBox[];
}

export interface PrintPreviewOptions {
  /** Simulate the paper's white (absolute colorimetric): the Canvas
   *  proof. Off for Folio, whose paper shade tints the page already. */
  paper: boolean;
  /** Page px per inch, for the rich-black minimum size. */
  dpi: number;
}

const previewCache = new WeakMap<OutputTransform, Map<string, PrintPreview>>();

/** The proof of a print setup (memoized per transform and options). */
export function createPrintPreview(transform: OutputTransform, print: ResolvedPrintConfig, options: PrintPreviewOptions): PrintPreview {
  const key = `${options.paper}|${options.dpi}|${print.black.richBlack}|${JSON.stringify(print.black.richBlackColor)}|${JSON.stringify(print.black.richBlackMinSize)}`;
  let perTransform = previewCache.get(transform);
  if (!perTransform) previewCache.set(transform, (perTransform = new Map()));
  const hit = perTransform.get(key);
  if (hit) return hit;
  const lut = buildRgbLut(17, 3, (r, g, b) => transform.proof(transform.fromRgb(r, g, b), options.paper));
  const preview: PrintPreview = { lut };
  if (print.black.richBlack) {
    const rb = print.black.richBlackColor;
    const [r, g, b] = transform.proof({ c: rb.c / 100, m: rb.m / 100, y: rb.y / 100, k: rb.k / 100 }, options.paper);
    preview.richBlack = { rgb: [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)], minSidePx: dimensionToPx(print.black.richBlackMinSize, options.dpi) };
  }
  perTransform.set(key, preview);
  return preview;
}

/** Pixels of black (K-only) areas a square of side `s` fits in: a
 *  morphological opening of the black mask, through two summed-area
 *  tables. */
function largeBlackAreas(data: Uint8ClampedArray, w: number, h: number, s: number): Uint8Array | null {
  if (s < 2 || s > w || s > h) return null;
  const W = w + 1;
  const sat = new Int32Array(W * (h + 1));
  let any = false;
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const black = data[i]! <= 2 && data[i + 1]! <= 2 && data[i + 2]! <= 2 ? 1 : 0;
      if (black) any = true;
      row += black;
      sat[(y + 1) * W + x + 1] = sat[y * W + x + 1]! + row;
    }
  }
  if (!any) return null;
  const full = s * s;
  // Erosion: squares (top-left anchored) entirely black, as a second SAT.
  const eh = h - s + 1;
  const ew = w - s + 1;
  const esat = new Int32Array((ew + 1) * (eh + 1));
  const EW = ew + 1;
  let found = false;
  for (let y = 0; y < eh; y++) {
    let row = 0;
    for (let x = 0; x < ew; x++) {
      const sum = sat[(y + s) * W + x + s]! - sat[y * W + x + s]! - sat[(y + s) * W + x]! + sat[y * W + x]!;
      const e = sum === full ? 1 : 0;
      if (e) found = true;
      row += e;
      esat[(y + 1) * EW + x + 1] = esat[y * EW + x + 1]! + row;
    }
  }
  if (!found) return null;
  // Dilation: a pixel is in the opening when a full square covers it.
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - s + 1);
    const y1 = Math.min(eh - 1, y);
    if (y1 < y0) continue;
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - s + 1);
      const x1 = Math.min(ew - 1, x);
      if (x1 < x0) continue;
      const sum = esat[(y1 + 1) * EW + x1 + 1]! - esat[y0 * EW + x1 + 1]! - esat[(y1 + 1) * EW + x0]! + esat[y0 * EW + x0]!;
      if (sum > 0) out[y * w + x] = 1;
    }
  }
  return out;
}

/** Proof RGBA pixels in place. `pxPerPagePx` is the bitmap scale (the
 *  rich-black size is in page px). */
export function proofPixels(data: Uint8ClampedArray, width: number, height: number, preview: PrintPreview, pxPerPagePx = 1): void {
  const rich = preview.richBlack ? largeBlackAreas(data, width, height, Math.round(preview.richBlack.minSidePx * pxPerPagePx)) : null;
  const memo = new Map<number, number>();
  const out = new Float32Array(3);
  const n = width * height;
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    if (rich && rich[p]) {
      data[i] = preview.richBlack!.rgb[0];
      data[i + 1] = preview.richBlack!.rgb[1];
      data[i + 2] = preview.richBlack!.rgb[2];
      continue;
    }
    const key = (data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!;
    let v = memo.get(key);
    if (v === undefined) {
      sampleRgbLut(preview.lut, data[i]!, data[i + 1]!, data[i + 2]!, out);
      v = (Math.round(out[0]! * 255) << 16) | (Math.round(out[1]! * 255) << 8) | Math.round(out[2]! * 255);
      if (memo.size > 65536) memo.clear();
      memo.set(key, v);
    }
    data[i] = (v >> 16) & 255;
    data[i + 1] = (v >> 8) & 255;
    data[i + 2] = v & 255;
  }
}
