// Ink under a line's box (#1406): a line the extractor reads in the
// LibreOffice PDF may still be invisible, painted under an opaque shape.
// The page images are read as 8-bit grey and the box sampled in both.

import { spawnSync } from 'node:child_process';

/** A PNG as { w, h, data } (one byte of grey per pixel), through
 *  ImageMagick (`convert` is `magick` on 7, `convert` on 6). */
export function loadGrey(convert, png) {
  const [cmd, ...pre] = convert;
  const id = spawnSync(cmd, [...pre, png, '-format', '%w %h', 'info:'], { encoding: 'utf8' });
  const [w, h] = (id.stdout ?? '').trim().split(/\s+/).map(Number);
  const r = spawnSync(cmd, [...pre, png, '-colorspace', 'Gray', '-depth', '8', 'gray:-'], { maxBuffer: 512 * 1024 * 1024 });
  if (r.status !== 0 || !(w > 0) || r.stdout.length < w * h) return null;
  return { w, h, data: r.stdout };
}

/** Spread of grey (max - min) inside a box in points, at `scale` pixels a
 *  point; 0 for a flat fill, -1 when the box falls off the image. */
export function inkRange(img, b, scale) {
  const x0 = Math.max(0, Math.floor(b.x * scale));
  const y0 = Math.max(0, Math.floor(b.y * scale));
  const x1 = Math.min(img.w, Math.ceil(b.x2 * scale));
  const y1 = Math.min(img.h, Math.ceil(b.y2 * scale));
  if (x1 <= x0 || y1 <= y0) return -1;
  let lo = 255;
  let hi = 0;
  for (let y = y0; y < y1; y++) {
    const row = y * img.w;
    for (let x = x0; x < x1; x++) {
      const v = img.data[row + x];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  return hi - lo;
}

/** Ink spread that counts as text, and the most a flat fill may vary
 *  (antialiasing at the box edge, JPEG noise). */
export const INK = 64;
export const FLAT = 16;

/** Whether the reference shows ink in its line's box while the docx page
 *  is a flat fill in the matched line's box: the text is there but hidden. */
export function hiddenLine(refImg, docxImg, refBox, docxBox, scale) {
  const ref = inkRange(refImg, refBox, scale);
  const docx = inkRange(docxImg, docxBox, scale);
  return ref >= INK && docx >= 0 && docx <= FLAT;
}
