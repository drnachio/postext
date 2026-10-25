import type { PostextConfig } from 'postext';
import type { ReactNode } from 'react';
import type { SandboxLabels } from './labels.js';
import type { PresetSourceSpec } from '../presets/types.js';

export type PanelId = 'projects' | 'chapters' | 'markdown' | 'config' | 'resources' | 'fonts' | 'warnings';
/** The preview tabs, in the order the bar shows them: Canvas, PDF, Folio,
 *  HTML, EPUB 3 and SCORM. */
export type ViewportTab = 'canvas' | 'pdf' | 'folio' | 'html' | 'epub' | 'scorm';
/** The two EPUB 3 renditions the EPUB tab builds (the `rendition:layout`
 *  values as `postext-epub` names them): the printed pages kept page for
 *  page, or the text reflowing to the reader's screen. */
export type EpubLayout = 'fixed' | 'reflowable';
/** The SCORM data model the SCORM tab's package speaks (#1266). */
export type ScormVersion = '1.2' | '2004';

/** Resolves a book a link names by a host key (`#recipe=ID&lang=L`) to the
 *  same-origin URL of its `.postext` bundle — or to several, tried in order
 *  (the first that answers wins: a book with one language only, say) — or
 *  to null when the id is not one the host serves. */
export type HashBundleResolver = (id: string, lang: string | null) => string | readonly string[] | null;

/** The languages a linked book (`hashBundles`) is published in, each a
 *  bundle of its own that the same link opens with `lang=`; null when
 *  unknown. */
export type HashBundleEditions = (id: string) => readonly string[] | null | Promise<readonly string[] | null>;

export interface PostextSandboxProps {
  initialMarkdown?: string;
  initialConfig?: PostextConfig;
  className?: string;
  labels?: Partial<SandboxLabels>;
  locale?: string;
  /** Remote preset sources (base URLs serving `index.json`), tried in order
   *  after the built-in preset. */
  presetSources?: PresetSourceSpec[];
  /** Where the print output profiles are fetched from (`<base>/<id>.icc`,
   *  the files of postext's `icc/` folder). Defaults to the npm CDN copy. */
  outputProfileBaseUrl?: string;
  /** Books the host links to by a fragment key of its own, e.g.
   *  `{ recipe: (slug, lang) => \`/cookbook/${slug}/${lang}/${slug}.postext\` }`
   *  for `#recipe=<slug>&lang=es`. The bundle is fetched (same origin only)
   *  and imported as a project the first time; later visits of the same
   *  link open that project, edits included. The fragment is then
   *  rewritten to `#project=<id>`. */
  hashBundles?: Record<string, HashBundleResolver>;
  /** The languages each kind of linked book is published in, by the same
   *  keys as `hashBundles`: a book opened by such a link shows them in the
   *  Canvas's language switcher and side by side (#1011), e.g. a Cookbook
   *  recipe captured in several languages. */
  hashBundleEditions?: Record<string, HashBundleEditions>;
  onConfigChange?: (config: PostextConfig) => void;
  onMarkdownChange?: (markdown: string) => void;
  /** Hand an agent in the browser the Sandbox's own tools through WebMCP
   *  (`document.modelContext`): read and edit the book, change its design,
   *  get any page as a picture, turn pages, switch viewer, export. On by
   *  default; nothing is registered where the browser has no WebMCP, bar
   *  the same tools on `window.postextWebMcp` for an agent that runs
   *  script in the page. */
  webmcp?: boolean;
  themeToggle?: ReactNode;
  languageSwitcher?: ReactNode;
  homeUrl?: string;
  homeLink?: ReactNode;
}
