import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayoutContinuation, PostextConfig, VDTDocument } from 'postext';
import { createBundle } from 'postext/bundle';
import { layOutBookChain } from './chain.js';
import { addChapter, cloneBook, newChapter, renameChapter } from './chapterOps.js';
import { ENGINE_KEY, pagesConfigKeyOf, resourcesKeyOf } from './layoutKeys.js';
import { createBookPlanner } from './pagination.js';
import { stitchDocuments } from './stitch.js';
import type { BookContent, BookStart, Chapter, ChapterLayout, ChapterPlan } from './types.js';
import { sandboxReducer, type SandboxState } from '../context/SandboxContext.js';
import { buildBundleFiles, parseBundle, planBundle } from '../presets/bundle.js';
import { openBundleZip, zipBundle } from '../presets/zip.js';
import type { PresetSummary } from '../presets/types.js';
import { loadBook, saveBook } from '../storage/persistence.js';
import { getPresetDraft, presetDraftKey, putPresetDraft, type PresetDraftRecord } from '../storage/presetDrafts.js';
import { getProject, putProject, updateProject, type ProjectRecord } from '../storage/projects.js';
import { PROJECT_RECORD_VERSION, normalizeBookContent } from '../storage/projectMigration.js';
import { snapshotForApply } from '../presets/apply.js';
import type { LoadedPreset } from '../presets/types.js';

// #695: a bundle that holds part of a longer book says where it starts
// (`preset.json`'s `start`). The Sandbox lays its first chapter out from
// there, keeps the start with the book and writes it back on export.

// The object stores, in memory: what `put` wrote is what `get` reads.
const rows = vi.hoisted(() => new Map<string, Map<string, unknown>>());
vi.mock('../storage/blobStore.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../storage/blobStore.js')>();
  const request = <T,>(result: T) => {
    const req = { result, error: null, onsuccess: null as null | (() => void), onerror: null as null | (() => void) };
    queueMicrotask(() => req.onsuccess?.());
    return req;
  };
  const storeOf = (name: string) => {
    if (!rows.has(name)) rows.set(name, new Map());
    const table = rows.get(name)!;
    return {
      put: (value: { id?: string; key?: string }) => {
        const key = (value.id ?? value.key)!;
        table.set(key, JSON.parse(JSON.stringify(value)));
        return request(key);
      },
      get: (key: string) => request(table.get(key)),
    } as unknown as IDBObjectStore;
  };
  return {
    ...actual,
    hasIndexedDB: () => true,
    withTransaction: <T,>(name: string, _mode: IDBTransactionMode, op: (store: IDBObjectStore) => Promise<T>) => op(storeOf(name)),
    runInStore: <T,>(name: string, _mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>) =>
      new Promise<T>((resolve) => {
        const out = op(storeOf(name));
        out.onsuccess = () => resolve(out.result);
      }),
  };
});

function installStorage() {
  const map = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
  };
  (globalThis as { window?: unknown }).window = { localStorage };
  return map;
}

beforeEach(() => rows.clear());
afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

const HEADINGS = { h1: 3, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };
const start: BookStart = { pageIndexOffset: 57, pageNumbering: { startAt: 58 }, headings: HEADINGS, part: { number: 'II', title: 'Fieldwork' } };
const config: PostextConfig = { headings: { levels: [{ level: 1, numberingTemplate: 'Chapter {1}' }] } };
const chapters: Chapter[] = [
  newChapter('a', 'Four', '# Four\n\nText of the fourth chapter.', 1),
  newChapter('b', 'Five', '# Five\n\nText of the fifth chapter.', 1),
];
const migration = { ids: () => 'new', untitled: (n: number) => `Chapter ${n}` };

function layoutFor(plan: ChapterPlan, pageCount: number): ChapterLayout {
  return {
    chapterId: plan.chapterId,
    markdown: chapters.find((c) => c.id === plan.chapterId)!.markdown,
    configKey: pagesConfigKeyOf(config),
    resourcesKey: resourcesKeyOf([]),
    engine: ENGINE_KEY,
    continuationKey: plan.continuationKey,
    pageCount,
    leadingBlankPages: 0,
    firstContentPageNumber: { delta: 0 },
    firstContentPageFormat: 'decimal',
    lastPageNumber: { delta: pageCount - 1 },
    lastPageFormat: 'decimal',
    outlinePages: [],
    outlineKey: '',
  };
}

