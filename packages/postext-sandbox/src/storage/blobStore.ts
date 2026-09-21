// Generic IndexedDB blob store for the sandbox. Binary payloads for resources
// (uploaded bitmaps, SVGs) are kept here, out-of-band from the JSON resource
// records (see resources.ts), and referenced by `fileId`.
//
// This module owns the shared `postext-sandbox` database open helper. Both the
// 'blobs' object store (here) and the 'resources' object store (resources.ts)
// are created in the same upgrade transaction so the DB version stays
// consistent regardless of which module opens the DB first.

export const DB_NAME = 'postext-sandbox';
export const DB_VERSION = 3;

export const BLOBS_STORE = 'blobs';
export const RESOURCES_STORE = 'resources';
/** Local projects (see projects.ts). Added in DB version 2. */
export const PROJECTS_STORE = 'projects';
/** Chapter layout records (see layouts.ts), keyed by chapter id. Added in
 *  DB version 3. */
export const LAYOUTS_STORE = 'layouts';

export interface BlobRecord {
  fileId: string;
  contentType: string;
  bytes: ArrayBuffer;
}

export function hasIndexedDB(): boolean {
  return typeof indexedDB !== 'undefined';
}

// One connection per tab, opened on first use and kept: opening the
// database for every operation cost a round trip each (a preset applies
// hundreds of blobs, a build reads hundreds back). Dropped when another
// tab upgrades the schema or the browser closes it, and reopened on demand.
let dbPromise: Promise<IDBDatabase> | null = null;

/** Open (and, on first use / version bump, create) the shared sandbox DB.
 *  Creates every object store the sandbox uses so callers never race on a
 *  missing store. The connection is shared and stays open. */
export function openSandboxDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = openSandboxDbFresh().then(
    (db) => {
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      db.onclose = () => {
        dbPromise = null;
      };
      return db;
    },
    (err) => {
      dbPromise = null;
      throw err;
    },
  );
  return dbPromise;
}

function openSandboxDbFresh(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(BLOBS_STORE)) {
        db.createObjectStore(BLOBS_STORE, { keyPath: 'fileId' });
      }
      if (!db.objectStoreNames.contains(RESOURCES_STORE)) {
        db.createObjectStore(RESOURCES_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(LAYOUTS_STORE)) {
        db.createObjectStore(LAYOUTS_STORE, { keyPath: 'chapterId' });
      }
      if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
        db.createObjectStore(PROJECTS_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open sandbox DB'));
  });
}

/** Run an operation against a single object store inside one transaction.
 *  Mirrors the pattern in fontStorage.ts. Rejects when IndexedDB is
 *  unavailable (e.g. some private-browsing modes). */
export function runInStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  op: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  if (!hasIndexedDB()) return Promise.reject(new Error('IndexedDB unavailable'));
  return withTransaction(storeName, mode, (store) =>
    new Promise<T>((resolve, reject) => {
      const out = op(store);
      out.onsuccess = () => resolve(out.result as T);
      out.onerror = () => reject(out.error ?? new Error('IndexedDB request failed'));
    }),
  );
}

/** Run `op` inside one transaction on `storeName`; resolves with `op`'s
 *  result once the transaction completes. A connection the browser closed
 *  behind our back is reopened once. */
export function withTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  op: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  if (!hasIndexedDB()) return Promise.reject(new Error('IndexedDB unavailable'));
  const attempt = (retry: boolean): Promise<T> => openSandboxDb().then((db) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(storeName, mode);
    } catch (err) {
      if (retry && (err as { name?: string } | null)?.name === 'InvalidStateError') {
        dbPromise = null;
        return attempt(false);
      }
      throw err;
    }
    return new Promise<T>((resolve, reject) => {
      let result: T;
      let failed = false;
      op(tx.objectStore(storeName)).then(
        (value) => { result = value; },
        (err) => {
          failed = true;
          reject(err);
          try { tx.abort(); } catch { /* already done */ }
        },
      );
      tx.oncomplete = () => { if (!failed) resolve(result); };
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
      tx.onabort = () => { if (!failed) reject(tx.error ?? new Error('IndexedDB transaction aborted')); };
    });
  });
  return attempt(true);
}

export function generateFileId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `blob-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Store bytes and return the generated `fileId`. */
export function putBlob(bytes: ArrayBuffer, contentType: string): Promise<string> {
  const record: BlobRecord = { fileId: generateFileId(), contentType, bytes };
  return runInStore(BLOBS_STORE, 'readwrite', (store) =>
    store.put(record) as IDBRequest<IDBValidKey>,
  ).then(() => record.fileId);
}

/** Store bytes under a caller-chosen `fileId`, overwriting any existing record.
 *  Used for seeding deterministic default resources idempotently (re-seeding
 *  reuses the same key instead of orphaning the previous blob). */
export function putBlobAt(
  fileId: string,
  bytes: ArrayBuffer,
  contentType: string,
): Promise<string> {
  const record: BlobRecord = { fileId, contentType, bytes };
  return runInStore(BLOBS_STORE, 'readwrite', (store) =>
    store.put(record) as IDBRequest<IDBValidKey>,
  ).then(() => fileId);
}

/** Store several records in one transaction (a preset's whole resource
 *  set), overwriting existing ones. */
export function putBlobsAt(records: readonly BlobRecord[]): Promise<void> {
  if (records.length === 0) return Promise.resolve();
  return withTransaction(BLOBS_STORE, 'readwrite', async (store) => {
    for (const record of records) store.put(record);
  });
}

export function getBlob(fileId: string): Promise<BlobRecord | null> {
  return runInStore(BLOBS_STORE, 'readonly', (store) =>
    store.get(fileId) as IDBRequest<BlobRecord | undefined>,
  ).then((value) => value ?? null);
}

export function deleteBlob(fileId: string): Promise<void> {
  return runInStore(BLOBS_STORE, 'readwrite', (store) =>
    store.delete(fileId) as IDBRequest<undefined>,
  ).then(() => undefined);
}

export function listBlobs(): Promise<BlobRecord[]> {
  return runInStore(BLOBS_STORE, 'readonly', (store) =>
    store.getAll() as IDBRequest<BlobRecord[]>,
  ).then((v) => v ?? []);
}

/** Every stored blob id, without loading the payloads. */
export function listBlobIds(): Promise<string[]> {
  return runInStore(BLOBS_STORE, 'readonly', (store) =>
    store.getAllKeys() as IDBRequest<IDBValidKey[]>,
  ).then((keys) => (keys ?? []).map(String));
}

/** Remove every blob whose id is not in `keepIds`. Safe when a blob is
 *  already gone or IndexedDB is unavailable. */
export async function pruneBlobs(keepIds: Set<string>): Promise<void> {
  if (!hasIndexedDB()) return;
  const ids = await listBlobIds().catch(() => [] as string[]);
  const toDelete = ids.filter((id) => !keepIds.has(id));
  await Promise.all(toDelete.map((id) => deleteBlob(id).catch(() => undefined)));
}
