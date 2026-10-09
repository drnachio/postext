// SVG pictures ready for an image: recoloured for single ink, then their
// fonts inlined (#630), then decoded and registered for the canvas.

import { registerResourceImage } from '../canvas-backend/renderResourceBlock';
import type { SvgPictureFontWarning } from '../vdt';
import { applySingleInkToSvg } from './singleInk';
import { inlineSvgFontsDetailed, type InlineSvgFontsOptions, type SvgFontInlining, type SvgFontProvider, type SvgFontWarning } from './fonts';
import { registeredFontProvider } from './fontRegistry';

export interface PrepareSvgOptions extends Omit<InlineSvgFontsOptions, 'onWarning'> {
  /** Where the faces come from. Default {@link registeredFontProvider}
   *  (what `loadBundleFonts` and `registerFontBytes` registered, then the
   *  page's `@font-face` rules). */
  fonts?: SvgFontProvider;
  /** Embed the faces at all. Default true; false leaves the markup as it
   *  is (`resources[].svg.inlineFonts: false`,
   *  `diagramStyle.inlineFonts: false`). */
  inlineFonts?: boolean;
  /** Recolour to this ink first (`diagramStyle.singleInk`), with
   *  `applySingleInkToSvg`. */
  inkHex?: string | null;
  /** The picture's ids, carried by the warnings. */
  fileId?: string;
  resourceId?: string;
  /** Told of a family with no face and of the size cap. */
  onWarning?: (warning: SvgPictureFontWarning) => void;
}

/** Turn an inliner warning into the one a host reports. */
export function svgPictureFontWarning(w: SvgFontWarning, fileId: string, resourceId?: string): SvgPictureFontWarning {
  const ids = { fileId, ...(resourceId !== undefined ? { resourceId } : {}) };
  return w.kind === 'svgFontUnavailable'
    ? { kind: 'svgFontUnavailable', ...ids, family: w.family, weight: w.weight, style: w.style }
    : { kind: 'svgFontsTooLarge', ...ids, bytes: w.bytes, maxBytes: w.maxBytes };
}

/** SVG markup as an image should get it: recoloured to `inkHex` when
 *  given, then with the faces its text names inlined (unless
 *  `inlineFonts` is false). Never store the result: it carries font
 *  files. */
export async function prepareSvgMarkup(svgText: string, options?: PrepareSvgOptions): Promise<SvgFontInlining> {
  let svg = svgText;
  if (options?.inkHex) svg = applySingleInkToSvg(svg, options.inkHex);
  if (options?.inlineFonts === false) return { svg, faces: [], bytes: 0 };
  const fileId = options?.fileId ?? '';
  return inlineSvgFontsDetailed(svg, options?.fonts ?? registeredFontProvider(), {
    ...options,
    onWarning: options?.onWarning ? (w) => options.onWarning!(svgPictureFontWarning(w, fileId, options.resourceId)) : undefined,
  });
}

/** Decode SVG markup into an `<img>`. Browser only. */
export async function decodeSvgImage(svgText: string): Promise<HTMLImageElement> {
  const img = new Image();
  const objectUrl = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
    ? URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }))
    : null;
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('SVG decode failed'));
      img.src = objectUrl ?? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
    });
    return img;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

export type RegisterSvgImageOptions = Omit<PrepareSvgOptions, 'fileId'>;

/**
 * Prepare SVG markup ({@link prepareSvgMarkup}: single ink, then the
 * document's fonts inlined), decode it and register it with the canvas
 * backend as a vector source. A picture recoloured here is registered
 * with `singleInk: false`, so the canvas never tints it again. Resolves
 * to what became of each face. Browser only.
 *
 * ```ts
 * await loadBundleFonts(bundle);            // or registerFontBytes(…)
 * await registerSvgImage('chart.svg', svgText);
 * ```
 */
export async function registerSvgImage(fileId: string, svgText: string, options?: RegisterSvgImageOptions): Promise<SvgFontInlining> {
  const prepared = await prepareSvgMarkup(svgText, { ...options, fileId });
  const img = await decodeSvgImage(prepared.svg);
  registerResourceImage(fileId, img, { vector: true, ...(options?.inkHex ? { singleInk: false } : {}) });
  return prepared;
}
