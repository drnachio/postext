import { describe, it, expect } from 'vitest';
import { migrateBundleConfig, migrateConfig, pinLegacyTrailingStep, pinLegacySlashBreaks, pinLegacyHtmlViewerBreaking } from '../../bundle/configVersion.js';
import { stripConfigDefaults } from '../../defaults/index.js';
import { resolveAllConfig } from '../../pipeline/config.js';
import type { PostextConfig } from '../../types.js';

// #711: a configuration stored before the level cut of a closing band
// counted lines of the band's own text (configVersion 11 or older, postext
// 1.27 or earlier) keeps every cut on the baseline grid.

const step = (config: PostextConfig): string | undefined => config.headings?.balancing?.trailingStep;
const INDEX = '# Index\n\n:::index\n';

describe('pinLegacyTrailingStep (#711)', () => {
  it('writes \'grid\' where the columns are balanced and a closing band may be cut', () => {
    expect(step(pinLegacyTrailingStep({}))).toBe('grid');
    const own: PostextConfig = { headings: { fontFamily: 'Georgia', balancing: { trailing: false } } };
    // `beforeSpan` still cuts a band behind a box that moves on.
    expect(pinLegacyTrailingStep(own).headings).toEqual({ fontFamily: 'Georgia', balancing: { trailing: false, trailingStep: 'grid' } });
    expect(step(own)).toBeUndefined();
  });

  it('leaves the other configurations as they are', () => {
    for (const config of [
      { headings: { balancing: { enabled: false } } },
      { headings: { balancing: { trailing: false, beforeSpan: false } } },
      { headings: { balancing: { trailingStep: 'lines' } } },
      { headings: { balancing: { trailingStep: 'grid' } } },
      { layout: { writingMode: 'vertical-rl' } },
    ] as PostextConfig[]) {
      expect(pinLegacyTrailingStep(config)).toBe(config);
    }
  });

  it('pins every version before 12, none from 12, and no prose under headings', () => {
    for (const v of [undefined, 1, 5, 8, 10, 11]) {
      expect(step(migrateConfig({}, v)), String(v)).toBe('grid');
      for (const content of [INDEX, 'A list:\n\n- one\n- two', '> A quotation.', 'Cited [@knuth1984].', ':::paragraphs{style="entry"}\nOne.\n:::', '$$\nx\n$$']) {
        expect(step(migrateConfig({}, v, { content })), `${v}: ${content}`).toBe('grid');
      }
      expect(step(migrateConfig({}, v, { content: '# One\n\nProse.\n\n## Two\n\nMore prose, 3 > 2.' })), String(v)).toBeUndefined();
    }
    const current: PostextConfig = {};
    // One stamped 12 or 13 takes the pin of the language alone (#764, #770);
    // one stamped 14 is read as it is.
    expect(migrateConfig(current, 12, { content: INDEX })).toEqual(pinLegacyHtmlViewerBreaking({ bodyText: { shapingLanguage: 'host', breakAfterSlashes: false } }));
    expect(migrateConfig(current, 13, { content: INDEX })).toEqual(pinLegacyHtmlViewerBreaking({ ...current, bodyText: { shapingLanguage: 'host', breakAfterSlashes: false } }));
    expect(migrateConfig(current, 14, { content: INDEX })).toEqual(pinLegacyHtmlViewerBreaking(pinLegacySlashBreaks(current)));
    expect(resolveAllConfig(current).headings.balancing.trailingStep).toBe('lines');
  });

  it('survives a save, and resolves any other value as \'lines\'', () => {
    const migrated = migrateConfig({}, 11, { content: INDEX });
    const saved = stripConfigDefaults(migrated);
    expect(step(saved)).toBe('grid');
    expect(migrateConfig(saved, 12, { content: INDEX })).toBe(saved);
    expect(resolveAllConfig(saved).headings.balancing.trailingStep).toBe('grid');
    expect(step(stripConfigDefaults(saved))).toBe('grid');
    expect(stripConfigDefaults({ headings: { balancing: { trailingStep: 'lines' } } }).headings).toBeUndefined();
    expect(resolveAllConfig({ headings: { balancing: { trailingStep: 'px' as never } } }).headings.balancing.trailingStep).toBe('lines');
  });

  it('pins a bundle on its merged layers', () => {
    const base: PostextConfig = { headings: { fontFamily: 'Georgia' } };
    const merged = migrateBundleConfig(base, [{ layout: { layoutType: 'double' } }], 8, { content: '> A quotation.' });
    expect(merged.headings).toEqual({ fontFamily: 'Georgia', balancing: { trailingStep: 'grid' } });
    expect(step(migrateBundleConfig(base, [{ headings: { balancing: { enabled: false } } }], 8))).toBeUndefined();
    expect(migrateBundleConfig(base, [{}], 12).headings).toBe(base.headings);
  });
});
