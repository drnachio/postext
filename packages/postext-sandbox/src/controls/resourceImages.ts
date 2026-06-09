// Main-thread decode + registration of resource image payloads (issue #49).
//
// The core canvas renderer is synchronous and cannot read IndexedDB, so it
// looks decoded images up in a module-level registry keyed by `fileId`
// (`registerResourceImage`). This helper bridges the gap: it pulls each
// bitmap/SVG blob from the sandbox blob store, decodes it once, and registers
// it. Decoded fileIds are remembered so repeated calls are cheap; the registry
// itself is module-level in `postext`, shared across all viewports.

import type { Resource } from 'postext';
import { registerResourceImage } from 'postext';
import { getBlob, type BlobRecord } from '../storage/blobStore';

const decoded = new Set<string>();

/** The blob fileId backing a resource's image payload, if any. */
function imageFileId(r: Resource): string | undefined {
  if (r.kind === 'bitmap') return r.bitmap?.fileId;
  if (r.kind === 'svg') return r.svg?.fileId;
  return undefined;
}

/** Decode a blob into something the canvas backend can `drawImage`. SVGs load
 *  through an `<img>` (scaled to the requested box at draw time); rasters decode
 *  via `createImageBitmap`. */
async function decodeImage(rec: BlobRecord): Promise<CanvasImageSource | null> {
  if (typeof document === 'undefined') return null;
  if (rec.contentType === 'image/svg+xml') {
    const blob = new Blob([rec.bytes], { type: 'image/svg+xml' });
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

/** Ensure every image-bearing resource has its decoded image registered.
 *  Returns true if at least one new image was registered, so the caller can
 *  trigger a repaint. Safe to call repeatedly. */
export async function ensureResourceImages(resources: Resource[]): Promise<boolean> {
  let changed = false;
  for (const r of resources) {
    const fileId = imageFileId(r);
    if (!fileId || decoded.has(fileId)) continue;
    const rec = await getBlob(fileId).catch(() => null);
    if (!rec) continue;
    const img = await decodeImage(rec).catch(() => null);
    if (!img) continue;
    registerResourceImage(fileId, img);
    decoded.add(fileId);
    changed = true;
  }
  return changed;
}
