/**
 * Comic strips in the text flow (`:::strip`, #566): a daily strip in a
 * column or across the page, a comic inside a prose book. A strip has the
 * body of a comic page; it is laid out as one unbreakable box of a fixed
 * height (`height`) or proportions (`aspect`, its width over its height),
 * set where it occurs (`placement=here`) or floated to the head or foot of
 * a page like a figure (`top`, `bottom`, `auto`), a column wide or a page
 * wide (`span`). Its panels are cut from the box: the box is the frame,
 * the gutters and panel styles are the comics config's, and nothing bleeds.
 * A strip may be narrower than the measure it spans (`width`, a length or
 * a percentage of that measure), set at its start, centre or end (`align`,
 * following the text direction), and carry a caption (`caption`), set in
 * the resource caption style and numbered in a resource type's sequence
 * when `type` names one (#590).
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
  /** How wide the strip is, when written: a length (`width=12cm`, a bare
   *  number in millimetres) or a share of the measure it spans
   *  (`width=60%`, `fraction` 0.6). Never wider than that measure. */
  width?: { length: Dimension } | { fraction: number };
  /** Where a strip narrower than its measure stands in it: at its start,
   *  centre (default) or end, along the text direction (the start is the
   *  right on a right-to-left page, the top on a vertical one). */
  align: ComicStripAlign;
  /** The caption set under (or over, per `captionStyle.position`) the
   *  strip, as written (inline Markdown), when it has one. */
  caption?: string;
  /** The resource type (`type=figure`) whose label and number the caption
   *  takes, when written: the strip is counted in that type's sequence. */
  type?: string;
  /** The strip's identifier (`id=…`): a `:ref` naming it prints its label
   *  and number (when it has a `type`). */
  id?: string;
}

/** Where a strip narrower than its measure stands (see
 *  {@link ComicStripPlacement.align}). */
export type ComicStripAlign = 'start' | 'center' | 'end';

/** A positive ratio written `3`, `3.2`, `4/1` or `4:1`; undefined when
 *  unreadable. */
export function parseComicAspect(value: string | undefined): number | undefined {
  const m = /^\s*([0-9]*\.?[0-9]+)\s*(?:[/:]\s*([0-9]*\.?[0-9]+))?\s*$/.exec(value ?? '');
  if (!m) return undefined;
  const r = Number(m[1]) / (m[2] !== undefined ? Number(m[2]) : 1);
  return Number.isFinite(r) && r > 0 ? r : undefined;
}

/** A strip's `width` as written: a percentage of its measure, or a length
 *  (a bare number in millimetres); undefined when unreadable or not
 *  positive. */
export function parseComicStripWidth(value: string | undefined): ComicStripPlacement['width'] {
  const pct = /^\s*([0-9]*\.?[0-9]+)\s*%\s*$/.exec(value ?? '');
  if (pct) {
    const f = Number(pct[1]) / 100;
    return f > 0 ? { fraction: Math.min(1, f) } : undefined;
  }
  const length = parseComicDimension(value);
  return length && length.value > 0 ? { length } : undefined;
}

/** A strip's `align` as written; `'center'` when absent or unknown. */
export function parseComicStripAlign(value: string | undefined): ComicStripAlign {
  const a = value?.trim().toLowerCase();
  return a === 'start' || a === 'end' ? a : 'center';
}

/** A strip's placement as its fence attributes write it. */
export function comicStripPlacement(attrs: Readonly<Record<string, string>>): ComicStripPlacement {
  const span = attrs.span?.trim().toLowerCase() === 'page' ? 'page' : 'column';
  const p = attrs.placement?.trim().toLowerCase();
  const position = p === 'top' || p === 'bottom' || p === 'auto' ? p : 'here';
  const height = parseComicDimension(attrs.height);
  const aspect = parseComicAspect(attrs.aspect);
  const width = parseComicStripWidth(attrs.width);
  const caption = attrs.caption?.trim();
  const type = attrs.type?.trim();
  const id = attrs.id?.trim();
  return {
    span,
    position,
    ...(height && height.value > 0 ? { height } : {}),
    ...(aspect !== undefined ? { aspect } : {}),
    ...(width ? { width } : {}),
    align: parseComicStripAlign(attrs.align),
    ...(caption ? { caption } : {}),
    ...(type ? { type } : {}),
    ...(id ? { id } : {}),
  };
}

/** The strip's width (px) in a measure `measure` px wide: its `width`,
 *  never wider than the measure nor narrower than a pixel. */
export function comicStripWidth(placement: Pick<ComicStripPlacement, 'width'>, measure: number, dpi: number): number {
  const w = placement.width;
  const natural = !w ? measure : 'fraction' in w ? measure * w.fraction : dimensionToPx(w.length, dpi);
  return Math.max(1, Math.min(measure, natural));
}

/** How far (px, along the measure, from its start) a strip `width` px wide
 *  stands in a measure `measure` px wide. */
export function comicStripOffset(align: ComicStripAlign, measure: number, width: number): number {
  const room = Math.max(0, measure - width);
  return align === 'start' ? 0 : align === 'end' ? room : room / 2;
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
 * A strip's extent across the flow (px) for a strip `measure` px wide
 * along the flow's measure (its `width` taken):
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
  /** Where that box stands in its block's box on the sheet (px from the
   *  block's top-left corner): a strip narrower than its measure, or one
   *  with a caption before it. Default 0, 0. */
  x?: number;
  y?: number;
  resources: ReadonlyMap<string, Resource>;
  sourceOffset?: number;
  pageIndex: number;
}

/** Lay out a strip in its own box: coordinates relative to its block's
 *  top-left corner on the sheet (`VDTBlock.comic`). Nothing bleeds. */
export function layoutComicStrip(source: ComicPageSource, ctx: ComicStripContext): VDTComicPage {
  const frame: BoundingBox = { x: ctx.x ?? 0, y: ctx.y ?? 0, width: ctx.width, height: ctx.height };
  return layoutComicFrame(source, {
    resolved: ctx.resolved,
    frame,
    bleedBox: frame,
    resources: ctx.resources,
    ...(ctx.sourceOffset !== undefined ? { sourceOffset: ctx.sourceOffset } : {}),
    pageIndex: ctx.pageIndex,
  });
}
