import { describe, expect, it } from 'vitest';
import { sandboxReducer, type SandboxState } from './SandboxContext';
import { DEFAULT_LABELS } from '../types';
import { BUILTIN_PRESET_ID } from '../presets';

function ch(id: string, markdown = ''): SandboxState['chapters'][number] {
  return { id, title: id.toUpperCase(), markdown, createdAt: 1, updatedAt: 1 };
}

function baseState(over: Partial<SandboxState> = {}): SandboxState {
  return {
    markdown: '# A',
    chapters: [ch('a', '# A'), ch('b', '# B')],
    activeChapterId: 'a',
    pdfScope: 'chapter',
    canvasScope: 'chapter',
    chapterLayouts: {},
    hiddenPresetIds: [],
    config: {},
    resources: [],
    storeReady: true,
    activePanel: null,
    sidebarPercent: 25,
    sidebarDragging: false,
    activeViewport: 'canvas',
    labels: DEFAULT_LABELS,
    locale: 'en',
    selection: { from: 0, to: 0, head: 0 },
    editorFocused: false,
    pendingEditorFocus: null,
    activeResourceId: null,
    pendingResourceFocus: null,
    resourceSelection: null,
    docVersion: 0,
  bookVersion: 0,
    activePresetId: 'remote-a',
    presetStatus: 'idle',
    presetConfig: { pageSize: 'A4' } as SandboxState['presetConfig'],
    presetSummaries: [],
    presetApplied: { presetId: 'remote-a', fingerprint: 'f', markdownHash: 'm', configHash: 'c', resourcesHash: 'r' },
    presetStale: true,
    presetUpdatedAt: 5,
    activeProjectId: null,
    projects: [],
    projectStatus: 'idle',
    projectNotice: null,
    ...over,
  };
}

describe('SET_ACTIVE_PROJECT', () => {
  it('entering a project resets preset bookkeeping and adopts the source preset', () => {
    const s = sandboxReducer(baseState(), { type: 'SET_ACTIVE_PROJECT', payload: { id: 'p1', sourcePresetId: 'remote-b' } });
    expect(s.activeProjectId).toBe('p1');
    expect(s.activePresetId).toBe('remote-b');
    expect(s.presetApplied).toBeNull();
    expect(s.presetStale).toBe(false);
    expect(s.presetUpdatedAt).toBeNull();
    expect(s.presetConfig).toBeUndefined();
  });

  it('falls back to the built-in preset when a project has no source', () => {
    const s = sandboxReducer(baseState(), { type: 'SET_ACTIVE_PROJECT', payload: { id: 'p1' } });
    expect(s.activePresetId).toBe(BUILTIN_PRESET_ID);
  });

  it('leaving a project keeps preset fields untouched', () => {
    const before = baseState({ activeProjectId: 'p1' });
    const s = sandboxReducer(before, { type: 'SET_ACTIVE_PROJECT', payload: { id: null } });
    expect(s.activeProjectId).toBeNull();
    expect(s.activePresetId).toBe('remote-a');
    expect(s.presetApplied).toBe(before.presetApplied);
    expect(sandboxReducer(s, { type: 'SET_ACTIVE_PROJECT', payload: { id: null } })).toBe(s);
  });
});

