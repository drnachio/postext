/**
 * The switch of the incremental layout (#1640), experimental: the canvas
 * lays an edited chapter out from the layout before it (the engine's
 * tapes, #1639) instead of from its first block.
 *
 * Off unless `localStorage.postextIncremental === '1'` or the page's
 * address carries `?incremental` (or `incremental=1`). No setting in the
 * interface while it is an experiment: it is here to be measured where a
 * reader types (`?perf` beside it gives the times).
 */

import { hasWindow } from '../env/window.js';

const STORAGE_KEY = 'postextIncremental';

let enabled: boolean | null = null;

export function incrementalLayoutEnabled(): boolean {
  if (enabled !== null) return enabled;
  if (!hasWindow()) return (enabled = false);
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY) === '1';
    const query = /[?&]incremental(=1|&|$)/.test(window.location.search);
    enabled = stored || query;
  } catch {
    enabled = false;
  }
  return enabled;
}

/** Turn it on or off for this and later visits (from the console, or a
 *  test). */
export function setIncrementalLayout(on: boolean): void {
  enabled = on;
  try {
    if (on) window.localStorage.setItem(STORAGE_KEY, '1');
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}
