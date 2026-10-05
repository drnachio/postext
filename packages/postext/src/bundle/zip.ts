// `.postext` files: a bundle directory zipped. Reading tolerates the common
// ways such an archive gets made by hand (a top-level folder, macOS
// resource forks); writing produces the flat layout.

import { unzipSync, zipSync } from 'fflate';
import type { BundleFileReader } from './types';

export const POSTEXT_EXTENSION = '.postext';
export const POSTEXT_MIME = 'application/zip';
export const MANIFEST_FILE = 'preset.json';

export interface OpenedBundleZip {
  /** The parsed `preset.json` (not yet validated). */
  manifest: unknown;
  readFile: BundleFileReader;
  /** Directory prefix under which the bundle lives inside the archive
   *  (empty when `preset.json` sits at the root). */
  rootPrefix: string;
  /** Normalised paths of every file entry, prefix included. */
  entries: string[];
  /** Every file, keyed by its path relative to the bundle root. */
  files: Map<string, Uint8Array>;
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^(\.\/)+/, '').replace(/\/{2,}/g, '/');
}

function isIgnored(p: string): boolean {
  if (p.endsWith('/')) return true;
  const segments = p.split('/');
  return segments.some((s) => s === '__MACOSX' || s.startsWith('.'));
}

/** Resolve `path` relative to `root`, rejecting escapes. */
function joinInside(root: string, path: string): string {
  const cleaned = normalizePath(path);
  if (cleaned.split('/').includes('..')) throw new Error(`Invalid bundle path "${path}"`);
  return root + cleaned;
}

/** Unzip a `.postext` archive and locate its manifest. Throws when the
 *  bytes are not a zip or hold no (or several) `preset.json`. */
export function openBundleZip(bytes: Uint8Array): OpenedBundleZip {
  let raw: Record<string, Uint8Array>;
  try {
    raw = unzipSync(bytes);
  } catch {
    throw new Error('Not a zip archive');
  }
  const all = new Map<string, Uint8Array>();
  for (const [name, data] of Object.entries(raw)) {
    const p = normalizePath(name);
    if (!p || isIgnored(p)) continue;
    all.set(p, data);
  }

  let rootPrefix: string;
  if (all.has(MANIFEST_FILE)) {
    rootPrefix = '';
  } else {
    const nested = [...all.keys()].filter((p) => p.endsWith(`/${MANIFEST_FILE}`));
    if (nested.length === 0) throw new Error(`Bundle has no ${MANIFEST_FILE}`);
    if (nested.length > 1) throw new Error(`Bundle contains several ${MANIFEST_FILE} files`);
    rootPrefix = nested[0]!.slice(0, -MANIFEST_FILE.length);
  }

  const manifestBytes = all.get(rootPrefix + MANIFEST_FILE)!;
  let manifest: unknown;
  try {
    manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
  } catch {
    throw new Error(`${MANIFEST_FILE} is not valid JSON`);
  }

  const files = new Map<string, Uint8Array>();
  for (const [p, data] of all) {
    if (p.startsWith(rootPrefix)) files.set(p.slice(rootPrefix.length), data);
  }

  const readFile: BundleFileReader = async (path) => {
    const data = all.get(joinInside(rootPrefix, path));
    if (!data) throw new Error(`Missing bundle file "${path}"`);
    // fflate returns views over one shared buffer; copy so each file owns a
    // standalone ArrayBuffer (IndexedDB, transfer to a worker).
    return data.slice().buffer;
  };

  return { manifest, readFile, rootPrefix, entries: [...all.keys()], files };
}

const STORED_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'woff2', 'mp4', 'm4v', 'webm', 'ogv', 'mov']);

export interface ZipBundleOptions {
  /** Modification date written on every file of the archive. Unset: the
   *  time of the call, so two archives of the same files differ in those
   *  bytes. Pass a fixed date and the same files always give the same
   *  bytes. A zip keeps a date and time with no time zone, in two-second
   *  steps, from 1980 to 2099, and the date is written in the machine's
   *  local time. For bytes that match on every machine, build the date
   *  from local fields (`new Date(1980, 0, 1)`, the earliest a zip can
   *  hold): a timestamp or a string ending in `Z` names an instant, which
   *  falls on a different local time in each time zone. A date outside
   *  those years, in local time, throws. */
  mtime?: Date | number | string;
}

/** `mtime` as a date a zip entry can hold (its local time from 1980 to
 *  2099: the format keeps no time zone), else an error. */
function checkedZipDate(mtime: Date | number | string): Date {
  const date = new Date(mtime);
  const year = date.getFullYear();
  if (Number.isNaN(date.getTime()) || year < 1980 || year > 2099) {
    throw new Error(`zipBundle: mtime must be a date from 1980 to 2099 in local time (got ${String(mtime)})`);
  }
  return date;
}

/** Zip a bundle's files (path → bytes). Already-compressed payloads are
 *  stored as-is. */
export function zipBundle(files: Record<string, Uint8Array>, options: ZipBundleOptions = {}): Uint8Array {
  const mtime = options.mtime !== undefined ? checkedZipDate(options.mtime) : undefined;
  const input: Record<string, [Uint8Array, { level: 0 | 6; mtime?: Date }]> = {};
  for (const [path, data] of Object.entries(files)) {
    const ext = path.split('.').pop()?.toLowerCase() ?? '';
    input[path] = [data, { level: STORED_EXTENSIONS.has(ext) ? 0 : 6, ...(mtime ? { mtime } : {}) }];
  }
  return zipSync(input);
}
