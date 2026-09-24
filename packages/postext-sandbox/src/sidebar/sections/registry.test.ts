import { describe, expect, it } from 'vitest';
import { DEFAULT_LABELS } from '../../types/defaultLabels';
import { SETTINGS_GROUPS, SETTINGS_SECTIONS, groupOfSection, isSettingsGroupId, sectionsInGroup } from './registry';

describe('settings registry', () => {
  it('lists every section exactly once', () => {
    const ids = SETTINGS_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(24);
  });
  it('points every section and group at an existing label', () => {
    for (const s of SETTINGS_SECTIONS) expect(typeof DEFAULT_LABELS[s.labelKey]).toBe('string');
    for (const g of SETTINGS_GROUPS) {
      expect(typeof DEFAULT_LABELS[g.labelKey]).toBe('string');
      expect(typeof DEFAULT_LABELS[g.descriptionKey]).toBe('string');
    }
  });
  it('assigns every section to a known group, and no group is empty', () => {
    const groups = new Set(SETTINGS_GROUPS.map((g) => g.id));
    for (const s of SETTINGS_SECTIONS) expect(groups.has(s.group)).toBe(true);
    for (const g of SETTINGS_GROUPS) expect(sectionsInGroup(g.id).length).toBeGreaterThan(0);
    const total = SETTINGS_GROUPS.reduce((n, g) => n + sectionsInGroup(g.id).length, 0);
    expect(total).toBe(SETTINGS_SECTIONS.length);
    expect(groupOfSection('toc')).toBe('headings');
  });
  it('validates group ids', () => {
    expect(isSettingsGroupId('text')).toBe(true);
    expect(isSettingsGroupId('all')).toBe(false);
    expect(isSettingsGroupId('nope')).toBe(false);
  });
});
