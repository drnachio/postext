import { describe, expect, it } from 'vitest';
import { migrateProjectRecord, normalizeBookContent } from './projectMigration';

let n = 0;
const deps = { ids: () => `id${++n}`, untitled: (k: number) => `Chapter ${k}` };

describe('migrateProjectRecord', () => {
  it('turns a legacy single-document record into a one-chapter book', () => {
    const rec = migrateProjectRecord({ id: 'p', name: 'P', markdown: '# Intro\n\ntext', config: { page: {} }, resources: [], createdAt: 1, updatedAt: 2 }, deps)!;
    expect(rec.version).toBe(2);
    expect(rec.chapters).toHaveLength(1);
    expect(rec.chapters[0]!.title).toBe('Intro');
    expect(rec.chapters[0]!.markdown).toBe('# Intro\n\ntext');
    expect(rec.activeChapterId).toBe(rec.chapters[0]!.id);
    expect((rec as unknown as { markdown?: string }).markdown).toBeUndefined();
    expect(rec.createdAt).toBe(1);
  });
  it('passes a v2 record through and repairs a stale active id', () => {
    const rec = migrateProjectRecord({
      version: 2, id: 'p', name: 'P', config: {}, resources: [], createdAt: 1, updatedAt: 1,
      chapters: [{ id: 'a', title: 'A', markdown: '', createdAt: 1, updatedAt: 1 }],
      activeChapterId: 'gone', layoutScope: 'chapter',
    }, deps)!;
    expect(rec.activeChapterId).toBe('a');
    // The layout scope of earlier versions is dropped.
    expect((rec as unknown as { layoutScope?: string }).layoutScope).toBeUndefined();
    expect(rec.canvasScope).toBeUndefined();
  });
  it('keeps a valid canvas scope and drops an unknown one', () => {
    const base = {
      version: 2, id: 'p', name: 'P', config: {}, resources: [], createdAt: 1, updatedAt: 1,
      chapters: [{ id: 'a', title: 'A', markdown: '', createdAt: 1, updatedAt: 1 }],
      activeChapterId: 'a',
    };
    expect(migrateProjectRecord({ ...base, canvasScope: 'book' }, deps)!.canvasScope).toBe('book');
    expect(migrateProjectRecord({ ...base, canvasScope: 'spread' }, deps)!.canvasScope).toBeUndefined();
  });
  it('keeps a well-formed cover picture and drops a malformed one', () => {
    const base = {
      version: 2, id: 'p', name: 'P', config: {}, resources: [], createdAt: 1, updatedAt: 1,
      chapters: [{ id: 'a', title: 'A', markdown: '', createdAt: 1, updatedAt: 1 }],
      activeChapterId: 'a',
    };
    const cover = { fileId: 'blob-cover', mime: 'image/jpeg' };
    expect(migrateProjectRecord({ ...base, thumbnail: cover }, deps)!.thumbnail).toEqual(cover);
    expect(migrateProjectRecord({ ...base, thumbnail: { fileId: '' } }, deps)!.thumbnail).toBeUndefined();
    expect(migrateProjectRecord({ ...base, thumbnail: 'thumbnail.jpg' }, deps)!.thumbnail).toBeUndefined();
  });
  it('rejects garbage', () => {
    expect(migrateProjectRecord(null, deps)).toBeNull();
    expect(migrateProjectRecord({ id: 'p', name: 'P' }, deps)).toBeNull();
    expect(migrateProjectRecord({ id: 'p', name: 'P', chapters: [{ nope: 1 }] }, deps)).toBeNull();
  });
  it('fills an empty chapter list with an untitled chapter', () => {
    const book = normalizeBookContent({ chapters: [] }, deps)!;
    expect(book.chapters).toHaveLength(1);
    expect(book.chapters[0]!.title).toBe('Chapter 1');
  });
});