describe('project summaries', () => {
  const summary = (id: string, name = id) => ({ id, name, createdAt: 0, updatedAt: 0, chapterCount: 1 });

  it('upserts by id and removes', () => {
    let s = sandboxReducer(baseState(), { type: 'SET_PROJECT_LIST', payload: [summary('a'), summary('b')] });
    s = sandboxReducer(s, { type: 'UPSERT_PROJECT_SUMMARY', payload: summary('b', 'B2') });
    expect(s.projects.map((p) => p.name)).toEqual(['a', 'B2']);
    s = sandboxReducer(s, { type: 'UPSERT_PROJECT_SUMMARY', payload: summary('c') });
    expect(s.projects.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    s = sandboxReducer(s, { type: 'REMOVE_PROJECT_SUMMARY', payload: 'a' });
    expect(s.projects.map((p) => p.id)).toEqual(['b', 'c']);
  });

  it('tracks status and notice', () => {
    let s = sandboxReducer(baseState(), { type: 'SET_PROJECT_STATUS', payload: { status: 'error', error: 'boom' } });
    expect(s.projectStatus).toBe('error');
    expect(s.projectError).toBe('boom');
    s = sandboxReducer(s, { type: 'SET_PROJECT_NOTICE', payload: 'hi' });
    expect(s.projectNotice).toBe('hi');
    expect(sandboxReducer(s, { type: 'SET_PROJECT_NOTICE', payload: 'hi' })).toBe(s);
  });
});

describe('resource selection state', () => {
  const table = { id: 't1', typeId: 'table', kind: 'table' as const, createdAt: 0, updatedAt: 0 };
  const focus = { resourceId: 't1', target: { kind: 'cell' as const, row: 1, col: 0 }, anchor: 2, head: 5, selectWord: false };
  const sel = { resourceId: 't1', target: { kind: 'caption' as const }, from: 0, to: 3, head: 3 };

  it('SET_ACTIVE_RESOURCE opens the detail view and is idempotent', () => {
    const s = sandboxReducer(baseState(), { type: 'SET_ACTIVE_RESOURCE', payload: 't1' });
    expect(s.activeResourceId).toBe('t1');
    expect(sandboxReducer(s, { type: 'SET_ACTIVE_RESOURCE', payload: 't1' })).toBe(s);
  });

  it('switching resource drops the other resource\'s focus request and selection', () => {
    const s = baseState({ activeResourceId: 't1', pendingResourceFocus: focus, resourceSelection: sel });
    const next = sandboxReducer(s, { type: 'SET_ACTIVE_RESOURCE', payload: 't2' });
    expect(next.pendingResourceFocus).toBeNull();
    expect(next.resourceSelection).toBeNull();
    const back = sandboxReducer(s, { type: 'SET_ACTIVE_RESOURCE', payload: null });
    expect(back.activeResourceId).toBeNull();
    expect(back.resourceSelection).toBeNull();
  });

  it('SET_PENDING_RESOURCE_FOCUS dedupes identical requests', () => {
    const s = sandboxReducer(baseState(), { type: 'SET_PENDING_RESOURCE_FOCUS', payload: focus });
    expect(s.pendingResourceFocus).toEqual(focus);
    expect(sandboxReducer(s, { type: 'SET_PENDING_RESOURCE_FOCUS', payload: { ...focus } })).toBe(s);
    const moved = sandboxReducer(s, { type: 'SET_PENDING_RESOURCE_FOCUS', payload: { ...focus, head: 6 } });
    expect(moved.pendingResourceFocus?.head).toBe(6);
    const other = sandboxReducer(s, { type: 'SET_PENDING_RESOURCE_FOCUS', payload: { ...focus, target: { kind: 'cell', row: 1, col: 1 } } });
    expect(other).not.toBe(s);
    expect(sandboxReducer(s, { type: 'SET_PENDING_RESOURCE_FOCUS', payload: null }).pendingResourceFocus).toBeNull();
  });

  it('SET_RESOURCE_SELECTION dedupes identical selections', () => {
    const s = sandboxReducer(baseState(), { type: 'SET_RESOURCE_SELECTION', payload: sel });
    expect(s.resourceSelection).toEqual(sel);
    expect(sandboxReducer(s, { type: 'SET_RESOURCE_SELECTION', payload: { ...sel } })).toBe(s);
    expect(sandboxReducer(s, { type: 'SET_RESOURCE_SELECTION', payload: { ...sel, to: 4 } }).resourceSelection?.to).toBe(4);
  });

  it('DELETE_RESOURCE and SET_RESOURCES clear stale ids', () => {
    const s = baseState({ resources: [table], activeResourceId: 't1', pendingResourceFocus: focus, resourceSelection: sel });
    const deleted = sandboxReducer(s, { type: 'DELETE_RESOURCE', payload: 't1' });
    expect(deleted.activeResourceId).toBeNull();
    expect(deleted.pendingResourceFocus).toBeNull();
    expect(deleted.resourceSelection).toBeNull();
    const kept = sandboxReducer(s, { type: 'SET_RESOURCES', payload: [table] });
    expect(kept.activeResourceId).toBe('t1');
    expect(kept.resourceSelection).toEqual(sel);
    const replaced = sandboxReducer(s, { type: 'SET_RESOURCES', payload: [] });
    expect(replaced.activeResourceId).toBeNull();
    expect(replaced.pendingResourceFocus).toBeNull();
  });
});

describe('book actions', () => {
  it('SET_MARKDOWN edits the active chapter and keeps the mirror in sync', () => {
    const base = baseState();
    const s = sandboxReducer(base, { type: 'SET_MARKDOWN', payload: 'edited' });
    expect(s.markdown).toBe('edited');
    expect(s.chapters[0]!.markdown).toBe('edited');
    expect(s.chapters[1]).toBe(base.chapters[1]);
    expect(sandboxReducer(s, { type: 'SET_MARKDOWN', payload: 'edited' })).toBe(s);
  });
  it('SET_ACTIVE_CHAPTER swaps the mirror and resets the selection', () => {
    const s = sandboxReducer(baseState({ selection: { from: 3, to: 3, head: 3 } }), { type: 'SET_ACTIVE_CHAPTER', payload: 'b' });
    expect(s.activeChapterId).toBe('b');
    expect(s.markdown).toBe('# B');
    expect(s.selection).toEqual({ from: 0, to: 0, head: 0 });
    expect(sandboxReducer(s, { type: 'SET_ACTIVE_CHAPTER', payload: 'nope' })).toBe(s);
  });
  it('REMOVE_CHAPTER guards the last chapter and re-targets the active one', () => {
    const s = sandboxReducer(baseState(), { type: 'REMOVE_CHAPTER', payload: 'a' });
    expect(s.chapters.map((c) => c.id)).toEqual(['b']);
    expect(s.activeChapterId).toBe('b');
    expect(s.markdown).toBe('# B');
    expect(sandboxReducer(s, { type: 'REMOVE_CHAPTER', payload: 'b' })).toBe(s);
  });
  it('ADD_CHAPTER inserts after the active one and activates it', () => {
    const s = sandboxReducer(baseState(), { type: 'ADD_CHAPTER', payload: { chapter: ch('n', 'new') } });
    expect(s.chapters.map((c) => c.id)).toEqual(['a', 'n', 'b']);
    expect(s.activeChapterId).toBe('n');
    expect(s.markdown).toBe('new');
  });
  it('SPLIT and MERGE round-trip', () => {
    const start = baseState({ chapters: [ch('a', '# One\ntext\n# Two\nmore')], activeChapterId: 'a', markdown: '# One\ntext\n# Two\nmore' });
    const split = sandboxReducer(start, { type: 'SPLIT_CHAPTER_AT_HEADINGS', payload: { id: 'a', newIds: ['x'] } });
    expect(split.chapters.map((c) => [c.id, c.markdown])).toEqual([['a', '# One\ntext'], ['x', '# Two\nmore']]);
    const merged = sandboxReducer(split, { type: 'MERGE_CHAPTER_WITH_PREVIOUS', payload: 'x' });
    expect(merged.chapters).toHaveLength(1);
    expect(merged.chapters[0]!.markdown).toBe('# One\ntext\n\n# Two\nmore');
  });
  it('SET_PENDING_EDITOR_FOCUS into another chapter switches the active chapter', () => {
    const s = sandboxReducer(baseState(), { type: 'SET_PENDING_EDITOR_FOCUS', payload: { chapterId: 'b', anchor: 2, head: 2, selectWord: false } });
    expect(s.activeChapterId).toBe('b');
    expect(s.markdown).toBe('# B');
    expect(s.pendingEditorFocus).toEqual({ chapterId: 'b', anchor: 2, head: 2, selectWord: false });
  });
  it('SET_BOOK replaces everything and resets the selection', () => {
    const s = sandboxReducer(baseState({ selection: { from: 1, to: 1, head: 1 } }), { type: 'SET_BOOK', payload: { chapters: [ch('z', 'zz')], activeChapterId: 'z' } });
    expect(s.markdown).toBe('zz');
    expect(s.selection).toEqual({ from: 0, to: 0, head: 0 });
  });
  it('SET_CANVAS_SCOPE switches what the canvas lays out and travels with the book', () => {
    const s = sandboxReducer(baseState(), { type: 'SET_CANVAS_SCOPE', payload: 'book' });
    expect(s.canvasScope).toBe('book');
    expect(sandboxReducer(s, { type: 'SET_CANVAS_SCOPE', payload: 'book' })).toBe(s);
    // A chapter switch keeps it; a book that names none opens chapter by chapter.
    expect(sandboxReducer(s, { type: 'SET_ACTIVE_CHAPTER', payload: 'b' }).canvasScope).toBe('book');
    expect(sandboxReducer(s, { type: 'SET_BOOK', payload: { chapters: s.chapters, activeChapterId: 'a' } }).canvasScope).toBe('chapter');
    expect(sandboxReducer(baseState(), { type: 'SET_BOOK', payload: { chapters: s.chapters, activeChapterId: 'a', canvasScope: 'book' } }).canvasScope).toBe('book');
  });
  it('SET_PDF_SCOPE switches what the PDF tab renders', () => {
    const s = sandboxReducer(baseState(), { type: 'SET_PDF_SCOPE', payload: 'book' });
    expect(s.pdfScope).toBe('book');
    expect(sandboxReducer(s, { type: 'SET_PDF_SCOPE', payload: 'book' })).toBe(s);
  });
  it('the PDF scope follows the canvas scope until it is picked by hand', () => {
    // A book laid out whole on the canvas is exported whole.
    const whole = sandboxReducer(baseState(), { type: 'SET_CANVAS_SCOPE', payload: 'book' });
    expect(whole.pdfScope).toBe('book');
    const opened = sandboxReducer(baseState(), { type: 'SET_BOOK', payload: { chapters: whole.chapters, activeChapterId: 'a', canvasScope: 'book' } });
    expect(opened.pdfScope).toBe('book');
    // Picking a PDF scope holds while the book is edited…
    const picked = sandboxReducer(opened, { type: 'SET_PDF_SCOPE', payload: 'chapter' });
    expect(sandboxReducer(picked, { type: 'SET_ACTIVE_CHAPTER', payload: 'b' }).pdfScope).toBe('chapter');
    // …and gives way when the canvas scope moves again.
    expect(sandboxReducer(picked, { type: 'SET_CANVAS_SCOPE', payload: 'chapter' }).pdfScope).toBe('chapter');
    expect(sandboxReducer(whole, { type: 'SET_CANVAS_SCOPE', payload: 'chapter' }).pdfScope).toBe('chapter');
  });
  it('SET_CHAPTER_LAYOUT records a chapter layout and forgets it with the chapter', () => {
    const layout = { chapterId: 'b', markdown: '# B', configKey: 'c', resourcesKey: 'r', engine: 'e', continuationKey: 'k', pageCount: 3, leadingBlankPages: 1, firstContentPageNumber: { delta: 1 }, firstContentPageFormat: 'decimal' as const, lastPageNumber: { delta: 2 }, lastPageFormat: 'decimal' as const, outlinePages: [], outlineKey: '' };
    const s = sandboxReducer(baseState(), { type: 'SET_CHAPTER_LAYOUT', payload: layout });
    expect(s.chapterLayouts.b).toBe(layout);
    // Unknown chapters are ignored.
    expect(sandboxReducer(s, { type: 'SET_CHAPTER_LAYOUT', payload: { ...layout, chapterId: 'nope' } })).toBe(s);
    const removed = sandboxReducer(s, { type: 'REMOVE_CHAPTER', payload: 'b' });
    expect(removed.chapterLayouts.b).toBeUndefined();
    const replaced = sandboxReducer(s, { type: 'SET_BOOK', payload: { chapters: [ch('z', 'zz')], activeChapterId: 'z' } });
    expect(replaced.chapterLayouts).toEqual({});
  });
  it('SET_CHAPTER_LAYOUT keeps the state when the record says nothing new', () => {
    const layout = { chapterId: 'b', markdown: '# B', configKey: 'c', resourcesKey: 'r', engine: 'e', continuationKey: 'k', pageCount: 3, leadingBlankPages: 1, firstContentPageNumber: { delta: 1 }, firstContentPageFormat: 'decimal' as const, lastPageNumber: { delta: 2 }, lastPageFormat: 'decimal' as const, outlinePages: [], outlineKey: '' };
    const s = sandboxReducer(baseState(), { type: 'SET_CHAPTER_LAYOUT', payload: layout });
    // Same inputs (by identity) and outcome: a fresh object is a no-op.
    expect(sandboxReducer(s, { type: 'SET_CHAPTER_LAYOUT', payload: { ...layout } })).toBe(s);
    // A different outcome is recorded.
    const grown = sandboxReducer(s, { type: 'SET_CHAPTER_LAYOUT', payload: { ...layout, pageCount: 4 } });
    expect(grown).not.toBe(s);
    expect(grown.chapterLayouts.b!.pageCount).toBe(4);
  });
});

describe('hidden presets', () => {
  it('hides and unhides, never the built-in preset', () => {
    const s = sandboxReducer(baseState(), { type: 'HIDE_PRESET', payload: 'remote-a' });
    expect(s.hiddenPresetIds).toEqual(['remote-a']);
    expect(sandboxReducer(s, { type: 'HIDE_PRESET', payload: BUILTIN_PRESET_ID })).toBe(s);
    expect(sandboxReducer(s, { type: 'UNHIDE_PRESET', payload: 'remote-a' }).hiddenPresetIds).toEqual([]);
  });
});
