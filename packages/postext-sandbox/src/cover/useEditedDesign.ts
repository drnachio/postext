'use client';

// The design the shown sheet is drawn with (#1673), for the designer and
// the Design panel's Cover design group: the sheet's own when it has one
// (`cover.sheets`), else the book's. What they write goes back where it
// was read from, the rest of the cover as it was.

import { useMemo } from 'react';
import type { CoverConfig, CoverSheetDesign, CoverSheetName } from 'postext/production';
import { useSandboxDispatch, useSandboxSelector } from '../context/SandboxContext.js';
import { useCoverChoice, useCoverState } from './coverStore.js';
import { designOf, sheetDesignTarget, shownSheetNames, withDesign } from './sheetDesign.js';

export interface EditedDesign {
  /** The names of the shown sheet, most particular first. */
  names: CoverSheetName[];
  /** The sheet's own design being edited; `null`: the book's. */
  target: CoverSheetName | null;
  design: CoverSheetDesign;
  /** Write the edited design back; `merge: false` keeps it a step of its
   *  own in the history (a drop, an item added). */
  write: (next: CoverSheetDesign | undefined, opts?: { merge?: boolean }) => void;
}

export function useEditedDesign(): EditedDesign {
  const dispatch = useSandboxDispatch();
  const cover = useSandboxSelector((s) => s.config.cover);
  const { sheet: kind } = useCoverChoice();
  const { built } = useCoverState();
  const sheet = built?.sheet;
  const names = useMemo(() => shownSheetNames(kind, sheet), [kind, sheet]);
  const target = sheetDesignTarget(cover, names);
  const design = useMemo(() => designOf(cover, target), [cover, target]);
  const write = (next: CoverSheetDesign | undefined, opts?: { merge?: boolean }) => {
    const payload: { cover: CoverConfig | undefined } = { cover: withDesign(cover, target, next) };
    dispatch({ type: 'UPDATE_CONFIG', payload, ...(opts?.merge === false ? { history: { merge: false } } : {}) });
  };
  return { names, target, design, write };
}
