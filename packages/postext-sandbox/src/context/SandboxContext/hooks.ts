'use client';

// The store the provider hands down and the hooks that read it: state
// selectors, the presets, projects and book slices, the refs to the last
// built document and the layout source of the previews (#1276: split out
// of SandboxContext.tsx).
import { type Dispatch, type MutableRefObject, createContext, useContext, useSyncExternalStore, useRef, useMemo } from 'react';
import type { VDTDocument, PostextConfig, Resource, LayoutContinuation } from 'postext';
import type { HashBundleResolver } from '../../types/props.js';
import type { HashBundleRef } from '../../storage/viewHash.js';
import type { ProjectSummary } from '../../storage/projects.js';
import type { PresetDraftSummary } from '../../storage/presetDrafts.js';
import type { ComposedBook, BookPlan, BookContent, BookPages, ChapterPlan } from '../../book/types.js';
import { sameLayoutInputs } from '../../book/pagination.js';
import { composeBookMemo } from '../../book/compose.js';
import type { Warning } from '../../warnings/types.js';
import type { ProjectActions } from '../projectActions.js';
import type { SandboxHistory } from '../../history/sandboxHistory.js';
import type { CoverTarget } from '../../covers/autoCover.js';
import { StateViewContext, ScopedDispatchContext } from '../configScope.js';
import { type PresetProvider, type PresetApplyParts, type PresetSummary, isDocumentUntouched, GUIDE_SAMPLE_DOCUMENTS } from '../../presets/index.js';
import type { SandboxState, SandboxAction } from './state.js';

export interface SandboxStore {
  getSnapshot: () => SandboxState;
  subscribe: (cb: () => void) => () => void;
  dispatch: Dispatch<SandboxAction>;
  /** Persisted CodeMirror state (doc, selection, undo history) per chapter
   *  id, so switching chapters keeps each one's history and caret. */
  editorStatesRef: MutableRefObject<Map<string, unknown>>;
  /** The undo history of the text and the configuration (#899). */
  history: SandboxHistory;
  /** Ref to the most recently built VDT document from whichever viewport
   *  last rendered. Null until the first successful build. Updated together
   *  with a `BUMP_DOC_VERSION` dispatch so consumers can react. */
  docRef: MutableRefObject<VDTDocument | null>;
  /** The warnings last computed (debounced after the inputs change). */
  warningsRef: MutableRefObject<Warning[]>;
  /** The composed book `docRef` was built from (offsets in the document are
   *  offsets into `docSourceRef.current.markdown`). */
  docSourceRef: MutableRefObject<ComposedBook | null>;
  /** The chapters' own documents when the canvas lays out the whole book
   *  (`docRef` then holds them stitched together), by chapter id, each
   *  with the chapter-only book it was built from. Empty otherwise. */
  chapterDocsRef: MutableRefObject<Map<string, ChapterDocument>>;
  /** Warnings for the current layout source, cached per state so every
   *  consumer (panel, activity bar) shares one computation. */
  getWarnings: (s: SandboxState) => Warning[];
  /** How each chapter is laid out on its own (continuation, page ranges),
   *  cached per state so every consumer shares one computation. */
  getPlan: (s: SandboxState) => BookPlan;
  /** Load a preset by id (all parts). No-op for unknown/unavailable ids.
   *  `locale` picks the content language of a bilingual bundle; without it
   *  the viewer locale applies. Resolves to whether the preset was
   *  applied. */
  loadPreset: (id: string, locale?: string) => Promise<boolean>;
  /** The provider of a preset (its bundle in every language), for reading
   *  an edition that is not on screen (#867). */
  presetProvider: (id: string) => PresetProvider | undefined;
  /** Re-fetch the active preset and re-apply the given parts. `all`
   *  restores the original (its draft is dropped). */
  reloadPreset: (parts: PresetApplyParts) => Promise<void>;
  /** Drop every draft of a preset; when it is on screen, its original
   *  replaces the edited book. */
  restorePresetOriginal: (presetId: string) => Promise<void>;
  /** Open the book a host bundle link names (see `hashBundles`). Resolves
   *  to whether it opened. */
  openHashBundle: (ref: HashBundleRef) => Promise<boolean>;
  /** The fragment keys the host resolves to bundles. */
  hashBundleKeys: readonly string[];
  /** The URLs a linked book's edition is fetched from (see `hashBundles`). */
  hashBundleResolver: (key: string) => HashBundleResolver | undefined;
  /** The languages a linked book is published in (`hashBundleEditions`,
   *  #1011), asked once per book for the session; null when the host does
   *  not say. */
  linkedBundleEditions: (key: string, id: string) => Promise<string[] | null>;
  /** Answer `bundleReplacePrompt`: true replaces the reader's copy with
   *  the linked book, false opens the copy as it is. */
  answerBundleReplace: (replace: boolean) => void;
  projectActions: ProjectActions;
  /** Give a book without a cover the picture taken from its first page
   *  (never replaces one). Resolves to whether it was stored. */
  saveBookCover: (target: CoverTarget, bytes: ArrayBuffer, mime: string) => Promise<boolean>;
}

