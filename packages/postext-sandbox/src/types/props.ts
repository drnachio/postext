import type { PostextConfig } from 'postext';
import type { ReactNode } from 'react';
import type { SandboxLabels } from './labels';

export type PanelId = 'markdown' | 'config' | 'resources' | 'warnings';
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
