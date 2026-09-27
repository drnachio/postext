// Edited presets: a preset opened in the sandbox is read-only at its source,
// so the edits made to it are kept as a draft — the book's own saved working
// copy — in the 'presetDrafts' object store, one per preset and content
// locale. Opening the preset again restores its draft; a preset without one
// loads its original. "Restore the original" drops the draft.
//
// A draft is a project-shaped record (chapters, active chapter, canvas
// scope, configuration, resource records) plus the snapshot the preset was
// applied with, which keeps telling an edited book from the original and a
// bundle that changed on its source from local edits (see presets/watch.ts).
// Its binary payloads stay where the preset wrote them (`preset:<id>:…`
// blobs and fonts, reference-counted by the provider's GC like a project's),
// except when a later apply of the same preset brings other bytes under the
// same id: `preserveDraftBlobs` then moves the draft's copy aside first.

import type { Resource } from 'postext';
import { stripConfigDefaults } from 'postext';
import type { PostextConfig } from 'postext';
import type { AppliedPresetSnapshot } from '../presets/types';
import { isDocumentUntouched, type DocumentHashSource } from '../presets/hash';
import { PRESET_DRAFTS_STORE, hasIndexedDB, runInStore, type BlobRecord } from './blobStore';
import { remapContentFileIds } from './projectFiles';
import { PROJECT_RECORD_VERSION, migrateConfig } from './projectMigration';
import { referencedFileIds, type ProjectContent } from './projects';

export interface PresetDraftRecord extends ProjectContent {
  /** Numbered as project records are (the engine's configuration rules),
   *  so a configuration saved under older rules is migrated on read. */
  version: typeof PROJECT_RECORD_VERSION;
  /** Storage key: {@link presetDraftKey}. */
  key: string;
  presetId: string;
  /** The content locale the preset was applied in (`LoadedPreset.locale`);
   *  empty for a snapshot that predates locale switching. */
  locale: string;
  /** What the preset applied when this book was opened from it: the
   *  baseline "edited" and "changed on its source" are measured against. */
  snapshot: AppliedPresetSnapshot;
  /** The preset's own configuration as applied (the Design panel's reset
   *  baseline), stored stripped of defaults. */
  baseConfig?: PostextConfig;
  updatedAt: number;
}

/** What the UI lists of a draft. */
export interface PresetDraftSummary {
  key: string;
  presetId: string;
  locale: string;
  updatedAt: number;
}

export function presetDraftKey(presetId: string, locale: string | undefined): string {
  return `${presetId}::${locale ?? ''}`;
}

export function toDraftSummary(r: PresetDraftRecord): PresetDraftSummary {
  return { key: r.key, presetId: r.presetId, locale: r.locale, updatedAt: r.updatedAt };
}

function isDraftRecord(v: unknown): v is PresetDraftRecord {
  const r = v as Partial<PresetDraftRecord> | null;
  return !!r && typeof r === 'object' && typeof r.key === 'string' && typeof r.presetId === 'string'
    && Array.isArray(r.chapters) && r.chapters.length > 0 && typeof r.activeChapterId === 'string'
    && Array.isArray(r.resources) && !!r.snapshot && typeof r.config === 'object';
}

/** A stored draft in today's terms (its configurations migrated like a
 *  project's), or null when it cannot be read. */
export function readDraftRecord(raw: unknown): PresetDraftRecord | null {
  if (!isDraftRecord(raw)) return null;
  const markdown = raw.chapters.map((c) => c.markdown);
  const version = (raw as { version?: unknown }).version;
  return {
    ...raw,
    version: PROJECT_RECORD_VERSION,
    config: migrateConfig(raw.config, version, markdown),
    ...(raw.baseConfig ? { baseConfig: migrateConfig(raw.baseConfig, version, markdown) } : {}),
  };
}

/** Every stored draft; empty without IndexedDB or on any failure. */
export function listPresetDrafts(): Promise<PresetDraftRecord[]> {
  if (!hasIndexedDB()) return Promise.resolve([]);
  return runInStore(PRESET_DRAFTS_STORE, 'readonly', (store) => store.getAll() as IDBRequest<unknown[]>)
    .then((v) => (v ?? []).map(readDraftRecord).filter((r): r is PresetDraftRecord => r !== null))
    .catch(() => []);
}

export function getPresetDraft(key: string): Promise<PresetDraftRecord | null> {
  if (!hasIndexedDB()) return Promise.resolve(null);
  return runInStore(PRESET_DRAFTS_STORE, 'readonly', (store) => store.get(key) as IDBRequest<unknown>)
    .then((v) => readDraftRecord(v))
    .catch(() => null);
}

