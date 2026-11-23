import { bitmapInfo, decodePrintRaster, printRasterFormat, rasterToRgba, scoreFormatOfFile, type Resource } from 'postext';
import { putBlob } from '../../../storage/blobStore.js';
import { slugifyFilename, uniqueSlug } from '../slugify.js';
import { isValidSvg, svgIntrinsicSize } from '../svg/svgIntrinsic.js';
import { defaultPoster, readVideoMetadata, videoFormatOf } from '../video/videoMedia.js';
import { fitScale, MAX_PRINT_FILE_BYTES, readPdfPages, sniffPrintFile } from '../print/printFiles.js';
import { downscaleRgba } from '../print/downscale.js';

/** Bitmap MIME types we accept for upload. */
const IMAGE_FORMATS: Record<string, 'png' | 'jpeg' | 'webp' | 'gif'> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** The media type a print original is stored under. */
const PRINT_MIME = { tiff: 'image/tiff', psd: 'image/vnd.adobe.photoshop' } as const;

/** One file as one stored Resource (a PDF's first page), or null if the
 *  file is not a supported picture. `existingIds` is mutated. */
export async function resourceFromFile(
  file: File,
  typeId: string,
  existingIds: Set<string>,
  videoTypeId?: () => string,
  exampleTypeId?: () => string,
): Promise<Resource | null> {
  const out = await resourcesFromFile(file, typeId, existingIds, videoTypeId, exampleTypeId);
  if (out === 'postscript') return null;
  return Array.isArray(out) ? out[0] ?? null : out;
}

/** Turn a single dropped/selected file into stored Resources: one, or one
 *  per page of a PDF; `'postscript'` for an EPS a browser cannot read;
 *  null if the file is not a supported picture. `existingIds` is mutated so
 *  a batch of files gets distinct ids. */
export async function resourcesFromFile(
  file: File,
  typeId: string,
  existingIds: Set<string>,
  /** The type of a video (#454), asked for only when one is dropped. */
  videoTypeId: () => string = () => 'video',
  /** The type of a music example (#1172), asked for only when a notation
   *  file is dropped. */
  exampleTypeId: () => string = () => 'example',
): Promise<Resource | Resource[] | 'postscript' | null> {
  const now = Date.now();
  const scoreFormat = scoreFormatOfFile(file.name);
  if (scoreFormat) {
    // A notation file (.abc, .musicxml, .mei, .krn): its text is the score.
    const id = uniqueSlug(slugifyFilename(file.name), existingIds, 'score');
    existingIds.add(id);
    return { id, typeId: exampleTypeId(), kind: 'score', score: { format: scoreFormat, source: await file.text() }, createdAt: now, updatedAt: now };
  }
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

  // A print file: past its limit, it is not read at all.
  if (file.size > MAX_PRINT_FILE_BYTES) return null;
  const buffer = await file.arrayBuffer();

  // A PDF, or an Illustrator file saved PDF-compatible: a picture per page.
  // An EPS (or an Illustrator file without its PDF) is told apart.
  const printKind = sniffPrintFile(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 1024)));
  if (printKind === 'postscript') return 'postscript';
  if (printKind === 'pdf') {
    const pages = await readPdfPages(new Uint8Array(buffer));
    const base = slugifyFilename(file.name);
    const out: Resource[] = [];
    for (const p of pages) {
      const fileId = await putBlob(p.png, 'image/png');
      const id = uniqueSlug(p.pages > 1 ? `${base}-${p.page}` : base, existingIds, 'image');
      existingIds.add(id);
      out.push({ id, typeId, kind: 'bitmap', bitmap: { fileId, format: 'png', width: p.width, height: p.height, fileResolution: 300 }, createdAt: now, updatedAt: now });
    }
    return out.length > 0 ? out : null;
  }

  // A TIFF or Photoshop original, known by its bytes (browsers give a PSD
  // an empty or odd type): kept as it is for print, with an sRGB PNG
  // preview for screens. One that does not decode is skipped.
  const printFormat = printRasterFormat(new Uint8Array(buffer));
  if (printFormat) {
    let raster;
    try {
      raster = decodePrintRaster(new Uint8Array(buffer));
    } catch {
      return null;
    }
    // The preview within what a canvas draws; the original keeps every pixel.
    const k = fitScale(raster.width, raster.height);
    const small = k < 1 ? downscaleRgba(rasterToRgba(raster), raster.width, raster.height, k) : { rgba: rasterToRgba(raster), width: raster.width, height: raster.height };
    const preview = await pngPreview(small.rgba, small.width, small.height);
    const fileId = await putBlob(preview, 'image/png');
    const printFileId = await putBlob(buffer, PRINT_MIME[printFormat]);
    const id = uniqueSlug(slugifyFilename(file.name), existingIds, 'image');
    existingIds.add(id);
    return {
      id,
      typeId,
      kind: 'bitmap',
      bitmap: {
        fileId, format: 'png', width: raster.width, height: raster.height,
        ...(raster.resolution ? { fileResolution: raster.resolution } : {}),
        printFileId, printFormat,
      },
      createdAt: now,
      updatedAt: now,
    };
  }

  return null;
}

/** RGBA pixels as PNG bytes, through an OffscreenCanvas where there is one. */
async function pngPreview(rgba: Uint8ClampedArray, width: number, height: number): Promise<ArrayBuffer> {
  const image = new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, width, height);
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    canvas.getContext('2d')!.putImageData(image, 0, 0);
    return (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer();
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.putImageData(image, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG preview failed');
  return blob.arrayBuffer();
}

export interface UploadFilesResult {
  /** Resources successfully created from supported files. */
  created: Resource[];
  /** Names of files that were skipped (unsupported type or invalid). */
  skipped: string[];
  /** Of those, the PostScript ones (an EPS, an Illustrator file saved
   *  without its PDF), which read once saved as PDF. */
  postscript: string[];
}

/** Upload many files at once. Supported image/SVG files become Resources; any
 *  other file is reported in `skipped`. Ids are unique across the whole batch
 *  and the existing resource set. */
export async function uploadFiles(
  files: File[],
  typeId: string,
  existingIds: Set<string>,
  videoTypeId?: () => string,
  exampleTypeId?: () => string,
): Promise<UploadFilesResult> {
  const created: Resource[] = [];
  const skipped: string[] = [];
  const postscript: string[] = [];
  for (const file of files) {
    try {
      const resource = await resourcesFromFile(file, typeId, existingIds, videoTypeId, exampleTypeId);
      if (resource === 'postscript') {
        skipped.push(file.name);
        postscript.push(file.name);
      } else if (Array.isArray(resource)) created.push(...resource);
      else if (resource) created.push(resource);
      else skipped.push(file.name);
    } catch {
      skipped.push(file.name);
    }
  }
  return { created, skipped, postscript };
}