export interface SandboxContextValue {
  state: SandboxState;
  dispatch: Dispatch<SandboxAction>;
  docRef: MutableRefObject<VDTDocument | null>;
}

/** @internal Exported for tests that render sandbox consumers against a
 *  fixed state without the provider (see `sectionSearchIndex.test.ts`). */
export const SandboxStoreContext = createContext<SandboxStore | null>(null);

function useStore(): SandboxStore {
  const store = useContext(SandboxStoreContext);
  if (!store) throw new Error('useSandbox must be used within <SandboxProvider>');
  return store;
}

export function useSandbox(): SandboxContextValue {
  const store = useStore();
  const view = useContext(StateViewContext);
  const scoped = useContext(ScopedDispatchContext);
  const raw = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { state: view ? view(raw) : raw, dispatch: scoped ?? store.dispatch, docRef: store.docRef };
}

/** The whole store, for code that reads and acts outside React's render
 *  (the WebMCP tools, ../webmcp). Stable for the provider's lifetime. */
export function useSandboxStore(): SandboxStore {
  return useStore();
}

/** Stable dispatch reference — never triggers a re-render on state changes. */
export function useSandboxDispatch(): Dispatch<SandboxAction> {
  const store = useStore();
  return useContext(ScopedDispatchContext) ?? store.dispatch;
}

/** Subscribe to a slice of state; component re-renders only when the selected
 *  value changes (by `isEqual`, defaults to `Object.is`). */
