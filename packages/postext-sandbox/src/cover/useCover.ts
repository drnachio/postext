'use client';

// The book's cover in the Sandbox (#1669): built by the engine from the
// book's production version, laid out on the layout worker as any chapter
// is, its fonts and pictures readied for the canvas. The Cover panel, its
// stage, the EPUB tab and the tools read it from here.

import { useEffect, useMemo, useState } from 'react';
import type { PostextConfig, VDTDocument } from 'postext';
import { buildCover, type BuildCoverIssue, type BuiltCover, type CoverSheetKind } from 'postext/production';
import { useBookPlan, useSandboxSelector } from '../context/SandboxContext.js';
import { ensureConfigFontsLoaded } from '../controls/fonts/fontLoader.js';
import { withHyphenationLocale } from '../controls/language/hyphenation.js';
import { ensureResourceImages } from '../controls/media/resourceImages.js';
import { useLayoutWorker } from '../worker/useLayoutWorker.js';
import { coverBuildInput, pickVersion } from './coverInput.js';
import { registerCoverFiles } from './coverFiles.js';

export type CoverStatus = 'none' | 'building' | 'ready' | 'error';

export interface CoverState {
  status: CoverStatus;
  /** The version shown (the book's first when none is chosen). */
  versionId?: string;
  built?: BuiltCover;
  doc?: VDTDocument;
  issues: readonly BuildCoverIssue[];
  error?: string;
  /** Bumped when the canvas has new pictures to paint. */
  paintKey: number;
}

const NO_ISSUES: readonly BuildCoverIssue[] = [];

/** The book's config as the engine lays it out in this language. */
export function useCoverConfig(): PostextConfig {
  const config = useSandboxSelector((s) => s.config);
  const locale = useSandboxSelector((s) => s.locale);
  return useMemo(() => withHyphenationLocale(config, locale), [config, locale]);
}

/** The engine's cover of a version and sheet: what `buildCover` returns,
 *  or its issues when it cannot build one. */
export function useBuiltCover(versionId: string | null, sheet: CoverSheetKind): BuiltCover | { issues: BuildCoverIssue[] } | null {
  const config = useCoverConfig();
  const chapters = useSandboxSelector((s) => s.chapters);
  const resources = useSandboxSelector((s) => s.resources);
  const coverMarkdown = useSandboxSelector((s) => s.coverMarkdown);
  const { bookPages } = useBookPlan();
  return useMemo(() => {
    const version = pickVersion(config, versionId);
    if (!version) return null;
    return buildCover(coverBuildInput({ config, chapters, resources, coverMarkdown, bookPages }, version, sheet));
  }, [config, chapters, resources, coverMarkdown, bookPages, versionId, sheet]);
}

/** The cover laid out: rebuilt a moment after the book changes, the last
 *  build winning. */
export function useCover(versionId: string | null, sheet: CoverSheetKind = 'cover'): CoverState {
  const built = useBuiltCover(versionId, sheet);
  const resources = useSandboxSelector((s) => s.resources);
  const { build } = useLayoutWorker('preview');
  const [state, setState] = useState<CoverState>({ status: 'none', issues: NO_ISSUES, paintKey: 0 });

  useEffect(() => {
    if (!built) {
      setState((s) => ({ status: 'none', issues: NO_ISSUES, paintKey: s.paintKey }));
      return;
    }
    if (!('config' in built)) {
      setState((s) => ({ status: 'error', issues: built.issues, paintKey: s.paintKey }));
      return;
    }
    let live = true;
    setState((s) => ({ ...s, status: 'building', built, issues: built.issues }));
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const content = built.content;
          await ensureConfigFontsLoaded(built.config, content.markdown);
          const own = new Set(Object.keys(built.files));
          const book = (content.resources ?? resources).filter((r) => {
            const file = r.kind === 'bitmap' ? r.bitmap?.fileId : r.kind === 'svg' ? r.svg?.fileId : undefined;
            return !file || !own.has(file);
          });
          await Promise.all([registerCoverFiles(built.files), ensureResourceImages(book)]);
          const doc = await build(content, built.config);
          if (!live) return;
          const versionId = built.sheets.version;
          setState((s) => ({ status: 'ready', versionId, built, doc, issues: built.issues, paintKey: s.paintKey + 1 }));
        } catch (err) {
          if (!live) return;
          setState((s) => ({ ...s, status: 'error', error: err instanceof Error ? err.message : String(err) }));
        }
      })();
    }, 150);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [built, resources, build]);

  return state;
}
