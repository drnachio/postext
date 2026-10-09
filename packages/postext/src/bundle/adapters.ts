// Feed an opened bundle to the backends: its fonts to the browser (layout
// measures text with them), its pictures to the canvas and HTML backends,
// and its bytes to `postext-pdf`'s `resourceBytes` / `fontProvider`.

import type { PostextConfig, Resource } from '../types';
import type { SvgPictureFontWarning } from '../vdt';
import { registerResourceImage } from '../canvas-backend';
import { resolveColorValue, resolveDiagramStyleConfig } from '../defaults';
import { applySingleInkToSvg } from '../svg/singleInk';
import { chainSvgFontProviders, inlineSvgFontsDetailedSync, type SvgFontProvider, type SvgFontSyncProvider } from '../svg/fonts';
import { registerFontBytes, registeredFontProvider, registeredFontSyncProvider } from '../svg/fontRegistry';
import { decodeSvgImage, prepareSvgMarkup, svgPictureFontWarning } from '../svg/image';
import type { PostextBundle } from './api';
import { mimeForFile } from './manifest';
import { videoMimeType } from '../video/url';
import { evictFontFamilies } from '../measure/font';
import { syncFontSet } from '../fonts/fontSet';
import type { FontFaceSetLike } from '../fonts/faces';

/** The fields of a bundle the adapters read: an opened `PostextBundle`, or
 *  any object with the same shape. */
export type BundleSource = Pick<PostextBundle, 'config' | 'resources' | 'files'> & Partial<Pick<PostextBundle, 'fonts'>>;

function imageFileId(r: Resource): string | undefined {
  if (r.kind === 'bitmap') return r.bitmap?.fileId;
  if (r.kind === 'svg') return r.svg?.fileId;
  // A video is printed as its poster frame (#454).
  if (r.kind === 'video') return r.video?.poster?.fileId;
  return undefined;
}

/** The single-ink colour SVG figures are recoloured to, or null when
 *  `diagramStyle.singleInk` is off. */
export function diagramInkHex(config: PostextConfig): string | null {
  const ds = resolveDiagramStyleConfig(config.diagramStyle);
  if (!ds.singleInk) return null;
  return resolveColorValue(ds.inkColor, config.colorPalette, ds.inkColor).hex;
}

/** Whether an SVG resource's pictures get the document's fonts inlined
 *  (`diagramStyle.inlineFonts`, `svg.inlineFonts`, #630). */
export function svgInlinesFonts(config: PostextConfig, r: Resource): boolean {
  return resolveDiagramStyleConfig(config.diagramStyle).inlineFonts && r.svg?.inlineFonts !== false;
}

/** The bundle's own faces as an SVG font provider (#630): the cut nearest
 *  to the weight asked for, the same style first, as stored (WOFF2 stays
 *  WOFF2: an image takes it). */
export function bundleSvgFontProvider(bundle: Pick<PostextBundle, 'fonts'>): SvgFontSyncProvider {
  return (family, weight, style) => {
    const faces = (bundle.fonts ?? []).filter((f) => f.family.toLowerCase() === family.toLowerCase());
    if (faces.length === 0) return null;
    const sameStyle = faces.filter((f) => f.style === style);
    const pool = sameStyle.length > 0 ? sameStyle : faces;
    const face = pool.reduce((best, f) => (Math.abs(f.weight - weight) < Math.abs(best.weight - weight) ? f : best), pool[0]!);
    return bytesOfFace(face.bytes);
  };
}

/** One `Uint8Array` per stored face, so a face inlined into several SVGs
 *  is base64-encoded once. */
const faceViews = new WeakMap<ArrayBuffer, Uint8Array>();
function bytesOfFace(buffer: ArrayBuffer): Uint8Array {
  let view = faceViews.get(buffer);
  if (!view) {
    view = new Uint8Array(buffer);
    faceViews.set(buffer, view);
  }
  return view;
}

function syncAsAsync(p: SvgFontSyncProvider): SvgFontProvider {
  return async (family, weight, style, request) => {
    const answer = p(family, weight, style, request);
    if (!answer || (Array.isArray(answer) && answer.length === 0)) throw new Error(`No face for "${family}"`);
    return answer;
  };
}

/** What the bundle adapters that inline SVG fonts accept. */
export interface BundleImageOptions {
  /** Told of an SVG family with no face to embed and of the size cap
   *  (`svgFontUnavailable`, `svgFontsTooLarge`). */
  onWarning?: (warning: SvgPictureFontWarning) => void;
  /** Most font bytes embedded in one SVG (default 2 MiB). */
  maxBytes?: number;
}

/** SVG markup of a resource as the screen shows it: recoloured when
 *  single-ink is on, then with the bundle's fonts (and the registered
 *  ones held in memory) inlined. */
