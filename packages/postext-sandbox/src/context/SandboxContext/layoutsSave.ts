// The saved chapter layouts and the view preferences the provider keeps
// (#1276: split out of SandboxContext.tsx).
import { useRef, useEffect } from 'react';
import type { ChapterLayout } from '../../book/types.js';
import { getChapterLayouts, putChapterLayouts } from '../../storage/layouts.js';
import { LAYOUTS_SAVE_MS } from './timings.js';
import { saveViewport, saveEpubLayout, saveScormLayout, saveScormVersion, savePanel, saveSidebarPercent } from '../../storage/persistence.js';
import type { SandboxState, SandboxAction } from './state.js';
import type { SandboxHistory } from '../../history/sandboxHistory.js';
import type { SandboxProviderLate } from './providerState.js';

/** What useLayoutsSave takes from the sandbox provider. */
export interface UseLayoutsSaveDeps {
  state: SandboxState;
  undoHistory: SandboxHistory;
  dispatch: React.Dispatch<SandboxAction>;
  hydratedRef: React.RefObject<boolean>;
  late: SandboxProviderLate;
}

export function useLayoutsSave(deps: UseLayoutsSaveDeps) {
  const {
    state, undoHistory, dispatch, hydratedRef, late
  } = deps;
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
    for (const id of late.editorStatesRef.current.keys()) {
      if (!live.has(id)) late.editorStatesRef.current.delete(id);
    }
    undoHistory.pruneChapters(live);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.chapters, undoHistory]);

  // Save viewport tab and active panel immediately (skip until hydrated)
  useEffect(() => {
    if (!hydratedRef.current) return;
    saveViewport(state.activeViewport);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeViewport]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    saveEpubLayout(state.epubLayout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.epubLayout]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    saveScormLayout(state.scormLayout);
    saveScormVersion(state.scormVersion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.scormLayout, state.scormVersion]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    savePanel(state.activePanel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activePanel]);

  // Save sidebar percent when drag ends
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (!state.sidebarDragging) {
      saveSidebarPercent(state.sidebarPercent);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.sidebarDragging, state.sidebarPercent]);
  return {
  };
}
