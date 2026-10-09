// Main-thread decode + registration of resource image payloads (issue #49).
//
// The core canvas renderer is synchronous and cannot read IndexedDB, so it
// looks decoded images up in a module-level registry keyed by `fileId`
// (`registerResourceImage`). This helper bridges the gap: it pulls each
// bitmap/SVG blob from the sandbox blob store, decodes it once, and registers
// it. Decoded fileIds are remembered so repeated calls are cheap; the registry
// itself is module-level in `postext`, shared across all viewports.
//
// SVGs are ink-aware: when the document's diagramStyle requests single-ink
// reproduction, the SVG markup is recoloured (applySingleInkToSvg) before
// decode. The per-file variant key records which ink a decode used, so
// toggling the setting re-decodes and re-registers the affected SVGs. SVG
// text is set in the book's fonts (#630): the engine inlines the faces it
// names as `@font-face` data URIs (`prepareSvgMarkup`) from the Sandbox's
// provider (svgFontProvider.ts: custom fonts, then Google) — an `<img>`
// cannot see the page's fonts. What became of each face is kept for the
// Checks panel and the resource detail.

import type { Resource, SvgFontFaceReport } from 'postext';
import { prepareSvgMarkup, registerResourceImage } from 'postext';
import { getBlob, type BlobRecord } from '../storage/blobStore';
import { dropSvgTextIndex, ensureSvgTextIndex } from './svgTextIndex';
import { sandboxSvgFontProvider, svgFontGeneration } from './svgFontProvider';

/** Build the SVG text-glyph index for a blob (once per fileId) so the
 *  previews can hit-test and highlight the figure's text nodes. Indexed from
 *  the original markup — single-ink recolouring never moves text. */
function indexSvgText(fileId: string, rec: BlobRecord): void {
  if (rec.contentType !== 'image/svg+xml') return;
  try {
    ensureSvgTextIndex(fileId, new TextDecoder().decode(rec.bytes));
  } catch {
    /* the figure stays clickable-less; editing still works from the panel */
  }
}

/** fileId → variant key of the registered decode (see {@link variantOf}:
 *  the ink and the font generation of an SVG, `''` for a bitmap). */
const decoded = new Map<string, string>();

/** File ids whose payload the previews paint as placeholders (the Checks
 *  panel's `missingImage`), for two reasons kept apart so that neither
 *  path clears the other's verdict: a payload missing from the blob store
 *  (both the canvas and the HTML path read the store, and either clears it
 *  once a later read succeeds), and one that is stored but does not decode
 *  (only the canvas path decodes, so only it clears that). The HTML path
 *  hands the browser a URL without decoding it, so a truncated upload must
 *  keep its warning while the HTML tab is shown. */
const missingPayloads = new Set<string>();
const undecodable = new Set<string>();
const unavailable = new Set<string>();
const unavailableListeners = new Set<() => void>();

function setFlag(set: Set<string>, fileId: string, on: boolean): void {
  if (on === set.has(fileId)) return;
  if (on) set.add(fileId);
  else set.delete(fileId);
  const now = missingPayloads.has(fileId) || undecodable.has(fileId);
  if (now === unavailable.has(fileId)) return;
  if (now) unavailable.add(fileId);
  else unavailable.delete(fileId);
  for (const cb of unavailableListeners) cb();
}

/** The file ids of image payloads the previews could not read or decode. */
export function unavailableResourceImages(): ReadonlySet<string> {
  return unavailable;
}

/** Be told when {@link unavailableResourceImages} changes; returns the
 *  unsubscribe function. */
export function onUnavailableResourceImagesChange(cb: () => void): () => void {
  unavailableListeners.add(cb);
  return () => {
    unavailableListeners.delete(cb);
  };
}

/** What became of the faces each SVG picture's text names, by file id,
 *  as its last decode found (#630). */
const fontReports = new Map<string, SvgFontFaceReport[]>();
const fontReportListeners = new Set<() => void>();

function setFontReport(fileId: string, faces: SvgFontFaceReport[]): void {
  const before = fontReports.get(fileId);
  if (before && JSON.stringify(before) === JSON.stringify(faces)) return;
  if (faces.length === 0 && !before) return;
  if (faces.length === 0) fontReports.delete(fileId);
  else fontReports.set(fileId, faces);
  for (const cb of fontReportListeners) cb();
}

/** The faces an SVG picture's text names and whether each was inlined, as
 *  its last decode found; undefined before any. */
