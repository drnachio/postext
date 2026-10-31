import { describe, expect, it } from 'vitest';
import { DEFAULT_LABELS } from '../../types/defaultLabels.js';
import { SETTINGS_GROUPS, SETTINGS_SECTIONS, groupOfSection, isSettingsGroupId, sectionsInGroup } from './registry.js';

describe('settings registry', () => {
  it('lists every section exactly once', () => {
    const ids = SETTINGS_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(54);
    expect(SETTINGS_GROUPS).toHaveLength(15);
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
  it('gives the Folio viewer a group of its own, right after Export', () => {
    expect(sectionsInGroup('output').map((s) => s.id)).toEqual(['print', 'pdfGeneration', 'htmlViewer', 'canvasViewer']);
    expect(sectionsInGroup('folio').map((s) => s.id)).toEqual(['folio']);
    const ids = SETTINGS_GROUPS.map((g) => g.id);
    expect(ids.indexOf('folio')).toBe(ids.indexOf('output') + 1);
    expect(SETTINGS_SECTIONS.find((s) => s.id === 'folio')?.configKeys).toEqual(['folio']);
  });
  it('gives comic pages a group of their own, after the boxes and the exercises, every section editing comics', () => {
    const ids = SETTINGS_GROUPS.map((g) => g.id);
    expect(ids.indexOf('comics')).toBe(ids.indexOf('exercises') + 1);
    expect(sectionsInGroup('comics').map((s) => s.id)).toEqual(['comicsPanels', 'comicsPanelStyles', 'comicsLettering', 'comicsBalloonStyles', 'comicsCast']);
    for (const s of sectionsInGroup('comics')) expect(s.configKeys).toEqual(['comics']);
  });
  it('gives the exercises a group of their own, right after the boxes (#1226)', () => {
    const ids = SETTINGS_GROUPS.map((g) => g.id);
    expect(ids.indexOf('exercises')).toBe(ids.indexOf('callouts') + 1);
    expect(sectionsInGroup('exercises').map((s) => [s.id, s.configKeys])).toEqual([['exerciseStyles', ['exerciseStyles']], ['exercises', ['exercises']]]);
  });
  it('validates group ids', () => {
    expect(isSettingsGroupId('text')).toBe(true);
    expect(isSettingsGroupId('all')).toBe(false);
    expect(isSettingsGroupId('nope')).toBe(false);
  });

  it('puts the page templates with the page and its columns (#863)', () => {
    expect(sectionsInGroup('page').map((s) => s.id)).toEqual(['page', 'layout', 'pageTemplates', 'modules']);
    expect(SETTINGS_SECTIONS.find((s) => s.id === 'pageTemplates')!.configKeys).toEqual(['pageTemplates']);
  });

  it('puts the frame-style library with the box styles it reads (#873)', () => {
    expect(sectionsInGroup('callouts').map((s) => s.id)).toEqual(['calloutStyles', 'frameStyles', 'frameLooks']);
    expect(SETTINGS_SECTIONS.find((s) => s.id === 'frameLooks')!.configKeys).toEqual(['frameLooks']);
    expect(SETTINGS_SECTIONS.find((s) => s.id === 'frameStyles')!.configKeys).toEqual(['calloutStyles']);
  });

  it('puts the label styles with the other styles of figures (#969)', () => {
    expect(sectionsInGroup('figures').map((s) => s.id)).toContain('labelStyles');
    expect(SETTINGS_SECTIONS.find((s) => s.id === 'labelStyles')!.configKeys).toEqual(['labelStyles']);
    expect(groupOfSection('labelStyles')).toBe('figures');
  });
});
