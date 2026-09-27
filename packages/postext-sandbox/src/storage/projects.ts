// Local projects: user-owned documents kept in the 'projects' object store of
// the shared `postext-sandbox` IndexedDB database. A record carries the three
// working slices (markdown, config, resource records); the binary payloads it
// references (resource blobs, font files) stay in their own stores, keyed by
// `fileId`, and are reference-counted across every project by the GC in the
// provider (see `referencedFileIds`).

import type { PostextConfig, Resource } from 'postext';
import { stripConfigDefaults } from 'postext';
import type { BookContent } from '../book/types';
import { PROJECTS_STORE, hasIndexedDB, runInStore, withTransaction } from './blobStore';
import { generateId } from './ids';
import { PROJECT_RECORD_VERSION, migrateProjectRecord, type MigrationDeps } from './projectMigration';

/** The three working slices a project owns: its chapters (with the active
 *  one), the configuration and the resource records. */
export interface ProjectContent extends BookContent {
  config: PostextConfig;
  resources: Resource[];
}

/** A project's cover picture: the image shown beside its name in the
 *  projects panel, kept as a blob of its own (never a resource of the
 *  book). Cloning a showcase preset adopts the bundle's `thumbnail`; an
 *  export writes it back under that name. */
export interface ProjectThumbnail {
  fileId: string;
  /** Media type of the stored bytes (`image/jpeg`, `image/svg+xml`…). */
  mime: string;
}

export interface ProjectRecord extends ProjectContent {
  /** Record shape; legacy records (single `markdown`) are migrated on read. */
  version: typeof PROJECT_RECORD_VERSION;
  /** Storage key; a random UUID, never shown to the user. */
  id: string;
  name: string;
  description?: string;
  locale?: string;
  /** Manifest id written on export. Kept from an imported bundle (or the
   *  preset the project was duplicated from); otherwise derived from the name
   *  at export time. */
  bundleId?: string;
  /** Preset the project descends from, when any; Reset restores it. */
  sourcePresetId?: string;
  /** Cover picture, when the project has one (see {@link ProjectThumbnail}). */
  thumbnail?: ProjectThumbnail;
  /** Where an imported book came from, when a link opened it: the host's
   *  hash key, the id and the locale (`recipe:<slug>:<lang>`, see
   *  `hashBundles`). The same link opens this project again instead of
   *  importing a second copy. */
  origin?: string;
  createdAt: number;
  updatedAt: number;
}

export type ProjectSummary = Pick<
  ProjectRecord,
  'id' | 'name' | 'description' | 'locale' | 'bundleId' | 'sourcePresetId' | 'thumbnail' | 'origin' | 'createdAt' | 'updatedAt'
> & { chapterCount: number };

export function toSummary(r: ProjectRecord): ProjectSummary {
  const { id, name, description, locale, bundleId, sourcePresetId, thumbnail, origin, createdAt, updatedAt } = r;
  return { id, name, description, locale, bundleId, sourcePresetId, thumbnail, ...(origin ? { origin } : {}), createdAt, updatedAt, chapterCount: r.chapters.length };
}

export function generateProjectId(): string {
  return generateId('project');
}

export function generateChapterId(): string {
  return generateId('chapter');
}

const DEFAULT_MIGRATION: MigrationDeps = { ids: generateChapterId, untitled: (n) => `Chapter ${n}` };

/** Every stored project, oldest first, migrated to the current record
 *  shape. Empty (not rejected) without IndexedDB so the sandbox still works
 *  in preset-only mode. */
export function listProjects(migration: MigrationDeps = DEFAULT_MIGRATION): Promise<ProjectRecord[]> {
  if (!hasIndexedDB()) return Promise.resolve([]);
  return runInStore(PROJECTS_STORE, 'readonly', (store) =>
    store.getAll() as IDBRequest<unknown[]>,
  )
    .then((v) => (v ?? [])
      .map((raw) => migrateProjectRecord(raw, migration))
      .filter((r): r is ProjectRecord => r !== null)
      .sort((a, b) => a.createdAt - b.createdAt))
    .catch(() => []);
}

