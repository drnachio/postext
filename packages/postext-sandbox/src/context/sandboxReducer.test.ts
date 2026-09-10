import { describe, expect, it } from 'vitest';
import { sandboxReducer, type SandboxState } from './SandboxContext';
import { DEFAULT_LABELS } from '../types';
import { BUILTIN_PRESET_ID } from '../presets';

function baseState(over: Partial<SandboxState> = {}): SandboxState {
  return {
    markdown: '',
    defaultMarkdown: '',
    config: {},
    resources: [],
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
  const summary = (id: string, name = id) => ({ id, name, createdAt: 0, updatedAt: 0 });

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
