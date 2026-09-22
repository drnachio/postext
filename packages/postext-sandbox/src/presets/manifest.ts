// Pure helpers for preset manifests: validation, deterministic file ids, and
// conversion of manifest entries into sandbox resources / custom fonts. No DOM
// or storage access, so everything here is unit-testable in node.

import type { CustomFontFamily, CustomFontFormat, Resource } from 'postext';
import { formatFromFilename } from '../storage/fontStorage';
import { slugify, uniqueSlug } from '../panels/resources/slugify';
import type {
  PresetChapterSpec,
  PresetFontFamilySpec,
  PresetIndex,
  PresetIndexEntry,
  PresetLocaleOverrides,
  PresetManifest,
  PresetManifestV1,
  PresetResourceSpec,
} from './types';

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

/** The optional showcase fields (`PresetShowcaseMeta`): wrong types reject
 *  the entry rather than being silently dropped. */
function hasValidShowcaseMeta(v: Record<string, unknown>): boolean {
  return isOptionalStringList(v.locales)
    && isOptionalString(v.thumbnail)
    && isOptionalString(v.license)
    && isOptionalString(v.credits)
    && isOptionalStringList(v.tags);
}

function isIndexEntry(v: unknown): v is PresetIndexEntry {
  return isRecord(v) && isNonEmptyString(v.id) && isNonEmptyString(v.dir) && isNonEmptyString(v.name)
    && hasValidShowcaseMeta(v);
}

export function isPresetIndex(data: unknown): data is PresetIndex {
  return isRecord(data)
    && data.version === 1
    && Array.isArray(data.presets)
    && data.presets.every(isIndexEntry);
}

function isMarkdownField(v: unknown): v is string | Record<string, string> {
  if (isNonEmptyString(v)) return true;
  if (!isRecord(v)) return false;
  const values = Object.values(v);
  return values.length > 0 && values.every(isNonEmptyString);
}

function isChapterSpec(v: unknown): v is PresetChapterSpec {
  return isRecord(v) && typeof v.title === 'string' && isNonEmptyString(v.file);
}

function isChapterList(v: unknown): v is PresetChapterSpec[] {
  return Array.isArray(v) && v.length > 0 && v.every(isChapterSpec);
}

function isChaptersField(v: unknown): v is PresetChapterSpec[] | Record<string, PresetChapterSpec[]> {
  if (isChapterList(v)) return true;
  if (!isRecord(v) || Array.isArray(v)) return false;
  const values = Object.values(v);
  return values.length > 0 && values.every(isChapterList);
}

function isLocaleOverrides(v: unknown): v is PresetLocaleOverrides {
  if (!isRecord(v)) return false;
  if (v.config !== undefined && !isRecord(v.config)) return false;
  if (v.resources !== undefined) {
    if (!Array.isArray(v.resources)) return false;
    if (!v.resources.every((r) => isRecord(r) && isNonEmptyString(r.id))) return false;
  }
  return true;
}

function isLocalizedField(v: unknown): v is Record<string, PresetLocaleOverrides> {
  return isRecord(v) && Object.values(v).every(isLocaleOverrides);
}

