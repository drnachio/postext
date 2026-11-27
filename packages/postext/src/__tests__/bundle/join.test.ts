import { describe, expect, it } from 'vitest';
import {
  bookNumbers, chapterNumbers, choiceProblems, createBundle, inspectBundleJoin, joinBundleFiles, partChapters, planPartJoin,
  proposeChoices, renameProblems, resourceClashes, withChapterNumber, type JoinSide,
} from '../../bundle/index.js';
import type { PostextConfig, Resource } from '../../types.js';

// Joining a part of a book to it (#1727; first version by Erebyel in #1728).

const config: PostextConfig = {};
const figure = (id: string, caption = ''): Resource => ({ id, typeId: 'figure', kind: 'bitmap', caption, bitmap: { fileId: `file-${id}`, format: 'png', width: 10, height: 10 }, createdAt: 0, updatedAt: 0 } as Resource);

// A book with chapters 1, 2 and 9 (the ninth says so in its heading), its pictures named after them.
const book: JoinSide = {
  chapters: [
    { title: 'Uno', markdown: '# Uno\n\n::resource{id="fig-1-1"}\n' },
    { title: 'Dos', markdown: '# Dos\n\nVéase la :ref{id="fig-1-1"}.\n\n::resource{id="fig-2-1"}\n' },
    { title: 'Columna lumbar', markdown: '# Columna lumbar {startAt=9}\n\n::resource{id="fig-9-1"}\n' },
  ],
  resources: [figure('fig-1-1'), figure('fig-2-1'), figure('fig-9-1')],
  config: { customFonts: [{ name: 'EB Garamond', variants: [] }] } as unknown as PostextConfig,
};

// A part converted elsewhere: its chapters 2 and 5, numbered in their headings; the tool that made it named the
// fifth chapter's picture after its position, `fig-1-1`, which the book's first chapter already uses.
const part: JoinSide = {
  chapters: [
    { title: 'Dos, corregido', markdown: '# Dos {startAt=2}\n\n::resource{id="fig-2-1"}\n' },
    { title: 'Muñeca y mano', markdown: '# Muñeca y mano {startAt=5 author="C. L."}\n\n::resource{id="fig-1-1"}\n\nTabla :ref{id="tabla-5-1"}.\n\n::resource{id="tabla-5-1"}\n' },
  ],
  resources: [
    figure('fig-2-1'), figure('fig-1-1', 'Mano.'),
    { ...figure('tabla-5-1', 'Ver :ref{id="fig-1-1"} y :ref{id="esquema"}.'), kind: 'table', table: { model: { rows: [[{ content: 'x', image: { resourceId: 'fig-1-1' } }]] } } } as unknown as Resource,
    figure('esquema'), figure('suelta'),
  ],
  config: { customFonts: [{ name: 'eb garamond', variants: [] }, { name: 'Barlow', variants: [] }] } as unknown as PostextConfig,
};

describe('chapter numbers', () => {
  it('count as the layout counts them: startAt, unnumbered styles, chapters with no heading, the bundle start', () => {
    const front: PostextConfig = { headingStyles: [{ id: 'front', numbered: false }] } as PostextConfig;
    const chapters = [
      { markdown: 'Una portada sin títulos.\n' },
      { markdown: '# Prólogo {style=front}\n' },
      { markdown: '---\ntitle: X\n---\n\n# Uno\n' },
      { markdown: '# Dos\n\n```sh\n# no es un título\n```\n' },
      { markdown: '# Nueve {startAt=9}\n' },
      { markdown: '# Diez\n' },
    ];
    expect(chapterNumbers(chapters, front)).toEqual([null, null, 1, 2, 9, 10]);
    // Without the style, the prologue counts.
    expect(chapterNumbers(chapters, config)).toEqual([null, 1, 2, 3, 9, 10]);
    // A bundle that holds chapters 4 on.
    expect(chapterNumbers([{ markdown: '# Cuatro\n' }], config, { h1: 3 })).toEqual([4]);
  });

  it('name chapter files, an unnumbered chapter after the number before it', async () => {
    const { manifest } = await createBundle({
      name: 'Patterns', locale: 'es',
      config: { headingStyles: [{ id: 'front', numbered: false }] } as PostextConfig,
      chapters: [
        { title: 'Prólogo', markdown: '# Prólogo {style=front}\n\nTexto.\n' },
        { title: 'Uno', markdown: '# Uno\n\nTexto.\n' },
        { title: 'Dos', markdown: '# Dos\n\nTexto.\n' },
        { title: 'Columna lumbar', markdown: '# Columna lumbar {startAt=9 author="A. B."}\n\nTexto.\n' },
        { title: 'Cadera', markdown: '# Cadera\n\nTexto.\n' },
      ],
    });
    expect((manifest.chapters as { file: string }[]).map((c) => c.file)).toEqual([
      'chapters/00-prologo.md', 'chapters/01-uno.md', 'chapters/02-dos.md', 'chapters/09-columna-lumbar.md', 'chapters/10-cadera.md',
    ]);
  });
});

