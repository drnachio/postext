'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Download } from 'lucide-react';
import type { PostextConfig, VDTDocument } from 'postext';
import { pickState, renderToScorm, scormLeaves, scormOrganization, scormTree, treeLeaves, type ScormTreeNode, type ScormWarning } from 'postext-scorm';
import { useBookPlan, useSandboxDispatch, useSandboxSelector, useSandboxStateGetter } from '../context/SandboxContext.js';
import { composeBookMemo } from '../book/compose.js';
import { layOutBookPrint } from '../book/printChain.js';
import { ensureConfigFontsLoaded } from '../controls/fonts/fontLoader.js';
import { withHyphenationLocale } from '../controls/language/hyphenation.js';
import { collectEpubFonts, epubResourceBytes, epubSvgFonts } from '../epub/inputs.js';
import { epubMetadataOf, type EpubBookIdentity } from '../epub/metadata.js';
import { downloadBytes, loadScormLeftOut, saveScormLeftOut } from '../storage/persistence.js';
import type { ScormVersion } from '../types/index.js';
import { useLayoutWorker } from '../worker/useLayoutWorker.js';
import { announce } from '../ui/announcer.js';
import { Button, SegmentedControl, cn } from '../ui/index.js';
import { ProgressBar, progressText, type EpubGenerationProgress } from './epub/EpubPreview.js';
import { useViewerControls } from './viewerControls.js';

/** The file name of the download. */
export function scormFileName(title: string, version: ScormVersion): string {
  const base = title.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '');
  return `${base || 'book'}-scorm-${version === '2004' ? '2004' : '12'}.zip`;
}

/** What a warning of the writer is about. */
function noticeText(n: ScormWarning): string {
  switch (n.kind) {
    case 'missingImage': return n.fileId;
    case 'unsupported': return n.detail;
    case 'missingFont':
    case 'fontWithheld':
    case 'svgFontUnavailable': return n.family;
    case 'svgFontsTooLarge': return n.fileId;
  }
}

/** One row of the tree: a checkbox that may stand mixed (`indeterminate`
 *  is a DOM property only). */
function PickBox({ state, label, onToggle }: { state: 'all' | 'some' | 'none'; label: string; onToggle: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'some';
  }, [state]);
  return (
    <label className="flex min-h-[28px] min-w-0 flex-1 cursor-pointer items-center gap-2 pt-large:min-h-[44px]">
      <input
        ref={ref}
        type="checkbox"
        className="h-4 w-4 shrink-0 cursor-pointer accent-(--brand)"
        checked={state === 'all'}
        aria-checked={state === 'some' ? 'mixed' : state === 'all'}
        onChange={onToggle}
      />
      <span className="min-w-0 truncate">{label}</span>
    </label>
  );
}

/** The SCORM tab (#1266): the book's spine as a tree of chapters and their
 *  headings (to the third level) to tick, the content form (in the bar,
 *  as on the EPUB tab) and the SCORM version, and a button that lays the
 *  book out and downloads the package of what is ticked. Each node ticked
 *  whole is one SCO; a chapter ticked in part groups its ticked sections.
 *  What is left out is kept per book. */
