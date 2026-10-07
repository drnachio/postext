/**
 * Two-page spreads (`:::page{spread}`, #567): one split tree laid over the
 * frames of two facing pages joined across the spine (their inner margins
 * dropped), then cut at the spine. Each page carries the panels that reach
 * its side, clipped there (a panel or picture crossing the spine shows on
 * both, each page painting its half), the split lines that lie on it and
 * the balloons whose centre is on it, all on its own sheet.
 *
 * The comic is laid out in spread coordinates: the left page's sheet, with
 * the right page's sheet set against it so that the two trim boxes meet at
 * the spine.
 */

import type { BoundingBox, ResolvedConfig, VDTComicPage, VDTComicPanel, VDTComicSplitter, VDTPoint } from '../vdt';
import type { Resource } from '../types';
import { clipPolygon, polygonBBox } from './geometry';
import { comicPageFrame, comicPageLayoutWarnings, comicViewerLeaf, layoutComicFrame, setComicLayoutWarnings, type ComicPageContext } from './layoutPage';
import { resolvedComics } from '../defaults/comics';
import { translateComicBalloon, translateComicPanel, translateComicSplitter } from './transform';
import type { ComicPageSource } from './types';

/** Whether a comic page asks for a spread (`:::page{spread}`). */
export function isComicSpread(source: Pick<ComicPageSource, 'kind' | 'attrs'>): boolean {
  if (source.kind !== 'page') return false;
  const v = source.attrs.spread;
  if (v === undefined) return false;
  const t = v.trim().toLowerCase();
  return !(t === 'false' || t === 'no' || t === '0' || t === 'none');
}

/** One page of a spread as the build hands it over. */
export type ComicSpreadPage = Pick<ComicPageContext, 'page' | 'trimBox' | 'bleedBox' | 'mirrorMargins' | 'contentBox'>;

export interface ComicSpreadContext {
  resolved: ResolvedConfig;
  resources: ReadonlyMap<string, Resource>;
  sourceOffset?: number;
  /** The left page and the right page of the open book. */
  left: ComicSpreadPage;
  right: ComicSpreadPage;
}

/** Past the sheet's edge at the spine: a panel crossing the spine is cut
 *  this far beyond the sheet, so its border is never stroked along the
 *  spine and its picture runs into the gutter bleed. */
const SPINE_OVERRUN = 1;

/** A panel cut to the half-plane `x <= maxX` (`side: 'left'`) or
 *  `x >= minX` (`'right'`); undefined when nothing of it is left there. */
function clipPanel(panel: VDTComicPanel, side: 'left' | 'right', at: number): VDTComicPanel | undefined {
  const inside = side === 'left' ? panel.bbox.x + panel.bbox.width <= at : panel.bbox.x >= at;
  if (inside) return panel;
  const poly = side === 'left'
    ? clipPolygon(panel.polygon, { nx: 1, ny: 0, c: at })
    : clipPolygon(panel.polygon, { nx: -1, ny: 0, c: -at });
  if (poly.length < 3) return undefined;
  const bbox = polygonBBox(poly);
  if (bbox.width < 0.5 || bbox.height < 0.5) return undefined;
  // A rounded corner at the spine would show: a cut panel keeps straight
  // corners.
  return { ...panel, polygon: poly, bbox, radius: 0 };
}

/** The part of a split line between `minX` and `maxX`, or undefined. */
function clipSplitter(s: VDTComicSplitter, minX: number, maxX: number): VDTComicSplitter | undefined {
  const { a, b } = s;
  const dx = b.x - a.x;
  let t0 = 0;
  let t1 = 1;
  if (Math.abs(dx) < 1e-9) {
    if (a.x < minX - 0.01 || a.x > maxX + 0.01) return undefined;
  } else {
    const ta = (minX - a.x) / dx;
    const tb = (maxX - a.x) / dx;
    t0 = Math.max(t0, Math.min(ta, tb));
    t1 = Math.min(t1, Math.max(ta, tb));
    if (t1 - t0 <= 1e-6) return undefined;
  }
  const at = (t: number): VDTPoint => ({ x: a.x + t * dx, y: a.y + t * (b.y - a.y) });
  return { ...s, a: at(t0), b: at(t1) };
}

/**
 * Lay out a spread over two facing pages: `[left, right]`, each on its own
 * sheet. Reading direction, gutters, panel styles and bleed work as on a
 * page; bleeding panels bleed through the outer edges (head, foot, fore
 * edges), never at the spine.
 */
