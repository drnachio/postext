'use client';

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useRef,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
  type Dispatch,
  type MutableRefObject,
} from 'react';
import type { PostextConfig, VDTDocument, Resource, LayoutContinuation } from 'postext';
import { clearMeasurementCache, stripConfigDefaults } from 'postext';
import { PROJECT_RECORD_VERSION } from '../storage/projectMigration';
import type { PanelId, ViewportTab, SandboxLabels } from '../types';
import type { HashBundleResolver } from '../types/props';
import { DEFAULT_LABELS } from '../types';
import {
  EMPTY_VIEW_HASH,
  hashNamesOtherBook,
  parseHashBundle,
  isViewportTab,
  readViewHash,
  writeViewHash,
  type HashBundleRef,
  type ViewHash,
  type ViewHashBook,
} from '../storage/viewHash';
import { loadConfig, loadStoredConfig, loadBook, loadViewport, loadSidebarPercent, loadPanel, loadPresetApplied, loadPresetId, loadProjectId, loadHiddenPresetIds, loadViewerLocale, saveConfig, saveBook, saveViewport, saveSidebarPercent, savePanel, savePresetApplied, savePresetId, saveProjectId, saveHiddenPresetIds, saveViewerLocale } from '../storage/persistence';
import { loadResources, saveResource, deleteResource } from '../storage/resources';
import { customFontsSignature, setCustomFonts } from '../controls/fontLoader';
import { pruneFontFiles } from '../storage/fontStorage';
import { pruneBlobs } from '../storage/blobStore';
import { collectProjectFileIds, generateChapterId, listProjects, referencedFileIds, toSummary, updateProject } from '../storage/projects';
import {
  decideDraftSave,
  deletePresetDraft,
  getPresetDraft,
  listPresetDrafts,
  preserveDraftBlobs,
  presetDraftKey,
  putPresetDraft,
  toDraftSummary,
  type PresetDraftRecord,
  type PresetDraftSummary,
} from '../storage/presetDrafts';
import { createSaveScheduler, type SaveScheduler } from '../storage/saveScheduler';
import { getBlob, putBlobAt } from '../storage/blobStore';
import { effectiveCanvasScope, wholeBookAllowed } from '../book/scope';
import { choosePresetOpen, isEditionOnScreen, linkNamesBookOnScreen, presetReaderLocale } from '../presets/locale';
import { fetchBundleBytes, openHashBundle } from './hashBundle';
import { getChapterLayouts, pruneChapterLayoutStore, putChapterLayouts } from '../storage/layouts';
import type { ProjectSummary } from '../storage/projects';
import type { BookContent, BookPages, BookPlan, Chapter, ChapterLayout, ChapterPlan, ComposedBook, LayoutScope } from '../book/types';
import { createBookPlanner, sameChapterLayout, sameLayoutInputs } from '../book/pagination';
import {
  activeChapter,
  addChapter,
  isPristineBook,
  mergeWithPrevious,
  moveChapter,
  removeChapter,
  renameChapter,
  replaceChapterMarkdown,
  sampleBook,
  splitChapterAt,
  splitChapterAtHeadings,
} from '../book/chapterOps';
import { composeBookMemo } from '../book/compose';
import { hidePresetId, unhidePresetId } from '../presets/hidden';
import { computeWarnings } from '../warnings/compute';
import type { Warning } from '../warnings/types';
import { hasIndexedDB } from '../storage/blobStore';
import { folioSupported } from '../viewport/folioSupport';
import { onUnavailableResourceImagesChange, unavailableResourceImages } from '../controls/resourceImages';
import { onPdfFontChecksChange, pdfFontChecks, pdfFontChecksFor } from '../controls/pdfFontWarnings';
import { DEFAULT_MARKDOWN_EN } from '../defaultMarkdown';
import { withDefaultResourceTypes } from './defaultConfig';
import { createPostextGuideConfig } from './guideConfig';
import { createProjectActions } from './projectActions';
import type { ProjectActions } from './projectActions';
import { presetCoverKey, type CoverTarget } from '../covers/autoCover';
import { bytesToDataUrl, listPresetCovers, putPresetCoverIfMissing } from '../storage/presetCovers';
import {
  BUILTIN_PRESET_ID,
  GUIDE_SAMPLE_DOCUMENTS,
  applyPreset,
  createPostextGuidePreset,
  decidePresetUpdate,
  findDefaultPrivatePreset,
  isDocumentUntouched,
  listPresets,
  pristineGuideFollowsViewer,
  rekeyMigratedConfig,
} from '../presets';
import type {
  AppliedPresetSnapshot,
  PresetApplyParts,
  PresetProvider,
  PresetSourceSpec,
  PresetSummary,
} from '../presets';

export { createDefaultConfig } from './defaultConfig';
export type { ProjectSummary } from '../storage/projects';
export type { BookContent, Chapter, LayoutScope } from '../book/types';
export type { DuplicateSource } from './projectActions';

export interface EditorSelection {
  from: number;
  to: number;
  head: number;
}

export interface PendingEditorFocus {
  chapterId?: string;
  anchor: number;
  head: number;
  selectWord: boolean;
  /** Set when the request comes from a click or a selection on a page of
   *  the preview: a chapter switch it causes keeps the viewer where it is
   *  (the reader is already looking at the chapter). */
  fromViewer?: boolean;
}

