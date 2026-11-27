import { strToU8, zipSync } from 'fflate';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostextConfig, Resource } from 'postext';
import { chapter, harness } from './testHarness.js';

// The blob and font stores are IndexedDB; here they are maps.
const { blobs, fonts } = vi.hoisted(() => ({
  blobs: new Map<string, { contentType: string }>(),
  fonts: new Map<string, { fileName: string }>(),
}));
vi.mock('../../storage/blobStore.js', async (original) => ({
  ...(await original<typeof import('../../storage/blobStore.js')>()),
  putBlobAt: async (fileId: string, _bytes: ArrayBuffer, contentType: string) => { blobs.set(fileId, { contentType }); return fileId; },
}));
vi.mock('../../storage/fontStorage.js', async (original) => ({
  ...(await original<typeof import('../../storage/fontStorage.js')>()),
  putFontFile: async (file: { fileId: string; fileName: string }) => { fonts.set(file.fileId, file); },
}));

beforeEach(() => {
  blobs.clear();
  fonts.clear();
});

const base64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));

/** A PNG's header, `width` × `height`: all a picture is read for here. */
function png(width: number, height: number): Uint8Array {
  const chunk = (type: string, data: number[]): number[] => [0, 0, 0, data.length, ...[...type].map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
  const u32 = (n: number): number[] => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk('IHDR', [...u32(width), ...u32(height), 8, 6, 0, 0, 0]), ...chunk('IEND', [])]);
}

/** A part converted elsewhere: chapter 2 corrected and a new chapter 5, whose picture the tool that made it
 *  named after its position (`fig-1-1`), with a font family of its own. */
function partFile(): { base64: string; fileName: string } {
  const manifest = {
    version: 2,
    id: 'module',
    name: 'Module',
    locale: 'es',
    chapters: [
      { title: 'Dos, corregido', file: 'chapters/02-dos.md' },
      { title: 'Muñeca y mano', file: 'chapters/05-muneca-y-mano.md' },
    ],
    resources: [
      { id: 'fig-1-1', typeId: 'figure', kind: 'bitmap', file: 'resources/fig-1-1.png', caption: 'La mano.', width: 30, height: 20 },
    ],
    fonts: [{ name: 'Barlow', variants: [{ weight: 400, style: 'normal', file: 'fonts/barlow.ttf' }] }],
    config: { page: { width: { value: 210, unit: 'mm' } } },
  };
  return {
    base64: base64(zipSync({
      'preset.json': strToU8(JSON.stringify(manifest)),
      'chapters/02-dos.md': strToU8('# Dos {startAt=2}\n\nCorregido.\n'),
      'chapters/05-muneca-y-mano.md': strToU8('# Muñeca y mano {startAt=5}\n\n::resource{id="fig-1-1"}\n'),
      'resources/fig-1-1.png': png(30, 20),
      'fonts/barlow.ttf': strToU8('font'),
    })),
    fileName: 'module.postext',
  };
}

const book = () => ({
  chapters: [
    chapter('c1', 'Uno', '# Uno\n\n::resource{id="fig-1-1"}\n'),
    chapter('c2', 'Dos', '# Dos\n\nPrimera versión.\n'),
    chapter('c9', 'Columna lumbar', '# Columna lumbar {startAt=9}\n\nTexto.\n'),
  ],
  activeChapterId: 'c1',
  markdown: '# Uno\n\n::resource{id="fig-1-1"}\n',
  resources: [{ id: 'fig-1-1', type: 'figure', kind: 'bitmap', caption: 'El libro.', bitmap: { fileId: 'own', format: 'png', width: 10, height: 10 } } as unknown as Resource],
});

describe('sandbox_import_chapters', () => {
  it('shows what it proposes, changing nothing', async () => {
    const { call, get } = harness(book());
    const seen = await call('sandbox_import_chapters', { file: partFile(), inspect: true });
    expect(seen).toMatchObject({
      ok: true, imported: false,
      chapters: [
        { chapter: 1, title: 'Dos, corregido', number: 2, action: 'replace', to: 2, replaces: { chapter: 2, title: 'Dos' } },
        { chapter: 2, title: 'Muñeca y mano', number: 5, action: 'add', to: 5, resources: ['fig-1-1'] },
      ],
      clashes: [{ id: 'fig-1-1', renamedTo: 'fig-1-1-2' }],
      book: [{ chapter: 1, number: 1, title: 'Uno' }, { chapter: 2, number: 2, title: 'Dos' }, { chapter: 3, number: 9, title: 'Columna lumbar' }],
    });
    expect(get().chapters).toHaveLength(3);
    expect(blobs.size).toBe(0);
  });

  it('joins the chapters at their numbers, with their resources renamed and the missing font', async () => {
    const { call, get } = harness(book());
    const done = await call('sandbox_import_chapters', { file: partFile(), renames: { 'fig-1-1': 'fig-5-1' }, wait: false });
    expect(done).toMatchObject({ ok: true, imported: true, added: 1, replaced: 1, resources: 1, renamed: [{ from: 'fig-1-1', to: 'fig-5-1' }], fontsAdded: ['Barlow'] });
    const s = get();
    expect(s.chapters.map((c) => c.title)).toEqual(['Uno', 'Dos, corregido', 'Muñeca y mano', 'Columna lumbar']);
    expect(s.chapters[1]!.id).toBe('c2');                                        // the same chapter, its text replaced
    expect(s.chapters[1]!.markdown).toBe('# Dos {startAt=2}\n\nCorregido.\n');
    expect(s.chapters[2]!.markdown).toBe('# Muñeca y mano {startAt=5}\n\n::resource{id="fig-5-1"}\n');
    expect(s.resources.map((r) => [r.id, r.caption])).toEqual([['fig-1-1', 'El libro.'], ['fig-5-1', 'La mano.']]);
    expect([...blobs.keys()]).toHaveLength(1);
    expect((s.config as PostextConfig).customFonts?.map((f) => f.name)).toEqual(['Barlow']);
    expect(fonts.size).toBe(1);
    expect((s.config as PostextConfig).page?.width).not.toEqual({ value: 210, unit: 'mm' });   // the book's design
  });

  it('follows the choices, and refuses those that do not fit', async () => {
    const { call, get } = harness(book());
    const wrong = await call('sandbox_import_chapters', { file: partFile(), chapters: [{ action: 'add' }, { action: 'replace', number: 4 }] });
    expect(wrong.error).toMatch(/chapter 1 of the file, its number is taken.*chapter 2 of the file, no chapter of the book has that number/);
    const done = await call('sandbox_import_chapters', { file: partFile(), chapters: [{ action: 'skip' }, { action: 'add', number: 12 }], wait: false });
    expect(done).toMatchObject({ added: 1, replaced: 0 });
    expect(get().chapters.map((c) => c.title)).toEqual(['Uno', 'Dos', 'Columna lumbar', 'Muñeca y mano']);
    expect(get().chapters[3]!.markdown).toMatch(/^# Muñeca y mano \{startAt=12\}/);
  });
});
