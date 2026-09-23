import { describe, expect, it } from 'vitest';
import { DEFAULT_LABELS } from '../../types/defaultLabels';
import { SETTINGS_CATEGORIES, SETTINGS_SECTIONS, isSettingsCategoryFilter, sectionsInCategory } from './registry';

describe('settings registry', () => {
  it('lists every section exactly once', () => {
    const ids = SETTINGS_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(23);
  });
  it('points every section and category at an existing label', () => {
    for (const s of SETTINGS_SECTIONS) expect(typeof DEFAULT_LABELS[s.labelKey]).toBe('string');
    for (const c of SETTINGS_CATEGORIES) expect(typeof DEFAULT_LABELS[c.labelKey]).toBe('string');
  });
  it('assigns every section to a known category', () => {
    const cats = new Set(SETTINGS_CATEGORIES.map((c) => c.id));
    for (const s of SETTINGS_SECTIONS) expect(cats.has(s.category)).toBe(true);
    const total = SETTINGS_CATEGORIES.reduce((n, c) => n + sectionsInCategory(c.id).length, 0);
    expect(total).toBe(SETTINGS_SECTIONS.length);
  });
  it('validates category filters', () => {
    expect(isSettingsCategoryFilter('all')).toBe(true);
    expect(isSettingsCategoryFilter('text')).toBe(true);
    expect(isSettingsCategoryFilter('nope')).toBe(false);
  });
});