export function svgFontReport(fileId: string): readonly SvgFontFaceReport[] | undefined {
  return fontReports.get(fileId);
}

/** The SVG pictures whose fonts could not all be inlined: a family with
 *  no face (`unavailable`) or faces over the size cap (`tooLarge`). */
export function svgFontIssues(): ReadonlyMap<string, readonly SvgFontFaceReport[]> {
  const out = new Map<string, SvgFontFaceReport[]>();
  for (const [fileId, faces] of fontReports) {
    const issues = faces.filter((f) => f.status === 'unavailable' || f.status === 'tooLarge');
    if (issues.length > 0) out.set(fileId, issues);
  }
  return out;
}

/** Be told when a font report changes; returns the unsubscribe function. */
export function onSvgFontReportsChange(cb: () => void): () => void {
  fontReportListeners.add(cb);
  return () => {
    fontReportListeners.delete(cb);
  };
}

/** How the previews prepare SVG pictures. */
export interface SvgImageOptions {
  /** `diagramStyle.inlineFonts` (default true); a resource's own
   *  `svg.inlineFonts: false` wins. */
  inlineFonts?: boolean;
}

/** Whether a resource's SVG gets the book's fonts inlined. */
function inlinesFonts(r: Resource, options: SvgImageOptions | undefined): boolean {
  return options?.inlineFonts !== false && r.svg?.inlineFonts !== false;
}

/** The variant key of a decode: the ink, and the font generation when the
 *  faces are inlined (a changed custom font makes it again). */
function variantOf(r: Resource, inkHex: string | null, options: SvgImageOptions | undefined): string {
  if (r.kind !== 'svg') return '';
  const ink = inkHex ? inkHex.toLowerCase() : '';
  return `${ink}|${inlinesFonts(r, options) ? `f${svgFontGeneration()}` : 'raw'}`;
}

/** An SVG blob's markup as the previews show it: recoloured to `inkHex`,
 *  then with the book's fonts inlined (recorded in the font report). */
async function svgMarkup(fileId: string, rec: BlobRecord, inkHex: string | null, inlineFonts: boolean): Promise<string> {
  const prepared = await prepareSvgMarkup(new TextDecoder().decode(rec.bytes), {
    inkHex,
    inlineFonts,
    fonts: sandboxSvgFontProvider(),
    fileId,
  });
  if (inlineFonts) setFontReport(fileId, prepared.faces);
  else setFontReport(fileId, []);
  return prepared.svg;
}

/** The blob fileId backing a resource's image payload, if any. */
function imageFileId(r: Resource): string | undefined {
  if (r.kind === 'bitmap') return r.bitmap?.fileId;
  if (r.kind === 'svg') return r.svg?.fileId;
  // A video is shown as its poster frame (#454).
  if (r.kind === 'video') return r.video?.poster?.fileId;
  return undefined;
}

/** fileId → object URL of a self-hosted video (#454), for the HTML
 *  viewer's player. */
const videoUrls = new Map<string, string>();

/** The playable URL of a self-hosted video, as last built by
 *  {@link ensureResourceVideoUrls}: the HTML backend's `resourceVideoUrl`. */
export function getResourceVideoUrl(fileId: string): string | undefined {
  return videoUrls.get(fileId);
}

/** Ensure every self-hosted video has an object URL. Returns true when one
 *  was built, so the caller can re-render. */
export async function ensureResourceVideoUrls(resources: Resource[]): Promise<boolean> {
  let changed = false;
  for (const r of resources) {
    const fileId = r.kind === 'video' ? r.video?.fileId : undefined;
    if (!fileId || videoUrls.has(fileId)) continue;
    const rec = await getBlob(fileId).catch(() => null);
    if (!rec) continue;
    videoUrls.set(fileId, URL.createObjectURL(new Blob([rec.bytes], { type: rec.contentType || 'video/mp4' })));
    changed = true;
  }
  return changed;
}

/** Decode a blob into something the canvas backend can `drawImage`. SVGs load
 *  through an `<img>` (scaled to the requested box at draw time, recoloured
 *  first when `inkHex` is set, the book's fonts inlined); rasters decode via
 *  `createImageBitmap`. */
