// The find bar's state, outside the sandbox reducer: the bar lives in the
// Markdown panel, but the previews' toolbars and the keyboard open it, and
// the chapter editor (remounted on every chapter switch) paints its
// matches. A small external store keeps all of them on one value.

import { useSyncExternalStore } from 'react';
import { DEFAULT_FIND_OPTIONS, type FindOptions } from '../../book/find/compile.js';

export type FindScope = 'chapter' | 'book';

export interface FindState {
  open: boolean;
  query: string;
  replace: string;
  options: FindOptions;
  scope: FindScope;
  /** The replace row is showing. */
  replaceOpen: boolean;
  /** The list of matches under the bar is showing. */
  listOpen: boolean;
  /** Bumped by every request to open the bar: the bar then focuses and
   *  selects its search field. */
  focusRequest: number;
}

/** What the open chapter's editor paints: the matches of the query in
 *  `chapterId`, and which of them is the current one (-1 for none). */
export interface FindHighlights {
  chapterId: string | null;
  ranges: readonly { from: number; to: number }[];
  current: number;
}

let state: FindState = {
  open: false,
  query: '',
  replace: '',
  options: DEFAULT_FIND_OPTIONS,
  scope: 'chapter',
  replaceOpen: false,
  listOpen: true,
  focusRequest: 0,
};
let highlights: FindHighlights = { chapterId: null, ranges: [], current: -1 };
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getFindState(): FindState {
  return state;
}

export function useFindState(): FindState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

export function useFindHighlights(): FindHighlights {
  return useSyncExternalStore(subscribe, () => highlights, () => highlights);
}

export function setFind(partial: Partial<Omit<FindState, 'focusRequest'>>): void {
  state = { ...state, ...partial };
  emit();
}

/** Open the bar (or bring focus back to it). `query` (a selection) fills
 *  the search field; `scope` picks the chapter or the whole book. */
export function openFind(request: { query?: string; scope?: FindScope; replace?: boolean } = {}): void {
  state = {
    ...state,
    open: true,
    ...(request.query ? { query: request.query } : {}),
    ...(request.scope ? { scope: request.scope } : {}),
    ...(request.replace ? { replaceOpen: true } : {}),
    focusRequest: state.focusRequest + 1,
  };
  emit();
}

export function closeFind(): void {
  state = { ...state, open: false };
  highlights = { chapterId: null, ranges: [], current: -1 };
  emit();
}

export function setFindHighlights(next: FindHighlights): void {
  const same = next.chapterId === highlights.chapterId
    && next.current === highlights.current
    && next.ranges.length === highlights.ranges.length
    && next.ranges.every((r, i) => r.from === highlights.ranges[i]!.from && r.to === highlights.ranges[i]!.to);
  if (same) return;
  highlights = next;
  emit();
}

/** The bar's next / previous commands, for the editor's keys (Mod-G,
 *  F3). Set while the bar is mounted. */
export const findCommands: { next: (() => void) | null; previous: (() => void) | null } = { next: null, previous: null };

/** A selection worth searching for: one line, not too long. */
export function searchableSelection(text: string): string | undefined {
  return text.length > 0 && text.length <= 200 && !text.includes('\n') ? text : undefined;
}