function svgMarkupSync(bundle: BundleSource, r: Resource, bytes: Uint8Array, inkHex: string | null, options?: BundleImageOptions): string {
  let text = new TextDecoder().decode(bytes);
  if (inkHex) text = applySingleInkToSvg(text, inkHex);
  if (!svgInlinesFonts(bundle.config, r)) return text;
  const own = bundleSvgFontProvider({ fonts: bundle.fonts ?? [] });
  const registered = registeredFontSyncProvider();
  const fileId = imageFileId(r) ?? '';
  return inlineSvgFontsDetailedSync(text, (family, weight, style, request) => own(family, weight, style, request) ?? registered(family, weight, style, request), {
    ...(options?.maxBytes !== undefined ? { maxBytes: options.maxBytes } : {}),
    ...(options?.onWarning ? { onWarning: (w) => options.onWarning!(svgPictureFontWarning(w, fileId, r.id)) } : {}),
  }).svg;
}

/** A picture's bytes as a Blob, SVGs recoloured when single-ink is on and
 *  their fonts inlined. */
function pictureBlob(bundle: BundleSource, r: Resource, inkHex: string | null, options?: BundleImageOptions): Blob | null {
  const fileId = imageFileId(r);
  const bytes = fileId ? bundle.files.get(fileId) : undefined;
  if (!fileId || !bytes) return null;
  if (r.kind === 'svg') return new Blob([svgMarkupSync(bundle, r, bytes, inkHex, options)], { type: 'image/svg+xml' });
  return new Blob([bytes.slice()], { type: mimeForFile(fileId) });
}

/** Register the bundle's fonts with the browser (`document.fonts` by
 *  default) so layout measures text with them, and drop what was measured
 *  in their families before. Call it — and await it — before
 *  `buildDocument`. Resolves to the faces added. */
export async function loadBundleFonts(
  bundle: Pick<PostextBundle, 'fonts'>,
  fontSet: FontFaceSet | undefined = typeof document !== 'undefined' ? document.fonts : undefined,
): Promise<FontFace[]> {
  // SVG pictures embed the same faces (#630): an image cannot see
  // `document.fonts`, and a FontFace keeps no bytes.
  for (const f of bundle.fonts) registerFontBytes(f.family, f.weight, f.style, bytesOfFace(f.bytes));
  if (!fontSet || typeof FontFace === 'undefined') return [];
  const faces = await Promise.all(bundle.fonts.map(async (f) => {
    const face = new FontFace(f.family, f.bytes, { weight: String(f.weight), style: f.style });
    await face.load();
    return face;
  }));
  // Added in the bundle's order, whatever order they loaded in; then what
  // was measured in these families before they arrived is dropped (#629).
  for (const face of faces) fontSet.add(face);
  if (faces.length > 0) {
    evictFontFamilies(new Set(bundle.fonts.map((f) => f.family)));
    syncFontSet(fontSet as unknown as FontFaceSetLike, { evict: false });
  }
  return faces;
}

/** Decode the bundle's pictures and register them with the canvas backend
 *  (`registerResourceImage`), recolouring SVG figures when the config asks
 *  for single-ink diagrams — with the markup pass, which gives the PDF's
 *  colours exactly, and registered with `singleInk: false`, so the canvas
 *  never tints them again — and embedding in each SVG the faces its text
 *  names (#630): the bundle's own, then those registered with
 *  `registerFontBytes` / `registerFontUrl` or declared by the page's
 *  `@font-face` rules (`diagramStyle.inlineFonts`, `svg.inlineFonts`).
 *  Await it before painting. */
export async function registerBundleImages(bundle: BundleSource, options?: BundleImageOptions): Promise<void> {
  const inkHex = diagramInkHex(bundle.config);
  const fonts = chainSvgFontProviders(syncAsAsync(bundleSvgFontProvider({ fonts: bundle.fonts ?? [] })), registeredFontProvider());
  await Promise.all(bundle.resources.map(async (r) => {
    const fileId = imageFileId(r);
    const bytes = fileId ? bundle.files.get(fileId) : undefined;
    if (!fileId || !bytes) return;
    if (r.kind === 'svg') {
      const prepared = await prepareSvgMarkup(new TextDecoder().decode(bytes), {
        fonts,
        inkHex,
        inlineFonts: svgInlinesFonts(bundle.config, r),
        fileId,
        resourceId: r.id,
        ...(options?.maxBytes !== undefined ? { maxBytes: options.maxBytes } : {}),
        ...(options?.onWarning ? { onWarning: options.onWarning } : {}),
      });
      const img = await decodeSvgImage(prepared.svg).catch(() => {
        throw new Error(`Could not decode ${fileId}`);
      });
      // Recoloured above already: the canvas must not tint it again.
      registerResourceImage(fileId, img, { vector: true, singleInk: false });
    } else {
      const blob = pictureBlob(bundle, r, inkHex);
      if (blob) registerResourceImage(fileId, await createImageBitmap(blob), { singleInk: false });
    }
  }));
}