describe('a part of a book joined to it', () => {
  it('reads the numbers and the resources each chapter brings, with those they name', () => {
    expect(bookNumbers(book)).toEqual([1, 2, 9]);
    expect(partChapters(part).map((c) => [c.number, c.resources])).toEqual([[2, ['fig-2-1']], [5, ['fig-1-1', 'tabla-5-1', 'esquema']]]);
  });

  it('proposes to replace the chapter with the same number and to add the others', () => {
    expect(proposeChoices(book, part)).toEqual([{ action: 'replace', number: 2 }, { action: 'add', number: 5 }]);
  });

  it('says what does not fit, once per chapter', () => {
    expect(choiceProblems(book, part, [{ action: 'replace', number: 4 }, { action: 'add', number: 9 }])).toEqual([
      { chapter: 0, problem: 'noSuchChapter' }, { chapter: 1, problem: 'sameNumber' },
    ]);
    expect(choiceProblems(book, part, [{ action: 'add', number: 9 }, { action: 'add', number: 9 }])).toEqual([
      { chapter: 0, problem: 'sameNumber' }, { chapter: 1, problem: 'sameNumber' },
    ]);
    expect(choiceProblems(book, part, [{ action: 'add', number: 0 }, { action: 'skip', number: 0 }])).toEqual([{ chapter: 0, problem: 'badNumber' }]);
    const loose: JoinSide = { chapters: [{ title: 'Nota', markdown: 'Sin título.\n' }], resources: [], config };
    expect(choiceProblems(book, loose, [{ action: 'replace', number: 2 }])).toEqual([{ chapter: 0, problem: 'unnumbered' }]);
    expect(proposeChoices(book, loose)).toEqual([{ action: 'skip', number: 1 }]);
  });

  it('renames only a resource the book keeps using: in a chapter, its design or another resource', () => {
    // fig-2-1 is only the replaced chapter's: the part's takes its place. fig-1-1 stays in chapters 1 and 2.
    expect(resourceClashes(book, part, proposeChoices(book, part))).toEqual([{ id: 'fig-1-1', rename: 'fig-1-1-2' }]);
    // The book's design shows fig-2-1 as a callout icon: it stays in use.
    const designed = { ...book, config: { ...book.config, calloutStyles: [{ id: 'nota', icon: { resourceId: 'fig-2-1' } }] } as unknown as PostextConfig };
    expect(resourceClashes(designed, part, proposeChoices(designed, part)).map((c) => c.id)).toEqual(['fig-2-1', 'fig-1-1']);
    // Another of the book's resources shows it in a cell.
    const shown = { ...book, resources: [...book.resources, { ...figure('tabla-9-1'), kind: 'table', table: { model: { rows: [[{ content: '', image: { resourceId: 'fig-2-1' } }]] } } } as unknown as Resource] };
    expect(resourceClashes(shown, part, proposeChoices(shown, part)).map((c) => c.id)).toEqual(['fig-2-1', 'fig-1-1']);
  });

  it('refuses a new name that is not an id or is taken', () => {
    const choices = proposeChoices(book, part);
    expect(renameProblems(book, part, choices, { 'fig-1-1': 'fig 5' })).toEqual(['fig-1-1']);
    expect(renameProblems(book, part, choices, { 'fig-1-1': 'fig-9-1' })).toEqual(['fig-1-1']);
    expect(renameProblems(book, part, choices, { 'fig-1-1': 'fig-5-1' })).toEqual([]);
    expect(() => planPartJoin(book, part, choices, { 'fig-1-1': 'esquema' })).toThrow(/cannot take the names/);
  });

  it('plans the steps, the renamed resources and the missing fonts', () => {
    const plan = planPartJoin(book, part, proposeChoices(book, part), { 'fig-1-1': 'fig-5-1' });
    expect(plan.steps).toEqual([
      { kind: 'replace', at: 1, part: 0, title: 'Dos, corregido', number: 2, markdown: '# Dos {startAt=2}\n\n::resource{id="fig-2-1"}\n' },
      { kind: 'add', index: 2, part: 1, title: 'Muñeca y mano', number: 5,
        markdown: '# Muñeca y mano {startAt=5 author="C. L."}\n\n::resource{id="fig-5-1"}\n\nTabla :ref{id="tabla-5-1"}.\n\n::resource{id="tabla-5-1"}\n' },
    ]);
    expect(plan.resources.map((r) => r.id)).toEqual(['fig-2-1', 'fig-5-1', 'tabla-5-1', 'esquema']); // the loose one stays out
    const table = plan.resources.find((r) => r.id === 'tabla-5-1')!;
    expect(table.caption).toBe('Ver :ref{id="fig-5-1"} y :ref{id="esquema"}.');
    expect(table.table!.model.rows[0]![0]!.image!.resourceId).toBe('fig-5-1');
    expect(plan.renamed).toEqual([{ from: 'fig-1-1', to: 'fig-5-1' }]);
    expect(plan.fontsAdded).toEqual(['Barlow']);
    expect(plan.customFonts!.map((f) => f.name)).toEqual(['EB Garamond', 'Barlow']);
  });

  it('writes a number into a heading only when its place does not give it', () => {
    const lone = (markdown: string): JoinSide => ({ chapters: [{ title: 'Cadera', markdown }], resources: [], config });
    // After chapter 9 a tenth chapter is the tenth by its place.
    expect(planPartJoin(book, lone('# Cadera\n'), [{ action: 'add', number: 10 }]).steps[0]!.markdown).toBe('# Cadera\n');
    // As chapter 12 it needs saying so; a YAML comment in front matter is not the heading.
    const steps = planPartJoin(book, lone('---\ntitle: X\n# nota\n---\n\n# Cadera\n\nTexto.\n'), [{ action: 'add', number: 12 }]).steps;
    expect(steps).toEqual([{ kind: 'add', index: 3, part: 0, title: 'Cadera', number: 12, markdown: '---\ntitle: X\n# nota\n---\n\n# Cadera {startAt=12}\n\nTexto.\n' }]);
    // A heading that states a number gets the one it goes to.
    expect(planPartJoin(book, lone('# Cadera {startAt=3}\n'), [{ action: 'add', number: 10 }]).steps[0]!.markdown).toBe('# Cadera {startAt=10}\n');
    // Added before a chapter that a prologue precedes.
    const withPrologue: JoinSide = { ...book, config: { headingStyles: [{ id: 'front', numbered: false }] } as PostextConfig, chapters: [{ title: 'Prólogo', markdown: '# Prólogo {style=front}\n' }, ...book.chapters] };
    const plan = planPartJoin(withPrologue, part, [{ action: 'replace', number: 2 }, { action: 'add', number: 5 }], { 'fig-1-1': 'fig-5-1' });
    expect(plan.steps.map((s) => (s.kind === 'replace' ? ['replace', s.at] : ['add', s.index]))).toEqual([['replace', 2], ['add', 3]]);
  });

  it('writes the number into the heading the parser finds', () => {
    expect(withChapterNumber('# Uno\n', 3)).toBe('# Uno {startAt=3}\n');
    expect(withChapterNumber('# Uno {startAt=1 author="A"}\n', 3)).toBe('# Uno {startAt=3 author="A"}\n');
    expect(withChapterNumber('# Uno {author="A"}\n', 3)).toBe('# Uno {startAt=3 author="A"}\n');
    expect(withChapterNumber('```\n# no\n```\n\n# Uno\n', 3)).toBe('```\n# no\n```\n\n# Uno {startAt=3}\n');
    expect(withChapterNumber('Sin título.\n', 3)).toBe('Sin título.\n');
  });
});

