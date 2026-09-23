// Pure helpers for bundle manifests: validation, locale resolution, file
// naming, and conversion of manifest entries into engine resources and
// custom fonts. No DOM or storage access.

import type { CustomFontFamily, CustomFontFormat, Resource } from '../types';
import type {
  BundleChapterSpec,
  BundleFontFamilySpec,
  BundleImageSize,
  BundleLocaleOverrides,
  BundleManifest,
  BundleManifestV1,
  BundleResourceSpec,
  BundleViewSpec,
} from './types';

// ---------------------------------------------------------------------------
// Validation

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function isOptionalString(v: unknown): boolean {
  return v === undefined || typeof v === 'string';
}

function isOptionalStringList(v: unknown): boolean {
  return v === undefined || (Array.isArray(v) && v.every(isNonEmptyString));
}

/** The optional showcase fields: wrong types reject the manifest rather
 *  than being silently dropped. */
export function hasValidShowcaseMeta(v: Record<string, unknown>): boolean {
  return isOptionalStringList(v.locales)
    && isOptionalString(v.thumbnail)
    && isOptionalString(v.license)
    && isOptionalString(v.credits)
    && isOptionalStringList(v.tags);
}

function isMarkdownField(v: unknown): v is string | Record<string, string> {
  if (isNonEmptyString(v)) return true;
  if (!isRecord(v)) return false;
  const values = Object.values(v);
  return values.length > 0 && values.every(isNonEmptyString);
}

function isChapterSpec(v: unknown): v is BundleChapterSpec {
  return isRecord(v) && typeof v.title === 'string' && isNonEmptyString(v.file);
}

function isChapterList(v: unknown): v is BundleChapterSpec[] {
  return Array.isArray(v) && v.length > 0 && v.every(isChapterSpec);
}

function isChaptersField(v: unknown): v is BundleChapterSpec[] | Record<string, BundleChapterSpec[]> {
  if (isChapterList(v)) return true;
  if (!isRecord(v)) return false;
  const values = Object.values(v);
  return values.length > 0 && values.every(isChapterList);
}

function isLocaleOverrides(v: unknown): v is BundleLocaleOverrides {
  if (!isRecord(v)) return false;
  if (v.config !== undefined && !isRecord(v.config)) return false;
  if (v.resources !== undefined) {
    if (!Array.isArray(v.resources)) return false;
    if (!v.resources.every((r) => isRecord(r) && isNonEmptyString(r.id))) return false;
  }
  return true;
}

function isViewField(v: unknown): v is BundleViewSpec {
  if (!isRecord(v)) return false;
  return v.canvasScope === undefined || v.canvasScope === 'book' || v.canvasScope === 'chapter';
}

function isLocalizedField(v: unknown): v is Record<string, BundleLocaleOverrides> {
  return isRecord(v) && Object.values(v).every(isLocaleOverrides);
}

/** True when `data` is a valid `preset.json`, version 1 (`markdown`) or 2
 *  (`chapters`). */
