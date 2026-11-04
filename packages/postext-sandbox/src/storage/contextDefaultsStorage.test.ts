import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pinLegacyHtmlViewerBreaking } from 'postext/bundle';
import { avoidOrphansByDefault, avoidWidowsByDefault, balancingOnByDefault, type PostextConfig } from 'postext';
import { configKeyOf } from '../book/layoutKeys.js';
import { hashConfig, isDocumentUntouched } from '../presets/hash.js';
import { snapshotForApply } from '../presets/apply.js';
import type { LoadedPreset } from '../presets/types.js';
import { PROJECTS_STORE } from './blobStore.js';
import { configFromExport, loadConfig, saveConfig } from './persistence.js';
import { getPresetDraft, presetDraftKey, putPresetDraft, type PresetDraftRecord } from './presetDrafts.js';
import { getProject, putProject, updateProject, type ProjectRecord } from './projects.js';
import { PROJECT_RECORD_VERSION } from './projectMigration.js';

// #651: the Sandbox stores every configuration stripped of defaults. The
// strip took `headings.balancing.enabled: true` for the default it is on a
// plain page, so "Balance columns" turned on in a document on a character
// grid (or set vertically), and the pin a grid document from 1.24 gets on
// load, were gone after the first save.

// The object stores, in memory: what `put` wrote is what `get` reads.
const rows = vi.hoisted(() => new Map<string, Map<string, unknown>>());
vi.mock('./blobStore.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./blobStore.js')>();
  const request = <T,>(result: T) => {
    const req = { result, error: null, onsuccess: null as null | (() => void), onerror: null as null | (() => void) };
    queueMicrotask(() => req.onsuccess?.());
    return req;
  };
  const storeOf = (name: string) => {
    if (!rows.has(name)) rows.set(name, new Map());
    const table = rows.get(name)!;
    return {
      put: (value: { id?: string; key?: string }) => {
        const key = (value.id ?? value.key)!;
        table.set(key, JSON.parse(JSON.stringify(value)));
        return request(key);
      },
      get: (key: string) => request(table.get(key)),
    } as unknown as IDBObjectStore;
  };
  return {
    ...actual,
    hasIndexedDB: () => true,
    withTransaction: <T,>(name: string, _mode: IDBTransactionMode, op: (store: IDBObjectStore) => Promise<T>) => op(storeOf(name)),
    runInStore: <T,>(name: string, _mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>) =>
      new Promise<T>((resolve) => {
        const out = op(storeOf(name));
        out.onsuccess = () => resolve(out.result);
      }),
  };
});

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

beforeEach(() => rows.clear());
afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

const GRID = { enabled: true, charsPerLine: 28, linesPerPage: 22 };
const grid = (extra: PostextConfig = {}): PostextConfig => ({ locale: 'zh-Hans', cjk: { grid: GRID }, ...extra });
const vertical: PostextConfig = { locale: 'ja', layout: { writingMode: 'vertical-rl' } };
/** What the Headings panel dispatches when "Balance columns" is switched. */
const toggled = (config: PostextConfig, enabled: boolean): PostextConfig => ({
  ...config,
  headings: { ...config.headings, balancing: { ...config.headings?.balancing, enabled } },
});
/** Whether the layout balances the columns, as the Headings panel shows
 *  it: what the configuration says, else the default of the document. */
const balanced = (config: PostextConfig): boolean => config.headings?.balancing?.enabled ?? balancingOnByDefault(config);
const chapters = [{ id: 'c1', title: 'One', markdown: '# 题\n\n正文。', createdAt: 0, updatedAt: 0 }];

