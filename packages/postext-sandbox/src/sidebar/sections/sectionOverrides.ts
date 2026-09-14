// Which settings sections carry overrides — the same rules the sections use
// for their own reset buttons, gathered in one pure place so the category
// strip can show a "modified" dot without rendering the sections.

import type { PostextConfig } from 'postext';
import { isDefaultColorPalette } from 'postext';
import { SETTINGS_SECTIONS, type SettingsCategoryId, type SettingsSectionEntry, type SettingsSectionId } from './registry';

function hasKeys(v: unknown): boolean {
  return typeof v === 'object' && v !== null && Object.keys(v).length > 0;
}

export function sectionHasOverrides(config: PostextConfig, section: SettingsSectionId): boolean {
  switch (section) {
    case 'color-palette':
      return !isDefaultColorPalette(config.colorPalette);
    case 'headerFooter':
      return config.header !== undefined || config.footer !== undefined;
    case 'paragraphStyles':
      return (config.paragraphStyles ?? []).length > 0;
    case 'calloutStyles':
      return config.calloutStyles !== undefined;
    case 'resource-types':
      return config.resourceTypes !== undefined;
    case 'debug':
      return (
        hasKeys(config.page?.baselineGrid) ||
        config.debug?.cursorSync !== undefined ||
        config.debug?.selectionSync !== undefined ||
        config.debug?.looseLineHighlight !== undefined ||
        config.debug?.pageNegative !== undefined
      );
    case 'warnings':
      return hasKeys(config.debug?.warnings);
    case 'page':
    case 'layout':
    case 'parts':
    case 'bodyText':
    case 'headings':
    case 'unordered-lists':
    case 'ordered-lists':
    case 'math':
    case 'captionStyle':
    case 'tableStyle':
    case 'diagramStyle':
    case 'htmlViewer':
    case 'pdfGeneration': {
      const entry = SETTINGS_SECTIONS.find((s) => s.id === section) as SettingsSectionEntry;
      return entry.configKeys.some((k) => hasKeys(config[k]));
    }
  }
}

/** Number of overridden sections per category. */
export function categoryOverrideCounts(config: PostextConfig): Record<SettingsCategoryId, number> {
  const counts: Record<SettingsCategoryId, number> = { document: 0, text: 0, figures: 0, output: 0, advanced: 0 };
  for (const s of SETTINGS_SECTIONS) {
    if (sectionHasOverrides(config, s.id)) counts[s.category]++;
  }
  return counts;
}
