/**
 * Comic strips in the text flow (`:::strip`, #566): a daily strip in a
 * column or across the page, a comic inside a prose book. A strip has the
 * body of a comic page; it is laid out as one unbreakable box of a fixed
 * height (`height`) or proportions (`aspect`, its width over its height),
 * set where it occurs (`placement=here`) or floated to the head or foot of
 * a page like a figure (`top`, `bottom`, `auto`), a column wide or a page
 * wide (`span`). Its panels are cut from the box: the box is the frame,
 * the gutters and panel styles are the comics config's, and nothing bleeds.
 *
 * ```md
 * :::strip{split="* | * | *" aspect=3.2 span=page placement=top}
 * ::panel{art=d1}
 * ana: Morning!
 * ::panel{art=d2}
 * ::panel{art=d3}
 * :::
 * ```
 */

import type { BoundingBox, ResolvedConfig, VDTComicPage } from '../vdt';
import type { Dimension, Resource } from '../types';
import { dimensionToPx } from '../units';
import { layoutComicFrame, parseComicDimension } from './layoutPage';
import type { ComicSplitList } from './split';
import type { ComicPageSource } from './types';

/** Where and how wide a strip is set. */
export interface ComicStripPlacement {
  /** `'column'` (default): the measure of the column it falls in;
   *  `'page'`: the width of the content area, across the columns. */
  span: 'column' | 'page';
  /** `'here'` (default): in the flow, where it is written (it moves to the
   *  next column or page whole when it does not fit). `'top'` / `'bottom'`
   *  / `'auto'`: floated to the head or foot of the first page with room
   *  from this point on, like a figure. */
  position: 'here' | 'auto' | 'top' | 'bottom';
  /** The strip's extent across the flow (its height on a horizontal page),
   *  when written (`height=4cm`; a bare number is in mm). */
  height?: Dimension;
  /** Width over height on the sheet (`aspect=3`, `aspect=4/1`, `4:1`),
   *  when written. */
  aspect?: number;
}

/** A positive ratio written `3`, `3.2`, `4/1` or `4:1`; undefined when
 *  unreadable. */
export function parseComicAspect(value: string | undefined): number | undefined {
  const m = /^\s*([0-9]*\.?[0-9]+)\s*(?:[/:]\s*([0-9]*\.?[0-9]+))?\s*$/.exec(value ?? '');
  if (!m) return undefined;
  const r = Number(m[1]) / (m[2] !== undefined ? Number(m[2]) : 1);
  return Number.isFinite(r) && r > 0 ? r : undefined;
}

/** A strip's placement as its fence attributes write it. */
export function comicStripPlacement(attrs: Readonly<Record<string, string>>): ComicStripPlacement {
  const span = attrs.span?.trim().toLowerCase() === 'page' ? 'page' : 'column';
  const p = attrs.placement?.trim().toLowerCase();
  const position = p === 'top' || p === 'bottom' || p === 'auto' ? p : 'here';
  const height = parseComicDimension(attrs.height);
  const aspect = parseComicAspect(attrs.aspect);
  return { span, position, ...(height && height.value > 0 ? { height } : {}), ...(aspect !== undefined ? { aspect } : {}) };
}

/** How many cells a split sets side by side (`across`) and stacked
 *  (`down`) at most — the grid its panels would make if they were all
 *  square. */
export function comicSplitGrid(list: ComicSplitList): { across: number; down: number } {
  const parts = list.items.map((it) => (it.children ? comicSplitGrid(it.children) : { across: 1, down: 1 }));
  if (parts.length === 0) return { across: 1, down: 1 };
  if (list.axis === 'columns') {
    return { across: parts.reduce((s, p) => s + p.across, 0), down: Math.max(...parts.map((p) => p.down)) };
  }
  if (list.axis === 'rows') {
    return { across: Math.max(...parts.map((p) => p.across)), down: parts.reduce((s, p) => s + p.down, 0) };
  }
  return parts[0]!;
}

/** The proportions of a strip: its `aspect`, else those that make its
 *  panels about square (three panels side by side: 3). */
export function comicStripAspect(source: Pick<ComicPageSource, 'attrs' | 'splitParse'>): number {
  const own = parseComicAspect(source.attrs.aspect);
  if (own !== undefined) return own;
  const g = comicSplitGrid(source.splitParse.tree);
  return g.across / g.down;
}

/**
 * A strip's extent across the flow (px) for a measure of `measure` px:
 * its `height`, else the measure over its aspect (times it on a vertical
 * page, where the measure runs down the sheet), never more than `max` (a
 * strip never runs past a fresh column) nor less than a pixel.
 */
export function comicStripExtent(
  source: Pick<ComicPageSource, 'attrs' | 'splitParse'>,
  measure: number,
  dpi: number,
  vertical: boolean,
  max: number,
): number {
  const placement = comicStripPlacement(source.attrs);
  const aspect = comicStripAspect(source);
  const natural = placement.height ? dimensionToPx(placement.height, dpi) : vertical ? measure * aspect : measure / aspect;
  return Math.max(1, Math.min(natural, Math.max(1, max)));
}

/** What {@link layoutComicStrip} needs. */
export interface ComicStripContext {
  resolved: ResolvedConfig;
  /** The strip's box on the sheet (px): its width and height there (the
   *  flow box turned on a vertical page). */
  width: number;
  height: number;
  resources: ReadonlyMap<string, Resource>;
  sourceOffset?: number;
  pageIndex: number;
}

/** Lay out a strip in its own box: coordinates relative to its top-left
 *  corner on the sheet (`VDTBlock.comic`). Nothing bleeds. */
export function layoutComicStrip(source: ComicPageSource, ctx: ComicStripContext): VDTComicPage {
  const frame: BoundingBox = { x: 0, y: 0, width: ctx.width, height: ctx.height };
  return layoutComicFrame(source, {
    resolved: ctx.resolved,
    frame,
    bleedBox: frame,
    resources: ctx.resources,
    ...(ctx.sourceOffset !== undefined ? { sourceOffset: ctx.sourceOffset } : {}),
    pageIndex: ctx.pageIndex,
  });
}
