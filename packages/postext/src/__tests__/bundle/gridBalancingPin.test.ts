import { describe, it, expect } from 'vitest';
import { migrateBundleConfig, migrateConfig, pinLegacyGridBalancing } from '../../bundle/configVersion';
import { resolveAllConfig } from '../../pipeline/config';
import type { PostextConfig } from '../../types';

// #632: a configuration stored before a horizontal page on a character
// grid was left unbalanced by default (configVersion 10 or older, postext
// 1.24 or earlier) keeps balancing on, unless it set it itself.

const grid = (extra: PostextConfig = {}): PostextConfig => ({
  locale: 'zh-Hans',
  cjk: { grid: { enabled: true, charsPerLine: 28, linesPerPage: 22 } },
  ...extra,
});

describe('pinLegacyGridBalancing (#632)', () => {
  it('turns balancing on for a horizontal grid that does not set it', () => {
    const config = grid({ headings: { fontFamily: 'Noto Serif SC', balancing: { maxTracking: 20 } } });
    const out = migrateConfig(config, 10);
    expect(out.headings!.balancing).toEqual({ maxTracking: 20, enabled: true });
    expect(out.headings!.fontFamily).toBe('Noto Serif SC');
    expect(resolveAllConfig(out).headings.balancing.enabled).toBe(true);
    expect(resolveAllConfig(config).headings.balancing.enabled).toBe(false);
    // No headings section at all.
    expect(migrateConfig(grid(), 8).headings).toEqual({ balancing: { enabled: true } });
    // The stored configuration is not touched.
    expect(config.headings!.balancing).toEqual({ maxTracking: 20 });
  });

  it('leaves every other configuration as it is', () => {
    for (const config of [
      grid({ headings: { balancing: { enabled: false } } }),
      grid({ headings: { balancing: { enabled: true } } }),
      grid({ layout: { writingMode: 'vertical-rl' } }),
      { ...grid(), cjk: { grid: { enabled: false } } },
      { locale: 'zh-Hans' } as PostextConfig,
      {} as PostextConfig,
    ]) {
      expect(pinLegacyGridBalancing(config)).toBe(config);
    }
  });

  it('pins every version before 11, none from 11', () => {
    for (const v of [undefined, 1, 5, 8, 9, 10]) {
      expect(migrateConfig(grid(), v).headings?.balancing?.enabled, String(v)).toBe(true);
    }
    const current = grid();
    expect(migrateConfig(current, 11)).toBe(current);
  });

  it('pins a bundle on its merged layers', () => {
    const base: PostextConfig = { headings: { fontFamily: 'Noto Serif SC' } };
    const merged = migrateBundleConfig(base, [grid(), { layout: { layoutType: 'double' } }], 10);
    expect(merged.headings).toEqual({ fontFamily: 'Noto Serif SC', balancing: { enabled: true } });
    const vertical = migrateBundleConfig(base, [grid(), { layout: { writingMode: 'vertical-rl' } }], 9);
    expect(vertical.headings).toBe(base.headings);
    expect(migrateBundleConfig(base, [grid()], 11).headings).toBe(base.headings);
  });
});
