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

  // Config panel sections
  columns: string;
  gutter: string;
  columnBalancing: string;
  typography: string;
  orphans: string;
  widows: string;
  hyphenation: string;
  ragOptimization: string;
  references: string;
  footnotes: string;
  footnotePlacement: string;
  footnoteMarker: string;
  figureNumbering: string;
  tableNumbering: string;
  marginNotes: string;
  resourcePlacement: string;
  defaultStrategy: string;
  deferPlacement: string;
  preserveAspectRatio: string;
  renderer: string;

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
  columns: 'Columns',
  gutter: 'Gutter',
  columnBalancing: 'Column Balancing',
  typography: 'Typography',
  orphans: 'Orphans',
  widows: 'Widows',
  hyphenation: 'Hyphenation',
  ragOptimization: 'Rag Optimization',
  references: 'References',
  footnotes: 'Footnotes',
  footnotePlacement: 'Placement',
  footnoteMarker: 'Marker',
  figureNumbering: 'Figure Numbering',
  tableNumbering: 'Table Numbering',
  marginNotes: 'Margin Notes',
  resourcePlacement: 'Resource Placement',
  defaultStrategy: 'Default Strategy',
  deferPlacement: 'Defer Placement',
  preserveAspectRatio: 'Preserve Aspect Ratio',
  renderer: 'Renderer',
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
};
