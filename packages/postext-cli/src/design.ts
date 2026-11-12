// Designs (#1523) on the command line: the parts a user names, a design
// file put on any book read (--design), and the files a design takes from
// a book.

import { readFileSync } from 'node:fs';
import { DESIGN_PARTS, applyDesign, designFileIds, isDesignPart, type Design, type DesignPart } from 'postext';
import { openDesignBundle } from 'postext/bundle';
import { CliError, UsageError } from './args';
import type { Book } from './input';

/** A design file read from disk may be as large as a book. */
const MAX_DESIGN_BYTES = 1024 * 1024 * 1024;

/** `--parts page,text,headings` (or `--design-parts`): the parts named,
 *  checked. Undefined when the option is not given. */
export function parseDesignParts(spec: string | undefined, option: string): DesignPart[] | undefined {
  if (spec === undefined) return undefined;
  const parts = spec.split(',').map((p) => p.trim()).filter(Boolean);
  const wrong = parts.filter((p) => !isDesignPart(p));
  if (wrong.length > 0) throw new UsageError(`--${option}: no part ${wrong.map((p) => `"${p}"`).join(', ')} (the parts: ${DESIGN_PARTS.join(', ')})`);
  if (parts.length === 0) throw new UsageError(`--${option} names no part`);
  return parts as DesignPart[];
}

/** Put the design in `path` (a design file, or a book's .postext) on the
 *  book: its parts (`parts` when given) over the book's settings, its
 *  font files and colour profile beside the book's. */
export async function applyDesignFile(book: Book, path: string, parts: DesignPart[] | undefined, warn: (message: string) => void): Promise<void> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(readFileSync(path));
  } catch (err) {
    throw new CliError(`--design: ${(err as Error).message}`);
  }
  const opened = await openDesignBundle(bytes, {
    locale: book.locale,
    maxBytes: MAX_DESIGN_BYTES,
    // Under names of their own: a design's fonts/x.woff2 is not the book's.
    ids: { font: (file) => `design/${file}`, blob: (file) => `design/${file}` },
  }).catch((err: Error) => {
    throw new CliError(`--design ${path}: ${err.message}`);
  });
  for (const w of opened.warnings) warn(`${path}: ${w}`);
  const chosen = parts ? parts.filter((p) => opened.design.parts.includes(p)) : opened.design.parts;
  if (chosen.length === 0) throw new CliError(`--design ${path}: none of the parts asked for is in the design (it holds ${opened.design.parts.join(', ')})`);
  book.config = applyDesign(book.config, opened.design, chosen);
  const carried = new Set(book.fonts.map((f) => f.fileId));
  for (const f of opened.fonts) if (!carried.has(f.fileId)) book.fonts.push(f);
  for (const [id, data] of opened.files) book.files.set(id, data);
}

/** The bytes of the files a design names, from the book. */
export function designFilesOf(book: Book, design: Design): Map<string, Uint8Array> {
  const { fontIds, blobIds } = designFileIds(design.config);
  const files = new Map<string, Uint8Array>();
  for (const id of [...fontIds, ...blobIds]) {
    const font = book.fonts.find((f) => f.fileId === id);
    const data = font ? new Uint8Array(font.bytes) : book.files.get(id);
    if (data) files.set(id, data);
  }
  return files;
}
