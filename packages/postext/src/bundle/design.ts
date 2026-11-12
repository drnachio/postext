// Design bundles (#1523): a `.postext` file that holds a design and no book.
// The manifest marks it (`design: { parts }`), `chapters` is empty, the
// font files go in `fonts/` (a family marked not redistributable is left
// out) and an output profile in `profiles/`, as in any bundle. Reading goes
// through the same reader as a book (configVersion migration included); a
// book bundle opens as the design of its whole configuration.

import type { PostextConfig } from '../types.js';
import { BOOK_OWN_KEYS } from '../defaults/bookKeys.js';
import { DESIGN_PARTS, type DesignPart } from '../designs/parts.js';
import { designFileIds, designPartsWithComposition, extractDesign, readDesignParts, type Design } from '../designs/design.js';
import { createBundle, type BundleFileData, type CreatedBundle } from './api.js';
import { readBundle } from './codec.js';
import { pickBundleMeta } from './manifest.js';
import type { BundleBlob, BundleFontFile, BundleIdScheme } from './types.js';
import { MANIFEST_FILE, openBundleZip } from './zip.js';

/** The largest design file read by default: 64 MiB, zipped or not. */
export const DESIGN_BUNDLE_MAX_BYTES = 64 * 1024 * 1024;

/** What a design bundle is made from. */
export interface DesignBundleInput {
  /** The design's name (`preset.json`'s `name`). */
  name: string;
  /** Stable identifier; defaults to a slug of `name`. */
  id?: string;
  description?: string;
  /** The language `name` and `description` are written in. */
  locale?: string;
  design: Design;
  /** The font files and colour profiles the design names, by `fileId`
   *  (see `designFileIds`). */
  files?: Record<string, BundleFileData> | Map<string, BundleFileData>;
  /** The name and description in more languages, by locale tag. */
  localized?: Record<string, { name?: string; description?: string }>;
  /** A picture of the design (PNG, JPEG, WebP, GIF or SVG). */
  thumbnail?: { data: BundleFileData; mime: string };
  /** Modification date of every file (see `CreateBundleInput.mtime`). */
  mtime?: Date | number | string;
}

/** Write a design bundle. */
export async function createDesignBundle(input: DesignBundleInput): Promise<CreatedBundle> {
  const localized = input.localized && input.locale
    ? Object.fromEntries(Object.entries(input.localized).filter(([l]) => l !== input.locale).map(([l, v]) => [l, {
      ...(v.name ? { name: v.name } : {}),
      ...(v.description ? { description: v.description } : {}),
    }]))
    : undefined;
  return createBundle({
    name: input.name,
    ...(input.id ? { id: input.id } : {}),
    ...(input.description ? { description: input.description } : {}),
    ...(input.locale ? { locale: input.locale } : {}),
    config: input.design.config,
    design: { parts: [...input.design.parts] },
    ...(input.files ? { files: input.files } : {}),
    ...(localized && Object.keys(localized).length > 0 ? { localized } : {}),
    ...(input.thumbnail ? { thumbnail: input.thumbnail } : {}),
    ...(input.mtime !== undefined ? { mtime: input.mtime } : {}),
  });
}

/** A design file, opened. */
export interface OpenedDesign {
  id: string;
  /** The name in the language asked for (else the manifest's). */
  name: string;
  description?: string;
  /** The design: its parts and their settings. `fileId`s are paths in the
   *  bundle, keys of `files`. */
  design: Design;
  /** The names and descriptions by locale: the manifest's own under its
   *  `locale`, then its `localized` ones. */
  names: Record<string, { name: string; description?: string }>;
  /** The font files and colour profiles the design names. */
  files: Map<string, Uint8Array>;
  /** The design's font files, one per family variant. */
  fonts: BundleFontFile[];
  /** The design's colour profiles. */
  blobs: BundleBlob[];
  /** True when the file was a book: its whole design was taken. */
  fromBook: boolean;
  warnings: string[];
}

