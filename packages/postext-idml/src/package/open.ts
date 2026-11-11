// The IDML package as a zip: its entries read lazily, within limits. An
// IDML is a zip whose first entry is an uncompressed `mimetype`; InDesign
// reads packages zipped again by hand without it, so its absence is not
// an error when a `designmap.xml` is there.

import { strFromU8, unzipSync, type UnzipFileInfo } from 'fflate';
import { IdmlError } from './errors.js';

export const IDML_MIMETYPE = 'application/vnd.adobe.indesign-idml-package';

export interface OpenIdmlOptions {
  /** Largest part read, uncompressed (default 256 MB). */
  maxPartBytes?: number;
  /** Largest package read, uncompressed (default 2 GB). */
  maxTotalBytes?: number;
  /** Most entries (default 100 000). */
  maxParts?: number;
}

export interface IdmlPackage {
  /** Entry names, as stored. */
  names: string[];
  has(path: string): boolean;
  bytes(path: string): Uint8Array | undefined;
  /** A part as text (UTF-8, a byte order mark dropped). */
  text(path: string): string | undefined;
  mimetype?: string;
}

/** A path inside the package: no drive, no root, no `..`. */
export function safePath(path: string): string | undefined {
  const p = path.replace(/\\/g, '/');
  if (!p || p.startsWith('/') || /^[a-zA-Z]:/.test(p) || p.includes('\u0000')) return undefined;
  const parts = p.split('/');
  if (parts.some((s) => s === '..')) return undefined;
  return parts.filter((s) => s && s !== '.').join('/');
}

export function openIdml(input: Uint8Array | ArrayBuffer, options: OpenIdmlOptions = {}): IdmlPackage {
  const data = input instanceof Uint8Array ? input : new Uint8Array(input);
  const maxPart = options.maxPartBytes ?? 256 * 1024 * 1024;
  const maxTotal = options.maxTotalBytes ?? 2 * 1024 * 1024 * 1024;
  const maxParts = options.maxParts ?? 100_000;
  if (data.length < 22) throw new IdmlError('notZip', 'The file is too short to be an IDML package');
  // An InDesign document proper starts with its own GUID, not a zip.
  if (data[0] === 0x06 && data[1] === 0x06 && data[2] === 0xed && data[3] === 0xf5) throw new IdmlError('indd', 'This is an InDesign document (.indd): save it as IDML from InDesign (File › Save As, or Export) and import that file');
  if (!(data[0] === 0x50 && data[1] === 0x4b)) throw new IdmlError('notZip', 'The file is not a zip archive, so it is not an IDML package');

  // Sizes first (the central directory), then only what is asked for.
  const infos = new Map<string, UnzipFileInfo>();
  let total = 0;
  try {
    unzipSync(data, {
      filter: (f) => {
        if (infos.size >= maxParts) throw new IdmlError('tooManyParts', `The package holds more than ${maxParts} entries`);
        if (f.originalSize > maxPart) throw new IdmlError('tooLarge', `${f.name} is ${Math.round(f.originalSize / 1e6)} MB uncompressed, over the limit`, f.name);
        total += f.originalSize;
        if (total > maxTotal) throw new IdmlError('tooLarge', 'The package is larger than the reader takes once uncompressed');
        const name = safePath(f.name);
        if (name && !f.name.endsWith('/')) infos.set(name, f);
        return false;
      },
    });
  } catch (e) {
    if (e instanceof IdmlError) throw e;
    throw new IdmlError('notZip', `The zip archive cannot be read: ${e instanceof Error ? e.message : String(e)}`);
  }
  const cache = new Map<string, Uint8Array>();
  // The XML parts are many and small (a story each): they are uncompressed
  // together, in one pass over the archive, the first time one is asked
  // for. Pictures and other files are read one by one, when asked for.
  let partsRead = false;
  const isPart = (name: string) => /\.xml$/i.test(name) || name === 'mimetype';
  const inflate = (pick: (stored: string) => boolean, part?: string): void => {
    try {
      const got = unzipSync(data, { filter: (f) => pick(f.name) });
      for (const [stored, bytes] of Object.entries(got)) {
        const name = safePath(stored);
        if (name && infos.get(name)?.name === stored) cache.set(name, bytes);
      }
    } catch (e) {
      throw new IdmlError('malformed', `${part ?? 'The package'} cannot be uncompressed: ${e instanceof Error ? e.message : String(e)}`, part);
    }
  };
  const bytes = (path: string): Uint8Array | undefined => {
    const key = safePath(path);
    if (!key) return undefined;
    const info = infos.get(key);
    if (!info) return undefined;
    if (!cache.has(key)) {
      if (isPart(key) && !partsRead) {
        partsRead = true;
        const wanted = new Set([...infos].filter(([name]) => isPart(name)).map(([, f]) => f.name));
        inflate((stored) => wanted.has(stored));
      } else inflate((stored) => stored === info.name, key);
    }
    return cache.get(key);
  };
  const text = (path: string): string | undefined => {
    const b = bytes(path);
    if (!b) return undefined;
    const s = strFromU8(b);
    return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
  };
  const mimetype = infos.has('mimetype') ? text('mimetype')?.trim() : undefined;
  if (!infos.has('designmap.xml')) {
    if (infos.has('word/document.xml')) throw new IdmlError('notIdml', 'This is a Word document, not an IDML package');
    if (infos.has('META-INF/container.xml') && infos.has('mimetype') && mimetype?.includes('epub')) throw new IdmlError('notIdml', 'This is an EPUB, not an IDML package');
    if (infos.has('preset.json')) throw new IdmlError('notIdml', 'This is a Postext book (.postext), not an IDML package');
    throw new IdmlError('notIdml', 'The archive has no designmap.xml, so it is not an IDML package');
  }
  if (mimetype !== undefined && mimetype !== IDML_MIMETYPE && !mimetype.startsWith('application/vnd.adobe.indesign-idm')) {
    throw new IdmlError('notIdml', `The package says it is ${mimetype.slice(0, 80)}, not IDML`);
  }
  return { names: [...infos.keys()], has: (p) => infos.has(safePath(p) ?? '\u0000'), bytes, text, ...(mimetype !== undefined ? { mimetype } : {}) };
}
