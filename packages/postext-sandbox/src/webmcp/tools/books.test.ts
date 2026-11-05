import { strToU8, zipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import type { DuplicateSource, ProjectSummary, SandboxState } from '../../context/SandboxContext.js';
import type { ProjectActions } from '../../context/projectActions.js';
import { resetViewerEdits } from '../../editor/viewerEdits.js';
import { runTool } from '../modelContext.js';
import { answerTools } from './library.js';
import { harness } from './testHarness.js';

afterEach(() => resetViewerEdits());

const base64 = (content: string | Uint8Array): string => {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  return btoa(String.fromCharCode(...bytes));
};

const project = (over: Partial<ProjectSummary> = {}): ProjectSummary => ({
  id: 'p1',
  name: 'Mine',
  description: undefined,
  locale: 'en',
  bundleId: undefined,
  sourcePresetId: undefined,
  thumbnail: undefined,
  createdAt: 1,
  updatedAt: 2,
  chapterCount: 2,
  ...over,
});

const draft = (presetId: string, locale: string, updatedAt = 1): SandboxState['presetDrafts'][number] => ({ key: `${presetId}::${locale}`, presetId, locale, updatedAt });

describe('what is open', () => {
  it('says the interface language, and nothing of what is idle', async () => {
    const { call } = harness();
    const s = await call('sandbox_get_state');
    expect(s).toMatchObject({ ready: true, interfaceLanguage: 'en' });
    for (const key of ['waitingFor', 'selection', 'caret', 'openResource', 'notice', 'status', 'sampleUpdated', 'sampleStale', 'question']) expect(s).not.toHaveProperty(key);
  });

  it('says where the caret is, or what is selected', async () => {
    const text = '# Opening\n\nFirst line.\nSecond line.\n';
    const chapters = [{ id: 'a', title: 'Opening', markdown: text, createdAt: 1, updatedAt: 1 }];
    const from = text.indexOf('First');
    const caret = harness({ chapters, markdown: text, selection: { from, to: from, head: from } });
    expect((await caret.call('sandbox_get_state')).caret).toEqual({ chapter: 1, offset: from, line: 3, column: 1 });

    const to = text.indexOf('line.', text.indexOf('Second')) + 4;
    const selected = harness({ chapters, markdown: text, selection: { from, to, head: to } });
    expect((await selected.call('sandbox_get_state')).selection).toEqual({
      chapter: 1, from, to, fromLine: 3, fromColumn: 1, toLine: 4, toColumn: 12, characters: to - from, text: 'First line.\nSecond line',
    });

    const long = 'x'.repeat(900);
    const bounded = harness({ chapters: [{ ...chapters[0]!, markdown: long }], markdown: long, selection: { from: 0, to: 900, head: 900 } });
    const answer = (await bounded.call('sandbox_get_state')).selection;
    expect(answer.characters).toBe(900);
    expect(answer.text).toBe(`${'x'.repeat(400)}…`);
  });

  it('says what the Books panel says: the notice, a failure, a sample that changed', async () => {
    const { call } = harness({
      activeResourceId: 'fig-1',
      projectNotice: 'Two pictures were left out',
      projectStatus: 'error',
      projectError: 'Project not found',
      presetStatus: 'loading',
      presetStale: true,
      presetUpdatedAt: Date.UTC(2026, 0, 2),
    });
    const s = await call('sandbox_get_state');
    expect(s.openResource).toBe('fig-1');
    expect(s.notice).toBe('Two pictures were left out');
    expect(s.status).toEqual({ project: 'error', projectError: 'Project not found', sample: 'loading' });
    expect(s).toMatchObject({ sampleUpdated: true, sampleUpdatedAt: '2026-01-02T00:00:00.000Z', sampleStale: true });
  });

  it('says why it is not ready, and the question that holds it', async () => {
    const asking = harness({ storeReady: false, booting: true, bundleReplacePrompt: { kind: 'bundle', id: 'p1', name: 'Recipe' } });
    const s = await asking.call('sandbox_get_state');
    expect(s.ready).toBe(false);
    expect(s.waitingFor).toMatch(/question for the reader/);
    expect(s.question).toMatchObject({ about: 'project', id: 'p1', name: 'Recipe' });
    expect(s.question.answer).toMatch(/sandbox_answer/);
    expect((await harness({ bookLoading: true }).call('sandbox_get_state')).waitingFor).toBe('Another book is being opened.');
    expect((await harness({ storeReady: false }).call('sandbox_get_state')).waitingFor).toMatch(/kept in this browser/);
  });
});

describe('sandbox_answer', () => {
  const answerOn = (initial: Partial<SandboxState>, answers: boolean[] = []) => {
    const h = harness(initial, {
      answerBundleReplace: (replace: boolean) => {
        answers.push(replace);
        h.host.store.dispatch({ type: 'SET_BUNDLE_REPLACE_PROMPT', payload: null });
      },
    });
    const tool = answerTools(h.host)[0]!;
    return { ...h, tool, answer: (args: Record<string, unknown>) => runTool(tool, args) as Promise<Record<string, any>> }; // eslint-disable-line @typescript-eslint/no-explicit-any
  };

  it('answers the question a link raised', async () => {
    const answers: boolean[] = [];
    const { answer, get, tool } = answerOn({ bundleReplacePrompt: { kind: 'preset', id: 'guide', name: 'Guide' } }, answers);
    expect(tool.annotations?.consequentialHint).toBe(true);
    const done = await answer({ replaceCopy: false });
    expect(done).toMatchObject({ ok: true, answered: { about: 'sample', id: 'guide', name: 'Guide', replaced: false }, onScreen: { kind: 'sample', id: 'guide' } });
    expect(answers).toEqual([false]);
    expect(get().bundleReplacePrompt).toBeNull();
    expect((await answer({ replaceCopy: true })).error).toMatch(/not asking anything/);
    expect(answers).toEqual([false]);
  });

  it('dismisses the notice', async () => {
    const { answer, get } = answerOn({ projectNotice: 'Two pictures were left out' });
    expect(await answer({ dismissNotice: true })).toMatchObject({ ok: true, dismissed: 'Two pictures were left out' });
    expect(get().projectNotice).toBeNull();
    expect((await answer({})).error).toMatch(/Nothing to answer/);
  });
});

describe('the books', () => {
  it('list covers and the languages a sample was edited in', async () => {
    const { call } = harness({
      projects: [project({ thumbnail: { fileId: 'project:p1:thumbnail-1.png', mime: 'image/png' } }), project({ id: 'p2', name: 'Bare' })],
      presetSummaries: [
        { id: 'guide', name: 'Guide', source: 'builtin', available: true, locales: ['en', 'es'] },
        { id: 'atlas', name: 'Atlas', source: 'builtin', available: true },
      ],
      presetDrafts: [draft('guide', 'es'), draft('guide', 'en')],
    });
    const books = await call('sandbox_list_books');
    expect(books.projects.map((p: { cover?: boolean }) => p.cover)).toEqual([true, undefined]);
    expect(books.samples[0]).toMatchObject({ id: 'guide', edited: true, editedLanguages: ['es', 'en'] });
    expect(books.samples[1]).not.toHaveProperty('edited');
  });

  it('set a cover through the panel\'s action, and report a picture it refuses', async () => {
    const calls: [string, string | null][] = [];
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const h = harness({ projects: [project()], activeProjectId: 'p1' }, {
      projectActions: {
        setThumbnail: async (id: string, file: File | null) => {
          calls.push([id, file ? file.type : null]);
          if (file && file.type !== 'image/png') {
            h.host.store.dispatch({ type: 'SET_PROJECT_NOTICE', payload: 'That file is not an image' });
            return;
          }
          h.host.store.dispatch({ type: 'UPSERT_PROJECT_SUMMARY', payload: project(file ? { thumbnail: { fileId: `project:p1:thumbnail-${calls.length}.png`, mime: 'image/png' } } : {}) });
        },
      } as unknown as ProjectActions,
    });
    expect(await h.call('sandbox_save_book', { action: 'remove_cover' })).toMatchObject({ ok: true, cover: false, changed: false });
    expect(calls).toEqual([]);
    expect(await h.call('sandbox_save_book', { action: 'set_cover', file: { base64: base64(png), fileName: 'cover.png' } })).toMatchObject({ ok: true, project: 'p1', cover: true });
    expect(h.get().projects[0]!.thumbnail).toBeDefined();
    const refused = await h.call('sandbox_save_book', { action: 'set_cover', id: 'p1', file: { base64: base64('hello'), fileName: 'notes.txt', mimeType: 'text/plain' } });
    expect(refused.error).toMatch(/was not taken as the cover \(text\/plain\).*That file is not an image/);
    expect(refused.notice).toBe('That file is not an image');
    expect(await h.call('sandbox_save_book', { action: 'remove_cover', id: 'p1' })).toMatchObject({ ok: true, cover: false, changed: true });
    expect(calls).toEqual([['p1', 'image/png'], ['p1', 'text/plain'], ['p1', null]]);
    expect((await h.call('sandbox_save_book', { action: 'set_cover', id: 'nope', file: { base64: base64(png) } })).error).toMatch(/No project with id "nope"/);
    expect((await h.call('sandbox_save_book', { action: 'set_cover' })).error).toMatch(/needs the picture as "file"/);
    expect((await harness().call('sandbox_save_book', { action: 'remove_cover' })).error).toMatch(/A cover belongs to a project/);
  });

  it('duplicate a sample from the reader\'s edited version, or from the original', async () => {
    const sources: (DuplicateSource | { from: string })[] = [];
    const actions = {
      duplicate: async (source: DuplicateSource) => { sources.push(source); return 'new'; },
      create: async (opts: { from: string }) => { sources.push(opts); return 'new'; },
    } as unknown as ProjectActions;
    // A project is on screen; the sample was edited in Spanish only.
    const initial: Partial<SandboxState> = {
      projects: [project()],
      activeProjectId: 'p1',
      presetSummaries: [{ id: 'guide', name: 'Guide', source: 'builtin', available: true, locales: ['en', 'es'] }],
      presetDrafts: [draft('guide', 'es')],
    };
    const { call } = harness(initial, { projectActions: actions });
    expect(await call('sandbox_save_book', { action: 'duplicate', kind: 'sample', id: 'guide' })).toMatchObject({ ok: true, project: 'new', copied: 'edited' });
    expect(await call('sandbox_save_book', { action: 'duplicate', kind: 'sample', id: 'guide', language: 'es', from: 'edited' })).toMatchObject({ copied: 'edited' });
    expect(await call('sandbox_save_book', { action: 'duplicate', kind: 'sample', id: 'guide', language: 'es', from: 'original' })).toMatchObject({ copied: 'original' });
    expect(await call('sandbox_save_book', { action: 'duplicate', kind: 'sample', id: 'guide', language: 'en' })).toMatchObject({ copied: 'original' });
    expect((await call('sandbox_save_book', { action: 'duplicate', kind: 'sample', id: 'guide', language: 'en', from: 'edited' })).error).toMatch(/no edited version of "guide" in en \(edited: es\)/);
    expect(await call('sandbox_save_book', { action: 'duplicate', kind: 'project', id: 'p1' })).toMatchObject({ ok: true, project: 'new' });
    expect(sources).toEqual([
      { kind: 'preset', id: 'guide', locale: 'es', draftKey: 'guide::es' },
      { kind: 'preset', id: 'guide', locale: 'es', draftKey: 'guide::es' },
      { kind: 'preset', id: 'guide', locale: 'es' },
      { kind: 'preset', id: 'guide', locale: 'en' },
      { kind: 'project', id: 'p1' },
    ]);
    expect((await call('sandbox_save_book', { action: 'duplicate', kind: 'sample', id: 'nope' })).error).toMatch(/No sample with id "nope"/);

    // The sample on screen with edits is copied as it stands.
    sources.length = 0;
    const onScreen = harness({ presetSummaries: initial.presetSummaries! }, { projectActions: actions });
    expect(await onScreen.call('sandbox_save_book', { action: 'duplicate', kind: 'sample', id: 'guide' })).toMatchObject({ copied: 'edited' });
    expect(sources).toEqual([{ from: 'current' }]);
  });

  it('add a language to a project, and rename it for one language only (#989, #999)', async () => {
    const added: [string, string][] = [];
    const renamed: unknown[][] = [];
    const h = harness({ projects: [project({ locales: ['es', 'en'], locale: 'es' }), project({ id: 'p2', name: 'Other' })], activeProjectId: 'p1' }, {
      projectActions: {
        addEdition: async (id: string, locale: string) => { added.push([id, locale]); return locale !== 'es'; },
        rename: async (...args: unknown[]) => { renamed.push(args); },
      } as unknown as ProjectActions,
    });
    expect(await h.call('sandbox_save_book', { action: 'add_language', language: 'fr' })).toMatchObject({ ok: true, project: 'p1', language: 'fr' });
    expect(await h.call('sandbox_save_book', { action: 'add_language', id: 'p2', language: 'zh-Hant' })).toMatchObject({ ok: true, project: 'p2' });
    expect(added).toEqual([['p1', 'fr'], ['p2', 'zh-Hant']]);
    expect((await h.call('sandbox_save_book', { action: 'add_language', language: 'es' })).error).toMatch(/already has an edition in es \(es, en\)/);
    expect((await h.call('sandbox_save_book', { action: 'add_language' })).error).toMatch(/needs "language"/);
    expect((await h.call('sandbox_save_book', { action: 'add_language', language: '!!' })).error).toMatch(/needs "language"/);
    expect((await h.call('sandbox_save_book', { action: 'add_language', id: 'nope', language: 'fr' })).error).toMatch(/No project with id "nope"/);
    expect((await harness().call('sandbox_save_book', { action: 'add_language', language: 'fr' })).error).toMatch(/works on a project/);
    expect(await h.call('sandbox_save_book', { action: 'rename', name: 'My book', thisLanguageOnly: true })).toMatchObject({ ok: true, name: 'My book', language: 'es' });
    await h.call('sandbox_save_book', { action: 'rename', id: 'p2', name: 'Renamed' });
    expect(renamed).toEqual([['p1', 'My book', undefined, { edition: true }], ['p2', 'Renamed', undefined, undefined]]);
  });

  it('export a book that is not on screen', async () => {
    const targets: (DuplicateSource | undefined)[] = [];
    const { call } = harness({
      projects: [project()],
      presetSummaries: [
        { id: 'guide', name: 'Guide', source: 'builtin', available: true, locales: ['en', 'es'] },
        { id: 'atlas', name: 'Atlas of Spain', source: 'builtin', available: true },
      ],
      presetApplied: { presetId: 'guide', fingerprint: 'f', markdownHash: '', configHash: '', resourcesHash: '', locale: 'es' },
    }, {
      projectActions: {
        exportProject: async (target?: DuplicateSource) => {
          if (target?.id === 'atlas') throw new Error('Preset not found');
          targets.push(target);
        },
      } as unknown as ProjectActions,
    });
    expect(await call('sandbox_export', { format: 'postext', book: { kind: 'project', id: 'p1' } })).toMatchObject({ ok: true, downloaded: true, file: 'mine.postext', book: { kind: 'project', id: 'p1' } });
    expect(await call('sandbox_export', { format: 'postext', book: { kind: 'sample', id: 'guide', language: 'en' } })).toMatchObject({ file: 'guide.postext' });
    // The sample on screen is exported in the language it is open in.
    await call('sandbox_export', { format: 'postext', book: { kind: 'sample', id: 'guide' } });
    await call('sandbox_export', { format: 'postext' });
    expect(targets).toEqual([{ kind: 'project', id: 'p1' }, { kind: 'preset', id: 'guide', locale: 'en' }, { kind: 'preset', id: 'guide', locale: 'es' }, undefined]);
    expect((await call('sandbox_export', { format: 'postext', book: { kind: 'sample', id: 'atlas' } })).error).toBe('The book could not be exported: Preset not found');
    expect((await call('sandbox_export', { format: 'postext', book: { kind: 'project', id: 'nope' } })).error).toMatch(/No project with id "nope"\. The projects: p1 \(Mine\)/);
    expect((await call('sandbox_export', { format: 'markdown', book: { kind: 'project', id: 'p1' } })).error).toMatch(/"book" goes with format "postext"/);
    expect((await call('sandbox_export', { format: 'postext', variant: 'semantic' })).error).toMatch(/"variant" goes with format "docx"/);
    expect((await call('sandbox_export', { format: 'docx', variant: 'plain' })).error).toMatch(/variant/);
  });

  it('say which languages a .postext file carries, without importing it', async () => {
    let imported = 0;
    const { call } = harness({}, { projectActions: { importBundleBytes: async () => { imported++; return 'new'; } } as unknown as ProjectActions });
    const bundle = (manifest: Record<string, unknown>): string => base64(zipSync({ 'preset.json': strToU8(JSON.stringify(manifest)) }));
    const several = await call('sandbox_import_book', { inspect: true, file: { base64: bundle({ id: 'quijote', name: 'Don Quijote', locale: 'es', chapters: { es: [], en: [] } }), fileName: 'quijote.postext' } });
    expect(several).toMatchObject({ ok: true, imported: false, file: 'quijote.postext', id: 'quijote', name: 'Don Quijote', languages: ['es', 'en'], writtenIn: 'es' });
    expect(several.note).toMatch(/language/);
    const one = await call('sandbox_import_book', { inspect: true, file: { base64: bundle({ id: 'solo', locale: 'ca' }) } });
    expect(one).toMatchObject({ languages: ['ca'], writtenIn: 'ca' });
    expect(one).not.toHaveProperty('note');
    expect((await call('sandbox_import_book', { inspect: true, file: { base64: base64('not a zip') } })).error).toMatch(/not a \.postext book/);
    expect(imported).toBe(0);
    const done = await call('sandbox_import_book', { file: { base64: bundle({ id: 'quijote', locales: ['es', 'en'] }) }, language: 'en' });
    expect(done).toMatchObject({ ok: true, project: 'new', languages: ['es', 'en'] });
    expect(imported).toBe(1);
  });
});

describe('the text', () => {
  it('is replaced from a Markdown file', async () => {
    const { call, get } = harness();
    const done = await call('sandbox_write_text', { chapter: 2, file: { base64: base64('# From a file\n\nTexto con eñe.\n'), fileName: 'second.md' }, wait: false });
    expect(done).toMatchObject({ ok: true, chapter: 2, changed: true, file: 'second.md', undo: expect.stringMatching(/sandbox_undo_text/) });
    expect(get().chapters[1]!.markdown).toBe('# From a file\n\nTexto con eñe.\n');
    expect((await call('sandbox_write_text', { chapter: 2 })).error).toMatch(/one of the two/);
    expect((await call('sandbox_write_text', { markdown: 'x', file: { base64: base64('y') } })).error).toMatch(/one of the two/);
  });

  it('takes an edit back, and puts it back', async () => {
    const { call, get } = harness();
    const second = get().chapters[1]!.markdown;
    const opening = get().markdown;
    expect((await call('sandbox_undo_text')).error).toMatch(/no edit to take back/);
    const edited = await call('sandbox_edit_text', { edits: [{ find: 'The last words of the opening.', replace: 'New last words.' }, { find: '# Opening', replace: '# Overture' }], wait: false });
    expect(edited.undo).toMatch(/sandbox_undo_text/);
    await call('sandbox_write_text', { chapter: 2, markdown: '# Rewritten\n', wait: false });

    // Latest first, whatever the chapter; a chapter named is a condition.
    expect((await call('sandbox_undo_text', { chapter: 1, wait: false })).error).toMatch(/was to chapter 2 \(Second\)/);
    expect(await call('sandbox_undo_text', { chapter: 2, wait: false })).toMatchObject({ ok: true, undone: true, chapter: 2, title: 'Second', canUndo: true, canRedo: true, laidOut: false });
    expect(get().chapters[1]!.markdown).toBe(second);
    expect(await call('sandbox_undo_text', { wait: false })).toMatchObject({ undone: true, chapter: 1, canUndo: false, canRedo: true });
    expect(get().markdown).toBe(opening);
    expect(get().chapters[0]!.markdown).toBe(opening);

    expect(await call('sandbox_undo_text', { redo: true, wait: false })).toMatchObject({ redone: true, chapter: 1, canUndo: true, canRedo: true });
    expect(get().markdown).toContain('# Overture');
    expect(get().markdown).toContain('New last words.');
    expect(await call('sandbox_undo_text', { redo: true, wait: false })).toMatchObject({ redone: true, chapter: 2, canRedo: false });
    expect(get().chapters[1]!.markdown).toBe('# Rewritten\n');
    expect((await call('sandbox_undo_text', { redo: true })).error).toMatch(/no edit to put back/);
  });

  it('takes an edit back over what was changed since by other means, and forgets the edits of a chapter removed', async () => {
    const { call, get, host } = harness();
    await call('sandbox_edit_text', { edits: [{ find: '# Opening', replace: '# First' }], wait: false });
    await call('sandbox_edit_text', { edits: [{ find: 'The last words of the opening.', replace: 'The end.' }], wait: false });
    // The chapter is changed by other means (no step of the history).
    host.store.dispatch({ type: 'SET_MARKDOWN', payload: `${get().markdown}\nAdded by other means.\n` });
    expect(await call('sandbox_undo_text', { wait: false })).toMatchObject({ undone: true, chapter: 1 });
    // The edit is taken back, what came after it stays (#899).
    expect(get().markdown).toContain('The last words of the opening.');
    expect(get().markdown).toContain('Added by other means.');
    expect(get().markdown).toContain('# First');

    // An edit to a chapter that is gone is forgotten: the one before it comes back.
    await call('sandbox_write_text', { chapter: 2, markdown: '# Short\n', wait: false });
    await call('sandbox_remove_chapter', { chapter: 2, wait: false });
    expect(await call('sandbox_undo_text', { wait: false })).toMatchObject({ undone: true, chapter: 1, canUndo: false });
    expect(get().markdown.startsWith('# Opening')).toBe(true);
    expect((await call('sandbox_undo_text')).error).toMatch(/no edit to take back/);
  });

  it('refuses a design change, which sandbox_undo takes back', async () => {
    const { call, get } = harness();
    await call('sandbox_edit_text', { edits: [{ find: '# Opening', replace: '# First' }], wait: false });
    expect((await call('sandbox_set_config', { changes: [{ path: 'bodyText.fontSize', value: { value: 11, unit: 'pt' } }], wait: false })).ok).toBe(true);
    expect((await call('sandbox_undo_text')).error).toMatch(/was to the design \(bodyText\.fontSize\).*sandbox_undo/);
    expect(await call('sandbox_undo', { wait: false })).toMatchObject({ undone: { kind: 'design', settings: ['bodyText.fontSize'] }, canUndo: true, canRedo: true });
    expect(get().config.bodyText?.fontSize).toBeUndefined();
    expect(await call('sandbox_undo', { wait: false })).toMatchObject({ undone: { kind: 'text', chapter: 1, title: 'Opening' }, canUndo: false });
    expect(get().markdown.startsWith('# Opening')).toBe(true);
    expect((await call('sandbox_get_state')).history).toEqual({ undo: null, redo: { kind: 'text', chapter: 1, title: 'Opening' } });
    expect(await call('sandbox_undo', { redo: true, wait: false })).toMatchObject({ redone: { kind: 'text', chapter: 1 } });
    expect(await call('sandbox_undo', { redo: true, wait: false })).toMatchObject({ redone: { kind: 'design' }, canRedo: false });
    expect(get().config.bodyText?.fontSize).toEqual({ value: 11, unit: 'pt' });
    expect((await call('sandbox_undo', { redo: true })).error).toMatch(/nothing to put back/);
  });

  it('places the caret or a selection, and opens the Manuscript panel on it', async () => {
    const { call, get } = harness();
    const second = get().chapters[1]!.markdown;
    const byText = await call('sandbox_select_text', { chapter: 2, text: '# Second' });
    expect(byText).toMatchObject({ ok: true, chapter: 2, title: 'Second', placed: false, selection: { chapter: 2, from: 0, to: 8, fromLine: 1, toLine: 1, toColumn: 9, text: '# Second' } });
    expect(get().activePanel).toBe('markdown');
    // The request switches the chapter, as a click on a finding does.
    expect(get().activeChapterId).toBe('b');
    expect(get().pendingEditorFocus).toEqual({ chapterId: 'b', anchor: 0, head: 8, selectWord: false });

    const line = await call('sandbox_select_text', { chapter: 2, line: 3 });
    expect(line.caret).toEqual({ chapter: 2, offset: 10, line: 3, column: 1 });
    const lines = await call('sandbox_select_text', { chapter: 2, line: 1, toLine: 3 });
    expect(lines.selection).toMatchObject({ from: 0, to: second.length - 1, fromLine: 1, toLine: 3 });
    const range = await call('sandbox_select_text', { chapter: 2, offset: 2, toOffset: 8 });
    expect(range.selection.text).toBe('Second');
    expect(get().pendingEditorFocus).toEqual({ chapterId: 'b', anchor: 2, head: 8, selectWord: false });

    const nth = await call('sandbox_select_text', { chapter: 2, text: 'typography', occurrence: 2 });
    expect(nth.selection.from).toBe(second.indexOf('typography', second.indexOf('typography') + 1));
    expect((await call('sandbox_select_text', { chapter: 2, text: 'typography' })).error).toMatch(/occurs 4 times in chapter 2 \(Second\) \(lines 3, 3, 3, 3\)/);
    expect((await call('sandbox_select_text', { chapter: 2, text: 'typography', occurrence: 9 })).error).toMatch(/occurrence 9 is not one of them/);
    expect((await call('sandbox_select_text', { chapter: 2, text: 'nowhere' })).error).toMatch(/not in chapter 2/);
    expect((await call('sandbox_select_text', { chapter: 2, line: 99 })).error).toBe('Chapter 2 has 4 line(s).');
    expect((await call('sandbox_select_text', { chapter: 2, offset: 99999 })).error).toMatch(/characters long/);
    expect((await call('sandbox_select_text', { chapter: 2, line: 1, offset: 3 })).error).toMatch(/one of "text"/);
    expect((await call('sandbox_select_text', { chapter: 2, line: 1, toOffset: 3 })).error).toBe('"toOffset" goes with "offset", not with "line".');
  });

  it('leaves the side panel alone when told to', async () => {
    const { call, get } = harness({ activePanel: 'config' });
    const done = await call('sandbox_select_text', { line: 1, openPanel: false });
    expect(done).toMatchObject({ placed: false, caret: { chapter: 1, offset: 0, line: 1, column: 1 } });
    expect(done.note).toMatch(/Manuscript panel is not open/);
    expect(get().activePanel).toBe('config');
  });

  it('answers with the selection the editor reports once it took the request', async () => {
    const h = harness({ activePanel: 'markdown' });
    h.host.settleTimeoutMs = 200;
    // The editor: it takes the request as soon as the state carries it.
    const unsubscribe = h.host.store.subscribe(() => {
      const focus = h.get().pendingEditorFocus;
      if (!focus) return;
      h.host.store.dispatch({ type: 'SET_SELECTION', payload: { from: focus.anchor, to: focus.head, head: focus.head } });
      h.host.store.dispatch({ type: 'SET_PENDING_EDITOR_FOCUS', payload: null });
    });
    const done = await h.call('sandbox_select_text', { text: '# Opening' });
    unsubscribe();
    expect(done).toMatchObject({ placed: true, selection: { chapter: 1, from: 0, to: 9, text: '# Opening' } });
    expect(done).not.toHaveProperty('note');
    expect((await h.call('sandbox_get_state')).selection).toMatchObject({ from: 0, to: 9 });
  });
});
