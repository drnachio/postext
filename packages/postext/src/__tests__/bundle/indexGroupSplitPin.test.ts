import { describe, it, expect } from 'vitest';
import { migrateBundleConfig, migrateConfig, pinLegacyIndexGroupSplit, pinLegacySlashBreaks, pinLegacyHtmlViewerBreaking } from '../../bundle/configVersion.js';
import { stripConfigDefaults } from '../../defaults/index.js';
import { resolveAllConfig } from '../../pipeline/config.js';
import type { PostextConfig } from '../../types.js';

// #712: a configuration stored before a group of an index kept two entries
// on each side of a column break (configVersion 11 or older, postext 1.27
// or earlier) keeps 1.27's breaks when its content prints an index.

const INDEX = '# Index\n\n:::index\n';
const min = (config: PostextConfig): number | undefined => config.index?.groups?.splitMinEntries;

describe('pinLegacyIndexGroupSplit (#712)', () => {
  it('sets index.groups.splitMinEntries: 1, keeping the other index fields', () => {
    const config: PostextConfig = { index: { indent: { value: 1, unit: 'em' }, groups: { fontWeight: 600 } } };
    const out = migrateConfig(config, 11, { content: INDEX });
    expect(out.index).toEqual({ indent: { value: 1, unit: 'em' }, groups: { fontWeight: 600, splitMinEntries: 1 } });
    expect(resolveAllConfig(out).index.groups.splitMinEntries).toBe(1);
    expect(resolveAllConfig(config).index.groups.splitMinEntries).toBe(2);
    expect(min(config)).toBeUndefined();
    expect(min(pinLegacyIndexGroupSplit({}))).toBe(1);
  });

  it('leaves a configuration that sets the key as it is', () => {
    for (const config of [{ index: { groups: { splitMinEntries: 2 } } }, { index: { groups: { splitMinEntries: 1 } } }, { index: { groups: { splitMinEntries: 3 } } }] as PostextConfig[]) {
      expect(pinLegacyIndexGroupSplit(config)).toBe(config);
    }
  });

  it('pins every version before 12 whose content may print an index, none from 12', () => {
    for (const v of [undefined, 1, 5, 8, 10, 11]) {
      expect(min(migrateConfig({}, v, { content: INDEX })), String(v)).toBe(1);
      expect(min(migrateConfig({}, v, { content: ['Text.', ':::index{name="names"}'] })), String(v)).toBe(1);
      // Unknown content may print one.
      expect(min(migrateConfig({}, v)), String(v)).toBe(1);
      expect(migrateConfig({} as PostextConfig, v, { content: 'The fence `:::index` is only mentioned.' }).index, String(v)).toBeUndefined();
    }
    const current: PostextConfig = {};
    // One stamped 12 or 13 takes the pin of the language alone (#764, #770);
    // one stamped 14 is read as it is.
    expect(migrateConfig(current, 12, { content: INDEX })).toEqual(pinLegacyHtmlViewerBreaking({ bodyText: { shapingLanguage: 'host', breakAfterSlashes: false } }));
    expect(migrateConfig(current, 13, { content: INDEX })).toEqual(pinLegacyHtmlViewerBreaking({ ...current, bodyText: { shapingLanguage: 'host', breakAfterSlashes: false } }));
    expect(migrateConfig(current, 14, { content: INDEX })).toEqual(pinLegacyHtmlViewerBreaking(pinLegacySlashBreaks(current)));
  });

  it('survives a save; resolves a whole number of 1 or more', () => {
    const migrated = migrateConfig({}, 11, { content: INDEX });
    const saved = stripConfigDefaults(migrated);
    expect(min(saved)).toBe(1);
    expect(migrateConfig(saved, 12, { content: INDEX })).toBe(saved);
    expect(resolveAllConfig(saved).index.groups.splitMinEntries).toBe(1);
    expect(min(stripConfigDefaults(saved))).toBe(1);
    expect(stripConfigDefaults({ index: { groups: { splitMinEntries: 2 } } }).index).toBeUndefined();
    expect(min(stripConfigDefaults({ index: { groups: { splitMinEntries: 3 } } }))).toBe(3);
    const resolved = (splitMinEntries: number) => resolveAllConfig({ index: { groups: { splitMinEntries } } }).index.groups.splitMinEntries;
    expect([resolved(0), resolved(-2), resolved(2.6), resolved(Number.NaN)]).toEqual([1, 1, 3, 2]);
  });

  it('pins a bundle on the index in force', () => {
    const base: PostextConfig = { index: { rangeFormat: 'chicago' } };
    const merged = migrateBundleConfig(base, [{ layout: { layoutType: 'double' } }], 8, { content: INDEX });
    expect(merged.index).toEqual({ rangeFormat: 'chicago', groups: { splitMinEntries: 1 } });
    expect(migrateBundleConfig(base, [{}], 12, { content: INDEX }).index).toBe(base.index);
  });
});
