// The high-level bundle API: open a `.postext` file into everything the
// engine and its backends need, or write one from a document.

import type { PostextConfig, Resource } from '../types';
import { readBundle, planBundle, resolveBundleFiles } from './codec';
import type { BundleCanvasScope, BundleChapter, BundleFontFile, BundleManifest, BundleManifestV2 } from './types';
import { mimeForFile, slugify } from './manifest';
import { openBundleZip, zipBundle } from './zip';

/** A `.postext` file, opened. Every `fileId` it hands out (in `resources`
 *  and `config.customFonts`) is the file's path inside the bundle, so
 *  `files.get(fileId)` returns its bytes. */
export interface PostextBundle {
  /** The validated `preset.json`. */
  manifest: BundleManifest;
  id: string;
  name: string;
  description?: string;
  /** The locale the content was read in. */
  locale: string;
  /** Every locale a bilingual bundle carries (the manifest's `locales`). */
  locales?: string[];
  /** Chapters in book order. */
  chapters: BundleChapter[];
  /** Ready for `buildDocument`: the base configuration, the bundle's
   *  `config` and the locale's overrides, with `customFonts` naming the
   *  bundle's own font files. */
  config: PostextConfig;
  resources: Resource[];
  /** The bundle's font files, one per family variant. */
  fonts: BundleFontFile[];
  /** Every file of the bundle by path (= `fileId`). */
  files: Map<string, Uint8Array>;
  /** Path of the cover picture, when the bundle has one. */
  thumbnail?: string;
  /** How the bundle asks to be viewed (`book`: the whole book as one
   *  canvas). */
  canvasScope?: BundleCanvasScope;
  /** Non-fatal problems met while reading (unsupported font files, a
   *  missing print master). */
  warnings: string[];
}

export interface OpenBundleOptions {
  /** Locale to read a bilingual bundle in (`es`, `en-GB`). Defaults to the
   *  bundle's own locale. */
  locale?: string;
}

async function toBytes(input: Uint8Array | ArrayBuffer | Blob): Promise<Uint8Array> {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(await input.arrayBuffer());
}

/** Open a `.postext` file. Throws when it is not a zip, has no valid
 *  `preset.json` or misses a file the manifest names. */
export async function openBundle(
  input: Uint8Array | ArrayBuffer | Blob,
  options: OpenBundleOptions = {},
): Promise<PostextBundle> {
  const zip = openBundleZip(await toBytes(input));
  const warnings: string[] = [];
  const read = await readBundle(zip.manifest, zip.readFile, {
    ...(options.locale ? { locale: options.locale } : {}),
    onWarning: (w) => warnings.push(w),
  });
  const { manifest } = read;
  return {
    manifest,
    id: manifest.id,
    name: manifest.name,
    ...(manifest.description ? { description: manifest.description } : {}),
    locale: read.locale,
    ...(manifest.locales ? { locales: manifest.locales } : {}),
    chapters: read.chapters.map((c, i) => ({ ...c, title: c.title || chapterTitle(c.markdown, i + 1) })),
    config: read.config,
    resources: read.resources,
    fonts: read.fonts,
    files: zip.files,
    ...(manifest.thumbnail && zip.files.has(manifest.thumbnail) ? { thumbnail: manifest.thumbnail } : {}),
    ...(manifest.view?.canvasScope ? { canvasScope: manifest.view.canvasScope } : {}),
    warnings,
  };
}

/** The text of a chapter's first `# ` heading, else `Chapter n`. */
function chapterTitle(markdown: string, n: number): string {
  let inFence = false;
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) continue;
    const m = /^#\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) {
      const text = m[1]!.replace(/\{[^}]*\}\s*$/, '').replace(/[*_`]/g, '').trim();
      if (text) return text;
    }
  }
  return `Chapter ${n}`;
}

/** Bytes a bundle may be given: raw bytes, a buffer, a Blob / File, or a
 *  string (an SVG's markup, a text file). */
export type BundleFileData = Uint8Array | ArrayBuffer | Blob | string;

export interface CreateBundleInput {
  /** Display name (`preset.json`'s `name`). */
  name: string;
  /** Stable identifier; defaults to a slug of `name`. */
  id?: string;
  description?: string;
  /** The content's language (`en`, `es`, …). */
  locale?: string;
  /** The book, one entry per chapter. A chapter without a title takes the
   *  text of its first `# ` heading. */
  chapters?: { title?: string; markdown: string }[];
  /** A single-document book (one chapter). Ignored when `chapters` is set. */
  markdown?: string;
  config?: PostextConfig;
  /** Resources; a picture names its payload by `bitmap.fileId` /
   *  `svg.fileId` (and `svg.pdfFileId`), looked up in `files`. */
  resources?: Resource[];
  /** Payloads by `fileId`: the pictures `resources` reference and the font
   *  files `config.customFonts` variants reference. */
  files?: Record<string, BundleFileData> | Map<string, BundleFileData>;
  /** Cover picture (PNG, JPEG, WebP, GIF or SVG). */
  thumbnail?: { data: BundleFileData; mime: string };
  /** Ask viewers to lay the whole book out as one canvas. */
  canvasScope?: BundleCanvasScope;
}

export interface CreatedBundle {
  /** The `.postext` file. */
  bytes: Uint8Array;
  /** The manifest written as `preset.json`. */
  manifest: BundleManifestV2;
  /** Path → bytes of every file inside the archive. */
  files: Record<string, Uint8Array>;
  /** What was left out (a missing payload, a `.woff` face, a font family
   *  marked not redistributable). */
  warnings: string[];
}

async function dataToBytes(data: BundleFileData): Promise<Uint8Array> {
  if (typeof data === 'string') return new TextEncoder().encode(data);
  return toBytes(data);
}

const THUMBNAIL_ID = '\u0000thumbnail';

/** Write a `.postext` file from a document: its chapters, configuration,
 *  resources and the payloads they reference. */
export async function createBundle(input: CreateBundleInput): Promise<CreatedBundle> {
  const source = input.chapters ?? (input.markdown !== undefined ? [{ markdown: input.markdown }] : []);
  if (source.length === 0) throw new Error('createBundle: give `chapters` or `markdown`');
  const chapters = source.map((c, i) => ({ title: c.title || chapterTitle(c.markdown, i + 1), markdown: c.markdown }));
  const fileMap = input.files instanceof Map ? input.files : new Map(Object.entries(input.files ?? {}));
  const lookup = async (fileId: string): Promise<Uint8Array | null> => {
    if (fileId === THUMBNAIL_ID) return input.thumbnail ? dataToBytes(input.thumbnail.data) : null;
    const data = fileMap.get(fileId);
    return data === undefined ? null : dataToBytes(data);
  };
  const plan = planBundle(
    { id: input.id || slugify(input.name) || 'bundle', name: input.name, ...(input.description ? { description: input.description } : {}), ...(input.locale ? { locale: input.locale } : {}) },
    {
      chapters,
      config: input.config ?? {},
      resources: input.resources ?? [],
      ...(input.canvasScope ? { canvasScope: input.canvasScope } : {}),
      ...(input.thumbnail ? { thumbnail: { fileId: THUMBNAIL_ID, mime: input.thumbnail.mime } } : {}),
    },
  );
  const resolved = await resolveBundleFiles(plan, { readBlob: lookup, readFont: lookup });
  return { bytes: zipBundle(resolved.files), manifest: resolved.manifest, files: resolved.files, warnings: resolved.warnings };
}

/** Media type of a file inside a bundle (for a Blob, an object URL). */
export function bundleFileMime(path: string): string {
  return mimeForFile(path);
}
