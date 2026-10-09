import { bitmapInfo, type Resource } from 'postext';
import { getBlob } from '../../storage/blobStore';

/** The resolution each bitmap's file states, by file id, for the bitmaps
 *  that do not carry one yet (#631): read from the stored bytes when a book
 *  switches to `layout.bitmapResolution: 'file'`. */
export async function readFileResolutions(resources: readonly Resource[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  await Promise.all(resources.map(async (r) => {
    const b = r.bitmap;
    if (r.kind !== 'bitmap' || !b?.fileId || b.fileResolution !== undefined || out.has(b.fileId)) return;
    try {
      const record = await getBlob(b.fileId);
      const ppi = record ? bitmapInfo(record.bytes)?.resolution?.x : undefined;
      if (ppi) out.set(b.fileId, ppi);
    } catch {
      // Unreadable: the picture keeps its pixels at the page dpi.
    }
  }));
  return out;
}

/** `resources` with the resolutions read in, or null when none changes. */
export function applyFileResolutions(resources: readonly Resource[], found: ReadonlyMap<string, number>): Resource[] | null {
  let changed = false;
  const next = resources.map((r) => {
    const b = r.bitmap;
    const ppi = b && b.fileResolution === undefined ? found.get(b.fileId) : undefined;
    if (!b || ppi === undefined) return r;
    changed = true;
    return { ...r, bitmap: { ...b, fileResolution: ppi } };
  });
  return changed ? next : null;
}