describe('"Balance columns" survives a save and a reload (#651)', () => {
  it('in the working configuration, on a character grid and in vertical text', () => {
    for (const base of [grid(), vertical]) {
      const map = installStorage();
      expect(balanced(base)).toBe(false);
      const on = toggled(base, true);
      saveConfig(on);
      expect(JSON.parse(map.get('postext-sandbox-config')!).headings).toEqual({ balancing: { enabled: true } });
      const reloaded = loadConfig()!;
      expect(reloaded).toEqual(on);
      expect(balanced(reloaded)).toBe(true);
      // Switched off again, the stored copy says nothing: off is the
      // default there.
      saveConfig(toggled(reloaded, false));
      expect(JSON.parse(map.get('postext-sandbox-config')!).headings).toBeUndefined();
      expect(balanced(loadConfig()!)).toBe(false);
    }
  });

  it('keeps "Added lines on a character grid" set to off', () => {
    installStorage();
    const config = grid({ headings: { balancing: { enabled: true, gridLines: 'off' } } });
    saveConfig(config);
    expect(loadConfig()).toEqual(config);
    expect(loadConfig()!.headings?.balancing?.gridLines).toBe('off');
  });

  it('keeps "Stretch under formulas and boxes" switched off, and stores nothing for on (#710)', () => {
    const map = installStorage();
    const off: PostextConfig = { headings: { balancing: { stretchAfterDisplays: false } } };
    saveConfig(off);
    expect(loadConfig()).toEqual(off);
    saveConfig({ headings: { balancing: { stretchAfterDisplays: true } } });
    expect(map.get('postext-sandbox-config')).toBe('{}');
  });

  it('keeps "Level cut counted in" set to grid lines (#711)', () => {
    const map = installStorage();
    const grid: PostextConfig = { headings: { balancing: { trailingStep: 'grid' } } };
    saveConfig(grid);
    expect(loadConfig()).toEqual(grid);
    saveConfig({ headings: { balancing: { trailingStep: 'lines' } } });
    expect(map.get('postext-sandbox-config')).toBe('{}');
  });

  it('keeps "Entries kept together at a column end" when it is not 2 (#712)', () => {
    const map = installStorage();
    for (const splitMinEntries of [1, 3]) {
      const config: PostextConfig = { index: { groups: { splitMinEntries } } };
      saveConfig(config);
      expect(loadConfig()).toEqual(config);
    }
    saveConfig({ index: { groups: { splitMinEntries: 2 } } });
    expect(map.get('postext-sandbox-config')).toBe('{}');
  });

  it('keeps "Heading that opens a column" set close to its text (#706)', () => {
    const map = installStorage();
    const close: PostextConfig = { headings: { columnHeadSpace: 'remainder' } };
    saveConfig(close);
    expect(loadConfig()).toEqual(close);
    saveConfig({ headings: { columnHeadSpace: 'none' } });
    expect(map.get('postext-sandbox-config')).toBe('{}');
  });

  it('keeps "Under a figure across columns" set to as under any figure (#708)', () => {
    const map = installStorage();
    const always: PostextConfig = { headings: { balancing: { stretchAfterWideFloats: 'always' } } };
    saveConfig(always);
    expect(loadConfig()).toEqual(always);
    saveConfig({ headings: { balancing: { stretchAfterWideFloats: 'flush' } } });
    expect(map.get('postext-sandbox-config')).toBe('{}');
  });

  it('keeps "Lines per heading before other levers" when it is not 2 (#707)', () => {
    const map = installStorage();
    for (const maxLinesBeforeLoose of [0, 4]) {
      const config: PostextConfig = { headings: { balancing: { maxLinesBeforeLoose } } };
      saveConfig(config);
      expect(loadConfig()).toEqual(config);
    }
    saveConfig({ headings: { balancing: { maxLinesBeforeLoose: 2 } } });
    expect(map.get('postext-sandbox-config')).toBe('{}');
  });

  it('stores nothing for the default of a plain page, and keeps it switched off', () => {
    const map = installStorage();
    saveConfig(toggled({}, true));
    expect(map.get('postext-sandbox-config')).toBe('{}');
    saveConfig(toggled({}, false));
    expect(balanced(loadConfig()!)).toBe(false);
  });

  it('in a project record', async () => {
    const record: ProjectRecord = {
      version: PROJECT_RECORD_VERSION, id: 'p1', name: 'Grid', createdAt: 1, updatedAt: 1,
      chapters, activeChapterId: 'c1', config: toggled(grid(), true), resources: [],
    };
    await putProject(record);
    expect(balanced((await getProject('p1'))!.config)).toBe(true);
    // The autosave writes the working configuration over it.
    await updateProject('p1', { config: toggled(grid({ headings: { fontFamily: 'Noto Serif SC' } }), true) });
    const reloaded = (await getProject('p1'))!;
    expect(reloaded.config.headings).toEqual({ fontFamily: 'Noto Serif SC', balancing: { enabled: true } });
    expect(balanced(reloaded.config)).toBe(true);
  });

  it('in the draft of a book opened from a preset', async () => {
    const loaded: LoadedPreset = {
      summary: { id: 'grid', name: 'Grid', source: 'public', available: true },
      locale: 'zh-Hans', chapters, config: grid(), resources: [], blobs: [], fonts: [],
    };
    const snapshot = snapshotForApply(loaded, { parts: 'all', fingerprint: 'fp', current: { chapters: [], config: {}, resources: [] } });
    const on = toggled(grid(), true);
    // The toggle is an edit: the hash of the stripped configuration sees it.
    expect(hashConfig(on)).not.toBe(hashConfig(grid()));
    expect(isDocumentUntouched({ chapters, config: grid(), resources: [] }, snapshot)).toBe(true);
    expect(isDocumentUntouched({ chapters, config: on, resources: [] }, snapshot)).toBe(false);
    const key = presetDraftKey('grid', 'zh-Hans');
    const draft: PresetDraftRecord = {
      version: PROJECT_RECORD_VERSION, key, presetId: 'grid', locale: 'zh-Hans', snapshot,
      chapters, activeChapterId: 'c1', config: on, baseConfig: grid(), resources: [], updatedAt: 1,
    };
    await putPresetDraft(draft);
    const reloaded = (await getPresetDraft(key))!;
    expect(balanced(reloaded.config)).toBe(true);
    expect(balanced(reloaded.baseConfig!)).toBe(false);
  });
});