async function decodeImage(fileId: string, rec: BlobRecord, inkHex: string | null, inlineFonts: boolean): Promise<CanvasImageSource | null> {
  if (typeof document === 'undefined') return null;
  if (rec.contentType === 'image/svg+xml') {
    const svgText = await svgMarkup(fileId, rec, inkHex, inlineFonts);
    const blob = new Blob([svgText], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('SVG decode failed'));
        img.src = url;
      });
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const blob = new Blob([rec.bytes], { type: rec.contentType });
  return createImageBitmap(blob);
}

/** fileId → object URL handed to the HTML backend, with the variant it was
 *  built for. Kept separate from the canvas registry: the HTML viewer needs a
 *  URL (an `<img src>`), not a decoded CanvasImageSource. */
const urls = new Map<string, { variant: string; url: string }>();

/** Drop a fileId's decode record so the next `ensureResourceImages` call
 *  re-reads and re-registers it (used when a blob is overwritten in place). */
export function invalidateResourceImage(fileId: string): void {
  decoded.delete(fileId);
  // The decode verdict was about the bytes being replaced; the next canvas
  // decode gives the new one.
  setFlag(undecodable, fileId, false);
  setFontReport(fileId, []);
  dropSvgTextIndex(fileId);
  const entry = urls.get(fileId);
  if (entry) {
    URL.revokeObjectURL(entry.url);
    urls.delete(fileId);
  }
}

/** The displayable URL for a resource image, as last built by
 *  {@link ensureResourceImageUrls}. Passed to the HTML backend's
 *  `resourceImageUrl` option. */
export function getResourceImageUrl(fileId: string): string | undefined {
  return urls.get(fileId)?.url;
}

/** Ensure every image-bearing resource has an object URL, recolouring SVGs to
 *  `inkHex` when set (single-ink diagrams). Returns true if any URL was
 *  (re)built so the caller can re-render. Safe to call repeatedly. */
export async function ensureResourceImageUrls(
  resources: Resource[],
  inkHex: string | null = null,
  options?: SvgImageOptions,
): Promise<boolean> {
  let changed = false;
  for (const r of resources) {
    const fileId = imageFileId(r);
    if (!fileId) continue;
    const variant = variantOf(r, inkHex, options);
    const existing = urls.get(fileId);
    if (existing && existing.variant === variant) continue;
    const rec = await getBlob(fileId).catch(() => null);
    // Only whether the payload is stored: this path does not decode it, so
    // it leaves the canvas's decode verdict alone.
    setFlag(missingPayloads, fileId, !rec);
    if (!rec) continue;
    indexSvgText(fileId, rec);
    let blob: Blob;
    if (rec.contentType === 'image/svg+xml') {
      const svgText = await svgMarkup(fileId, rec, r.kind === 'svg' ? inkHex : null, inlinesFonts(r, options));
      blob = new Blob([svgText], { type: 'image/svg+xml' });
    } else {
      blob = new Blob([rec.bytes], { type: rec.contentType });
    }
    if (existing) URL.revokeObjectURL(existing.url);
    urls.set(fileId, { variant, url: URL.createObjectURL(blob) });
    changed = true;
  }
  return changed;
}

/** Ensure every image-bearing resource has its decoded image registered,
 *  recolouring SVGs to `inkHex` when set (single-ink diagrams). Returns true
 *  if at least one image was (re)registered, so the caller can trigger a
 *  repaint. Safe to call repeatedly. */
export async function ensureResourceImages(
  resources: Resource[],
  inkHex: string | null = null,
  options?: SvgImageOptions,
): Promise<boolean> {
  let changed = false;
  for (const r of resources) {
    const fileId = imageFileId(r);
    if (!fileId) continue;
    // Ink and fonts only affect SVG decodes; bitmap registrations never go
    // stale.
    const variant = variantOf(r, inkHex, options);
    if (decoded.get(fileId) === variant) continue;
    const rec = await getBlob(fileId).catch(() => null);
    setFlag(missingPayloads, fileId, !rec);
    if (!rec) continue;
    indexSvgText(fileId, rec);
    const img = await decodeImage(fileId, rec, r.kind === 'svg' ? inkHex : null, inlinesFonts(r, options)).catch(() => null);
    setFlag(undecodable, fileId, !img);
    if (!img) continue;
    // SVGs go in as vector sources: the canvas backend rasterises them once
    // per placed size instead of on every draw.
    // Recoloured here already (`variant`): the canvas must not tint it again.
    registerResourceImage(fileId, img, { vector: rec.contentType === 'image/svg+xml', singleInk: false });
    decoded.set(fileId, variant);
    changed = true;
  }
  return changed;
}
