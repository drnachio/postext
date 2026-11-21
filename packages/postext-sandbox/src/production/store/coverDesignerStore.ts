// Whether the cover designer is open: it is opened from the Cover panel and
// from the book's preview, and drawn once, over the whole Sandbox. And the
// sheet on show while the Cover panel is open, the same in the panel and
// in the stage beside it.

import { useSyncExternalStore } from 'react';
import type { SheetChoice } from '../model/bookProduction.js';

let open = false;
const listeners = new Set<() => void>();

function set(next: boolean): void {
  if (open === next) return;
  open = next;
  for (const l of listeners) l();
}

export const openCoverDesigner = (): void => set(true);
export const closeCoverDesigner = (): void => set(false);

export function useCoverDesignerOpen(): boolean {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => open,
    () => false,
  );
}

let sheet: SheetChoice = 'cover';
const sheetListeners = new Set<() => void>();

export function chooseCoverSheet(next: SheetChoice): void {
  if (sheet === next) return;
  sheet = next;
  for (const l of sheetListeners) l();
}

export function useCoverSheet(): SheetChoice {
  return useSyncExternalStore(
    (l) => { sheetListeners.add(l); return () => sheetListeners.delete(l); },
    () => sheet,
    () => 'cover' as const,
  );
}
