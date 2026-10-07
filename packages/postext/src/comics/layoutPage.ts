/**
 * Lay out a comic page (`:::page`, #555–#557): its frame, the cells of its
 * split, each panel's border, background and cropped picture, and the split
 * lines the Sandbox drags. The lettering (balloons) is set by
 * {@link letterPanels}.
 *
 * Everything is on the sheet (page px), whatever the document's writing
 * mode or direction; the reading direction of the panels comes from
 * `comics.readingDirection` (or the page's `direction`).
 */

import type { ColorPaletteEntry, Dimension, Resource, ResolvedComicsConfig, ResolvedPanelStyleConfig } from '../types';
import type { BoundingBox, ContentWarning, ResolvedConfig, VDTComicArt, VDTComicBalloon, VDTComicPage, VDTComicPanel, VDTComicSplitter, VDTPage } from '../vdt';
import { flowRectToPage } from '../vdt';
import { resolvedDirection } from '../pipeline/config';
import { dimensionToPx } from '../units';
import { pickPanelStyle, resolvedComics } from '../defaults/comics';
import { comicArtCrop } from './art';
import { clipPolygon, comicGeometry, physicalSide, polygonBBox, type ComicCell, type ComicFrameSide } from './geometry';
import { parseComicPoint } from './script';
import type { ComicPageSource, ComicPanelSource } from './types';

/** What the build hands the comic page layout. */
export interface ComicPageContext {
  resolved: ResolvedConfig;
  /** The page the comic owns (its content area is the default frame). */
  page: VDTPage;
  /** The trim and bleed boxes of the sheet (physical). */
  trimBox: BoundingBox;
  bleedBox: BoundingBox;
  resources: ReadonlyMap<string, Resource>;
  /** Added to every source offset of `source` (the frontmatter's length:
   *  VDT offsets are in the whole Markdown). */
  sourceOffset?: number;
  /** Whether this page swaps mirrored margins (a verso of a left-bound
   *  book), for `comics.frame.margins` with `mirror`. */
  mirrorMargins?: boolean;
}

/** A Dimension written in an attribute (`4mm`, `0.5cm`, `6pt`, `12px`, a
 *  bare number in mm), or undefined. */
export function parseComicDimension(value: string | undefined): Dimension | undefined {
  if (value === undefined) return undefined;
  const m = /^\s*([0-9]*\.?[0-9]+)\s*(mm|cm|in|pt|px)?\s*$/.exec(value);
  if (!m) return undefined;
  return { value: Number(m[1]), unit: (m[2] as Dimension['unit'] | undefined) ?? 'mm' };
}

/** Whether a flag attribute is on: present, and not `false` / `no` / `0`. */
function flagOn(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const t = value.trim().toLowerCase();
  return !(t === 'false' || t === 'no' || t === '0' || t === 'none');
}

/** The reading direction of a page: its `direction` attribute, else the
 *  config's; `'auto'` is `'rtl'` in a right-to-left document (an Arabic
 *  edition mirrors its pages) and the direction the art was drawn for
 *  otherwise (`comics.artDirection`: a Japanese edition of a Western comic
 *  stays left to right, a manga stays right to left in any language). */
export function comicPageDirection(source: Pick<ComicPageSource, 'attrs'>, comics: ResolvedComicsConfig, resolved: ResolvedConfig): 'ltr' | 'rtl' {
  const own = source.attrs.direction?.trim().toLowerCase() ?? source.attrs.dir?.trim().toLowerCase();
  if (own === 'ltr' || own === 'rtl') return own;
  if (comics.readingDirection === 'ltr' || comics.readingDirection === 'rtl') return comics.readingDirection;
  return resolvedDirection(resolved) === 'rtl' ? 'rtl' : comics.artDirection;
}

