/**
 * How the Canvas shows special inks and die-cuts (#1570): whether the die
 * lines are drawn over the pages, and how special inks are painted (flat,
 * with their sheen, or as the finish map). Viewer state, remembered per
 * browser like the print preview: it changes how pages are painted, never
 * how they are laid out.
 */

import { useSyncExternalStore } from 'react';

/** How special inks are painted: as their screen colour (`flat`), with a
 *  sheen over metallic inks, foils and varnishes (`sheen`), or as the map
 *  of where each finish goes (`map`). */
export type FinishesView = 'flat' | 'sheen' | 'map';

const FINISHES: readonly FinishesView[] = ['flat', 'sheen', 'map'];
const DIE_KEY = 'postext-sandbox:dieLines';
const FINISHES_KEY = 'postext-sandbox:finishes';

const listeners = new Set<() => void>();
let dieLines: boolean | undefined;
let finishes: FinishesView | undefined;

function storage(): Storage | undefined {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}

function readDieLines(): boolean {
  if (dieLines !== undefined) return dieLines;
  try {
    dieLines = storage()?.getItem(DIE_KEY) === '1';
  } catch {
    dieLines = false;
  }
  return dieLines;
}

function readFinishes(): FinishesView {
  if (finishes !== undefined) return finishes;
  let stored: string | null | undefined;
  try {
    stored = storage()?.getItem(FINISHES_KEY);
  } catch {
    stored = null;
  }
  finishes = FINISHES.includes(stored as FinishesView) ? (stored as FinishesView) : 'flat';
  return finishes;
}

function notify(): void {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether the die lines are drawn, read outside React. */
export function dieLinesOn(): boolean {
  return readDieLines();
}

export function setDieLines(on: boolean): void {
  dieLines = on;
  try {
    if (on) storage()?.setItem(DIE_KEY, '1');
    else storage()?.removeItem(DIE_KEY);
  } catch {
    // Private mode: the switch still works for this session.
  }
  notify();
}

/** How special inks are painted, read outside React. */
export function finishesView(): FinishesView {
  return readFinishes();
}

export function setFinishesView(view: FinishesView): void {
  finishes = view;
  try {
    if (view === 'flat') storage()?.removeItem(FINISHES_KEY);
    else storage()?.setItem(FINISHES_KEY, view);
  } catch {
    // Private mode: as above.
  }
  notify();
}

/** The view after `view`: flat → sheen → map → flat. */
export function nextFinishesView(view: FinishesView): FinishesView {
  return FINISHES[(FINISHES.indexOf(view) + 1) % FINISHES.length]!;
}

/** The die lines switch, `[on, set]`. */
export function useDieLines(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, readDieLines, () => false);
  return [on, setDieLines];
}

/** The finishes view, `[view, set]`. */
export function useFinishesView(): [FinishesView, (view: FinishesView) => void] {
  const view = useSyncExternalStore(subscribe, readFinishes, () => 'flat' as FinishesView);
  return [view, setFinishesView];
}

/** For tests: forget what was read, so the next read goes to storage. */
export function resetSpecialInksViewForTests(): void {
  dieLines = undefined;
  finishes = undefined;
}