export function getProject(id: string, migration: MigrationDeps = DEFAULT_MIGRATION): Promise<ProjectRecord | null> {
  return runInStore(PROJECTS_STORE, 'readonly', (store) =>
    store.get(id) as IDBRequest<unknown>,
  ).then((v) => (v === undefined ? null : migrateProjectRecord(v, migration)));
}

/** Write a record as-is (config stored stripped of defaults, like
 *  localStorage, so records stay small and survive default changes). */
export function putProject(record: ProjectRecord): Promise<void> {
  const stored: ProjectRecord = { ...record, version: PROJECT_RECORD_VERSION, config: stripConfigDefaults(record.config) };
  return runInStore(PROJECTS_STORE, 'readwrite', (store) =>
    store.put(stored) as IDBRequest<IDBValidKey>,
  ).then(() => undefined);
}

export type ProjectPatch = Partial<Omit<ProjectRecord, 'id' | 'createdAt'>>;

/** Merge `patch` into a stored record and bump `updatedAt`, in one
 *  transaction: the autosave and a background write (a cover captured
 *  from the first page) may update the same record at once, and neither
 *  may drop what the other wrote. `patch` may be a function of the stored
 *  record; returning null leaves it untouched (and resolves to it). */
export function updateProject(
  id: string,
  patch: ProjectPatch | ((existing: ProjectRecord) => ProjectPatch | null),
): Promise<ProjectRecord | null> {
  return withTransaction(PROJECTS_STORE, 'readwrite', async (store) => {
    const raw = await new Promise<unknown>((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
    });
    const existing = raw === undefined ? null : migrateProjectRecord(raw, DEFAULT_MIGRATION);
    if (!existing) return null;
    const changes = typeof patch === 'function' ? patch(existing) : patch;
    if (!changes) return existing;
    const next: ProjectRecord = { ...existing, ...changes, id, createdAt: existing.createdAt, updatedAt: Date.now() };
    store.put({ ...next, version: PROJECT_RECORD_VERSION, config: stripConfigDefaults(next.config) });
    return next;
  });
}

export function deleteProject(id: string): Promise<void> {
  return runInStore(PROJECTS_STORE, 'readwrite', (store) =>
    store.delete(id) as IDBRequest<undefined>,
  ).then(() => undefined);
}

export interface ReferencedFileIds {
  blobIds: Set<string>;
  fontIds: Set<string>;
}

/** File ids a content slice points at: bitmap/SVG blobs and custom-font
 *  variants. Pure. */
export function referencedFileIds(content: { resources: Resource[]; config: PostextConfig; thumbnail?: ProjectThumbnail }): ReferencedFileIds {
  const blobIds = new Set<string>();
  const fontIds = new Set<string>();
  for (const r of content.resources) {
    const fileId = r.bitmap?.fileId ?? r.svg?.fileId;
    if (fileId) blobIds.add(fileId);
    // An SVG's vector print master is a blob of its own.
    if (r.svg?.pdfFileId) blobIds.add(r.svg.pdfFileId);
  }
  // The cover picture is a blob of the project, referenced by no resource.
  if (content.thumbnail) blobIds.add(content.thumbnail.fileId);
  for (const family of content.config.customFonts ?? []) {
    for (const v of family.variants) fontIds.add(v.fileId);
  }
  return { blobIds, fontIds };
}

/** Union of `referencedFileIds` over every stored project. */
export async function collectProjectFileIds(): Promise<ReferencedFileIds> {
  const out: ReferencedFileIds = { blobIds: new Set(), fontIds: new Set() };
  for (const p of await listProjects()) {
    const refs = referencedFileIds(p);
    for (const id of refs.blobIds) out.blobIds.add(id);
    for (const id of refs.fontIds) out.fontIds.add(id);
  }
  return out;
}
