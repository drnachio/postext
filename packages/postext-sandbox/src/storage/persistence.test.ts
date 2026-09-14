import { afterEach, describe, expect, it } from 'vitest';
import { loadPanel, loadProjectId, saveProjectId } from './persistence';

function installStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  const localStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
  };
  (globalThis as { window?: unknown }).window = { localStorage };
  return map;
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe('loadPanel', () => {
  it('maps the legacy presets panel to projects', () => {
    installStorage({ 'postext-sandbox-panel': 'presets' });
    expect(loadPanel()).toBe('projects');
    installStorage({ 'postext-sandbox-panel': 'markdown' });
    expect(loadPanel()).toBe('markdown');
    installStorage({ 'postext-sandbox-panel': '__closed__' });
    expect(loadPanel()).toBeNull();
    installStorage();
    expect(loadPanel()).toBeUndefined();
  });
});

describe('project id', () => {
  it('round-trips and clears on null', () => {
    const map = installStorage();
    saveProjectId('abc');
    expect(loadProjectId()).toBe('abc');
    saveProjectId(null);
    expect(loadProjectId()).toBeNull();
    expect(map.has('postext-sandbox-project')).toBe(false);
  });
});

describe('working book', () => {
  const migration = { ids: () => 'gen', untitled: (n: number) => `Chapter ${n}` };
  it('falls back to the legacy markdown key as a one-chapter book', async () => {
    installStorage({ 'postext-sandbox-markdown': '# Old\n\ntext' });
    const { loadBook } = await import('./persistence');
    const book = loadBook(migration)!;
    expect(book.chapters).toHaveLength(1);
    expect(book.chapters[0]!.title).toBe('Old');
    expect(book.activeChapterId).toBe('gen');
  });
  it('round-trips and removes the legacy key on save', async () => {
    const map = installStorage({ 'postext-sandbox-markdown': 'old' });
    const { loadBook, saveBook } = await import('./persistence');
    const book = { chapters: [{ id: 'a', title: 'A', markdown: 'x', createdAt: 1, updatedAt: 1 }], activeChapterId: 'a', layoutScope: 'chapter' as const };
    saveBook(book);
    expect(map.has('postext-sandbox-markdown')).toBe(false);
    expect(loadBook(migration)).toEqual(book);
  });
  it('returns null when nothing was saved', async () => {
    installStorage();
    const { loadBook } = await import('./persistence');
    expect(loadBook(migration)).toBeNull();
  });
});

describe('hidden presets', () => {
  it('round-trips and tolerates garbage', async () => {
    installStorage({ 'postext-sandbox-hidden-presets': '{"nope":1}' });
    const { loadHiddenPresetIds, saveHiddenPresetIds } = await import('./persistence');
    expect(loadHiddenPresetIds()).toEqual([]);
    saveHiddenPresetIds(['a', 'b']);
    expect(loadHiddenPresetIds()).toEqual(['a', 'b']);
  });
});
