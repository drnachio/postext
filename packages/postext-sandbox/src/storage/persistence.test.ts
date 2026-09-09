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