/** Options of `openDesignBundle`. */
export interface OpenDesignOptions {
  /** The language to name the design in. */
  locale?: string;
  /** The largest file accepted, zipped and unzipped. Defaults to
   *  `DESIGN_BUNDLE_MAX_BYTES`. */
  maxBytes?: number;
  /** Accept a book bundle, read as the design of all its parts. Defaults
   *  to true. */
  acceptBooks?: boolean;
  /** How the files are named (`fileId`), as `readBundle` takes it.
   *  Defaults to their path in the bundle. */
  ids?: BundleIdScheme;
}

/** Folders a design bundle may carry besides its manifest. */
const DESIGN_FOLDERS = ['fonts/', 'profiles/'];

/** Open a design bundle (or a book bundle, as the design of its whole
 *  configuration). Throws when the file is too large, is no bundle, or is
 *  a design bundle that carries anything but fonts and profiles. */
export async function openDesignBundle(bytes: Uint8Array, options: OpenDesignOptions = {}): Promise<OpenedDesign> {
  const max = options.maxBytes ?? DESIGN_BUNDLE_MAX_BYTES;
  if (bytes.byteLength > max) throw new Error(`The design file is larger than ${Math.round(max / (1024 * 1024))} MB`);
  const zip = openBundleZip(bytes);
  let total = 0;
  for (const data of zip.files.values()) total += data.byteLength;
  if (total > max) throw new Error(`The design file unpacks to more than ${Math.round(max / (1024 * 1024))} MB`);
  const marker = (zip.manifest as { design?: unknown } | null)?.design;
  const isDesign = marker !== undefined;
  if (!isDesign && options.acceptBooks === false) throw new Error('Not a design file');
  if (isDesign) {
    const thumbnail = (zip.manifest as { thumbnail?: unknown }).thumbnail;
    for (const path of zip.files.keys()) {
      if (path === MANIFEST_FILE || path === thumbnail || DESIGN_FOLDERS.some((f) => path.startsWith(f))) continue;
      throw new Error(`A design file holds fonts and profiles only, not "${path}"`);
    }
  }
  const warnings: string[] = [];
  const read = await readBundle(zip.manifest, zip.readFile, {
    ...(options.locale ? { locale: options.locale } : {}),
    baseConfig: {},
    ...(options.ids ? { ids: options.ids } : {}),
    onWarning: (w) => warnings.push(w),
  });
  const { manifest } = read;
  const named: DesignPart[] = isDesign ? readDesignParts(manifest.design?.parts) : [...DESIGN_PARTS];
  if (named.length === 0) throw new Error('The design file names no part');
  // A book's configuration (or a design's, read with the book's rules):
  // the book's own settings are left out, as in any design.
  const source: PostextConfig = { ...(read.sharedConfig ?? read.config) };
  for (const key of BOOK_OWN_KEYS) delete source[key];
  const parts = designPartsWithComposition(named, source);
  const locale = manifest.locale ?? read.config.locale;
  const design = extractDesign(locale !== undefined ? { ...source, locale } : source, parts);
  const meta = pickBundleMeta(manifest, options.locale ?? manifest.locale ?? read.locale);
  const names: OpenedDesign['names'] = {};
  names[manifest.locale ?? read.locale] = { name: manifest.name, ...(manifest.description ? { description: manifest.description } : {}) };
  for (const [l, v] of Object.entries(manifest.localized ?? {})) {
    if (!v.name && !v.description) continue;
    names[l] = { name: v.name || manifest.name, ...(v.description || manifest.description ? { description: v.description || manifest.description } : {}) };
  }
  const { fontIds, blobIds } = designFileIds(design.config);
  const wanted = new Set([...fontIds, ...blobIds]);
  const fonts = read.fonts.filter((f) => wanted.has(f.fileId));
  const blobs = read.blobs.filter((b) => wanted.has(b.fileId));
  const files = new Map<string, Uint8Array>();
  for (const f of fonts) files.set(f.fileId, new Uint8Array(f.bytes));
  for (const b of blobs) files.set(b.fileId, new Uint8Array(b.bytes));
  return {
    id: manifest.id,
    name: meta.name,
    ...(meta.description ? { description: meta.description } : {}),
    design,
    names,
    files,
    fonts,
    blobs,
    fromBook: !isDesign,
    warnings,
  };
}