describe('a part joined to a bundle', () => {
  const png = (seed: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, seed]);
  const bitmap = (id: string, file: string): Resource => ({ id, typeId: 'figure', kind: 'bitmap', bitmap: { fileId: file, format: 'png', width: 10, height: 10 }, createdAt: 0, updatedAt: 0 } as Resource);
  const filesOf = (b: { files: Record<string, Uint8Array> }) => new Map(Object.entries(b.files));

  it('edits the manifest, writes the chapters at their numbers and keeps the book\'s files apart from the part\'s', async () => {
    const bookBundle = await createBundle({
      name: 'Fisioterapia', locale: 'es', config,
      chapters: [...book.chapters],
      resources: [bitmap('fig-1-1', 'a'), bitmap('fig-2-1', 'b'), bitmap('fig-9-1', 'c')],
      files: { a: png(1), b: png(2), c: png(9) },
    });
    const partBundle = await createBundle({
      name: 'Parte', locale: 'es', config,
      chapters: [part.chapters[0]!, { title: 'Muñeca y mano', markdown: '# Muñeca y mano {startAt=5}\n\n::resource{id="fig-1-1"}\n' }],
      resources: [bitmap('fig-2-1', 'b'), bitmap('fig-1-1', 'x')],
      files: { b: png(22), x: png(51) },
    });
    const bookFiles = filesOf(bookBundle);
    const partFiles = filesOf(partBundle);

    const seen = await inspectBundleJoin(bookFiles, partFiles);
    expect(seen.book.map((c) => [c.file, c.number])).toEqual([['chapters/01-uno.md', 1], ['chapters/02-dos.md', 2], ['chapters/09-columna-lumbar.md', 9]]);
    expect(seen.choices).toEqual([{ action: 'replace', number: 2 }, { action: 'add', number: 5 }]);
    expect(seen.replaces).toEqual([1, -1]);
    expect(seen.clashes).toEqual([{ id: 'fig-1-1', rename: 'fig-1-1-2' }]);

    const joined = await joinBundleFiles(bookFiles, partFiles, { renames: { 'fig-1-1': 'fig-5-1' } });
    expect(joined.added).toEqual([{ title: 'Muñeca y mano', file: 'chapters/05-muneca-y-mano.md', number: 5 }]);
    expect(joined.replaced).toEqual([{ title: 'Dos, corregido', file: 'chapters/02-dos.md', number: 2 }]);
    const manifest = JSON.parse(new TextDecoder().decode(joined.files.get('preset.json')!)) as { chapters: { title: string; file: string }[]; resources: { id: string; file?: string }[] };
    expect(manifest.chapters.map((c) => c.file)).toEqual(['chapters/01-uno.md', 'chapters/02-dos.md', 'chapters/05-muneca-y-mano.md', 'chapters/09-columna-lumbar.md']);
    expect(manifest.chapters[1]!.title).toBe('Dos, corregido');
    expect(new TextDecoder().decode(joined.files.get('chapters/05-muneca-y-mano.md')!)).toBe('# Muñeca y mano {startAt=5}\n\n::resource{id="fig-5-1"}\n');
    const byId = new Map(manifest.resources.map((r) => [r.id, r.file!]));
    expect([...byId.keys()]).toEqual(['fig-1-1', 'fig-9-1', 'fig-2-1', 'fig-5-1']);
    // The book's own fig-1-1 keeps its file; the part's pictures come in beside the book's.
    expect(joined.files.get(byId.get('fig-1-1')!)).toEqual(png(1));
    expect(joined.files.get(byId.get('fig-2-1')!)).toEqual(png(22));
    expect(joined.files.get(byId.get('fig-5-1')!)).toEqual(png(51));
    expect(byId.get('fig-5-1')).not.toBe(byId.get('fig-1-1'));
    // What was not touched is the book's, byte for byte.
    expect(joined.files.get('chapters/01-uno.md')).toBe(bookFiles.get('chapters/01-uno.md'));
    expect(joined.written).toContain('preset.json');
    await expect(joinBundleFiles(bookFiles, partFiles, { choices: [{ action: 'add', number: 9 }, { action: 'skip', number: 1 }] })).rejects.toThrow(/sameNumber/);
  });
});
