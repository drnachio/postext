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

import { cornerRadiiPx, isCornerRadii, uniformRadius } from '../design/boxShape.js';
import type { ColorPaletteEntry, ComicCastMember, Dimension, Resource, ResolvedBalloonStyleConfig, ResolvedComicsConfig, ResolvedPanelStyleConfig } from '../types.js';
import type { BoundingBox, ContentWarning, ResolvedConfig, VDTComicArt, VDTComicBalloon, VDTComicPage, VDTComicPanel, VDTComicSplitter, VDTPage, VDTPoint } from '../vdt.js';
import { flowRectToPage } from '../vdt.js';
import { resolvedDirection, resolvedLocale } from '../pipeline/config.js';
import { dimensionToPx } from '../units.js';
import { chineseScriptOf, directionOf, isCjkLanguage, isJapaneseLanguage, presentTag } from '../hyphenation/locale.js';
import { comicReadingDirection, DEFAULT_LETTERING_STATIC, pickBalloonStyle, pickPanelStyle, resolvedComics } from '../defaults/comics.js';
import { comicArtCrop, comicArtPointToPage, comicArtRectToPage } from './art.js';
import { comicGeometry, physicalSide, pointInPolygon, type ComicFrameSide } from './geometry.js';
import { comicBalloonElementId, comicBoxStyle, comicElementId, comicFrameElementId, comicFrameSpecs, comicPanelFrame, isComicTextPanel, type ComicFrameSpec } from './frames.js';
import { parseComicPoint } from './script.js';
import { letterPanelDetailed } from './lettering/letter.js';
import type { LetteringAnchor, LetteringForeignArt, LetteringItem, LetteringPanel, LetteringStyle } from './lettering/types.js';
import type { ComicPageSource, ComicPanelSource, ComicScriptItem } from './types.js';

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
  /** The comic fence's ordinal among the comic fences of its chapter
   *  (#885): the stable ids of the comic, its frames and balloons. */
  fenceIndex?: number;
  /** Whether this page swaps mirrored margins (a verso of a left-bound
   *  book), for `comics.frame.margins` with `mirror`. */
  mirrorMargins?: boolean;
  /** The content area on the sheet, when it is not the page's (a leaf of
   *  its own, `comics.viewerLeaf`). */
  contentBox?: BoundingBox;
}

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
function flagOn(value: string | undefined): boolean | undefined {
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

/** The warnings the layout of a comic page found (`comicPanelLetterbox`,
 *  `comicBalloonOverflow`). */
export function comicPageLayoutWarnings(comic: VDTComicPage): readonly ContentWarning[] {
  return layoutWarnings.get(comic) ?? [];
}

/** The script (or text) each laid-out panel of a comic was set from, by
 *  the comic laid out (#885): what fills a text panel's frame. */
const panelSourcesOf = new WeakMap<VDTComicPage, readonly (ComicPanelSource | undefined)[]>();

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

/** The document language the lettering is set in (as
 *  {@link resolvedComics} reads it). */
export function comicLetteringLocale(resolved: ResolvedConfig): string {
  const h = resolved.bodyText.hyphenation;
  return presentTag(resolved.locale) ?? presentTag(h.tag) ?? presentTag(h.locale) ?? 'en';
}

/** Whether balloons are set vertically: `lettering.writingMode`, `auto`
 *  meaning vertical for Japanese and Traditional Chinese (the comics of
 *  both are lettered in columns) and in a vertical document. */
export function comicLetteringVertical(comics: ResolvedComicsConfig, resolved: ResolvedConfig, locale: string): boolean {
  const mode = comics.lettering.writingMode;
  if (mode === 'vertical') return true;
  if (mode === 'horizontal') return false;
  return isJapaneseLanguage(locale) || chineseScriptOf(locale) === 'Hant' || resolved.layout.writingMode === 'vertical-rl';
}

/** The role's own balloon style. */
function roleStyleId(role: ComicScriptItem['role']): string {
  return role === 'speech' ? 'speech' : role;
}

/**
 * A balloon style of the config resolved to the lettering's px style
 * (SPEC D4 → D3): the style over the book's lettering, the speaker's cast
 * entry and the line's own `color` / `font` over both. One lettering size
 * per book: `fontScale` is the only factor (a sound effect's `size=` scales
 * the item, not the style).
 */
export function comicLetteringStyle(input: {
  style: ResolvedBalloonStyleConfig;
  comics: ResolvedComicsConfig;
  cast?: ComicCastMember;
  item?: Pick<ComicScriptItem, 'color' | 'font'>;
  locale: string;
  vertical: boolean;
  dpi: number;
  palette?: readonly ColorPaletteEntry[];
}): LetteringStyle {
  const { style: st, comics, cast, item, locale, vertical, dpi } = input;
  const L = comics.lettering;
  const em = dimensionToPx(L.fontSize, dpi);
  const size = em * (st.fontScale > 0 ? st.fontScale : 1);
  const cjk = isCjkLanguage(locale);
  const rtl = directionOf(locale) === 'rtl';
  // Leading: the book's, or what a column of CJK or a line of Arabic needs
  // when the book leaves the default.
  const lineHeight = L.lineHeight !== DEFAULT_LETTERING_STATIC.lineHeight ? L.lineHeight
    : vertical || cjk ? 1.5 : rtl ? 1.45 : L.lineHeight;
  const letterSpacing = dimensionToPx(st.letterSpacing ?? L.letterSpacing, dpi, size);
  const dropFinalStop = L.dropFinalStop === 'auto' ? undefined : L.dropFinalStop;
  const out: LetteringStyle = {
    id: st.id,
    shape: st.shape,
    fill: cast?.fill?.hex ?? st.fill.hex,
    stroke: st.stroke.hex,
    strokeWidth: dimensionToPx(st.strokeWidth, dpi, size),
    ...(st.dash ? { dash: true } : {}),
    ...(st.double ? { double: true } : {}),
    ...(st.wobble ? { wobble: st.wobble } : {}),
    roundness: st.roundness,
    ...(st.burstPoints ? { burstPoints: st.burstPoints } : {}),
    ...(st.burstDepth ? { burstDepthRatio: st.burstDepth } : {}),
    padding: dimensionToPx(st.padding, dpi, size),
    aspect: st.aspect,
    tail: st.tail,
    tailWidth: dimensionToPx(st.tailWidth, dpi, size),
    tailReach: st.tailReach,
    target: st.target,
    position: st.position,
    ...(st.butt ? { butt: true } : {}),
    fontFamily: item?.font?.trim() || cast?.fontFamily || st.fontFamily || L.fontFamily,
    fontSizePx: size,
    lineHeight,
    fontWeight: (st.bold ?? L.bold) ? 700 : 400,
    // Italics only in scripts that have them (the lettering of Arabic,
    // Hebrew and CJK is never slanted).
    ...((st.italic ?? L.italic) && !cjk && !rtl ? { italic: true } : {}),
    color: attrColor(item?.color, input.palette) ?? cast?.color?.hex ?? (st.color ?? L.color).hex,
    textTransform: st.textTransform ?? L.textTransform,
    ...(letterSpacing ? { letterSpacing } : {}),
    align: st.align,
    emphasis: 'bold-italic',
    writingMode: 'auto',
    maxColumnChars: L.maxColumnChars,
    ...(dropFinalStop !== undefined ? { dropFinalStop } : {}),
    ...(L.doubleDash ? { doubleDash: true } : {}),
    ...(st.halo ? { halo: dimensionToPx(st.halo, dpi, size), haloColor: st.haloColor?.hex ?? '#ffffff' } : {}),
    ...(st.rotate ? { rotate: st.rotate } : {}),
    ...(st.skew ? { skew: st.skew } : {}),
  };
  return out;
}

/** A sound effect set in columns breaks after five characters at most
 *  (its letters are big: a long column would run out of the panel). */
function sfxColumns(role: ComicScriptItem['role'], style: LetteringStyle): LetteringStyle {
  return role === 'sfx' ? { ...style, maxColumnChars: Math.min(5, style.maxColumnChars ?? 5) } : style;
}

/** A point given in fractions of a panel's picture (of its cell, for a
 *  panel without one) on the page. */
function panelPoint(panel: VDTComicPanel, at: { x: number; y: number }): VDTPoint {
  if (panel.art) return comicArtPointToPage(panel.art, at.x, at.y);
  return { x: panel.bbox.x + at.x * panel.bbox.width, y: panel.bbox.y + at.y * panel.bbox.height };
}

/** The anchors of a panel's picture on the page, each with whether its
 *  mouth is in view. */
function panelAnchors(panel: VDTComicPanel, resource: Resource | undefined): LetteringAnchor[] {
  const art = panel.art;
  if (!art || !resource?.anchors) return [];
  return resource.anchors.map((a) => {
    const mouth = comicArtPointToPage(art, a.x, a.y);
    return {
      id: a.id,
      mouth,
      ...(a.head ? { head: comicArtPointToPage(art, a.head.x, a.head.y) } : {}),
      ...(a.face ? { face: comicArtRectToPage(art, a.face) } : {}),
      visible: pointInPolygon(panel.polygon, mouth),
    };
  });
}

/** The faces a panel's picture marks for people who do not speak
 *  (`Resource.faces`, #726), on the page: through the crop and the mirror,
 *  as an anchor's face is. */
function bystanderFaces(panel: VDTComicPanel, resource: Resource | undefined): BoundingBox[] {
  const art = panel.art;
  if (!art || !resource?.faces) return [];
  return resource.faces.map((r) => comicArtRectToPage(art, r));
}

/** The guard over a marked face: the box grown upward by 0.4 of its
 *  height and outward by a fifth of its width (hair, a hat brim). */
function faceGuard(f: BoundingBox): BoundingBox {
  const up = 0.4 * f.height;
  const side = 0.2 * f.width;
  return { x: f.x - side, y: f.y - up, width: f.width + 2 * side, height: f.height + up };
}

function overlaps(a: BoundingBox, b: BoundingBox): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * Guards over the head of every speaker, so that balloons do not land on a
 * hat or a head of hair. Each is an avoid zone (a balloon may still cover
 * it as a last resort; tails run to the mouth as usual):
 * - a marked `face` (a speaker's, or a bystander's from `Resource.faces`,
 *   #726) grown upward by 0.4 of its height and outward by a fifth of its
 *   width (hair, a hat brim; the face itself stays a hard no-go);
 * - with no face, a box of a few ems about the mouth (and the head point),
 *   mostly above it, sized from the mouth-to-head distance when the head
 *   is marked.
 * {@link headZones} adds the larger head a close shot may have, as a
 * softer preference.
 */
function headGuards(panel: VDTComicPanel, resource: Resource | undefined, em: number): BoundingBox[] {
  const art = panel.art;
  if (!art || !resource) return [];
  const speakers = (resource.anchors ?? []).filter((a) => a.id !== 'sfx').map((a) => {
    if (a.face) return faceGuard(comicArtRectToPage(art, a.face));
    const mouth = comicArtPointToPage(art, a.x, a.y);
    const head = a.head ? comicArtPointToPage(art, a.head.x, a.head.y) : mouth;
    const d = Math.hypot(head.x - mouth.x, head.y - mouth.y);
    const size = d > 0.5 * em ? Math.max(2.4 * d, 3.3 * em) : 3.3 * em;
    const cx = (mouth.x + head.x) / 2;
    const half = Math.max(1.6 * em, 0.5 * size);
    const y0 = Math.min(mouth.y, head.y) - Math.max(2.9 * em, 0.95 * size);
    const y1 = Math.max(mouth.y, head.y) + 0.7 * em;
    return { x: cx - half, y: y0, width: 2 * half, height: y1 - y0 };
  });
  return [...speakers, ...bystanderFaces(panel, resource).map(faceGuard)];
}

/** The head a speaker with no marked face may have in a closer shot (a
 *  quarter of the shorter side of the cell, above the mouth), as a region
 *  better left uncovered: a cost per area, never a fault, so that in a
 *  long shot (small figures) a balloon still comes close. */
function headZones(panel: VDTComicPanel, resource: Resource | undefined): (BoundingBox & { weight: number })[] {
  const art = panel.art;
  if (!art || !resource?.anchors) return [];
  const size = 0.22 * Math.min(panel.bbox.width, panel.bbox.height);
  return resource.anchors.filter((a) => a.id !== 'sfx' && !a.face).map((a) => {
    const mouth = comicArtPointToPage(art, a.x, a.y);
    return { x: mouth.x - 0.45 * size, y: mouth.y - 1.05 * size, width: 0.9 * size, height: 1.25 * size, weight: 1.5 };
  });
}

/** The body under every marked face (a figure's chest and arms, two
 *  hugging characters), as a region better left uncovered: a balloon goes
 *  over the background before it goes over the action. A cost per area,
 *  never a fault; each zone names its figure (`owner`), so that a balloon
 *  costs more over another character than over its own speaker. The
 *  figure under a bystander's face (`Resource.faces`, #726) is nobody's
 *  own: its owner is a name no script key can be (a key holds no space),
 *  so every balloon pays for it as for another character's. */
function bodyZones(panel: VDTComicPanel, resource: Resource | undefined): (BoundingBox & { weight: number; owner: string })[] {
  const art = panel.art;
  if (!art || !resource) return [];
  const under = (f: BoundingBox, owner: string) => ({ x: f.x - 0.3 * f.width, y: f.y + f.height, width: 1.6 * f.width, height: 2 * f.height, weight: 1.5, owner });
  return [
    ...(resource.anchors ?? []).filter((a) => a.id !== 'sfx' && a.face).map((a) => under(comicArtRectToPage(art, a.face!), a.id)),
    ...bystanderFaces(panel, resource).map((f, i) => under(f, `bystander face ${i}`)),
  ];
}

/** The picture's safe area as a region better left uncovered, when the art
 *  marks no face (a speaker's or a bystander's) and no avoid zone (nothing
 *  else tells the lettering what matters in it). */
function softSafeArea(panel: VDTComicPanel, resource: Resource | undefined): BoundingBox[] {
  const art = panel.art;
  if (!art || !resource?.safeArea) return [];
  if ((resource.avoid?.length ?? 0) > 0 || (resource.faces?.length ?? 0) > 0 || (resource.anchors ?? []).some((a) => a.face)) return [];
  return [comicArtRectToPage(art, resource.safeArea)];
}

/** Text on the art with no balloon (a `none` shape) and no halo of its
 *  own gets one, light under dark letters and dark under light ones: the
 *  white outline letterers give lettering laid on a picture (#559). */
function withAutoHalo(style: LetteringStyle, st: ResolvedBalloonStyleConfig): LetteringStyle {
  if (st.shape !== 'none' || st.halo !== undefined || style.halo) return style;
  const hex = style.color.replace('#', '');
  const v = hex.length >= 6 ? hex.slice(0, 6) : hex.split('').map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return { ...style, halo: Math.max(0.12 * style.fontSizePx, 1), haloColor: lum < 0.5 ? '#ffffff' : '#000000' };
}

/** A box butted against the border of a framed panel (a caption at a
 *  corner) is outlined at the border's weight, so that its edges and the
 *  border read as one line. */
function buttedCaption(style: LetteringStyle, panel: VDTComicPanel, at: string | undefined): LetteringStyle {
  const butted = style.butt && style.shape !== 'none' && (at !== undefined || (style.position !== undefined && style.position !== 'auto'));
  if (!butted || panel.border.style === 'none' || !(panel.border.width > 0) || style.strokeWidth <= 0) return style;
  return { ...style, strokeWidth: panel.border.width };
}

/** Whether a balloon's outline is an oval or grows from one (a cloud, a
 *  burst): its box's corners are no part of it. */
function roundBalloon(comics: ResolvedComicsConfig, b: VDTComicBalloon): boolean {
  if (b.kind !== 'balloon' || !b.shape) return false;
  const shape = pickBalloonStyle(comics, b.style)?.shape;
  return shape !== 'rectangle' && shape !== 'rounded' && shape !== 'none';
}

/** A balloon's tail as drawn, from its body to its tip (the body taken as
 *  the oval its box holds); undefined for a balloon with none. */
function drawnTail(b: VDTComicBalloon): [VDTPoint, VDTPoint] | undefined {
  if (!b.tailTip) return undefined;
  const c = { x: b.bbox.x + b.bbox.width / 2, y: b.bbox.y + b.bbox.height / 2 };
  const dx = b.tailTip.x - c.x;
  const dy = b.tailTip.y - c.y;
  const k = Math.hypot(dx / (b.bbox.width / 2 || 1), dy / (b.bbox.height / 2 || 1));
  if (!(k > 1)) return undefined;
  return [{ x: c.x + dx / k, y: c.y + dy / k }, { x: b.tailTip.x, y: b.tailTip.y }];
}

/** A script's `tail=` as the lettering reads it. `left` and `right` name
 *  a side of the panel's picture as stored (#727), as `at=` and `to=`
 *  name points of it: on the page that is the same side of the panel, and
 *  the other one when the picture is mirrored. A panel with no picture
 *  reads them as the page's. The other values pass through. */
function tailSideOnPage(tail: ComicScriptItem['tail'], panel: VDTComicPanel): ComicScriptItem['tail'] {
  if ((tail === 'left' || tail === 'right') && panel.art?.mirrored) return tail === 'left' ? 'right' : 'left';
  return tail;
}

/** What {@link letterPanels} needs. */
export interface LetterPanelsInput {
  source: ComicPageSource;
  panels: readonly VDTComicPanel[];
  /** The script of each laid-out panel (undefined for an empty cell). */
  panelSources: readonly (ComicPanelSource | undefined)[];
  comics: ResolvedComicsConfig;
  resolved: ResolvedConfig;
  resources: ReadonlyMap<string, Resource>;
  direction: 'ltr' | 'rtl';
  sourceOffset: number;
  pageIndex?: number;
  /** Regions of the frame no lettering may cover (the spine of a spread):
   *  kept out at every fallback, pins included. */
  avoid?: readonly BoundingBox[];
  /** The comic's frame (the page's live area): lettering keeps inside it
   *  unless it breaks a border on purpose. */
  frame?: BoundingBox;
  /** The trim of the sheet (default: the frame) and the bleed box: no
   *  lettering runs off the trim; a sound effect breaking its border may
   *  run into the bleed beside a panel that bleeds. */
  trim?: BoundingBox;
  bleedBox?: BoundingBox;
}

/** A box grown (negative `d`) or shrunk by `d` on every side. */
function insetBox2(b: BoundingBox, d: number): BoundingBox {
  return { x: b.x + d, y: b.y + d, width: b.width - 2 * d, height: b.height - 2 * d };
}

/** The intersection of two boxes (empty boxes have no size). */
function intersect(a: BoundingBox, b: BoundingBox): BoundingBox {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return { x, y, width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x), height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y) };
}

