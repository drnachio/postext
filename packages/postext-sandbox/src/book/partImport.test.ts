import { describe, expect, it } from 'vitest';
import type { PostextConfig, Resource } from 'postext';
import {
  bookNumbers,
  choiceProblems,
  partChapters,
  planPartImport,
  proposeChoices,
  resourceClashes,
  withChapterNumber,
  type PartBook,
  type PartContent,
} from './partImport.js';

const config = {} as PostextConfig;
const figure = (id: string, caption = ''): Resource => ({ id, type: 'figure', kind: 'bitmap', caption, bitmap: { fileId: `file-${id}`, format: 'png', width: 10, height: 10 } } as unknown as Resource);
const chapter = (id: string, title: string, markdown: string) => ({ id, title, markdown });

// A book with chapters 1, 2 and 9 (the ninth says so in its heading), its pictures named after them.
const book: PartBook = {
  chapters: [
    chapter('c1', 'Uno', '# Uno\n\n::resource{id="fig-1-1"}\n'),
    chapter('c2', 'Dos', '# Dos\n\nVéase la :ref{id="fig-1-1"}.\n\n::resource{id="fig-2-1"}\n'),
    chapter('c9', 'Columna lumbar', '# Columna lumbar {startAt=9}\n\n::resource{id="fig-9-1"}\n'),
  ],
  resources: [figure('fig-1-1'), figure('fig-2-1'), figure('fig-9-1')],
  config: { customFonts: [{ name: 'EB Garamond', variants: [] }] } as unknown as PostextConfig,
};

// A part converted elsewhere: its chapters 2 and 5, numbered in their headings; the tool that made it named the
// fifth chapter's picture after its position, `fig-1-1`, which the book's first chapter already uses.
const part: PartContent = {
  chapters: [
    { title: 'Dos, corregido', markdown: '# Dos {startAt=2}\n\n::resource{id="fig-2-1"}\n' },
    { title: 'Muñeca y mano', markdown: '# Muñeca y mano {startAt=5 author="C. L."}\n\n::resource{id="fig-1-1"}\n\nTabla :ref{id="tabla-5-1"}.\n\n::resource{id="tabla-5-1"}\n' },
  ],
  resources: [figure('fig-2-1'), figure('fig-1-1', 'Mano.'), { ...figure('tabla-5-1', 'Ver :ref{id="fig-1-1"}.'), kind: 'table', table: { model: { rows: [[{ content: 'x', image: { resourceId: 'fig-1-1' } }]] } } } as unknown as Resource, figure('suelta')],
  config: { customFonts: [{ name: 'eb garamond', variants: [] }, { name: 'Barlow', variants: [] }] } as unknown as PostextConfig,
};

describe('a part of a book joined to it', () => {
  it('reads the numbers the chapters give themselves', () => {
    expect(bookNumbers(book)).toEqual([1, 2, 9]);
    expect(partChapters(part).map((c) => [c.number, c.resources])).toEqual([[2, ['fig-2-1']], [5, ['fig-1-1', 'tabla-5-1']]]);
  });

  it('proposes to replace the chapter with the same number and to add the others', () => {
    expect(proposeChoices(book, part)).toEqual([{ action: 'replace', number: 2 }, { action: 'add', number: 5 }]);
  });

  it('says what does not fit', () => {
    expect(choiceProblems(book, [{ action: 'replace', number: 4 }, { action: 'add', number: 9 }])).toEqual([
      { chapter: 0, problem: 'noSuchChapter' }, { chapter: 1, problem: 'sameNumber' },
    ]);
    expect(choiceProblems(book, [{ action: 'add', number: 5 }, { action: 'add', number: 5 }])).toEqual([{ chapter: 1, problem: 'sameNumber' }]);
    expect(choiceProblems(book, [{ action: 'add', number: 0 }, { action: 'skip', number: 0 }])).toEqual([{ chapter: 0, problem: 'badNumber' }]);
  });

  it('renames only a resource the book keeps using', () => {
    // fig-2-1 is only the replaced chapter's: the part's takes its place. fig-1-1 stays in chapters 1 and 2.
    expect(resourceClashes(book, part, proposeChoices(book, part))).toEqual([{ id: 'fig-1-1', rename: 'fig-1-1-2' }]);
    // Chapter 2 kept as it is: its picture is still in use.
    expect(resourceClashes(book, part, [{ action: 'skip', number: 2 }, { action: 'add', number: 5 }]).map((c) => c.id)).toEqual(['fig-1-1']);
  });

  it('plans the steps, the renamed resources and the missing fonts', () => {
    const plan = planPartImport(book, part, proposeChoices(book, part), { 'fig-1-1': 'fig-5-1' });
    expect(plan.steps).toEqual([
      { kind: 'replace', chapterId: 'c2', title: 'Dos, corregido', number: 2, markdown: '# Dos {startAt=2}\n\n::resource{id="fig-2-1"}\n' },
      { kind: 'add', index: 2, title: 'Muñeca y mano', number: 5,
        markdown: '# Muñeca y mano {startAt=5 author="C. L."}\n\n::resource{id="fig-5-1"}\n\nTabla :ref{id="tabla-5-1"}.\n\n::resource{id="tabla-5-1"}\n' },
    ]);
    const ids = plan.resources.map((r) => r.id);
    expect(ids).toEqual(['fig-2-1', 'fig-5-1', 'tabla-5-1']);                 // the loose one stays out
    const table = plan.resources.find((r) => r.id === 'tabla-5-1')!;
    expect(table.caption).toBe('Ver :ref{id="fig-5-1"}.');
    expect(table.table!.model.rows[0]![0]!.image!.resourceId).toBe('fig-5-1');
    expect(plan.fontsAdded).toEqual(['Barlow']);
    expect(plan.customFonts!.map((f) => f.name)).toEqual(['EB Garamond', 'Barlow']);
  });

  it('numbers a chapter the reader moves to another number', () => {
    const lone: PartContent = { chapters: [{ title: 'Cadera', markdown: '---\ntitle: X\n---\n\n# Cadera\n\nTexto.\n' }], resources: [], config };
    const plan = planPartImport(book, lone, [{ action: 'add', number: 12 }]);
    expect(plan.steps).toEqual([{ kind: 'add', index: 3, title: 'Cadera', number: 12, markdown: '---\ntitle: X\n---\n\n# Cadera {startAt=12}\n\nTexto.\n' }]);
    expect(plan.customFonts).toBeUndefined();
    expect(() => planPartImport(book, lone, [{ action: 'replace', number: 3 }])).toThrow(/noSuchChapter/);
  });

  it('writes the number into the heading', () => {
    expect(withChapterNumber('# Uno\n', 3)).toBe('# Uno {startAt=3}\n');
    expect(withChapterNumber('# Uno {startAt=1 author="A"}\n', 3)).toBe('# Uno {startAt=3 author="A"}\n');
    expect(withChapterNumber('# Uno {author="A"}\n', 3)).toBe('# Uno {startAt=3 author="A"}\n');
    expect(withChapterNumber('Sin título.\n', 3)).toBe('Sin título.\n');
  });
});
