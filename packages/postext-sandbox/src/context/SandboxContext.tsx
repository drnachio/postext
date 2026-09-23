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
import { stripConfigDefaults } from 'postext';
import type { PanelId, ViewportTab, SandboxLabels } from '../types';
import { DEFAULT_LABELS } from '../types';
import { EMPTY_VIEW_HASH, readViewHash, sameBook, type ViewHash, type ViewHashBook } from '../storage/viewHash';
import { loadConfig, loadBook, loadViewport, loadSidebarPercent, loadPanel, loadPresetApplied, loadPresetId, loadProjectId, loadHiddenPresetIds, saveConfig, saveBook, saveViewport, saveSidebarPercent, savePanel, savePresetApplied, saveProjectId, saveHiddenPresetIds } from '../storage/persistence';
import { loadResources, saveResource, deleteResource } from '../storage/resources';
import { customFontsSignature, setCustomFonts } from '../controls/fontLoader';
import { pruneFontFiles } from '../storage/fontStorage';
import { pruneBlobs } from '../storage/blobStore';
import { collectProjectFileIds, generateChapterId, listProjects, referencedFileIds, toSummary, updateProject } from '../storage/projects';
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
  singleChapterBook,
  splitChapterAt,
  splitChapterAtHeadings,
} from '../book/chapterOps';
import { composeBookMemo } from '../book/compose';
import { hidePresetId, unhidePresetId } from '../presets/hidden';
import { computeWarnings } from '../warnings/compute';
import type { Warning } from '../warnings/types';
import { hasIndexedDB } from '../storage/blobStore';
import { DEFAULT_MARKDOWN_EN, DEFAULT_MARKDOWN_ES } from '../defaultMarkdown';
import { createDefaultConfig, withDefaultResourceTypes } from './defaultConfig';
import { createProjectActions } from './projectActions';
import type { ProjectActions } from './projectActions';
import {
  BUILTIN_PRESET_ID,
  applyPreset,
  createPostextGuidePreset,
  decidePresetUpdate,
  findDefaultPrivatePreset,
  isDocumentUntouched,
  listPresets,
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
  activePanel: PanelId | null;
  sidebarPercent: number;
  sidebarDragging: boolean;
  activeViewport: ViewportTab;
  labels: SandboxLabels;
  locale: string;
  selection: EditorSelection;
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
  | { type: 'SET_RESOURCES'; payload: Resource[] }
  | { type: 'SET_STORE_READY' }
  | { type: 'UPSERT_RESOURCE'; payload: Resource }
  | { type: 'DELETE_RESOURCE'; payload: string }
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
  | { type: 'SET_PROJECT_NOTICE'; payload: string | null };

const EMPTY_SELECTION: EditorSelection = { from: 0, to: 0, head: 0 };

/** Adopt a book slice and re-derive the active-chapter mirror. Returns
 *  `state` itself when nothing changed. */
function withBook(state: SandboxState, book: BookContent, resetSelection = false): SandboxState {
  const canvasScope = book.canvasScope ?? 'chapter';
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
      return { ...state, activeViewport: action.payload };
    case 'SET_SELECTION':
      if (
        state.selection.from === action.payload.from &&
        state.selection.to === action.payload.to &&
        state.selection.head === action.payload.head
      ) {
        return state;
      }
      return { ...state, selection: action.payload };
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
      return { ...base, pendingEditorFocus: action.payload };
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
      return state.storeReady ? state : { ...state, storeReady: true };
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
        presetConfig: action.payload.config ?? state.presetConfig,
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
  /** Re-fetch the active preset and re-apply the given parts. */
  reloadPreset: (parts: PresetApplyParts) => Promise<void>;
  projectActions: ProjectActions;
}

export interface SandboxContextValue {
  state: SandboxState;
  dispatch: Dispatch<SandboxAction>;
  docRef: MutableRefObject<VDTDocument | null>;
}

const SandboxStoreContext = createContext<SandboxStore | null>(null);

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
  load: (id: string, locale?: string) => Promise<boolean>;
  reload: (parts: PresetApplyParts) => Promise<void>;
  hide: (id: string) => void;
  unhide: (id: string) => void;
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
    load: store.loadPreset,
    reload: store.reloadPreset,
    hide: (id) => store.dispatch({ type: 'HIDE_PRESET', payload: id }),
    unhide: (id) => store.dispatch({ type: 'UNHIDE_PRESET', payload: id }),
  };
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

