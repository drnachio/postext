// Pure helpers for bundle manifests: validation, locale resolution, file
// naming, and conversion of manifest entries into engine resources and
// custom fonts. No DOM or storage access.

import { canonicalLocaleTag, matchContentLocale, presentTag, sameContentLocale } from '../hyphenation/locale.js';
import type { CustomFontFamily, CustomFontFormat, HeadingCounters, PartState, Resource } from '../types.js';
import type {
  BundleChapterSpec,
  BundleFontFamilySpec,
  BitmapInfo,
  BitmapResolutionSource,
  BundleImageSize,
  BundleLocaleOverrides,
  BundleManifest,
  BundleManifestV1,
  BundleResourceSpec,
  BundleStart,
  BundleViewSpec,
} from './types.js';

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
    && isOptionalString(v.openLocale)
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
  if (!isOptionalString(v.name) || !isOptionalString(v.description)) return false;
  if (v.config !== undefined && !isRecord(v.config)) return false;
  if (v.view !== undefined && !isViewField(v.view)) return false;
  if (v.start !== undefined && !isRecord(v.start)) return false;
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
  if (data.start !== undefined && !isRecord(data.start)) return false;
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
      && (f.fallback === undefined || isNonEmptyString(f.fallback))
      && f.variants.every((v) => isRecord(v) && typeof v.weight === 'number' && isNonEmptyString(v.file)),
    );
    if (!ok) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Locale resolution

/** The key of a locale → value map that serves `locale`: the one
 *  `matchContentLocale` picks (exact tag, then the same language and
 *  script, so `zh-TW` finds `zh-Hant` before `zh-Hans`, then the language
 *  in another script: `zh-TW` reads a bare `zh` rather than the manifest's
 *  English), else the one serving the manifest's own locale, then the
 *  first key. */
function pickLocaleKey(keys: string[], locale: string, manifestLocale?: string): string {
  return matchContentLocale(keys, locale)
    ?? (manifestLocale ? matchContentLocale(keys, manifestLocale) : undefined)
    ?? keys[0]!;
}