/** Which editable run of a resource a preview click / panel selection refers
 *  to: a table cell, the caption, the note, or (SVG figures) a text node in
 *  the SVG source. */
export type ResourceFocusTarget =
  | { kind: 'cell'; row: number; col: number }
  | { kind: 'caption' }
  | { kind: 'note' }
  | { kind: 'svgText' };

/** A request, raised by a preview click, to focus a resource's editor in the
 *  Resources panel with the given selection (offsets in the run's own text —
 *  the cell / caption / note string, or the SVG source). Consumed and cleared
 *  by the panel, like `pendingEditorFocus` for the Markdown editor. */
export interface PendingResourceFocus {
  resourceId: string;
  target: ResourceFocusTarget;
  anchor: number;
  head: number;
  selectWord: boolean;
}

/** The live selection inside a resource's editor, mirrored back onto the
 *  previews as a highlight. `null` when no resource field has focus. */
export interface ResourceSelection {
  resourceId: string;
  target: ResourceFocusTarget;
  from: number;
  to: number;
  head: number;
}

function sameResourceTarget(a: ResourceFocusTarget, b: ResourceFocusTarget): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'cell' && b.kind === 'cell') return a.row === b.row && a.col === b.col;
  return true;
}

export interface SandboxState {
  /** The ACTIVE chapter's text — a mirror of `chapters[active].markdown`
   *  kept in sync by the reducer so the editor and single-document
   *  consumers keep a plain string. Edit through `SET_MARKDOWN`. */
  markdown: string;
  /** Every chapter of the book, in order. Always at least one. */
  chapters: Chapter[];
  activeChapterId: string;
  /** What the PDF viewer renders: the whole book or the active chapter.
   *  Not persisted: a proof is rendered on request. */
  pdfScope: LayoutScope;
  /** What the canvas lays out: the whole book (every chapter, laid out one
   *  after the other and shown as one continuous document) or the active
   *  chapter continued after the ones before it. Kept with the book (the
   *  working copy and the project record); a preset's `view` seeds it. The
   *  HTML preview always lays out the active chapter. */
  canvasScope: LayoutScope;
  /** What the last layout of each chapter on its own recorded (page count
   *  and how its numbering ends), keyed by chapter id. Chapters are laid out
   *  one at a time; the layouts of the chapters before the active one give
   *  it its first page number (see `book/pagination.ts`). */
  chapterLayouts: Record<string, ChapterLayout>;
  /** Preset ids the user hid from the Projects panel (never the built-in). */
  hiddenPresetIds: string[];
  config: PostextConfig;
  /** User-managed resources (images, SVGs, tables). Loaded asynchronously on
   *  init from IndexedDB (NOT localStorage) and persisted via an effect. */
  resources: Resource[];
  /** True once the mount-time load from IndexedDB (resources, presets,
   *  projects) has landed and any initial preset seeding is done. Until then
   *  `resources` is the empty placeholder, so a build would render every
   *  `:ref` as unresolved; viewports that do not rebuild on their own (PDF)
   *  wait for it. */
  storeReady: boolean;
  /** The page was opened on a link to another book than the one stored as
   *  open (`#preset=…`, `#project=…`, a host bundle key): the stored book is
   *  not shown at all — the sandbox shows its loading state until the
   *  linked book is on screen (cleared with `storeReady`). */
  booting: boolean;
  /** Another book is being opened (a row click, a link): the viewport
   *  shows a loading state instead of the book that is being left. */
  bookLoading: boolean;
  /** Presets with a saved draft (their edited copy), per content locale. */
  presetDrafts: PresetDraftSummary[];
  /** Covers taken from the first page of presets that ship none, as data
   *  URLs by preset id and content locale (`presetCoverKey`). */
  presetCovers: Record<string, string>;
  activePanel: PanelId | null;
  sidebarPercent: number;
  sidebarDragging: boolean;
  activeViewport: ViewportTab;
  labels: SandboxLabels;
  locale: string;
  selection: EditorSelection;
  /** The editor selection was placed from the preview (a click or a drag on
   *  a page), not by the reader in the editor: the previews show it where
   *  it is and do not scroll to follow it. Set by a viewer focus request and
   *  kept through the selections the editor reports while it is in flight;
   *  the next selection made in the editor clears it. */
  selectionFromViewer: boolean;
  editorFocused: boolean;
  /** A request to place the editor caret. `chapterId` (when set) switches
   *  the active chapter first; offsets are chapter-local. */
  pendingEditorFocus: PendingEditorFocus | null;
  /** Resource open in the Resources panel's detail view (null = list view).
   *  Lives in shared state so a preview click can open it and so the choice
   *  survives switching panels. */
  activeResourceId: string | null;
  /** Focus request for a resource editor raised by a preview click. */
  pendingResourceFocus: PendingResourceFocus | null;
  /** Selection inside the focused resource editor, for the preview highlight. */
  resourceSelection: ResourceSelection | null;
  /** Incremented whenever a viewport publishes a new built VDTDocument to
   *  `docRef`. Consumers (e.g. WarningsPanel) listen to this counter to
   *  recompute derived data. */
  docVersion: number;
  /** Incremented whenever the whole book is replaced (a preset applied, a
   *  project opened, a bundle imported) — as opposed to edited chapter by
   *  chapter. The fragment syncs treat such a book as a new document. */
  bookVersion: number;
  /** Id of the preset the current document came from (`BUILTIN_PRESET_ID`
   *  until a preset is loaded). Reset actions restore this preset. */
  activePresetId: string;
  presetStatus: 'idle' | 'loading' | 'error';
  presetError?: string;
  /** Config as last applied from the active preset, when known. Used to tell
   *  whether the current config has overrides worth resetting. */
  presetConfig?: PostextConfig;
  /** Every preset the sandbox knows about, in display order. */
  presetSummaries: PresetSummary[];
  /** Fingerprint and content hashes recorded when the active preset was last
   *  applied (null until then). Persisted so the next visit can tell an
   *  untouched document from an edited one. */
  presetApplied: AppliedPresetSnapshot | null;
  /** The active preset changed on its source while the document has local
   *  edits: they are kept and the Presets panel offers a reload. */
  presetStale: boolean;
  /** Set (to a timestamp) right after the active preset was re-applied
   *  automatically because its bundle changed; cleared a few seconds later.
   *  Drives the brief "updated from disk" notice in the Presets panel. */
  presetUpdatedAt: number | null;
  /** Local project the working document is mirrored into; null while a
   *  read-only preset is active (edits then live only in the working state). */
  activeProjectId: string | null;
  /** Every stored project, oldest first. */
  projects: ProjectSummary[];
  projectStatus: 'idle' | 'busy' | 'error';
  projectError?: string;
  /** Transient message from the last project operation (export warnings). */
  projectNotice: string | null;
  /** A host bundle link names a book the reader imported before: the
   *  question whether to keep their copy or replace it (see
   *  `answerBundleReplace`). */
  bundleReplacePrompt: { projectId: string; name: string } | null;
}

