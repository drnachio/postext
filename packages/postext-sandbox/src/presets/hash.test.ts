import { describe, expect, it } from 'vitest';
import type { PostextConfig, Resource } from 'postext';
import { createDefaultConfig } from '../context/defaultConfig';
import {
  hashConfig,
  hashMarkdown,
  hashResources,
  hashString,
  isDocumentUntouched,
  stableStringify,
} from './hash';
import type { AppliedPresetSnapshot } from './types';

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
  const state = { markdown: '# Hi', config: createDefaultConfig('en'), resources: [table(), svg()] };
  const snapshot: AppliedPresetSnapshot = {
    presetId: 'brochure',
    fingerprint: 'abc',
    markdownHash: hashMarkdown(state.markdown),
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
    expect(isDocumentUntouched({ ...state, markdown: '# Hi!' }, snapshot)).toBe(false);
    const config: PostextConfig = { ...state.config, page: { dpi: 144 } };
    expect(isDocumentUntouched({ ...state, config }, snapshot)).toBe(false);
    expect(isDocumentUntouched({ ...state, resources: [table()] }, snapshot)).toBe(false);
  });

  it('is false without a snapshot', () => {
    expect(isDocumentUntouched(state, null)).toBe(false);
    expect(isDocumentUntouched(state, undefined)).toBe(false);
  });
});
