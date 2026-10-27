'use client';

import { type ReactNode, useMemo, useRef, useReducer, useEffect } from 'react';
import { type PostextConfig, type Resource, clearMeasurementCache, stripConfigDefaults, type VDTDocument } from 'postext';
import { PROJECT_RECORD_VERSION } from '../storage/projectMigration.js';
import { type SandboxLabels, DEFAULT_LABELS, type ViewportTab, type PanelId } from '../types/index.js';
import type { HashBundleResolver, HashBundleEditions } from '../types/props.js';
import { type ViewHash, readViewHash, hashAsksRestore, type HashBundleRef, parseHashBundle, EMPTY_VIEW_HASH, hashNamesOtherBook, isViewportTab, hashBundleOrigin, writeViewHash, type ViewHashBook } from '../storage/viewHash.js';
import { loadBook, loadStoredConfig, loadViewport, loadSidebarPercent, loadPanel, loadPresetApplied, savePresetApplied, loadPresetId, loadProjectId, loadEpubLayout, loadScormLayout, loadScormVersion, loadHiddenPresetIds, loadPresetGeneral, saveProjectId, savePresetId, saveBook, saveConfig, loadWorkingLayers, loadViewerLocale, saveViewerLocale, loadConfig, saveWorkingLayers, savePresetGeneral, saveHiddenPresetIds, saveViewport, saveEpubLayout, saveScormLayout, saveScormVersion, savePanel, saveSidebarPercent } from '../storage/persistence.js';
import { defaultEpubLayout } from '../epub/defaultLayout.js';
import { loadResources, saveResource, deleteResource } from '../storage/resources.js';
import { setCustomFonts, customFontsSignature } from '../controls/fonts/fontLoader.js';
import { pruneFontFiles } from '../storage/fontStorage.js';
import { getBlob, putBlobAt, pruneBlobs, hasIndexedDB } from '../storage/blobStore.js';
import { keepMigrationSnapshots } from '../migrate/textMigration.js';
import { generateChapterId, listProjects, toSummary, allEditionChapters, updateProject, type ProjectPatch, referencedFileIds, collectProjectFileIds } from '../storage/projects.js';
import { type PresetDraftSummary, type PresetDraftRecord, preserveDraftBlobs, listPresetDrafts, putPresetDraft, getPresetDraft, presetDraftKey, deletePresetDraft, toDraftSummary, decideDraftSave } from '../storage/presetDrafts.js';
import { type SaveScheduler, createSaveScheduler } from '../storage/saveScheduler.js';
import { effectiveCanvasScope } from '../book/scope.js';
import { presetReaderLocale, isEditionOnScreen, choosePresetOpen, linkNamesBookOnScreen } from '../presets/locale.js';
import { openHashBundle, takeQuietLink, fetchBundleBytes } from './hashBundle.js';
import { pruneChapterLayoutStore, getChapterLayouts, putChapterLayouts } from '../storage/layouts.js';
import type { BookContent, ChapterLayout, ComposedBook, BookPlan } from '../book/types.js';
import { createBookPlanner } from '../book/pagination.js';
import { sampleBook, activeChapter, isPristineBook } from '../book/chapterOps.js';
import { composeBookMemo } from '../book/compose.js';
import { computeWarnings } from '../warnings/compute.js';
import { publishContrast } from '../contrast/contrastStore.js';
import type { Warning } from '../warnings/types.js';
import { unavailableResourceImages, svgFontIssues, onUnavailableResourceImagesChange, onSvgFontReportsChange } from '../controls/media/resourceImages.js';
import { pdfFontChecks, pdfFontChecksFor, onPdfFontChecksChange } from '../controls/fonts/pdfFontWarnings.js';
import { preflightInputsVersion, preflightInputs, onPreflightInputsChange } from '../print/preflightInputs.js';
import { DEFAULT_MARKDOWN_EN } from '../defaultMarkdown/index.js';
import { withDefaultResourceTypes } from './defaultConfig.js';
import { createPostextGuideConfig } from './guideConfig.js';
import { type ProjectActions, createProjectActions } from './projectActions.js';
import { type SandboxHistory, createSandboxHistory, setActiveHistory } from '../history/sandboxHistory.js';
import { installHistoryKeys } from '../history/historyKeys.js';
import { presetCoverKey } from '../covers/autoCover.js';
import { listPresetCovers, putPresetCoverIfMissing, bytesToDataUrl } from '../storage/presetCovers.js';
import { rebaseEdition, presetSharedConfig, recordSharedConfig, rebaseEditions } from '../editions/configLayers.js';
import { type PresetSourceSpec, createPostextGuidePreset, rekeyMigratedConfig, BUILTIN_PRESET_ID, type PresetProvider, type PresetApplyParts, applyPreset, listPresets, pristineGuideFollowsViewer, findDefaultPrivatePreset, isDocumentUntouched, decidePresetUpdate } from '../presets/index.js';
import { SAMPLE_DOCUMENTS, type ChapterDocument, type SandboxStore, SandboxStoreContext } from './SandboxContext/hooks.js';
import { sandboxReducer, usableViewport, bookOf } from './SandboxContext/reducer.js';
import type { SandboxState } from './SandboxContext/state.js';

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

/** How often the active remote preset's fingerprint is polled while the
 *  page is visible. */