/** Whether two tags are the same tag, case and `_` separators aside. */
function sameTag(a: string, b: string): boolean {
  const ca = canonicalLocaleTag(a) ?? a;
  const cb = canonicalLocaleTag(b) ?? b;
  return ca.toLowerCase() === cb.toLowerCase();
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

/** The key a bundle's content is served under for `locale`: the key of its
 *  chapter map when the chapters are a locale map; with shared chapters
 *  and `localized` wording, the manifest's own locale or one of the
 *  localized keys; null for a bundle in a single language. */
function contentLocaleKey(manifest: BundleManifest, locale: string): string | null {
  const chapterMap = manifest.version === 2 && !Array.isArray(manifest.chapters) ? manifest.chapters
    : manifest.version === 1 && typeof manifest.markdown !== 'string' ? manifest.markdown
      : null;
  if (chapterMap) return pickLocaleKey(Object.keys(chapterMap), locale, manifest.locale);
  const localized = Object.keys(manifest.localized ?? {});
  if (localized.length === 0) return null;
  // Shared chapters: the manifest's own locale is one of the candidates, so
  // reading it — or a locale the bundle does not carry — keeps the shared
  // wording instead of falling back to the first localized entry.
  return pickLocaleKey(manifest.locale ? [manifest.locale, ...localized] : localized, locale, manifest.locale);
}

/** The per-locale overrides that apply to `locale`, or null when the
 *  manifest has none: those of the locale the content is served under (see
 *  {@link resolveBundleLocale}), so text and wording never disagree. That
 *  is the entry of the exact tag; for any locale but the manifest's own,
 *  else the entry `matchContentLocale` picks: its bare base language (`pt`
 *  for `pt-BR`), else a regional variant of the same language, and for
 *  Chinese only an entry in the same script. The manifest's own locale is
 *  what the shared wording is written in: only an entry naming it exactly
 *  rewords it, never a sibling variant (`pt-BR` when the bundle is
 *  `pt-PT`). */
export function pickLocaleOverrides(manifest: BundleManifest, locale: string): BundleLocaleOverrides | null {
  const localized = manifest.localized;
  if (!localized || Object.keys(localized).length === 0) return null;
  const key = contentLocaleKey(manifest, locale);
  if (key === null) return null;
  const keys = Object.keys(localized);
  const exact = keys.find((k) => sameTag(k, key));
  if (exact) return localized[exact]!;
  if (manifest.locale && sameTag(manifest.locale, key)) return null;
  // Wording in the script of the text served: Simplified labels never
  // reword a Traditional edition.
  const found = matchContentLocale(keys, key);
  return found && sameContentLocale(found, key) ? localized[found]! : null;
}

/** What {@link pickBundleMeta} reads: a manifest, or an index entry that
 *  carries its names (`name`, `description`, `locale`, `localized`). */
export type BundleNames = Pick<BundleManifest, 'name' | 'description' | 'locale'> & {
  localized?: Record<string, Pick<BundleLocaleOverrides, 'name' | 'description'>>;
};

/** The name and description of the edition served for `locale`: the
 *  manifest's, with that language's `localized[…].name` and
 *  `description` over them (#891). An empty localized name keeps the
 *  manifest's. Given an index entry rather than a manifest, the edition is
 *  picked among the manifest's locale and the localized keys. */
export function pickBundleMeta(manifest: BundleManifest | BundleNames, locale: string): { name: string; description?: string } {
  const own = pickLocaleOverrides(manifest as BundleManifest, locale);
  const name = own?.name?.trim() ? own.name : manifest.name;
  const description = own?.description !== undefined && own.description !== '' ? own.description : manifest.description;
  return { name, ...(description ? { description } : {}) };
}

/** How the edition served for `locale` opens: the manifest's `view` with
 *  that language's `localized[…].view` over it. */
export function pickBundleView(manifest: BundleManifest, locale: string): BundleViewSpec | undefined {
  const own = pickLocaleOverrides(manifest, locale)?.view;
  if (!own) return manifest.view;
  return { ...manifest.view, ...own };
}

const count = (v: unknown): number | undefined =>
  (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : undefined);

/** Heading counters with every level a whole number: a level left out
 *  (`{ h1: 3 }`) or ill-typed counts zero. */
function headingCounters(v: unknown): HeadingCounters | undefined {
  if (!isRecord(v)) return undefined;
  return { h1: count(v.h1) ?? 0, h2: count(v.h2) ?? 0, h3: count(v.h3) ?? 0, h4: count(v.h4) ?? 0, h5: count(v.h5) ?? 0, h6: count(v.h6) ?? 0 };
}

/** A map of counters (`{ figure: { counter, heading } }`), ill-typed
 *  entries left out; undefined when none is left. */
function counterMap(v: unknown): Record<string, { counter: number; heading: HeadingCounters }> | undefined {
  if (!isRecord(v)) return undefined;
  const out: Record<string, { counter: number; heading: HeadingCounters }> = {};
  for (const [key, entry] of Object.entries(v)) {
    const counter = isRecord(entry) ? count(entry.counter) : undefined;
    if (counter !== undefined) out[key] = { counter, heading: headingCounters((entry as Record<string, unknown>).heading) ?? headingCounters({})! };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Where a book starts ({@link BundleStart}), as a manifest or a caller
 * gives it, in the shape the engine takes as a `continuation`: the fields
 * it knows, each of the right type, the heading counters complete. A field
 * of another type is left out rather than failing the bundle, and so is
 * `bookPageCount`. Undefined when nothing is left: a book that starts at
 * its own beginning.
 */
export function bundleStart(value: unknown): BundleStart | undefined {
  if (!isRecord(value)) return undefined;
  const out: BundleStart = {};
  const pageIndexOffset = count(value.pageIndexOffset);
  if (pageIndexOffset !== undefined) out.pageIndexOffset = pageIndexOffset;
  if (isRecord(value.pageNumbering)) {
    const { format, startAt } = value.pageNumbering;
    const numbering: NonNullable<BundleStart['pageNumbering']> = {
      ...(isNonEmptyString(format) ? { format: format as NonNullable<BundleStart['pageNumbering']>['format'] } : {}),
      ...(typeof startAt === 'number' && Number.isFinite(startAt) ? { startAt: Math.floor(startAt) } : {}),
    };
    if (Object.keys(numbering).length > 0) out.pageNumbering = numbering;
  }
  const headings = headingCounters(value.headings);
  if (headings) out.headings = headings;
  const resourceCounters = counterMap(value.resourceCounters);
  if (resourceCounters) out.resourceCounters = resourceCounters;
  if (isRecord(value.resourceNumbers)) {
    const numbers: NonNullable<BundleStart['resourceNumbers']> = {};
    for (const [id, entry] of Object.entries(value.resourceNumbers)) {
      if (isRecord(entry) && typeof entry.number === 'string' && isNonEmptyString(entry.typeId)) {
        numbers[id] = { number: entry.number, typeId: entry.typeId, heading: headingCounters(entry.heading) ?? headingCounters({})! };
      }
    }
    if (Object.keys(numbers).length > 0) out.resourceNumbers = numbers;
  }
  const statementCounters = counterMap(value.statementCounters);
  if (statementCounters) out.statementCounters = statementCounters;
  const footnoteNumber = count(value.footnoteNumber);
  if (footnoteNumber !== undefined) out.footnoteNumber = footnoteNumber;
  const lineNumber = count(value.lineNumber);
  if (lineNumber !== undefined) out.lineNumber = lineNumber;
  if (isRecord(value.part) && typeof value.part.number === 'string' && typeof value.part.title === 'string') {
    const part: PartState = { number: value.part.number, title: value.part.title };
    if (isRecord(value.part.palette)) {
      const palette = Object.fromEntries(Object.entries(value.part.palette).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
      if (Object.keys(palette).length > 0) part.palette = palette;
    }
    out.part = part;
  }
  if (value.afterPartPage === true) out.afterPartPage = true;
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Where the edition served for `locale` starts: that language's
 *  `localized[…].start`, else the manifest's `start`; undefined for a book
 *  that starts at its own beginning. */
export function pickBundleStart(manifest: BundleManifest, locale: string): BundleStart | undefined {
  const own = pickLocaleOverrides(manifest, locale)?.start;
  return bundleStart(own !== undefined ? own : manifest.start);
}

/** The locale a bundle actually serves for `locale`: the key of its
 *  chapter map when the content is a locale map, the key whose wording it
 *  reads when shared chapters carry `localized` wording, else the
 *  manifest's own locale, else `locale` itself. */
export function resolveBundleLocale(manifest: BundleManifest, locale: string): string {
  return contentLocaleKey(manifest, locale) ?? manifest.locale ?? locale;
}

/** The language a bundle's default configuration is localised to (the
 *  names of the built-in resource types: "Figure", "Figura"), read for
 *  `locale`. When the manifest names its languages, the one its content is
 *  served in ({@link resolveBundleLocale}); when it names none, the
 *  document language of its own `config` (`locale`, then
 *  `bodyText.hyphenation.locale`), as the engine resolves it; else
 *  `locale`. */
export function resolveBundleConfigLocale(manifest: BundleManifest, locale: string): string {
  if (presentTag(manifest.locale) || contentLocaleKey(manifest, locale) !== null) return resolveBundleLocale(manifest, locale);
  return presentTag(manifest.config?.locale) ?? presentTag(manifest.config?.bodyText?.hyphenation?.locale) ?? locale;
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

const VIDEO_FORMAT_BY_EXT: Record<string, string> = {
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

// ---------------------------------------------------------------------------
// Manifest entries → engine objects

export interface BundleFontFiles {
  families: CustomFontFamily[];
  files: { fileId: string; fileName: string; format: CustomFontFormat; file: string; family: string; weight: number; style: 'normal' | 'italic' }[];
  warnings: string[];
}

const identity = (file: string): string => file;

/** The `fallback` of a manifest family when it can stand in for it: a
 *  name other than the family's own (#978). */
function usableFallback(family: Pick<BundleFontFamilySpec, 'name' | 'fallback'>): string | undefined {
  const fallback = typeof family.fallback === 'string' ? family.fallback.trim() : '';
  return fallback.length > 0 && fallback.toLowerCase() !== family.name.trim().toLowerCase() ? fallback : undefined;
}

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
    const fallback = usableFallback(family);
    if (variants.length > 0 || fallback) {
      families.push({
        name: family.name,
        variants,
        ...(family.redistributable === false ? { redistributable: false } : {}),
        ...(fallback ? { fallback } : {}),
      });
    } else warnings.push(`${family.name}: no usable variants`);
  }
  return { families, files, warnings };
}

function positive(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/** Build an engine `Resource` from a manifest entry. `size` supplies the
 *  intrinsic dimensions when the spec omits them, and a bitmap's file
 *  resolution when the spec gives no `fileResolution`. Bitmap/SVG kind is
 *  derived from the file extension. */
export function resourceFromSpec(
  spec: BundleResourceSpec,
  size?: BundleImageSize,
  fileIdFor: (file: string) => string = identity,
): Resource {
  const now = Date.now();
  const { file, pdfFile, poster, width, height, resolution, fileResolution, inlineFonts, score, ...rest } = spec;
  // A score spec's notation (#1172): kept when it is whole (the codec has
  // read a notation file into it by now).
  const base: Resource = {
    ...rest,
    ...(score?.format && typeof score.source === 'string' ? { score: { ...score, format: score.format, source: score.source } } : {}),
    createdAt: now,
    updatedAt: now,
  };
  if (spec.kind === 'video' || (file && isVideoFile(file))) {
    // A video (#454): its own file (self-hosted) and its poster frame.
    const video = { source: 'file' as const, ...(spec.video ?? {}) };
    delete (video as { fileId?: string }).fileId;
    delete (video as { poster?: unknown }).poster;
    const posterFormat = poster ? BITMAP_FORMAT_BY_EXT[fileExtension(poster)] : undefined;
    const w = width ?? size?.width;
    const h = height ?? size?.height;
    return {
      ...base,
      kind: 'video',
      video: {
        ...video,
        ...(file && isVideoFile(file) ? { fileId: fileIdFor(file), format: VIDEO_FORMAT_BY_EXT[fileExtension(file)] } : {}),
        ...(poster && posterFormat ? { poster: { fileId: fileIdFor(poster), format: posterFormat, width: w ?? 0, height: h ?? 0 } } : {}),
      },
    };
  }
  if (!file) return base;

  const fileId = fileIdFor(file);
  const w = width ?? size?.width;
  const h = height ?? size?.height;

  if (isSvgFile(file)) {
    const master = pdfFile && isPdfFile(pdfFile) ? { pdfFileId: fileIdFor(pdfFile) } : {};
    const fonts = inlineFonts === false ? { inlineFonts: false } : {};
    return {
      ...base,
      kind: 'svg',
      svg: w && h ? { fileId, width: w, height: h, ...master, ...fonts } : { fileId, ...master, ...fonts },
    };
  }
  const format = BITMAP_FORMAT_BY_EXT[fileExtension(file)];
  if (format) {
    return {
      ...base,
      kind: 'bitmap',
      bitmap: {
        fileId, format, width: w ?? 0, height: h ?? 0,
        ...(positive(resolution) ? { resolution } : {}),
        ...(positive(fileResolution) ? { fileResolution } : positive(size?.resolution?.x) ? { fileResolution: size!.resolution!.x } : {}),
      },
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

/** `markup` without its `<!-- … -->` comments; an unclosed one is left
 *  as it is (as `/<!--[\s\S]*?-->/g` would), read in one pass. */
function withoutComments(markup: string): string {
  let out = '';
  let at = 0;
  for (;;) {
    const open = markup.indexOf('<!--', at);
    const close = open < 0 ? -1 : markup.indexOf('-->', open + 4);
    if (close < 0) return out + markup.slice(at);
    out += markup.slice(at, open);
    at = close + 3;
  }
}

const isNameChar = (c: string | undefined): boolean => c !== undefined && /[\w:-]/.test(c);

/** The quoted attributes of a tag's inside, by name: what a global
 *  `/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/` finds, read in one pass. A
 *  name is only tried from the start of its run (a shorter one inside it
 *  fails the same way), so a long run of name characters with no `=`
 *  costs one step per character. */
function svgAttributes(inside: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  let i = 0;
  while (i < inside.length) {
    if (!isNameChar(inside[i]) || isNameChar(inside[i - 1])) {
      i++;
      continue;
    }
    let j = i;
    while (isNameChar(inside[j])) j++;
    let k = j;
    while (k < inside.length && /\s/.test(inside[k]!)) k++;
    if (inside[k] === '=') {
      k++;
      while (k < inside.length && /\s/.test(inside[k]!)) k++;
      const quote = inside[k];
      const close = quote === '"' || quote === "'" ? inside.indexOf(quote, k + 1) : -1;
      if (close >= 0) {
        attrs[inside.slice(i, j)] = inside.slice(k + 1, close);
        i = close + 1;
        continue;
      }
    }
    i = j;
  }
  return attrs;
}

/** An SVG's intrinsic pixel size from its root element: explicit
 *  `width`/`height`, else the `viewBox` extent; undefined when neither
 *  gives one. Reads the markup textually, so it runs anywhere. */
export function svgSize(markup: string): BundleImageSize | undefined {
  const tag = /<svg\b([^>]*)>/i.exec(withoutComments(markup));
  if (!tag) return undefined;
  const attrs = svgAttributes(tag[1]!);
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
  const info = bitmapInfo(bytes);
  return info ? { width: info.width, height: info.height } : undefined;
}

const INCH_PER_METRE = 0.0254;

/** ppi to two decimals: 11811 px/m reads as 300. */
function roundPpi(v: number): number {
  return Math.round(v * 100) / 100;
}

/** The resolution of an EXIF block (a TIFF header and IFD0, `t` its first
 *  byte): `XResolution` / `YResolution` in `ResolutionUnit` (2 inch, the
 *  default; 3 cm). Undefined without them, or with unit 1 (none). */
function exifResolution(b: Uint8Array, t: number, end: number): { x: number; y: number } | undefined {
  if (t + 8 > end) return undefined;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const order = String.fromCharCode(b[t]!, b[t + 1]!);
  if (order !== 'II' && order !== 'MM') return undefined;
  const le = order === 'II';
  if (view.getUint16(t + 2, le) !== 42) return undefined;
  const ifd = t + view.getUint32(t + 4, le);
  if (ifd + 2 > end) return undefined;
  const count = view.getUint16(ifd, le);
  let x: number | undefined;
  let y: number | undefined;
  let unit = 2;
  const rational = (entry: number): number | undefined => {
    if (view.getUint16(entry + 2, le) !== 5) return undefined;
    const at = t + view.getUint32(entry + 8, le);
    if (at + 8 > end) return undefined;
    const den = view.getUint32(at + 4, le);
    return den > 0 ? view.getUint32(at, le) / den : undefined;
  };
  for (let k = 0; k < count; k++) {
    const entry = ifd + 2 + k * 12;
    if (entry + 12 > end) break;
    const tag = view.getUint16(entry, le);
    if (tag === 0x011a) x = rational(entry);
    else if (tag === 0x011b) y = rational(entry);
    else if (tag === 0x0128) unit = view.getUint16(entry + 8, le);
  }
  if (!x || !y || (unit !== 2 && unit !== 3)) return undefined;
  const k = unit === 3 ? 2.54 : 1;
  return { x: x * k, y: y * k };
}

/** A bitmap's pixel size and, when the file states one, its resolution
 *  (#631): PNG `pHYs` in pixels per metre (unit 0, an aspect ratio only,
 *  is ignored); JPEG JFIF density (dpi or dots per cm; units 0 ignored) and
 *  EXIF `XResolution` / `YResolution`, EXIF winning when both are there
 *  (Photoshop writes both and edits the EXIF one); WebP EXIF. GIF carries
 *  none. The value is returned as read: 72 or 96 ppi often means "no
 *  information" (see `layout.bitmapResolution: 'file'`). Undefined when the
 *  header is not recognised. */
export function bitmapInfo(bytes: ArrayBuffer | Uint8Array): BitmapInfo | undefined {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const ascii = (at: number, len: number): string => String.fromCharCode(...b.subarray(at, at + len));
  const withResolution = (width: number, height: number, res?: { x: number; y: number }, source?: BitmapResolutionSource): BitmapInfo =>
    res && source && res.x > 0 && res.y > 0 && Number.isFinite(res.x) && Number.isFinite(res.y)
      ? { width, height, resolution: { x: roundPpi(res.x), y: roundPpi(res.y), source } }
      : { width, height };
  if (b.length >= 24 && b[0] === 0x89 && ascii(1, 3) === 'PNG') {
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    // Chunks after the signature; `pHYs` comes before the image data.
    let i = 8;
    while (i + 8 <= b.length) {
      const len = view.getUint32(i);
      const type = ascii(i + 4, 4);
      if (type === 'IDAT' || type === 'IEND') break;
      if (type === 'pHYs' && len >= 9 && i + 17 <= b.length) {
        if (b[i + 16] === 1) {
          return withResolution(width, height, { x: view.getUint32(i + 8) * INCH_PER_METRE, y: view.getUint32(i + 12) * INCH_PER_METRE }, 'pHYs');
        }
        break;
      }
      i += 12 + len;
    }
    return { width, height };
  }
  if (b.length >= 10 && ascii(0, 3) === 'GIF') {
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }
  if (b.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    const chunk = ascii(12, 4);
    if (chunk === 'VP8X') {
      const w = 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16));
      const h = 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16));
      // Flag bit 3: an EXIF chunk follows the image data.
      if (b[20]! & 0x08) {
        let i = 12;
        while (i + 8 <= b.length) {
          const size = view.getUint32(i + 4, true);
          if (ascii(i, 4) === 'EXIF') {
            let t = i + 8;
            const end = Math.min(b.length, t + size);
            // Some writers keep JPEG's "Exif\0\0" prefix.
            if (ascii(t, 4) === 'Exif') t += 6;
            return withResolution(w, h, exifResolution(b, t, end), 'exif');
          }
          i += 8 + size + (size & 1);
        }
      }
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
    let jfif: { x: number; y: number } | undefined;
    let exif: { x: number; y: number } | undefined;
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1]!;
      if (marker === 0xff) { i++; continue; }
      // Start-of-frame markers carry the size (not DHT, JPG, DAC).
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        const width = view.getUint16(i + 7);
        const height = view.getUint16(i + 5);
        if (exif) return withResolution(width, height, exif, 'exif');
        return withResolution(width, height, jfif, 'jfif');
      }
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { i += 2; continue; }
      const len = view.getUint16(i + 2);
      const end = Math.min(b.length, i + 2 + len);
      if (marker === 0xe0 && !jfif && i + 16 <= end && ascii(i + 4, 5) === 'JFIF\0') {
        // Units: 1 dots per inch, 2 dots per cm, 0 an aspect ratio only.
        const units = b[i + 11];
        const x = view.getUint16(i + 12);
        const y = view.getUint16(i + 14);
        if ((units === 1 || units === 2) && x > 0 && y > 0) jfif = units === 2 ? { x: x * 2.54, y: y * 2.54 } : { x, y };
      } else if (marker === 0xe1 && !exif && i + 10 <= end && ascii(i + 4, 6) === 'Exif\0\0') {
        exif = exifResolution(b, i + 10, end);
      }
      i += 2 + len;
    }
  }
  return undefined;
}
