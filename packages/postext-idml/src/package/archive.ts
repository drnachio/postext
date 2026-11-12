// An InDesign package, zipped: the folder InDesign's File › Package makes
// (the document as `.indd` and, with Include IDML ticked, as `.idml`; its
// fonts in `Document fonts/`; its linked pictures in `Links/`), sent as one
// `.zip`. The archive is listed once and its files are uncompressed when
// asked for. What a host gets from it: the IDML documents it holds, the
// bytes of a link a document names, and the font files.
//
// A zip that is itself an IDML package (a `designmap.xml` at its root) is
// a package of one document, the whole archive.

import { unzipSync, type UnzipFileInfo } from 'fflate';
import { IdmlError } from './errors.js';
import { FONT_EXTENSIONS } from './fontFace.js';
import { safePath } from './open.js';

export interface OpenIdmlArchiveOptions {
  /** Largest file read, uncompressed (default 1 GB). */
  maxFileBytes?: number;
  /** Largest archive read, uncompressed (default 4 GB). */
  maxTotalBytes?: number;
  /** Most entries (default 100 000). */
  maxFiles?: number;
}

/** A font file of the package, with its bytes. */
export interface IdmlFontFile {
  /** Its path inside the archive. */
  name: string;
  bytes: Uint8Array;
}

export interface IdmlArchive {
  /** The IDML documents, by path, those nearest the root first. `''` is
   *  the archive itself when it is an IDML package. */
  documents: string[];
  /** Every file, by path (folders and macOS's `__MACOSX/` and `._` files
   *  left out). */
  files: string[];
  /** InDesign documents (`.indd`) the archive holds: not readable, named
   *  for a host that says how to save them as IDML. */
  indd: string[];
  /** The paths of the font files. */
  fonts: string[];
  /** Uncompressed size of a file. */
  size(path: string): number | undefined;
  /** A file's bytes; for `''`, the archive's own. */
  bytes(path: string): Uint8Array | undefined;
  /** The bytes of the document at `path`. Throws for a path that is no
   *  document of the archive. */
  document(path: string): Uint8Array;
  /** The file a link of the document at `document` names: matched by file
   *  name; between files of the same name, the one whose path has the most
   *  folders in common with the link's, then the one nearest the
   *  document. */
  linkBytes(link: { name: string; uri?: string }, document?: string): Uint8Array | undefined;
  /** The font files, read. */
  fontFiles(): IdmlFontFile[];
}

/** The name a link or a file goes by: the last segment of its path,
 *  whichever way the slashes lean, percent-escapes read, in NFC lower
 *  case. */
export function linkKey(path: string): string {
  const last = path.split(/[\\/]/).pop() ?? '';
  let name = last;
  try {
    name = decodeURIComponent(last);
  } catch {
    // Not percent-escaped.
  }
  return name.normalize('NFC').toLowerCase();
}

/** The folders of a path or link URI, in NFC lower case, last first. */
function foldersOf(path: string): string[] {
  let p = path.replace(/^file:(\/\/)?/i, '');
  try {
    p = decodeURIComponent(p);
  } catch {
    // As it stands.
  }
  return p.normalize('NFC').toLowerCase().split(/[\\/]/).filter(Boolean).slice(0, -1).reverse();
}

const dirOf = (path: string): string => (path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '');
const junk = (path: string): boolean => path.startsWith('__MACOSX/') || /(^|\/)\._/.test(path) || /(^|\/)\.DS_Store$/.test(path);

/** Open a zipped InDesign package. Throws `IdmlError` for bytes that are
 *  no zip, or an archive over the limits. */
