// Content hashes for the "is the document still what the preset applied?"
// question. They only need to be stable and cheap — collisions merely mean a
// local edit goes unnoticed for one poll — so a 32-bit FNV-1a over a stable
// JSON encoding is plenty.

import type { PostextConfig, Resource } from 'postext';
import { stripConfigDefaults } from 'postext';
import type { AppliedPresetSnapshot } from './types';

/** FNV-1a (32-bit) of a string's UTF-16 code units, as 8 hex digits. */
export function hashString(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    // h *= 16777619 without losing precision.
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** JSON with object keys sorted at every level; `undefined` values are
 *  dropped like `JSON.stringify` does, so a record round-tripped through
 *  storage encodes the same as the original. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value !== 'object' || value === null) return value;
  const src = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(src).sort()) {
    if (src[key] !== undefined) out[key] = sortKeys(src[key]);
  }
  return out;
}

export function hashMarkdown(markdown: string): string {
  return hashString(markdown);
}

/** Hash of the configuration with defaults stripped — the same shape the
 *  sandbox persists, so a config saved and reloaded hashes identically. */
export function hashConfig(config: PostextConfig): string {
  return hashString(stableStringify(stripConfigDefaults(config)));
}

/** Hash of the resource set without `createdAt`/`updatedAt` (fresh on every
 *  preset load) and independent of array order (IndexedDB returns records
 *  keyed by id). */
export function hashResources(resources: Resource[]): string {
  const records = resources
    .map(({ createdAt: _c, updatedAt: _u, ...rest }) => rest)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return hashString(stableStringify(records));
}

/** The slices of sandbox state a snapshot covers. */
export interface DocumentHashSource {
  markdown: string;
  config: PostextConfig;
  resources: Resource[];
}

/** True when the document, configuration and resource set still hash to what
 *  the snapshot recorded — i.e. the user has not changed anything since the
 *  preset was applied. Without a snapshot nothing can be asserted: false. */
export function isDocumentUntouched(
  state: DocumentHashSource,
  snapshot: AppliedPresetSnapshot | null | undefined,
): boolean {
  if (!snapshot) return false;
  return hashMarkdown(state.markdown) === snapshot.markdownHash
    && hashResources(state.resources) === snapshot.resourcesHash
    && hashConfig(state.config) === snapshot.configHash;
}
