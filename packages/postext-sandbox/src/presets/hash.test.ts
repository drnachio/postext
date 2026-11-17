import { describe, expect, it } from 'vitest';
import type { PostextConfig, Resource } from 'postext';
import { createDefaultConfig } from '../context/defaultConfig.js';
import {
  hashConfig,
  hashChapters,
  hashResources,
  hashString,
  isDocumentUntouched,
  stableStringify,
} from './hash.js';
import type { AppliedPresetSnapshot } from './types.js';

const table = (over: Partial<Resource> = {}): Resource => ({
  id: 'tbl-1',
  typeId: 'table',
  kind: 'table',
  caption: 'Sales',
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

const svg = (over: Partial<Resource> = {}): Resource => ({
  id: 'fig-1',
  typeId: 'figure',
  kind: 'svg',
  createdAt: 2,
  updatedAt: 2,
  svg: { fileId: 'preset:brochure:resources/fig-1.svg', width: 100, height: 50 },
  ...over,
});

describe('hashString', () => {
  it('is deterministic, 8 hex digits and sensitive to content', () => {
    expect(hashString('')).toBe('811c9dc5');
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(hashString('abc')).toMatch(/^[0-9a-f]{8}$/);
    expect(hashString('abc')).not.toBe(hashString('abd'));
    expect(hashString('héllo ✓')).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('stableStringify', () => {
  it('sorts keys at every level and drops undefined', () => {
    expect(stableStringify({ b: 1, a: { d: undefined, c: [{ z: 1, y: 2 }] } })).toBe('{"a":{"c":[{"y":2,"z":1}]},"b":1}');
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
  });
});

describe('hashConfig', () => {
  it('ignores defaults and survives the persistence round-trip', () => {
    const base = createDefaultConfig('es');
    const withDefaults: PostextConfig = { ...base, page: { ...base.page, dpi: 144 } };
    const persisted = JSON.parse(JSON.stringify(withDefaults)) as PostextConfig;
    expect(hashConfig(withDefaults)).toBe(hashConfig(persisted));
  });

  it('changes when an override changes', () => {
    const base = createDefaultConfig('en');
    expect(hashConfig(base)).not.toBe(hashConfig({ ...base, page: { dpi: 144 } }));
  });
});

describe('hashResources', () => {
  it('ignores timestamps and array order', () => {
    const a = [table(), svg()];
    const b = [svg({ createdAt: 99, updatedAt: 100 }), table({ updatedAt: 42 })];
    expect(hashResources(a)).toBe(hashResources(b));
  });

  it('changes on any content edit, add or remove', () => {
    const base = hashResources([table(), svg()]);
    expect(hashResources([table({ caption: 'Revenue' }), svg()])).not.toBe(base);
    expect(hashResources([table()])).not.toBe(base);
    expect(hashResources([table(), svg(), svg({ id: 'fig-2' })])).not.toBe(base);
  });

  it('is empty-set stable', () => {
    expect(hashResources([])).toBe(hashResources([]));
  });
});

describe('isDocumentUntouched', () => {
  const chapters = [{ id: 'a', title: 'Hi', markdown: '# Hi', createdAt: 1, updatedAt: 1 }];
  const state = { chapters, config: createDefaultConfig('en'), resources: [table(), svg()] };
  const snapshot: AppliedPresetSnapshot = {
    presetId: 'brochure',
    fingerprint: 'abc',
    markdownHash: hashChapters(state.chapters),
    configHash: hashConfig(state.config),
    resourcesHash: hashResources(state.resources),
  };

  it('is true while every slice still hashes to the snapshot', () => {
    expect(isDocumentUntouched(state, snapshot)).toBe(true);
    // Timestamps and order do not count as edits.
    const reloaded = { ...state, resources: [svg({ updatedAt: 7 }), table({ createdAt: 9 })] };
    expect(isDocumentUntouched(reloaded, snapshot)).toBe(true);
  });

  it('is false after a markdown, config or resource edit', () => {
    expect(isDocumentUntouched({ ...state, chapters: [{ ...chapters[0]!, markdown: '# Hi!' }] }, snapshot)).toBe(false);
    expect(isDocumentUntouched({ ...state, chapters: [{ ...chapters[0]!, id: 'other', updatedAt: 99 }] }, snapshot)).toBe(true);
    const config: PostextConfig = { ...state.config, page: { dpi: 144 } };
    expect(isDocumentUntouched({ ...state, config }, snapshot)).toBe(false);
    expect(isDocumentUntouched({ ...state, resources: [table()] }, snapshot)).toBe(false);
  });

  it('is false without a snapshot', () => {
    expect(isDocumentUntouched(state, null)).toBe(false);
    expect(isDocumentUntouched(state, undefined)).toBe(false);
  });
});

// #1621: the selectors ask on every change of the store; a slice of the
// state that is the same object is not read again.
describe('the hashes of the state are held by object', () => {
  const chapter = (markdown: string) => ({ id: 'c', title: 'One', markdown, createdAt: 1, updatedAt: 1 });

  it('reads a chapter list, a configuration and a resource list once', () => {
    const chapters = [chapter('# One\n\nText.')];
    const config = createDefaultConfig();
    const resources = [table()];
    const first = [hashChapters(chapters), hashConfig(config), hashResources(resources)];
    const stringify = JSON.stringify;
    let calls = 0;
    JSON.stringify = ((...args: Parameters<typeof JSON.stringify>) => { calls++; return stringify(...args); }) as typeof JSON.stringify;
    try {
      expect([hashChapters(chapters), hashConfig(config), hashResources(resources)]).toEqual(first);
    } finally {
      JSON.stringify = stringify;
    }
    expect(calls).toBe(0);
  });

  it('gives an edited copy its own hash, and an equal copy the same one', () => {
    const chapters = [chapter('# One\n\nText.')];
    const hash = hashChapters(chapters);
    expect(hashChapters([chapter('# One\n\nText!')])).not.toBe(hash);
    expect(hashChapters([chapter('# One\n\nText.')])).toBe(hash);
  });
});
