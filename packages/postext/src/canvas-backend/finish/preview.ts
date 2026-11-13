/**
 * Special inks in the canvas preview (#1564, `RenderPageOptions.finishes`):
 * the painted page is lit from its finish mask.
 *
 * - `'sheen'`: a light diagonal sweep over metallic ink and foil (brighter
 *   the shinier), a glow on fluorescent ink (more saturated and brighter)
 *   and a gloss highlight on varnish, which the flat page does not show at
 *   all.
 * - `'map'`: the mask in false colour over a faded page, as a press proof
 *   marks its special plates: metallic and foil amber, fluorescent pink,
 *   varnish cyan, opaque white blue.
 */

import type { VDTDocument, VDTPage } from '../../vdt.js';
import { renderFinishMask, type FinishMask } from './mask.js';

/** How the canvas preview shows special inks. */
export type FinishPreviewMode = 'flat' | 'sheen' | 'map';

const clamp = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v);

/** The light of the diagonal sweep at (x, y), 0..1: three soft bands
 *  across the page, from the top left. */
function sweep(x: number, y: number, width: number, height: number): number {
  const d = (x + y) / Math.max(1, width + height);
  return 0.5 + 0.5 * Math.cos(2 * Math.PI * (d * 3 - 0.3));
}

/** Light the page's RGBA `pixels` (unpremultiplied, the page's size) from
 *  its finish mask, in place. */
export function applyFinishPreview(pixels: Uint8ClampedArray, mask: FinishMask, mode: Exclude<FinishPreviewMode, 'flat'>): void {
  const { width, height, data } = mask;
  const cols = Math.max(1, width);
  if (pixels.length !== data.length) return;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i]! / 255;
    const g = data[i + 1]! / 255;
    const b = data[i + 2]! / 255;
    const a = data[i + 3]! / 255;
    if (r === 0 && g === 0 && b === 0 && a === 0) continue;
    const x = p % cols;
    const y = (p - x) / cols;
    let pr = pixels[i]!;
    let pg = pixels[i + 1]!;
    let pb = pixels[i + 2]!;
    if (mode === 'map') {
      const lum = 0.2126 * pr + 0.7152 * pg + 0.0722 * pb;
      const base = 0.35 * lum + 0.65 * 255;
      pr = pg = pb = base;
      const mix = (w: number, cr: number, cg: number, cb: number) => {
        pr = pr * (1 - w) + cr * w;
        pg = pg * (1 - w) + cg * w;
        pb = pb * (1 - w) + cb * w;
      };
      if (a > 0) mix(a * 0.8, 60, 90, 255);
      if (r > 0) mix(r * 0.85, 230, 160, 0);
      if (b > 0) mix(b * 0.85, 255, 0, 170);
      // A sheen where no metal is: a varnish.
      if (g > 0 && r === 0) mix(g * 0.7, 0, 170, 230);
    } else {
      const light = sweep(x, y, width, height);
      if (r > 0) {
        // Metal: darker in the troughs, a bright band where the light falls.
        const hi = 255 * light * (0.25 + 0.5 * g) * 0.6;
        pr = pr * (1 - 0.2 * r) + hi * r;
        pg = pg * (1 - 0.2 * r) + hi * r;
        pb = pb * (1 - 0.2 * r) + hi * r * 0.9;
      }
      if (b > 0) {
        const lum = 0.2126 * pr + 0.7152 * pg + 0.0722 * pb;
        pr += (pr - lum) * 0.35 * b + 18 * b;
        pg += (pg - lum) * 0.35 * b + 18 * b;
        pb += (pb - lum) * 0.35 * b + 18 * b;
      }
      if (g > 0 && r === 0) {
        const k = 0.22 * g * light;
        pr += (255 - pr) * k;
        pg += (255 - pg) * k;
        pb += (255 - pb) * k;
      }
    }
    pixels[i] = clamp(pr);
    pixels[i + 1] = clamp(pg);
    pixels[i + 2] = clamp(pb);
  }
}

/** Light the page painted on `canvas` from its finish mask, when it has
 *  one. A canvas that cannot be read back (a cross-origin picture) is left
 *  as it is. */
export function paintFinishPreview(
  ctx: CanvasRenderingContext2D,
  canvas: { width: number; height: number },
  page: VDTPage,
  doc: VDTDocument,
  mode: Exclude<FinishPreviewMode, 'flat'>,
  scale: number,
  trim: boolean,
): void {
  const mask = renderFinishMask(page, doc, { scale, trim });
  if (!mask || mask.width !== canvas.width || mask.height !== canvas.height) return;
  let image: ImageData;
  try {
    image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  } catch {
    return;
  }
  applyFinishPreview(image.data, mask, mode);
  ctx.putImageData(image, 0, 0);
}
