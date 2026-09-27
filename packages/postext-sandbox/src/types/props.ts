import type { PostextConfig } from 'postext';
import type { ReactNode } from 'react';
import type { SandboxLabels } from './labels';
import type { PresetSourceSpec } from '../presets/types';

export type PanelId = 'projects' | 'chapters' | 'markdown' | 'config' | 'resources' | 'fonts' | 'warnings';
export type ViewportTab = 'canvas' | 'html' | 'pdf';

/** Resolves a book a link names by a host key (`#recipe=ID&lang=L`) to the
 *  same-origin URL of its `.postext` bundle — or to several, tried in order
 *  (the first that answers wins: a book with one language only, say) — or
 *  to null when the id is not one the host serves. */
export type HashBundleResolver = (id: string, lang: string | null) => string | readonly string[] | null;

export interface PostextSandboxProps {
  initialMarkdown?: string;
  initialConfig?: PostextConfig;
  className?: string;
  labels?: Partial<SandboxLabels>;
  locale?: string;
  /** Remote preset sources (base URLs serving `index.json`), tried in order
   *  after the built-in preset. */
  presetSources?: PresetSourceSpec[];
  /** Books the host links to by a fragment key of its own, e.g.
   *  `{ recipe: (slug, lang) => \`/cookbook/${slug}/${lang}/${slug}.postext\` }`
   *  for `#recipe=<slug>&lang=es`. The bundle is fetched (same origin only)
   *  and imported as a project the first time; later visits of the same
   *  link open that project, edits included. The fragment is then
   *  rewritten to `#project=<id>`. */
  hashBundles?: Record<string, HashBundleResolver>;
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
