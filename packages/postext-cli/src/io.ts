import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Create a folder and its parents. Bun on Windows throws EEXIST for a
 *  folder that exists even with `recursive` (`.` included). */
export function ensureDir(dir: string): void {
  if (existsSync(dir)) return;
  try {
    mkdirSync(dir, { recursive: true });
  } catch (err) {
    if (!existsSync(dir)) throw err;
  }
}

/** Write `bytes` to `path`, creating its folder; "-" writes to stdout. */
export async function writeOut(path: string, bytes: Uint8Array | string): Promise<void> {
  if (path === '-') {
    await new Promise<void>((resolve, reject) => process.stdout.write(bytes, (err) => (err ? reject(err) : resolve())));
    return;
  }
  ensureDir(dirname(path));
  writeFileSync(path, bytes);
}

/** Whether two files hold the same bytes (the same array, as a file read
 *  again unchanged is, or equal ones). */
export const sameBytes = (a: Uint8Array, b: Uint8Array): boolean =>
  a === b || (a.byteLength === b.byteLength && Buffer.from(a.buffer, a.byteOffset, a.byteLength).equals(Buffer.from(b.buffer, b.byteOffset, b.byteLength)));

/** Whether two sets of files by path hold the same files. */
export function sameFiles(a: ReadonlyMap<string, Uint8Array>, b: ReadonlyMap<string, Uint8Array>): boolean {
  if (a.size !== b.size) return false;
  for (const [path, bytes] of a) {
    const other = b.get(path);
    if (!other || !sameBytes(bytes, other)) return false;
  }
  return true;
}

export const byteLength = (data: Uint8Array | string) => (typeof data === 'string' ? Buffer.byteLength(data) : data.byteLength);

/** `name` with its extension replaced (or added). */
export function withExtension(name: string, ext: string): string {
  return name.replace(/\.[^./\\]*$/, '') + ext;
}
