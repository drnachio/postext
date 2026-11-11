/**
 * The float the canvas lets the reader move by hand (#1494). An ordinary
 * press on a figure keeps doing what it did (it opens the resource, picks
 * the page selection, selects a cell's text, follows a link); a float is
 * picked up only with Alt (Option on a Mac) held, or after «Move in the
 * canvas» in the Resources panel armed it. Arming is what touch screens
 * use: while a float is armed the canvas takes the finger on it for the
 * drag instead of scrolling. Viewer state; letting go, Escape or arming
 * another float disarms it.
 */

import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
let armed: string | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The resource id of the armed float, if any. */
export function armedFloat(): string | null {
  return armed;
}

/** Arm the float of `resourceId` for the next drag, or disarm (`null`). */
export function armFloatMove(resourceId: string | null): void {
  if (armed === resourceId) return;
  armed = resourceId;
  for (const l of listeners) l();
}

/** Called when the armed float changes. */
export function onArmedFloatChange(listener: () => void): () => void {
  return subscribe(listener);
}

export function useArmedFloat(): string | null {
  return useSyncExternalStore(subscribe, armedFloat, () => null);
}
