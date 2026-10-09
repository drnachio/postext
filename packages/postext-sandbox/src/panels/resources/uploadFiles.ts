import { bitmapInfo, type Resource } from 'postext';
import { putBlob } from '../../storage/blobStore';
import { slugifyFilename, uniqueSlug } from './slugify';
import { isValidSvg, svgIntrinsicSize } from './svgIntrinsic';
import { defaultPoster, readVideoMetadata, videoFormatOf } from './videoMedia';

/** Bitmap MIME types we accept for upload. */
const IMAGE_FORMATS: Record<string, 'png' | 'jpeg' | 'webp' | 'gif'> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** Turn a single dropped/selected file into a stored Resource, or null if the
 *  file is not a supported image/SVG. `existingIds` is mutated so a batch of
 *  files gets distinct ids. */
export async function resourceFromFile(
  file: File,
  typeId: string,
  existingIds: Set<string>,
  /** The type of a video (#454), asked for only when one is dropped. */
  videoTypeId: () => string = () => 'video',
): Promise<Resource | null> {
  const now = Date.now();
  const videoFormat = videoFormatOf(file);
  if (videoFormat) {
    // A self-hosted video: its frame size, length and a first poster.
    const local = URL.createObjectURL(file);
    try {
      const meta = await readVideoMetadata(local);
      const fileId = await putBlob(await file.arrayBuffer(), file.type || `video/${videoFormat}`);
      const first = await defaultPoster(local);
      const id = uniqueSlug(slugifyFilename(file.name), existingIds, 'video');
      existingIds.add(id);
      return {
        id,
        typeId: videoTypeId(),
        kind: 'video',
        video: {
          source: 'file',
          fileId,
          format: videoFormat,
          ...(meta.width && meta.height ? { width: meta.width, height: meta.height } : {}),
          ...(meta.duration ? { duration: meta.duration } : {}),
          ...(first ? { poster: first.poster, posterTime: first.time } : {}),
        },
        createdAt: now,
        updatedAt: now,
      };
    } finally {
      URL.revokeObjectURL(local);
    }
  }
  const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');

  if (isSvg) {
    const text = await file.text();
    if (!isValidSvg(text)) return null;
    const buffer = new TextEncoder().encode(text).buffer;
    const fileId = await putBlob(buffer, 'image/svg+xml');
    const id = uniqueSlug(slugifyFilename(file.name), existingIds, 'svg');
    existingIds.add(id);
    const size = svgIntrinsicSize(text);
    return { id, typeId, kind: 'svg', svg: { fileId, ...size }, createdAt: now, updatedAt: now };
  }

  const format = IMAGE_FORMATS[file.type];
  if (format) {
    const buffer = await file.arrayBuffer();
    // The header: the pixels, and the resolution the file states (#631).
    const info = bitmapInfo(buffer);
    let width = info?.width ?? 0;
    let height = info?.height ?? 0;
    try {
      const bitmap = await createImageBitmap(file);
      width = bitmap.width;
      height = bitmap.height;
      bitmap.close();
    } catch {
      // Some animated GIFs can't decode via createImageBitmap; the header's
      // size (or zero) stands.
    }
    const fileId = await putBlob(buffer, file.type);
    const id = uniqueSlug(slugifyFilename(file.name), existingIds, 'image');
    existingIds.add(id);
    return {
      id,
      typeId,
      kind: 'bitmap',
      bitmap: { fileId, format, width, height, ...(info?.resolution ? { fileResolution: info.resolution.x } : {}) },
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
  videoTypeId?: () => string,
): Promise<UploadFilesResult> {
  const created: Resource[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    try {
      const resource = await resourceFromFile(file, typeId, existingIds, videoTypeId);
      if (resource) created.push(resource);
      else skipped.push(file.name);
    } catch {
      skipped.push(file.name);
    }
  }
  return { created, skipped };
}
