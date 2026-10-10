import { describe, it, expect } from 'vitest';
import { migrateBundleConfig, migrateConfig, pinLegacyOpenerHeadFloats } from '../../bundle/configVersion';
import { resolveAllConfig } from '../../pipeline/config';
import type { PostextConfig } from '../../types';

// #639: a configuration stored before the head of a page-span opener's own
// column became a float slot (configVersion 10 or older, postext 1.24 or
// earlier) keeps 1.24's slots when it sets a page-span heading and its
// content holds a heading.

const TEXT = '# Chapter\n\nText.\n';
const opener: PostextConfig = { headings: { levels: [{ level: 1, span: 'page' }] } };

describe('pinLegacyOpenerHeadFloats (#639)', () => {
  it('sets layout.floatsUnderOpener: false, keeping the other layout fields', () => {
    const config: PostextConfig = { ...opener, layout: { layoutType: 'multiple', columnCount: 4 } };
    const out = migrateConfig(config, 10, { content: TEXT });
    expect(out.layout).toEqual({ layoutType: 'multiple', columnCount: 4, floatsUnderOpener: false });
    expect(resolveAllConfig(out).layout.floatsUnderOpener).toBe(false);
    expect(resolveAllConfig(config).layout.floatsUnderOpener).toBe(true);
    expect(config.layout).toEqual({ layoutType: 'multiple', columnCount: 4 });
  });

  it('leaves a configuration that sets floatsUnderOpener as it is', () => {
    for (const config of [{ layout: { floatsUnderOpener: true } }, { layout: { floatsUnderOpener: false } }] as PostextConfig[]) {
      expect(pinLegacyOpenerHeadFloats(config)).toBe(config);
    }
  });

  it('pins every version before 11 that sets a page-span heading, none from 11', () => {
    for (const v of [undefined, 1, 5, 8, 9, 10]) {
      expect(migrateConfig(opener, v, { content: TEXT }).layout?.floatsUnderOpener, String(v)).toBe(false);
      // Unknown content may hold a heading.
      expect(migrateConfig(opener, v).layout?.floatsUnderOpener, String(v)).toBe(false);
    }
    // A heading style that spans the page counts too.
    const styled: PostextConfig = { headingStyles: [{ id: 'cover', span: 'page' }] };
    expect(migrateConfig(styled, 10, { content: TEXT }).layout?.floatsUnderOpener).toBe(false);
    expect(migrateConfig(opener, 11, { content: TEXT })).toBe(opener);
  });

  it('leaves a configuration with no page-span heading, or text with no heading, alone', () => {
    // No level spans the page by default.
    for (const config of [{}, { headings: { levels: [{ level: 1, span: 'column' }] } }, { layout: { layoutType: 'multiple' } }] as PostextConfig[]) {
      expect(migrateConfig(config, 10, { content: TEXT }).layout?.floatsUnderOpener).toBeUndefined();
    }
    expect(migrateConfig(opener, 10, { content: 'Text with no heading.\n' }).layout).toBeUndefined();
  });

  it('pins a bundle on its merged layers', () => {
    const base: PostextConfig = { layout: { gutterWidth: { value: 6, unit: 'mm' } } };
    const merged = migrateBundleConfig(base, [opener], 10, { content: TEXT });
    expect(merged.layout).toEqual({ gutterWidth: { value: 6, unit: 'mm' }, floatsUnderOpener: false });
    expect(migrateBundleConfig(base, [opener], 11, { content: TEXT }).layout).toBe(base.layout);
    expect(migrateBundleConfig(base, [], 10, { content: TEXT }).layout).toBe(base.layout);
  });
});