export type SandboxAction =
  | { type: 'SET_MARKDOWN'; payload: string }
  | { type: 'SET_CONFIG'; payload: PostextConfig }
  | { type: 'UPDATE_CONFIG'; payload: Partial<PostextConfig> }
  | { type: 'TOGGLE_PANEL'; payload: PanelId }
  | { type: 'SET_PANEL'; payload: PanelId | null }
  | { type: 'SET_SIDEBAR_PERCENT'; payload: number }
  | { type: 'SET_SIDEBAR_DRAGGING'; payload: boolean }
  | { type: 'SET_VIEWPORT'; payload: ViewportTab }
  | { type: 'SET_SELECTION'; payload: EditorSelection }
  | { type: 'SET_EDITOR_FOCUSED'; payload: boolean }
  | { type: 'SET_PENDING_EDITOR_FOCUS'; payload: PendingEditorFocus | null }
  | { type: 'SET_BOOK'; payload: BookContent }
  | { type: 'ADD_CHAPTER'; payload: { chapter: Chapter; index?: number; activate?: boolean } }
  | { type: 'REMOVE_CHAPTER'; payload: string }
  | { type: 'RENAME_CHAPTER'; payload: { id: string; title: string } }
  | { type: 'MOVE_CHAPTER'; payload: { id: string; to: number } }
  | { type: 'SET_ACTIVE_CHAPTER'; payload: string }
  | { type: 'SET_PDF_SCOPE'; payload: LayoutScope }
  | { type: 'SET_CANVAS_SCOPE'; payload: LayoutScope }
  | { type: 'SPLIT_CHAPTER'; payload: { id: string; at: number; newId: string } }
  | { type: 'SPLIT_CHAPTER_AT_HEADINGS'; payload: { id: string; newIds: string[] } }
  | { type: 'MERGE_CHAPTER_WITH_PREVIOUS'; payload: string }
  | { type: 'SET_CHAPTER_LAYOUT'; payload: ChapterLayout }
  /** Stored records (storage, a bundle) for chapters that have none in memory yet. */
  | { type: 'SET_CHAPTER_LAYOUTS'; payload: Record<string, ChapterLayout> }
  | { type: 'HIDE_PRESET'; payload: string }
  | { type: 'UNHIDE_PRESET'; payload: string }
  | { type: 'SET_ACTIVE_RESOURCE'; payload: string | null }
  | { type: 'SET_PENDING_RESOURCE_FOCUS'; payload: PendingResourceFocus | null }
  | { type: 'SET_RESOURCE_SELECTION'; payload: ResourceSelection | null }
  | { type: 'BUMP_DOC_VERSION' }
  | { type: 'SET_PRESET_COVERS'; payload: Record<string, string> }
  | { type: 'ADD_PRESET_COVER'; payload: { key: string; url: string } }
  | { type: 'SET_RESOURCES'; payload: Resource[] }
  | { type: 'SET_STORE_READY' }
  | { type: 'SET_BOOK_LOADING'; payload: boolean }
  | { type: 'SET_PRESET_DRAFTS'; payload: PresetDraftSummary[] }
  | { type: 'UPSERT_PRESET_DRAFT'; payload: PresetDraftSummary }
  | { type: 'REMOVE_PRESET_DRAFT'; payload: string }
  | { type: 'UPSERT_RESOURCE'; payload: Resource }
  | { type: 'DELETE_RESOURCE'; payload: string }
  /** `config`, when the key is present (even undefined), replaces the
   *  preset's baseline configuration; without the key it is kept. */
  | { type: 'SET_PRESET'; payload: { id: string; config?: PostextConfig } }
  | { type: 'SET_PRESET_STATUS'; payload: { status: 'idle' | 'loading' | 'error'; error?: string } }
  | { type: 'SET_PRESET_LIST'; payload: PresetSummary[] }
  | { type: 'SET_PRESET_APPLIED'; payload: AppliedPresetSnapshot | null }
  | { type: 'SET_PRESET_STALE'; payload: boolean }
  | { type: 'SET_PRESET_UPDATED_AT'; payload: number | null }
  | { type: 'SET_ACTIVE_PROJECT'; payload: { id: string | null; sourcePresetId?: string } }
  | { type: 'SET_PROJECT_LIST'; payload: ProjectSummary[] }
  | { type: 'UPSERT_PROJECT_SUMMARY'; payload: ProjectSummary }
  | { type: 'REMOVE_PROJECT_SUMMARY'; payload: string }
  | { type: 'SET_PROJECT_STATUS'; payload: { status: SandboxState['projectStatus']; error?: string } }
  | { type: 'SET_PROJECT_NOTICE'; payload: string | null }
  | { type: 'SET_BUNDLE_REPLACE_PROMPT'; payload: SandboxState['bundleReplacePrompt'] };

