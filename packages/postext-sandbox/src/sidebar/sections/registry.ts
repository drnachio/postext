// Static map of the settings sections: which category each one belongs to,
// its title label and the config keys it edits. Pure — the components that
// render each section are wired up in ConfigPanel so this stays testable.

import type { PostextConfig } from 'postext';
import type { SandboxLabels } from '../../types/labels';

export type SettingsCategoryId = 'document' | 'text' | 'figures' | 'output' | 'advanced';

export type SettingsSectionId =
  | 'page'
  | 'layout'
  | 'color-palette'
  | 'headerFooter'
  | 'parts'
  | 'bodyText'
  | 'headings'
  | 'headingStyles'
  | 'toc'
  | 'paragraphStyles'
  | 'unordered-lists'
  | 'ordered-lists'
  | 'math'
  | 'resource-types'
  | 'captionStyle'
  | 'tableStyle'
  | 'tableStyles'
  | 'diagramStyle'
  | 'calloutStyles'
  | 'htmlViewer'
  | 'pdfGeneration'
  | 'debug'
  | 'warnings';

export interface SettingsCategory {
  id: SettingsCategoryId;
  labelKey: keyof SandboxLabels;
}

export interface SettingsSectionEntry {
  id: SettingsSectionId;
  category: SettingsCategoryId;
  labelKey: keyof SandboxLabels;
  /** Top-level config keys the section writes (for override counting). */
  configKeys: (keyof PostextConfig)[];
}

export const SETTINGS_CATEGORIES: readonly SettingsCategory[] = [
  { id: 'document', labelKey: 'settingsCategoryDocument' },
  { id: 'text', labelKey: 'settingsCategoryText' },
  { id: 'figures', labelKey: 'settingsCategoryFigures' },
  { id: 'output', labelKey: 'settingsCategoryOutput' },
  { id: 'advanced', labelKey: 'settingsCategoryAdvanced' },
];

export const SETTINGS_SECTIONS: readonly SettingsSectionEntry[] = [
  // Document
  { id: 'page', category: 'document', labelKey: 'page', configKeys: ['page'] },
  { id: 'layout', category: 'document', labelKey: 'layout', configKeys: ['layout'] },
  { id: 'color-palette', category: 'document', labelKey: 'colorPalette', configKeys: ['colorPalette'] },
  { id: 'headerFooter', category: 'document', labelKey: 'headerFooter', configKeys: ['header', 'footer'] },
  { id: 'parts', category: 'document', labelKey: 'parts', configKeys: ['parts'] },
  // Text
  { id: 'bodyText', category: 'text', labelKey: 'bodyText', configKeys: ['bodyText', 'locale'] },
  { id: 'headings', category: 'text', labelKey: 'headings', configKeys: ['headings'] },
  { id: 'headingStyles', category: 'text', labelKey: 'headingStylesSection', configKeys: ['headingStyles'] },
  { id: 'toc', category: 'text', labelKey: 'tocSection', configKeys: ['toc'] },
  { id: 'paragraphStyles', category: 'text', labelKey: 'paragraphStylesSection', configKeys: ['paragraphStyles'] },
  { id: 'unordered-lists', category: 'text', labelKey: 'unorderedLists', configKeys: ['unorderedLists'] },
  { id: 'ordered-lists', category: 'text', labelKey: 'orderedLists', configKeys: ['orderedLists'] },
  { id: 'math', category: 'text', labelKey: 'mathSection', configKeys: ['math'] },
  // Figures & tables
  { id: 'resource-types', category: 'figures', labelKey: 'resourceTypesSection', configKeys: ['resourceTypes'] },
  { id: 'captionStyle', category: 'figures', labelKey: 'captionStyleSection', configKeys: ['captionStyle'] },
  { id: 'tableStyle', category: 'figures', labelKey: 'tableStyleSection', configKeys: ['tableStyle'] },
  { id: 'tableStyles', category: 'figures', labelKey: 'tableStylesSection', configKeys: ['tableStyles'] },
  { id: 'diagramStyle', category: 'figures', labelKey: 'diagramStyleSection', configKeys: ['diagramStyle'] },
  { id: 'calloutStyles', category: 'figures', labelKey: 'calloutStylesSection', configKeys: ['calloutStyles'] },
  // Output
  { id: 'htmlViewer', category: 'output', labelKey: 'htmlViewer', configKeys: ['htmlViewer'] },
  { id: 'pdfGeneration', category: 'output', labelKey: 'pdfGenerationSection', configKeys: ['pdfGeneration'] },
  // Advanced
  { id: 'debug', category: 'advanced', labelKey: 'debug', configKeys: ['debug', 'page'] },
  { id: 'warnings', category: 'advanced', labelKey: 'warnings', configKeys: ['debug'] },
];

export function sectionsInCategory(category: SettingsCategoryId): SettingsSectionEntry[] {
  return SETTINGS_SECTIONS.filter((s) => s.category === category);
}

export type SettingsCategoryFilter = 'all' | SettingsCategoryId;

export function isSettingsCategoryFilter(v: unknown): v is SettingsCategoryFilter {
  return v === 'all' || SETTINGS_CATEGORIES.some((c) => c.id === v);
}