// The worker's document cache and the stored page counts are keyed by the
// stripped configuration: a key blind to the toggle hands back the layout
// made before it.
describe('the layout key sees "Balance columns" where it is off by default (#651)', () => {
  it('on a character grid and in vertical text', () => {
    for (const base of [grid(), vertical]) {
      expect(configKeyOf(toggled(base, true))).not.toBe(configKeyOf(base));
      // Off is the default there: the same layout, the same key.
      expect(configKeyOf(toggled(base, false))).toBe(configKeyOf(base));
    }
    expect(configKeyOf(grid({ headings: { balancing: { enabled: true, gridLines: 'off' } } })))
      .not.toBe(configKeyOf(toggled(grid(), true)));
  });

  it('on a plain page, as before', () => {
    expect(configKeyOf(toggled({}, true))).toBe(configKeyOf({}));
    expect(configKeyOf(toggled({}, false))).not.toBe(configKeyOf({}));
  });
});

describe('the grid pin of a document stored by 1.24 survives its first save (#651)', () => {
  const stored = grid({ headings: { fontFamily: 'Noto Serif SC' } });

  it('in the working configuration', () => {
    const map = installStorage({ 'postext-sandbox-config': JSON.stringify(stored), 'postext-sandbox-config-version': '10' });
    const migrated = loadConfig()!;
    // (with the balancing pins of a copy stamped before 12, #707 and #708)
    expect(migrated.headings).toEqual({ fontFamily: 'Noto Serif SC', balancing: { enabled: true, maxLinesBeforeLoose: 4, stretchAfterWideFloats: 'always', trailingStep: 'grid' } });
    saveConfig(migrated);
    expect(map.get('postext-sandbox-config-version')).toBe(String(PROJECT_RECORD_VERSION));
    // Stamped current, it is read as stored: the value has to be there.
    const reloaded = loadConfig()!;
    expect(reloaded).toEqual(migrated);
    expect(balanced(reloaded)).toBe(true);
  });

  it('in a project record', async () => {
    rows.set(PROJECTS_STORE, new Map([['old', { version: 10, id: 'old', name: 'Old', createdAt: 1, updatedAt: 1, chapters, activeChapterId: 'c1', config: stored, resources: [] }]]));
    const migrated = (await getProject('old'))!;
    expect(balanced(migrated.config)).toBe(true);
    await putProject(migrated);
    const raw = rows.get(PROJECTS_STORE)!.get('old') as ProjectRecord;
    expect(raw.version).toBe(PROJECT_RECORD_VERSION);
    expect(raw.config.headings).toEqual({ fontFamily: 'Noto Serif SC', balancing: { enabled: true, maxLinesBeforeLoose: 4 } });
    expect(balanced((await getProject('old'))!.config)).toBe(true);
  });

  it('in an exported configuration read back', () => {
    const migrated = configFromExport({ type: 'postext-config', version: 1, configVersion: 10, config: stored });
    expect(balanced(migrated)).toBe(true);
  });
});

