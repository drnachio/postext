/**
 * Whether the Canvas and Folio viewers show the print preview (#606): one
 * switch for both, off by default, remembered per browser. Viewer state,
 * never configuration: it changes how pages are painted, not laid out.
 */

import { useSyncExternalStore } from 'react';

const KEY = 'postext-sandbox:printPreview';
const listeners = new Set<() => void>();
let value: boolean | undefined;

function read(): boolean {
  if (value !== undefined) return value;
  try {
    value = globalThis.localStorage?.getItem(KEY) === '1';
  } catch {
    value = false;
  }
  return value;
}

export function setPrintPreview(on: boolean): void {
  value = on;
  try {
    if (on) globalThis.localStorage?.setItem(KEY, '1');
    else globalThis.localStorage?.removeItem(KEY);
  } catch {
    // Private mode: the switch still works for this session.
  }
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The print preview switch, `[on, set]`. */
export function usePrintPreview(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, read, () => false);
  return [on, setPrintPreview];
}
