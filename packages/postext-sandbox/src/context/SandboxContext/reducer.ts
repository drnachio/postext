'use client';

// The sandbox reducer, with the book helpers it applies chapter edits
// through (#1276: split out of SandboxContext.tsx).
import type { ViewportTab } from '../../types/index.js';
import { generateChapterId } from '../../storage/projects.js';
import { effectiveCanvasScope, wholeBookAllowed } from '../../book/scope.js';
import type { BookContent, ChapterLayout, Chapter } from '../../book/types.js';
import { sameChapterLayout } from '../../book/pagination.js';
import { activeChapter, replaceChapterMarkdown, addChapter, removeChapter, renameChapter, moveChapter, splitChapterAt, splitChapterAtHeadings, mergeWithPrevious } from '../../book/chapterOps.js';
import { changesApply, applyTextChanges } from '../../book/textChanges.js';
import { hidePresetId, unhidePresetId } from '../../presets/hidden.js';
import { folioSupported } from '../../viewport/folio/folioSupport.js';
import { BUILTIN_PRESET_ID } from '../../presets/index.js';
import { type EditorSelection, type SandboxState, type SandboxAction, sameResourceTarget } from './state.js';

/** The view to open on: the Canvas where the Folio is not offered. */
export function usableViewport(view: ViewportTab): ViewportTab {
  return view === 'folio' && !folioSupported() ? 'canvas' : view;
}

const EMPTY_SELECTION: EditorSelection = { from: 0, to: 0, head: 0 };

/** Adopt a book slice and re-derive the active-chapter mirror. Returns
 *  `state` itself when nothing changed. */
function withBook(state: SandboxState, book: BookContent, resetSelection = false): SandboxState {
  // A book too long to be shown whole (see `book/scope.ts`) is shown a
  // chapter at a time, whatever it asks for.
  const canvasScope = effectiveCanvasScope(book.canvasScope, book.chapters.length);
  // The same start, read again from storage or a bundle, is a new object.
  const sameStart = book.start === state.bookStart || JSON.stringify(book.start ?? null) === JSON.stringify(state.bookStart ?? null);
  if (
    book.chapters === state.chapters &&
    book.activeChapterId === state.activeChapterId &&
    canvasScope === state.canvasScope &&
    sameStart
  ) return state;
  const chapterChanged = book.activeChapterId !== state.activeChapterId;
  const { bookStart: _previousStart, ...rest } = state;
  void _previousStart;
  return {
    ...rest,
    // Where the book starts comes with the book: another book has its own
    // or none.
    ...(sameStart ? (state.bookStart ? { bookStart: state.bookStart } : {}) : book.start ? { bookStart: book.start } : {}),
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

export function bookOf(state: SandboxState): BookContent {
  return {
    chapters: state.chapters,
    activeChapterId: state.activeChapterId,
    ...(state.canvasScope === 'book' ? { canvasScope: state.canvasScope } : {}),
    ...(state.bookStart ? { start: state.bookStart } : {}),
  };
}

export function sandboxReducer(state: SandboxState, action: SandboxAction): SandboxState {
  switch (action.type) {
    case 'SET_MARKDOWN': {
      if (action.payload === state.markdown) return state;
      const book = replaceChapterMarkdown(bookOf(state), state.activeChapterId, action.payload);
      return { ...state, chapters: book.chapters, markdown: action.payload };
    }
    case 'EDIT_CHAPTER_MARKDOWN': {
      const { chapterId, changes, baseLength } = action.payload;
      const chapter = state.chapters.find((c) => c.id === chapterId);
      if (!chapter || changes.length === 0) return state;
      const text = chapterId === state.activeChapterId ? state.markdown : chapter.markdown;
      if (baseLength !== undefined && text.length !== baseLength) return state;
      if (!changesApply(text, changes)) return state;
      const next = applyTextChanges(text, changes);
      if (next === text) return state;
      const book = replaceChapterMarkdown(bookOf(state), chapterId, next);
      return { ...state, chapters: book.chapters, ...(chapterId === state.activeChapterId ? { markdown: next } : {}) };
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
    case 'SET_EPUB_LAYOUT':
      if (action.payload === state.epubLayout) return state;
      return { ...state, epubLayout: action.payload };
    case 'SET_SCORM_LAYOUT':
      if (action.payload === state.scormLayout) return state;
      return { ...state, scormLayout: action.payload };
    case 'SET_SCORM_VERSION':
      if (action.payload === state.scormVersion) return state;
      return { ...state, scormVersion: action.payload };
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
    case 'DROP_CHAPTER_LAYOUTS_WITHOUT_FACES': {
      // The faces arrived (#757): the chapters laid out without them have
      // no record again, and the plan has them laid out anew.
      const kept = Object.values(state.chapterLayouts).filter((l) => !l.withoutFaces);
      if (kept.length === Object.keys(state.chapterLayouts).length) return state;
      return { ...state, chapterLayouts: Object.fromEntries(kept.map((l) => [l.chapterId, l])) };
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
      return {
        ...state,
        config: action.payload,
        ...(action.shared && state.configLayers ? { configLayers: { ...state.configLayers, shared: action.shared } } : {}),
      };
    case 'SET_CONFIG_LAYERS':
      return { ...state, configLayers: action.payload };
    case 'SET_CONFIG_SCOPE':
      return !state.configLayers || state.configLayers.scope === action.payload ? state : { ...state, configLayers: { ...state.configLayers, scope: action.payload } };
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
        return state.activeProjectId === null ? state : { ...state, activeProjectId: null, configLayers: null };
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
