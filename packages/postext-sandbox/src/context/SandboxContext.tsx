'use client';

import { type ReactNode, useMemo, useRef, useReducer, useEffect } from 'react';
import { type PostextConfig, type Resource } from 'postext';
import { type SandboxLabels, DEFAULT_LABELS, type ViewportTab, type PanelId } from '../types/index.js';
import type { HashBundleResolver, HashBundleEditions } from '../types/props.js';
import { type ViewHash, readViewHash, hashAsksRestore, type HashBundleRef, parseHashBundle, EMPTY_VIEW_HASH, hashNamesOtherBook, isViewportTab } from '../storage/viewHash.js';
import { loadBook, loadStoredConfig, loadViewport, loadSidebarPercent, loadPanel, loadPresetApplied, savePresetApplied, loadPresetId, loadProjectId, loadEpubLayout, loadScormLayout, loadScormVersion, loadHiddenPresetIds, savePresetGeneral } from '../storage/persistence.js';
import { defaultEpubLayout } from '../epub/defaultLayout.js';
import { generateChapterId } from '../storage/projects.js';
import { effectiveCanvasScope } from '../book/scope.js';
import type { ChapterLayout } from '../book/types.js';
import { sampleBook, activeChapter } from '../book/chapterOps.js';
import { DEFAULT_MARKDOWN_EN } from '../defaultMarkdown/index.js';
import { withDefaultResourceTypes } from './defaultConfig.js';
import { createPostextGuideConfig } from './guideConfig.js';
import { type ProjectActions, createProjectActions } from './projectActions.js';
import { type SandboxHistory, createSandboxHistory, setActiveHistory } from '../history/sandboxHistory.js';
import { installHistoryKeys } from '../history/historyKeys.js';
import { presetCoverKey } from '../covers/autoCover.js';
import { putPresetCoverIfMissing, bytesToDataUrl } from '../storage/presetCovers.js';
import { type PresetSourceSpec, createPostextGuidePreset, rekeyMigratedConfig, BUILTIN_PRESET_ID } from '../presets/index.js';
import { type SandboxStore, SandboxStoreContext } from './SandboxContext/hooks.js';
import { sandboxReducer, usableViewport } from './SandboxContext/reducer.js';
import { useBookSwitch } from './SandboxContext/bookSwitch.js';
import { usePresetOpening } from './SandboxContext/presetOpening.js';
import { useMountLoad } from './SandboxContext/mountLoad.js';
import { usePresetWatch } from './SandboxContext/presetWatch.js';
import { useWorkingSave } from './SandboxContext/workingSave.js';
import { useLayoutsSave } from './SandboxContext/layoutsSave.js';
import { useFontsAndGc } from './SandboxContext/fontsAndGc.js';
import { useWarningsSource } from './SandboxContext/warningsSource.js';
import type { SandboxProviderLate } from './SandboxContext/providerState.js';

export type { EditorSelection, PendingEditorFocus, ResourceFocusTarget, PendingResourceFocus, ResourceSelection, SandboxState, SandboxAction } from './SandboxContext/state.js';
export { sandboxReducer } from './SandboxContext/reducer.js';
export { SandboxStoreContext, useSandbox, useSandboxStore, useSandboxDispatch, useSandboxSelector, useSandboxConfig, useSandboxLabels, useSandboxResources, useSandboxPresets, useSandboxStateGetter, useSandboxCoverSaver, useSandboxPresetStale, useSandboxProjects, useSandboxBundleReplacePrompt, useSandboxActiveProjectId, useSandboxBookActions, useSandboxLinkedBundles, useSandboxEditionActions, useSandboxPresetProvider, useSandboxDocRef, useSandboxEditorStateRef, useSandboxDocSourceRef, useSandboxChapterDocsRef, useSandboxWarnings, useBookContent, useBookPlan, useBookPages, useLayoutSource, useChapterPlan } from './SandboxContext/hooks.js';
export type { SandboxStore, SandboxContextValue, SandboxPresetsValue, SandboxProjectsValue, ChapterDocument, LayoutSource } from './SandboxContext/hooks.js';

