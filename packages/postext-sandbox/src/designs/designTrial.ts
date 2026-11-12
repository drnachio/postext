/**
 * A design being tried on a book (#1523): the book's design before the
 * first try (what Discard brings back, and what each further try is set
 * over) and the design on show. It belongs to the book it started on and
 * is dropped when another book opens.
 */

import { useSyncExternalStore } from 'react';
import type { DesignPart, MissingStyle, PostextConfig } from 'postext';
import type { SandboxState } from '../context/SandboxContext.js';

export interface DesignTrial {
  /** The book tried on (`bookKey`). */
  book: string;
  entryId: string;
  name: string;
  parts: DesignPart[];
  /** The book's design before the first try, as the design reads it (the
   *  general settings of a book in several languages). */
  before: PostextConfig;
  /** The same with the design applied. */
  applied: PostextConfig;
  /** The style ids the text uses that the design lacks. */
  missing: MissingStyle[];
}

/** Which book the state shows: a project, or a sample book. */
export function bookKey(s: Pick<SandboxState, 'activeProjectId' | 'activePresetId'>): string {
  return s.activeProjectId ? `project:${s.activeProjectId}` : `preset:${s.activePresetId}`;
}

let trial: DesignTrial | null = null;
const listeners = new Set<() => void>();

export function setDesignTrial(next: DesignTrial | null): void {
  if (trial === next) return;
  trial = next;
  for (const l of listeners) l();
}

/** The trial on `s`'s book, if any: one begun on another book is dropped. */
export function designTrialOf(s: Pick<SandboxState, 'activeProjectId' | 'activePresetId'>): DesignTrial | null {
  if (trial && trial.book !== bookKey(s)) setDesignTrial(null);
  return trial;
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The trial, kept current, for the book on screen. */
export function useDesignTrial(s: Pick<SandboxState, 'activeProjectId' | 'activePresetId'>): DesignTrial | null {
  const t = useSyncExternalStore(subscribe, () => trial, () => null);
  return t && t.book === bookKey(s) ? t : null;
}

/** Drop the trial whenever the store opens another book. */
export function watchDesignTrial(store: { getSnapshot: () => SandboxState; subscribe: (cb: () => void) => () => void }): () => void {
  return store.subscribe(() => {
    if (trial) designTrialOf(store.getSnapshot());
  });
}
