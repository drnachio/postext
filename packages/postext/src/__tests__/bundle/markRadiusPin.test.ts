import { describe, it, expect } from 'vitest';
import { CONFIG_VERSION, migrateBundleConfig, migrateConfig, pinLegacyMarkRadius } from '../../bundle/configVersion.js';
import { stripConfigDefaults } from '../../defaults/index.js';
import { resolveMarkStylesConfig, stripMarkStylesDefaults } from '../../defaults/text/markStyles.js';
import { resolveAllConfig } from '../../pipeline/config.js';
import type { MarkStyleConfig, PostextConfig } from '../../types.js';

// #1149: a highlight band's ends are square by default, the print norm.
// Up to postext 1.51 they were rounded at 0.2 em; a configuration stored
// then (configVersion 17 or older) whose text sets a mark keeps them.

const em = (value: number) => ({ value, unit: 'em' as const });
const pt = (value: number) => ({ value, unit: 'pt' as const });
const MARKED = 'The sun warms :mark[the sea].';
const radii = (config: PostextConfig) => resolveAllConfig(config).markStyles.map((s) => s.borderRadius);

describe('markStyles borderRadius default (#1149)', () => {
  it('is 0, and a 0.2em radius is kept when stripping', () => {
    expect(resolveMarkStylesConfig(undefined)[0]!.borderRadius).toEqual(em(0));
    expect(stripMarkStylesDefaults([{ id: 'mark', borderRadius: em(0) }])).toBeUndefined();
    expect(stripMarkStylesDefaults([{ id: 'mark', borderRadius: em(0.2) }])).toEqual([{ id: 'mark', borderRadius: em(0.2) }]);
  });
});

describe('pinLegacyMarkRadius (#1149)', () => {
  it('writes the old radius on every style that names none', () => {
    expect(pinLegacyMarkRadius<PostextConfig>({}).markStyles).toEqual([{ id: 'mark', name: 'Mark', borderRadius: em(0.2) }]);
    const own: PostextConfig = { markStyles: [{ id: 'key' }, { id: 'flat', borderRadius: pt(0) }, { id: 'round', borderRadius: em(1) }] };
    expect(pinLegacyMarkRadius(own).markStyles).toEqual([{ id: 'key', borderRadius: em(0.2) }, { id: 'flat', borderRadius: pt(0) }, { id: 'round', borderRadius: em(1) }]);
    // The stored configuration is not touched.
    expect(own.markStyles![0]).toEqual({ id: 'key' });
  });

  it('leaves an empty list, or one whose styles all name a radius, as it is', () => {
    for (const config of [{ markStyles: [] }, { markStyles: [{ id: 'a', borderRadius: em(0.3) }] }] as PostextConfig[]) {
      expect(pinLegacyMarkRadius(config)).toBe(config);
    }
  });

  it('pins every version before 18 whose text may set a mark, and none from 18', () => {
    expect(CONFIG_VERSION).toBe(21);
    for (const v of [undefined, 1, 8, 12, 15, 16, 17]) {
      expect(radii(migrateConfig({}, v)), String(v)).toEqual([em(0.2)]);
      expect(radii(migrateConfig({}, v, { content: MARKED })), String(v)).toEqual([em(0.2)]);
      expect(radii(migrateConfig({}, v, { content: ['Words.', MARKED] })), String(v)).toEqual([em(0.2)]);
      expect(radii(migrateConfig({}, v, { content: 'Words and nothing else.' })), String(v)).toEqual([em(0)]);
      // A design text that reads inline marks may set one too.
      const designed: PostextConfig = { header: { elements: [{ kind: 'text', id: 't', content: ':mark[{chapterTitle}]', fontSize: pt(9), inlineMarks: true, placement: { anchor: { to: 'container', edge: 'top-left' } } }] } };
      expect(radii(migrateConfig(designed, v, { content: 'Words.' })), String(v)).toEqual([em(0.2)]);
    }
    for (const v of [18, CONFIG_VERSION, 99]) {
      // (one stamped 18 still gets the breaks at a slash of 1.51, #1164)
      expect(migrateConfig<PostextConfig>({}, v, { content: MARKED }).markStyles, String(v)).toBeUndefined();
      expect(radii(migrateConfig({}, v)), String(v)).toEqual([em(0)]);
    }
  });

  it('pins the markStyles in force in a bundle', () => {
    const base: PostextConfig = {};
    const layers: PostextConfig[] = [{ markStyles: [{ id: 'key' }] as MarkStyleConfig[] }, { locale: 'es' }];
    const merged = migrateBundleConfig(base, layers, 16, { content: MARKED });
    expect(merged.markStyles).toEqual([{ id: 'key', borderRadius: em(0.2) }]);
    expect(migrateBundleConfig(base, layers, 18, { content: MARKED }).markStyles).toEqual([{ id: 'key' }]);
  });

  it('survives a save', () => {
    const migrated = migrateConfig<PostextConfig>({}, 16, { content: MARKED });
    const saved = stripConfigDefaults(migrated);
    expect(saved.markStyles).toEqual([{ id: 'mark', name: 'Mark', borderRadius: em(0.2) }]);
    const reloaded = migrateConfig(saved, CONFIG_VERSION, { content: MARKED });
    expect(radii(reloaded)).toEqual([em(0.2)]);
  });
});
