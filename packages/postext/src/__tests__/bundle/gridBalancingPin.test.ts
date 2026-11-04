import { describe, it, expect } from 'vitest';
import { CONFIG_VERSION, migrateBundleConfig, migrateConfig, pinLegacyGridBalancing, pinLegacySlashBreaks, pinLegacyHtmlViewerBreaking } from '../../bundle/configVersion.js';
import { stripConfigDefaults } from '../../defaults/index.js';
import { resolveAllConfig } from '../../pipeline/config.js';
import type { PostextConfig } from '../../types.js';

// #632: a configuration stored before a horizontal page on a character
// grid was left unbalanced by default (configVersion 10 or older, postext
// 1.24 or earlier) keeps balancing on, unless it set it itself.

const grid = (extra: PostextConfig = {}): PostextConfig => ({
  locale: 'zh-Hans',
  cjk: { grid: { enabled: true, charsPerLine: 28, linesPerPage: 22 } },
  ...extra,
});

/** A configuration that balances its columns and is stored under 11 or
 *  lower also keeps the order of its levers (#707, `pinLegacyLooseOrder`),
 *  its after-float lever under a float over several columns (#708,
 *  `pinLegacyWideFloatStretch`) and the unit of its level cuts (#711,
 *  `pinLegacyTrailingStep`). */
const LEGACY_ORDER = { maxLinesBeforeLoose: 4, stretchAfterWideFloats: 'always', trailingStep: 'grid' };

describe('pinLegacyGridBalancing (#632)', () => {
  it('turns balancing on for a horizontal grid that does not set it', () => {
    const config = grid({ headings: { fontFamily: 'Noto Serif SC', balancing: { maxTracking: 20 } } });
    const out = migrateConfig(config, 10);
    expect(out.headings!.balancing).toEqual({ maxTracking: 20, enabled: true, ...LEGACY_ORDER });
    expect(out.headings!.fontFamily).toBe('Noto Serif SC');
    expect(resolveAllConfig(out).headings.balancing.enabled).toBe(true);
    expect(resolveAllConfig(config).headings.balancing.enabled).toBe(false);
    // No headings section at all.
    expect(migrateConfig(grid(), 8).headings).toEqual({ balancing: { enabled: true, ...LEGACY_ORDER } });
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
    // A grid stamped 11 keeps its balancing as written; the break rules of
    // 12 are pinned on it (#717).
    const current = grid();
    expect(migrateConfig(current, 11, { content: '正文。' }).headings).toBe(current.headings);
    // One stamped 12 takes the pins of rules 13, 14, 18 and 19 alone: the
    // language (#764, #770) and, its text not being known, the task box
    // (#765) and the rounded mark ends (#1149), and the breaks at a slash
    // (#1164). One stamped 13 takes the language, the mark ends and the
    // slash breaks; one stamped 14 the mark ends and the slash breaks; one
    // stamped 18 the slash breaks alone. Every one before 22 also takes the
    // line breaker of the HTML viewer (#1400); one stamped 22 is read as it is.
    expect(migrateConfig(current, 12)).toEqual(pinLegacyHtmlViewerBreaking({ ...current, bodyText: { shapingLanguage: 'host', breakAfterSlashes: false }, unorderedLists: { taskBox: 'character' }, markStyles: [{ id: 'mark', name: 'Mark', borderRadius: { value: 0.2, unit: 'em' } }], scoreStyle: { enabled: false } }));
    expect(migrateConfig(current, 13)).toEqual(pinLegacyHtmlViewerBreaking({ ...current, bodyText: { shapingLanguage: 'host', breakAfterSlashes: false }, markStyles: [{ id: 'mark', name: 'Mark', borderRadius: { value: 0.2, unit: 'em' } }], scoreStyle: { enabled: false } }));
    expect(migrateConfig(current, 14)).toEqual(pinLegacyHtmlViewerBreaking({ ...pinLegacySlashBreaks(current), markStyles: [{ id: 'mark', name: 'Mark', borderRadius: { value: 0.2, unit: 'em' } }], scoreStyle: { enabled: false } }));
    expect(migrateConfig(current, 18)).toEqual(pinLegacyHtmlViewerBreaking({ ...pinLegacySlashBreaks(current), scoreStyle: { enabled: false } }));
    expect(migrateConfig(current, 19)).toEqual(pinLegacyHtmlViewerBreaking({ ...current, scoreStyle: { enabled: false } }));
    expect(migrateConfig(current, 20)).toEqual(pinLegacyHtmlViewerBreaking(current));
    expect(migrateConfig(current, CONFIG_VERSION)).toBe(current);
  });

  // #651: the first save stores the migrated configuration stripped of
  // defaults under the current stamp. The strip took `true` for the
  // default it is on a plain page and dropped the pin, and the next load,
  // stamped 11, did not pin again.
  it('survives a save: the stripped configuration still turns balancing on', () => {
    for (const config of [grid(), grid({ headings: { fontFamily: 'Noto Serif SC', balancing: { maxTracking: 20 } } })]) {
      const migrated = migrateConfig(config, 10);
      const saved = stripConfigDefaults(migrated);
      expect(saved.headings?.balancing?.enabled).toBe(true);
      const reloaded = migrateConfig(saved, 11);
      expect(reloaded).toBe(saved);
      expect(resolveAllConfig(reloaded).headings.balancing).toEqual(resolveAllConfig(migrated).headings.balancing);
      expect(resolveAllConfig(reloaded).headings.balancing.enabled).toBe(true);
    }
    // Saved again and again, it stays.
    const twice = stripConfigDefaults(stripConfigDefaults(migrateConfig(grid(), 10)));
    expect(twice.headings).toEqual({ balancing: { enabled: true, ...LEGACY_ORDER } });
  });

  it('pins a bundle on its merged layers', () => {
    const base: PostextConfig = { headings: { fontFamily: 'Noto Serif SC' } };
    const merged = migrateBundleConfig(base, [grid(), { layout: { layoutType: 'double' } }], 10);
    expect(merged.headings).toEqual({ fontFamily: 'Noto Serif SC', balancing: { enabled: true, ...LEGACY_ORDER } });
    const vertical = migrateBundleConfig(base, [grid(), { layout: { writingMode: 'vertical-rl' } }], 9);
    expect(vertical.headings).toBe(base.headings);
    expect(migrateBundleConfig(base, [grid()], 11).headings).toBe(base.headings);
  });
});
