// What the layout keeps per comic laid out: its warnings and the source of
// each panel.
import type { VDTComicPage, ContentWarning } from '../../vdt.js';
import type { ComicPanelSource } from '../types.js';

/** Layout warnings of the comic pages laid out, keyed by the page they
 *  belong to (each build pass lays its pages out afresh; only the last
 *  pass's pages reach the document). */
export const layoutWarnings = new WeakMap<VDTComicPage, ContentWarning[]>();

/** The warnings the layout of a comic page found (`comicPanelLetterbox`,
 *  `comicBalloonOverflow`). */
export function comicPageLayoutWarnings(comic: VDTComicPage): readonly ContentWarning[] {
  return layoutWarnings.get(comic) ?? [];
}

/** The script (or text) each laid-out panel of a comic was set from, by
 *  the comic laid out (#885): what fills a text panel's frame. */
export const panelSourcesOf = new WeakMap<VDTComicPage, readonly (ComicPanelSource | undefined)[]>();

/** The source of each panel of a comic laid out by {@link layoutComicFrame}
 *  (undefined for an empty cell), in panel order. Internal to the comics
 *  modules. */
export function comicPanelSources(comic: VDTComicPage): readonly (ComicPanelSource | undefined)[] {
  return panelSourcesOf.get(comic) ?? [];
}

/** The panel sources of a comic laid out whole, given to a part of it (a
 *  half of a spread) or a copy moved elsewhere (a strip on the sheet): the
 *  sources stay indexed by the panels' `index`. Internal to the comics
 *  modules. */
export function copyComicPanelSources(from: VDTComicPage, to: VDTComicPage): void {
  const sources = panelSourcesOf.get(from);
  if (sources) panelSourcesOf.set(to, sources);
}

/** Set the layout warnings of a comic laid out in parts (each page of a
 *  spread gets those of its panels). Internal to the comics modules. */
export function setComicLayoutWarnings(comic: VDTComicPage, warnings: readonly ContentWarning[]): void {
  if (warnings.length > 0) layoutWarnings.set(comic, [...warnings]);
  else layoutWarnings.delete(comic);
}
