// `.postext` files: a preset bundle directory zipped. The codec lives in
// `postext/bundle`; re-exported here under the sandbox's module layout.

import { unzipSync } from 'fflate';
import { MANIFEST_FILE } from 'postext/bundle';

export { openBundleZip, zipBundle, POSTEXT_EXTENSION, POSTEXT_MIME, MANIFEST_FILE } from 'postext/bundle';
export type { OpenedBundleZip } from 'postext/bundle';

/** An archive entry that can be the bundle's manifest, read as
 *  `openBundleZip` reads paths (`\` separators, `./` prefixes, macOS
 *  resource forks and dot-files ignored). */
function manifestPath(name: string): string | null {
  const p = name.replace(/\\/g, '/').replace(/^(\.\/)+/, '').replace(/\/{2,}/g, '/');
  if (p.split('/').some((s) => s === '__MACOSX' || s.startsWith('.'))) return null;
  return p === MANIFEST_FILE || p.endsWith(`/${MANIFEST_FILE}`) ? p : null;
}

/** The parsed (not yet validated) `preset.json` of a `.postext` archive,
 *  located as `openBundleZip` locates it, without inflating any other
 *  file: what the import asks about (which languages the book carries)
 *  before it opens the whole archive once. Throws as `openBundleZip` does
 *  for bytes that are not a zip or hold no (or several) manifest. */
export function readBundleZipManifest(bytes: Uint8Array): unknown {
  let raw: Record<string, Uint8Array>;
  try {
    raw = unzipSync(bytes, { filter: (f) => manifestPath(f.name) !== null });
  } catch {
    throw new Error('Not a zip archive');
  }
  const found = new Map<string, Uint8Array>();
  for (const [name, data] of Object.entries(raw)) {
    const p = manifestPath(name);
    if (p !== null) found.set(p, data);
  }
  let data = found.get(MANIFEST_FILE);
  if (!data) {
    if (found.size === 0) throw new Error(`Bundle has no ${MANIFEST_FILE}`);
    if (found.size > 1) throw new Error(`Bundle contains several ${MANIFEST_FILE} files`);
    data = [...found.values()][0]!;
  }
  try {
    return JSON.parse(new TextDecoder().decode(data));
  } catch {
    throw new Error(`${MANIFEST_FILE} is not valid JSON`);
  }
}