describe('the planner seeds the first chapter with the book\'s start (#695)', () => {
  it('hands the first chapter the start and counts the next ones on from it', () => {
    const planner = createBookPlanner();
    const p0 = planner.plan(chapters, config, [], {}, start);
    expect(p0.byId.a!.continuation).toEqual(start);
    expect(p0.byId.a!.paginated).toBe(true);
    expect(p0.byId.a!.number).toBe(4);
    expect(p0.byId.a!.part).toEqual({ number: 'II', title: 'Fieldwork' });
    expect(p0.byId.b!.number).toBe(5);
    expect(p0.byId.b!.continuation?.headings?.h1).toBe(4);
    expect(p0.byId.b!.continuation?.part).toEqual({ number: 'II', title: 'Fieldwork' });
    expect(p0.byId.b!.paginated).toBe(false);
    // Once the first chapter is laid out, the second starts after the
    // pages before the book and its own.
    const p1 = planner.plan(chapters, config, [], { a: layoutFor(p0.byId.a!, 4) }, start);
    expect(p1.byId.a!.layout?.pageCount).toBe(4);
    expect(p1.byId.b!.continuation?.pageIndexOffset).toBe(61);
    expect(p1.byId.b!.continuation?.pageNumbering).toEqual({ format: 'decimal', startAt: 62 });
    expect(p1.bookPages.a).toMatchObject({ pageIndex: 57, pageNumberValue: 58, lastPageNumberValue: 61, pageCount: 4 });
  });

  it('keys the first chapter\'s record on the start, and as before without one', () => {
    const planner = createBookPlanner();
    const plain = planner.plan(chapters, config, [], {});
    expect(plain.byId.a!.continuation).toBeUndefined();
    expect(plain.byId.a!.continuationKey).toBe('first');
    expect(planner.plan(chapters, config, [], {}, {}).byId.a!.continuationKey).toBe('first');
    const started = planner.plan(chapters, config, [], {}, start);
    expect(started.byId.a!.continuationKey).not.toBe('first');
    // A record laid out from page 1 is not the pages of the book that
    // starts on page 58, a verso, in chapter 4; nor the other way round.
    const fromPageOne = layoutFor(plain.byId.a!, 4);
    expect(planner.plan(chapters, config, [], { a: fromPageOne }, start).byId.a!.layout).toBeNull();
    expect(planner.plan(chapters, config, [], { a: layoutFor(started.byId.a!, 4) }).byId.a!.layout).toBeNull();
    expect(planner.plan(chapters, config, [], { a: layoutFor(started.byId.a!, 4) }, { ...start, pageIndexOffset: 58 }).byId.a!.layout).toBeNull();
    expect(planner.plan(chapters, config, [], { a: layoutFor(started.byId.a!, 4) }, { ...start }).byId.a!.layout?.pageCount).toBe(4);
  });

  it('prints the book\'s page count from the start on', () => {
    const counted: PostextConfig = {
      ...config,
      footer: { elements: [{ kind: 'text', id: 'folio', content: '{pageNumber} / {bookTotalPages}', placement: { anchor: { to: 'container', edge: 'top' } } }] },
    } as PostextConfig;
    const planner = createBookPlanner();
    const keyed = (plan: ChapterPlan, pages: number): ChapterLayout => ({ ...layoutFor(plan, pages), configKey: pagesConfigKeyOf(counted) });
    const p0 = planner.plan(chapters, counted, [], {}, start);
    const p1 = planner.plan(chapters, counted, [], { a: keyed(p0.byId.a!, 4) }, start);
    const p2 = planner.plan(chapters, counted, [], { a: keyed(p1.byId.a!, 4), b: keyed(p1.byId.b!, 3) }, start);
    expect(p2.byId.a!.continuation).toEqual({ ...start, bookPageCount: 64 });
    expect(p2.byId.b!.continuation?.bookPageCount).toBe(64);
  });
});

