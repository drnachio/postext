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
  cutLinesBleed: string;
  cutLinesBleedTooltip: string;
  cutLinesMarkLength: string;
  cutLinesMarkLengthTooltip: string;
  cutLinesMarkOffset: string;
  cutLinesMarkOffsetTooltip: string;
  cutLinesMarkWidth: string;
  cutLinesMarkWidthTooltip: string;
  cutLinesColor: string;
  cutLinesColorTooltip: string;
  baselineGrid: string;
  baselineGridTooltip: string;
  baselineGridColor: string;
  baselineGridColorTooltip: string;
  baselineGridLineWidth: string;
  baselineGridLineWidthTooltip: string;

  // Debug section
  debug: string;
  debugCursorSync: string;
  debugCursorSyncTooltip: string;
  debugCursorSyncColor: string;
  debugCursorSyncColorTooltip: string;
  debugSelectionSync: string;
  debugSelectionSyncTooltip: string;
  debugSelectionSyncColor: string;
  debugSelectionSyncColorTooltip: string;

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
  bodyTextAlign: string;
  bodyTextAlignTooltip: string;
  bodyTextAlignLeft: string;
  bodyTextAlignJustify: string;
  bodyHyphenation: string;
  bodyHyphenationTooltip: string;
  bodyFontWeight: string;
  bodyFontWeightTooltip: string;
  bodyBoldFontWeight: string;
  bodyBoldFontWeightTooltip: string;
  bodyHyphenationLocale: string;
  bodyHyphenationLocaleTooltip: string;
  bodyFirstLineIndent: string;
  bodyFirstLineIndentTooltip: string;
  bodyHangingIndent: string;
  bodyHangingIndentTooltip: string;

  // Headings section
  headings: string;
  headingsFont: string;
  headingsFontTooltip: string;
  headingsFontSearch: string;
  headingsFontNoResults: string;
  headingsLineHeight: string;
  headingsLineHeightTooltip: string;
  headingsColor: string;
  headingsColorTooltip: string;
  headingLevel: string;
  headingFontSize: string;
  headingFontSizeTooltip: string;
  headingLineHeight: string;
  headingLineHeightTooltip: string;
  headingFont: string;
  headingFontTooltip: string;
  headingFontSearch: string;
  headingFontNoResults: string;
  headingColor: string;
  headingColorTooltip: string;
  headingsFontWeight: string;
  headingsFontWeightTooltip: string;
  headingsMarginTop: string;
  headingsMarginTopTooltip: string;
  headingsMarginBottom: string;
  headingsMarginBottomTooltip: string;
  headingsTextAlign: string;
  headingsTextAlignTooltip: string;
  headingsTextAlignLeft: string;
  headingsTextAlignJustify: string;
  headingFontWeight: string;
  headingFontWeightTooltip: string;
  headingMarginTop: string;
  headingMarginTopTooltip: string;
  headingMarginBottom: string;
  headingMarginBottomTooltip: string;
  headingNumberingTemplate: string;
  headingNumberingTemplateTooltip: string;
  headingNumberingTemplatePlaceholder: string;
  headingItalic: string;
  headingItalicTooltip: string;

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
  columnRule: string;
  columnRuleTooltip: string;
  columnRuleColor: string;
  columnRuleColorTooltip: string;
  columnRuleLineWidth: string;
  columnRuleLineWidthTooltip: string;

  // Canvas viewport toolbar
  zoomIn: string;
  zoomOut: string;
  fitWidth: string;
  fitHeight: string;
  singlePage: string;
  doublePageSpread: string;
  canvasToolbar: string;

  // Toolbar actions
  bold: string;
  italic: string;
  heading: string;
  link: string;
  code: string;
  blockquote: string;
  orderedList: string;
  unorderedList: string;
  undo: string;
  redo: string;

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
  locale?: string;
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
  cutLinesBleed: 'Bleed',
  cutLinesBleedTooltip: 'Extra area beyond the trim edge — backgrounds extend into this zone to prevent white edges after cutting',
  cutLinesMarkLength: 'Mark Length',
  cutLinesMarkLengthTooltip: 'Length of each crop mark line',
  cutLinesMarkOffset: 'Mark Offset',
  cutLinesMarkOffsetTooltip: 'Gap between the trim edge and the start of the crop mark',
  cutLinesMarkWidth: 'Mark Width',
  cutLinesMarkWidthTooltip: 'Stroke thickness of the crop mark lines',
  cutLinesColor: 'Mark Color',
  cutLinesColorTooltip: 'Color of the crop mark lines',
  baselineGrid: 'Baseline Grid',
  baselineGridTooltip: 'Show horizontal lines to align text baselines',
  baselineGridColor: 'Grid Color',
  baselineGridColorTooltip: 'Color of the baseline grid lines',
  baselineGridLineWidth: 'Line Width',
  baselineGridLineWidthTooltip: 'Thickness of the baseline grid lines',
  debug: 'Debug',
  debugCursorSync: 'Sync Cursor',
  debugCursorSyncTooltip: 'Show the editor cursor position live on the canvas preview',
  debugCursorSyncColor: 'Cursor Color',
  debugCursorSyncColorTooltip: 'Color of the cursor indicator drawn over the canvas',
  debugSelectionSync: 'Sync Selection',
  debugSelectionSyncTooltip: 'Highlight the editor text selection live on the canvas preview',
  debugSelectionSyncColor: 'Selection Color',
  debugSelectionSyncColorTooltip: 'Fill color of the selection highlight drawn over the canvas',
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
  bodyTextAlign: 'Text Alignment',
  bodyTextAlignTooltip: 'Horizontal alignment of body text paragraphs',
  bodyTextAlignLeft: 'Ragged Right',
  bodyTextAlignJustify: 'Justified',
  bodyHyphenation: 'Hyphenation',
  bodyHyphenationTooltip: 'Enable automatic hyphenation for justified text',
  bodyFontWeight: 'Font Weight',
  bodyFontWeightTooltip: 'Weight for normal body text (100-900)',
  bodyBoldFontWeight: 'Bold Weight',
  bodyBoldFontWeightTooltip: 'Weight for bold text in body paragraphs (100-900)',
  bodyHyphenationLocale: 'Language',
  bodyHyphenationLocaleTooltip: 'Language used for hyphenation rules',
  bodyFirstLineIndent: 'First Line Indent',
  bodyFirstLineIndentTooltip: 'Indent applied to the first line of each paragraph',
  bodyHangingIndent: 'Hanging Indent',
  bodyHangingIndentTooltip: 'When enabled, all lines except the first are indented (French indent)',
  headings: 'Headings',
  headingsFont: 'Font',
  headingsFontTooltip: 'Default font family for all headings',
  headingsFontSearch: 'Search fonts...',
  headingsFontNoResults: 'No fonts found',
  headingsLineHeight: 'Line Height',
  headingsLineHeightTooltip: 'Default line height for all headings',
  headingsColor: 'Color',
  headingsColorTooltip: 'Default color for all headings',
  headingLevel: 'H',
  headingFontSize: 'Size',
  headingFontSizeTooltip: 'Font size for this heading level',
  headingLineHeight: 'Line Height',
  headingLineHeightTooltip: 'Override line height for this heading level',
  headingFont: 'Font',
  headingFontTooltip: 'Override font for this heading level',
  headingFontSearch: 'Search fonts...',
  headingFontNoResults: 'No fonts found',
  headingColor: 'Color',
  headingColorTooltip: 'Override color for this heading level',
  headingsFontWeight: 'Font Weight',
  headingsFontWeightTooltip: 'Default font weight for all headings (100-900)',
  headingsMarginTop: 'Margin Top',
  headingsMarginTopTooltip: 'Default space above headings (skipped at top of column)',
  headingsMarginBottom: 'Margin Bottom',
  headingsMarginBottomTooltip: 'Default minimum space below headings',
  headingsTextAlign: 'Text Alignment',
  headingsTextAlignTooltip: 'Horizontal alignment of headings',
  headingsTextAlignLeft: 'Ragged Right',
  headingsTextAlignJustify: 'Justified',
  headingFontWeight: 'Weight',
  headingFontWeightTooltip: 'Override font weight for this heading level',
  headingMarginTop: 'Margin Top',
  headingMarginTopTooltip: 'Space above this heading level (skipped at top of column)',
  headingMarginBottom: 'Margin Bottom',
  headingMarginBottomTooltip: 'Minimum space below this heading level',
  headingNumberingTemplate: 'Numbering',
  headingNumberingTemplateTooltip: 'Template for this level\'s number prefix. Use {N} for the counter at level N, {N:style} to pick a numeral style (1, 01, A, a, I, i). Examples: "{1}.", "{1}.{2}", "{2:A}.{3}". Empty = no numbering.',
  headingNumberingTemplatePlaceholder: 'e.g. {1}.{2}',
  headingItalic: 'Italic',
  headingItalicTooltip: 'Render this heading level in italic style',
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
  columnRule: 'Column Rule',
  columnRuleTooltip: 'Show a vertical line between columns',
  columnRuleColor: 'Rule Color',
  columnRuleColorTooltip: 'Color of the column rule line',
  columnRuleLineWidth: 'Rule Width',
  columnRuleLineWidthTooltip: 'Thickness of the column rule line',
  zoomIn: 'Zoom In',
  zoomOut: 'Zoom Out',
  fitWidth: 'Fit to Page Width',
  fitHeight: 'Fit to Page Height',
  singlePage: 'Single Page',
  doublePageSpread: 'Double-Page Spread',
  canvasToolbar: 'Canvas toolbar',
  bold: 'Bold',
  italic: 'Italic',
  heading: 'Heading',
  link: 'Link',
  code: 'Code',
  blockquote: 'Blockquote',
  orderedList: 'Ordered List',
  unorderedList: 'Unordered List',
  undo: 'Undo',
  redo: 'Redo',
  save: 'Save',
  load: 'Load',
  exportFile: 'Export',
  importFile: 'Import',
  reset: 'Reset',
  resetConfigConfirm: 'Reset all configuration to defaults?',
  resetSectionConfirm: 'Reset this section to defaults?',
  resetMarkdownConfirm: 'Replace content with the default example?',
};
