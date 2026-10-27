// Bundle file names: slugs, extensions and MIME / format lookups.
import type { CustomFontFormat, Resource } from '../../types.js';

// ---------------------------------------------------------------------------
// File names

/** Lowercase, hyphen-separated slug: diacritics stripped, letters and
 *  digits of every script kept (`第一回-甄士隐梦幻识通灵`, #181), runs of
 *  anything else collapsed to one hyphen. '' for symbol-only input. */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

/** `candidate`, or `candidate-2`, `-3`, … when `taken` has it; a blank
 *  candidate falls back to `fallback`. */
export function uniqueSlug(candidate: string, taken: Set<string>, fallback = 'resource'): string {
  const base = candidate || fallback;
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** `chapters/01-intro.md`: zero-padded ordinal (at least two digits) plus a
 *  slug of the title, unique against `taken` (which it extends). */
export function chapterFileName(index: number, title: string, taken: Set<string>, count = 1): string {
  const digits = Math.max(2, String(count).length);
  const ordinal = String(index + 1).padStart(digits, '0');
  const name = uniqueSlug(`${ordinal}-${slugify(title) || 'chapter'}`, taken, 'chapter');
  taken.add(name);
  return `chapters/${name}.md`;
}

export function fileExtension(file: string): string {
  const base = file.split('/').pop() ?? file;
  const dot = base.lastIndexOf('.');
  return dot === -1 ? '' : base.slice(dot + 1).toLowerCase();
}

export function fileBasename(file: string): string {
  return file.split('/').pop() ?? file;
}

const MIME_BY_EXT: Record<string, string> = {
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff2: 'font/woff2',
  md: 'text/markdown',
  json: 'application/json',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg',
  mov: 'video/quicktime',
};

/** Media type of a bundle file, from its extension. */
export function mimeForFile(file: string): string {
  return MIME_BY_EXT[fileExtension(file)] ?? 'application/octet-stream';
}

export const BITMAP_FORMAT_BY_EXT: Record<string, string> = {
  png: 'png',
  jpg: 'jpeg',
  jpeg: 'jpeg',
  webp: 'webp',
  gif: 'gif',
};

/** True when `file` is a bitmap the engine can place. */
export function isBitmapFile(file: string): boolean {
  return fileExtension(file) in BITMAP_FORMAT_BY_EXT;
}

export const VIDEO_FORMAT_BY_EXT: Record<string, string> = {
  mp4: 'mp4',
  m4v: 'mp4',
  webm: 'webm',
  ogv: 'ogv',
  mov: 'mov',
};

/** True when `file` is a video a bundle carries (#454). */
export function isVideoFile(file: string): boolean {
  return fileExtension(file) in VIDEO_FORMAT_BY_EXT;
}

/** The bitmap format of a picture file (`png`, `jpeg`…), or undefined. */
export function bitmapFormatOf(file: string): string | undefined {
  return BITMAP_FORMAT_BY_EXT[fileExtension(file)];
}

export function isSvgFile(file: string): boolean {
  return fileExtension(file) === 'svg';
}

export function isPdfFile(file: string): boolean {
  return fileExtension(file) === 'pdf';
}

/** Font format of a file name, or null when it is not a font. */
export function fontFormatFromFile(file: string): CustomFontFormat | null {
  switch (fileExtension(file)) {
    case 'woff2': return 'woff2';
    case 'woff': return 'woff';
    case 'ttf': return 'ttf';
    case 'otf': return 'otf';
    default: return null;
  }
}

const EXT_BY_BITMAP_FORMAT: Record<string, string> = {
  png: 'png',
  jpeg: 'jpg',
  webp: 'webp',
  gif: 'gif',
};

const EXT_BY_IMAGE_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

/** File extension to write an image of this media type under, or null when
 *  it is not a picture a bundle takes (a cover thumbnail). */
export function extensionForImageMime(mime: string): string | null {
  return EXT_BY_IMAGE_MIME[mime.toLowerCase()] ?? null;
}

/** File extension to write a resource's bytes under, or null for resources
 *  without a file (tables). */
export function extensionForResource(r: Resource): string | null {
  if (r.kind === 'svg' && r.svg) return 'svg';
  if (r.kind === 'bitmap' && r.bitmap) return EXT_BY_BITMAP_FORMAT[r.bitmap.format] ?? r.bitmap.format;
  return null;
}

/** File extension of a self-hosted video's file (`mp4`, `webm`…). */
export function extensionForVideo(format: string | undefined): string {
  const f = (format ?? 'mp4').toLowerCase();
  return f in VIDEO_FORMAT_BY_EXT ? f : 'mp4';
}

/** File extension of a bitmap format (`jpeg` → `jpg`). */
export function extensionForBitmapFormat(format: string): string {
  return EXT_BY_BITMAP_FORMAT[format] ?? format;
}
