// Chapter layout records (`ChapterLayout`: page counts, numbering, the
// outline) kept in the 'layouts' object store of the shared sandbox DB,
// keyed by chapter id — unique across projects and the working book, so one
// store serves them all. A record is plain data; whether it still applies is
// the planner's call (`chapterLayoutIsCurrent`), so reopening a book shows
// its pagination at once and only what changed is laid out again.

import type { ChapterLayout } from '../book/types';
import { LAYOUTS_STORE, hasIndexedDB, runInStore } from './blobStore';

/** The stored records of `chapterIds` (those that exist), by chapter id. */
export async function getChapterLayouts(chapterIds: readonly string[]): Promise<Record<string, ChapterLayout>> {
  if (!hasIndexedDB() || chapterIds.length === 0) return {};
  const wanted = new Set(chapterIds);
  const all = await runInStore<ChapterLayout[]>(LAYOUTS_STORE, 'readonly', (store) => store.getAll() as IDBRequest<ChapterLayout[]>);
  const out: Record<string, ChapterLayout> = {};
  for (const layout of all) if (wanted.has(layout.chapterId)) out[layout.chapterId] = layout;
  return out;
}

/** Write (or replace) records, in one transaction. */
export function putChapterLayouts(layouts: readonly ChapterLayout[]): Promise<void> {
  if (!hasIndexedDB() || layouts.length === 0) return Promise.resolve();
  return runInStore(LAYOUTS_STORE, 'readwrite', (store) => {
    let last: IDBRequest<IDBValidKey> | undefined;
    for (const layout of layouts) last = store.put(layout) as IDBRequest<IDBValidKey>;
    return last!;
  }).then(() => undefined);
}

export function deleteChapterLayouts(chapterIds: readonly string[]): Promise<void> {
  if (!hasIndexedDB() || chapterIds.length === 0) return Promise.resolve();
  return runInStore(LAYOUTS_STORE, 'readwrite', (store) => {
    let last: IDBRequest | undefined;
    for (const id of chapterIds) last = store.delete(id);
    return last!;
  }).then(() => undefined);
}

/** Drop the records of chapters no book holds any more (a deleted project,
 *  a replaced working book). */
export async function pruneChapterLayoutStore(keepChapterIds: ReadonlySet<string>): Promise<void> {
  if (!hasIndexedDB()) return;
  const keys = await runInStore<IDBValidKey[]>(LAYOUTS_STORE, 'readonly', (store) => store.getAllKeys());
  const stale = keys.filter((k): k is string => typeof k === 'string' && !keepChapterIds.has(k));
  await deleteChapterLayouts(stale);
}