export function useSandboxSelector<T>(
  selector: (s: SandboxState) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const store = useStore();
  // Inside the Design panel, the layer it edits (#1209).
  const view = useContext(StateViewContext);
  const viewRef = useRef(view);
  viewRef.current = view;
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const isEqualRef = useRef(isEqual);
  isEqualRef.current = isEqual;
  const lastStateRef = useRef<SandboxState | null>(null);
  const lastSelectorRef = useRef<((s: SandboxState) => T) | null>(null);
  const lastResultRef = useRef<T>(undefined as T);

  const getSnapshot = () => {
    const raw = store.getSnapshot();
    const s = viewRef.current ? viewRef.current(raw) : raw;
    // Re-select when the state changed, and also when the selector did: a
    // component re-rendering with a new argument (another chapter's plan)
    // must not get the value the subscription check computed for the old
    // one — that check runs before the render, on the same state.
    if (s !== lastStateRef.current || selectorRef.current !== lastSelectorRef.current) {
      const next = selectorRef.current(s);
      if (lastStateRef.current === null || !isEqualRef.current(lastResultRef.current, next)) {
        lastResultRef.current = next;
      }
      lastStateRef.current = s;
      lastSelectorRef.current = selectorRef.current;
    }
    return lastResultRef.current;
  };

  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

export function useSandboxConfig(): PostextConfig {
  return useSandboxSelector((s) => s.config);
}

export function useSandboxLabels() {
  return useSandboxSelector((s) => s.labels);
}

export function useSandboxResources(): Resource[] {
  return useSandboxSelector((s) => s.resources);
}

export interface SandboxPresetsValue {
  presets: PresetSummary[];
  activePresetId: string;
  status: SandboxState['presetStatus'];
  error?: string;
  /** True while the document, configuration and resources still match what
   *  the active preset applied (reloading it is then a no-op worth no
   *  confirmation). */
  untouched: boolean;
  /** The active preset's bundle changed on its source while there are local
   *  edits; `reload('all')` picks the new version up and clears this. */
  stale: boolean;
  /** Non-null for a few seconds after the preset was re-applied automatically
   *  because its bundle changed. */
  updatedAt: number | null;
  /** Presets hidden from the panel ("deleted" — restorable). */
  hiddenIds: string[];
  /** The content locale the active preset was loaded in (a bilingual
   *  bundle's second language stays active across reloads); null in
   *  project mode or when unknown. */
  activeLocale: string | null;
  /** The book on screen is a preset with edits (a saved draft). */
  edited: boolean;
  /** Saved drafts of presets, per content locale. */
  drafts: PresetDraftSummary[];
  /** Covers taken from the first page of presets that ship none, by
   *  `presetCoverKey`. */
  covers: Record<string, string>;
  load: (id: string, locale?: string) => Promise<boolean>;
  reload: (parts: PresetApplyParts) => Promise<void>;
  restoreOriginal: (presetId: string) => Promise<void>;
  hide: (id: string) => void;
  unhide: (id: string) => void;
}

/** Whether the book on screen still is what the active preset applied. */
function untouchedOf(s: SandboxState): boolean {
  return isDocumentUntouched(s, s.presetApplied);
}

/** Preset list plus load/reload actions. Re-renders on preset state changes
 *  only (`untouched` is a boolean projection, so document edits re-render
 *  consumers only when it flips). */
export function useSandboxPresets(): SandboxPresetsValue {
  const store = useStore();
  const presets = useSandboxSelector((s) => s.presetSummaries);
  const activePresetId = useSandboxSelector((s) => s.activePresetId);
  const status = useSandboxSelector((s) => s.presetStatus);
  const error = useSandboxSelector((s) => s.presetError);
  const untouched = useSandboxSelector((s) => isDocumentUntouched(s, s.presetApplied));
  const stale = useSandboxSelector((s) => s.presetStale);
  const updatedAt = useSandboxSelector((s) => s.presetUpdatedAt);
  const hiddenIds = useSandboxSelector((s) => s.hiddenPresetIds);
  const edited = useSandboxSelector((s) => s.storeReady && s.activeProjectId === null && !untouchedOf(s));
  const drafts = useSandboxSelector((s) => s.presetDrafts);
  const covers = useSandboxSelector((s) => s.presetCovers);
  const activeLocale = useSandboxSelector((s) =>
    s.activeProjectId === null && s.presetApplied?.presetId === s.activePresetId
      ? s.presetApplied.locale ?? null
      : null);
  return {
    presets,
    activePresetId,
    status,
    error,
    untouched,
    stale,
    updatedAt,
    hiddenIds,
    activeLocale,
    edited,
    drafts,
    covers,
    load: store.loadPreset,
    reload: store.reloadPreset,
    restoreOriginal: store.restorePresetOriginal,
    hide: (id) => store.dispatch({ type: 'HIDE_PRESET', payload: id }),
    unhide: (id) => store.dispatch({ type: 'UNHIDE_PRESET', payload: id }),
  };
}

/** The live state, read on demand without subscribing (for work that runs
 *  later, e.g. in an idle callback, and must see the state of then). */
export function useSandboxStateGetter(): () => SandboxState {
  return useStore().getSnapshot;
}

/** Stores a cover taken from a book's first page (see covers/useAutoCover). */
export function useSandboxCoverSaver(): SandboxStore['saveBookCover'] {
  return useStore().saveBookCover;
}

/** Whether the active preset changed on its source while local edits exist
 *  (for the activity-bar badge). */
export function useSandboxPresetStale(): boolean {
  return useSandboxSelector((s) => s.presetStale);
}

export interface SandboxProjectsValue extends ProjectActions {
  projects: ProjectSummary[];
  activeProjectId: string | null;
  status: SandboxState['projectStatus'];
  error?: string;
  notice: string | null;
  /** True when the active document can be reset to a preset: preset mode, or
   *  a project whose source preset is still available. */
  hasResetBaseline: boolean;
  dismissNotice: () => void;
}

/** Local projects plus their operations. */
export function useSandboxProjects(): SandboxProjectsValue {
  const store = useStore();
  const projects = useSandboxSelector((s) => s.projects);
  const activeProjectId = useSandboxSelector((s) => s.activeProjectId);
  const status = useSandboxSelector((s) => s.projectStatus);
  const error = useSandboxSelector((s) => s.projectError);
  const notice = useSandboxSelector((s) => s.projectNotice);
  const hasResetBaseline = useSandboxSelector((s) => {
    if (s.activeProjectId === null) return true;
    const active = s.projects.find((p) => p.id === s.activeProjectId);
    const source = active?.sourcePresetId;
    return source !== undefined && s.presetSummaries.some((p) => p.id === source && p.available);
  });
  return {
    ...store.projectActions,
    projects,
    activeProjectId,
    status,
    error,
    notice,
    hasResetBaseline,
    dismissNotice: () => store.dispatch({ type: 'SET_PROJECT_NOTICE', payload: null }),
  };
}

/** The pending keep-or-replace question for a linked book the reader
 *  already has, and the way to answer it. */
export function useSandboxBundleReplacePrompt(): {
  prompt: SandboxState['bundleReplacePrompt'];
  answer: SandboxStore['answerBundleReplace'];
} {
  const store = useStore();
  const prompt = useSandboxSelector((s) => s.bundleReplacePrompt);
  return { prompt, answer: store.answerBundleReplace };
}

export function useSandboxActiveProjectId(): string | null {
  return useSandboxSelector((s) => s.activeProjectId);
}

/** The actions that open another book — a preset (in a locale) or a local
 *  project — without subscribing to any state. */
export function useSandboxBookActions(): {
  loadPreset: SandboxStore['loadPreset'];
  /** Open a project, in the edition `locale` when it keeps several (#903). */
  activateProject: (id: string, locale?: string) => Promise<void>;
  openHashBundle: SandboxStore['openHashBundle'];
  hashBundleKeys: readonly string[];
} {
  const store = useStore();
  return {
    loadPreset: store.loadPreset,
    activateProject: (id, locale) => (locale ? store.projectActions.switchEdition(id, locale) : store.projectActions.activate(id)),
    openHashBundle: store.openHashBundle,
    hashBundleKeys: store.hashBundleKeys,
  };
}

/** The books linked by a host fragment key (`hashBundles`): the URLs of
 *  their editions and the languages they are published in (#1011),
 *  without subscribing to any state. */
export function useSandboxLinkedBundles(): {
  resolver: SandboxStore['hashBundleResolver'];
  editions: SandboxStore['linkedBundleEditions'];
} {
  const store = useStore();
  // One object per store: hooks keep it among their dependencies.
  return useMemo(() => ({ resolver: store.hashBundleResolver, editions: store.linkedBundleEditions }), [store]);
}

/** The operations on the other editions a local project keeps, without
 *  subscribing to any state (#979). */
export function useSandboxEditionActions(): { renameFrameInEditions: ProjectActions['renameFrameInEditions'] } {
  const store = useStore();
  return { renameFrameInEditions: store.projectActions.renameFrameInEditions };
}

/** The provider of a preset, read on demand (see
 *  `SandboxStore.presetProvider`). */
export function useSandboxPresetProvider(): SandboxStore['presetProvider'] {
  return useStore().presetProvider;
}

/** Stable ref to the most recently built VDT document. Does not subscribe
 *  to state changes — read inside effects/handlers via `.current`. */
export function useSandboxDocRef(): MutableRefObject<VDTDocument | null> {
  return useStore().docRef;
}

/** A ref-like handle onto the persisted CodeMirror state of one chapter.
 *  Reading yields null until that chapter's editor has unmounted once. */
export function useSandboxEditorStateRef(chapterId: string): MutableRefObject<unknown | null> {
  const map = useStore().editorStatesRef;
  return useMemo<MutableRefObject<unknown | null>>(() => ({
    get current() { return map.current.get(chapterId) ?? null; },
    set current(v: unknown | null) {
      if (v === null || v === undefined) map.current.delete(chapterId);
      else map.current.set(chapterId, v);
    },
  }), [map, chapterId]);
}

/** Stable ref to the composed book the last built document came from. */
export function useSandboxDocSourceRef(): MutableRefObject<ComposedBook | null> {
  return useStore().docSourceRef;
}

/** One chapter's own document and the chapter-only book it was built from
 *  (its offsets are chapter offsets). */
export interface ChapterDocument {
  doc: VDTDocument;
  source: ComposedBook;
}

/** Stable ref to the per-chapter documents behind a whole-book canvas
 *  layout (see `SandboxStore.chapterDocsRef`). */
export function useSandboxChapterDocsRef(): MutableRefObject<Map<string, ChapterDocument>> {
  return useStore().chapterDocsRef;
}

/** Warnings for the current document, chapter-attributed. Recomputed a
 *  moment after the chapters, config, resources or the built document
 *  change — off the keystroke path, which only dispatches. */
export function useSandboxWarnings(): Warning[] {
  const store = useStore();
  const read = () => store.warningsRef.current;
  return useSyncExternalStore(store.subscribe, read, read);
}

/** The guide in every edition (English, Spanish, Simplified Chinese). */
export const SAMPLE_DOCUMENTS = GUIDE_SAMPLE_DOCUMENTS;

/** The book slice (chapters, active chapter). */
export function useBookContent(): BookContent {
  const chapters = useSandboxSelector((s) => s.chapters);
  const activeChapterId = useSandboxSelector((s) => s.activeChapterId);
  return useMemo(() => ({ chapters, activeChapterId }), [chapters, activeChapterId]);
}

/** How every chapter is laid out on its own: what it inherits from the
 *  chapters before it and, once their layouts are known, its page range. */
export function useBookPlan(): BookPlan {
  const store = useStore();
  return useSandboxSelector((s) => store.getPlan(s));
}

/** Page ranges of the chapters whose pagination is known. */
export function useBookPages(): BookPages {
  return useBookPlan().bookPages;
}

export interface LayoutSource {
  /** The active chapter, composed on its own (its offsets are chapter
   *  offsets, so clicks map back directly). */
  book: ComposedBook;
  chapterId: string;
  /** The chapter's own text, as stored — what a layout record is keyed on. */
  chapterMarkdown: string;
  /** What the engine inherits from the chapters before this one. */
  continuation: LayoutContinuation | undefined;
  plan: ChapterPlan;
}

/** The document the previews (and warnings) lay out: the active chapter,
 *  continued after the chapters before it. Memoised on its inputs, so
 *  unrelated state changes reuse it. */
export function useLayoutSource(): LayoutSource {
  const chapters = useSandboxSelector((s) => s.chapters);
  const activeChapterId = useSandboxSelector((s) => s.activeChapterId);
  // The plan is selected by its layout inputs, not by identity: recording
  // a layout (this preview's own build landing, or a background one)
  // re-derives every plan as new objects, and a source that changed with
  // them would rebuild — and record — again, without end.
  const chapterPlan = useChapterPlan(activeChapterId, sameLayoutInputs);
  return useMemo(() => {
    const book = composeBookMemo(chapters, activeChapterId);
    const chapter = chapters.find((c) => c.id === activeChapterId) ?? chapters[0]!;
    return { book, chapterId: chapter.id, chapterMarkdown: chapter.markdown, continuation: chapterPlan.continuation, plan: chapterPlan };
  }, [chapters, activeChapterId, chapterPlan]);
}

/** The plan of one chapter; falls back to the first chapter's for an
 *  unknown id. */
export function useChapterPlan(
  chapterId: string,
  isEqual: (a: ChapterPlan, b: ChapterPlan) => boolean = Object.is,
): ChapterPlan {
  const store = useStore();
  return useSandboxSelector((s) => {
    const plan = store.getPlan(s);
    return plan.byId[chapterId] ?? plan.chapters[0]!;
  }, isEqual);
}