export function isBundleManifest(data: unknown): data is BundleManifest {
  if (!isRecord(data)) return false;
  if (data.version !== 1 && data.version !== 2) return false;
  if (!isNonEmptyString(data.id) || !isNonEmptyString(data.name)) return false;
  if (data.version === 1 && !isMarkdownField(data.markdown)) return false;
  if (data.version === 2 && !isChaptersField(data.chapters)) return false;
  if (!hasValidShowcaseMeta(data)) return false;
  if (data.view !== undefined && !isViewField(data.view)) return false;
  if (data.localized !== undefined && !isLocalizedField(data.localized)) return false;
  if (data.config !== undefined && !isRecord(data.config)) return false;
  if (data.resources !== undefined) {
    if (!Array.isArray(data.resources)) return false;
    if (!data.resources.every((r) => isRecord(r) && isNonEmptyString(r.id) && isNonEmptyString(r.typeId))) return false;
  }
  if (data.fonts !== undefined) {
    if (!Array.isArray(data.fonts)) return false;
    const ok = data.fonts.every((f) =>
      isRecord(f) && isNonEmptyString(f.name) && Array.isArray(f.variants)
      && f.variants.every((v) => isRecord(v) && typeof v.weight === 'number' && isNonEmptyString(v.file)),
    );
    if (!ok) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Locale resolution

/** The key of a locale → value map that serves `locale`: exact tag, base
 *  language, the manifest's own locale, then the first key. */
function pickLocaleKey(keys: string[], locale: string, manifestLocale?: string): string {
  const wanted = locale.toLowerCase();
  const byLower = new Map(keys.map((k) => [k.toLowerCase(), k]));
  const exact = byLower.get(wanted);
  if (exact) return exact;
  const base = wanted.split(/[-_]/)[0]!;
  const baseKey = byLower.get(base);
  if (baseKey) return baseKey;
  if (manifestLocale) {
    const own = byLower.get(manifestLocale.toLowerCase())
      ?? byLower.get(manifestLocale.toLowerCase().split(/[-_]/)[0]!);
    if (own) return own;
  }
  return keys[0]!;
}

function pickByLocale<T>(map: Record<string, T>, locale: string, manifestLocale?: string): T {
  return map[pickLocaleKey(Object.keys(map), locale, manifestLocale)]!;
}

/** Which markdown file a version 1 manifest serves for `locale`. */
export function pickMarkdownFile(manifest: BundleManifestV1, locale: string): string {
  const md = manifest.markdown;
  if (typeof md === 'string') return md;
  return pickByLocale(md, locale, manifest.locale);
}

/** The per-locale overrides that apply to `locale`, or null when the
 *  manifest has none. A bundle whose chapters are a locale map applies the
 *  overrides of the locale its chapters were picked from, so text and
 *  wording never disagree. */
export function pickLocaleOverrides(manifest: BundleManifest, locale: string): BundleLocaleOverrides | null {
  const localized = manifest.localized;
  if (!localized || Object.keys(localized).length === 0) return null;
  const chapterMap = manifest.version === 2 && !Array.isArray(manifest.chapters) ? manifest.chapters
    : manifest.version === 1 && typeof manifest.markdown !== 'string' ? manifest.markdown
      : null;
  const key = chapterMap
    ? pickLocaleKey(Object.keys(chapterMap), locale, manifest.locale)
    : pickLocaleKey(Object.keys(localized), locale, manifest.locale);
  // Only that locale's own overrides (exact tag or base language) apply: a
  // locale without any keeps the shared wording.
  const wanted = key.toLowerCase();
  const base = wanted.split(/[-_]/)[0]!;
  const keys = Object.keys(localized);
  const found = keys.find((k) => k.toLowerCase() === wanted)
    ?? keys.find((k) => k.toLowerCase().split(/[-_]/)[0] === base);
  return found ? localized[found]! : null;
}

/** The locale a bundle actually serves for `locale`: the key of its
 *  chapter map when the content is a locale map, else the manifest's own
 *  locale, else `locale` itself. */
export function resolveBundleLocale(manifest: BundleManifest, locale: string): string {
  const map = manifest.version === 2
    ? (Array.isArray(manifest.chapters) ? null : manifest.chapters)
    : (typeof manifest.markdown === 'string' ? null : manifest.markdown);
  if (map) return pickLocaleKey(Object.keys(map), locale, manifest.locale);
  return manifest.locale ?? locale;
}

/** The chapter files to read for `locale`: a version 1 manifest yields a
 *  single untitled chapter. */
export function pickChapterSpecs(manifest: BundleManifest, locale: string): BundleChapterSpec[] {
  if (manifest.version === 1) return [{ title: '', file: pickMarkdownFile(manifest, locale) }];
  const ch = manifest.chapters;
  return Array.isArray(ch) ? ch : pickByLocale(ch, locale, manifest.locale);
}

// ---------------------------------------------------------------------------
// File names

/** Lowercase, hyphen-separated slug: diacritics stripped, runs of anything
 *  else collapsed to one hyphen. '' for symbol-only input. */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
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
};

/** Media type of a bundle file, from its extension. */
export function mimeForFile(file: string): string {
  return MIME_BY_EXT[fileExtension(file)] ?? 'application/octet-stream';
}

const BITMAP_FORMAT_BY_EXT: Record<string, string> = {
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

// ---------------------------------------------------------------------------
// Manifest entries → engine objects

export interface BundleFontFiles {
  families: CustomFontFamily[];
  files: { fileId: string; fileName: string; format: CustomFontFormat; file: string; family: string; weight: number; style: 'normal' | 'italic' }[];
  warnings: string[];
}

const identity = (file: string): string => file;

/** Turn manifest font families into `config.customFonts` entries plus the
 *  list of files to read. `.woff` is not supported by the PDF backend and
 *  is skipped with a warning, as is any unrecognised extension. */
export function fontsToCustomFonts(
  fonts: BundleFontFamilySpec[],
  fileIdFor: (file: string) => string = identity,
): BundleFontFiles {
  const families: CustomFontFamily[] = [];
  const files: BundleFontFiles['files'] = [];
  const warnings: string[] = [];
  for (const family of fonts) {
    const variants: CustomFontFamily['variants'] = [];
    for (const v of family.variants) {
      const format = fontFormatFromFile(v.file);
      if (!format || format === 'woff') {
        warnings.push(`${family.name}: unsupported font file "${v.file}"`);
        continue;
      }
      const fileId = fileIdFor(v.file);
      const fileName = fileBasename(v.file);
      const style = v.style === 'italic' ? 'italic' : 'normal';
      variants.push({ weight: v.weight, style, fileId, format, fileName });
      files.push({ fileId, fileName, format, file: v.file, family: family.name, weight: v.weight, style });
    }
    if (variants.length > 0) {
      families.push({ name: family.name, variants, ...(family.redistributable === false ? { redistributable: false } : {}) });
    } else warnings.push(`${family.name}: no usable variants`);
  }
  return { families, files, warnings };
}

/** Build an engine `Resource` from a manifest entry. `size` supplies the
 *  intrinsic dimensions when the spec omits them. Bitmap/SVG kind is
 *  derived from the file extension. */
export function resourceFromSpec(
  spec: BundleResourceSpec,
  size?: BundleImageSize,
  fileIdFor: (file: string) => string = identity,
): Resource {
  const now = Date.now();
  const { file, pdfFile, width, height, ...rest } = spec;
  const base: Resource = { ...rest, createdAt: now, updatedAt: now };
  if (!file) return base;

  const fileId = fileIdFor(file);
  const w = width ?? size?.width;
  const h = height ?? size?.height;

  if (isSvgFile(file)) {
    const master = pdfFile && isPdfFile(pdfFile) ? { pdfFileId: fileIdFor(pdfFile) } : {};
    return {
      ...base,
      kind: 'svg',
      svg: w && h ? { fileId, width: w, height: h, ...master } : { fileId, ...master },
    };
  }
  const format = BITMAP_FORMAT_BY_EXT[fileExtension(file)];
  if (format) {
    return {
      ...base,
      kind: 'bitmap',
      bitmap: { fileId, format, width: w ?? 0, height: h ?? 0 },
    };
  }
  return base;
}

// ---------------------------------------------------------------------------
// Intrinsic sizes, without a DOM

function parseSvgLength(value: string | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.endsWith('%')) return null;
  const num = parseFloat(trimmed);
  if (!Number.isFinite(num) || num <= 0) return null;
  const unit = trimmed.replace(/^[\d.+-]+/, '').toLowerCase();
  const factor = unit === 'pt' ? 96 / 72 : unit === 'pc' ? 16 : unit === 'in' ? 96 : unit === 'cm' ? 96 / 2.54 : unit === 'mm' ? 96 / 25.4 : 1;
  return num * factor;
}

/** An SVG's intrinsic pixel size from its root element: explicit
 *  `width`/`height`, else the `viewBox` extent; undefined when neither
 *  gives one. Reads the markup textually, so it runs anywhere. */
export function svgSize(markup: string): BundleImageSize | undefined {
  const tag = /<svg\b([^>]*)>/i.exec(markup.replace(/<!--[\s\S]*?-->/g, ''));
  if (!tag) return undefined;
  const attrs: Record<string, string> = {};
  for (const m of tag[1]!.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
    attrs[m[1]!] = m[3] ?? m[4] ?? '';
  }
  const w = parseSvgLength(attrs.width);
  const h = parseSvgLength(attrs.height);
  if (w && h) return { width: w, height: h };
  const viewBox = attrs.viewBox;
  if (viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite) && parts[2]! > 0 && parts[3]! > 0) {
      return { width: parts[2]!, height: parts[3]! };
    }
  }
  return undefined;
}

/** A bitmap's pixel size read from its header (PNG, JPEG, GIF, WebP), or
 *  undefined when the header is not recognised. */
export function bitmapSize(bytes: ArrayBuffer | Uint8Array): BundleImageSize | undefined {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const ascii = (at: number, len: number): string => String.fromCharCode(...b.subarray(at, at + len));
  if (b.length >= 24 && b[0] === 0x89 && ascii(1, 3) === 'PNG') {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (b.length >= 10 && ascii(0, 3) === 'GIF') {
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }
  if (b.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    const chunk = ascii(12, 4);
    if (chunk === 'VP8X') {
      const w = 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16));
      const h = 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16));
      return { width: w, height: h };
    }
    if (chunk === 'VP8 ') return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    if (chunk === 'VP8L') {
      const bits = view.getUint32(21, true);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    return undefined;
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1]!;
      if (marker === 0xff) { i++; continue; }
      // Start-of-frame markers carry the size (not DHT, JPG, DAC).
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: view.getUint16(i + 7), height: view.getUint16(i + 5) };
      }
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { i += 2; continue; }
      i += 2 + view.getUint16(i + 2);
    }
  }
  return undefined;
}
