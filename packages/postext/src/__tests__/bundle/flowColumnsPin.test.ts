import { describe, it, expect } from 'vitest';
import { migrateBundleConfig, migrateConfig, pinLegacyFlowColumns } from '../../bundle/configVersion';
import { resolveAllConfig } from '../../pipeline/config';
import type { PostextConfig } from '../../types';

// #634: a configuration stored before `:::columns` ran in the main flow and
// groups were cut (configVersion 10 or older, postext 1.24 or earlier)
// keeps 1.24's reading of the fence when its content holds one.

const GROUP = 'Text.\n\n:::columns{count=2}\nA.\n\nB.\n:::\n';

describe('pinLegacyFlowColumns (#634)', () => {
  it('sets layout.flowColumns: false, keeping the other layout fields', () => {
    const config: PostextConfig = { layout: { layoutType: 'double' } };
    const out = migrateConfig(config, 10, { content: GROUP });
    expect(out.layout).toEqual({ layoutType: 'double', flowColumns: false });
    expect(resolveAllConfig(out).layout.flowColumns).toBe(false);
    expect(resolveAllConfig(config).layout.flowColumns).toBe(true);
    expect(config.layout).toEqual({ layoutType: 'double' });
  });

  it('leaves a configuration that sets flowColumns as it is', () => {
    for (const config of [{ layout: { flowColumns: true } }, { layout: { flowColumns: false } }] as PostextConfig[]) {
      expect(pinLegacyFlowColumns(config)).toBe(config);
    }
  });

  it('pins every version before 11 whose content may hold a group, none from 11', () => {
    for (const v of [undefined, 1, 5, 8, 9, 10]) {
      expect(migrateConfig({} as PostextConfig, v, { content: GROUP }).layout?.flowColumns, String(v)).toBe(false);
      expect(migrateConfig({} as PostextConfig, v).layout?.flowColumns, String(v)).toBe(false);
    }
    // A fence inside a box counts too: its group is cut now.
    expect(migrateConfig({} as PostextConfig, 10, { content: ':::callout\n:::columns\nA.\n:::\n:::' }).layout?.flowColumns).toBe(false);
    expect(migrateConfig({} as PostextConfig, 10, { content: 'Columns are mentioned, `:::columns` inline.' }).layout).toBeUndefined();
    const current: PostextConfig = {};
    expect(migrateConfig(current, 11, { content: GROUP })).toBe(current);
  });

  it('pins a bundle on its merged layers', () => {
    const base: PostextConfig = { layout: { gutterWidth: { value: 6, unit: 'mm' } } };
    const merged = migrateBundleConfig(base, [{ bodyText: { fontSize: { value: 10, unit: 'pt' } } }], 10, { content: GROUP });
    expect(merged.layout).toEqual({ gutterWidth: { value: 6, unit: 'mm' }, flowColumns: false });
    expect(migrateBundleConfig(base, [], 11, { content: GROUP }).layout).toBe(base.layout);
  });
});
