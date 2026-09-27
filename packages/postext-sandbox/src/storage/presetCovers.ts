// Covers of sample books that ship none: a preset without a `thumbnail`
// gets a small picture of its first page the first time it is laid out on
// screen (see covers/autoCover.ts), kept here — in the 'presetCovers' object
// store — per preset and content locale, so each language of a bilingual
// bundle has its own. A preset is read-only at its source, so the cover
// never goes back to it; a project cloned from the preset, or an export of
// it, takes it as its own cover.

import { PRESET_COVERS_STORE, hasIndexedDB, runInStore, withTransaction } from './blobStore';
import { presetCoverKey } from '../covers/autoCover';

export interface PresetCoverRecord {
  /** {@link presetCoverKey} of the preset and locale. */
  key: string;
  presetId: string;
  locale: string;
  mime: string;
  bytes: ArrayBuffer;
  createdAt: number;
}

/** Every stored cover, by key, as data URLs (small pictures: an `<img>`
 *  shows them as they are). Empty without IndexedDB. */
export async function listPresetCovers(): Promise<Record<string, string>> {
  if (!hasIndexedDB()) return {};
  const rows = await runInStore(PRESET_COVERS_STORE, 'readonly', (store) =>
    store.getAll() as IDBRequest<PresetCoverRecord[]>,
  ).catch(() => [] as PresetCoverRecord[]);
  const out: Record<string, string> = {};
  for (const row of rows ?? []) {
    if (row && typeof row.key === 'string' && row.bytes) out[row.key] = bytesToDataUrl(row.bytes, row.mime);
  }
  return out;
}

/** The stored cover of a preset in `locale` (else in any of its locales),
 *  as bytes: what a copy or an export of the preset takes as its cover. */
export async function getPresetCover(presetId: string, locale: string | undefined): Promise<{ bytes: ArrayBuffer; mime: string } | null> {
  if (!hasIndexedDB()) return null;
  const rows = await runInStore(PRESET_COVERS_STORE, 'readonly', (store) =>
    store.getAll() as IDBRequest<PresetCoverRecord[]>,
  ).catch(() => [] as PresetCoverRecord[]);
  const own = (rows ?? []).filter((r) => r.presetId === presetId);
  const hit = own.find((r) => r.key === presetCoverKey(presetId, locale ?? '')) ?? own[0];
  return hit ? { bytes: hit.bytes, mime: hit.mime } : null;
}

/** Store a cover unless the preset already has one in that locale (a cover
 *  is never replaced). Resolves to whether it was written. */
export function putPresetCoverIfMissing(presetId: string, locale: string, bytes: ArrayBuffer, mime: string): Promise<boolean> {
  if (!hasIndexedDB()) return Promise.resolve(false);
  const key = presetCoverKey(presetId, locale);
  return withTransaction(PRESET_COVERS_STORE, 'readwrite', async (store) => {
    const existing = await new Promise<unknown>((resolve, reject) => {
      const req = store.getKey(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
    });
    if (existing !== undefined) return false;
    const record: PresetCoverRecord = { key, presetId, locale, mime, bytes, createdAt: Date.now() };
    store.put(record);
    return true;
  });
}

/** `data:` URL of `bytes`. */
export function bytesToDataUrl(bytes: ArrayBuffer, mime: string): string {
  const view = new Uint8Array(bytes);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < view.length; i += CHUNK) {
    binary += String.fromCharCode(...view.subarray(i, i + CHUNK));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}