/** A panel's `pad` (CSS-like, one to four values: top, end, bottom,
 *  start; each a Dimension or a percentage of the cell, `pad="0 12%"`) as
 *  px insets of a cell `cell` wide and high on a page read in
 *  `direction`. Undefined when unset or unreadable. */
export function comicPanelPadding(
  value: string | undefined,
  cell: Pick<BoundingBox, 'width' | 'height'>,
  direction: 'ltr' | 'rtl',
  dpi: number,
): { top: number; right: number; bottom: number; left: number } | undefined {
  const parts = value?.trim().split(/[\s,]+/).filter(Boolean) ?? [];
  if (parts.length === 0 || parts.length > 4) return undefined;
  const px = (v: string, along: number): number | undefined => {
    const pct = /^\s*(-?[0-9]*\.?[0-9]+)\s*%\s*$/.exec(v);
    if (pct) return (Number(pct[1]) / 100) * along;
    if (/^\s*0+(?:\.0*)?\s*$/.test(v)) return 0;
    const d = parseComicDimension(v);
    return d ? dimensionToPx(d, dpi) : undefined;
  };
  const [t, e = t, b = t, st = e] = parts as [string, string?, string?, string?];
  const top = px(t, cell.height);
  const end = px(e!, cell.width);
  const bottom = px(b!, cell.height);
  const start = px(st!, cell.width);
  if (top === undefined || end === undefined || bottom === undefined || start === undefined) return undefined;
  const clampV = (v: number) => Math.max(0, v);
  return direction === 'ltr'
    ? { top: clampV(top), right: clampV(end), bottom: clampV(bottom), left: clampV(start) }
    : { top: clampV(top), right: clampV(start), bottom: clampV(bottom), left: clampV(end) };
}

