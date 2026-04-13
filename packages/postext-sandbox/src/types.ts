import type { PostextConfig } from 'postext';
import type { ReactNode } from 'react';

export interface SandboxLabels {
  // Panel names
  configuration: string;
  resources: string;
  markdownEditor: string;

  // Viewport tabs
  canvas: string;
  html: string;
  pdf: string;

  // Placeholders
  comingSoon: string;
  resourcesComingSoonDescription: string;
  pdfComingSoonDescription: string;

  // Page section
  page: string;
  pageBackgroundColor: string;
  pageBackgroundColorTooltip: string;
  pageSize: string;
  pageSizeTooltip: string;
  custom: string;
  width: string;
  widthTooltip: string;
  height: string;
  heightTooltip: string;
  marginTop: string;
  marginBottom: string;
  marginLeft: string;
  marginRight: string;
  marginsTooltip: string;
  dpi: string;
  dpiTooltip: string;
  cutLines: string;
  cutLinesTooltip: string;
  baselineGrid: string;
  baselineGridTooltip: string;
  baselineGridColor: string;
  baselineGridColorTooltip: string;

  // Body text section
  bodyText: string;
  bodyFont: string;
  bodyFontTooltip: string;
  bodyFontSearch: string;
  bodyFontNoResults: string;
  bodyFontSize: string;
  bodyFontSizeTooltip: string;
  bodyLineHeight: string;
  bodyLineHeightTooltip: string;
  bodyColor: string;
  bodyColorTooltip: string;

  // Layout section
  layout: string;
  layoutType: string;
  layoutTypeTooltip: string;
  layoutSingle: string;
  layoutDouble: string;
  layoutOneAndHalf: string;
  gutterWidth: string;
  gutterWidthTooltip: string;
  sideColumnPercent: string;
  sideColumnPercentTooltip: string;

  // Toolbar actions
  bold: string;
  italic: string;
  heading: string;
  link: string;
  code: string;
  blockquote: string;
  orderedList: string;
  unorderedList: string;

  // Persistence
  save: string;
  load: string;
  exportFile: string;
  importFile: string;
  reset: string;
  resetConfigConfirm: string;
  resetSectionConfirm: string;
  resetMarkdownConfirm: string;
}

export type PanelId = 'markdown' | 'config' | 'resources';
export type ViewportTab = 'canvas' | 'html' | 'pdf';

export interface PostextSandboxProps {
  initialMarkdown?: string;
  initialConfig?: PostextConfig;
  className?: string;
  labels?: Partial<SandboxLabels>;
  onConfigChange?: (config: PostextConfig) => void;
  onMarkdownChange?: (markdown: string) => void;
  themeToggle?: ReactNode;
  languageSwitcher?: ReactNode;
  homeUrl?: string;
  homeLink?: ReactNode;
}

export interface ToolbarAction {
  id: string;
  icon: ReactNode;
  label: string;
  action: (params: {
    insert: (before: string, after?: string) => void;
    wrapSelection: (before: string, after: string) => void;
  }) => void;
}

export const DEFAULT_LABELS: SandboxLabels = {
  configuration: 'Configuration',
  resources: 'Resources',
  markdownEditor: 'Markdown Editor',
  canvas: 'Canvas',
  html: 'HTML',
  pdf: 'PDF',
  comingSoon: 'Coming soon',
  resourcesComingSoonDescription: 'Resource management will be available in a future version.',
  pdfComingSoonDescription: 'PDF export will be available in a future version.',
  page: 'Page',
  pageBackgroundColor: 'Background Color',
  pageBackgroundColorTooltip: 'Background color of the page',
  pageSize: 'Page Size',
  pageSizeTooltip: 'Standard page format or custom dimensions',
  custom: 'Custom',
  width: 'Width',
  widthTooltip: 'Custom page width',
  height: 'Height',
  heightTooltip: 'Custom page height',
  marginTop: 'Top Margin',
  marginBottom: 'Bottom Margin',
  marginLeft: 'Left Margin',
  marginRight: 'Right Margin',
  marginsTooltip: 'Space between the page edge and the content area',
  dpi: 'DPI',
  dpiTooltip: 'Dots per inch — controls the resolution of the page',
  cutLines: 'Cut Lines',
  cutLinesTooltip: 'Show trim marks at the page corners for print cutting',
  baselineGrid: 'Baseline Grid',
  baselineGridTooltip: 'Show horizontal lines to align text baselines',
  baselineGridColor: 'Grid Color',
  baselineGridColorTooltip: 'Color of the baseline grid lines',
  bodyText: 'Body Text',
  bodyFont: 'Font',
  bodyFontTooltip: 'Font family for the body text',
  bodyFontSearch: 'Search fonts...',
  bodyFontNoResults: 'No fonts found',
  bodyFontSize: 'Text Size',
  bodyFontSizeTooltip: 'Font size for the body text',
  bodyLineHeight: 'Line Height',
  bodyLineHeightTooltip: 'Vertical spacing between lines of text',
  bodyColor: 'Text Color',
  bodyColorTooltip: 'Color of the body text',
  layout: 'Layout',
  layoutType: 'Layout Type',
  layoutTypeTooltip: 'Column layout mode for the content area',
  layoutSingle: 'Single Column',
  layoutDouble: 'Double Column',
  layoutOneAndHalf: 'Column and a Half',
  gutterWidth: 'Gutter Width',
  gutterWidthTooltip: 'Space between columns',
  sideColumnPercent: 'Side Column',
  sideColumnPercentTooltip: 'Width of the side column as a percentage of the content area',
  bold: 'Bold',
  italic: 'Italic',
  heading: 'Heading',
  link: 'Link',
  code: 'Code',
  blockquote: 'Blockquote',
  orderedList: 'Ordered List',
  unorderedList: 'Unordered List',
  save: 'Save',
  load: 'Load',
  exportFile: 'Export',
  importFile: 'Import',
  reset: 'Reset',
  resetConfigConfirm: 'Reset all configuration to defaults?',
  resetSectionConfirm: 'Reset this section to defaults?',
  resetMarkdownConfirm: 'Replace content with the default example?',
};
