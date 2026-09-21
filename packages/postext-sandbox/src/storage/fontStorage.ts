import type { CustomFontFormat } from 'postext';

const DB_NAME = 'postext-sandbox-fonts';
const DB_VERSION = 1;
const STORE = 'files';

export interface StoredFontFile {
  fileId: string;
  fileName: string;
  format: CustomFontFormat;
  buffer: ArrayBuffer;
}

function hasIndexedDB(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'fileId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open font store'));
  });
}

// One connection per tab, kept open (see blobStore.ts).
let dbPromise: Promise<IDBDatabase> | null = null;

function openShared(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = openDb().then(
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

function runInStore<T>(
  mode: IDBTransactionMode,
  op: (store: IDBObjectStore) => IDBRequest<T> | Promise<T>,
): Promise<T> {
  if (!hasIndexedDB()) return Promise.reject(new Error('IndexedDB unavailable'));
  const attempt = (retry: boolean): Promise<T> => openShared().then((db) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(STORE, mode);
    } catch (err) {
      if (retry && (err as { name?: string } | null)?.name === 'InvalidStateError') {
        dbPromise = null;
        return attempt(false);
      }
      throw err;
    }
    return new Promise<T>((resolve, reject) => {
      const store = tx.objectStore(STORE);
      const out = op(store);
      if (out instanceof Promise) {
        out.then(resolve, reject);
      } else {
        out.onsuccess = () => resolve(out.result as T);
        out.onerror = () => reject(out.error ?? tx.error ?? new Error('IndexedDB request failed'));
      }
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    });
  });
  return attempt(true);
}

/** Store several font files in one transaction (a preset's fonts). */
export function putFontFiles(files: readonly StoredFontFile[]): Promise<void> {
  if (files.length === 0) return Promise.resolve();
  return runInStore('readwrite', (store) => new Promise<void>((resolve, reject) => {
    let last: IDBRequest | null = null;
    for (const file of files) last = store.put(file);
    if (!last) { resolve(); return; }
    last.onsuccess = () => resolve();
    last.onerror = () => reject(last!.error ?? new Error('IndexedDB request failed'));
  }));
}

export function putFontFile(file: StoredFontFile): Promise<void> {
  return runInStore('readwrite', (store) => store.put(file) as IDBRequest<IDBValidKey>).then(
    () => undefined,
  );
}

export function getFontFile(fileId: string): Promise<StoredFontFile | null> {
  return runInStore('readonly', (store) =>
    store.get(fileId) as IDBRequest<StoredFontFile | undefined>,
  ).then((value) => value ?? null);
}

export function deleteFontFile(fileId: string): Promise<void> {
  return runInStore('readwrite', (store) => store.delete(fileId) as IDBRequest<undefined>).then(
    () => undefined,
  );
}

export function listFontFiles(): Promise<StoredFontFile[]> {
  return runInStore(
    'readonly',
    (store) => store.getAll() as IDBRequest<StoredFontFile[]>,
  ).then((v) => v ?? []);
}

export function generateFontFileId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `font-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function formatFromFilename(name: string): CustomFontFormat | null {
  const ext = name.toLowerCase().split('.').pop();
  switch (ext) {
    case 'woff2': return 'woff2';
    case 'woff': return 'woff';
    case 'ttf': return 'ttf';
    case 'otf': return 'otf';
    default: return null;
  }
}

/** Remove every stored file whose id is not in `keepIds`. Safe even if a
 *  file is already gone. */
export async function pruneFontFiles(keepIds: Set<string>): Promise<void> {
  if (!hasIndexedDB()) return;
  const all = await listFontFiles().catch(() => [] as StoredFontFile[]);
  const toDelete = all.filter((f) => !keepIds.has(f.fileId));
  await Promise.all(toDelete.map((f) => deleteFontFile(f.fileId).catch(() => undefined)));
}