// #717: the widow and orphan rules are off by default on a character
// grid. A grid document stored by 1.27 or earlier is pinned to the rules
// it laid out with, and the pin has to survive the strip of the first
// save; a switch turned on in a new grid document has to survive it too.
describe('the break rules of a character grid survive a save (#717)', () => {
  const japanese = (extra: PostextConfig = {}): PostextConfig => ({ locale: 'ja', cjk: { grid: GRID }, ...extra });
  /** The two rules as the layout applies them and the Body text panel
   *  shows them: what the configuration says, else the default of the
   *  document. */
  const laidOut = (config: PostextConfig) => ({
    avoidWidows: config.bodyText?.avoidWidows ?? avoidWidowsByDefault(config),
    avoidOrphans: config.bodyText?.avoidOrphans ?? avoidOrphansByDefault(config),
  });
  const ON = { avoidWidows: true, avoidOrphans: true };
  const OFF = { avoidWidows: false, avoidOrphans: false };

  it('a new Japanese grid document reads both switches off', () => {
    expect(laidOut(japanese())).toEqual(OFF);
    expect(laidOut(grid())).toEqual({ avoidWidows: false, avoidOrphans: true });
    expect(laidOut({ locale: 'ja' })).toEqual(ON);
  });

  it('a switch turned on there survives a reload of the working configuration', () => {
    installStorage();
    saveConfig(japanese({ bodyText: ON }));
    const reloaded = loadConfig()!;
    expect(reloaded.bodyText).toEqual(ON);
    expect(laidOut(reloaded)).toEqual(ON);
    // Turned off again it restates the default and is not stored.
    saveConfig(japanese({ bodyText: OFF }));
    expect(loadConfig()!.bodyText).toBeUndefined();
    expect(laidOut(loadConfig()!)).toEqual(OFF);
  });

  it('the working configuration of a grid document stored by 1.27 keeps both rules', () => {
    for (const stored of [japanese(), grid()]) {
      const map = installStorage({ 'postext-sandbox-config': JSON.stringify(stored), 'postext-sandbox-config-version': '11' });
      const migrated = loadConfig()!;
      expect(laidOut(migrated), stored.locale).toEqual(ON);
      saveConfig(migrated);
      expect(map.get('postext-sandbox-config-version')).toBe(String(PROJECT_RECORD_VERSION));
      const reloaded = loadConfig()!;
      expect(reloaded, stored.locale).toEqual(migrated);
      expect(laidOut(reloaded), stored.locale).toEqual(ON);
    }
  });

  it('a project record stored by 1.27 keeps both rules', async () => {
    rows.set(PROJECTS_STORE, new Map([['old', { version: 11, id: 'old', name: 'Old', createdAt: 1, updatedAt: 1, chapters, activeChapterId: 'c1', config: japanese(), resources: [] }]]));
    const migrated = (await getProject('old'))!;
    expect(laidOut(migrated.config)).toEqual(ON);
    await putProject(migrated);
    const raw = rows.get(PROJECTS_STORE)!.get('old') as ProjectRecord;
    expect(raw.version).toBe(PROJECT_RECORD_VERSION);
    // (With the pins every record stored before 12 takes, #725, and before
    // 14, #764 and #770.)
    expect(raw.config.bodyText).toEqual({ ...ON, scriptContext: false, shapingLanguage: 'host', breakAfterSlashes: false });
    expect(laidOut((await getProject('old'))!.config)).toEqual(ON);
  });

  it('an exported configuration stamped 11 is read back with both rules', () => {
    const migrated = configFromExport({ type: 'postext-config', version: 1, configVersion: 11, config: japanese() });
    expect(laidOut(migrated)).toEqual(ON);
    // One stamped 12 is read with the rules of its grid as they are today,
    // and one exported today as it is.
    const current = configFromExport({ type: 'postext-config', version: 1, configVersion: 12, config: japanese() });
    expect(laidOut(current)).toEqual(OFF);
    const today = japanese();
    expect(configFromExport({ type: 'postext-config', version: 1, configVersion: 22, config: today })).toBe(today);
    // One stamped 13 (postext 1.29) keeps the language of the host (#770).
    expect(configFromExport({ type: 'postext-config', version: 1, configVersion: 13, config: today })).toEqual(pinLegacyHtmlViewerBreaking({ ...today, bodyText: { shapingLanguage: 'host', breakAfterSlashes: false }, markStyles: [{ id: 'mark', name: 'Mark', borderRadius: { value: 0.2, unit: 'em' } }], scoreStyle: { enabled: false } }));
  });

  it('the layout key sees a rule turned on where it is off by default', () => {
    expect(configKeyOf(japanese({ bodyText: ON }))).not.toBe(configKeyOf(japanese()));
    expect(configKeyOf(japanese({ bodyText: OFF }))).toBe(configKeyOf(japanese()));
    expect(configKeyOf({ bodyText: ON })).toBe(configKeyOf({}));
  });
});
