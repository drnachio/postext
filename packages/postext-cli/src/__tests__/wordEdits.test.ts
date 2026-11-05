// The pieces of `postext import-docx <file> <book>` that need no Word
// file (#1396): chapter ids, resource edits onto the right spec, the diff.
import { describe, expect, it } from 'bun:test';
import { join, resolve } from 'node:path';
import type { Resource } from 'postext';
import type { BundleLocaleOverrides, BundleResourceSpec } from 'postext/bundle';
import type { BookChapter } from '../input';
import { chapterIds } from '../outputs/docx';
import { unifiedDiff } from '../unifiedDiff';
import { updateSpec } from '../wordEdits';

const chapter = (file?: string): BookChapter => ({ title: 't', markdown: '', ...(file !== undefined ? { file } : {}) });

describe('chapterIds', () => {
  it('names loose Markdown from the folder its files share, wherever it is typed from', () => {
    const typed = [chapter('ch/01.md'), chapter('ch/02.md')];
    const absolute = [chapter(resolve('ch/01.md')), chapter(join(resolve('.'), 'ch', '02.md'))];
    expect([...chapterIds({ kind: 'markdown', chapters: typed }).values()]).toEqual(['01.md', '02.md']);
    expect([...chapterIds({ kind: 'markdown', chapters: absolute }).values()]).toEqual(['01.md', '02.md']);
    const apart = [chapter('a/one/x.md'), chapter('a/two/x.md')];
    expect([...chapterIds({ kind: 'markdown', chapters: apart }).values()]).toEqual(['one/x.md', 'two/x.md']);
  });
  it('keeps a book\'s own paths, and numbers a chapter without a file in the whole book', () => {
    const chapters = [chapter('chapters/01.md'), chapter(), chapter('chapters/03.md')];
    const ids = chapterIds({ kind: 'folder', chapters });
    expect([...ids.values()]).toEqual(['chapters/01.md', 'chapter-2', 'chapters/03.md']);
    // A --chapters selection keeps the ids of the whole book.
    expect(ids.get(chapters[1]!)).toBe('chapter-2');
  });
});

describe('updateSpec', () => {
  const resource = (caption: string, cell = 'a'): Resource => ({
    id: 'r', typeId: 'table', kind: 'table', caption, table: { model: { rows: [[{ content: cell }]] } }, createdAt: 0, updatedAt: 0,
  } as unknown as Resource);
  const spec = (): BundleResourceSpec => ({ id: 'r', typeId: 'table', kind: 'table', caption: 'Old', table: { model: { rows: [[{ content: 'a' }]] } } } as unknown as BundleResourceSpec);

  it('writes the book\'s own language onto the shared spec', () => {
    const specs = [spec()];
    expect(updateSpec(specs, undefined, resource('Old'), resource('New', 'b'))).toBe(true);
    expect(specs[0]!.caption).toBe('New');
    expect((specs[0]!.table as { model: { rows: { content: string }[][] } }).model.rows[0]![0]!.content).toBe('b');
  });

  it('writes an edition\'s edits into its own wording, never the shared spec', () => {
    const specs = [spec()];
    const edition: BundleLocaleOverrides = {};
    expect(updateSpec(specs, edition, resource('Old'), resource('Nuevo', 'b'))).toBe(true);
    expect(specs[0]!.caption).toBe('Old');
    expect((specs[0]!.table as { model: { rows: { content: string }[][] } }).model.rows[0]![0]!.content).toBe('a');
    const own = edition.resources![0]! as BundleResourceSpec & { table: { model: { rows: { content: string }[][] } } };
    expect(own.caption).toBe('Nuevo');
    expect(own.table.model.rows[0]![0]!.content).toBe('b');
  });

  it('leaves alone a resource the file does not declare', () => {
    expect(updateSpec([], undefined, resource('Old'), resource('New'))).toBe(false);
  });
});

describe('unifiedDiff', () => {
  it('prints nothing for equal texts and a hunk with context otherwise', () => {
    expect(unifiedDiff('a.md', 'x\n', 'x\n')).toBe('');
    expect(unifiedDiff('a.md', '1\n2\n3\n', '1\nz\n3\n')).toBe('--- a/a.md\n+++ b/a.md\n@@ -1,3 +1,3 @@\n 1\n-2\n+z\n 3\n');
  });
  it('shows a final newline lost or added', () => {
    expect(unifiedDiff('a.md', 'x\n', 'x')).toBe('--- a/a.md\n+++ b/a.md\n@@ -1,1 +1,1 @@\n-x\n+x\n\\ No newline at end of file\n');
  });
});
