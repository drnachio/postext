// Generic IndexedDB blob store for the sandbox. Binary payloads for resources
// (uploaded bitmaps, SVGs) are kept here, out-of-band from the JSON resource
// records (see resources.ts), and referenced by `fileId`.
//
// This module owns the shared `postext-sandbox` database open helper. Both the
// 'blobs' object store (here) and the 'resources' object store (resources.ts)
// are created in the same upgrade transaction so the DB version stays
// consistent regardless of which module opens the DB first.

export const DB_NAME = 'postext-sandbox';
export const DB_VERSION = 1;

export const BLOBS_STORE = 'blobs';
export const RESOURCES_STORE = 'resources';

export interface BlobRecord {
  fileId: string;
  contentType: string;
  bytes: ArrayBuffer;
}

export function hasIndexedDB(): boolean {
  return typeof indexedDB !== 'undefined';
}

/** Open (and, on first use / version bump, create) the shared sandbox DB.
 *  Creates every object store the sandbox uses so callers never race on a
 *  missing store. */
export function openSandboxDb(): Promise<IDBDatabase> {
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
  return openSandboxDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const out = op(store);
        out.onsuccess = () => resolve(out.result as T);
        out.onerror = () => reject(out.error ?? tx.error ?? new Error('IndexedDB request failed'));
        tx.oncomplete = () => db.close();
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error('IndexedDB transaction failed'));
        };
      }),
  );
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
