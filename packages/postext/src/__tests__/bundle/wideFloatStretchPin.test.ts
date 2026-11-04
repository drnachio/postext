import { describe, it, expect } from 'vitest';
import { migrateBundleConfig, migrateConfig, pinLegacyWideFloatStretch, pinLegacySlashBreaks, pinLegacyHtmlViewerBreaking } from '../../bundle/configVersion.js';
import { stripConfigDefaults } from '../../defaults/index.js';
import { resolveAllConfig } from '../../pipeline/config.js';
import type { PostextConfig } from '../../types.js';

// #708: a configuration stored before column balancing kept the heads level
// under a float over several columns (configVersion 11 or older, postext
// 1.27 or earlier) keeps the after-float lever as it was under every float.

const wide = (config: PostextConfig): string | undefined => config.headings?.balancing?.stretchAfterWideFloats;
const FIGURE = '# One\n\nText :ref{id="fig"}.\n\n::resource{id="fig"}';

describe('pinLegacyWideFloatStretch (#708)', () => {
  it('writes \'always\' where the columns are balanced and the lever is on', () => {
    expect(wide(pinLegacyWideFloatStretch({}))).toBe('always');
    const own: PostextConfig = { headings: { fontFamily: 'Georgia', balancing: { maxLinesAfterFloat: 2 } } };
    expect(pinLegacyWideFloatStretch(own).headings).toEqual({ fontFamily: 'Georgia', balancing: { maxLinesAfterFloat: 2, stretchAfterWideFloats: 'always' } });
    expect(wide(own)).toBeUndefined();
    expect(wide(pinLegacyWideFloatStretch({ layout: { writingMode: 'vertical-rl' }, headings: { balancing: { enabled: true } } }))).toBe('always');
  });

  it('leaves the other configurations as they are', () => {
    for (const config of [
      { headings: { balancing: { enabled: false } } },
      { headings: { balancing: { stretchAfterFloats: false } } },
      { headings: { balancing: { stretchAfterWideFloats: 'flush' } } },
      { headings: { balancing: { stretchAfterWideFloats: 'always' } } },
      { layout: { writingMode: 'vertical-rl' } },
      { locale: 'zh-Hans', cjk: { grid: { enabled: true, charsPerLine: 28, linesPerPage: 22 } } },
    ] as PostextConfig[]) {
      expect(pinLegacyWideFloatStretch(config)).toBe(config);
    }
  });

  it('pins every version before 12, none from 12, and no text without a float', () => {
    for (const v of [undefined, 1, 5, 8, 10, 11]) {
      expect(wide(migrateConfig({}, v)), String(v)).toBe('always');
      expect(wide(migrateConfig({}, v, { content: FIGURE })), String(v)).toBe('always');
      expect(wide(migrateConfig({}, v, { content: ['Prose.', ':::callout{placement=top}\nA box.\n:::'] })), String(v)).toBe('always');
      expect(wide(migrateConfig({}, v, { content: '# One\n\nText with no figure.' })), String(v)).toBeUndefined();
    }
    const current: PostextConfig = {};
    // One stamped 12 or 13 takes the pin of the language alone (#764, #770);
    // one stamped 14 is read as it is.
    expect(migrateConfig(current, 12, { content: FIGURE })).toEqual(pinLegacyHtmlViewerBreaking({ bodyText: { shapingLanguage: 'host', breakAfterSlashes: false } }));
    expect(migrateConfig(current, 13, { content: FIGURE })).toEqual(pinLegacyHtmlViewerBreaking({ ...current, bodyText: { shapingLanguage: 'host', breakAfterSlashes: false } }));
    expect(migrateConfig(current, 14, { content: FIGURE })).toEqual(pinLegacyHtmlViewerBreaking(pinLegacySlashBreaks(current)));
    expect(resolveAllConfig(current).headings.balancing.stretchAfterWideFloats).toBe('flush');
  });

  it('survives a save, and resolves any other value as \'flush\'', () => {
    const migrated = migrateConfig({}, 11, { content: FIGURE });
    const saved = stripConfigDefaults(migrated);
    expect(wide(saved)).toBe('always');
    expect(migrateConfig(saved, 12, { content: FIGURE })).toBe(saved);
    expect(resolveAllConfig(saved).headings.balancing.stretchAfterWideFloats).toBe('always');
    expect(wide(stripConfigDefaults(saved))).toBe('always');
    expect(stripConfigDefaults({ headings: { balancing: { stretchAfterWideFloats: 'flush' } } }).headings).toBeUndefined();
    expect(resolveAllConfig({ headings: { balancing: { stretchAfterWideFloats: 'never' as never } } }).headings.balancing.stretchAfterWideFloats).toBe('flush');
  });

  it('pins a bundle on its merged layers', () => {
    const base: PostextConfig = { headings: { fontFamily: 'Georgia' } };
    const merged = migrateBundleConfig(base, [{ layout: { layoutType: 'double' } }], 8, { content: 'Text :ref{id="fig"}.' });
    expect(merged.headings).toEqual({ fontFamily: 'Georgia', balancing: { stretchAfterWideFloats: 'always' } });
    expect(wide(migrateBundleConfig(base, [{ headings: { balancing: { stretchAfterFloats: false } } }], 8))).toBeUndefined();
    expect(migrateBundleConfig(base, [{}], 12).headings).toBe(base.headings);
  });
});