export function openIdmlArchive(input: Uint8Array | ArrayBuffer, options: OpenIdmlArchiveOptions = {}): IdmlArchive {
  const data = input instanceof Uint8Array ? input : new Uint8Array(input);
  const maxFile = options.maxFileBytes ?? 1024 * 1024 * 1024;
  const maxTotal = options.maxTotalBytes ?? 4 * 1024 * 1024 * 1024;
  const maxFiles = options.maxFiles ?? 100_000;
  if (data.length >= 4 && data[0] === 0x06 && data[1] === 0x06 && data[2] === 0xed && data[3] === 0xf5) throw new IdmlError('indd', 'This is an InDesign document (.indd), not a zipped package');
  if (data.length < 22 || !(data[0] === 0x50 && data[1] === 0x4b)) throw new IdmlError('notZip', 'The file is not a zip archive');

  const infos = new Map<string, UnzipFileInfo>();
  let total = 0;
  try {
    unzipSync(data, {
      filter: (f) => {
        if (infos.size >= maxFiles) throw new IdmlError('tooManyParts', `The archive holds more than ${maxFiles} files`);
        if (f.originalSize > maxFile) throw new IdmlError('tooLarge', `${f.name} is ${Math.round(f.originalSize / 1e6)} MB uncompressed, over the limit`, f.name);
        total += f.originalSize;
        if (total > maxTotal) throw new IdmlError('tooLarge', 'The archive is larger than the reader takes once uncompressed');
        const name = safePath(f.name);
        if (name && !f.name.endsWith('/') && !junk(name)) infos.set(name, f);
        return false;
      },
    });
  } catch (e) {
    if (e instanceof IdmlError) throw e;
    throw new IdmlError('notZip', `The zip archive cannot be read: ${e instanceof Error ? e.message : String(e)}`);
  }

  const files = [...infos.keys()];
  const depth = (p: string): number => p.split('/').length;
  const byDepth = (a: string, b: string): number => depth(a) - depth(b) || a.localeCompare(b);
  const selfPackage = infos.has('designmap.xml');
  const documents = selfPackage ? [''] : files.filter((p) => /\.idml$/i.test(p)).sort(byDepth);
  const indd = files.filter((p) => /\.indd$/i.test(p)).sort(byDepth);
  const inFontFolder = (p: string): boolean => /(^|\/)(document fonts|fonts)\//i.test(p);
  const fonts = files.filter((p) => FONT_EXTENSIONS.test(p) || (inFontFolder(p) && !/\.[a-z0-9]{1,5}$/i.test(p))).sort(byDepth);

  const cache = new Map<string, Uint8Array>();
  const bytes = (path: string): Uint8Array | undefined => {
    if (path === '') return data;
    const info = infos.get(path);
    if (!info) return undefined;
    let got = cache.get(path);
    if (!got) {
      try {
        got = unzipSync(data, { filter: (f) => f.name === info.name })[info.name];
      } catch (e) {
        throw new IdmlError('malformed', `${path} cannot be uncompressed: ${e instanceof Error ? e.message : String(e)}`, path);
      }
      if (!got) return undefined;
      // Pictures and fonts are read once each; only the small ones are kept.
      if (got.length < 64 * 1024 * 1024) cache.set(path, got);
    }
    return got;
  };

  // Files by the name a link goes by; documents and fonts are no links.
  const byKey = new Map<string, string[]>();
  for (const p of files) {
    if (/\.(idml|indd)$/i.test(p)) continue;
    const key = linkKey(p);
    const list = byKey.get(key);
    if (list) list.push(p);
    else byKey.set(key, [p]);
  }

  return {
    documents,
    files,
    indd,
    fonts,
    size: (path) => (path === '' ? data.length : infos.get(path)?.originalSize),
    bytes,
    document(path) {
      if (!documents.includes(path)) throw new IdmlError('missingPart', `${path} is no IDML document of the archive`, path);
      const b = bytes(path);
      if (!b) throw new IdmlError('missingPart', `${path} cannot be read`, path);
      return b;
    },
    linkBytes(link, document) {
      const candidates = byKey.get(linkKey(link.name)) ?? (link.uri ? byKey.get(linkKey(link.uri)) : undefined);
      if (!candidates?.length) return undefined;
      if (candidates.length === 1) return bytes(candidates[0]!);
      const wanted = link.uri ? foldersOf(link.uri) : [];
      const home = document ? dirOf(document) : '';
      const score = (p: string): [number, number, number] => {
        const have = foldersOf(p);
        let common = 0;
        while (common < have.length && common < wanted.length && have[common] === wanted[common]) common++;
        return [common, p.startsWith(home) ? 1 : 0, -depth(p)];
      };
      const best = [...candidates].sort((a, b) => {
        const [x, y] = [score(a), score(b)];
        return y[0] - x[0] || y[1] - x[1] || y[2] - x[2] || a.localeCompare(b);
      })[0]!;
      return bytes(best);
    },
    fontFiles() {
      return fonts.flatMap((name) => {
        const b = bytes(name);
        return b ? [{ name, bytes: b }] : [];
      });
    },
  };
}
