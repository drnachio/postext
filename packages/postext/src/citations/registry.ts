import type { CitationEngine } from './types';

let engine: CitationEngine | undefined;

/**
 * Register the citation engine the builds format citations with (the
 * `postext-citeproc` package registers itself: `import 'postext-citeproc/register'`).
 * Without one, citations print as written and the build warns
 * (`citationsUnavailable`).
 */
export function registerCitationEngine(next: CitationEngine | undefined): void {
  engine = next;
}

/** The registered citation engine, if any. */
export function citationEngine(): CitationEngine | undefined {
  return engine;
}

let loader: (() => Promise<unknown>) | undefined;
let loading: Promise<boolean> | undefined;

/**
 * How to load the citation engine when a document first needs it — a
 * dynamic import, so a host pays for it only on documents that cite:
 *
 * ```ts
 * setCitationEngineLoader(() => import('postext-citeproc/register'));
 * ```
 *
 * The layout worker calls it before building a document that cites works
 * (see {@link ensureCitationEngine}).
 */
export function setCitationEngineLoader(next: (() => Promise<unknown>) | undefined): void {
  loader = next;
  loading = undefined;
}

/** Load the citation engine with the registered loader, once; true when an
 *  engine is registered afterwards. */
export function ensureCitationEngine(): Promise<boolean> {
  if (engine) return Promise.resolve(true);
  if (!loader) return Promise.resolve(false);
  loading ??= loader().then(() => engine !== undefined, () => {
    loading = undefined;
    return false;
  });
  return loading;
}

/** Whether a document's markdown may cite works or define references: an
 *  `@`, a `:::references` block or a `references:` front matter field. A
 *  cheap test, before parsing, of whether the engine is worth loading. */
export function mayNeedCitations(markdown: string): boolean {
  return markdown.includes('@') || markdown.includes(':::references') || /^references\s*:/m.test(markdown);
}
