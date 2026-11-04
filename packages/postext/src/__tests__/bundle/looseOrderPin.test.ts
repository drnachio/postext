import { describe, it, expect } from 'vitest';
import { CONFIG_VERSION, migrateBundleConfig, migrateConfig, pinLegacyLooseOrder, pinLegacySlashBreaks, pinLegacyHtmlViewerBreaking } from '../../bundle/configVersion.js';
import { stripConfigDefaults } from '../../defaults/index.js';
import { resolveAllConfig } from '../../pipeline/config.js';
import type { PostextConfig } from '../../types.js';

// #707: a configuration stored before column balancing tried the other
// levers before a heading's third line (configVersion 11 or older, postext
// 1.27 or earlier) keeps the old order: its headings take all their lines
// first.

const before = (config: PostextConfig): number | undefined => config.headings?.balancing?.maxLinesBeforeLoose;

describe('pinLegacyLooseOrder (#707)', () => {
  it('gives the headings all their lines first, by the configuration\'s own cap', () => {
    expect(before(pinLegacyLooseOrder({}))).toBe(4);
    const own: PostextConfig = { headings: { fontFamily: 'Georgia', balancing: { maxLinesPerHeading: 6, maxTracking: 20 } } };
    const pinned = pinLegacyLooseOrder(own);
    expect(pinned.headings).toEqual({ fontFamily: 'Georgia', balancing: { maxLinesPerHeading: 6, maxTracking: 20, maxLinesBeforeLoose: 6 } });
    // The stored configuration is not touched.
    expect(before(own)).toBeUndefined();
    // Loose paragraphs off: the list ends and the float bands would still
    // come before the third line, so it is pinned all the same.
    expect(before(pinLegacyLooseOrder({ headings: { balancing: { looseParagraphs: false } } }))).toBe(4);
    expect(before(pinLegacyLooseOrder({ bodyText: { optimalLineBreaking: false } }))).toBe(4);
    // Balancing turned on where it is off by default.
    expect(before(pinLegacyLooseOrder({ layout: { writingMode: 'vertical-rl' }, headings: { balancing: { enabled: true } } }))).toBe(4);
  });

  it('leaves the other configurations as they are', () => {
    for (const config of [
      { headings: { balancing: { enabled: false } } },
      { headings: { balancing: { maxLinesBeforeLoose: 2 } } },
      { headings: { balancing: { maxLinesBeforeLoose: 0 } } },
      { headings: { balancing: { maxLinesPerHeading: 2 } } },
      { headings: { balancing: { maxLinesPerHeading: 1 } } },
      // Off by default: vertical text, a character grid.
      { layout: { writingMode: 'vertical-rl' } },
      { locale: 'zh-Hans', cjk: { grid: { enabled: true, charsPerLine: 28, linesPerPage: 22 } } },
    ] as PostextConfig[]) {
      expect(pinLegacyLooseOrder(config)).toBe(config);
    }
  });

  it('pins every version before 12, none from 12, and no text without a heading', () => {
    for (const v of [undefined, 1, 5, 8, 10, 11]) {
      expect(before(migrateConfig({}, v)), String(v)).toBe(4);
      expect(before(migrateConfig({}, v, { content: '# One\n\nText.' })), String(v)).toBe(4);
      expect(before(migrateConfig({}, v, { content: 'Text with no heading.' })), String(v)).toBeUndefined();
    }
    const current: PostextConfig = {};
    // One stamped 12 takes the pins of rules 13, 14, 18 and 19 alone: the
    // language (#764, #770) and, its text not being known, the task box
    // (#765) and the rounded mark ends (#1149), and the breaks at a slash
    // (#1164). One stamped 13 takes the language, the mark ends and the
    // slash breaks; one stamped 14 the mark ends and the slash breaks; one
    // stamped 18 the slash breaks alone. Every one before 22 also takes the
    // line breaker of the HTML viewer (#1400); one stamped 22 is read as it is.
    expect(migrateConfig(current, 12)).toEqual(pinLegacyHtmlViewerBreaking({ bodyText: { shapingLanguage: 'host', breakAfterSlashes: false }, unorderedLists: { taskBox: 'character' }, markStyles: [{ id: 'mark', name: 'Mark', borderRadius: { value: 0.2, unit: 'em' } }], scoreStyle: { enabled: false } }));
    expect(migrateConfig(current, 13)).toEqual(pinLegacyHtmlViewerBreaking({ ...current, bodyText: { shapingLanguage: 'host', breakAfterSlashes: false }, markStyles: [{ id: 'mark', name: 'Mark', borderRadius: { value: 0.2, unit: 'em' } }], scoreStyle: { enabled: false } }));
    expect(migrateConfig(current, 14)).toEqual(pinLegacyHtmlViewerBreaking({ ...pinLegacySlashBreaks(current), markStyles: [{ id: 'mark', name: 'Mark', borderRadius: { value: 0.2, unit: 'em' } }], scoreStyle: { enabled: false } }));
    expect(migrateConfig(current, 18)).toEqual(pinLegacyHtmlViewerBreaking({ ...pinLegacySlashBreaks(current), scoreStyle: { enabled: false } }));
    expect(migrateConfig(current, 19)).toEqual(pinLegacyHtmlViewerBreaking({ ...current, scoreStyle: { enabled: false } }));
    expect(migrateConfig(current, 20)).toEqual(pinLegacyHtmlViewerBreaking(current));
    expect(migrateConfig(current, CONFIG_VERSION)).toBe(current);
    expect(resolveAllConfig(current).headings.balancing.maxLinesBeforeLoose).toBe(2);
    // A grid the version-11 pin turns balancing on for is pinned too.
    const grid: PostextConfig = { locale: 'zh-Hans', cjk: { grid: { enabled: true, charsPerLine: 28, linesPerPage: 22 } } };
    expect(migrateConfig(grid, 10).headings?.balancing).toMatchObject({ enabled: true, maxLinesBeforeLoose: 4 });
    expect(before(migrateConfig(grid, 11))).toBeUndefined();
  });

  it('survives a save', () => {
    for (const config of [{}, { headings: { balancing: { maxLinesPerHeading: 3 } } }] as PostextConfig[]) {
      const migrated = migrateConfig(config, 11);
      const saved = stripConfigDefaults(migrated);
      expect(before(saved)).toBe(before(migrated));
      const reloaded = migrateConfig(saved, 12);
      expect(reloaded).toBe(saved);
      expect(resolveAllConfig(reloaded).headings.balancing).toEqual(resolveAllConfig(migrated).headings.balancing);
      expect(before(stripConfigDefaults(saved))).toBe(before(migrated));
    }
    // The default is not stored; a value other than it is.
    expect(stripConfigDefaults({ headings: { balancing: { maxLinesBeforeLoose: 2 } } }).headings).toBeUndefined();
    expect(stripConfigDefaults({ headings: { balancing: { maxLinesBeforeLoose: 0 } } }).headings).toEqual({ balancing: { maxLinesBeforeLoose: 0 } });
  });

  it('pins a bundle on its merged layers', () => {
    const base: PostextConfig = { headings: { fontFamily: 'Georgia' } };
    const merged = migrateBundleConfig(base, [{ layout: { layoutType: 'double' } }], 8, { content: '# One\n\nText.' });
    expect(merged.headings).toEqual({ fontFamily: 'Georgia', balancing: { maxLinesBeforeLoose: 4 } });
    const layer = migrateBundleConfig(base, [{ headings: { balancing: { maxLinesPerHeading: 1 } } }], 8);
    expect(before(layer)).toBeUndefined();
    expect(migrateBundleConfig(base, [{}], 12).headings).toBe(base.headings);
  });
});