/** The view to open on: the Canvas where the Folio is not offered. */
function usableViewport(view: ViewportTab): ViewportTab {
  return view === 'folio' && !folioSupported() ? 'canvas' : view;
}

const EMPTY_SELECTION: EditorSelection = { from: 0, to: 0, head: 0 };

/** Adopt a book slice and re-derive the active-chapter mirror. Returns
 *  `state` itself when nothing changed. */
function withBook(state: SandboxState, book: BookContent, resetSelection = false): SandboxState {
  // A book too long to be shown whole (see `book/scope.ts`) is shown a
  // chapter at a time, whatever it asks for.
  const canvasScope = effectiveCanvasScope(book.canvasScope, book.chapters.length);
  if (
    book.chapters === state.chapters &&
    book.activeChapterId === state.activeChapterId &&
    canvasScope === state.canvasScope
  ) return state;
  const chapterChanged = book.activeChapterId !== state.activeChapterId;
  return {
    ...state,
    chapters: book.chapters,
    activeChapterId: book.activeChapterId,
    canvasScope,
    // A book whose canvas is laid out whole exports whole too (see
    // `SET_CANVAS_SCOPE`).
    ...(canvasScope !== state.canvasScope ? { pdfScope: canvasScope } : {}),
    markdown: activeChapter(book).markdown,
    chapterLayouts: book.chapters === state.chapters ? state.chapterLayouts : pruneChapterLayouts(state.chapterLayouts, book.chapters),
    ...(resetSelection || chapterChanged ? { selection: EMPTY_SELECTION } : {}),
  };
}

/** Drop the layout records of chapters that are no longer in the book. */
function pruneChapterLayouts(layouts: Record<string, ChapterLayout>, chapters: Chapter[]): Record<string, ChapterLayout> {
  const ids = new Set(chapters.map((c) => c.id));
  const stale = Object.keys(layouts).filter((id) => !ids.has(id));
  if (stale.length === 0) return layouts;
  const next = { ...layouts };
  for (const id of stale) delete next[id];
  return next;
}

function bookOf(state: SandboxState): BookContent {
  return {
    chapters: state.chapters,
    activeChapterId: state.activeChapterId,
    ...(state.canvasScope === 'book' ? { canvasScope: state.canvasScope } : {}),
  };
}

