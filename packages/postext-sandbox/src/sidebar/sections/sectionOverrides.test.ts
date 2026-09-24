import { describe, expect, it } from 'vitest';
import type { PostextConfig } from 'postext';
import { cloneDefaultColorPalette } from 'postext';
import { groupOverrideCounts, sectionHasOverrides } from './sectionOverrides';

const base: PostextConfig = { colorPalette: cloneDefaultColorPalette() };

describe('sectionHasOverrides', () => {
  it('is false for a pristine config', () => {
    for (const id of ['page', 'layout', 'color-palette', 'headerFooter', 'bodyText', 'debug', 'warnings'] as const) {
      expect(sectionHasOverrides(base, id)).toBe(false);
    }
  });
  it('detects a plain section override', () => {
    expect(sectionHasOverrides({ ...base, page: { dpi: 150 } }, 'page')).toBe(true);
    expect(sectionHasOverrides({ ...base, page: {} }, 'page')).toBe(false);
  });
  it('treats header/footer, arrays and resource types by presence', () => {
    expect(sectionHasOverrides({ ...base, footer: { elements: [] } }, 'headerFooter')).toBe(true);
    expect(sectionHasOverrides({ ...base, paragraphStyles: [] }, 'paragraphStyles')).toBe(false);
    expect(sectionHasOverrides({ ...base, calloutStyles: [] }, 'calloutStyles')).toBe(true);
    expect(sectionHasOverrides({ ...base, resourceTypes: [] }, 'resource-types')).toBe(true);
    expect(sectionHasOverrides({ ...base, headingStyles: [] }, 'headingStyles')).toBe(false);
    expect(sectionHasOverrides({ ...base, headingStyles: [{ id: 'preface' }] }, 'headingStyles')).toBe(true);
    expect(sectionHasOverrides({ ...base, toc: { leader: { enabled: false } } }, 'toc')).toBe(true);
  });
  it('counts the document locale as a body text override', () => {
    expect(sectionHasOverrides({ ...base, locale: 'es' }, 'bodyText')).toBe(true);
  });
  it('separates debug from warnings inside config.debug', () => {
    const warningsOnly: PostextConfig = { ...base, debug: { warnings: { looseLines: false } } };
    expect(sectionHasOverrides(warningsOnly, 'warnings')).toBe(true);
    expect(sectionHasOverrides(warningsOnly, 'debug')).toBe(false);
    const grid: PostextConfig = { ...base, page: { baselineGrid: { enabled: true } } };
    expect(sectionHasOverrides(grid, 'debug')).toBe(true);
  });
});

describe('groupOverrideCounts', () => {
  it('counts overridden sections per category', () => {
    const cfg: PostextConfig = { ...base, page: { dpi: 150 }, bodyText: { fontSize: { value: 11, unit: 'pt' } } };
    expect(groupOverrideCounts(cfg)).toMatchObject({ page: 1, text: 1, figures: 0, output: 0, advanced: 0 });
  });
});
