import { afterEach, describe, expect, it } from 'vitest';
import { stripConfigDefaults, type PostextConfig } from 'postext';
import { CONFIG_VERSION, LEGACY_MATH_SIZE } from 'postext/bundle';

// The Sandbox stamps its records, working copy and config exports with the
// engine's `CONFIG_VERSION`, and hands that stamp back to the engine's
// `migrateConfig`. A stamp of its own would drift from the engine's the
// first time the engine bumps it: every load would then read a copy saved
// a moment ago as older, and migrate it again. Rules 4 (postext 1.5) pin
// the maths size of a configuration written before them — a multiplied
// scale, which a second migration would multiply again —, rules 5 its
// inline gap (`layout.inlineResourceGap: 'above'`) and rules 6 the gap
// around the inline figures of its boxes (`layout.inlineResourceGapInBoxes:
// false`).

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

const MATHS = 'The area is $\\pi r^2$.';
const chapter = (markdown: string) => ({ id: 'a', title: 'A', markdown, createdAt: 1, updatedAt: 1 });
const deps = { ids: () => 'x', untitled: (n: number) => `Chapter ${n}` };

describe('record version follows the engine\'s CONFIG_VERSION', () => {
  it('is the engine constant', async () => {
    const { PROJECT_RECORD_VERSION } = await import('./projectMigration');
    expect(CONFIG_VERSION).toBe(11);
    expect(PROJECT_RECORD_VERSION).toBe(CONFIG_VERSION);
  });

  it('migrates the working copy once: loading and saving it twice leaves it as it was', async () => {
    const map = installStorage({
      'postext-sandbox-config': JSON.stringify({ math: { fontSizeScale: 1.2 } }),
      'postext-sandbox-config-version': '3',
      'postext-sandbox-book': JSON.stringify({ version: 2, activeChapterId: 'a', chapters: [chapter(MATHS)] }),
    });
    const { loadConfig, saveConfig } = await import('./persistence');
    const first = loadConfig()!;
    expect(first.math?.fontSizeScale).toBe(1.2 * LEGACY_MATH_SIZE);
    saveConfig(first);
    expect(map.get('postext-sandbox-config-version')).toBe('11');
    const second = loadConfig()!;
    expect(second).toEqual(first);
    saveConfig(second);
    expect(loadConfig()).toEqual(first);
  });

  it('migrates a project record once, and stores it as it reads back', async () => {
    const { migrateProjectRecord } = await import('./projectMigration');
    const saved = {
      version: 3, id: 'p', name: 'P', resources: [], createdAt: 1, updatedAt: 1,
      chapters: [chapter(MATHS)],
      activeChapterId: 'a',
      config: { math: { fontSizeScale: 1.2 } },
    };
    const once = migrateProjectRecord(saved, deps)!;
    expect(once.version).toBe(11);
    expect(once.config.math?.fontSizeScale).toBe(1.2 * LEGACY_MATH_SIZE);
    const twice = migrateProjectRecord(once, deps)!;
    expect(twice.config).toEqual(once.config);
    // What `saveProject` stores (the stamp and the stripped config) reads
    // back unchanged, save after save.
    const stored = { ...twice, config: stripConfigDefaults(twice.config) };
    expect(migrateProjectRecord(stored, deps)!.config).toEqual(stored.config);
    expect(migrateProjectRecord(migrateProjectRecord(stored, deps)!, deps)!.config).toEqual(stored.config);
  });

  it('leaves the configuration of a record whose book sets no maths as it was', async () => {
    const { migrateProjectRecord } = await import('./projectMigration');
    const config: PostextConfig = { bodyText: { fontFamily: 'Georgia' } };
    const saved = {
      version: 3, id: 'p', name: 'P', resources: [], createdAt: 1, updatedAt: 1,
      chapters: [chapter('Prose only.')], activeChapterId: 'a', config,
    };
    expect(migrateProjectRecord(saved, deps)!.config).toEqual(config);
  });

  it('reads back its own config exports as they are', async () => {
    const { configFromExport } = await import('./persistence');
    const { PROJECT_RECORD_VERSION } = await import('./projectMigration');
    const config = { math: { fontSizeScale: 2 } };
    expect(configFromExport({ type: 'postext-config', version: 1, configVersion: PROJECT_RECORD_VERSION, config })).toEqual(config);
    expect(configFromExport({ type: 'postext-config', version: 1, configVersion: 3, config }).math?.fontSizeScale).toBe(2 * LEGACY_MATH_SIZE);
  });
});