/** Accepts both manifest versions: v1 (`markdown`) and v2 (`chapters`). */
export function isPresetManifest(data: unknown): data is PresetManifest {
  if (!isRecord(data)) return false;
  if (data.version !== 1 && data.version !== 2) return false;
  if (!isNonEmptyString(data.id) || !isNonEmptyString(data.name)) return false;
  if (data.version === 1 && !isMarkdownField(data.markdown)) return false;
  if (data.version === 2 && !isChaptersField(data.chapters)) return false;
  if (!hasValidShowcaseMeta(data)) return false;
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

/** Deterministic blob id for a preset resource file, so reloading the preset
 *  overwrites the same IndexedDB record instead of orphaning the old one. */
export function presetFileId(presetId: string, file: string): string {
  return `preset:${presetId}:${slugify(file)}`;
}

/** Deterministic chapter id for a preset chapter file, so re-applying the
 *  preset (a reset, a reload from disk) keeps the chapter ids — and with
 *  them the layout records of the chapters whose text did not change. */
export function presetChapterId(presetId: string, file: string): string {
  return `preset-chapter:${presetId}:${slugify(file)}`;
}

/** Deterministic font-file id; see `presetFileId`. */
export function presetFontFileId(presetId: string, file: string): string {
  return `preset-font:${presetId}:${slugify(file)}`;
}

/** Resolve which markdown file to use for `locale`: exact tag, then the base
 *  language (`es` for `es-ES`), then the manifest's own locale, then the first
 *  entry. */
export function pickMarkdownFile(manifest: PresetManifestV1, locale: string): string {
  const md = manifest.markdown;
  if (typeof md === 'string') return md;
  return pickByLocale(md, locale, manifest.locale);
}

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

/** Pick the entry of a locale → value map for `locale` (see `pickLocaleKey`). */
function pickByLocale<T>(map: Record<string, T>, locale: string, manifestLocale?: string): T {
  return map[pickLocaleKey(Object.keys(map), locale, manifestLocale)]!;
}

/** The per-locale overrides that apply to `locale`, or null when the
 *  manifest has none. A bundle whose chapters are a locale map applies the
 *  overrides of the locale its chapters were picked from, so text and
 *  wording never disagree. */
export function pickLocaleOverrides(manifest: PresetManifest, locale: string): PresetLocaleOverrides | null {
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

/** The chapter files to read for `locale`: a v1 manifest yields a single
 *  untitled chapter (title derived from the text later). */
export function pickChapterSpecs(manifest: PresetManifest, locale: string): PresetChapterSpec[] {
  if (manifest.version === 1) return [{ title: '', file: pickMarkdownFile(manifest, locale) }];
  const ch = manifest.chapters;
  return Array.isArray(ch) ? ch : pickByLocale(ch, locale, manifest.locale);
}

/** `chapters/01-intro.md`: zero-padded ordinal (at least two digits) plus a
 *  slug of the title, unique against `taken`. */
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
};

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

/** True when `file` is a bitmap the sandbox can decode. */
export function isBitmapFile(file: string): boolean {
  return fileExtension(file) in BITMAP_FORMAT_BY_EXT;
}

export function isSvgFile(file: string): boolean {
  return fileExtension(file) === 'svg';
}

export function isPdfFile(file: string): boolean {
  return fileExtension(file) === 'pdf';
}

export interface PresetFontFiles {
  families: CustomFontFamily[];
  files: { fileId: string; fileName: string; format: CustomFontFormat; file: string }[];
  warnings: string[];
}

/** Turn manifest font families into `config.customFonts` entries plus the list
 *  of files to fetch. `.woff` is not supported by the PDF backend and is
 *  skipped with a warning, as is any unrecognised extension. */
export function fontsToCustomFonts(
  presetId: string,
  fonts: PresetFontFamilySpec[],
  fileIdFor: (file: string) => string = (file) => presetFontFileId(presetId, file),
): PresetFontFiles {
  const families: CustomFontFamily[] = [];
  const files: PresetFontFiles['files'] = [];
  const warnings: string[] = [];
  for (const family of fonts) {
    const variants: CustomFontFamily['variants'] = [];
    for (const v of family.variants) {
      const format = formatFromFilename(v.file);
      if (!format || format === 'woff') {
        warnings.push(`${family.name}: unsupported font file "${v.file}"`);
        continue;
      }
      const fileId = fileIdFor(v.file);
      const fileName = fileBasename(v.file);
      const style = v.style === 'italic' ? 'italic' : 'normal';
      variants.push({ weight: v.weight, style, fileId, format, fileName });
      files.push({ fileId, fileName, format, file: v.file });
    }
    if (variants.length > 0) families.push({ name: family.name, variants });
    else warnings.push(`${family.name}: no usable variants`);
  }
  return { families, files, warnings };
}

/** Build a sandbox `Resource` from a manifest entry. `size` supplies the
 *  intrinsic dimensions when the spec omits them (read from the file bytes by
 *  the loader). Bitmap/SVG kind is derived from the file extension. */
export function resourceFromSpec(
  presetId: string,
  spec: PresetResourceSpec,
  size?: { width: number; height: number },
  fileIdFor: (file: string) => string = (file) => presetFileId(presetId, file),
): Resource {
  const now = Date.now();
  const { file, pdfFile, width, height, ...rest } = spec;
  // `note` is a real resource field (rendered under the figure), so it is
  // kept on the stored resource like the caption.
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

const EXT_BY_BITMAP_FORMAT: Record<string, string> = {
  png: 'png',
  jpeg: 'jpg',
  webp: 'webp',
  gif: 'gif',
};

/** File extension to write a resource's bytes under, or null for resources
 *  without a file (tables). */
export function extensionForResource(r: Resource): string | null {
  if (r.kind === 'svg' && r.svg) return 'svg';
  if (r.kind === 'bitmap' && r.bitmap) return EXT_BY_BITMAP_FORMAT[r.bitmap.format] ?? r.bitmap.format;
  return null;
}
