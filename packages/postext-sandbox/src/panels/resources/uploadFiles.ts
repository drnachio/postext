import type { Resource } from 'postext';
import { putBlob } from '../../storage/blobStore';
import { slugifyFilename, uniqueSlug } from './slugify';

/** Bitmap MIME types we accept for upload. */
const IMAGE_FORMATS: Record<string, 'png' | 'jpeg' | 'webp' | 'gif'> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** Validate that `text` parses as SVG XML with a root `<svg>` element. */
function isValidSvg(text: string): boolean {
  if (typeof DOMParser === 'undefined') return text.includes('<svg');
  try {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    if (doc.getElementsByTagName('parsererror').length > 0) return false;
    return doc.documentElement?.tagName.toLowerCase() === 'svg';
  } catch {
    return false;
  }
}

/** Turn a single dropped/selected file into a stored Resource, or null if the
 *  file is not a supported image/SVG. `existingIds` is mutated so a batch of
 *  files gets distinct ids. */
export async function resourceFromFile(
  file: File,
  typeId: string,
  existingIds: Set<string>,
): Promise<Resource | null> {
  const now = Date.now();
  const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');

  if (isSvg) {
    const text = await file.text();
    if (!isValidSvg(text)) return null;
    const buffer = new TextEncoder().encode(text).buffer;
    const fileId = await putBlob(buffer, 'image/svg+xml');
    const id = uniqueSlug(slugifyFilename(file.name), existingIds, 'svg');
    existingIds.add(id);
    return { id, typeId, kind: 'svg', svg: { fileId }, createdAt: now, updatedAt: now };
  }

  const format = IMAGE_FORMATS[file.type];
  if (format) {
    const buffer = await file.arrayBuffer();
    let width = 0;
    let height = 0;
    try {
      const bitmap = await createImageBitmap(file);
      width = bitmap.width;
      height = bitmap.height;
      bitmap.close();
    } catch {
      // Some animated GIFs can't decode via createImageBitmap; keep zero dims.
    }
    const fileId = await putBlob(buffer, file.type);
    const id = uniqueSlug(slugifyFilename(file.name), existingIds, 'image');
    existingIds.add(id);
    return {
      id,
      typeId,
      kind: 'bitmap',
      bitmap: { fileId, format, width, height },
      createdAt: now,
      updatedAt: now,
    };
  }

  return null;
}

export interface UploadFilesResult {
  /** Resources successfully created from supported files. */
  created: Resource[];
  /** Names of files that were skipped (unsupported type or invalid). */
  skipped: string[];
}

/** Upload many files at once. Supported image/SVG files become Resources; any
 *  other file is reported in `skipped`. Ids are unique across the whole batch
 *  and the existing resource set. */
export async function uploadFiles(
  files: File[],
  typeId: string,
  existingIds: Set<string>,
): Promise<UploadFilesResult> {
  const created: Resource[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    try {
      const resource = await resourceFromFile(file, typeId, existingIds);
      if (resource) created.push(resource);
      else skipped.push(file.name);
    } catch {
      skipped.push(file.name);
    }
  }
  return { created, skipped };
}
