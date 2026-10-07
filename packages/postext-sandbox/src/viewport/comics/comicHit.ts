/**
 * What the comic tools find under the pointer on a page (#580): a page
 * shows its comic page and the strips its columns and float bands hold
 * (`pageComics`, all on the sheet), so a point is looked up in each, the
 * parts that lie over the others first: a balloon's tail tip, a balloon
 * (balloons lie over borders and gutters), a split line, a panel.
 *
 * Pure: sheet px, no DOM.
 */

import type { VDTComicBalloon, VDTComicPage, VDTComicPanel, VDTComicSplitter } from 'postext';
import { balloonAt, tailTipAt } from './balloonDrag';
import { panelAt, splitterAt } from './comicDrag';

export type ComicHit =
  | { kind: 'tail'; comic: VDTComicPage; balloon: VDTComicBalloon }
  | { kind: 'balloon'; comic: VDTComicPage; balloon: VDTComicBalloon }
  | { kind: 'splitter'; comic: VDTComicPage; splitter: VDTComicSplitter }
  | { kind: 'panel'; comic: VDTComicPage; panel: VDTComicPanel };

export interface ComicHitOptions {
  /** The least width of a split line's hit band (sheet px). */
  band: number;
  /** The reach of a tail tip (sheet px); 0 leaves the tails out. */
  tipRadius?: number;
}

/** The part of the page's comics under `(x, y)`, the one on top first; the
 *  later comics of the list are searched first at each level (a strip
 *  floated over nothing else, a page's comic first in the list). */
export function comicHitAt(comics: readonly VDTComicPage[], x: number, y: number, opts: ComicHitOptions): ComicHit | null {
  const order = [...comics].reverse();
  if (opts.tipRadius && opts.tipRadius > 0) {
    for (const comic of order) {
      const b = tailTipAt(comic, x, y, opts.tipRadius);
      if (b) return { kind: 'tail', comic, balloon: b };
    }
  }
  for (const comic of order) {
    const b = balloonAt(comic, x, y);
    if (b) return { kind: 'balloon', comic, balloon: b };
  }
  for (const comic of order) {
    const s = splitterAt(comic, x, y, opts.band);
    if (s) return { kind: 'splitter', comic, splitter: s };
  }
  for (const comic of order) {
    const p = panelAt(comic, x, y);
    if (p) return { kind: 'panel', comic, panel: p };
  }
  return null;
}

/** The comic of a page that came from the fence at `sourceStart` (a page's
 *  comic, a strip), as the page lays it out now. */
export function comicBySource(comics: readonly VDTComicPage[], sourceStart: number): VDTComicPage | null {
  return comics.find((c) => c.sourceStart === sourceStart) ?? null;
}

/** The panel-tool key a key press stands for: `H` splits the focused panel
 *  with a horizontal line (one panel above the other), `V` with a vertical
 *  one, `M` merges it with the next. The physical key counts when the
 *  layout types another letter there (Arabic, Cyrillic…). Null for any
 *  other key, or with Ctrl, Meta or Alt held (those are the browser's and
 *  the editor's). */
export function panelKeyAction(ev: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'> & { code?: string }): 'rows' | 'columns' | 'merge' | null {
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return null;
  const latin = /^[a-z]$/i.test(ev.key) ? ev.key.toLowerCase() : /^Key([A-Z])$/.exec(ev.code ?? '')?.[1]?.toLowerCase() ?? '';
  switch (latin) {
    case 'h':
      return 'rows';
    case 'v':
      return 'columns';
    case 'm':
      return 'merge';
    default:
      return null;
  }
}
