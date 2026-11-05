// The high-level bundle API: open a `.postext` file into everything the
// engine and its backends need, or write one from a document.

import type { PostextConfig, Resource } from '../types.js';
import { readBundle, planBundle, resolveBundleFiles } from './codec.js';
import type { BundleCanvasScope, BundleChapter, BundleFontFile, BundleManifest, BundleManifestV2, BundleStart } from './types.js';
import { mimeForFile, pickBundleMeta, pickBundleView, slugify } from './manifest.js';
import { openBundleZip, zipBundle } from './zip.js';

/** A `.postext` file, opened. Every `fileId` it hands out (in `resources`
 *  and `config.customFonts`) is the file's path inside the bundle, so
 *  `files.get(fileId)` returns its bytes. */
export interface PostextBundle {
  /** The validated `preset.json`. */
  manifest: BundleManifest;
  id: string;
  /** The title of the edition read: the manifest's `name`, or the
   *  locale's `localized[…].name` (#891). */
  name: string;
  /** The edition's description, likewise. */
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
  /** A bundle in several languages: its general settings (#1209), read
   *  under the same rules as `config`; the difference is this language's
   *  own. */
  sharedConfig?: PostextConfig;
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
  /** Where the book starts, when the bundle holds part of a longer one
   *  (#695): the `continuation` of its first chapter, which `buildBundle`
   *  lays it out with. Absent for a book that starts at its beginning. */
  start?: BundleStart;
  /** Non-fatal problems met while reading (unsupported font files, a
   *  missing print master). */
  warnings: string[];
}

/** Options of `openBundle`: the language to read when the bundle has several. */
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
  const view = pickBundleView(manifest, read.locale);
  const meta = pickBundleMeta(manifest, read.locale);
  return {
    manifest,
    id: manifest.id,
    name: meta.name,
    ...(meta.description ? { description: meta.description } : {}),
    locale: read.locale,
    ...(manifest.locales ? { locales: manifest.locales } : {}),
    chapters: read.chapters.map((c, i) => ({ ...c, title: c.title || chapterTitle(c.markdown, i + 1) })),
    config: read.config,
    ...(read.sharedConfig ? { sharedConfig: read.sharedConfig } : {}),
    resources: read.resources,
    fonts: read.fonts,
    files: zip.files,
    ...(manifest.thumbnail && zip.files.has(manifest.thumbnail) ? { thumbnail: manifest.thumbnail } : {}),
    ...(view?.canvasScope ? { canvasScope: view.canvasScope } : {}),
    ...(read.start ? { start: read.start } : {}),
    warnings,
  };
}

const isSpace = (c: string): boolean => /\s/.test(c);
const isLineTerminator = (c: string): boolean => c === '\n' || c === '\r' || c === '\u2028' || c === '\u2029';

/** The title of a `# Title #` heading line, what `/^#\s+(.+?)\s*#*\s*$/`
 *  captures, read in one pass so that a long run of spaces stays linear;
 *  undefined when the line is no such heading or holds spaces alone. */
function headingTitle(line: string): string | undefined {
  if (line[0] !== '#') return undefined;
  let start = 1;
  while (start < line.length && isSpace(line[start]!)) start++;
  if (start === 1 || start === line.length) return undefined;
  // The closing `#`s and the spaces around them stay out; the title keeps
  // one character at least.
  let end = line.length;
  while (end > start && isSpace(line[end - 1]!)) end--;
  while (end > start && line[end - 1] === '#') end--;
  while (end > start && isSpace(line[end - 1]!)) end--;
  end = Math.max(end, start + 1);
  for (let i = start; i < end; i++) if (isLineTerminator(line[i]!)) return undefined;
  return line.slice(start, end);
}

/** `title` without its trailing `{…}` attributes, as
 *  `.replace(/\{[^}]*\}\s*$/, '')` leaves it, found from the end. */
function withoutTrailingAttrs(title: string): string {
  const end = title.trimEnd();
  if (!end.endsWith('}')) return title;
  const close = end.length - 1;
  const open = end.indexOf('{', end.lastIndexOf('}', close - 1) + 1);
  return open < 0 ? title : title.slice(0, open);
}

/** Each `\\` line break, with the spaces around it, read as one space. */
function breaksAsSpaces(text: string): string {
  const parts = text.split('\\\\');
  return parts
    .map((part, i) => {
      const head = i > 0 ? part.trimStart() : part;
      return i < parts.length - 1 ? head.trimEnd() : head;
    })
    .join(' ');
}

/** The text of a chapter's first `# ` heading, else `Chapter n`. */
function chapterTitle(markdown: string, n: number): string {
  let inFence = false;
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) continue;
    const title = headingTitle(line);
    if (title !== undefined) {
      const text = breaksAsSpaces(withoutTrailingAttrs(title))
        .replace(/[*_`]/g, '')
        .replace(/\\([\\`*_{}[\]()#+\-.!])/g, '$1')
        .trim();
      if (text) return text;
    }
  }
  return `Chapter ${n}`;
}

