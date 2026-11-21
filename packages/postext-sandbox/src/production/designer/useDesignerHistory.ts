/**
 * The cover designer's undo and its keys. The Sandbox's history keeps the
 * text and the configuration; the cover is kept apart, so the designer
 * keeps its own while it is open (./coverEditing.ts): the design and the
 * gallery as they were before each change.
 */

import { useEffect, useState, type MutableRefObject } from 'react';
import { typesOwnUndo } from '../../history/historyKeys.js';
import type { BookProduction, CoverDesignSettings } from '../model/bookProduction.js';
import type { CoverGallery } from '../library/coverGallery.js';
import { createCoverHistory } from './coverEditing.js';

export function useDesignerHistory(
  record: BookProduction | null,
  saveRecord: (next: BookProduction) => void,
  gallery: CoverGallery,
  saveGallery: (next: CoverGallery) => void,
) {
  const [history] = useState(() => createCoverHistory<{ design: CoverDesignSettings | undefined; gallery: CoverGallery }>());
  const [, setHistoryTick] = useState(0);
  /** `key`: what a change edits, to join the quick changes of one thing
   *  into a step; a command (add, delete, paste) has none. */
  const remember = (key?: string) => {
    history.remember({ design: record?.design, gallery }, key);
    setHistoryTick((t) => t + 1);
  };
  const update = (next: BookProduction, key?: string) => {
    if (next.design !== record?.design) remember(key);
    saveRecord(next);
  };
  const updateGallery = (next: CoverGallery, key?: string) => {
    remember(key);
    saveGallery(next);
  };
  const travel = (dir: 'undo' | 'redo') => {
    if (!record) return;
    const now = { design: record.design, gallery };
    const to = dir === 'undo' ? history.undo(now) : history.redo(now);
    setHistoryTick((t) => t + 1);
    if (!to) return;
    const next = { ...record };
    if (to.design) next.design = to.design;
    else delete next.design;
    saveRecord(next);
    if (to.gallery !== gallery) saveGallery(to.gallery);
  };
  return { history, update, updateGallery, travel };
}

/** The keys over the whole designer while no text box has the focus: they
 *  are the designer's, not the Sandbox's history (window, capture). `keys`
 *  says whether it took a key. */
export function useDesignerKeys(keys: MutableRefObject<(ev: KeyboardEvent) => boolean>): void {
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (!(ev.metaKey || ev.ctrlKey) || ev.altKey || ev.defaultPrevented) return;
      if (typesOwnUndo(ev.target) || typesOwnUndo(document.activeElement)) return;
      if (keys.current(ev)) ev.preventDefault();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [keys]);
}