/** The smallest box holding both. */
function union(a: BoundingBox, b: BoundingBox): BoundingBox {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
}

/**
 * The lettering of a page's panels (#559–#561): balloons, captions and
 * sound effects, in reading order (panel order, then script order), and the
 * `comicBalloonOverflow` warnings of the balloons that could not be placed
 * cleanly.
 */
export function letterPanels(input: LetterPanelsInput): { balloons: VDTComicBalloon[]; warnings: ContentWarning[] } {
  const { panels, panelSources, comics, resolved, resources, direction, sourceOffset: off } = input;
  const dpi = resolved.page.dpi;
  const locale = comicLetteringLocale(resolved);
  const vertical = comicLetteringVertical(comics, resolved, locale);
  const L = comics.lettering;
  const insetPx = dimensionToPx(L.inset, dpi);
  const trim = input.trim ?? input.frame;
  const castById = new Map(comics.cast.map((c) => [c.id, c] as const));
  const balloons: VDTComicBalloon[] = [];
  const warnings: ContentWarning[] = [];
  const em = dimensionToPx(L.fontSize, dpi);
  // What each panel's picture protects, on the page (#671): a balloon that
  // leaves its panel keeps off the faces and avoid zones of the others.
  const insets = panels.map((_, i) => panelSources[i]?.attrs.inset !== undefined);
  const protectedArt: LetteringForeignArt[][] = panels.map((panel, pi) => {
    const resource = panel.art ? resources.get(panel.art.resourceId) : undefined;
    if (!panel.art || !resource) return [];
    const under = panels.filter((q, qi) => qi > pi && insets[qi] && overlaps(q.bbox, panel.bbox)).map((q) => q.polygon);
    const shown = (rect: BoundingBox) => overlaps(rect, panel.bbox);
    const entry = (rect: BoundingBox, kind: 'face' | 'avoid', guard = false): LetteringForeignArt =>
      ({ rect, kind, ...(guard ? { guard } : {}), within: panel.polygon, ...(under.length > 0 ? { under } : {}) });
    return [
      ...(resource.anchors ?? []).filter((a) => a.id !== 'sfx' && a.face).map((a) => entry(comicArtRectToPage(panel.art!, a.face!), 'face')),
      ...bystanderFaces(panel, resource).map((f) => entry(f, 'face')),
      ...(resource.avoid ?? []).map((r) => entry(comicArtRectToPage(panel.art!, r), 'avoid')),
      ...headGuards(panel, resource, em).map((g) => entry(g, 'avoid', true)),
    ].filter((e) => shown(e.rect));
  });
  panels.forEach((panel, pi) => {
    const src = panelSources[pi];
    if (!src || src.items.length === 0) return;
    const resource = panel.art ? resources.get(panel.art.resourceId) : undefined;
    // A line that may leave the panel (`break`, a pin, drawn sound) can land
    // on anything about it: it is told what the panels before it lettered
    // and what the pictures around it protect, as far as it can reach (its
    // middle stays in its panel). A panel with no such line is lettered
    // from what pokes into it alone, whatever the rest of the page does.
    const laidOver = panels.filter((q, qi) => qi > pi && insets[qi] && overlaps(q.bbox, panel.bbox)).map((q) => q.polygon);
    const leaves = src.items.some((it) => it.break || it.at !== undefined || it.role === 'sfx');
    const reach = leaves ? insetBox2(panel.bbox, -Math.max(panel.bbox.width, panel.bbox.height)) : panel.bbox;
    const set = balloons.filter((b) => overlaps(b.bbox, reach));
    const tails = set.map(drawnTail).filter((t): t is [VDTPoint, VDTPoint] => t !== undefined);
    const around = leaves ? protectedArt.flatMap((list, qi) => (qi === pi ? [] : list.filter((e) => overlaps(e.rect, reach)))) : [];
    const lp: LetteringPanel = {
      index: panel.index,
      polygon: panel.polygon,
      bbox: panel.bbox,
      insetPx,
      direction,
      writingMode: vertical ? 'vertical' : 'horizontal',
      locale,
      anchors: panelAnchors(panel, resource),
      ...(resource?.faces?.length && panel.art ? { faces: bystanderFaces(panel, resource) } : {}),
      avoid: [
        ...(panel.art ? (resource?.avoid ?? []).map((r) => comicArtRectToPage(panel.art!, r)) : []),
        ...headGuards(panel, resource, em).map((g) => ({ ...g, guard: true })),
      ],
      keepOut: (input.avoid ?? []).filter((r) => overlaps(r, insetBox2(panel.bbox, -2 * insetPx))),
      softAvoid: [...softSafeArea(panel, resource), ...headZones(panel, resource), ...bodyZones(panel, resource)],
      ...(panel.border.style !== 'none' && panel.border.width > 0 ? { borderPx: panel.border.width } : {}),
      neighbours: panels.filter((q) => q !== panel).map((q) => q.bbox),
      ...(laidOver.length > 0 ? { over: laidOver } : {}),
      ...(input.frame ? { limit: input.frame } : {}),
      ...(trim ? { trim, sheet: input.bleedBox ? intersect(input.bleedBox, union(trim, panel.bbox)) : trim } : {}),
      // What the panels before this one lettered: a balloon breaking out
      // of either panel never covers the other's.
      foreign: set.map((b) => (roundBalloon(comics, b) ? { ...b.bbox, round: true } : b.bbox)),
      ...(tails.length > 0 ? { foreignTails: tails } : {}),
      ...(around.length > 0 ? { foreignArt: around } : {}),
      dpi,
    };
    const items: LetteringItem[] = src.items.map((it, k) => {
      const cast = it.speaker ? castById.get(it.speaker) : undefined;
      const own = pickBalloonStyle(comics, it.style?.trim());
      const st = own ?? pickBalloonStyle(comics, it.role === 'speech' ? cast?.balloonStyle : undefined)
        ?? pickBalloonStyle(comics, roleStyleId(it.role)) ?? pickBalloonStyle(comics, 'speech')!;
      const tail = tailSideOnPage(it.tail, panel);
      return {
        id: `${panel.index}:${k}`,
        order: k,
        kind: it.role === 'speech' ? 'balloon' : it.role,
        ...(it.speaker ? { speaker: it.speaker } : {}),
        text: it.spans.length > 0 ? it.spans : it.text,
        sourceMap: it.sourceMap.map((o) => o + off),
        sourceStart: it.sourceStart + off,
        sourceEnd: it.sourceEnd + off,
        style: buttedCaption(withAutoHalo(sfxColumns(it.role, comicLetteringStyle({ style: st, comics, ...(cast ? { cast } : {}), item: it, locale, vertical, dpi, ...(resolved.colorPalette ? { palette: resolved.colorPalette } : {}) })), st), panel, it.atKeyword),
        ...(it.at ? { pin: panelPoint(panel, it.at) } : {}),
        ...(it.atKeyword ? { position: it.atKeyword } : {}),
        ...(it.to ? { tailTarget: panelPoint(panel, it.to) } : tail && tail !== 'none' && tail !== 'auto' ? { tailTarget: tail } : {}),
        ...(tail === 'none' ? { tail: 'none' as const } : {}),
        ...(it.join !== undefined ? { join: it.join } : {}),
        ...(it.break ? { breakBorder: true } : {}),
        ...(it.rotate !== undefined ? { rotate: it.rotate } : {}),
        ...(it.skew !== undefined ? { skew: it.skew } : {}),
        ...(it.size !== undefined && it.size > 0 ? { sizeScale: it.size } : {}),
        ...(it.writingMode ? { writingMode: it.writingMode } : {}),
      };
    });
    const r = letterPanelDetailed(lp, items, { joinSameSpeaker: L.joinSameSpeaker, groupBase: pi * 1000, ...(L.strictPlacement ? { strictPlacement: true } : {}) });
    balloons.push(...r.balloons);
    for (const d of r.diagnostics) {
      warnings.push({
        kind: 'comicBalloonOverflow',
        panel: d.panelIndex,
        reasons: d.reasons,
        fallbacks: d.fallbacks,
        sourceStart: d.sourceStart,
        sourceEnd: d.sourceEnd,
        ...(input.pageIndex !== undefined ? { pageIndex: input.pageIndex } : {}),
      });
    }
  });
  return { balloons, warnings };
}