export function useSandboxActiveProjectId(): string | null {
  return useSandboxSelector((s) => s.activeProjectId);
}

/** The actions that open another book — a preset (in a locale) or a local
 *  project — without subscribing to any state. */
export function useSandboxBookActions(): { loadPreset: SandboxStore['loadPreset']; activateProject: ProjectActions['activate'] } {
  const store = useStore();
  return { loadPreset: store.loadPreset, activateProject: store.projectActions.activate };
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

const SAMPLE_DOCUMENTS = [DEFAULT_MARKDOWN_EN, DEFAULT_MARKDOWN_ES];

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
  const [state, dispatch] = useReducer(sandboxReducer, undefined, () => {
    const savedBook = loadBook(migration);
    const loadedBook = savedBook ?? singleChapterBook(defaultMd, generateChapterId(), mergedLabels.presetPostextGuideName);
    // A `#chapter=C` fragment (a reload, a shared link) names the chapter to
    // open; the viewers restore its page (see `useChapterHashSync`). The
    // `view=` part picks the viewer tab over the one last used.
    const initialHash = initialHashRef.current ?? EMPTY_VIEW_HASH;
    const hashChapter = initialHash.chapter;
    const hashChapterId = hashChapter === null ? undefined : loadedBook.chapters[hashChapter]?.id;
    const book = hashChapterId ? { ...loadedBook, activeChapterId: hashChapterId } : loadedBook;
    const savedConfig = loadConfig();
    const savedViewport = loadViewport() as ViewportTab | null;
    const savedPercent = loadSidebarPercent();
    const savedPanel = loadPanel() as PanelId | null | undefined;

    return {
      markdown: activeChapter(book).markdown,
      chapters: book.chapters,
      activeChapterId: book.activeChapterId,
      pdfScope: book.canvasScope ?? 'chapter',
      canvasScope: book.canvasScope ?? 'chapter',
      chapterLayouts: {},
      hiddenPresetIds: loadHiddenPresetIds(),
      config: withDefaultResourceTypes(
        savedConfig ?? initialConfig ?? createDefaultConfig(locale ?? 'en'),
        locale ?? 'en',
      ),
      resources: [],
      storeReady: false,
      activePanel: savedPanel !== undefined ? savedPanel : ('markdown' as PanelId),
      sidebarPercent: savedPercent ?? 25,
      sidebarDragging: false,
      activeViewport: initialHash.view ?? (savedViewport as ViewportTab) ?? ('canvas' as ViewportTab),
      labels: mergedLabels,
      locale: locale ?? 'en',
      selection: { from: 0, to: 0, head: 0 },
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
      presetApplied: loadPresetApplied(),
      presetStale: false,
      presetUpdatedAt: null,
      activeProjectId: loadProjectId(),
      projects: [],
      projectStatus: 'idle' as const,
      projectNotice: null,
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

  /** Resolves to whether the preset was applied (false: superseded by a
   *  newer load, or failed). */
  const runPreset = async (provider: PresetProvider, parts: PresetApplyParts, locale?: string): Promise<boolean> => {
    const seq = ++presetLoadSeqRef.current;
    dispatch({ type: 'SET_PRESET_STATUS', payload: { status: 'loading' } });
    try {
      // Fingerprint first: a bundle edit that lands while `load()` is running
      // then still differs from the snapshot and gets picked up by the watch.
      const fingerprint = provider.fingerprint ? await provider.fingerprint() : null;
      if (seq !== presetLoadSeqRef.current) return false;
      // The content locale: the one asked for, else the one this preset is
      // already loaded in (a reload keeps the language the user picked),
      // else the viewer's.
      const applied = stateRef.current.presetApplied;
      const keep = applied?.presetId === provider.summary.id ? applied.locale : undefined;
      const loaded = await provider.load(locale ?? keep ?? stateRef.current.locale);
      if (seq !== presetLoadSeqRef.current) return false;
      const { chapters, config, resources } = stateRef.current;
      await applyPreset(loaded, dispatch, { parts, fingerprint, current: { chapters, config, resources } });
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

  useEffect(() => {
    let cancelled = false;
    const loc = locale ?? 'en';
    Promise.all([
      loadResources(),
      listPresets({ sources: presetSources, builtin: builtinPresetRef.current }).catch(
        () => [builtinPresetRef.current],
      ),
      listProjects(),
    ])
      .then(async ([loaded, providers, projects]) => {
        if (cancelled) return;
        presetProvidersRef.current = providers;
        dispatch({ type: 'SET_PROJECT_LIST', payload: projects.map(toSummary) });
        projectsLoadedRef.current = true;
        // Layout records of chapters no book holds any more are dropped.
        void pruneChapterLayoutStore(new Set([
          ...projects.flatMap((p) => p.chapters.map((c) => c.id)),
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
        const pristineOtherLocale =
          isPristineBook(currentBook, SAMPLE_DOCUMENTS) && currentBook.chapters[0]!.markdown !== defaultMd;
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

        // A permalink names the book to open (`#preset=P&lang=L` or
        // `#project=ID`, see `viewHash.ts`): it wins over the book last
        // open — unless it is that book already, in the locale asked for. A
        // book this browser does not have (another person's project, a
        // preset no source lists) is passed over. The chapter and page it
        // names are applied once the store is ready (`useChapterHashSync`).
        const wanted = initialHashRef.current ?? EMPTY_VIEW_HASH;
        const before = stateRef.current;
        const onScreen: ViewHashBook = {
          project: before.activeProjectId,
          preset: before.activeProjectId === null ? before.activePresetId : null,
          lang: before.activeProjectId === null && before.presetApplied?.presetId === before.activePresetId
            ? before.presetApplied.locale ?? null
            : null,
        };
        if (!sameBook(wanted, onScreen)) {
          if (wanted.project !== null && projects.some((p) => p.id === wanted.project)) {
            await projectActions.activate(wanted.project).catch(() => undefined);
            return;
          }
          const provider = wanted.preset === null ? undefined : providers.find((p) => p.summary.id === wanted.preset);
          if (provider) {
            if (before.activeProjectId !== null) {
              await flushWorkingSaveRef.current();
              dispatch({ type: 'SET_ACTIVE_PROJECT', payload: { id: null } });
              saveProjectId(null);
            }
            await runPresetRef.current(provider, 'all', wanted.lang ?? loc);
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
          await runPresetRef.current(privateDefault, 'all');
          return;
        }
        if (loaded.length === 0 || pristineOtherLocale) {
          // First entry (empty store) or locale switch: seed the built-in
          // preset. A pristine document takes the sample markdown too (and a
          // fresh config only when none was ever saved); an edited document
          // with an emptied store just gets its example resources back.
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

  // Auto-save the working state (debounced, skip until hydrated): markdown and
  // config to localStorage always, and the three slices into the active
  // project when there is one. Reads the live state so a flush before a
  // switch writes exactly what is on screen.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const persistWorking = (): Promise<void> => {
    const s = stateRef.current;
    saveBook(bookOf(s));
    saveConfig(s.config);
    if (!s.activeProjectId) return Promise.resolve();
    return updateProject(s.activeProjectId, {
      chapters: s.chapters,
      activeChapterId: s.activeChapterId,
      canvasScope: s.canvasScope,
      config: stripConfigDefaults(s.config),
      resources: s.resources,
    }).then(() => undefined, () => undefined);
  };
  const flushWorkingSave = (): Promise<void> => {
    if (saveTimerRef.current === undefined) return Promise.resolve();
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = undefined;
    return persistWorking();
  };
  const discardWorkingSave = (): void => {
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = undefined;
  };
  const flushWorkingSaveRef = useRef(flushWorkingSave);
  flushWorkingSaveRef.current = flushWorkingSave;
  const discardWorkingSaveRef = useRef(discardWorkingSave);
  discardWorkingSaveRef.current = discardWorkingSave;

  useEffect(() => {
    if (!hydratedRef.current) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = undefined;
      void persistWorking();
    }, WORKING_SAVE_MS);
    return () => clearTimeout(saveTimerRef.current);
  }, [state.chapters, state.activeChapterId, state.config, state.resources, state.activeProjectId]);

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
  const getWarnings = (s: SandboxState): Warning[] => {
    const key = [s.chapters, s.activeChapterId, s.config, s.resources, s.docVersion, s.canvasScope, s.activeViewport];
    const cached = warningsCacheRef.current;
    if (cached && cached.key.every((k, i) => k === key[i])) return cached.value;
    const chapterBook = composeBookMemo(s.chapters, s.activeChapterId);
    // Warnings are the active chapter's. With the canvas showing the whole
    // book, the stitched document in `docRef` spans every chapter; the
    // chapter's own document (chapter offsets, like `book`) is read
    // instead — or none, while it has not been laid out. The HTML preview
    // lays the whole book out as one document with book offsets: its own
    // composition is read then, and the other chapters' warnings dropped.
    const stitched = s.canvasScope === 'book' && s.activeViewport === 'canvas';
    const wholeSource = s.canvasScope === 'book' && s.activeViewport === 'html' ? docSourceRef.current : null;
    const whole = wholeSource !== null && wholeSource.scope === 'book' ? wholeSource : null;
    const book = whole ?? chapterBook;
    const doc = stitched ? chapterDocsRef.current.get(s.activeChapterId)?.doc ?? null : docRef.current;
    const all = computeWarnings({
      markdown: book.markdown,
      config: s.config,
      doc: wholeSource !== null && whole === null ? null : doc,
      resources: s.resources,
      storageUnavailable: !hasIndexedDB(),
      book,
      chapterTitles: new Map(s.chapters.map((c) => [c.id, c.title])),
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
  const { chapters: warnChapters, activeChapterId: warnChapterId, config: warnConfig, resources: warnResources, docVersion: warnDocVersion } = state;
  useEffect(() => {
    const timer = setTimeout(() => {
      warningsRef.current = getWarningsRef.current(stateRef.current);
      for (const cb of listenersRef.current) cb();
    }, WARNINGS_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [warnChapters, warnChapterId, warnConfig, warnResources, warnDocVersion]);

  const projectActions = useMemo<ProjectActions>(() => createProjectActions({
    dispatch,
    getState: () => stateRef.current,
    getProviders: () => presetProvidersRef.current,
    getBuiltin: () => builtinPresetRef.current,
    runPreset: (provider, parts) => runPresetRef.current(provider, parts),
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
    loadPreset: async (id, locale) => {
      const provider = presetProvidersRef.current.find((p) => p.summary.id === id);
      if (!provider) return false;
      // Leaving a project: its last edits are written first, then the
      // working state stops mirroring anything.
      if (stateRef.current.activeProjectId !== null) {
        await flushWorkingSaveRef.current();
        dispatch({ type: 'SET_ACTIVE_PROJECT', payload: { id: null } });
        saveProjectId(null);
      }
      // A fresh load (not a reload of the active preset) of a bundle that
      // was applied in another language earlier must not inherit it.
      const fresh = stateRef.current.activePresetId !== id || stateRef.current.activeProjectId !== null;
      return runPresetRef.current(provider, 'all', locale ?? (fresh ? stateRef.current.locale : undefined));
    },
    reloadPreset: async (parts) => {
      if (stateRef.current.activeProjectId !== null) {
        await projectActions.resetToSource(parts);
        return;
      }
      const activeId = stateRef.current.activePresetId;
      const provider =
        presetProvidersRef.current.find((p) => p.summary.id === activeId) ?? builtinPresetRef.current;
      await runPresetRef.current(provider, parts);
    },
    projectActions,
  }), [dispatch, projectActions]);

  return (
    <SandboxStoreContext.Provider value={store}>
      {children}
    </SandboxStoreContext.Provider>
  );
}
