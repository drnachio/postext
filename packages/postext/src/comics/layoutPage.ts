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

import { isCornerRadii, cornerRadiiPx, uniformRadius } from '../design/boxShape.js';
import type { Resource } from '../types.js';
import type { ResolvedConfig, VDTPage, BoundingBox, VDTComicPage, ContentWarning, VDTComicPanel, VDTComicSplitter, VDTComicArt } from '../vdt.js';
import { dimensionToPx } from '../units.js';
import { resolvedComics, pickPanelStyle } from '../defaults/comics.js';
import { comicArtCrop } from './art.js';
import { comicGeometry } from './geometry.js';
import { comicFrameSpecs, type ComicFrameSpec, comicBoxStyle, isComicTextPanel, comicFrameElementId, comicElementId, comicPanelFrame, comicBalloonElementId } from './frames.js';
import { parseComicPoint } from './script.js';
import type { ComicPageSource, ComicPanelSource } from './types.js';
import { letterPanels } from './layoutPage/letterPanels.js';
import { layoutWarnings, panelSourcesOf } from './layoutPage/records.js';
import { comicViewerLeaf, comicPageFrame, comicPageDirection, comicGutters, bleedSides, comicPanelPadding, parseComicDimension, attrColor, flagOn, pictureOf } from './layoutPage/settings.js';

export { comicViewerLeaf, parseComicDimension, comicPageDirection, comicPanelPadding, comicPageFrame } from './layoutPage/settings.js';
export { comicPageLayoutWarnings, comicPanelSources, copyComicPanelSources, setComicLayoutWarnings } from './layoutPage/records.js';
export { comicLetteringLocale, comicLetteringVertical, comicLetteringStyle } from './layoutPage/letteringStyle.js';
export { letterPanels } from './layoutPage/letterPanels.js';
export type { LetterPanelsInput } from './layoutPage/letterPanels.js';

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