/** A `resourceImageUrl` resolver for `renderToHtml`: object URLs over the
 *  bundle's pictures, built once. `revoke()` frees them. Its SVGs are
 *  recoloured for single ink already, which `singleInk: false` tells
 *  `renderToHtml` (so it adds no filter of its own), and carry the faces
 *  their text names (#630): the bundle's own, and registered faces held in
 *  memory (`registerFontBytes`). */
export function bundleImageUrl(bundle: BundleSource, options?: BundleImageOptions): ((fileId: string) => string | undefined) & { revoke: () => void; singleInk: false } {
  const inkHex = diagramInkHex(bundle.config);
  const urls = new Map<string, string>();
  for (const r of bundle.resources) {
    const fileId = imageFileId(r);
    const blob = fileId && !urls.has(fileId) ? pictureBlob(bundle, r, inkHex, options) : null;
    if (fileId && blob && !urls.has(fileId)) urls.set(fileId, URL.createObjectURL(blob));
  }
  const resolve = (fileId: string): string | undefined => urls.get(fileId);
  return Object.assign(resolve, {
    singleInk: false as const,
    revoke: () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    },
  });
}

/** A `resourceVideoUrl` resolver for `renderToHtml` (#454): object URLs
 *  over the bundle's self-hosted videos, built once. `revoke()` frees
 *  them. */
export function bundleVideoUrl(bundle: BundleSource): ((fileId: string) => string | undefined) & { revoke: () => void } {
  const urls = new Map<string, string>();
  for (const r of bundle.resources) {
    const fileId = r.kind === 'video' ? r.video?.fileId : undefined;
    const bytes = fileId ? bundle.files.get(fileId) : undefined;
    if (fileId && bytes && !urls.has(fileId)) {
      urls.set(fileId, URL.createObjectURL(new Blob([bytes.slice()], { type: videoMimeType(r.video?.format) })));
    }
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
 *  one — unless single-ink is on, which recolours SVG markup only. The
 *  bytes are the bundle's own: the PDF backend recolours them once (it
 *  leaves markup `applySingleInkToSvg` marked as it is). */
export function bundleResourceBytes(bundle: BundleSource): (fileId: string) => Uint8Array | undefined {
  const singleInk = diagramInkHex(bundle.config) !== null;
  const bytes = new Map<string, Uint8Array>();
  for (const r of bundle.resources) {
    if (r.kind === 'bitmap' && r.bitmap?.fileId) {
      const data = bundle.files.get(r.bitmap.fileId);
      if (data) bytes.set(r.bitmap.fileId, data);
    } else if (r.kind === 'video' && r.video?.poster?.fileId) {
      const data = bundle.files.get(r.video.poster.fileId);
      if (data) bytes.set(r.video.poster.fileId, data);
    } else if (r.kind === 'svg' && r.svg?.fileId) {
      const master = r.svg.pdfFileId && !singleInk ? bundle.files.get(r.svg.pdfFileId) : undefined;
      const data = master ?? bundle.files.get(r.svg.fileId);
      if (data) bytes.set(r.svg.fileId, data);
    }
  }
  return (fileId) => bytes.get(fileId);
}

/** What `postext-pdf` tells a font provider about a face: the characters
 *  the pages set in it (its `PdfFontRequest`). */
export interface BundleFontRequest {
  codePoints: ReadonlySet<number>;
}

export interface BundleFontProviderOptions<Fallback extends Uint8Array | Uint8Array[] = Uint8Array> {
  /** Turns WOFF2 into the TrueType/OpenType bytes a PDF embeds — pass
   *  `decompressWoff2` from `postext-pdf`. Required when the bundle carries
   *  `.woff2` faces. */
  decodeWoff2?: (bytes: Uint8Array) => Promise<Uint8Array> | Uint8Array;
  /** Where a family the bundle does not carry comes from (Google Fonts
   *  families such as the default heading face). It is handed the
   *  renderer's `request` and may answer with several files, like any
   *  `postext-pdf` font provider: a Chinese family served as Fontsource's
   *  unicode-range slices needs the files that hold the text's characters. */
  fallback?: (family: string, weight: number, style: 'normal' | 'italic', request?: BundleFontRequest) => Promise<Fallback>;
}

/** A `fontProvider` for `postext-pdf`'s `renderToPdf`: the bundle's own
 *  faces (nearest weight, same style first), else `fallback`, which gets
 *  the renderer's `request` (see {@link BundleFontProviderOptions}). */
export function bundleFontProvider<Fallback extends Uint8Array | Uint8Array[] = Uint8Array>(
  bundle: Pick<PostextBundle, 'fonts'>,
  options: BundleFontProviderOptions<Fallback> = {},
): (family: string, weight: number, style: 'normal' | 'italic', request?: BundleFontRequest) => Promise<Uint8Array | Fallback> {
  return async (family, weight, style, request) => {
    const faces = bundle.fonts.filter((f) => f.family.toLowerCase() === family.toLowerCase());
    if (faces.length === 0) {
      if (options.fallback) return options.fallback(family, weight, style, request);
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