export function putPresetDraft(record: PresetDraftRecord): Promise<void> {
  const stored: PresetDraftRecord = {
    ...record,
    version: PROJECT_RECORD_VERSION,
    config: stripConfigDefaults(record.config),
    ...(record.baseConfig ? { baseConfig: stripConfigDefaults(record.baseConfig) } : {}),
  };
  return runInStore(PRESET_DRAFTS_STORE, 'readwrite', (store) => store.put(stored) as IDBRequest<IDBValidKey>)
    .then(() => undefined);
}

export function deletePresetDraft(key: string): Promise<void> {
  if (!hasIndexedDB()) return Promise.resolve();
  return runInStore(PRESET_DRAFTS_STORE, 'readwrite', (store) => store.delete(key) as IDBRequest<undefined>)
    .then(() => undefined);
}

export interface DraftSaveInput {
  activeProjectId: string | null;
  activePresetId: string;
  /** The snapshot of the preset on screen (`presetApplied`). */
  snapshot: AppliedPresetSnapshot | null;
  content: DocumentHashSource;
  /** The draft the book on screen was opened from or last saved to. Only
   *  that one may be dropped when the book reads as the original again (the
   *  edits were undone): a preset applied afresh while a draft exists must
   *  never delete it. */
  liveDraftKey: string | null;
}

export type DraftSaveDecision =
  | { action: 'none' }
  | { action: 'put'; key: string }
  | { action: 'delete'; key: string };

/** What the working-copy save does for a preset on screen: write its draft
 *  (edited), drop it (the edits were undone), or nothing (a project, a
 *  preset still loading, an untouched original). Pure. */
export function decideDraftSave(input: DraftSaveInput): DraftSaveDecision {
  const { snapshot } = input;
  if (input.activeProjectId !== null) return { action: 'none' };
  if (!snapshot || snapshot.presetId !== input.activePresetId) return { action: 'none' };
  const key = presetDraftKey(snapshot.presetId, snapshot.locale);
  if (isDocumentUntouched(input.content, snapshot)) {
    return input.liveDraftKey === key ? { action: 'delete', key } : { action: 'none' };
  }
  return { action: 'put', key };
}

/** File id a draft's own copy of a preset payload is kept under. */
export function draftFileId(draftKey: string, fileId: string): string {
  return `draft:${draftKey}:${fileId}`;
}

function sameBytes(a: ArrayBuffer, b: ArrayBuffer): boolean {
  if (a.byteLength !== b.byteLength) return false;
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}

export interface PreserveDraftBlobsDeps {
  listDrafts: () => Promise<PresetDraftRecord[]>;
  getBlob: (fileId: string) => Promise<BlobRecord | null>;
  putBlobAt: (fileId: string, bytes: ArrayBuffer, contentType: string) => Promise<unknown>;
  putDraft: (record: PresetDraftRecord) => Promise<void>;
}

/** Before a preset's payloads are written over the stored ones (a fresh
 *  apply writes every blob under its deterministic `preset:<id>:…` id),
 *  give every draft that points at a blob about to change its own copy of
 *  the bytes it was edited with, and repoint the draft there. A blob whose
 *  bytes do not change (the usual case: the same file of the same bundle)
 *  stays shared. `exceptKey` names a draft being discarded by this apply.
 *  Resolves to the drafts rewritten. */
export async function preserveDraftBlobs(
  incoming: readonly { fileId: string; bytes: ArrayBuffer }[],
  deps: PreserveDraftBlobsDeps,
  exceptKey?: string,
): Promise<PresetDraftRecord[]> {
  if (incoming.length === 0) return [];
  const drafts = (await deps.listDrafts()).filter((d) => d.key !== exceptKey);
  if (drafts.length === 0) return [];
  const byId = new Map(incoming.map((b) => [b.fileId, b.bytes]));
  // Which stored blobs change, read once each however many drafts share them.
  const changed = new Map<string, BlobRecord | null>();
  const rewritten: PresetDraftRecord[] = [];
  for (const draft of drafts) {
    const refs = [...referencedFileIds(draft).blobIds].filter((id) => byId.has(id));
    const moves = new Map<string, string>();
    for (const id of refs) {
      if (!changed.has(id)) {
        const stored = await deps.getBlob(id).catch(() => null);
        changed.set(id, stored && !sameBytes(stored.bytes, byId.get(id)!) ? stored : null);
      }
      const old = changed.get(id);
      if (!old) continue;
      const to = draftFileId(draft.key, id);
      await deps.putBlobAt(to, old.bytes, old.contentType);
      moves.set(id, to);
    }
    if (moves.size === 0) continue;
    const next = remapDraftBlobs(draft, moves);
    await deps.putDraft(next);
    rewritten.push(next);
  }
  return rewritten;
}

/** The draft with the given blob ids replaced (fonts untouched). Pure. */
export function remapDraftBlobs(draft: PresetDraftRecord, moves: ReadonlyMap<string, string>): PresetDraftRecord {
  const { content } = remapContentFileIds(draft, (old, kind) => (kind === 'blob' ? moves.get(old) ?? old : old));
  return { ...draft, resources: content.resources as Resource[] };
}
