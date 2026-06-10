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
// toggling the setting re-decodes and re-registers the affected SVGs.

import type { Resource } from 'postext';
import { applySingleInkToSvg, registerResourceImage } from 'postext';
import { getBlob, type BlobRecord } from '../storage/blobStore';

/** fileId → variant key of the registered decode (`''` plain, ink hex when
 *  single-ink recolouring was applied). */
const decoded = new Map<string, string>();

/** The blob fileId backing a resource's image payload, if any. */
function imageFileId(r: Resource): string | undefined {
  if (r.kind === 'bitmap') return r.bitmap?.fileId;
  if (r.kind === 'svg') return r.svg?.fileId;
  return undefined;
}

/** Decode a blob into something the canvas backend can `drawImage`. SVGs load
 *  through an `<img>` (scaled to the requested box at draw time, recoloured
 *  first when `inkHex` is set); rasters decode via `createImageBitmap`. */
async function decodeImage(rec: BlobRecord, inkHex: string | null): Promise<CanvasImageSource | null> {
  if (typeof document === 'undefined') return null;
  if (rec.contentType === 'image/svg+xml') {
    let svgText = new TextDecoder().decode(rec.bytes);
    if (inkHex) svgText = applySingleInkToSvg(svgText, inkHex);
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

/** Drop a fileId's decode record so the next `ensureResourceImages` call
 *  re-reads and re-registers it (used when a blob is overwritten in place). */
export function invalidateResourceImage(fileId: string): void {
  decoded.delete(fileId);
}

/** Ensure every image-bearing resource has its decoded image registered,
 *  recolouring SVGs to `inkHex` when set (single-ink diagrams). Returns true
 *  if at least one image was (re)registered, so the caller can trigger a
 *  repaint. Safe to call repeatedly. */
export async function ensureResourceImages(
  resources: Resource[],
  inkHex: string | null = null,
): Promise<boolean> {
  let changed = false;
  for (const r of resources) {
    const fileId = imageFileId(r);
    if (!fileId) continue;
    // Ink only affects SVG decodes; bitmap registrations never go stale.
    const variant = r.kind === 'svg' && inkHex ? inkHex.toLowerCase() : '';
    if (decoded.get(fileId) === variant) continue;
    const rec = await getBlob(fileId).catch(() => null);
    if (!rec) continue;
    const img = await decodeImage(rec, variant || null).catch(() => null);
    if (!img) continue;
    registerResourceImage(fileId, img);
    decoded.set(fileId, variant);
    changed = true;
  }
  return changed;
}
