import { describe, it, expect } from 'vitest';
import { migrateBundleConfig, migrateConfig, pinLegacyInlineTableSplit } from '../../bundle/configVersion';
import { resolveAllConfig } from '../../pipeline/config';
import type { PostextConfig } from '../../types';

// #634: a configuration stored before an inline table was cut between rows
// (configVersion 10 or older, postext 1.24 or earlier) keeps such tables
// whole, unless it says otherwise; content that embeds no resource is left
// alone.

const EMBED = 'Text.\n\n::resource{id="tab"}\n\nMore text.';

describe('pinLegacyInlineTableSplit (#634)', () => {
  it('sets splitInline: false on the table style, keeping its other fields', () => {
    const config: PostextConfig = { tableStyle: { overflow: 'clip' } };
    const out = migrateConfig(config, 10, { content: EMBED });
    expect(out.tableStyle).toEqual({ overflow: 'clip', splitInline: false });
    expect(resolveAllConfig(out).tableStyle.splitInline).toBe(false);
    expect(resolveAllConfig(config).tableStyle.splitInline).toBe(true);
    expect(config.tableStyle).toEqual({ overflow: 'clip' });
    // Named styles inherit it.
    const named = migrateConfig({ tableStyles: [{ id: 'a' }] } as PostextConfig, 9, { content: EMBED });
    expect(resolveAllConfig(named).tableStyles[0]!.splitInline).toBe(false);
  });

  it('leaves a configuration that sets splitInline as it is', () => {
    for (const config of [{ tableStyle: { splitInline: true } }, { tableStyle: { splitInline: false } }] as PostextConfig[]) {
      expect(pinLegacyInlineTableSplit(config)).toBe(config);
    }
  });

  it('pins every version before 11 whose content may embed a resource, none from 11', () => {
    for (const v of [undefined, 1, 5, 8, 9, 10]) {
      expect(migrateConfig({} as PostextConfig, v, { content: EMBED }).tableStyle?.splitInline, String(v)).toBe(false);
      // Unknown content may embed one.
      expect(migrateConfig({} as PostextConfig, v).tableStyle?.splitInline, String(v)).toBe(false);
    }
    expect(migrateConfig({} as PostextConfig, 10, { content: 'No embeds here.' }).tableStyle).toBeUndefined();
    const current: PostextConfig = {};
    expect(migrateConfig(current, 11, { content: EMBED })).toBe(current);
  });

  it('pins a bundle on its merged layers', () => {
    const base: PostextConfig = { tableStyle: { rules: 'booktabs' } };
    const merged = migrateBundleConfig(base, [{ layout: { layoutType: 'double' } }], 10, { content: EMBED });
    expect(merged.tableStyle).toEqual({ rules: 'booktabs', splitInline: false });
    expect(migrateBundleConfig(base, [], 11, { content: EMBED }).tableStyle).toBe(base.tableStyle);
  });
});