/** A colour written in an attribute: `#rgb` / `#rrggbb`, or a palette id. */
function attrColor(value: string | undefined, palette: readonly ColorPaletteEntry[] | undefined): string | undefined {
  const v = value?.trim();
  if (!v) return undefined;
  if (/^#[0-9a-f]{3}(?:[0-9a-f]{3})?(?:[0-9a-f]{2})?$/i.test(v)) return v;
  if (v === 'none' || v === 'transparent') return 'transparent';
  return palette?.find((e) => e.id === v)?.value.hex;
}

/** The sides of the frame a panel bleeds through: the page's `bleed`, the
 *  panel's (`bleed`, `bleed="top start"`, `bleed=false`), else its style's. */
function bleedSides(page: ComicPageSource, panel: ComicPanelSource | undefined, style: ResolvedPanelStyleConfig, direction: 'ltr' | 'rtl'): ComicFrameSide[] {
  const all: ComicFrameSide[] = ['top', 'bottom', 'left', 'right'];
  const own = panel?.attrs.bleed;
  if (own !== undefined) {
    const t = own.trim().toLowerCase();
    if (t === '' || t === 'true' || t === 'all') return all;
    if (t === 'false' || t === 'none' || t === 'no') return [];
    return t.split(/[\s,]+/).map((s) => physicalSide(s, direction)).filter((s): s is ComicFrameSide => s !== undefined);
  }
  if (flagOn(page.attrs.bleed)) return all;
  return style.bleed ? all : [];
}

/** The picture of a resource a panel names, if it is one. */
function pictureOf(resources: ReadonlyMap<string, Resource>, id: string | undefined): { resource: Resource; kind: 'bitmap' | 'svg'; fileId: string; format?: string; width: number; height: number } | undefined {
  if (!id) return undefined;
  const r = resources.get(id);
  if (!r) return undefined;
  if (r.kind === 'bitmap' && r.bitmap) return { resource: r, kind: 'bitmap', fileId: r.bitmap.fileId, format: r.bitmap.format, width: r.bitmap.width, height: r.bitmap.height };
  if (r.kind === 'svg' && r.svg) return { resource: r, kind: 'svg', fileId: r.svg.fileId, width: r.svg.width ?? 0, height: r.svg.height ?? 0 };
  return undefined;
}

/** `inset="x y w h"`: percentages (or fractions) of the previous panel's
 *  box. */
function insetBox(value: string | undefined, of: BoundingBox): BoundingBox | undefined {
  if (!value) return undefined;
  const parts = value.trim().split(/[\s,]+/).map((p) => Number(p.replace('%', '')));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return undefined;
  const fractions = !value.includes('%') && parts.every((n) => n <= 1);
  const [x, y, w, h] = parts.map((n) => (fractions ? n : n / 100)) as [number, number, number, number];
  if (w <= 0 || h <= 0) return undefined;
  return { x: of.x + x * of.width, y: of.y + y * of.height, width: w * of.width, height: h * of.height };
}

/** The frame of a page: the content area on the sheet, or the trim inset
 *  by `comics.frame.margins`. */
function comicFrame(ctx: ComicPageContext, comics: ResolvedComicsConfig): BoundingBox {
  const m = comics.frame.margins;
  if (!m) return flowRectToPage(ctx.page, ctx.page.contentArea);
  const dpi = ctx.resolved.page.dpi;
  const t = ctx.trimBox;
  let left = dimensionToPx(m.left, dpi);
  let right = dimensionToPx(m.right, dpi);
  if (m.mirror && ctx.mirrorMargins) [left, right] = [right, left];
  const top = dimensionToPx(m.top, dpi);
  const bottom = dimensionToPx(m.bottom, dpi);
  return { x: t.x + left, y: t.y + top, width: Math.max(0, t.width - left - right), height: Math.max(0, t.height - top - bottom) };
}

/** The panel gutters (px): the page's `gutter` (one value for both, or
 *  `"rows columns"`), else the config's. */
function comicGutters(source: ComicPageSource, comics: ResolvedComicsConfig, dpi: number): { rows: number; columns: number } {
  const parts = source.attrs.gutter?.trim().split(/\s+/).filter(Boolean) ?? [];
  const a = parseComicDimension(parts[0]);
  const b = parseComicDimension(parts[1]) ?? a;
  return {
    rows: dimensionToPx(a ?? comics.gutter.horizontal, dpi),
    columns: dimensionToPx(b ?? comics.gutter.vertical, dpi),
  };
}

/** Layout warnings of the comic pages laid out, keyed by the page they
 *  belong to (each build pass lays its pages out afresh; only the last
 *  pass's pages reach the document). */
const layoutWarnings = new WeakMap<VDTComicPage, ContentWarning[]>();

/** The warnings the layout of a comic page found (`comicPanelLetterbox`). */
export function comicPageLayoutWarnings(comic: VDTComicPage): readonly ContentWarning[] {
  return layoutWarnings.get(comic) ?? [];
}

/**
 * The lettering of a page's panels: balloons, captions and sound effects,
 * in reading order. Set by the lettering modules (#559–#561); until they are
 * wired in, a comic page carries no balloons.
 */
export function letterPanels(_input: {
  source: ComicPageSource;
  panels: readonly VDTComicPanel[];
  /** The script of each laid-out panel (undefined for an empty cell). */
  panelSources: readonly (ComicPanelSource | undefined)[];
  comics: ResolvedComicsConfig;
  resolved: ResolvedConfig;
  resources: ReadonlyMap<string, Resource>;
  direction: 'ltr' | 'rtl';
  sourceOffset: number;
}): VDTComicBalloon[] {
  return [];
}

/** Lay out a comic page. */
export function layoutComicPage(source: ComicPageSource, ctx: ComicPageContext): VDTComicPage {
  const { resolved, resources } = ctx;
  const dpi = resolved.page.dpi;
  const off = ctx.sourceOffset ?? 0;
  const comics = resolvedComics(resolved);
  const direction = comicPageDirection(source, comics, resolved);
  const frame = comicFrame(ctx, comics);
  const pageStyle = pickPanelStyle(comics, source.attrs.style?.trim());
  const flowPanels = source.panels.filter((p) => !p.attrs.inset);
  const styleOf = (p: ComicPanelSource | undefined) => (p?.attrs.style ? pickPanelStyle(comics, p.attrs.style.trim()) : pageStyle);
  const geometry = comicGeometry({
    tree: source.splitParse.tree,
    frame,
    bleedBox: ctx.bleedBox,
    direction,
    gutter: comicGutters(source, comics, dpi),
    bleed: (i) => bleedSides(source, flowPanels[i], styleOf(flowPanels[i]), direction),
  });
  const warnings: ContentWarning[] = [];
  const panels: VDTComicPanel[] = [];
  const panelSources: (ComicPanelSource | undefined)[] = [];
  const mirrorDefault = comics.mirrorArt && direction !== comics.artDirection;

  const buildPanel = (whole: Pick<ComicCell, 'polygon' | 'bbox' | 'rect'>, p: ComicPanelSource | undefined): VDTComicPanel => {
    const style = styleOf(p);
    const attrs = p?.attrs ?? {};
    const cell = padCell(whole, comicPanelPadding(attrs.pad, whole.bbox, direction, dpi));
    const border = attrs.border?.trim();
    const borderWidth = border === 'none' ? 0 : border ? dimensionToPx(parseComicDimension(border) ?? style.borderWidth, dpi) : dimensionToPx(style.borderWidth, dpi);
    const bg = attrColor(attrs.bg, resolved.colorPalette) ?? style.background.hex;
    const index = panels.length;
    const panel: VDTComicPanel = {
      index,
      ...(attrs.id ? { id: attrs.id } : {}),
      sourceStart: (p?.sourceStart ?? source.sourceStart) + off,
      sourceEnd: (p?.sourceEnd ?? source.sourceStart) + off,
      polygon: cell.polygon,
      bbox: cell.bbox,
      radius: cell.rect ? Math.min(dimensionToPx(style.borderRadius, dpi), cell.bbox.width / 2, cell.bbox.height / 2) : 0,
      border: { width: borderWidth, color: style.borderColor.hex, style: borderWidth > 0 ? style.borderStyle : 'none' },
      ...(bg && bg !== 'transparent' ? { background: bg } : {}),
    };
    const fit = attrs.fit === 'contain' || attrs.fit === 'cover' ? attrs.fit : style.fit;
    const focus = parseComicPoint(attrs.focus);
    const mirrorAttr = flagOn(attrs.mirror);
    const mirrored = mirrorAttr ?? mirrorDefault;
    const art = pictureOf(resources, attrs.art?.trim());
    let crop: ReturnType<typeof comicArtCrop> | undefined;
    if (art) {
      // A picture with no intrinsic size (an SVG without one) fills the
      // cell as it is.
      const w = art.width > 0 && art.height > 0 ? art.width : cell.bbox.width;
      const h = art.width > 0 && art.height > 0 ? art.height : cell.bbox.height;
      crop = comicArtCrop({ width: w, height: h, cell: cell.bbox, fit, ...(art.resource.safeArea ? { safeArea: art.resource.safeArea } : {}), ...(focus ? { focus } : {}), mirrored });
      panel.art = artOf(art, crop, mirrored);
      if (crop.fallback) warnings.push({ kind: 'comicPanelLetterbox', resourceId: art.resource.id, panel: index, sourceStart: panel.sourceStart, sourceEnd: (p?.lineEnd ?? source.sourceStart) + off, pageIndex: ctx.page.index });
    }
    const pop = pictureOf(resources, attrs.pop?.trim());
    if (pop) {
      const popCrop = crop ?? comicArtCrop({ width: pop.width || cell.bbox.width, height: pop.height || cell.bbox.height, cell: cell.bbox, fit, ...(focus ? { focus } : {}), mirrored });
      panel.pop = artOf(pop, popCrop, mirrored);
    }
    const alt = attrs.alt ?? art?.resource.altText;
    if (alt) panel.altText = alt;
    return panel;
  };

  // Cells take the flow panels in reading order; inset panels sit over the
  // panel before them.
  let flowIndex = 0;
  const pending = [...source.panels];
  for (const cell of geometry.cells) {
    // Inset panels that come before the next flow panel follow the panel
    // laid out last.
    while (pending.length > 0 && pending[0]!.attrs.inset) layInset(pending.shift()!);
    const p = flowPanels[flowIndex];
    if (p && pending[0] === p) pending.shift();
    flowIndex++;
    panels.push(buildPanel(cell, p));
    panelSources.push(p);
  }
  while (pending.length > 0 && pending[0]!.attrs.inset) layInset(pending.shift()!);

  function layInset(p: ComicPanelSource): void {
    const prev = panels[panels.length - 1];
    const box = prev ? insetBox(p.attrs.inset, prev.bbox) : undefined;
    if (!box) return;
    const polygon = [
      { x: box.x, y: box.y },
      { x: box.x + box.width, y: box.y },
      { x: box.x + box.width, y: box.y + box.height },
      { x: box.x, y: box.y + box.height },
    ];
    panels.push(buildPanel({ polygon, bbox: polygonBBox(polygon), rect: true }, p));
    panelSources.push(p);
  }

  const splitRange = source.attrSources.split;
  const valueStart = (splitRange?.start ?? source.attrsEnd) + off;
  const valueEnd = (splitRange?.end ?? source.attrsEnd) + off;
  const splitters: VDTComicSplitter[] = geometry.lines.map((l) => ({ ...l, sourceStart: valueStart, sourceEnd: valueEnd }));
  const comic: VDTComicPage = {
    sourceStart: source.sourceStart + off,
    sourceEnd: source.sourceEnd + off,
    frame,
    direction,
    panels,
    splitters,
    balloons: [],
  };
  comic.balloons = letterPanels({ source, panels, panelSources, comics, resolved, resources, direction, sourceOffset: off });
  if (warnings.length > 0) layoutWarnings.set(comic, warnings);
  return comic;
}

/** A cell inset by its panel's `pad`. */
function padCell(
  cell: Pick<ComicCell, 'polygon' | 'bbox' | 'rect'>,
  pad: { top: number; right: number; bottom: number; left: number } | undefined,
): Pick<ComicCell, 'polygon' | 'bbox' | 'rect'> {
  if (!pad || (pad.top === 0 && pad.right === 0 && pad.bottom === 0 && pad.left === 0)) return cell;
  const b = cell.bbox;
  const x0 = b.x + pad.left;
  const x1 = Math.max(x0, b.x + b.width - pad.right);
  const y0 = b.y + pad.top;
  const y1 = Math.max(y0, b.y + b.height - pad.bottom);
  let poly = cell.polygon;
  poly = clipPolygon(poly, { nx: -1, ny: 0, c: -x0 });
  poly = clipPolygon(poly, { nx: 1, ny: 0, c: x1 });
  poly = clipPolygon(poly, { nx: 0, ny: -1, c: -y0 });
  poly = clipPolygon(poly, { nx: 0, ny: 1, c: y1 });
  return { polygon: poly, bbox: polygonBBox(poly), rect: cell.rect };
}

function artOf(
  art: { resource: Resource; kind: 'bitmap' | 'svg'; fileId: string; format?: string },
  crop: { box: BoundingBox; source: BoundingBox; letterbox: boolean },
  mirrored: boolean,
): VDTComicArt {
  return {
    resourceId: art.resource.id,
    kind: art.kind,
    fileId: art.fileId,
    ...(art.format ? { format: art.format } : {}),
    box: crop.box,
    source: crop.source,
    mirrored,
    letterbox: crop.letterbox,
  };
}