const PRESET_WATCH_INTERVAL_MS = 3000;
/** How long the "preset updated from disk" notice stays up. */
const PRESET_NOTICE_MS = 4000;
/** Debounce for the working-state save (localStorage + active project). */
const WORKING_SAVE_MS = 1000;
/** Debounce of the chapter layout records' write to storage. */
const LAYOUTS_SAVE_MS = 400;
/** Pause after the last change before the warnings are recomputed. */
const WARNINGS_DEBOUNCE_MS = 400;
/** Debounce for the blob/font garbage collection sweep. */
const GC_DEBOUNCE_MS = 2000;

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

  // Preset providers, discovered on mount. Kept in a ref (not state): only
  // their summaries are rendered, and load/reload read the live list.
  const presetProvidersRef = useRef<PresetProvider[]>([builtinPreset]);
  const builtinPresetRef = useRef(builtinPreset);
  builtinPresetRef.current = builtinPreset;
  // Monotonic token so an older in-flight load never clobbers a newer one.
  const presetLoadSeqRef = useRef(0);
  // Projects are listed on mount; GC waits for both loads so it never sweeps
  // against an empty keep-set.
  const projectsLoadedRef = useRef(false);
  const gcSuspendedRef = useRef(0);
  const gcTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Open book switches in flight: the working-copy save stands still while
  // the state is being swapped (see `persistWorking`).
  const switchingRef = useRef(0);
  // The draft the book on screen was opened from or last saved to (see
  // `decideDraftSave`): only that one may be dropped by an undo.
  const liveDraftKeyRef = useRef<string | null>(null);
  // The drafts as listed, readable before a dispatch has rendered (the
  // mount seeding opens books right after listing them).
  const draftsRef = useRef<PresetDraftSummary[]>([]);
  const setDraftSummaries = (list: PresetDraftSummary[]): void => {
    draftsRef.current = list;
    dispatch({ type: 'SET_PRESET_DRAFTS', payload: list });
  };
  const upsertDraftSummary = (summary: PresetDraftSummary): void => {
    draftsRef.current = [...draftsRef.current.filter((d) => d.key !== summary.key), summary];
    dispatch({ type: 'UPSERT_PRESET_DRAFT', payload: summary });
  };
  const removeDraftSummary = (key: string): void => {
    draftsRef.current = draftsRef.current.filter((d) => d.key !== key);
    dispatch({ type: 'REMOVE_PRESET_DRAFT', payload: key });
  };

  /** Open another book: the one on screen is written to its own record
   *  first, the viewport shows the loading state while `fn` runs, and the
   *  working-copy save waits until the new book is in. */
  const switchBook = async <T,>(fn: () => Promise<T>): Promise<T> => {
    await saverRef.current!.flush();
    switchingRef.current++;
    if (switchingRef.current === 1) dispatch({ type: 'SET_BOOK_LOADING', payload: true });
    try {
      return await fn();
    } finally {
      switchingRef.current--;
      if (switchingRef.current === 0) dispatch({ type: 'SET_BOOK_LOADING', payload: false });
    }
  };
  const switchBookRef = useRef(switchBook);
  switchBookRef.current = switchBook;

  /** Put a preset's saved draft on screen, in one synchronous batch. */
  const applyDraft = (draft: PresetDraftRecord): void => {
    // Any preset still loading would land over it.
    presetLoadSeqRef.current++;
    const loc = stateRef.current.locale;
    // A preset in several languages: the draft opens on the general
    // settings in force now, keeping what it sets of its own (#1209).
    const general = draft.sharedConfig ? loadPresetGeneral(draft.presetId) ?? draft.sharedConfig : null;
    const scope = stateRef.current.configLayers?.scope ?? 'all';
    const config = withDefaultResourceTypes(general && draft.sharedConfig ? rebaseEdition(draft.sharedConfig, general, draft.config) : draft.config, loc);
    setCustomFonts(config.customFonts, { newBook: true });
    const book: BookContent = {
      chapters: draft.chapters,
      activeChapterId: draft.activeChapterId,
      ...(draft.canvasScope ? { canvasScope: draft.canvasScope } : {}),
      ...(draft.start ? { start: draft.start } : {}),
    };
    dispatch({ type: 'SET_ACTIVE_PROJECT', payload: { id: null } });
    dispatch({ type: 'SET_PRESET', payload: { id: draft.presetId, config: draft.baseConfig ? withDefaultResourceTypes(draft.baseConfig, loc) : undefined } });
    dispatch({ type: 'SET_CONFIG', payload: config });
    dispatch({ type: 'SET_CONFIG_LAYERS', payload: general ? { shared: general, scope } : null });
    dispatch({ type: 'SET_RESOURCES', payload: draft.resources });
    dispatch({ type: 'SET_BOOK', payload: book });
    dispatch({ type: 'SET_PRESET_APPLIED', payload: draft.snapshot });
    clearMeasurementCache();
    saveProjectId(null);
    savePresetId(draft.presetId);
    savePresetApplied(draft.snapshot);
    saveBook(book);
    saveConfig(config);
    liveDraftKeyRef.current = draft.key;
  };

  /** Resolves to whether the preset was applied (false: superseded by a
   *  newer load, or failed). `leaveProject` switches out of project mode in
   *  the same commit as the preset lands; `discardKey` names the draft this
   *  apply replaces (its payloads need no preserving). */
  const runPreset = async (
    provider: PresetProvider,
    parts: PresetApplyParts,
    locale?: string,
    opts: { leaveProject?: boolean; discardKey?: string } = {},
  ): Promise<boolean> => {
    const seq = ++presetLoadSeqRef.current;
    dispatch({ type: 'SET_PRESET_STATUS', payload: { status: 'loading' } });
    try {
      // Fingerprint first: a bundle edit that lands while `load()` is running
      // then still differs from the snapshot and gets picked up by the watch.
      const fingerprint = provider.fingerprint ? await provider.fingerprint() : null;
      if (seq !== presetLoadSeqRef.current) return false;
      // The content locale: the one asked for, else the one this preset is
      // already loaded in (a reload keeps the language the user picked),
      // else the viewer's (or, for a Chinese viewer of a book without
      // Chinese, its English edition).
      const applied = stateRef.current.presetApplied;
      const keep = applied?.presetId === provider.summary.id ? applied.locale : undefined;
      const loaded = await provider.load(locale ?? keep ?? presetReaderLocale(provider.summary, stateRef.current.locale));
      if (seq !== presetLoadSeqRef.current) return false;
      // Drafts of this preset (another locale, an older version) keep the
      // payloads they were edited with when this apply brings other bytes.
      if (parts !== 'config') {
        await preserveDraftBlobs(loaded.blobs, {
          listDrafts: listPresetDrafts,
          getBlob,
          putBlobAt,
          putDraft: putPresetDraft,
        }, opts.discardKey).catch(() => []);
        if (seq !== presetLoadSeqRef.current) return false;
      }
      const { chapters, config, resources } = stateRef.current;
      await applyPreset(loaded, dispatch, {
        parts,
        fingerprint,
        scope: stateRef.current.configLayers?.scope ?? 'all',
        current: { chapters, config, resources },
        before: () => {
          if (opts.leaveProject && stateRef.current.activeProjectId !== null) {
            dispatch({ type: 'SET_ACTIVE_PROJECT', payload: { id: null } });
            saveProjectId(null);
          }
        },
      });
      // The original is on screen: no draft is live until it is edited.
      if (parts === 'all') liveDraftKeyRef.current = null;
      return true;
    } catch (err) {
      if (seq !== presetLoadSeqRef.current) return false;
      const message = err instanceof Error ? err.message : String(err);
      dispatch({ type: 'SET_PRESET_STATUS', payload: { status: 'error', error: message } });
      return false;
    }
  };
  const runPresetRef = useRef(runPreset);
  runPresetRef.current = runPreset;

  /** Open a preset: its saved draft when there is one for the locale it
   *  opens in (see `choosePresetOpen`), else its original. The book on
   *  screen is written to its own record first. */
  const openPreset = async (id: string, locale?: string): Promise<boolean> => {
    const provider = presetProvidersRef.current.find((p) => p.summary.id === id);
    if (!provider) return false;
    const s = stateRef.current;
    const onScreen = s.activeProjectId === null && s.activePresetId === id;
    const current = onScreen && s.presetApplied?.presetId === id ? s.presetApplied.locale ?? null : null;
    // Already open in that edition (Simplified ↔ Traditional Chinese, one
    // language in two editions, switch; `zh-TW` asks for the `zh-Hant` on
    // screen). The hash sync asks the same question before it calls here.
    if (isEditionOnScreen(provider.summary, locale, current) && s.presetStatus !== 'loading') return true;
    const choice = choosePresetOpen({ summary: provider.summary, requested: locale, current, viewer: s.locale, drafts: draftsRef.current });
    return switchBookRef.current(async () => {
      if (choice.draft) {
        let draft = await getPresetDraft(choice.draft.key);
        if (draft) {
          // A draft saved before general settings existed (#1209): it was
          // based on the preset's own, which its edition reads.
          if (!draft.sharedConfig && (provider.summary.locales?.length ?? 0) > 1) {
            const original = await provider.load(draft.locale || choice.locale || s.locale).then(presetSharedConfig).catch(() => null);
            if (original) draft = { ...draft, sharedConfig: original };
          }
          applyDraft(draft);
          return true;
        }
        removeDraftSummary(choice.draft.key);
      }
      return runPresetRef.current(provider, 'all', choice.locale, { leaveProject: true });
    });
  };
  const openPresetRef = useRef(openPreset);
  openPresetRef.current = openPreset;

  /** Drop the drafts of a preset (of one locale, or all of them); when the
   *  preset is on screen in a dropped locale, its original replaces it. */
  const restorePresetOriginal = async (presetId: string, locale?: string): Promise<void> => {
    const s = stateRef.current;
    const onScreen = s.activeProjectId === null && s.activePresetId === presetId;
    const screenLocale = onScreen && s.presetApplied?.presetId === presetId ? s.presetApplied.locale : undefined;
    const keys = draftsRef.current
      .filter((d) => d.presetId === presetId && (locale === undefined || d.locale === locale))
      .map((d) => d.key);
    const screenKey = onScreen ? presetDraftKey(presetId, screenLocale) : null;
    const reapply = onScreen && (locale === undefined || locale === (screenLocale ?? ''));
    if (reapply) {
      // The pending edits go with the draft.
      saverRef.current!.discard();
      liveDraftKeyRef.current = null;
      if (screenKey && !keys.includes(screenKey)) keys.push(screenKey);
    }
    await Promise.all(keys.map((k) => deletePresetDraft(k).catch(() => undefined)));
    for (const k of keys) removeDraftSummary(k);
    if (!reapply) return;
    const provider = presetProvidersRef.current.find((p) => p.summary.id === presetId) ?? builtinPresetRef.current;
    await switchBookRef.current(() => runPresetRef.current(provider, 'all', screenLocale, { discardKey: screenKey ?? undefined }));
  };
  const restorePresetOriginalRef = useRef(restorePresetOriginal);
  restorePresetOriginalRef.current = restorePresetOriginal;

  // Settles the pending `bundleReplacePrompt` (see `answerBundleReplace`).
  const bundleReplaceAnswerRef = useRef<((replace: boolean) => void) | null>(null);
  /** Ask the keep-or-replace question; resolves to true for replace. A
   *  question still open is answered "keep" first. */
  const askBundleReplace = (payload: NonNullable<SandboxState['bundleReplacePrompt']>): Promise<boolean> =>
    new Promise<boolean>((resolve) => {
      bundleReplaceAnswerRef.current?.(false);
      bundleReplaceAnswerRef.current = resolve;
      dispatch({ type: 'SET_BUNDLE_REPLACE_PROMPT', payload });
    });

  /** Open the book a host bundle link names (`hashBundles`): the project
   *  imported from it before, else a fresh import; then the fragment names
   *  the project. `known` lists the projects when the state does not hold
   *  them yet (the mount); `keep` is a project already on screen. */
  const openLinkedBundle = async (
    ref: HashBundleRef,
    known?: readonly { id: string; name?: string; origin?: string }[],
    keep?: string | null,
  ): Promise<string | null> => {
    const resolver = hashBundlesRef.current?.[ref.key];
    if (!resolver || typeof window === 'undefined') return null;
    const labels = stateRef.current.labels;
    try {
      const list = known ?? stateRef.current.projects;
      const opened = await openHashBundle(ref, {
        resolve: resolver,
        findProject: (origin) => list.find((p) => p.origin === origin)?.id ?? null,
        activate: (id) => (id === keep ? Promise.resolve() : projectActions.activate(id)),
        // The published book may have been corrected since the reader
        // imported it: they choose between their copy and a fresh one.
        confirmReplace: (id) => (takeQuietLink(hashBundleOrigin(ref)) ? Promise.resolve(false) : askBundleReplace({
          kind: 'bundle',
          id,
          name: list.find((p) => p.id === id)?.name ?? stateRef.current.projects.find((p) => p.id === id)?.name ?? id,
        })),
        removeProject: (id) => projectActions.remove(id, { offScreen: true }),
        fetchBytes: fetchBundleBytes,
        // A recipe published in several languages opens in the link's.
        importBytes: (bytes, name, origin, lang) => projectActions.importBundleBytes(bytes, name, { origin, ...(lang ? { locale: lang } : {}) }),
        pageOrigin: window.location.origin,
      });
      writeViewHash({ project: opened.projectId });
      return opened.projectId;
    } catch (err) {
      const reason = (err as { reason?: string } | null)?.reason;
      const message = reason === 'unknown' || reason === 'not-found'
        ? labels.hashBundleNotFound
        : labels.hashBundleError.replace('__error__', err instanceof Error ? err.message : String(err));
      dispatch({ type: 'SET_PROJECT_STATUS', payload: { status: 'idle' } });
      dispatch({ type: 'SET_PROJECT_NOTICE', payload: message });
      dispatch({ type: 'SET_PANEL', payload: 'projects' });
      // The fragment goes back to naming the book on screen.
      writeViewHash({});
      return null;
    }
  };
  const openLinkedBundleRef = useRef(openLinkedBundle);
  openLinkedBundleRef.current = openLinkedBundle;

  // The covers taken from the first page of presets that ship none.
  useEffect(() => {
    let cancelled = false;
    listPresetCovers().then((covers) => {
      if (!cancelled && Object.keys(covers).length > 0) dispatch({ type: 'SET_PRESET_COVERS', payload: covers });
    }, () => undefined);
    return () => { cancelled = true; };
  }, [dispatch]);

  useEffect(() => {
    let cancelled = false;
    const loc = locale ?? 'en';
    Promise.all([
      loadResources(),
      listPresets({ sources: presetSources, builtin: builtinPresetRef.current }).catch(
        () => [builtinPresetRef.current],
      ),
      listProjects(),
      listPresetDrafts(),
    ])
      .then(async ([loaded, providers, projects, drafts]) => {
        if (cancelled) return;
        presetProvidersRef.current = providers;
        dispatch({ type: 'SET_PROJECT_LIST', payload: projects.map(toSummary) });
        // The project the visit resumes, in several languages: its general
        // settings (#1209), which the working copy does not keep.
        const resumed = projects.find((p) => p.id === stateRef.current.activeProjectId);
        const resumedShared = resumed ? recordSharedConfig(resumed) : null;
        const resumedPreset = !resumed && !stateRef.current.activeProjectId && stateRef.current.presetApplied ? loadWorkingLayers(stateRef.current.presetApplied.presetId) : null;
        const resumedLayers = resumedShared ?? resumedPreset;
        if (resumedLayers && !stateRef.current.configLayers) dispatch({ type: 'SET_CONFIG_LAYERS', payload: { shared: resumedLayers, scope: 'all' } });
        setDraftSummaries(drafts.map(toDraftSummary));
        projectsLoadedRef.current = true;
        // Layout records of chapters no book holds any more are dropped.
        void pruneChapterLayoutStore(new Set([
          ...projects.flatMap((p) => allEditionChapters(p).map((c) => c.id)),
          ...drafts.flatMap((d) => d.chapters.map((c) => c.id)),
          ...stateRef.current.chapters.map((c) => c.id),
        ])).catch(() => undefined);

        const currentBook = bookOf(stateRef.current);
        const savedBook = loadBook(migration);
        const savedId = loadPresetId();
        // Pristine: the user has never edited the document (nothing saved, or
        // exactly one of the built-in samples as a single chapter). Any
        // markdown edit or added chapter opts out.
        const pristine = savedBook === null || isPristineBook(savedBook, SAMPLE_DOCUMENTS);
        // Storage is shared across locales, so a pristine default document
        // persisted in *another* language gets swapped to this locale's
        // default and its examples reseeded, so entering the Spanish sandbox
        // shows Spanish resources instead of whichever language seeded first.
        // A Chinese guide opened on purpose from an English or Spanish
        // interface stays Chinese (see `pristineGuideFollowsViewer`).
        const pristineOtherLocale = pristineGuideFollowsViewer(currentBook, defaultMd, loadViewerLocale());
        saveViewerLocale(loc);
        const onBuiltin = savedId === null || savedId === BUILTIN_PRESET_ID;

        // Summaries: every provider, plus a placeholder for a previously
        // active preset whose source is gone (content is kept; Reset falls
        // back to the built-in preset).
        const summaries = providers.map((p) => p.summary);
        if (savedId && !providers.some((p) => p.summary.id === savedId)) {
          summaries.push({ id: savedId, name: savedId, source: 'private', available: false });
        }
        dispatch({ type: 'SET_PRESET_LIST', payload: summaries });

        // The persistence effect diffs against this snapshot, so whatever a
        // preset applies below gets written (and stale records deleted).
        prevResourcesRef.current = loaded;
        resourcesLoadedRef.current = true;
        // The stored book's resources are the state's from now on: a branch
        // below that leaves the book as it is (a link to the book already on
        // screen) must not leave it without them, or the next save writes
        // the book back empty. A branch that opens another book sets its own.
        if (stateRef.current.activeProjectId === null) dispatch({ type: 'SET_RESOURCES', payload: loaded });

        const before = stateRef.current;
        // The stored book is a preset with a draft: it was opened from (or
        // saved to) that draft, so undoing every edit drops it.
        if (before.activeProjectId === null && before.presetApplied?.presetId === before.activePresetId) {
          const key = presetDraftKey(before.activePresetId, before.presetApplied.locale);
          if (drafts.some((d) => d.key === key)) liveDraftKeyRef.current = key;
        }
        // Leaving the stored book for the one a link names: write it to its
        // own record first — with the resources just read, as the state
        // does not hold them yet. (A project whose working resources are
        // gone keeps the ones its record has.)
        const saveOutgoing = () => persistWorkingRef.current(
          loaded.length > 0 || before.activeProjectId === null ? loaded : undefined,
        );

        // A host bundle link (`#recipe=…`): the project imported from it,
        // or a fresh import. A failure leaves the stored book open.
        const bundleRef = initialBundleRef.current;
        if (bundleRef && hashBundlesRef.current?.[bundleRef.key]) {
          await saveOutgoing();
          const opened = await openLinkedBundleRef.current(bundleRef, projects, before.activeProjectId);
          if (cancelled) return;
          // Another project is on screen now; when the link named the
          // stored one, the seeding below opens it as any visit would.
          if (opened !== null && opened !== before.activeProjectId) return;
        }

        // A permalink names the book to open (`#preset=P&lang=L` or
        // `#project=ID`, see `viewHash.ts`): it wins over the book last
        // open — unless it is that book already, in the locale asked for. A
        // book this browser does not have (another person's project, a
        // preset no source lists) is passed over. The chapter and page it
        // names are applied once the store is ready (`useChapterHashSync`).
        const wanted = initialHashRef.current ?? EMPTY_VIEW_HASH;
        const onScreen: ViewHashBook = {
          project: before.activeProjectId,
          preset: before.activeProjectId === null ? before.activePresetId : null,
          lang: before.activeProjectId === null
            ? before.presetApplied?.presetId === before.activePresetId ? before.presetApplied.locale ?? null : null
            // A project in several languages is on screen in one of them (#903).
            : (() => { const p = projects.find((x) => x.id === before.activeProjectId); return p?.editions ? p.locale ?? null : null; })(),
        };
        // A homepage link (`restore=ask`) to a preset the reader has edited
        // in the locale it opens in: they choose between their version and
        // the original, as a cookbook link asks for a book imported before.
        // Restoring drops that locale's draft (the original replaces it when
        // it is the book on screen); the fragment stops asking either way.
        if (!bundleRef && initialAsksRestoreRef.current && wanted.preset !== null && wanted.project === null) {
          initialAsksRestoreRef.current = false;
          writeViewHash({});
          const provider = providers.find((p) => p.summary.id === wanted.preset);
          const presetOnScreen = onScreen.preset === wanted.preset;
          const choice = provider
            ? choosePresetOpen({
                summary: provider.summary,
                requested: wanted.lang ?? undefined,
                current: presetOnScreen ? onScreen.lang : null,
                viewer: stateRef.current.locale,
                drafts: draftsRef.current,
              })
            : null;
          if (provider && choice?.draft) {
            const restore = await askBundleReplace({ kind: 'preset', id: provider.summary.id, name: provider.summary.name });
            if (cancelled) return;
            if (restore) {
              const draftLocale = choice.draft.locale;
              const reapplies = presetOnScreen && draftLocale === (onScreen.lang ?? '');
              if (!reapplies) await saveOutgoing();
              await restorePresetOriginalRef.current(provider.summary.id, draftLocale);
              if (reapplies || cancelled) return;
            }
          }
        }

        // `lang=zh-TW` names the `zh-Hant` edition on screen: it stays, and
        // is seeded below as any visit's book.
        if (!bundleRef && !linkNamesBookOnScreen(wanted, onScreen, summaries)) {
          if (wanted.project !== null && projects.some((p) => p.id === wanted.project)) {
            await saveOutgoing();
            await (wanted.lang ? projectActions.switchEdition(wanted.project, wanted.lang) : projectActions.activate(wanted.project)).catch(() => undefined);
            return;
          }
          const provider = wanted.preset === null ? undefined : providers.find((p) => p.summary.id === wanted.preset);
          if (provider) {
            await saveOutgoing();
            await openPresetRef.current(provider.summary.id, wanted.lang ?? undefined);
            return;
          }
        }

        // Project mode: the working state (localStorage + resources store) is
        // the project's live copy; the record only fills in when the store
        // was emptied. Preset-mode seeding below does not apply.
        const savedProjectId = stateRef.current.activeProjectId;
        const activeProject = savedProjectId ? projects.find((p) => p.id === savedProjectId) : undefined;
        if (activeProject) {
          dispatch({ type: 'SET_ACTIVE_PROJECT', payload: { id: activeProject.id, sourcePresetId: activeProject.sourcePresetId } });
          dispatch({ type: 'SET_RESOURCES', payload: loaded.length > 0 ? loaded : activeProject.resources });
          scheduleGc();
          return;
        }
        if (savedProjectId) {
          dispatch({ type: 'SET_ACTIVE_PROJECT', payload: { id: null } });
          saveProjectId(null);
        }

        // A pristine sandbox opens on the private default preset — unless
        // the permalink asked for the book on screen by name.
        const privateDefault = findDefaultPrivatePreset(providers, loc);
        if (pristine && onBuiltin && privateDefault && wanted.preset === null && wanted.project === null) {
          await saveOutgoing();
          await openPresetRef.current(privateDefault.summary.id);
          return;
        }
        if (pristineOtherLocale) {
          // The untouched guide in the other language: the guide in this
          // one (its draft, if it was edited here before).
          await saveOutgoing();
          await openPresetRef.current(BUILTIN_PRESET_ID, loc);
          return;
        }
        if (loaded.length === 0 && onBuiltin) {
          // First entry (empty store): seed the built-in preset. A pristine
          // document takes the sample markdown too (and a fresh config only
          // when none was ever saved); an edited document with an emptied
          // store just gets its example resources back. Another preset on
          // screen may simply have no resources (a novel without figures):
          // it stays what it is, not the guide's resources under its text.
          const parts: PresetApplyParts = !pristine
            ? 'resources'
            : loadConfig() === null ? 'all' : 'document';
          await runPresetRef.current(builtinPresetRef.current, parts);
          return;
        }
        dispatch({ type: 'SET_RESOURCES', payload: loaded });
        dispatch({ type: 'SET_PRESET', payload: { id: savedId ?? BUILTIN_PRESET_ID } });
        scheduleGc();
      })
      .catch(() => {
        if (cancelled) return;
        resourcesLoadedRef.current = true;
      })
      .then(() => {
        if (!cancelled) dispatch({ type: 'SET_STORE_READY' });
      });
    return () => {
      cancelled = true;
    };
    // Mount-only seed: `locale`/`presetSources` are read once to pick the
    // preset and must not re-trigger seeding if they change later.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live presets: while the page is visible, poll the active preset's source
  // fingerprint and follow bundle edits — re-apply when the document is
  // untouched, otherwise flag it stale and keep the user's work. Restarts
  // (with an immediate check) when the active preset or the provider list
  // changes, which also covers "edited the bundle, then opened the sandbox".
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    let disposed = false;
    let inFlight = false;

    const tick = async (): Promise<void> => {
      if (disposed || inFlight) return;
      if (document.visibilityState !== 'visible') return;
      if (!resourcesLoadedRef.current) return;
      const before = stateRef.current;
      // Projects own their content; bundle edits only matter in preset mode.
      if (before.activeProjectId !== null) return;
      if (before.presetStatus === 'loading') return;
      const provider = presetProvidersRef.current.find((p) => p.summary.id === before.activePresetId);
      if (!provider?.fingerprint) return;

      inFlight = true;
      try {
        const live = await provider.fingerprint();
        if (disposed) return;
        const s = stateRef.current;
        if (s.activePresetId !== provider.summary.id || s.presetStatus === 'loading') return;
        const snapshot = s.presetApplied?.presetId === provider.summary.id ? s.presetApplied : null;

        // A copy of the built-in guide applied before it had a fingerprint
        // is taken as out of date (it predates the version on screen).
        if (snapshot && snapshot.fingerprint === null && live !== null && provider.summary.source === 'builtin') {
          const legacy = { ...snapshot, fingerprint: 'builtin-legacy' };
          dispatch({ type: 'SET_PRESET_APPLIED', payload: legacy });
          savePresetApplied(legacy);
          return;
        }
        if (snapshot && snapshot.fingerprint === null && live !== null) {
          // The apply could not read a fingerprint (source briefly down):
          // adopt the live one as the baseline rather than re-applying.
          const adopted = { ...snapshot, fingerprint: live };
          dispatch({ type: 'SET_PRESET_APPLIED', payload: adopted });
          savePresetApplied(adopted);
          return;
        }

        const differs = live !== null && snapshot?.fingerprint != null && live !== snapshot.fingerprint;
        const untouched = differs ? isDocumentUntouched(s, snapshot) : true;
        const decision = decidePresetUpdate({ liveFingerprint: live, snapshot, untouched });
        if (decision === 'apply') {
          await runPresetRef.current(provider, 'all');
          if (disposed || stateRef.current.presetStatus === 'error') return;
          dispatch({ type: 'SET_PRESET_UPDATED_AT', payload: Date.now() });
        } else if (decision === 'stale') {
          dispatch({ type: 'SET_PRESET_STALE', payload: true });
        } else if (s.presetStale && live !== null && snapshot?.fingerprint === live) {
          // The source went back to what was applied (e.g. an undone edit).
          dispatch({ type: 'SET_PRESET_STALE', payload: false });
        }
      } finally {
        inFlight = false;
      }
    };

    const onVisible = () => { if (document.visibilityState === 'visible') void tick(); };
    const interval = window.setInterval(() => { void tick(); }, PRESET_WATCH_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    void tick();
    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [state.activePresetId, state.presetSummaries, state.activeProjectId, dispatch]);

  // Auto-hide the "updated from disk" notice.
  useEffect(() => {
    if (state.presetUpdatedAt === null) return;
    const timer = window.setTimeout(
      () => dispatch({ type: 'SET_PRESET_UPDATED_AT', payload: null }),
      PRESET_NOTICE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [state.presetUpdatedAt, dispatch]);

  // Persist resource changes to IndexedDB by diffing against the previous
  // snapshot. Skips until the initial async load completes so the load itself
  // doesn't trigger spurious writes.
  useEffect(() => {
    if (!resourcesLoadedRef.current) return;
    const prev = prevResourcesRef.current;
    const next = state.resources;
    if (prev === next) return;

    const prevById = new Map(prev.map((r) => [r.id, r]));
    const nextById = new Map(next.map((r) => [r.id, r]));

    for (const r of next) {
      const before = prevById.get(r.id);
      if (before !== r) {
        saveResource(r).catch(() => { /* ignore */ });
      }
    }
    // Records only: blobs may still be referenced by a project (a switch
    // replaces the whole set) and are swept by the reference-based GC.
    for (const r of prev) {
      if (!nextById.has(r.id)) {
        deleteResource(r.id, false).catch(() => { /* ignore */ });
      }
    }

    prevResourcesRef.current = next;
  }, [state.resources]);

  // Auto-save the working state (debounced, skip until hydrated): the book
  // and config to localStorage always (the working copy the next visit
  // starts from), and into the book's own record — the active project, or
  // the draft of an edited preset. Reads the live state, so a flush before
  // a switch writes exactly what is on screen. `resourcesOverride` stands
  // in for the resource set while the state does not hold it yet (the
  // mount, before the store has loaded): without either, only the working
  // copy is written.
  const persistWorking = async (resourcesOverride?: Resource[]): Promise<void> => {
    // A book is being swapped in: the state is neither the old book nor
    // the new one. The switch flushed the old one before it started.
    if (switchingRef.current > 0) return;
    const s = stateRef.current;
    saveBook(bookOf(s));
    saveConfig(s.config);
    saveWorkingLayers(s.activeProjectId ? null : s.presetApplied?.presetId ?? null, s.activeProjectId ? null : s.configLayers?.shared ?? null);
    const resources = resourcesOverride ?? (s.storeReady ? s.resources : null);
    if (!resources) return;
    if (s.activeProjectId) {
      const layers = s.configLayers;
      await updateProject(s.activeProjectId, (existing) => {
        const patch: ProjectPatch = {
          chapters: s.chapters,
          activeChapterId: s.activeChapterId,
          canvasScope: s.canvasScope,
          // `undefined` clears a start the record held for another book.
          start: s.bookStart,
          config: stripConfigDefaults(s.config),
          resources,
        };
        // General settings changed (#1209): the editions kept aside read
        // them too, each keeping the fields it sets itself.
        const before = recordSharedConfig(existing);
        if (layers && before && existing.editions) {
          const editions = rebaseEditions(before, layers.shared, existing.editions);
          patch.sharedConfig = layers.shared;
          if (editions !== existing.editions) {
            patch.editions = editions;
            patch.editionsRev = Date.now();
          }
        }
        return patch;
      }).catch(() => undefined);
      return;
    }
    // The general settings of a preset in several languages: every edition
    // opens on them (#1209).
    if (s.configLayers && s.presetApplied) savePresetGeneral(s.presetApplied.presetId, s.configLayers.shared);
    const decision = decideDraftSave({
      activeProjectId: s.activeProjectId,
      activePresetId: s.activePresetId,
      snapshot: s.presetApplied,
      content: { chapters: s.chapters, config: s.config, resources },
      liveDraftKey: liveDraftKeyRef.current,
    });
    if (decision.action === 'put' && s.presetApplied) {
      const record: PresetDraftRecord = {
        version: PROJECT_RECORD_VERSION,
        key: decision.key,
        presetId: s.presetApplied.presetId,
        locale: s.presetApplied.locale ?? '',
        snapshot: s.presetApplied,
        ...(s.presetConfig ? { baseConfig: s.presetConfig } : {}),
        ...(s.configLayers ? { sharedConfig: s.configLayers.shared } : {}),
        chapters: s.chapters,
        activeChapterId: s.activeChapterId,
        ...(s.canvasScope === 'book' ? { canvasScope: s.canvasScope } : {}),
        ...(s.bookStart ? { start: s.bookStart } : {}),
        config: s.config,
        resources,
        updatedAt: Date.now(),
      };
      liveDraftKeyRef.current = decision.key;
      await putPresetDraft(record).then(() => upsertDraftSummary(toDraftSummary(record)), () => undefined);
    } else if (decision.action === 'delete') {
      liveDraftKeyRef.current = null;
      await deletePresetDraft(decision.key).then(() => removeDraftSummary(decision.key), () => undefined);
    }
  };
  const persistWorkingRef = useRef(persistWorking);
  persistWorkingRef.current = persistWorking;
  const saverRef = useRef<SaveScheduler | null>(null);
  if (saverRef.current === null) {
    saverRef.current = createSaveScheduler(() => persistWorkingRef.current(), WORKING_SAVE_MS);
  }
  const flushWorkingSave = (): Promise<void> => saverRef.current!.flush();
  const discardWorkingSave = (): void => saverRef.current!.discard();
  const flushWorkingSaveRef = useRef(flushWorkingSave);
  flushWorkingSaveRef.current = flushWorkingSave;
  const discardWorkingSaveRef = useRef(discardWorkingSave);
  discardWorkingSaveRef.current = discardWorkingSave;

  useEffect(() => {
    if (!hydratedRef.current) return;
    saverRef.current!.schedule();
  }, [state.chapters, state.activeChapterId, state.canvasScope, state.bookStart, state.config, state.resources, state.activeProjectId, state.presetApplied, state.storeReady]);

  // Leaving the page — closing the tab, following a link out (the logo),
  // switching apps on a phone — writes the pending edits at once instead
  // of dropping the last second of them; so does the sandbox unmounting
  // (a client-side navigation away).
  useEffect(() => {
    const flush = () => { void saverRef.current!.flush(); };
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      flush();
    };
  }, []);

  // Hidden presets are a UI preference: saved immediately.
  useEffect(() => {
    if (!hydratedRef.current) return;
    saveHiddenPresetIds(state.hiddenPresetIds);
  }, [state.hiddenPresetIds]);

  // Chapter layouts persist with the book (the 'layouts' store, by chapter
  // id): the records of chapters that have none in memory are read once
  // per chapter id — on mount, after a project switch, a preset, an import
  // — and every record built or changed here is written back. Stale ones
  // are told apart by the planner, never here.
  const layoutsLookedUpRef = useRef(new Set<string>());
  const layoutsPersistedRef = useRef(new Map<string, ChapterLayout>());
  useEffect(() => {
    const ids = state.chapters.map((c) => c.id).filter((id) => !layoutsLookedUpRef.current.has(id));
    if (ids.length === 0) return;
    for (const id of ids) layoutsLookedUpRef.current.add(id);
    // Never cancelled: the chapter list changes right after mount (the
    // seeding) and on every keystroke; the reducer keeps only records of
    // chapters still in the book that have none in memory.
    getChapterLayouts(ids)
      .then((stored) => {
        for (const l of Object.values(stored)) layoutsPersistedRef.current.set(l.chapterId, l);
        if (Object.keys(stored).length > 0) dispatch({ type: 'SET_CHAPTER_LAYOUTS', payload: stored });
      })
      .catch(() => undefined);
  }, [state.chapters, dispatch]);
  const layoutsSaveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    clearTimeout(layoutsSaveTimerRef.current);
    layoutsSaveTimerRef.current = setTimeout(() => {
      layoutsSaveTimerRef.current = undefined;
      const persisted = layoutsPersistedRef.current;
      const changed = Object.values(state.chapterLayouts).filter((l) => persisted.get(l.chapterId) !== l);
      if (changed.length === 0) return;
      for (const l of changed) persisted.set(l.chapterId, l);
      void putChapterLayouts(changed).catch(() => undefined);
    }, LAYOUTS_SAVE_MS);
    return () => clearTimeout(layoutsSaveTimerRef.current);
  }, [state.chapterLayouts]);

  // Drop editor histories of chapters that no longer exist (deleted, or a
  // different project was activated — chapter ids are unique).
  useEffect(() => {
    const live = new Set(state.chapters.map((c) => c.id));
    for (const id of editorStatesRef.current.keys()) {
      if (!live.has(id)) editorStatesRef.current.delete(id);
    }
    undoHistory.pruneChapters(live);
  }, [state.chapters, undoHistory]);

  // Save viewport tab and active panel immediately (skip until hydrated)
  useEffect(() => {
    if (!hydratedRef.current) return;
    saveViewport(state.activeViewport);
  }, [state.activeViewport]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    saveEpubLayout(state.epubLayout);
  }, [state.epubLayout]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    saveScormLayout(state.scormLayout);
    saveScormVersion(state.scormVersion);
  }, [state.scormLayout, state.scormVersion]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    savePanel(state.activePanel);
  }, [state.activePanel]);

  // Save sidebar percent when drag ends
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (!state.sidebarDragging) {
      saveSidebarPercent(state.sidebarPercent);
    }
  }, [state.sidebarDragging, state.sidebarPercent]);

  // Keep the fontLoader's custom-font registry in sync with the config so
  // that FontPicker, loadFont(), and the worker payload collector can all
  // resolve custom families by name. This runs during render rather than in
  // an effect: child effects fire before the provider's, so a viewport's
  // first build would otherwise start against an empty registry and measure
  // custom families with fallback glyphs (the PDF viewport never rebuilds on
  // its own, so it would keep that layout). Comparing signatures instead of
  // array identity also re-seeds after a hot reload empties the registry.
  if (customFontsSignature() !== customFontsSignature(state.config.customFonts)) {
    setCustomFonts(state.config.customFonts);
  }

  // Reference-based garbage collection for IndexedDB payloads: a blob or
  // font file survives while the working state or any stored project points
  // at it. Debounced, and paused while an operation is copying files whose
  // records have not landed yet.
  const runGc = async (): Promise<void> => {
    if (gcSuspendedRef.current > 0) return;
    if (!resourcesLoadedRef.current || !projectsLoadedRef.current) return;
    const s = stateRef.current;
    const live = referencedFileIds({ resources: s.resources, config: s.config });
    const stored = await collectProjectFileIds();
    for (const id of stored.blobIds) live.blobIds.add(id);
    for (const id of stored.fontIds) live.fontIds.add(id);
    // Edited presets keep their payloads too (they point at the preset's
    // own files, or at copies of their own).
    for (const draft of await listPresetDrafts()) {
      const refs = referencedFileIds(draft);
      for (const id of refs.blobIds) live.blobIds.add(id);
      for (const id of refs.fontIds) live.fontIds.add(id);
    }
    // The book as it was before a move of its text to the Markdown (#874).
    await keepMigrationSnapshots(live.blobIds);
    if (gcSuspendedRef.current > 0) return;
    await Promise.all([pruneFontFiles(live.fontIds), pruneBlobs(live.blobIds)]);
  };
  const runGcRef = useRef(runGc);
  runGcRef.current = runGc;
  const scheduleGc = (): void => {
    clearTimeout(gcTimerRef.current);
    gcTimerRef.current = setTimeout(() => {
      runGcRef.current().catch(() => { /* ignore */ });
    }, GC_DEBOUNCE_MS);
  };
  const scheduleGcRef = useRef(scheduleGc);
  scheduleGcRef.current = scheduleGc;

  useEffect(() => {
    if (!hydratedRef.current) return;
    scheduleGcRef.current();
  }, [state.config.customFonts, state.resources, state.activeProjectId, state.projects]);

  useEffect(() => () => clearTimeout(gcTimerRef.current), []);

  // Notify parent of changes
  useEffect(() => {
    onConfigChange?.(state.config);
  }, [state.config, onConfigChange]);

  useEffect(() => {
    onMarkdownChange?.(state.markdown);
  }, [state.markdown, onMarkdownChange]);

  const editorStatesRef = useRef<Map<string, unknown>>(new Map());
  const docRef = useRef<VDTDocument | null>(null);
  const docSourceRef = useRef<ComposedBook | null>(null);
  const chapterDocsRef = useRef<Map<string, ChapterDocument>>(new Map());
  const warningsCacheRef = useRef<{ key: unknown[]; value: Warning[] } | null>(null);
  /** Bumped whenever the set of unreadable image payloads changes (the
   *  previews decode them after the layout), or a PDF generation brings
   *  its font warnings: part of the warnings key. */
  const imageStatusRef = useRef(0);
  const getWarnings = (s: SandboxState): Warning[] => {
    const key = [s.chapters, s.activeChapterId, s.config, s.resources, s.docVersion, s.canvasScope, s.activeViewport, imageStatusRef.current, pdfFontChecks(), s.bookVersion, s.pdfScope, preflightInputsVersion()];
    const cached = warningsCacheRef.current;
    if (cached && cached.key.every((k, i) => k === key[i])) return cached.value;
    const chapterBook = composeBookMemo(s.chapters, s.activeChapterId);
    // Warnings are the active chapter's. With the canvas (or the folio)
    // showing the whole book, the stitched document in `docRef` spans
    // every chapter; the chapter's own document (chapter offsets, like
    // `book`) is read instead — or none, while it has not been laid out.
    // The HTML preview lays the whole book out as one document with book
    // offsets: its own composition is read then, and the other chapters'
    // warnings dropped. The EPUB tab reads like the PDF tab: both build the
    // book's print chain on request and publish no preview document, so
    // the warnings stay the active chapter's, from the last preview built.
    const stitched = s.canvasScope === 'book' && (s.activeViewport === 'canvas' || s.activeViewport === 'folio');
    const wholeSource = s.canvasScope === 'book' && s.activeViewport === 'html' ? docSourceRef.current : null;
    const whole = wholeSource !== null && wholeSource.scope === 'book' ? wholeSource : null;
    const book = whole ?? chapterBook;
    const doc = stitched ? chapterDocsRef.current.get(s.activeChapterId)?.doc ?? null : docRef.current;
    const fontChecks = pdfFontChecksFor(s);
    const preflight = preflightInputs(s.config.print, s.resources);
    // The colour fields show their contrast against every page laid out
    // so far, not the active chapter's alone (#748).
    const laidOut = new Set<VDTDocument>([...(doc ? [doc] : []), ...[...chapterDocsRef.current.values()].map((c) => c.doc)]);
    publishContrast([...laidOut], s.config, preflight.transform);
    const all = computeWarnings({
      markdown: book.markdown,
      config: s.config,
      doc: wholeSource !== null && whole === null ? null : doc,
      resources: s.resources,
      storageUnavailable: !hasIndexedDB(),
      unavailableImages: unavailableResourceImages(),
      svgFontIssues: svgFontIssues(),
      book,
      chapterTitles: new Map(s.chapters.map((c) => [c.id, c.title])),
      // Another book's are dropped; after an edit they are marked stale.
      pdfFontChecks: fontChecks.checks,
      pdfFontChecksStale: fontChecks.stale,
      preflight,
    });
    const value = whole ? all.filter((w) => w.chapterId === undefined || w.chapterId === s.activeChapterId) : all;
    warningsCacheRef.current = { key, value };
    return value;
  };
  const getWarningsRef = useRef(getWarnings);
  getWarningsRef.current = getWarnings;
  const plannerRef = useRef(createBookPlanner());
  const planCacheRef = useRef<{ key: unknown[]; value: BookPlan } | null>(null);
  const getPlan = (s: SandboxState): BookPlan => {
    const key = [s.chapters, s.config, s.resources, s.chapterLayouts, s.bookStart];
    const cached = planCacheRef.current;
    if (cached && cached.key.every((k, i) => k === key[i])) return cached.value;
    const value = plannerRef.current.plan(s.chapters, s.config, s.resources, s.chapterLayouts, s.bookStart);
    planCacheRef.current = { key, value };
    return value;
  };
  const getPlanRef = useRef(getPlan);
  getPlanRef.current = getPlan;

  // Subscription plumbing: hold the live state in a ref and notify
  // subscribers when it changes. Lets hooks below subscribe to specific
  // slices via useSyncExternalStore without re-rendering on unrelated
  // state changes.
  const stateRef = useRef(state);
  const listenersRef = useRef<Set<() => void>>(new Set());
  stateRef.current = state;

  useEffect(() => {
    // Fire after commit so subscribers see the committed state.
    for (const cb of listenersRef.current) cb();
  }, [state]);

  // Warnings parse the active chapter and walk the built document: not
  // on every keystroke, but once the inputs have settled.
  const warningsRef = useRef<Warning[]>([]);
  const { chapters: warnChapters, activeChapterId: warnChapterId, config: warnConfig, resources: warnResources, docVersion: warnDocVersion, bookVersion: warnBookVersion, pdfScope: warnPdfScope } = state;
  useEffect(() => {
    const timer = setTimeout(() => {
      warningsRef.current = getWarningsRef.current(stateRef.current);
      for (const cb of listenersRef.current) cb();
    }, WARNINGS_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [warnChapters, warnChapterId, warnConfig, warnResources, warnDocVersion, warnBookVersion, warnPdfScope]);

  // An image payload found missing or undecodable (or readable again) after
  // the previews decoded it: list the change without waiting for an edit.
  // A PDF generated with characters its fonts lack (and the like) lists
  // them the same way.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      imageStatusRef.current++;
      clearTimeout(timer);
      timer = setTimeout(() => {
        warningsRef.current = getWarningsRef.current(stateRef.current);
        for (const cb of listenersRef.current) cb();
      }, WARNINGS_DEBOUNCE_MS);
    };
    const offImages = onUnavailableResourceImagesChange(refresh);
    const offSvgFonts = onSvgFontReportsChange(refresh);
    const offPdf = onPdfFontChecksChange(refresh);
    const offPreflight = onPreflightInputsChange(refresh);
    return () => {
      offImages();
      offSvgFonts();
      offPdf();
      offPreflight();
      clearTimeout(timer);
    };
  }, []);

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
  }), [dispatch]);

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
  }), [dispatch, undoHistory, projectActions, hashBundleKeys]);

  return (
    <SandboxStoreContext.Provider value={store}>
      {children}
    </SandboxStoreContext.Provider>
  );
}
