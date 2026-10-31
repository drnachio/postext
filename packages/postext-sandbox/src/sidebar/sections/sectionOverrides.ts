// Which settings sections carry overrides — the same rules the sections use
// for their own reset buttons, gathered in one pure place so the category
// strip can show a "modified" dot without rendering the sections.

import type { PostextConfig } from 'postext';
import { isDefaultColorPalette } from 'postext';
import { SETTINGS_GROUPS, SETTINGS_SECTIONS, type SettingsGroupId, type SettingsSectionEntry, type SettingsSectionId } from './registry.js';

function hasKeys(v: unknown): boolean {
  return typeof v === 'object' && v !== null && Object.keys(v).length > 0;
}

export function sectionHasOverrides(config: PostextConfig, section: SettingsSectionId): boolean {
  switch (section) {
    case 'color-palette':
      return !isDefaultColorPalette(config.colorPalette);
    case 'contrast':
      return hasKeys(config.contrast);
    case 'checks':
      return hasKeys(config.checks?.contentInConfig);
    case 'headerFooter':
      return config.header !== undefined || config.footer !== undefined;
    case 'paragraphStyles':
      return (config.paragraphStyles ?? []).length > 0;
    case 'headingStyles':
      return (config.headingStyles ?? []).length > 0;
    case 'tableStyles':
      return (config.tableStyles ?? []).length > 0;
    case 'scoreStyles':
      return (config.scoreStyles ?? []).length > 0;
    case 'frameLooks':
      return (config.frameLooks ?? []).length > 0;
    case 'pageTemplates':
      return (config.pageTemplates ?? []).length > 0;
    // The libraries edit in place; Box styles and Page templates carry the dot.
    case 'modules':
    case 'frameStyles':
      return false;
    case 'bodyText':
      return hasKeys(config.bodyText);
    case 'writing':
      return config.locale !== undefined || config.layout?.writingMode !== undefined || config.page?.binding !== undefined;
    case 'calloutStyles':
      return config.calloutStyles !== undefined;
    case 'chipStyles':
      return config.chipStyles !== undefined;
    case 'markStyles':
      return config.markStyles !== undefined;
    case 'exerciseStyles':
      return config.exerciseStyles !== undefined;
    case 'labelStyles':
      return (config.labelStyles ?? []).length > 0;
    case 'comicsPanels': {
      const c = config.comics;
      return c !== undefined && (
        c.readingDirection !== undefined || c.artDirection !== undefined || c.mirrorArt !== undefined ||
        c.frame !== undefined || hasKeys(c.gutter) || hasKeys(c.panel) || c.runningHeads !== undefined
      );
    }
    case 'comicsPanelStyles':
      return (config.comics?.panelStyles ?? []).length > 0;
    case 'comicsLettering':
      return hasKeys(config.comics?.lettering);
    case 'comicsBalloonStyles':
      return (config.comics?.balloonStyles ?? []).length > 0;
    case 'comicsCast':
      return (config.comics?.cast ?? []).length > 0;
    case 'resource-types':
      return config.resourceTypes !== undefined;
    case 'debug':
      return (
        hasKeys(config.page?.baselineGrid) ||
        config.debug?.cursorSync !== undefined ||
        config.debug?.selectionSync !== undefined ||
        config.debug?.looseLineHighlight !== undefined ||
        config.debug?.pageNegative !== undefined ||
        config.debug?.fitMarks !== undefined ||
        config.debug?.fitMarksMinScale !== undefined
      );
    case 'warnings':
      return hasKeys(config.debug?.warnings);
    case 'page':
      // The baseline grid is stored under `page` but belongs to Debug, the
      // binding to Writing system, the crop marks to Print preparation.
      return Object.keys(config.page ?? {}).some((k) => k !== 'baselineGrid' && k !== 'binding' && k !== 'cutLines');
    case 'print':
      return hasKeys(config.print) || config.page?.cutLines !== undefined;
    case 'layout':
      // The writing mode belongs to Writing system.
      return Object.keys(config.layout ?? {}).some((k) => k !== 'writingMode');
    case 'parts':
    case 'headings':
    case 'toc':
    case 'index':
    case 'unordered-lists':
    case 'ordered-lists':
    case 'math':
    case 'footnotes':
    case 'links':
    case 'lineNumbers':
    case 'codeStyle':
    case 'crossRefs':
    case 'citations':
    case 'cjk':
    case 'captionStyle':
    case 'tableStyle':
    case 'diagramStyle':
    case 'scoreStyle':
    case 'videoStyle':
    case 'htmlViewer':
    case 'canvasViewer':
    case 'folio':
    case 'pdfGeneration':
    case 'exercises': {
      const entry = SETTINGS_SECTIONS.find((s) => s.id === section) as SettingsSectionEntry;
      return entry.configKeys.some((k) => hasKeys(config[k]));
    }
  }
}

/** Number of overridden sections per group. */
export function groupOverrideCounts(config: PostextConfig): Record<SettingsGroupId, number> {
  const counts = Object.fromEntries(SETTINGS_GROUPS.map((g) => [g.id, 0])) as Record<SettingsGroupId, number>;
  for (const s of SETTINGS_SECTIONS) {
    if (sectionHasOverrides(config, s.id)) counts[s.group]++;
  }
  return counts;
}
