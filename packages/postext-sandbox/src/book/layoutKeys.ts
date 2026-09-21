// Fingerprints of a chapter layout's inputs. A layout record is only valid
// for the configuration, resources and engine it was built with; comparing
// fingerprints (rather than object identity) lets a record persisted in
// storage or carried by a bundle stay current across sessions.

import { stripConfigDefaults } from 'postext';
import type { LayoutContinuation, PostextConfig, Resource } from 'postext';
import { version as ENGINE_VERSION } from 'postext/package.json';

/** Bumped by hand when the record shape or the layout semantics change
 *  between engine releases (development builds share a version). */
const RECORD_FORMAT = 3;

/** The layout engine a record was built with (the `postext` version and
 *  the record format). A record from another is recomputed. */
export const ENGINE_KEY = `${ENGINE_VERSION}/${RECORD_FORMAT}`;

/** Storage-local fields that do not shape a layout: the ids of stored files
 *  (remapped when a bundle is imported), timestamps, and the custom font
 *  registry (families are referenced by name; a bundle rebuilds the list
 *  with its own file ids and names). */
const VOLATILE_KEYS = new Set(['fileId', 'pdfFileId', 'createdAt', 'updatedAt', 'customFonts']);

/** JSON with sorted object keys and the volatile fields left out, so equal
 *  content gives equal text whatever the object came through. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, function replacer(this: unknown, key: string, v: unknown) {
    if (VOLATILE_KEYS.has(key)) return undefined;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) sorted[k] = (v as Record<string, unknown>)[k];
      return sorted;
    }
    return v;
  });
}

/** djb2 over a string, as 8 hex digits: short enough to store per record,
 *  distinct enough to tell configurations apart. */
function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, '0') + text.length.toString(16);
}

/** Two independent 32-bit hashes side by side: a document cache keyed by
 *  the text must not confuse two chapters. */
function hashWide(text: string): string {
  let a = 5381;
  let b = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = ((a << 5) + a + c) | 0;
    b = (c + (b << 6) + (b << 16) - b) | 0;
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0') + text.length.toString(16);
}

/** Fingerprint of everything one build of a chapter depends on — the key
 *  the worker's document cache is looked up by. Fonts are left out on
 *  purpose: the worker drops its cache when a face is (un)registered. */
export function layoutCacheKey(input: {
  markdown: string;
  metadata: unknown;
  config: PostextConfig;
  resources: readonly Resource[];
  continuation: LayoutContinuation | undefined;
  continuationKey: string;
  outlineKey: string;
}): string {
  const c = input.continuation;
  return [
    hashWide(input.markdown),
    hashWide(JSON.stringify(input.metadata ?? null)),
    configKeyOf(input.config),
    resourcesKeyOf(input.resources),
    input.continuationKey,
    c?.pageIndexOffset ?? '',
    c?.pageNumbering?.startAt ?? '',
    c?.pageNumbering?.format ?? '',
    input.outlineKey,
  ].join('|');
}

const configKeys = new WeakMap<PostextConfig, string>();
const resourceKeys = new WeakMap<readonly Resource[], string>();

/** Fingerprint of everything in `config` a layout depends on. Cached per
 *  object, so a plan re-derived on every state change pays nothing. */
export function configKeyOf(config: PostextConfig): string {
  let key = configKeys.get(config);
  if (key === undefined) {
    key = hash(stableStringify(stripConfigDefaults(config)));
    configKeys.set(config, key);
  }
  return key;
}

/** Fingerprint of the resource records (captions, sizes, placement — not
 *  the stored files' ids). Order-independent: a preset applies its
 *  resources in manifest order while storage hands them back sorted by
 *  id, and a layout depends on the set, never on its order. */
export function resourcesKeyOf(resources: readonly Resource[]): string {
  let key = resourceKeys.get(resources);
  if (key === undefined) {
    const sorted = [...resources].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    key = hash(stableStringify(sorted));
    resourceKeys.set(resources, key);
  }
  return key;
}