export function sandboxReducer(state: SandboxState, action: SandboxAction): SandboxState {
  switch (action.type) {
    case 'SET_MARKDOWN': {
      if (action.payload === state.markdown) return state;
      const book = replaceChapterMarkdown(bookOf(state), state.activeChapterId, action.payload);
      return { ...state, chapters: book.chapters, markdown: action.payload };
    }
    case 'SET_BOOK': {
      const next = withBook(state, action.payload, true);
      return next === state ? state : { ...next, bookVersion: state.bookVersion + 1 };
    }
    case 'ADD_CHAPTER':
      return withBook(state, addChapter(bookOf(state), action.payload.chapter, action.payload.index, action.payload.activate ?? true));
    case 'REMOVE_CHAPTER': {
      const next = withBook(state, removeChapter(bookOf(state), action.payload));
      if (next === state) return state;
      return next.activeChapterId !== state.activeChapterId
        ? { ...next, pendingEditorFocus: null }
        : next;
    }
    case 'RENAME_CHAPTER':
      return withBook(state, renameChapter(bookOf(state), action.payload.id, action.payload.title));
    case 'MOVE_CHAPTER':
      return withBook(state, moveChapter(bookOf(state), action.payload.id, action.payload.to));
    case 'SET_ACTIVE_CHAPTER': {
      if (action.payload === state.activeChapterId) return state;
      if (!state.chapters.some((c) => c.id === action.payload)) return state;
      return withBook(state, { ...bookOf(state), activeChapterId: action.payload });
    }
    case 'SET_PDF_SCOPE':
      if (action.payload === state.pdfScope) return state;
      return { ...state, pdfScope: action.payload };
    case 'SET_CANVAS_SCOPE':
      if (action.payload === state.canvasScope) return state;
      if (action.payload === 'book' && !wholeBookAllowed(state.chapters.length)) return state;
      // The PDF follows the canvas by default — a book laid out whole on
      // the canvas is exported whole — until the PDF scope is picked by
      // hand, which holds until the canvas scope moves again.
      return { ...state, canvasScope: action.payload, pdfScope: action.payload };
    case 'SPLIT_CHAPTER':
      return withBook(state, splitChapterAt(bookOf(state), action.payload.id, action.payload.at, action.payload.newId));
    case 'SPLIT_CHAPTER_AT_HEADINGS': {
      const ids = [...action.payload.newIds];
      const { book } = splitChapterAtHeadings(bookOf(state), action.payload.id, () => ids.shift() ?? generateChapterId());
      return withBook(state, book);
    }
    case 'MERGE_CHAPTER_WITH_PREVIOUS':
      return withBook(state, mergeWithPrevious(bookOf(state), action.payload));
    case 'SET_CHAPTER_LAYOUT': {
      const layout = action.payload;
      if (!state.chapters.some((c) => c.id === layout.chapterId)) return state;
      // A record equivalent to the stored one changes nothing for the
      // chapters after it; keeping the state identity spares every plan
      // consumer (and the preview that just built) a needless re-derivation.
      if (sameChapterLayout(state.chapterLayouts[layout.chapterId], layout)) return state;
      return { ...state, chapterLayouts: { ...state.chapterLayouts, [layout.chapterId]: layout } };
    }
    case 'SET_CHAPTER_LAYOUTS': {
      // A record built in this session is at least as fresh as a stored
      // one: only chapters without a record take the stored one.
      const live = new Set(state.chapters.map((c) => c.id));
      const added = Object.values(action.payload).filter((l) => live.has(l.chapterId) && !state.chapterLayouts[l.chapterId]);
      if (added.length === 0) return state;
      const chapterLayouts = { ...state.chapterLayouts };
      for (const l of added) chapterLayouts[l.chapterId] = l;
      return { ...state, chapterLayouts };
    }
    case 'HIDE_PRESET': {
      const next = hidePresetId(state.hiddenPresetIds, action.payload);
      return next.length === state.hiddenPresetIds.length ? state : { ...state, hiddenPresetIds: next };
    }
    case 'UNHIDE_PRESET': {
      const next = unhidePresetId(state.hiddenPresetIds, action.payload);
      return next.length === state.hiddenPresetIds.length ? state : { ...state, hiddenPresetIds: next };
    }
    case 'SET_CONFIG':
      return { ...state, config: action.payload };
    case 'UPDATE_CONFIG':
      return { ...state, config: { ...state.config, ...action.payload } };
    case 'TOGGLE_PANEL':
      return {
        ...state,
        activePanel: state.activePanel === action.payload ? null : action.payload,
      };
    case 'SET_PANEL':
      return { ...state, activePanel: action.payload };
    case 'SET_SIDEBAR_PERCENT':
      return { ...state, sidebarPercent: action.payload };
    case 'SET_SIDEBAR_DRAGGING':
      return { ...state, sidebarDragging: action.payload };
    case 'SET_VIEWPORT':
      // A link may still name the Folio on a device that does not offer it.
      return { ...state, activeViewport: usableViewport(action.payload) };
    case 'SET_SELECTION':
      if (
        state.selection.from === action.payload.from &&
        state.selection.to === action.payload.to &&
        state.selection.head === action.payload.head
      ) {
        return state;
      }
      return {
        ...state,
        selection: action.payload,
        selectionFromViewer: state.pendingEditorFocus !== null ? state.selectionFromViewer : false,
      };
    case 'SET_EDITOR_FOCUSED':
      if (state.editorFocused === action.payload) return state;
      return { ...state, editorFocused: action.payload };
    case 'SET_PENDING_EDITOR_FOCUS': {
      if (state.pendingEditorFocus === action.payload) return state;
      if (
        state.pendingEditorFocus &&
        action.payload &&
        state.pendingEditorFocus.chapterId === action.payload.chapterId &&
        state.pendingEditorFocus.anchor === action.payload.anchor &&
        state.pendingEditorFocus.head === action.payload.head &&
        state.pendingEditorFocus.selectWord === action.payload.selectWord
      ) return state;
      // A focus request into another chapter switches the editor's document
      // in the same commit, so the keyed editor mounts and consumes it.
      const target = action.payload?.chapterId;
      const base = target && target !== state.activeChapterId && state.chapters.some((c) => c.id === target)
        ? withBook(state, { ...bookOf(state), activeChapterId: target })
        : state;
      return {
        ...base,
        pendingEditorFocus: action.payload,
        selectionFromViewer: action.payload ? action.payload.fromViewer === true : state.selectionFromViewer,
      };
    }
    case 'SET_ACTIVE_RESOURCE':
      if (state.activeResourceId === action.payload) return state;
      // Leaving a resource drops its stale focus request / selection so the
      // previews stop highlighting a run nobody is editing.
      return {
        ...state,
        activeResourceId: action.payload,
        pendingResourceFocus:
          state.pendingResourceFocus && state.pendingResourceFocus.resourceId === action.payload
            ? state.pendingResourceFocus
            : null,
        resourceSelection:
          state.resourceSelection && state.resourceSelection.resourceId === action.payload
            ? state.resourceSelection
            : null,
      };
    case 'SET_PENDING_RESOURCE_FOCUS': {
      const next = action.payload;
      const prev = state.pendingResourceFocus;
      if (prev === next) return state;
      if (
        prev && next &&
        prev.resourceId === next.resourceId &&
        sameResourceTarget(prev.target, next.target) &&
        prev.anchor === next.anchor &&
        prev.head === next.head &&
        prev.selectWord === next.selectWord
      ) return state;
      return { ...state, pendingResourceFocus: next };
    }
    case 'SET_RESOURCE_SELECTION': {
      const next = action.payload;
      const prev = state.resourceSelection;
      if (prev === next) return state;
      if (
        prev && next &&
        prev.resourceId === next.resourceId &&
        sameResourceTarget(prev.target, next.target) &&
        prev.from === next.from &&
        prev.to === next.to &&
        prev.head === next.head
      ) return state;
      return { ...state, resourceSelection: next };
    }
    case 'BUMP_DOC_VERSION':
      return { ...state, docVersion: state.docVersion + 1 };
    case 'SET_STORE_READY':
      return state.storeReady && !state.booting ? state : { ...state, storeReady: true, booting: false };
    case 'SET_BOOK_LOADING':
      return state.bookLoading === action.payload ? state : { ...state, bookLoading: action.payload };
    case 'SET_PRESET_DRAFTS':
      return { ...state, presetDrafts: action.payload };
    case 'SET_PRESET_COVERS':
      // Covers stored meanwhile (a capture that landed before the listing)
      // are kept: a cover is never replaced.
      return { ...state, presetCovers: { ...action.payload, ...state.presetCovers } };
    case 'ADD_PRESET_COVER':
      if (state.presetCovers[action.payload.key] !== undefined) return state;
      return { ...state, presetCovers: { ...state.presetCovers, [action.payload.key]: action.payload.url } };
    case 'UPSERT_PRESET_DRAFT': {
      const idx = state.presetDrafts.findIndex((d) => d.key === action.payload.key);
      const presetDrafts = idx === -1
        ? [...state.presetDrafts, action.payload]
        : state.presetDrafts.map((d) => (d.key === action.payload.key ? action.payload : d));
      return { ...state, presetDrafts };
    }
    case 'REMOVE_PRESET_DRAFT':
      if (!state.presetDrafts.some((d) => d.key === action.payload)) return state;
      return { ...state, presetDrafts: state.presetDrafts.filter((d) => d.key !== action.payload) };
    case 'SET_RESOURCES': {
      const ids = new Set(action.payload.map((r) => r.id));
      return {
        ...state,
        resources: action.payload,
        activeResourceId: state.activeResourceId !== null && ids.has(state.activeResourceId) ? state.activeResourceId : null,
        pendingResourceFocus: state.pendingResourceFocus && ids.has(state.pendingResourceFocus.resourceId) ? state.pendingResourceFocus : null,
        resourceSelection: state.resourceSelection && ids.has(state.resourceSelection.resourceId) ? state.resourceSelection : null,
      };
    }
    case 'UPSERT_RESOURCE': {
      const idx = state.resources.findIndex((r) => r.id === action.payload.id);
      const resources =
        idx === -1
          ? [...state.resources, action.payload]
          : state.resources.map((r) => (r.id === action.payload.id ? action.payload : r));
      return { ...state, resources };
    }
    case 'DELETE_RESOURCE': {
      const id = action.payload;
      return {
        ...state,
        resources: state.resources.filter((r) => r.id !== id),
        activeResourceId: state.activeResourceId === id ? null : state.activeResourceId,
        pendingResourceFocus: state.pendingResourceFocus?.resourceId === id ? null : state.pendingResourceFocus,
        resourceSelection: state.resourceSelection?.resourceId === id ? null : state.resourceSelection,
      };
    }
    case 'SET_PRESET':
      return {
        ...state,
        activePresetId: action.payload.id,
        presetConfig: 'config' in action.payload ? action.payload.config : state.presetConfig,
        presetStatus: 'idle',
        presetError: undefined,
      };
    case 'SET_PRESET_STATUS':
      return { ...state, presetStatus: action.payload.status, presetError: action.payload.error };
    case 'SET_PRESET_LIST':
      return { ...state, presetSummaries: action.payload };
    case 'SET_PRESET_APPLIED':
      // A fresh apply is by definition up to date with its source.
      return { ...state, presetApplied: action.payload, presetStale: false };
    case 'SET_PRESET_STALE':
      if (state.presetStale === action.payload) return state;
      return { ...state, presetStale: action.payload };
    case 'SET_PRESET_UPDATED_AT':
      if (state.presetUpdatedAt === action.payload) return state;
      return { ...state, presetUpdatedAt: action.payload };
    case 'SET_ACTIVE_PROJECT': {
      if (action.payload.id === null) {
        return state.activeProjectId === null ? state : { ...state, activeProjectId: null };
      }
      // A project's baseline is the preset it came from (Reset restores it);
      // preset bookkeeping — applied snapshot, staleness, notices — is preset
      // mode only and starts clean.
      return {
        ...state,
        activeProjectId: action.payload.id,
        activePresetId: action.payload.sourcePresetId ?? BUILTIN_PRESET_ID,
        presetConfig: undefined,
        presetApplied: null,
        presetStale: false,
        presetUpdatedAt: null,
        presetStatus: 'idle',
        presetError: undefined,
      };
    }
    case 'SET_PROJECT_LIST':
      return { ...state, projects: action.payload };
    case 'UPSERT_PROJECT_SUMMARY': {
      const idx = state.projects.findIndex((p) => p.id === action.payload.id);
      const projects = idx === -1
        ? [...state.projects, action.payload]
        : state.projects.map((p) => (p.id === action.payload.id ? action.payload : p));
      return { ...state, projects };
    }
    case 'REMOVE_PROJECT_SUMMARY':
      return { ...state, projects: state.projects.filter((p) => p.id !== action.payload) };
    case 'SET_PROJECT_STATUS':
      return { ...state, projectStatus: action.payload.status, projectError: action.payload.error };
    case 'SET_PROJECT_NOTICE':
      if (state.projectNotice === action.payload) return state;
      return { ...state, projectNotice: action.payload };
    case 'SET_BUNDLE_REPLACE_PROMPT':
      if (state.bundleReplacePrompt === action.payload) return state;
      return { ...state, bundleReplacePrompt: action.payload };
    default:
      return state;
  }
}

