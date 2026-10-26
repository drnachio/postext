'use client';

import { useCallback, useMemo } from 'react';
import { resolvePageTemplate, type PageTemplate, type PostextConfig, type ResolvedPageTemplate, type VDTDocument } from 'postext';
import { useSandboxDispatch, useSandboxSelector } from '../../../../context/SandboxContext.js';
import { countTemplatePages } from '../../../../templates/templateUsage.js';
import { pxToMm } from '../../../../templates/frameGeometry.js';
import type { TemplateScope } from '../../../../templates/templateEdits.js';

const EMPTY: PageTemplate[] = [];
const EMPTY_CHAPTERS: { id: string; markdown: string }[] = [];

/** The book's page templates, how to write them, and how many pages of
 *  the book each one lays out. */
export function usePageTemplates() {
  const dispatch = useSandboxDispatch();
  const templates = useSandboxSelector((s) => s.config.pageTemplates) ?? EMPTY;
  const calloutStyles = useSandboxSelector((s) => s.config.calloutStyles);
  const chapters = useSandboxSelector((s) => s.chapters) ?? EMPTY_CHAPTERS;
  const write = useCallback(
    (next: readonly PageTemplate[]) => dispatch({ type: 'UPDATE_CONFIG', payload: { pageTemplates: next.length > 0 ? [...next] : undefined } }),
    [dispatch],
  );
  const counts = useMemo(() => countTemplatePages(chapters, new Set(templates.filter((t) => t.spread).map((t) => t.id))), [chapters, templates]);
  return { templates, calloutStyles, write, counts, dispatch, chapters };
}

/** Template `id` resolved for a scope (a variant: that side). */
export function resolveAt(config: Pick<PostextConfig, 'pageTemplates' | 'calloutStyles'>, id: string, scope: TemplateScope): ResolvedPageTemplate | undefined {
  return resolvePageTemplate({ pageTemplates: config.pageTemplates }, id, scope === 'base' ? {} : { parity: scope });
}

/** The laid-out height (mm) of every frame of each template, from the
 *  first composed page of the document set with it: the sheet drawings
 *  then show an `'auto'` frame as tall as it came out. */
export function laidHeights(doc: VDTDocument | null): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  if (!doc) return out;
  const dpi = doc.config.page.dpi;
  for (const page of doc.pages) {
    const c = page.composed;
    if (!c || out.has(c.template)) continue;
    out.set(c.template, new Map(c.frames.map((f) => [f.name, pxToMm(f.rect.height, dpi)])));
  }
  return out;
}
