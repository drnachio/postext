/**
 * The switch of the incremental layout (#1640): the previews lay an edited
 * chapter out from the layout before it (the engine's tapes, #1639)
 * instead of from its first block. The pages are the same either way.
 *
 * On by default since #1650. Off when `localStorage.postextIncremental`
 * is `'0'` or the page's address carries `?incremental=0`: a way to
 * compare the two where a reader types (`?perf` beside it gives the
 * times), not a setting of the interface.
 */

import { hasWindow } from '../env/window.js';

const STORAGE_KEY = 'postextIncremental';

let enabled: boolean | null = null;

export function incrementalLayoutEnabled(): boolean {
  if (enabled !== null) return enabled;
  if (!hasWindow()) return (enabled = false);
  try {
    const query = /[?&]incremental=(0|1)(&|$)/.exec(window.location.search)?.[1];
    enabled = query !== undefined ? query === '1' : window.localStorage.getItem(STORAGE_KEY) !== '0';
  } catch {
    enabled = true;
  }
  return enabled;
}

/** Turn it on or off for this and later visits (from the console, or a
 *  test). */
export function setIncrementalLayout(on: boolean): void {
  enabled = on;
  try {
    if (on) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, '0');
  } catch {
    /* storage unavailable */
  }
}