describe('the whole-book chains start where the book does (#695)', () => {
  const planOf = (index: number, continuation?: LayoutContinuation): ChapterPlan =>
    ({ chapterId: `c${index}`, index, continuation, paginated: true }) as unknown as ChapterPlan;
  const fakeDoc = (continuation: LayoutContinuation | undefined, count: number): VDTDocument => {
    const first = continuation?.pageNumbering?.startAt ?? 1;
    return {
      ...(continuation?.pageIndexOffset ? { pageIndexOffset: continuation.pageIndexOffset } : {}),
      pages: Array.from({ length: count }, (_, i) => ({ index: i, pageNumberValue: first + i, pageNumberFormat: 'decimal' })),
      blocks: [], converged: true, iterationCount: 1,
    } as unknown as VDTDocument;
  };

  it('chains the page offset from the pages before the book', async () => {
    const calls: (LayoutContinuation | undefined)[] = [];
    const docs = await layOutBookChain(
      [planOf(0, start), planOf(1, { headings: { ...HEADINGS, h1: 4 } })],
      async (_plan, continuation) => {
        calls.push(continuation);
        return fakeDoc(continuation, 4);
      },
      false,
    );
    expect(calls[0]).toEqual(start);
    expect(calls[1]).toMatchObject({ pageIndexOffset: 61, pageNumbering: { format: 'decimal', startAt: 62 }, headings: { h1: 4 } });
    expect(docs.map((d) => d.pageIndexOffset)).toEqual([57, 61]);
  });

  it('stitches the book with the pages before it, so its page sides hold', () => {
    const stitched = stitchDocuments([
      { chapterId: 'a', doc: fakeDoc(start, 2) },
      { chapterId: 'b', doc: fakeDoc({ pageIndexOffset: 59, pageNumbering: { startAt: 60 } }, 2) },
    ])!;
    expect(stitched.doc.pageIndexOffset).toBe(57);
    expect(stitched.doc.pages.map((p) => p.index)).toEqual([0, 1, 2, 3]);
    expect(stitched.pageChapters).toEqual([0, 0, 1, 1]);
    // A book that starts at its beginning is stitched as it was.
    expect(stitchDocuments([{ chapterId: 'a', doc: fakeDoc(undefined, 2) }])!.doc.pageIndexOffset).toBe(0);
  });
});

