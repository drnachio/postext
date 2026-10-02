import { describe, expect, it } from 'vitest';
import { DEFAULT_LABELS } from '../../types/defaultLabels';
import { SETTINGS_GROUPS, SETTINGS_SECTIONS, groupOfSection, isSettingsGroupId, sectionsInGroup } from './registry';

describe('settings registry', () => {
  it('lists every section exactly once', () => {
    const ids = SETTINGS_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(31);
    expect(SETTINGS_GROUPS).toHaveLength(12);
  });
  it('puts the writing system right after the page, with its two sections', () => {
    expect(SETTINGS_GROUPS.map((g) => g.id).slice(0, 3)).toEqual(['page', 'writing', 'colors']);
    expect(sectionsInGroup('writing').map((s) => s.id)).toEqual(['writing', 'cjk']);
    expect(groupOfSection('cjk')).toBe('writing');
    // The document language left Body text.
    expect(SETTINGS_SECTIONS.find((s) => s.id === 'bodyText')?.configKeys).toEqual(['bodyText']);
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
  it('lists the Folio viewer in Export, after the web reader', () => {
    expect(sectionsInGroup('output').map((s) => s.id)).toEqual(['pdfGeneration', 'htmlViewer', 'folio']);
    expect(SETTINGS_SECTIONS.find((s) => s.id === 'folio')?.configKeys).toEqual(['folio']);
  });
  it('validates group ids', () => {
    expect(isSettingsGroupId('text')).toBe(true);
    expect(isSettingsGroupId('all')).toBe(false);
    expect(isSettingsGroupId('nope')).toBe(false);
  });
});
