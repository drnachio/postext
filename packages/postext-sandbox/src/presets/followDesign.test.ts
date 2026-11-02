/* A browser that opened a preset keeps it in step with the preset's design
   (#1381): only what the reader changed is theirs. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostextConfig } from 'postext';
import { followPresetDesign } from './followDesign.js';
import { hashChapters, hashConfig, hashResources } from './hash.js';
import type { AppliedPresetSnapshot, LoadedPreset } from './types.js';
import type { Chapter } from '../book/types.js';
import { loadPresetGeneral, loadPresetGeneralCopy, savePresetGeneral } from '../storage/persistence.js';
import { PRESET_GENERAL_PREFIX } from '../storage/persistence/storage.js';

const size = (v: number) => ({ value: v, unit: 'pt' as const });
const design = (fontSize: number, marginTop = 10): PostextConfig => ({
  bodyText: { fontSize: size(fontSize) },
  headings: { levels: [{ level: 1, marginTop: size(marginTop) }] },
} as PostextConfig);
const chapters = [{ id: 'c1', title: 'One', markdown: '# One' }] as unknown as Chapter[];

const preset = (config: PostextConfig, chs: Chapter[] = chapters): LoadedPreset => ({
  summary: { id: 'p', name: 'P', source: 'builtin', locales: ['en', 'es'] },
  locale: 'es',
  chapters: chs,
  config,
  sharedConfig: config,
  resources: [],
  blobs: [],
  fonts: [],
} as unknown as LoadedPreset);

const snapshotOf = (config: PostextConfig, chs: Chapter[] = chapters): AppliedPresetSnapshot => ({
  presetId: 'p', locale: 'es', fingerprint: 'old', markdownHash: hashChapters(chs), configHash: hashConfig(config), resourcesHash: hashResources([]),
});
const marginTop = (c: PostextConfig) => c.headings?.levels?.[0]?.marginTop?.value;

describe('followPresetDesign (#1381)', () => {
  it('brings the new design to a book edited in its text alone', () => {
    const before = design(10);
    const out = followPresetDesign({ fresh: preset(design(10, 20)), live: 'new', chapters, resources: [], config: before, base: before, layers: null, snapshot: snapshotOf(before) })!;
    expect(marginTop(out.config)).toBe(20);
    expect(hashConfig(out.config)).toBe(hashConfig(design(10, 20)));
  });

  it('keeps a field the reader changed', () => {
    const before = design(10);
    const out = followPresetDesign({ fresh: preset(design(10, 20)), live: 'new', chapters, resources: [], config: design(12), base: before, layers: null, snapshot: snapshotOf(before) })!;
    expect(out.config.bodyText?.fontSize?.value).toBe(12);
    expect(marginTop(out.config)).toBe(20);
  });

  it('does nothing when the design did not change', () => {
    const before = design(10);
    expect(followPresetDesign({ fresh: preset(design(10)), live: 'new', chapters, resources: [], config: design(12), base: before, layers: { shared: before, base: before, scope: 'all' }, snapshot: snapshotOf(before) })).toBeNull();
  });

  it('gives general settings stored as a whole copy back to the preset', () => {
    const now = design(10, 20);
    const frozen = design(10);
    const out = followPresetDesign({ fresh: preset(now), live: 'old', chapters, resources: [], config: frozen, base: now, layers: { shared: frozen, scope: 'all' }, snapshot: snapshotOf(now) })!;
    expect(marginTop(out.config)).toBe(20);
    expect(out.layers?.base).toBeDefined();
    expect(marginTop(out.layers!.shared)).toBe(20);
  });

  it('gives a book resumed without its layers back to the preset when a whole copy is stored', () => {
    const now = design(10, 20);
    const frozen = design(10);
    const out = followPresetDesign({ fresh: preset(now), live: 'old', chapters, resources: [], config: frozen, base: null, layers: null, storedCopy: frozen, snapshot: snapshotOf(now) })!;
    expect(hashConfig(out.config)).toBe(hashConfig(now));
    expect(out.layers?.base).toBeDefined();
    expect(out.current).toBe(true);
  });

  it('resets a copy of the guide with its text unedited, and keeps one with its text edited', () => {
    const now = design(10, 20);
    const frozen = design(10);
    const own = { ...frozen, bodyText: { fontSize: size(14) } } as PostextConfig;
    const input = { fresh: preset(now), live: 'old', base: now, layers: { shared: frozen, scope: 'all' as const }, snapshot: snapshotOf(now) };
    const unedited = followPresetDesign({ ...input, chapters, resources: [], config: own })!;
    expect(hashConfig(unedited.config)).toBe(hashConfig(now));
    const edited = [{ id: 'c1', title: 'One', markdown: '# One, mine' }] as unknown as Chapter[];
    const kept = followPresetDesign({ ...input, chapters: edited, resources: [], config: own })!;
    expect(kept.config.bodyText?.fontSize?.value).toBe(14);
    expect(marginTop(kept.config)).toBe(20);
  });

  it('keeps an edition\'s own field on another sample with its text unedited', () => {
    const now = design(10, 20);
    const frozen = design(10);
    const own = { ...frozen, bodyText: { fontSize: size(14) } } as PostextConfig;
    const fresh = preset(now);
    fresh.summary = { ...fresh.summary, source: 'private' };
    const out = followPresetDesign({ fresh, live: 'old', base: now, layers: { shared: frozen, scope: 'all' }, snapshot: snapshotOf(now), chapters, resources: [], config: own })!;
    expect(out.config.bodyText?.fontSize?.value).toBe(14);
    expect(marginTop(out.config)).toBe(20);
  });

  it('carries what the reader changed in the general settings over the new ones', () => {
    const before = design(10);
    const out = followPresetDesign({ fresh: preset(design(10, 20)), live: 'new', chapters, resources: [], config: design(12), base: before, layers: { shared: design(12), base: before, scope: 'edition' }, snapshot: snapshotOf(before) })!;
    expect(out.layers?.scope).toBe('edition');
    expect(out.layers?.shared.bodyText?.fontSize?.value).toBe(12);
    expect(marginTop(out.layers!.shared)).toBe(20);
  });

  it('takes the new version as applied only when nothing else of it is new', () => {
    const before = design(10);
    const same = followPresetDesign({ fresh: preset(design(10, 20)), live: 'new', chapters, resources: [], config: before, base: before, layers: null, snapshot: snapshotOf(before) })!;
    expect(same.current).toBe(true);
    expect(same.snapshot.fingerprint).toBe('new');
    const newText = [{ id: 'c1', title: 'One', markdown: '# One, revised' }] as unknown as Chapter[];
    const text = followPresetDesign({ fresh: preset(design(10, 20), newText), live: 'new', chapters, resources: [], config: before, base: before, layers: null, snapshot: snapshotOf(before) })!;
    expect(text.current).toBe(false);
    expect(text.snapshot.fingerprint).toBe('old');
  });
});

describe('general settings in storage (#1381)', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    const localStorage: Partial<Storage> = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => void store.set(k, v),
      removeItem: (k) => void store.delete(k),
    };
    vi.stubGlobal('localStorage', localStorage);
    vi.stubGlobal('window', { localStorage });
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  it('stores nothing when the reader changed nothing', () => {
    const own = design(10);
    savePresetGeneral('p', own, own);
    expect(localStorage.getItem(PRESET_GENERAL_PREFIX + 'p')).toBeNull();
    expect(loadPresetGeneral('p', own)).toBeNull();
  });

  it('reads the reader\'s changes over the preset\'s design of the day', () => {
    savePresetGeneral('p', design(12), design(10));
    const read = loadPresetGeneral('p', design(10, 20))!;
    expect(read.bodyText?.fontSize?.value).toBe(12);
    expect(marginTop(read)).toBe(20);
  });

  it('passes over a whole copy stored before, and can tell it is there', () => {
    localStorage.setItem(PRESET_GENERAL_PREFIX + 'p', JSON.stringify(design(10)));
    expect(loadPresetGeneral('p', design(10, 20))).toBeNull();
    expect(loadPresetGeneralCopy('p')).not.toBeNull();
    savePresetGeneral('p', design(12), design(10));
    expect(loadPresetGeneralCopy('p')).toBeNull();
  });

  it('keeps what is stored when there is no base to measure against', () => {
    savePresetGeneral('p', design(12), design(10));
    savePresetGeneral('p', design(14));
    expect(loadPresetGeneral('p', design(10))?.bodyText?.fontSize?.value).toBe(12);
  });

  it('forgets on null', () => {
    savePresetGeneral('p', design(12), design(10));
    savePresetGeneral('p', null);
    expect(loadPresetGeneral('p', design(10))).toBeNull();
  });
});
