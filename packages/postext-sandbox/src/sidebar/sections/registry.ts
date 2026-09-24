// Static map of the settings: the groups a reader browses (each a page in
// the Design panel, named in editorial words), the sections inside each and
// the config keys every section edits. Pure — the components that render
// each section are wired up in ConfigPanel so this stays testable.

import type { PostextConfig } from 'postext';
import type { SandboxLabels } from '../../types/labels';

export type SettingsGroupId =
  | 'page'
  | 'colors'
  | 'text'
  | 'headings'
  | 'lists'
  | 'figures'
  | 'callouts'
  | 'running'
  | 'parts'
  | 'output'
  | 'advanced';

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
  | 'chipStyles'
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

export interface SettingsGroup {
  id: SettingsGroupId;
  labelKey: keyof SandboxLabels;
  /** One sentence saying what the group controls, in plain words. */
  descriptionKey: keyof SandboxLabels;
}

export interface SettingsSectionEntry {
  id: SettingsSectionId;
  group: SettingsGroupId;
  labelKey: keyof SandboxLabels;
  /** Top-level config keys the section writes (for override counting). */
  configKeys: (keyof PostextConfig)[];
}

/** Browsing order: the page first, then the text on it from the body out,
 *  then what repeats on every page, then output. */
export const SETTINGS_GROUPS: readonly SettingsGroup[] = [
  { id: 'page', labelKey: 'settingsGroupPage', descriptionKey: 'settingsGroupPageDescription' },
  { id: 'colors', labelKey: 'settingsGroupColors', descriptionKey: 'settingsGroupColorsDescription' },
  { id: 'text', labelKey: 'settingsGroupText', descriptionKey: 'settingsGroupTextDescription' },
  { id: 'headings', labelKey: 'settingsGroupHeadings', descriptionKey: 'settingsGroupHeadingsDescription' },
  { id: 'lists', labelKey: 'settingsGroupLists', descriptionKey: 'settingsGroupListsDescription' },
  { id: 'figures', labelKey: 'settingsGroupFigures', descriptionKey: 'settingsGroupFiguresDescription' },
  { id: 'callouts', labelKey: 'settingsGroupCallouts', descriptionKey: 'settingsGroupCalloutsDescription' },
  { id: 'running', labelKey: 'settingsGroupRunning', descriptionKey: 'settingsGroupRunningDescription' },
  { id: 'parts', labelKey: 'settingsGroupParts', descriptionKey: 'settingsGroupPartsDescription' },
  { id: 'output', labelKey: 'settingsGroupOutput', descriptionKey: 'settingsGroupOutputDescription' },
  { id: 'advanced', labelKey: 'settingsGroupAdvanced', descriptionKey: 'settingsGroupAdvancedDescription' },
];

export const SETTINGS_SECTIONS: readonly SettingsSectionEntry[] = [
  { id: 'page', group: 'page', labelKey: 'page', configKeys: ['page'] },
  { id: 'layout', group: 'page', labelKey: 'layout', configKeys: ['layout'] },
  { id: 'color-palette', group: 'colors', labelKey: 'colorPalette', configKeys: ['colorPalette'] },
  { id: 'bodyText', group: 'text', labelKey: 'bodyText', configKeys: ['bodyText', 'locale'] },
  { id: 'paragraphStyles', group: 'text', labelKey: 'paragraphStylesSection', configKeys: ['paragraphStyles'] },
  { id: 'chipStyles', group: 'text', labelKey: 'chipStylesSection', configKeys: ['chipStyles'] },
  { id: 'math', group: 'text', labelKey: 'mathSection', configKeys: ['math'] },
  { id: 'headings', group: 'headings', labelKey: 'headings', configKeys: ['headings'] },
  { id: 'headingStyles', group: 'headings', labelKey: 'headingStylesSection', configKeys: ['headingStyles'] },
  { id: 'toc', group: 'headings', labelKey: 'tocSection', configKeys: ['toc'] },
  { id: 'unordered-lists', group: 'lists', labelKey: 'unorderedLists', configKeys: ['unorderedLists'] },
  { id: 'ordered-lists', group: 'lists', labelKey: 'orderedLists', configKeys: ['orderedLists'] },
  { id: 'resource-types', group: 'figures', labelKey: 'resourceTypesSection', configKeys: ['resourceTypes'] },
  { id: 'captionStyle', group: 'figures', labelKey: 'captionStyleSection', configKeys: ['captionStyle'] },
  { id: 'tableStyle', group: 'figures', labelKey: 'tableStyleSection', configKeys: ['tableStyle'] },
  { id: 'tableStyles', group: 'figures', labelKey: 'tableStylesSection', configKeys: ['tableStyles'] },
  { id: 'diagramStyle', group: 'figures', labelKey: 'diagramStyleSection', configKeys: ['diagramStyle'] },
  { id: 'calloutStyles', group: 'callouts', labelKey: 'calloutStylesSection', configKeys: ['calloutStyles'] },
  { id: 'headerFooter', group: 'running', labelKey: 'headerFooter', configKeys: ['header', 'footer'] },
  { id: 'parts', group: 'parts', labelKey: 'parts', configKeys: ['parts'] },
  { id: 'pdfGeneration', group: 'output', labelKey: 'pdfGenerationSection', configKeys: ['pdfGeneration'] },
  { id: 'htmlViewer', group: 'output', labelKey: 'htmlViewer', configKeys: ['htmlViewer'] },
  { id: 'debug', group: 'advanced', labelKey: 'debug', configKeys: ['debug', 'page'] },
  { id: 'warnings', group: 'advanced', labelKey: 'warnings', configKeys: ['debug'] },
];

export function sectionsInGroup(group: SettingsGroupId): SettingsSectionEntry[] {
  return SETTINGS_SECTIONS.filter((s) => s.group === group);
}

export function isSettingsGroupId(v: unknown): v is SettingsGroupId {
  return SETTINGS_GROUPS.some((g) => g.id === v);
}

export function groupOfSection(section: SettingsSectionId): SettingsGroupId {
  return SETTINGS_SECTIONS.find((s) => s.id === section)!.group;
}