export function ScormViewport() {
  const chapters = useSandboxSelector((s) => s.chapters);
  const plan = useBookPlan();
  const config = useSandboxSelector((s) => s.config);
  const resources = useSandboxSelector((s) => s.resources);
  const locale = useSandboxSelector((s) => s.locale);
  const layout = useSandboxSelector((s) => s.scormLayout);
  const version = useSandboxSelector((s) => s.scormVersion);
  const labels = useSandboxSelector((s) => s.labels);
  const bookKey = useSandboxSelector((s) => s.activeProjectId ?? `preset:${s.activePresetId}`);
  const dispatch = useSandboxDispatch();
  const getState = useSandboxStateGetter();
  const layoutWorker = useLayoutWorker('pdf');

  const effectiveConfig = useMemo((): PostextConfig => withHyphenationLocale(config, locale), [config, locale]);
  const tree = useMemo(() => scormTree(chapters.map((c) => ({ markdown: c.markdown, title: c.title })), effectiveConfig), [chapters, effectiveConfig]);
  const [leftOut, setLeftOut] = useState<Set<string>>(() => new Set(loadScormLeftOut(bookKey)));
  useEffect(() => { setLeftOut(new Set(loadScormLeftOut(bookKey))); }, [bookKey]);
  const leaves = useMemo(() => tree.flatMap(treeLeaves), [tree]);
  const picked = useMemo(() => new Set(leaves.map((l) => l.id).filter((id) => !leftOut.has(id))), [leaves, leftOut]);
  const items = useMemo(() => scormOrganization(tree, picked), [tree, picked]);
  const scoCount = useMemo(() => scormLeaves(items).length, [items]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const setPick = useCallback((ids: readonly string[], on: boolean) => {
    setLeftOut((prev) => {
      const next = new Set(prev);
      for (const id of ids) if (on) next.delete(id); else next.add(id);
      saveScormLeftOut(bookKey, [...next]);
      return next;
    });
  }, [bookKey]);
  const toggle = useCallback((node: ScormTreeNode) => {
    setPick(treeLeaves(node).map((l) => l.id), pickState(node, picked) !== 'all');
  }, [picked, setPick]);

  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<EpubGenerationProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notices, setNotices] = useState<ScormWarning[]>([]);
  const lastRef = useRef<{ bytes: Uint8Array; name: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  /** Lays the book out and writes the package; resolves with it. */
  const write = useCallback(async (): Promise<{ bytes: Uint8Array; name: string } | null> => {
    if (items.length === 0) return null;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;
    setGenerating(true);
    setError(null);
    setProgress({ phase: 'layout', done: 0, total: plan.chapters.length });
    const found: ScormWarning[] = [];
    try {
      await ensureConfigFontsLoaded(effectiveConfig, chapters.map((c) => c.markdown));
      signal.throwIfAborted();
      // The whole book: numbering and references run on from the chapters
      // before the ones exported.
      const docs: VDTDocument[] = await layOutBookPrint({
        plan, chapters, resources, config: effectiveConfig, build: layoutWorker.build,
        onChapter: (index, count) => setProgress({ phase: 'layout', done: index, total: count }),
      });
      signal.throwIfAborted();
      setProgress({ phase: 'inputs', done: 0, total: 1 });
      const state = getState();
      const project = state.activeProjectId ? state.projects.find((p) => p.id === state.activeProjectId) : undefined;
      const preset = project ? undefined : state.presetSummaries.find((p) => p.id === state.activePresetId);
      const identity: EpubBookIdentity | null = project
        ? { kind: 'project', id: project.id, name: project.name }
        : preset ? { kind: 'preset', id: preset.id, locale: state.presetApplied?.locale ?? state.locale, name: preset.name } : null;
      const metadata = epubMetadataOf(composeBookMemo(chapters).metadata, effectiveConfig, identity, locale);
      const { fonts } = await collectEpubFonts(effectiveConfig, docs, chapters.map((c) => c.markdown));
      signal.throwIfAborted();
      const bytes = await renderToScorm(docs, {
        version, layout, items, metadata, fonts,
        resourceBytes: epubResourceBytes(),
        svgFonts: epubSvgFonts(),
        onProgress: (p) => setProgress({ phase: p.phase, done: p.done, total: p.total }),
        onWarning: (w) => found.push(w),
        signal,
      });
      signal.throwIfAborted();
      const file = { bytes, name: scormFileName(metadata.title, version) };
      lastRef.current = file;
      setNotices(found);
      announce(labels.scormReady);
      return file;
    } catch (err) {
      if (signal.aborted) return null;
      console.error('[ScormViewport] Generation error:', err);
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      announce(`${labels.scormError}: ${message}`);
      return null;
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setGenerating(false);
        setProgress(null);
      }
    }
  }, [items, plan, chapters, resources, effectiveConfig, layoutWorker, getState, locale, version, layout, labels.scormReady, labels.scormError]);

  const download = useCallback(async () => {
    const file = await write();
    if (file) downloadBytes(file.bytes, file.name, 'application/zip');
  }, [write]);

  useViewerControls('scorm', {
    status: () => ({
      generating,
      error,
      progress: generating && progress ? (progress.total > 0 ? progress.done / progress.total : 0) : null,
      phase: generating ? progress?.phase ?? null : null,
      fileSize: lastRef.current?.bytes.byteLength ?? null,
      contents: tree.flatMap(function rows(node: ScormTreeNode): { title: string; href: string; depth: number; picked?: 'all' | 'some' | 'none' }[] {
        return [{ title: node.title, href: node.id, depth: node.level === 0 ? 0 : node.level - 1, picked: pickState(node, picked) }, ...node.children.flatMap(rows)];
      }),
      notices: generating ? [] : notices,
    }),
    set: (settings) => {
      if (settings.scormPick) {
        // A node named stands for its leaves.
        const nodes = new Map(tree.flatMap(function all(n: ScormTreeNode): [string, ScormTreeNode][] { return [[n.id, n], ...n.children.flatMap(all)]; }));
        const on = new Set(settings.scormPick.flatMap((id) => { const n = nodes.get(id); return n ? treeLeaves(n).map((l) => l.id) : []; }));
        setPick(leaves.map((l) => l.id).filter((id) => !on.has(id)), false);
        setPick([...on], true);
      }
    },
    regenerate: async () => { await write(); },
    file: () => (lastRef.current ? { ...lastRef.current, mime: 'application/zip' } : null),
    download: () => { void download(); },
  });

  const versionHint = version === '2004' ? labels.scormVersion2004Hint : labels.scormVersion12Hint;
  const row = (node: ScormTreeNode) => {
    const open = !collapsed.has(node.id);
    const state = pickState(node, picked);
    return (
      <li key={node.id} role="treeitem" aria-selected={state === 'all'} aria-expanded={node.children.length > 0 ? open : undefined}>
        <div className="flex items-center gap-1" style={{ paddingInlineStart: node.level === 0 ? 0 : (node.level - 1) * 20 + 22 }}>
          {node.level === 0 && (node.children.length > 0 ? (
            <button
              type="button"
              className="inline-flex h-[20px] w-[20px] shrink-0 cursor-pointer items-center justify-center rounded text-(--slate) hover:text-(--foreground) pt-large:h-[44px] pt-large:w-[44px] rtl:[&_svg]:-scale-x-100"
              aria-label={labels.scormSections.replace('__title__', node.title)}
              aria-expanded={open}
              onClick={() => setCollapsed((prev) => {
                const next = new Set(prev);
                if (open) next.add(node.id); else next.delete(node.id);
                return next;
              })}
            >
              {open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
            </button>
          ) : <span className="inline-block w-[20px] shrink-0 pt-large:w-[44px]" />)}
          <PickBox state={state} label={node.title} onToggle={() => toggle(node)} />
        </div>
        {node.children.length > 0 && open && <ul role="group">{node.children.map(row)}</ul>}
      </li>
    );
  };

  return (
    <div className="h-full w-full overflow-auto" style={{ backgroundColor: 'var(--surface)' }}>
      <div className="mx-auto flex max-w-[720px] flex-col gap-4 p-4 text-[12px] text-(--foreground) pt-large:text-[14px]">
        <div className="flex flex-col gap-1">
          <h2 className="text-[14px] font-semibold pt-large:text-[16px]">{labels.scormHeading}</h2>
          <p className="text-(--slate)">{labels.scormIntro}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl<ScormVersion>
            value={version}
            onValueChange={(next) => dispatch({ type: 'SET_SCORM_VERSION', payload: next })}
            ariaLabel={labels.scormVersion}
            size="sm"
            options={[
              { value: '1.2', label: 'SCORM 1.2', title: labels.scormVersion12Hint },
              { value: '2004', label: 'SCORM 2004', title: labels.scormVersion2004Hint },
            ]}
          />
          <span className="min-w-0 flex-1 text-(--slate)">{versionHint}</span>
        </div>
        <div className="rounded border border-(--rule) bg-(--background) p-2">
          <div className="mb-1 flex items-center gap-2 border-b border-(--rule) pb-1">
            <span className="flex-1 font-medium">{labels.scormTree}</span>
            <Button size="xs" variant="ghost" onClick={() => setPick(leaves.map((l) => l.id), true)}>{labels.scormAll}</Button>
            <Button size="xs" variant="ghost" onClick={() => setPick(leaves.map((l) => l.id), false)}>{labels.scormNone}</Button>
          </div>
          <ul role="tree" aria-label={labels.scormTree} aria-multiselectable="true">{tree.map(row)}</ul>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            variant="primary"
            icon={<Download size={13} />}
            disabled={generating || items.length === 0}
            onClick={() => { void download(); }}
          >
            {labels.scormDownload}
          </Button>
          <span className={cn('text-(--slate)', items.length === 0 && 'text-(--foreground)')} aria-live="polite">
            {items.length === 0 ? labels.scormNothing : labels.scormSummary.replace('__n__', String(scoCount))}
          </span>
        </div>
        {generating && (
          <div className="flex flex-col items-start gap-2" role="status">
            <span className="text-(--slate)">{progressText(progress, labels)}</span>
            <ProgressBar progress={progress} label={labels.scormGenerating} />
          </div>
        )}
        {error && !generating && (
          <p role="alert" className="text-(--foreground)"><strong>{labels.scormError}:</strong> {error}</p>
        )}
        {notices.length > 0 && !generating && (
          <ul className="list-disc ps-5 text-(--slate)">
            {notices.map((n, i) => (
              <li key={i}>{noticeText(n)}</li>
            ))}
          </ul>
        )}
        <p className="text-(--slate)">{labels.scormLms}</p>
      </div>
    </div>
  );
}
