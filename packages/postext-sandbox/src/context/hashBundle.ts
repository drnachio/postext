// Books a host links to by a fragment key of its own (`#recipe=ID&lang=L`,
// see `PostextSandboxProps.hashBundles`): the first visit fetches the
// `.postext` bundle the host names and imports it as a project recorded
// with the link's origin; every later visit finds that project and asks
// the reader whether to open it as it is (their edits are kept) or replace
// it with the published book, which may have been corrected since. Storage,
// the network and the question come in through `deps`, so the flow is
// testable as is.

import type { HashBundleResolver } from '../types/props';
import { hashBundleOrigin, type HashBundleRef } from '../storage/viewHash';

export interface OpenHashBundleDeps {
  resolve: HashBundleResolver;
  /** The project imported from `origin` before, if any. */
  findProject: (origin: string) => string | null;
  activate: (projectId: string) => Promise<void>;
  /** Asked when `projectId` was imported from the link before: true
   *  replaces it with a fresh import, false opens it as it is. Without it
   *  the copy is opened. */
  confirmReplace?: (projectId: string) => Promise<boolean>;
  /** Drops the copy a fresh import replaced (after the import opened). */
  removeProject?: (projectId: string) => Promise<void>;
  /** The bytes at `url`; null when the server has nothing there (404),
   *  so the next candidate is tried. Throws on a network failure. */
  fetchBytes: (url: string) => Promise<ArrayBuffer | null>;
  importBytes: (bytes: ArrayBuffer, fileName: string, origin: string) => Promise<string>;
  /** Origin of the page (`location.origin`): only URLs on it are fetched. */
  pageOrigin: string;
}

export interface OpenedHashBundle {
  projectId: string;
  imported: boolean;
  /** The project a fresh import replaced, when the reader asked for it. */
  replaced?: string;
}

export class HashBundleError extends Error {
  constructor(message: string, readonly reason: 'unknown' | 'not-found' | 'invalid') {
    super(message);
    this.name = 'HashBundleError';
  }
}

/** Whether `url` is a same-origin path the sandbox may fetch: a rooted
 *  path (`/cookbook/…`, not `//host/…`), or an absolute URL on the page's
 *  own origin. */
export function isSameOriginUrl(url: string, pageOrigin: string): boolean {
  if (!url || /[\\\s]/.test(url)) return false;
  if (url.startsWith('//')) return false;
  try {
    const resolved = new URL(url, pageOrigin);
    return resolved.origin === pageOrigin && (url.startsWith('/') || url.startsWith(pageOrigin + '/'));
  } catch {
    return false;
  }
}

const inFlight = new Map<string, Promise<OpenedHashBundle>>();

/** Open the book `ref` links to (see the module comment). Concurrent calls
 *  for the same link share one import. */
export function openHashBundle(ref: HashBundleRef, deps: OpenHashBundleDeps): Promise<OpenedHashBundle> {
  const origin = hashBundleOrigin(ref);
  const running = inFlight.get(origin);
  if (running) return running;
  const run = (async (): Promise<OpenedHashBundle> => {
    const existing = deps.findProject(origin);
    if (existing && !(deps.confirmReplace && await deps.confirmReplace(existing))) {
      await deps.activate(existing);
      return { projectId: existing, imported: false };
    }
    const resolved = deps.resolve(ref.id, ref.lang);
    const candidates = (resolved === null ? [] : typeof resolved === 'string' ? [resolved] : [...resolved])
      .filter((url) => isSameOriginUrl(url, deps.pageOrigin));
    if (candidates.length === 0) throw new HashBundleError(`No book "${ref.id}" for "${ref.key}"`, 'unknown');
    let failure: unknown = null;
    for (const url of candidates) {
      let bytes: ArrayBuffer | null;
      try {
        bytes = await deps.fetchBytes(url);
      } catch (err) {
        failure = err;
        continue;
      }
      if (!bytes) continue;
      try {
        const projectId = await deps.importBytes(bytes, `${ref.id}.postext`, origin);
        if (!existing) return { projectId, imported: true };
        // The copy goes once the fresh import is open (it is no longer
        // the book on screen); a failure to drop it leaves both.
        await deps.removeProject?.(existing).catch(() => undefined);
        return { projectId, imported: true, replaced: existing };
      } catch (err) {
        throw new HashBundleError(err instanceof Error ? err.message : String(err), 'invalid');
      }
    }
    throw failure instanceof Error ? failure : new HashBundleError(`Book "${ref.id}" not found`, 'not-found');
  })();
  inFlight.set(origin, run);
  const clear = () => { if (inFlight.get(origin) === run) inFlight.delete(origin); };
  run.then(clear, clear);
  return run;
}

/** `fetch` as `OpenHashBundleDeps.fetchBytes` wants it. */
export async function fetchBundleBytes(url: string): Promise<ArrayBuffer | null> {
  const res = await fetch(url, { cache: 'no-cache' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.arrayBuffer();
}
