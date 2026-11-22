// What the Cover panel works on and what it shows, shared by the panel,
// the stage that paints the sheet and the tools, for this visit only (the
// book keeps its versions, not which one was last looked at). One builder,
// mounted with the panel, lays the cover out; everyone else reads it here.

import { useSyncExternalStore } from 'react';
import type { CoverSheetKind } from 'postext/production';
import type { CoverState } from './useCover.js';
import type { ItemRef } from './designer/designerModel.js';

export interface CoverChoice {
  /** A version id; null for the book's first. */
  version: string | null;
  sheet: CoverSheetKind;
}

let choice: CoverChoice = { version: null, sheet: 'cover' };
let cover: CoverState = { status: 'none', issues: [], paintKey: 0 };
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getCoverChoice(): CoverChoice {
  return choice;
}

export function setCoverChoice(next: Partial<CoverChoice>): void {
  const merged = { ...choice, ...next };
  if (merged.version === choice.version && merged.sheet === choice.sheet) return;
  choice = merged;
  emit();
}

export function useCoverChoice(): CoverChoice {
  return useSyncExternalStore(subscribe, getCoverChoice, getCoverChoice);
}

export function getCoverState(): CoverState {
  return cover;
}

/** The builder's latest cover. */
export function publishCoverState(next: CoverState): void {
  if (next === cover) return;
  cover = next;
  emit();
}

export function useCoverState(): CoverState {
  return useSyncExternalStore(subscribe, getCoverState, getCoverState);
}

/** The designer: on, and the item selected on the sheet. */
export interface CoverDesignerState {
  open: boolean;
  selected: ItemRef | null;
}

let designer: CoverDesignerState = { open: false, selected: null };

export function getCoverDesigner(): CoverDesignerState {
  return designer;
}

export function setCoverDesigner(next: Partial<CoverDesignerState>): void {
  const merged = { ...designer, ...next };
  if (merged.open === designer.open && merged.selected === designer.selected) return;
  designer = merged;
  emit();
}

export function useCoverDesigner(): CoverDesignerState {
  return useSyncExternalStore(subscribe, getCoverDesigner, getCoverDesigner);
}
