// Persistence for resource records (issue #49). The JSON records live in the
// 'resources' object store of the shared `postext-sandbox` IndexedDB database;
// their binary payloads live in the 'blobs' store (see blobStore.ts) and are
// referenced by `fileId`.

import type { Resource } from 'postext';
import { RESOURCES_STORE, runInStore, deleteBlob, hasIndexedDB } from './blobStore';

/** Load every stored resource. Returns an empty array when IndexedDB is
 *  unavailable rather than rejecting, so callers can start with no resources
 *  in private-browsing contexts. */
export function loadResources(): Promise<Resource[]> {
  if (!hasIndexedDB()) return Promise.resolve([]);
  return runInStore(RESOURCES_STORE, 'readonly', (store) =>
    store.getAll() as IDBRequest<Resource[]>,
  )
    .then((v) => v ?? [])
    .catch(() => []);
}

export function saveResource(resource: Resource): Promise<void> {
  return runInStore(RESOURCES_STORE, 'readwrite', (store) =>
    store.put(resource) as IDBRequest<IDBValidKey>,
  ).then(() => undefined);
}

/** Delete a resource by id. When `cascadeBlobs` is true, any binary payload
 *  referenced by the resource (bitmap/svg `fileId`) is deleted too. */
export async function deleteResource(id: string, cascadeBlobs = false): Promise<void> {
  if (cascadeBlobs) {
    const existing = await getResource(id).catch(() => null);
    if (existing) {
      const fileId = existing.bitmap?.fileId ?? existing.svg?.fileId;
      if (fileId) await deleteBlob(fileId).catch(() => undefined);
    }
  }
  await runInStore(RESOURCES_STORE, 'readwrite', (store) =>
    store.delete(id) as IDBRequest<undefined>,
  ).then(() => undefined);
}

function getResource(id: string): Promise<Resource | null> {
  return runInStore(RESOURCES_STORE, 'readonly', (store) =>
    store.get(id) as IDBRequest<Resource | undefined>,
  ).then((value) => value ?? null);
}