/** What {@link layoutComicFrame} needs: the box the panels are cut from
 *  and the box bleeding panels run out to, in the coordinates the comic is
 *  laid out in (a page's sheet, a strip's own box, a spread's two sheets
 *  side by side). */
export interface ComicFrameContext {
  resolved: ResolvedConfig;
  frame: BoundingBox;
  bleedBox: BoundingBox;
  resources: ReadonlyMap<string, Resource>;
  /** Added to every source offset of `source` (see
   *  {@link ComicPageContext.sourceOffset}). */
  sourceOffset?: number;
  /** See {@link ComicPageContext.fenceIndex}. */
  fenceIndex?: number;
  /** The page the warnings are reported on. */
  pageIndex: number;
  /** Regions no balloon should cover, besides those of the pictures (the
   *  spine of a spread), in the frame's coordinates. */
  avoid?: readonly BoundingBox[];
  /** The trim of the sheet(s), in the frame's coordinates: no lettering
   *  runs off it. Default: the frame. */
  trimBox?: BoundingBox;
}

/** Lay out a comic page. */
export function layoutComicPage(source: ComicPageSource, given: ComicPageContext): VDTComicPage {
  // A host's screen page: the comic is laid out on the print leaf, scaled
  // (its own trim, no bleed, its content area, its lengths at its scale).
  const leaf = comicViewerLeaf(resolvedComics(given.resolved), given.resolved, given.trimBox);
  const ctx: ComicPageContext = leaf
    ? {
        ...given,
        resolved: { ...given.resolved, page: { ...given.resolved.page, dpi: leaf.dpi } },
        trimBox: leaf.box,
        bleedBox: leaf.box,
        contentBox: leaf.content,
        mirrorMargins: false,
      }
    : given;
  const comic = layoutComicFrame(source, {
    resolved: ctx.resolved,
    frame: comicPageFrame(ctx),
    bleedBox: ctx.bleedBox,
    trimBox: ctx.trimBox,
    resources: ctx.resources,
    ...(ctx.sourceOffset !== undefined ? { sourceOffset: ctx.sourceOffset } : {}),
    ...(ctx.fenceIndex !== undefined ? { fenceIndex: ctx.fenceIndex } : {}),
    pageIndex: ctx.page.index,
  });
  if (leaf) comic.leaf = leaf.box;
  return comic;
}