export { createDefaultConfig } from './defaultConfig.js';
export type { ProjectSummary } from '../storage/projects.js';
export type { BookContent, Chapter, LayoutScope } from '../book/types.js';
export type { DuplicateSource } from './projectActions.js';

export const DEFAULT_MARKDOWN = DEFAULT_MARKDOWN_EN;

interface SandboxProviderProps {
  children: ReactNode;
  initialMarkdown?: string;
  initialConfig?: PostextConfig;
  labels?: Partial<SandboxLabels>;
  locale?: string;
  /** Remote preset sources (index.json base URLs), tried in order after the
   *  built-in preset. Defaults to none. */
  presetSources?: PresetSourceSpec[];
  /** Books linked by a host fragment key (see `PostextSandboxProps`). */
  hashBundles?: Record<string, HashBundleResolver>;
  /** The languages of those books (see `PostextSandboxProps`). */
  hashBundleEditions?: Record<string, HashBundleEditions>;
  onConfigChange?: (config: PostextConfig) => void;
  onMarkdownChange?: (markdown: string) => void;
}

const NO_SOURCES: PresetSourceSpec[] = [];

export function SandboxProvider({
  children,
  initialMarkdown,
  initialConfig,
  labels,
  locale,
  presetSources = NO_SOURCES,
  hashBundles,
  hashBundleEditions,
  onConfigChange,
  onMarkdownChange,
}: SandboxProviderProps) {
  const late = {} as SandboxProviderLate;
  // A host label that is missing (undefined — e.g. a message key the host's
  // running translation bundle does not have yet) keeps the default rather
  // than blanking the string.
  const mergedLabels: SandboxLabels = useMemo(() => {
    const merged: SandboxLabels = { ...DEFAULT_LABELS };
    if (labels) {
      for (const [key, value] of Object.entries(labels)) {
        if (value !== undefined) (merged as unknown as Record<string, unknown>)[key] = value;
      }
    }
    return merged;
  }, [labels]);

  const defaultMd = initialMarkdown ?? DEFAULT_MARKDOWN;

  // The built-in preset wraps the host's initial markdown/config so Reset
  // restores exactly what the host handed us. Built once per prop change;
  // the provider list below is refreshed on mount only.
  const builtinPreset = useMemo(
    () => createPostextGuidePreset({
      markdownOverride: initialMarkdown,
      configOverride: initialConfig,
      name: mergedLabels.presetPostextGuideName,
      description: mergedLabels.presetPostextGuideDescription,
    }),
    [initialMarkdown, initialConfig, mergedLabels.presetPostextGuideName, mergedLabels.presetPostextGuideDescription],
  );

  const migration = { ids: generateChapterId, untitled: (n: number) => mergedLabels.chapterUntitled.replace('__n__', String(n)) };
  // The permalink the page was opened with (see `viewHash.ts`), read once:
  // the mount seeding below opens the book it names, and the syncs may
  // rewrite the fragment before then.
  const initialHashRef = useRef<ViewHash | null>(null);
  if (initialHashRef.current === null) initialHashRef.current = readViewHash();
  // A homepage link (`restore=ask`) offers the original of a preset that
  // opens on a draft (see the mount seeding).
  const initialAsksRestoreRef = useRef<boolean | null>(null);
  if (initialAsksRestoreRef.current === null) {
    initialAsksRestoreRef.current = typeof window !== 'undefined' && hashAsksRestore(window.location.hash);
  }
  // Host bundle links (`#recipe=…`): the resolvers are read live, the keys
  // and the link the page was opened with once.
  const hashBundlesRef = useRef(hashBundles);
  hashBundlesRef.current = hashBundles;
  const hashBundleKeys = useMemo(() => Object.keys(hashBundles ?? {}), [hashBundles]);
  const hashBundleEditionsRef = useRef(hashBundleEditions);
  hashBundleEditionsRef.current = hashBundleEditions;
  const linkedEditionsRef = useRef(new Map<string, Promise<string[] | null>>());
  const initialBundleRef = useRef<HashBundleRef | null | undefined>(undefined);
  if (initialBundleRef.current === undefined) {
    initialBundleRef.current = typeof window === 'undefined' ? null : parseHashBundle(window.location.hash, hashBundleKeys);
  }
  const [state, reducerDispatch] = useReducer(sandboxReducer, undefined, () => {
    const savedBook = loadBook(migration);
    const loadedBook = savedBook ?? sampleBook(defaultMd, generateChapterId, mergedLabels.presetPostextGuideName);
    // A `#chapter=C` fragment (a reload, a shared link) names the chapter to
    // open; the viewers restore its page (see `useChapterHashSync`). The
    // `view=` part picks the viewer tab over the one last used.
    const initialHash = initialHashRef.current ?? EMPTY_VIEW_HASH;
    const hashChapter = initialHash.chapter;
    const hashChapterId = hashChapter === null ? undefined : loadedBook.chapters[hashChapter]?.id;
    const book = hashChapterId ? { ...loadedBook, activeChapterId: hashChapterId } : loadedBook;
    const storedConfig = loadStoredConfig();
    const savedViewport = loadViewport() as ViewportTab | null;
    const savedPercent = loadSidebarPercent();
    const savedPanel = loadPanel() as PanelId | null | undefined;
    const config = withDefaultResourceTypes(
      storedConfig?.config ?? initialConfig ?? createPostextGuideConfig(locale ?? 'en'),
      locale ?? 'en',
    );
    // A working copy saved under older rules comes back migrated (its heading
    // breaks and maths size pinned), while the applied preset's snapshot
    // hashed it as stored: re-key the snapshot, or an untouched book would
    // read as edited (Reload asking to discard, a changed preset marked
    // stale instead of applied).
    const savedSnapshot = loadPresetApplied();
    let presetApplied = savedSnapshot;
    if (savedSnapshot && storedConfig && storedConfig.config !== storedConfig.stored) {
      presetApplied = rekeyMigratedConfig(
        savedSnapshot,
        withDefaultResourceTypes(storedConfig.stored, locale ?? 'en'),
        config,
      );
      if (presetApplied !== savedSnapshot) savePresetApplied(presetApplied);
    }
    // A link to another book than the stored one: the stored book is not
    // shown, not even for a moment (see `booting`).
    const storedPresetId = loadPresetId() ?? BUILTIN_PRESET_ID;
    const booting = hashNamesOtherBook(initialHash, {
      projectId: loadProjectId(),
      presetId: storedPresetId,
      presetLocale: presetApplied?.presetId === storedPresetId ? presetApplied.locale ?? null : null,
    }, initialBundleRef.current ?? null);

    return {
      markdown: activeChapter(book).markdown,
      chapters: book.chapters,
      activeChapterId: book.activeChapterId,
      pdfScope: effectiveCanvasScope(book.canvasScope, book.chapters.length),
      canvasScope: effectiveCanvasScope(book.canvasScope, book.chapters.length),
      ...(book.start ? { bookStart: book.start } : {}),
      epubLayout: loadEpubLayout() ?? defaultEpubLayout(),
      scormLayout: loadScormLayout() ?? 'fixed',
      scormVersion: loadScormVersion() ?? '1.2',
      chapterLayouts: {},
      hiddenPresetIds: loadHiddenPresetIds(),
      config,
      configLayers: null,
      resources: [],
      storeReady: false,
      booting,
      bookLoading: false,
      presetDrafts: [],
      presetCovers: {},
      activePanel: savedPanel !== undefined ? savedPanel : ('markdown' as PanelId),
      sidebarPercent: savedPercent ?? 25,
      sidebarDragging: false,
      activeViewport: usableViewport(initialHash.view ?? (isViewportTab(savedViewport) ? savedViewport : 'canvas')),
      labels: mergedLabels,
      locale: locale ?? 'en',
      selection: { from: 0, to: 0, head: 0 },
      selectionFromViewer: false,
      editorFocused: false,
      pendingEditorFocus: null,
      activeResourceId: null,
      pendingResourceFocus: null,
      resourceSelection: null,
      docVersion: 0,
      bookVersion: 0,
      activePresetId: loadPresetId() ?? BUILTIN_PRESET_ID,
      presetStatus: 'idle' as const,
      presetConfig: undefined,
      presetSummaries: [builtinPreset.summary],
      presetApplied,
      presetStale: false,
      presetUpdatedAt: null,
      activeProjectId: loadProjectId(),
      projects: [],
      projectStatus: 'idle' as const,
      projectNotice: null,
      bundleReplacePrompt: null,
    };
  });

  // One undo history for the text and the configuration (#899): every
  // action passes through it on its way to the reducer.
  const historyRef = useRef<SandboxHistory | null>(null);
  if (historyRef.current === null) {
    historyRef.current = createSandboxHistory({
      dispatch: reducerDispatch,
      getState: () => stateRef.current,
      editorStates: () => editorStatesRef.current,
    });
  }
  const undoHistory = historyRef.current;
  const dispatch = undoHistory.dispatch;
  useEffect(() => {
    setActiveHistory(undoHistory);
    const uninstall = installHistoryKeys(undoHistory, () => stateRef.current);
    return () => {
      uninstall();
      setActiveHistory(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undoHistory]);

  // Skip redundant initial save — state already contains localStorage values
  const hydratedRef = useRef(false);

  useEffect(() => {
    hydratedRef.current = true;
  }, []);

  // Load resources asynchronously from IndexedDB on mount. They are not part
  // of the synchronous localStorage-hydrated state. `prevResourcesRef` tracks
  // the last-persisted snapshot so the persistence effect can diff upserts
  // and deletes without re-saving everything.
  const prevResourcesRef = useRef<Resource[]>([]);
  const resourcesLoadedRef = useRef(false);

  const {
    presetProvidersRef, builtinPresetRef, presetLoadSeqRef, projectsLoadedRef, gcSuspendedRef,
    gcTimerRef, switchingRef, liveDraftKeyRef, draftsRef, setDraftSummaries, upsertDraftSummary,
    removeDraftSummary, switchBookRef, applyDraft, runPresetRef
  } = useBookSwitch({
    builtinPreset, dispatch, late
  });

  const {
    openPresetRef, restorePresetOriginalRef, bundleReplaceAnswerRef, askBundleReplace,
    openLinkedBundleRef
  } = usePresetOpening({
    hashBundlesRef, dispatch, presetProvidersRef, builtinPresetRef, liveDraftKeyRef, draftsRef,
    removeDraftSummary, switchBookRef, applyDraft, runPresetRef, late
  });

  useMountLoad({
    locale, presetSources, defaultMd, migration, initialHashRef, initialAsksRestoreRef,
    hashBundlesRef, initialBundleRef, dispatch, prevResourcesRef, resourcesLoadedRef,
    presetProvidersRef, builtinPresetRef, projectsLoadedRef, liveDraftKeyRef, draftsRef,
    setDraftSummaries, runPresetRef, openPresetRef, restorePresetOriginalRef, askBundleReplace,
    openLinkedBundleRef, late
  });

  usePresetWatch({
    state, dispatch, prevResourcesRef, resourcesLoadedRef, presetProvidersRef, runPresetRef, late
  });

  const {
    persistWorkingRef, saverRef, flushWorkingSaveRef, discardWorkingSaveRef
  } = useWorkingSave({
    state, hydratedRef, switchingRef, liveDraftKeyRef, upsertDraftSummary, removeDraftSummary, late
  });
  Object.assign(late, { persistWorkingRef, saverRef });

  useLayoutsSave({
    state, undoHistory, dispatch, hydratedRef, late
  });

  const {
    scheduleGc, scheduleGcRef
  } = useFontsAndGc({
    onConfigChange, onMarkdownChange, state, hydratedRef, resourcesLoadedRef, projectsLoadedRef,
    gcSuspendedRef, gcTimerRef, late
  });
  Object.assign(late, { scheduleGc });

  const {
    editorStatesRef, docRef, docSourceRef, chapterDocsRef, getWarningsRef, getPlan, getPlanRef,
    stateRef, listenersRef, warningsRef
  } = useWarningsSource({
    state
  });
  Object.assign(late, { editorStatesRef, stateRef });

  const projectActions = useMemo<ProjectActions>(() => createProjectActions({
    dispatch,
    getState: () => stateRef.current,
    getProviders: () => presetProvidersRef.current,
    getBuiltin: () => builtinPresetRef.current,
    runPreset: (provider, parts) => runPresetRef.current(provider, parts),
    openPreset: (id) => openPresetRef.current(id),
    switchBook: (fn) => switchBookRef.current(fn),
    cancelPresetLoads: () => { presetLoadSeqRef.current++; },
    flushWorkingSave: () => flushWorkingSaveRef.current(),
    currentLayouts: () => {
      const out: Record<string, ChapterLayout> = {};
      for (const c of getPlan(stateRef.current).chapters) if (c.layout) out[c.chapterId] = c.layout;
      return out;
    },
    discardWorkingSave: () => discardWorkingSaveRef.current(),
    withGcSuspended: async (fn) => {
      gcSuspendedRef.current++;
      try {
        return await fn();
      } finally {
        gcSuspendedRef.current--;
        scheduleGcRef.current();
      }
    },
    labels: () => stateRef.current.labels,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [dispatch]);
  Object.assign(late, { projectActions });

  const store = useMemo<SandboxStore>(() => ({
    getSnapshot: () => stateRef.current,
    subscribe: (cb) => {
      listenersRef.current.add(cb);
      return () => { listenersRef.current.delete(cb); };
    },
    dispatch,
    history: undoHistory,
    editorStatesRef,
    docRef,
    warningsRef,
    docSourceRef,
    chapterDocsRef,
    getWarnings: (s) => getWarningsRef.current(s),
    getPlan: (s) => getPlanRef.current(s),
    loadPreset: (id, locale) => openPresetRef.current(id, locale),
    presetProvider: (id) => presetProvidersRef.current.find((p) => p.summary.id === id),
    reloadPreset: async (parts) => {
      if (stateRef.current.activeProjectId !== null) {
        await projectActions.resetToSource(parts);
        return;
      }
      const activeId = stateRef.current.activePresetId;
      // The preset's own design back: its general settings too (#1209).
      if (parts === 'all' || parts === 'config') savePresetGeneral(activeId, null);
      // The whole preset back: the original replaces the draft.
      if (parts === 'all') {
        const s = stateRef.current;
        const locale = s.presetApplied?.presetId === activeId ? s.presetApplied.locale ?? '' : undefined;
        await restorePresetOriginalRef.current(activeId, locale);
        return;
      }
      const provider =
        presetProvidersRef.current.find((p) => p.summary.id === activeId) ?? builtinPresetRef.current;
      await runPresetRef.current(provider, parts);
    },
    restorePresetOriginal: (presetId) => restorePresetOriginalRef.current(presetId),
    openHashBundle: (ref) => switchBookRef.current(async () => (await openLinkedBundleRef.current(ref)) !== null),
    hashBundleKeys,
    hashBundleResolver: (key) => hashBundlesRef.current?.[key],
    linkedBundleEditions: (key, id) => {
      const cacheKey = `${key}:${id}`;
      let asked = linkedEditionsRef.current.get(cacheKey);
      if (!asked) {
        const editions = hashBundleEditionsRef.current?.[key];
        asked = editions
          ? Promise.resolve(editions(id)).then((list) => (list && list.length > 0 ? [...list] : null), () => null)
          : Promise.resolve(null);
        linkedEditionsRef.current.set(cacheKey, asked);
      }
      return asked;
    },
    answerBundleReplace: (replace) => {
      const answer = bundleReplaceAnswerRef.current;
      bundleReplaceAnswerRef.current = null;
      dispatch({ type: 'SET_BUNDLE_REPLACE_PROMPT', payload: null });
      answer?.(replace);
    },
    projectActions,
    saveBookCover: async (target, bytes, mime) => {
      if (target.kind === 'project') return projectActions.adoptGeneratedThumbnail(target.id, bytes, mime);
      const stored = await putPresetCoverIfMissing(target.id, target.locale, bytes, mime).catch(() => false);
      if (stored) dispatch({ type: 'ADD_PRESET_COVER', payload: { key: presetCoverKey(target.id, target.locale), url: bytesToDataUrl(bytes, mime) } });
      return stored;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [dispatch, undoHistory, projectActions, hashBundleKeys]);

  return (
    <SandboxStoreContext.Provider value={store}>
      {children}
    </SandboxStoreContext.Provider>
  );
}
