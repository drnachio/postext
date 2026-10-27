// A comic page's settings read from its attributes and the config: viewer
// leaf, dimensions, reading direction, panel padding, frame and gutters.
import type { ResolvedComicsConfig, Dimension, ColorPaletteEntry, ResolvedPanelStyleConfig, Resource } from '../../types.js';
import { type ResolvedConfig, type BoundingBox, flowRectToPage } from '../../vdt.js';
import { resolvedLocale, resolvedDirection } from '../../pipeline/config.js';
import { dimensionToPx } from '../../units.js';
import { comicReadingDirection, resolvedComics } from '../../defaults/comics.js';
import { type ComicFrameSide, physicalSide } from '../geometry.js';
import type { ComicPageSource, ComicPanelSource } from '../types.js';
import type { ComicPageContext } from '../layoutPage.js';

/** The leaf a comic page is laid out on when the page is not one
 *  (`comics.viewerLeaf`): its box on the page — the print leaf scaled to
 *  `fitWidth` px wide (no taller than `fitHeight`), at the top of the
 *  trim, centred across it —, its content area, and the dpi that scale
 *  resolves every length of the comic page at. Undefined without one. */
export function comicViewerLeaf(
  comics: ResolvedComicsConfig,
  resolved: ResolvedConfig,
  trim: BoundingBox,
): { box: BoundingBox; content: BoundingBox; dpi: number } | undefined {
  const leaf = comics.viewerLeaf;
  if (!leaf || !(leaf.fitWidth > 0)) return undefined;
  const dpi0 = resolved.page.dpi;
  const w0 = dimensionToPx(leaf.width, dpi0);
  const h0 = dimensionToPx(leaf.height, dpi0);
  if (!(w0 > 0) || !(h0 > 0)) return undefined;
  const k = Math.min(leaf.fitWidth / w0, leaf.fitHeight && leaf.fitHeight > 0 ? leaf.fitHeight / h0 : Infinity);
  const dpi = dpi0 * k;
  const width = w0 * k;
  const height = h0 * k;
  const box = { x: trim.x + Math.max(0, (trim.width - width) / 2), y: trim.y, width, height };
  const m = leaf.margins ?? {};
  const at = (d: Dimension | undefined): number => (d ? dimensionToPx(d, dpi) : 0);
  const left = at(m.left);
  const right = at(m.right);
  const top = at(m.top);
  const bottom = at(m.bottom);
  const content = { x: box.x + left, y: box.y + top, width: Math.max(0, width - left - right), height: Math.max(0, height - top - bottom) };
  return { box, content, dpi };
}

/** A Dimension written in an attribute (`4mm`, `0.5cm`, `6pt`, `12px`, a
 *  bare number in mm), or undefined. */
export function parseComicDimension(value: string | undefined): Dimension | undefined {
  if (value === undefined) return undefined;
  // The number is `4`, `0.5` or `.5`, each written one way only (linear).
  const m = /^([0-9]+(?:\.[0-9]+)?|\.[0-9]+)(?:\s*(mm|cm|in|pt|px))?$/.exec(value.trim());
  if (!m) return undefined;
  return { value: Number(m[1]), unit: (m[2] as Dimension['unit'] | undefined) ?? 'mm' };
}

/** Whether a flag attribute is on: present, and not `false` / `no` / `0`. */
export function flagOn(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const t = value.trim().toLowerCase();
  return !(t === 'false' || t === 'no' || t === '0' || t === 'none');
}

/** The reading direction of a page: its `direction` attribute, else the
 *  document's ({@link comicReadingDirection}): `'auto'` is `'rtl'` in a
 *  right-to-left document (an Arabic edition mirrors its pages), in a
 *  vertical one and in a Japanese or Traditional Chinese one (a localized
 *  edition of a Western comic reads in its language's direction), and the
 *  direction the art was drawn for otherwise (`comics.artDirection`: a
 *  manga stays right to left in any language). Every comic of the
 *  document — pages, spreads, strips, their lettering order and the
 *  guided views — reads in the direction this returns. */
export function comicPageDirection(source: Pick<ComicPageSource, 'attrs'>, comics: ResolvedComicsConfig, resolved: ResolvedConfig): 'ltr' | 'rtl' {
  const own = source.attrs.direction?.trim().toLowerCase() ?? source.attrs.dir?.trim().toLowerCase();
  if (own === 'ltr' || own === 'rtl') return own;
  return comicReadingDirection(comics, {
    locale: resolvedLocale(resolved),
    direction: resolvedDirection(resolved),
    writingMode: resolved.layout.writingMode,
  });
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
export function attrColor(value: string | undefined, palette: readonly ColorPaletteEntry[] | undefined): string | undefined {
  const v = value?.trim();
  if (!v) return undefined;
  if (/^#[0-9a-f]{3}(?:[0-9a-f]{3})?(?:[0-9a-f]{2})?$/i.test(v)) return v;
  if (v === 'none' || v === 'transparent') return 'transparent';
  return palette?.find((e) => e.id === v)?.value.hex;
}

/** The sides of the frame a panel bleeds through: the page's `bleed`, the
 *  panel's (`bleed`, `bleed="top start"`, `bleed=false`), else its style's. */
export function bleedSides(page: ComicPageSource, panel: ComicPanelSource | undefined, style: ResolvedPanelStyleConfig, direction: 'ltr' | 'rtl'): ComicFrameSide[] {
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
export function pictureOf(resources: ReadonlyMap<string, Resource>, id: string | undefined): { resource: Resource; kind: 'bitmap' | 'svg'; fileId: string; format?: string; width: number; height: number } | undefined {
  if (!id) return undefined;
  const r = resources.get(id);
  if (!r) return undefined;
  if (r.kind === 'bitmap' && r.bitmap) return { resource: r, kind: 'bitmap', fileId: r.bitmap.fileId, format: r.bitmap.format, width: r.bitmap.width, height: r.bitmap.height };
  if (r.kind === 'svg' && r.svg) return { resource: r, kind: 'svg', fileId: r.svg.fileId, width: r.svg.width ?? 0, height: r.svg.height ?? 0 };
  return undefined;
}

/** The frame of a page: the content area on the sheet, or the trim inset
 *  by `comics.frame.margins`. */
export function comicPageFrame(ctx: Pick<ComicPageContext, 'resolved' | 'page' | 'trimBox' | 'mirrorMargins' | 'contentBox'>, comics: ResolvedComicsConfig = resolvedComics(ctx.resolved)): BoundingBox {
  const m = comics.frame.margins;
  if (!m) return ctx.contentBox ?? flowRectToPage(ctx.page, ctx.page.contentArea);
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
export function comicGutters(source: ComicPageSource, comics: ResolvedComicsConfig, dpi: number): { rows: number; columns: number } {
  const parts = source.attrs.gutter?.trim().split(/\s+/).filter(Boolean) ?? [];
  const a = parseComicDimension(parts[0]);
  const b = parseComicDimension(parts[1]) ?? a;
  return {
    rows: dimensionToPx(a ?? comics.gutter.horizontal, dpi),
    columns: dimensionToPx(b ?? comics.gutter.vertical, dpi),
  };
}