/** Lay out a comic (a page, a strip, a spread) in a given frame: its
 *  cells, panels, split lines and lettering, in the frame's coordinates. */
export function layoutComicFrame(source: ComicPageSource, ctx: ComicFrameContext): VDTComicPage {
  const { resolved, resources, frame } = ctx;
  const comics = resolvedComics(resolved);
  const dpi = resolved.page.dpi;
  const off = ctx.sourceOffset ?? 0;
  const direction = comicPageDirection(source, comics, resolved);
  const pageStyle = pickPanelStyle(comics, source.attrs.style?.trim());
  const flowPanels = source.panels.filter((p) => !p.attrs.inset);
  const gutters = comicGutters(source, comics, dpi);
  const styleOf = (p: ComicPanelSource | undefined) => (p?.attrs.style ? pickPanelStyle(comics, p.attrs.style.trim()) : pageStyle);
  const geometry = comicGeometry({
    tree: source.splitParse.tree,
    frame,
    bleedBox: ctx.bleedBox,
    direction,
    gutter: gutters,
    bleed: (i) => bleedSides(source, flowPanels[i], styleOf(flowPanels[i]), direction),
  });
  const warnings: ContentWarning[] = [];
  const panels: VDTComicPanel[] = [];
  const panelSources: (ComicPanelSource | undefined)[] = [];
  const mirrorDefault = comics.mirrorArt && direction !== comics.artDirection;

  // The split generates the frames (#885): one per cell (its panel's
  // `pad` taken off), and one per inset panel over the frame before it.
  const specs = comicFrameSpecs(source.panels, geometry.cells, (p, box) => comicPanelPadding(p?.attrs.pad, box, direction, dpi));
  const fence = ctx.fenceIndex ?? source.fenceIndex;

  const buildPanel = (cell: ComicFrameSpec): VDTComicPanel => {
    const p = cell.panel;
    const style = styleOf(p);
    const attrs = p?.attrs ?? {};
    // A callout style named by `box` (#885) dresses the panel: its
    // background, border and corner radius over the panel style's (the
    // panel's own `border` and `bg` still win). A text panel's box is drawn
    // by its frame, round its text: the panel then draws none.
    const box = comicBoxStyle(resolved, attrs.box);
    const boxDraws = box !== undefined && isComicTextPanel(p);
    const border = attrs.border?.trim();
    const boxBorder = box ? (box.border.enabled ? dimensionToPx(box.border.width, dpi) : 0) : undefined;
    const borderWidth = boxDraws ? 0
      : border === 'none' ? 0 : border ? dimensionToPx(parseComicDimension(border) ?? style.borderWidth, dpi) : boxBorder ?? dimensionToPx(style.borderWidth, dpi);
    const bg = boxDraws ? undefined
      : attrColor(attrs.bg, resolved.colorPalette) ?? (box ? (box.backgroundEnabled ? box.background.hex : 'transparent') : style.background.hex);
    const borderColor = box && !border ? box.border.color.hex : style.borderColor.hex;
    // A box style's corners of their own (#1059): a panel has one radius,
    // the largest.
    const radiusPx = box && isCornerRadii(box.borderRadius)
      ? Math.max(...cornerRadiiPx(box.borderRadius, (d) => dimensionToPx(d, dpi)))
      : dimensionToPx(box ? uniformRadius(box.borderRadius)! : style.borderRadius, dpi);
    const index = panels.length;
    const panel: VDTComicPanel = {
      index,
      ...(attrs.id ? { id: attrs.id } : {}),
      ...(fence !== undefined ? { frameId: comicFrameElementId(fence, cell.name) } : {}),
      sourceStart: (p?.sourceStart ?? source.sourceStart) + off,
      sourceEnd: (p?.sourceEnd ?? source.sourceStart) + off,
      polygon: cell.polygon,
      bbox: cell.bbox,
      radius: cell.rect ? Math.min(radiusPx, cell.bbox.width / 2, cell.bbox.height / 2) : 0,
      border: { width: borderWidth, color: borderColor, style: borderWidth > 0 ? (box && !border ? 'solid' : style.borderStyle) : 'none' },
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
      if (crop.fallback) warnings.push({ kind: 'comicPanelLetterbox', resourceId: art.resource.id, panel: index, sourceStart: panel.sourceStart, sourceEnd: (p?.lineEnd ?? source.sourceStart) + off, pageIndex: ctx.pageIndex });
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

  // Each frame holds its panel: cells take the flow panels in reading
  // order, inset panels sit over the panel before them.
  for (const spec of specs) {
    panels.push(buildPanel(spec));
    panelSources.push(spec.panel);
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
  const lettered = letterPanels({ source, panels, panelSources, comics, resolved, resources, direction, sourceOffset: off, pageIndex: ctx.pageIndex, frame, bleedBox: ctx.bleedBox, ...(ctx.trimBox ? { trim: ctx.trimBox } : {}), ...(ctx.avoid ? { avoid: ctx.avoid } : {}) });
  comic.balloons = lettered.balloons;
  if (fence !== undefined) {
    comic.id = comicElementId(fence);
    comic.frames = panels.map((panel, i) => {
      const f = comicPanelFrame(panel, specs[i]!.name, specs[i]!.layer);
      const box = comicBoxStyle(resolved, specs[i]!.panel?.attrs.box);
      return box ? { ...f, styleId: box.id } : f;
    });
    for (const b of comic.balloons) {
      const owner = panels[b.panelIndex];
      if (owner?.frameId) b.elementId = comicBalloonElementId(owner.frameId, b.order);
    }
  }
  warnings.push(...lettered.warnings);
  if (warnings.length > 0) layoutWarnings.set(comic, warnings);
  panelSourcesOf.set(comic, panelSources);
  return comic;
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
    ...(art.resource.kind === 'svg' && art.resource.svg?.pdfFileId ? { pdfFileId: art.resource.svg.pdfFileId } : {}),
    box: crop.box,
    source: crop.source,
    mirrored,
    letterbox: crop.letterbox,
  };
}