export function layoutComicSpread(source: ComicPageSource, given: ComicSpreadContext): [VDTComicPage, VDTComicPage] {
  // A host's screen pages (`comics.viewerLeaf`): each half on a print
  // leaf of its own, scaled, as a comic page is.
  const comics = resolvedComics(given.resolved);
  const leafL = comicViewerLeaf(comics, given.resolved, given.left.trimBox);
  const leafR = comicViewerLeaf(comics, given.resolved, given.right.trimBox);
  const onLeaf = (p: ComicSpreadPage, leaf: NonNullable<typeof leafL>): ComicSpreadPage =>
    ({ ...p, trimBox: leaf.box, bleedBox: leaf.box, contentBox: leaf.content, mirrorMargins: false });
  const ctx: ComicSpreadContext = leafL && leafR
    ? { ...given, resolved: { ...given.resolved, page: { ...given.resolved.page, dpi: leafL.dpi } }, left: onLeaf(given.left, leafL), right: onLeaf(given.right, leafR) }
    : given;
  const { resolved, left, right } = ctx;
  const leftFrame = comicPageFrame({ resolved, ...left });
  const rightFrame = comicPageFrame({ resolved, ...right });
  // Where the right sheet's origin sits in spread coordinates: its trim
  // box's left edge on the left one's right edge (the spine).
  const spine = left.trimBox.x + left.trimBox.width;
  const spineBand = (8 / 25.4) * resolved.page.dpi;
  const shift = spine - right.trimBox.x;
  const top = Math.min(leftFrame.y, rightFrame.y);
  const bottom = Math.max(leftFrame.y + leftFrame.height, rightFrame.y + rightFrame.height);
  const frame: BoundingBox = {
    x: leftFrame.x,
    y: top,
    width: shift + rightFrame.x + rightFrame.width - leftFrame.x,
    height: bottom - top,
  };
  const bleedBox: BoundingBox = {
    x: left.bleedBox.x,
    y: Math.min(left.bleedBox.y, right.bleedBox.y),
    width: shift + right.bleedBox.x + right.bleedBox.width - left.bleedBox.x,
    height: Math.max(left.bleedBox.y + left.bleedBox.height, right.bleedBox.y + right.bleedBox.height) - Math.min(left.bleedBox.y, right.bleedBox.y),
  };
  const trimBox: BoundingBox = {
    x: left.trimBox.x,
    y: Math.min(left.trimBox.y, right.trimBox.y),
    width: shift + right.trimBox.x + right.trimBox.width - left.trimBox.x,
    height: Math.max(left.trimBox.y + left.trimBox.height, right.trimBox.y + right.trimBox.height) - Math.min(left.trimBox.y, right.trimBox.y),
  };
  const whole = layoutComicFrame(source, {
    resolved,
    frame,
    bleedBox,
    trimBox,
    resources: ctx.resources,
    ...(ctx.sourceOffset !== undefined ? { sourceOffset: ctx.sourceOffset } : {}),
    pageIndex: left.page.index,
    // Balloons keep out of the gutter of the binding: a band of 8 mm about
    // the spine (a balloon there would be cut in two, or lost in the fold).
    avoid: [{ x: spine - spineBand / 2, y: frame.y - 1, width: spineBand, height: frame.height + 2 }],
  });
  const warnings = comicPageLayoutWarnings(whole);
  const sideOfPanel = (index: number): 'left' | 'right' => {
    const p = whole.panels.find((q) => q.index === index);
    return p && p.bbox.x + p.bbox.width / 2 >= spine ? 'right' : 'left';
  };

  const half = (side: 'left' | 'right'): VDTComicPage => {
    const page = side === 'left' ? left.page : right.page;
    const dx = side === 'left' ? 0 : -shift;
    // The page's sheet in spread coordinates, overrun past the spine.
    const minX = side === 'left' ? -Infinity : shift - SPINE_OVERRUN;
    const maxX = side === 'left' ? left.page.width + SPINE_OVERRUN : Infinity;
    const cut = side === 'left' ? maxX : minX;
    const panels = whole.panels
      .map((p) => clipPanel(p, side, cut))
      .filter((p): p is VDTComicPanel => p !== undefined)
      .map((p) => (dx === 0 ? p : translateComicPanel(p, dx, 0)));
    const splitters = whole.splitters
      .map((s) => clipSplitter(s, side === 'left' ? -Infinity : spine, side === 'left' ? spine : Infinity))
      .filter((s): s is VDTComicSplitter => s !== undefined)
      .map((s) => (dx === 0 ? s : translateComicSplitter(s, dx, 0)));
    const balloons = whole.balloons
      .filter((b) => (b.bbox.x + b.bbox.width / 2 < spine) === (side === 'left'))
      .map((b) => (dx === 0 ? b : translateComicBalloon(b, dx, 0)));
    const ownFrame = side === 'left'
      ? { x: frame.x, y: frame.y, width: Math.max(0, spine - frame.x), height: frame.height }
      : { x: right.trimBox.x, y: frame.y, width: Math.max(0, frame.x + frame.width - spine), height: frame.height };
    const comic: VDTComicPage = {
      sourceStart: whole.sourceStart,
      sourceEnd: whole.sourceEnd,
      frame: ownFrame,
      direction: whole.direction,
      spread: side,
      ...(leafL && leafR ? { leaf: side === 'left' ? leafL.box : leafR.box } : {}),
      panels,
      splitters,
      balloons,
    };
    // A panel's warning goes to the page holding its centre (once, even
    // for a panel across the spine).
    setComicLayoutWarnings(comic, warnings
      .filter((w) => (w.kind === 'comicPanelLetterbox' || w.kind === 'comicBalloonOverflow' ? sideOfPanel(w.panel) : 'left') === side)
      .map((w) => ({ ...w, pageIndex: page.index })));
    return comic;
  };
  return [half('left'), half('right')];
}