describe('the start travels with the book (#695)', () => {
  const summary: PresetSummary = { id: 'excerpt', name: 'Excerpt', source: 'private', available: true };
  const bundleBytes = async () => (await createBundle({
    id: 'excerpt', name: 'Excerpt', locale: 'en', config, start,
    chapters: chapters.map((c) => ({ title: c.title, markdown: c.markdown })),
  })).bytes;

  it('is read from a bundle and written back on export', async () => {
    const opened = openBundleZip(await bundleBytes());
    const loaded = await parseBundle(opened.manifest, opened.readFile, { locale: 'en', summary });
    expect(loaded.start).toEqual(start);
    const content = { chapters: loaded.chapters, config: loaded.config, resources: loaded.resources, start: loaded.start };
    expect(planBundle({ id: 'excerpt', name: 'Excerpt', locale: 'en' }, content).manifest.start).toEqual(start);
    const built = await buildBundleFiles({ id: 'excerpt', name: 'Excerpt', locale: 'en' }, content, { readBlob: async () => null, readFont: async () => null });
    const again = openBundleZip(zipBundle(built.files));
    expect((await parseBundle(again.manifest, again.readFile, { locale: 'en', summary })).start).toEqual(start);
    // A book that starts at its beginning writes nothing.
    const plain = planBundle({ id: 'excerpt', name: 'Excerpt' }, { chapters: loaded.chapters, config: loaded.config, resources: [] });
    expect('start' in plain.manifest).toBe(false);
  });

  it('carries the pagination of a book with a start in the bundle', async () => {
    const planner = createBookPlanner();
    const opened = openBundleZip(await bundleBytes());
    const loaded = await parseBundle(opened.manifest, opened.readFile, { locale: 'en', summary });
    const p0 = planner.plan(loaded.chapters, loaded.config, loaded.resources, {}, loaded.start);
    const first = loaded.chapters[0]!;
    const record: ChapterLayout = {
      ...layoutFor({ ...p0.byId[first.id]!, chapterId: 'a' }, 4),
      chapterId: first.id, markdown: first.markdown, configKey: pagesConfigKeyOf(loaded.config), resourcesKey: resourcesKeyOf(loaded.resources),
    };
    const content = { chapters: loaded.chapters, config: loaded.config, resources: loaded.resources, start: loaded.start, layouts: { [first.id]: record } };
    const built = await buildBundleFiles({ id: 'excerpt', name: 'Excerpt', locale: 'en' }, content, { readBlob: async () => null, readFont: async () => null });
    const again = openBundleZip(zipBundle(built.files));
    const reloaded = await parseBundle(again.manifest, again.readFile, { locale: 'en', summary });
    const plan = planner.plan(reloaded.chapters, reloaded.config, reloaded.resources, reloaded.layouts ?? {}, reloaded.start);
    expect(plan.chapters[0]!.layout?.pageCount).toBe(4);
    expect(plan.chapters[1]!.continuation?.pageIndexOffset).toBe(61);
  });

  it('is kept by the working copy, a project record and a preset draft', async () => {
    const book: BookContent = { chapters, activeChapterId: 'a', start };
    installStorage();
    saveBook(book);
    expect(loadBook(migration)?.start).toEqual(start);
    const record: ProjectRecord = {
      version: PROJECT_RECORD_VERSION, id: 'p1', name: 'Excerpt', createdAt: 1, updatedAt: 1,
      ...book, config, resources: [],
    };
    await putProject(record);
    expect((await getProject('p1'))!.start).toEqual(start);
    // The autosave writes the working book over it: the start stays, and a
    // book without one clears it.
    await updateProject('p1', { chapters, activeChapterId: 'b', start, config });
    expect((await getProject('p1'))!.start).toEqual(start);
    await updateProject('p1', { chapters, activeChapterId: 'b', start: undefined, config });
    expect((await getProject('p1'))!.start).toBeUndefined();

    const loaded: LoadedPreset = { summary: { ...summary, source: 'public' }, locale: 'en', chapters, config, resources: [], blobs: [], fonts: [], start };
    const snapshot = snapshotForApply(loaded, { parts: 'all', fingerprint: 'fp', current: { chapters: [], config: {}, resources: [] } });
    const key = presetDraftKey('excerpt', 'en');
    const draft: PresetDraftRecord = {
      version: PROJECT_RECORD_VERSION, key, presetId: 'excerpt', locale: 'en', snapshot,
      chapters, activeChapterId: 'a', start, config, resources: [], updatedAt: 1,
    };
    await putPresetDraft(draft);
    expect((await getPresetDraft(key))!.start).toEqual(start);
  });

  it('is read from storage in the shape the engine takes, or not at all', () => {
    const raw = { chapters, activeChapterId: 'a', start: { pageIndexOffset: 1.5, headings: { h1: 3 }, bookPageCount: 9, other: true } };
    expect(normalizeBookContent(raw, migration)?.start).toEqual({ pageIndexOffset: 1, headings: HEADINGS });
    expect('start' in normalizeBookContent({ chapters, activeChapterId: 'a', start: 'page 58' }, migration)!).toBe(false);
    expect('start' in normalizeBookContent({ chapters, activeChapterId: 'a' }, migration)!).toBe(false);
  });

  it('stays with the book through chapter edits and a copy, and goes with another book', () => {
    const book: BookContent = { chapters, activeChapterId: 'a', start };
    expect(renameChapter(book, 'a', 'IV').start).toEqual(start);
    expect(addChapter(book, newChapter('c', 'Six', '# Six'), 2).start).toEqual(start);
    expect(cloneBook(book, () => `id-${Math.random()}`).start).toEqual(start);

    const base = { chapters: [newChapter('x', 'X', '# X')], activeChapterId: 'x', canvasScope: 'chapter', chapterLayouts: {}, bookVersion: 0, selection: { from: 0, to: 0, head: 0 } } as unknown as SandboxState;
    const opened = sandboxReducer(base, { type: 'SET_BOOK', payload: book });
    expect(opened.bookStart).toEqual(start);
    const renamed = sandboxReducer(opened, { type: 'RENAME_CHAPTER', payload: { id: 'a', title: 'IV' } });
    expect(renamed.bookStart).toBe(opened.bookStart);
    const added = sandboxReducer(opened, { type: 'ADD_CHAPTER', payload: { chapter: newChapter('c', 'Six', '# Six') } });
    expect(added.bookStart).toBe(opened.bookStart);
    // The same book read again keeps the object, so the plan is not redone.
    expect(sandboxReducer(opened, { type: 'SET_BOOK', payload: { ...book, start: { ...start } } })).toBe(opened);
    // Another book starts where it says, or at its beginning.
    const other = sandboxReducer(opened, { type: 'SET_BOOK', payload: { chapters: [newChapter('y', 'Y', '# Y')], activeChapterId: 'y' } });
    expect('bookStart' in other).toBe(false);
  });
});
