/**
 * What the comic tools find under the pointer on a page (#580): a page
 * shows its comic page and the strips its columns and float bands hold
 * (`pageComics`, all on the sheet), so a point is looked up in each, the
 * parts that lie over the others first: a balloon's tail tip, a balloon
 * (balloons lie over borders and gutters), a split line, a panel.
 *
 * Pure: sheet px, no DOM.
 */

import { pointInPolygon, type VDTComicArt, type VDTComicBalloon, type VDTComicPage, type VDTComicPanel, type VDTComicSplitter } from 'postext';
import { balloonAt, tailTipAt } from './balloonDrag';
import { panelAt, splitterAt } from './comicDrag';
import { balloonTextAt, type BalloonTextOptions } from './balloonText';

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

/** A panel's picture under the pointer: its art, or the pop-out cut-out
 *  drawn over its border. */
export interface ComicArtHit {
  comic: VDTComicPage;
  panel: VDTComicPanel;
  art: VDTComicArt;
  which: 'art' | 'pop';
}

/** Whether a picture shows ink at a sheet point: true where its pixel is
 *  opaque, false where it is clear, null when that cannot be told (the
 *  picture not decoded yet, or not readable). */
export type ArtOpacity = (art: VDTComicArt, x: number, y: number) => boolean | null;

const inBox = (b: VDTComicArt['box'], x: number, y: number): boolean => x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;

/**
 * The picture under `(x, y)` among a page's comics (#594), as they are
 * painted: panel by panel in reading order, each its art clipped to its
 * outline and then its pop-out cut-out unclipped over the border, so a
 * later panel covers an earlier panel's cut-out. A cut-out counts where
 * its pixel is opaque; where that cannot be told, outside its own panel
 * only (the part that breaks the border). Null in a gutter, on a panel
 * with no picture, or off the comics. Balloons and split lines are the
 * caller's to rule out first (they lie over the pictures).
 */
export function comicArtAt(comics: readonly VDTComicPage[], x: number, y: number, opaque?: ArtOpacity): ComicArtHit | null {
  for (const comic of [...comics].reverse()) {
    for (let i = comic.panels.length - 1; i >= 0; i--) {
      const panel = comic.panels[i]!;
      const inside = pointInPolygon(panel.polygon, { x, y });
      const pop = panel.pop;
      if (pop && inBox(pop.box, x, y)) {
        const ink = opaque?.(pop, x, y) ?? null;
        if (ink === true || (ink === null && !inside)) return { comic, panel, art: pop, which: 'pop' };
      }
      if (inside) return panel.art ? { comic, panel, art: panel.art, which: 'art' } : null;
    }
  }
  return null;
}

/** What a press at a point does on a page's comics: the parts of
 *  {@link ComicHit}, refined. A press on a balloon's words selects text
 *  (`text`, with the caret's source offset there, #595), on the rest of
 *  the balloon it drags it (`balloon`); a click on a panel's picture opens
 *  it (`art`, #594), on a panel with none it is the panel's. */
export type ComicPress =
  | ComicHit
  | { kind: 'text'; comic: VDTComicPage; balloon: VDTComicBalloon; offset: number }
  | ({ kind: 'art' } & ComicArtHit);

export interface ComicPressOptions extends ComicHitOptions {
  /** How the balloon words are hit (measure, slop). */
  text?: BalloonTextOptions;
  /** Whether a pop-out cut-out shows ink at a point. */
  opaque?: ArtOpacity;
}

/** What a press at `(x, y)` does on a page's comics (see
 *  {@link ComicPress}): the part on top decides (a tail tip, a balloon, a
 *  split line, a panel), then a balloon's words or a panel's picture. */
export function comicPressAt(comics: readonly VDTComicPage[], x: number, y: number, opts: ComicPressOptions): ComicPress | null {
  const hit = comicHitAt(comics, x, y, opts);
  if (hit?.kind === 'balloon') {
    const offset = balloonTextAt(hit.balloon, x, y, opts.text);
    return offset === null ? hit : { kind: 'text', comic: hit.comic, balloon: hit.balloon, offset };
  }
  if (hit === null || hit.kind === 'panel') {
    const art = comicArtAt(comics, x, y, opts.opaque);
    if (art) return { kind: 'art', ...art };
  }
  return hit;
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