/** Bytes a bundle may be given: raw bytes, a buffer, a Blob / File, or a
 *  string (an SVG's markup, a text file). */
export type BundleFileData = Uint8Array | ArrayBuffer | Blob | string;

/** What `createBundle` makes a bundle from: its text, design, resources and
 *  fonts. */
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
  /** The book's general settings, for a bundle in several languages
   *  (#1209): written as the shared `config`, and `config` and every
   *  `localized[…].config` (each then the whole configuration of its
   *  edition) as an override of the fields that differ, merged over them
   *  field by field when read (`mergeConfigLayers`). Absent, `config` is
   *  the shared configuration and each locale's top-level keys go over
   *  it. */
  sharedConfig?: PostextConfig;
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
  /** Where the book starts, for a bundle that holds part of a longer one
   *  (#695): the `continuation` a single document would be built with
   *  (`{ pageIndexOffset: 57, pageNumbering: { startAt: 58 }, headings: {
   *  h1: 3 } }`: page 58, a verso, in chapter 4). Written as `preset.json`'s
   *  `start`; `openBundle` returns it and `buildBundle` lays the first
   *  chapter out with it. */
  start?: BundleStart;
  /** Modification date written on every file of the archive. Unset: the
   *  time of the call, so two calls with the same input give different
   *  bytes. A fixed date built from local fields (`new Date(1980, 0, 1)`)
   *  makes the output byte-stable on every machine, for hashing or
   *  comparing bundles. See `ZipBundleOptions.mtime` for the dates a zip
   *  can hold and why a timestamp differs between time zones. */
  mtime?: Date | number | string;
  /** More languages of the same book, by locale tag (`es`, `pt-BR`): a
   *  bilingual bundle that `openBundle(bytes, { locale })` reads in any of
   *  them. `chapters`, `config` and `resources` above are then the content
   *  of `locale`, which is required. */
  localized?: Record<string, CreateBundleLocale>;
}

/** One more language of a bundle (see {@link CreateBundleInput.localized}). */
export interface CreateBundleLocale {
  /** The book's title in this language, written as `localized[…].name`
   *  when it differs from `name` (#891). */
  name?: string;
  /** The description in this language (`localized[…].description`). */
  description?: string;
  /** The book in this language, one entry per chapter (a chapter without
   *  a title takes its first `# ` heading). Absent: the locale reads the
   *  primary chapters. */
  chapters?: { title?: string; markdown: string }[];
  /** Configuration for this language. Each top-level key replaces the
   *  shared one wholesale when the bundle is read in the locale; keys left
   *  out, or equal to the shared ones, are shared. A full configuration
   *  works as well as the few keys that change. */
  config?: PostextConfig;
  /** Wording and artwork of the shared resources in this language, matched
   *  by `id`: `caption`, `note`, `altText`, a table's `table`, and a picture
   *  of its own (`bitmap.fileId` / `svg.fileId`, `svg.pdfFileId`, looked up
   *  in `files`) when the artwork carries words. Other fields are shared. */
  resources?: (Pick<Resource, 'id'> & Partial<Resource>)[];
  /** Where this language's edition starts, when not where the primary one
   *  does (a right-bound edition that opens on the other side). */
  start?: BundleStart;
}

/** What `createBundle` returns: the zip's bytes, its manifest and files, and
 *  any warnings. */
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
  const titled = (list: readonly { title?: string; markdown: string }[]) =>
    list.map((c, i) => ({ title: c.title || chapterTitle(c.markdown, i + 1), markdown: c.markdown }));
  const chapters = titled(source);
  const localized = input.localized
    ? Object.fromEntries(Object.entries(input.localized).map(([locale, entry]) => [locale, {
      ...(entry.name ? { name: entry.name } : {}),
      ...(entry.description ? { description: entry.description } : {}),
      ...(entry.chapters && entry.chapters.length > 0 ? { chapters: titled(entry.chapters) } : {}),
      ...(entry.config ? { config: entry.config } : {}),
      ...(entry.resources ? { resources: entry.resources } : {}),
      ...(entry.start !== undefined ? { start: entry.start } : {}),
    }]))
    : undefined;
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
      ...(input.sharedConfig ? { sharedConfig: input.sharedConfig } : {}),
      resources: input.resources ?? [],
      ...(input.canvasScope ? { canvasScope: input.canvasScope } : {}),
      ...(input.start ? { start: input.start } : {}),
      ...(input.thumbnail ? { thumbnail: { fileId: THUMBNAIL_ID, mime: input.thumbnail.mime } } : {}),
      ...(localized ? { localized } : {}),
    },
  );
  const resolved = await resolveBundleFiles(plan, { readBlob: lookup, readFont: lookup });
  const bytes = zipBundle(resolved.files, input.mtime !== undefined ? { mtime: input.mtime } : {});
  return { bytes, manifest: resolved.manifest, files: resolved.files, warnings: resolved.warnings };
}

/** Media type of a file inside a bundle (for a Blob, an object URL). */
export function bundleFileMime(path: string): string {
  return mimeForFile(path);
}