interface SandboxStore {
  getSnapshot: () => SandboxState;
  subscribe: (cb: () => void) => () => void;
  dispatch: Dispatch<SandboxAction>;
  /** Persisted CodeMirror state (doc, selection, undo history) per chapter
   *  id, so switching chapters keeps each one's history and caret. */
  editorStatesRef: MutableRefObject<Map<string, unknown>>;
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
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { state, dispatch: store.dispatch, docRef: store.docRef };
}

/** Stable dispatch reference — never triggers a re-render on state changes. */
export function useSandboxDispatch(): Dispatch<SandboxAction> {
  return useStore().dispatch;
}

/** Subscribe to a slice of state; component re-renders only when the selected
 *  value changes (by `isEqual`, defaults to `Object.is`). */
export function useSandboxSelector<T>(
  selector: (s: SandboxState) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const store = useStore();
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const isEqualRef = useRef(isEqual);
  isEqualRef.current = isEqual;
  const lastStateRef = useRef<SandboxState | null>(null);
  const lastSelectorRef = useRef<((s: SandboxState) => T) | null>(null);
  const lastResultRef = useRef<T>(undefined as T);

  const getSnapshot = () => {
    const s = store.getSnapshot();
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
  activateProject: ProjectActions['activate'];
  openHashBundle: SandboxStore['openHashBundle'];
  hashBundleKeys: readonly string[];
} {
  const store = useStore();
  return {
    loadPreset: store.loadPreset,
    activateProject: store.projectActions.activate,
    openHashBundle: store.openHashBundle,
    hashBundleKeys: store.hashBundleKeys,
  };
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
const SAMPLE_DOCUMENTS = GUIDE_SAMPLE_DOCUMENTS;

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
  // Host bundle links (`#recipe=…`): the resolvers are read live, the keys
  // and the link the page was opened with once.
  const hashBundlesRef = useRef(hashBundles);
  hashBundlesRef.current = hashBundles;
  const hashBundleKeys = useMemo(() => Object.keys(hashBundles ?? {}), [hashBundles]);
  const initialBundleRef = useRef<HashBundleRef | null | undefined>(undefined);
  if (initialBundleRef.current === undefined) {
    initialBundleRef.current = typeof window === 'undefined' ? null : parseHashBundle(window.location.hash, hashBundleKeys);
  }
  const [state, dispatch] = useReducer(sandboxReducer, undefined, () => {
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
      chapterLayouts: {},
      hiddenPresetIds: loadHiddenPresetIds(),
      config,
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
    const config = withDefaultResourceTypes(draft.config, loc);
    setCustomFonts(config.customFonts, { newBook: true });
    const book: BookContent = {
      chapters: draft.chapters,
      activeChapterId: draft.activeChapterId,
      ...(draft.canvasScope ? { canvasScope: draft.canvasScope } : {}),
    };
    dispatch({ type: 'SET_ACTIVE_PROJECT', payload: { id: null } });
    dispatch({ type: 'SET_PRESET', payload: { id: draft.presetId, config: draft.baseConfig ? withDefaultResourceTypes(draft.baseConfig, loc) : undefined } });
    dispatch({ type: 'SET_CONFIG', payload: config });
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
        const draft = await getPresetDraft(choice.draft.key);
        if (draft) {
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
        confirmReplace: (id) => new Promise<boolean>((resolve) => {
          bundleReplaceAnswerRef.current?.(false);
          bundleReplaceAnswerRef.current = resolve;
          const name = list.find((p) => p.id === id)?.name ?? stateRef.current.projects.find((p) => p.id === id)?.name ?? id;
          dispatch({ type: 'SET_BUNDLE_REPLACE_PROMPT', payload: { projectId: id, name } });
        }),
        removeProject: (id) => projectActions.remove(id, { offScreen: true }),
        fetchBytes: fetchBundleBytes,
        importBytes: (bytes, name, origin) => projectActions.importBundleBytes(bytes, name, { origin }),
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
        setDraftSummaries(drafts.map(toDraftSummary));
        projectsLoadedRef.current = true;
        // Layout records of chapters no book holds any more are dropped.
        void pruneChapterLayoutStore(new Set([
          ...projects.flatMap((p) => p.chapters.map((c) => c.id)),
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
          lang: before.activeProjectId === null && before.presetApplied?.presetId === before.activePresetId
            ? before.presetApplied.locale ?? null
            : null,
        };
        // `lang=zh-TW` names the `zh-Hant` edition on screen: it stays, and
        // is seeded below as any visit's book.
        if (!bundleRef && !linkNamesBookOnScreen(wanted, onScreen, summaries)) {
          if (wanted.project !== null && projects.some((p) => p.id === wanted.project)) {
            await saveOutgoing();
            await projectActions.activate(wanted.project).catch(() => undefined);
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
  }, [state.activePresetId, state.presetSummaries, state.activeProjectId]);

  // Auto-hide the "updated from disk" notice.
  useEffect(() => {
    if (state.presetUpdatedAt === null) return;
    const timer = window.setTimeout(
      () => dispatch({ type: 'SET_PRESET_UPDATED_AT', payload: null }),
      PRESET_NOTICE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [state.presetUpdatedAt]);

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
    const resources = resourcesOverride ?? (s.storeReady ? s.resources : null);
    if (!resources) return;
    if (s.activeProjectId) {
      await updateProject(s.activeProjectId, {
        chapters: s.chapters,
        activeChapterId: s.activeChapterId,
        canvasScope: s.canvasScope,
        config: stripConfigDefaults(s.config),
        resources,
      }).catch(() => undefined);
      return;
    }
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
        chapters: s.chapters,
        activeChapterId: s.activeChapterId,
        ...(s.canvasScope === 'book' ? { canvasScope: s.canvasScope } : {}),
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
  }, [state.chapters, state.activeChapterId, state.canvasScope, state.config, state.resources, state.activeProjectId, state.presetApplied, state.storeReady]);

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
  }, [state.chapters]);
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
  }, [state.chapters]);

  // Save viewport tab and active panel immediately (skip until hydrated)
  useEffect(() => {
    if (!hydratedRef.current) return;
    saveViewport(state.activeViewport);
  }, [state.activeViewport]);

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
    const key = [s.chapters, s.activeChapterId, s.config, s.resources, s.docVersion, s.canvasScope, s.activeViewport, imageStatusRef.current, pdfFontChecks(), s.bookVersion, s.pdfScope];
    const cached = warningsCacheRef.current;
    if (cached && cached.key.every((k, i) => k === key[i])) return cached.value;
    const chapterBook = composeBookMemo(s.chapters, s.activeChapterId);
    // Warnings are the active chapter's. With the canvas (or the folio)
    // showing the whole book, the stitched document in `docRef` spans
    // every chapter; the chapter's own document (chapter offsets, like
    // `book`) is read instead — or none, while it has not been laid out.
    // The HTML preview lays the whole book out as one document with book
    // offsets: its own composition is read then, and the other chapters'
    // warnings dropped.
    const stitched = s.canvasScope === 'book' && (s.activeViewport === 'canvas' || s.activeViewport === 'folio');
    const wholeSource = s.canvasScope === 'book' && s.activeViewport === 'html' ? docSourceRef.current : null;
    const whole = wholeSource !== null && wholeSource.scope === 'book' ? wholeSource : null;
    const book = whole ?? chapterBook;
    const doc = stitched ? chapterDocsRef.current.get(s.activeChapterId)?.doc ?? null : docRef.current;
    const fontChecks = pdfFontChecksFor(s);
    const all = computeWarnings({
      markdown: book.markdown,
      config: s.config,
      doc: wholeSource !== null && whole === null ? null : doc,
      resources: s.resources,
      storageUnavailable: !hasIndexedDB(),
      unavailableImages: unavailableResourceImages(),
      book,
      chapterTitles: new Map(s.chapters.map((c) => [c.id, c.title])),
      // Another book's are dropped; after an edit they are marked stale.
      pdfFontChecks: fontChecks.checks,
      pdfFontChecksStale: fontChecks.stale,
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
    const key = [s.chapters, s.config, s.resources, s.chapterLayouts];
    const cached = planCacheRef.current;
    if (cached && cached.key.every((k, i) => k === key[i])) return cached.value;
    const value = plannerRef.current.plan(s.chapters, s.config, s.resources, s.chapterLayouts);
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
    const offPdf = onPdfFontChecksChange(refresh);
    return () => {
      offImages();
      offPdf();
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
    editorStatesRef,
    docRef,
    warningsRef,
    docSourceRef,
    chapterDocsRef,
    getWarnings: (s) => getWarningsRef.current(s),
    getPlan: (s) => getPlanRef.current(s),
    loadPreset: (id, locale) => openPresetRef.current(id, locale),
    reloadPreset: async (parts) => {
      if (stateRef.current.activeProjectId !== null) {
        await projectActions.resetToSource(parts);
        return;
      }
      const activeId = stateRef.current.activePresetId;
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
  }), [dispatch, projectActions, hashBundleKeys]);

  return (
    <SandboxStoreContext.Provider value={store}>
      {children}
    </SandboxStoreContext.Provider>
  );
}
