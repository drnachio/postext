import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Write `bytes` to `path`, creating its folder; "-" writes to stdout. */
export async function writeOut(path: string, bytes: Uint8Array | string): Promise<void> {
  if (path === '-') {
    await new Promise<void>((resolve, reject) => process.stdout.write(bytes, (err) => (err ? reject(err) : resolve())));
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}

export const byteLength = (data: Uint8Array | string) => (typeof data === 'string' ? Buffer.byteLength(data) : data.byteLength);

/** `name` with its extension replaced (or added). */
export function withExtension(name: string, ext: string): string {
  return name.replace(/\.[^./\\]*$/, '') + ext;
}
