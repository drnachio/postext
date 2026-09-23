// Feed an opened bundle to the backends: its fonts to the browser (layout
// measures text with them), its pictures to the canvas and HTML backends,
// and its bytes to `postext-pdf`'s `resourceBytes` / `fontProvider`.

import type { PostextConfig, Resource } from '../types';
import { registerResourceImage } from '../canvas-backend';
import { resolveColorValue, resolveDiagramStyleConfig } from '../defaults';
import { applySingleInkToSvg } from '../svg/singleInk';
import type { PostextBundle } from './api';
import { mimeForFile } from './manifest';

/** The fields of a bundle the adapters read: an opened `PostextBundle`, or
 *  any object with the same shape. */
export type BundleSource = Pick<PostextBundle, 'config' | 'resources' | 'files'> & Partial<Pick<PostextBundle, 'fonts'>>;

function imageFileId(r: Resource): string | undefined {
  if (r.kind === 'bitmap') return r.bitmap?.fileId;
  if (r.kind === 'svg') return r.svg?.fileId;
  return undefined;
}

/** The single-ink colour SVG figures are recoloured to, or null when
 *  `diagramStyle.singleInk` is off. */
export function diagramInkHex(config: PostextConfig): string | null {
  const ds = resolveDiagramStyleConfig(config.diagramStyle);
  if (!ds.singleInk) return null;
  return resolveColorValue(ds.inkColor, config.colorPalette, ds.inkColor).hex;
}

/** A picture's bytes as a Blob, SVGs recoloured when single-ink is on. */
function pictureBlob(bundle: BundleSource, r: Resource, inkHex: string | null): Blob | null {
  const fileId = imageFileId(r);
  const bytes = fileId ? bundle.files.get(fileId) : undefined;
  if (!fileId || !bytes) return null;
  if (r.kind === 'svg') {
    let text = new TextDecoder().decode(bytes);
    if (inkHex) text = applySingleInkToSvg(text, inkHex);
    return new Blob([text], { type: 'image/svg+xml' });
  }
  return new Blob([bytes.slice()], { type: mimeForFile(fileId) });
}

/** Register the bundle's fonts with the browser (`document.fonts` by
 *  default) so layout measures text with them. Call it — and await it —
 *  before `buildDocument`. Resolves to the faces added. */
export async function loadBundleFonts(
  bundle: Pick<PostextBundle, 'fonts'>,
  fontSet: FontFaceSet | undefined = typeof document !== 'undefined' ? document.fonts : undefined,
): Promise<FontFace[]> {
  if (!fontSet || typeof FontFace === 'undefined') return [];
  return Promise.all(bundle.fonts.map(async (f) => {
    const face = new FontFace(f.family, f.bytes, { weight: String(f.weight), style: f.style });
    await face.load();
    fontSet.add(face);
    return face;
  }));
}

/** Decode the bundle's pictures and register them with the canvas backend
 *  (`registerResourceImage`), recolouring SVG figures when the config asks
 *  for single-ink diagrams. Await it before painting. */
export async function registerBundleImages(bundle: BundleSource): Promise<void> {
  const inkHex = diagramInkHex(bundle.config);
  await Promise.all(bundle.resources.map(async (r) => {
    const fileId = imageFileId(r);
    const blob = pictureBlob(bundle, r, inkHex);
    if (!fileId || !blob) return;
    if (r.kind === 'svg') {
      const url = URL.createObjectURL(blob);
      try {
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error(`Could not decode ${fileId}`));
          img.src = url;
        });
        registerResourceImage(fileId, img, { vector: true });
      } finally {
        URL.revokeObjectURL(url);
      }
    } else {
      registerResourceImage(fileId, await createImageBitmap(blob));
    }
  }));
}

/** A `resourceImageUrl` resolver for `renderToHtml`: object URLs over the
 *  bundle's pictures, built once. `revoke()` frees them. */
export function bundleImageUrl(bundle: BundleSource): ((fileId: string) => string | undefined) & { revoke: () => void } {
  const inkHex = diagramInkHex(bundle.config);
  const urls = new Map<string, string>();
  for (const r of bundle.resources) {
    const fileId = imageFileId(r);
    const blob = pictureBlob(bundle, r, inkHex);
    if (fileId && blob && !urls.has(fileId)) urls.set(fileId, URL.createObjectURL(blob));
  }
  const resolve = (fileId: string): string | undefined => urls.get(fileId);
  return Object.assign(resolve, {
    revoke: () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    },
  });
}

/** A `resourceBytes` resolver for `postext-pdf`'s `renderToPdf`: an SVG
 *  figure resolves to its vector print master (`svg.pdfFileId`) when it has
 *  one — unless single-ink is on, which recolours SVG markup only. */
export function bundleResourceBytes(bundle: BundleSource): (fileId: string) => Uint8Array | undefined {
  const singleInk = diagramInkHex(bundle.config) !== null;
  const bytes = new Map<string, Uint8Array>();
  for (const r of bundle.resources) {
    if (r.kind === 'bitmap' && r.bitmap?.fileId) {
      const data = bundle.files.get(r.bitmap.fileId);
      if (data) bytes.set(r.bitmap.fileId, data);
    } else if (r.kind === 'svg' && r.svg?.fileId) {
      const master = r.svg.pdfFileId && !singleInk ? bundle.files.get(r.svg.pdfFileId) : undefined;
      const data = master ?? bundle.files.get(r.svg.fileId);
      if (data) bytes.set(r.svg.fileId, data);
    }
  }
  return (fileId) => bytes.get(fileId);
}

export interface BundleFontProviderOptions {
  /** Turns WOFF2 into the TrueType/OpenType bytes a PDF embeds — pass
   *  `decompressWoff2` from `postext-pdf`. Required when the bundle carries
   *  `.woff2` faces. */
  decodeWoff2?: (bytes: Uint8Array) => Promise<Uint8Array> | Uint8Array;
  /** Where a family the bundle does not carry comes from (Google Fonts
   *  families such as the default heading face). */
  fallback?: (family: string, weight: number, style: 'normal' | 'italic') => Promise<Uint8Array>;
}

/** A `fontProvider` for `postext-pdf`'s `renderToPdf`: the bundle's own
 *  faces (nearest weight, same style first), else `fallback`. */
export function bundleFontProvider(
  bundle: Pick<PostextBundle, 'fonts'>,
  options: BundleFontProviderOptions = {},
): (family: string, weight: number, style: 'normal' | 'italic') => Promise<Uint8Array> {
  return async (family, weight, style) => {
    const faces = bundle.fonts.filter((f) => f.family.toLowerCase() === family.toLowerCase());
    if (faces.length === 0) {
      if (options.fallback) return options.fallback(family, weight, style);
      throw new Error(`Font family "${family}" is not in the bundle and no fallback was given`);
    }
    const sameStyle = faces.filter((f) => f.style === style);
    const pool = sameStyle.length > 0 ? sameStyle : faces;
    const face = pool.reduce((best, f) => (Math.abs(f.weight - weight) < Math.abs(best.weight - weight) ? f : best), pool[0]!);
    const bytes = new Uint8Array(face.bytes);
    if (face.format !== 'woff2') return bytes;
    if (!options.decodeWoff2) throw new Error(`"${face.file}" is WOFF2: pass decodeWoff2 (postext-pdf's decompressWoff2)`);
    return options.decodeWoff2(bytes);
  };
}
