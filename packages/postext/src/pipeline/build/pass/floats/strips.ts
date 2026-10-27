// Floats that are callout boxes or comic strips: their queue entries, strip
// geometry and the blocks a strip is set as.
// Part of the placement pass (pass.ts), split out of it in #1276.
import type { ComicPageSource } from '../../../../comics/types.js';
import { comicStripPlacement, comicStripWidth, comicStripOffset, comicStripExtent, layoutComicStrip } from '../../../../comics/strip.js';
import { layoutCaptionText } from '../../../resources/resourceLayout.js';
import { type VDTBlock, pageIsVertical, createVDTBlock, createBoundingBox, flowRectToPage, type VDTLine, type ResolvedConfig, type VDTDocument } from '../../../../vdt.js';
import { shiftLineX } from '../../../../measure/rtl/bidiLines.js';
import type { MeasurementCache } from '../../../../measure/index.js';
import type { ContentBlock } from '../../../../parse/index.js';
import type { Resource, ResourceType, ResolvedCalloutStyleConfig } from '../../../../types.js';
import type { ResourceNumberingMap } from '../../../resources/resourceNumbering.js';
import type { ResourceNumberEntry } from '../../../../types/content.js';
import type { BlockStyle } from '../../../styles.js';
import type { PlannedCallout } from '../../../callouts/calloutLayout.js';
import type { CalloutLayouter } from '../../../callouts/frameLayout.js';
import type { PlacementCursor } from '../../../blocks/placement.js';
import type { StripGeometry } from '../types.js';

/** What createStrips takes from the pass. */
export interface StripsDeps {
  cache: MeasurementCache | undefined;
  resolved: ResolvedConfig;
  doc: VDTDocument;
  bodyOffset: number;
  contentBlocks: ContentBlock[];
  resources: Resource[];
  resourceTypes: ResourceType[];
  resourceNumbering: ResourceNumberingMap;
  stripNumbers: Record<number, ResourceNumberEntry>;
  resourceById: Map<string, Resource>;
  resourceTypeById: Map<string, ResourceType>;
  bodyStyle: BlockStyle;
  calloutFloats: Map<number, { plan: PlannedCallout; style: ResolvedCalloutStyleConfig; L: CalloutLayouter; }>;
  cursor: PlacementCursor;
}

export function createStrips(deps: StripsDeps) {
  const {
    cache, resolved, doc, bodyOffset, contentBlocks, resources, resourceTypes, resourceNumbering,
    stripNumbers, resourceById, resourceTypeById, bodyStyle, calloutFloats, cursor
  } = deps;
  const CALLOUT_FLOAT_PREFIX = 'callout:';
  const calloutFloatOf = (resourceId: string) =>
    resourceId.startsWith(CALLOUT_FLOAT_PREFIX) ? calloutFloats.get(Number(resourceId.slice(CALLOUT_FLOAT_PREFIX.length))) : undefined;
  /** Floated comic strips (`:::strip{placement=top|bottom|auto}`, or a
   *  page-wide strip set `here` on a page of several columns, #566): the
   *  pending float carries the synthetic id `comic:<idx>`, the content
   *  index of the strip's block (see `comicStripOf`). */
  const COMIC_STRIP_PREFIX = 'comic:';
  const comicStripOf = (resourceId: string): { idx: number; source: ComicPageSource } | undefined => {
    if (!resourceId.startsWith(COMIC_STRIP_PREFIX)) return undefined;
    const idx = Number(resourceId.slice(COMIC_STRIP_PREFIX.length));
    const source = contentBlocks[idx]?.comic;
    return source ? { idx, source } : undefined;
  };
  const stripGeometryMemo = new Map<string, StripGeometry>();
  const stripGeometry = (blockIdx: number, source: ComicPageSource, measure: number, max: number, vertical: boolean): StripGeometry => {
    const key = `${blockIdx}:${measure.toFixed(2)}:${max.toFixed(2)}:${vertical ? 1 : 0}`;
    const memo = stripGeometryMemo.get(key);
    if (memo) return memo;
    const dpi = resolved.page.dpi;
    const place = comicStripPlacement(source.attrs);
    const stripWidth = comicStripWidth(place, measure, dpi);
    const dx = comicStripOffset(place.align, measure, stripWidth);
    const typeId = place.type !== undefined && resourceTypeById.has(place.type) ? place.type : undefined;
    const numbered = typeId !== undefined ? stripNumbers[blockIdx] : undefined;
    const caption = place.caption
      ? layoutCaptionText({
          ...(cache ? { cache } : {}),
          text: place.caption,
          // A type the strip is not counted in (no caption, an unknown id)
          // lends nothing: the caption is plain.
          resourceType: numbered ? resourceTypeById.get(typeId!) : undefined,
          number: numbered?.number ?? '',
          resolved,
          width: stripWidth,
          resourceNumbering,
          resourceTypes,
          resources,
        })
      : undefined;
    const captionRoom = caption && caption.bandHeight > 0 ? caption.bandHeight + caption.gapPx : 0;
    const extent = comicStripExtent(source, stripWidth, dpi, vertical, Math.max(1, max - captionRoom));
    const geometry: StripGeometry = {
      stripWidth,
      dx,
      extent,
      ...(caption && captionRoom > 0 ? { caption } : {}),
      captionAbove: captionRoom > 0 && caption!.style.position === 'above',
      captionRoom,
      height: extent + captionRoom,
    };
    stripGeometryMemo.set(key, geometry);
    return geometry;
  };
  /** Geometry `g` at another measure: the strip's width and offset
   *  follow it, its extent and caption stay. */
  const stripGeometryKept = (g: StripGeometry, source: ComicPageSource, measure: number): StripGeometry => {
    const place = comicStripPlacement(source.attrs);
    const stripWidth = comicStripWidth(place, measure, resolved.page.dpi);
    return { ...g, stripWidth, dx: comicStripOffset(place.align, measure, stripWidth) };
  };
  /**
   * The block of a strip a measure `width` px wide and at most `max` px
   * tall (flow): its comic laid out in the strip's box on the sheet (the
   * flow box turned on a vertical page, mirrored on a right-to-left one),
   * placed in the block's box; its caption as the block's lines, in the
   * caption style, block-relative (placing the block moves them). `x` is
   * where the block stands; `y` is 0 until it is placed.
   */
  const buildComicStripBlock = (
    blockIdx: number,
    source: ComicPageSource,
    x: number,
    width: number,
    max: number,
    pageIndex: number,
    /** The geometry the block was placed with, kept at another measure
     *  (its extent and caption; only its width and offset follow). */
    keep?: StripGeometry,
  ): VDTBlock => {
    const raw = contentBlocks[blockIdx]!;
    const page = doc.pages[pageIndex] ?? doc.pages[cursor.pageIndex]!;
    const vertical = pageIsVertical(page);
    const g: StripGeometry = keep ? stripGeometryKept(keep, source, width) : stripGeometry(blockIdx, source, width, max, vertical);
    const blk = createVDTBlock(`comic-strip-${blockIdx}`, 'resource', bodyStyle.fontString, bodyStyle.color, bodyStyle.textAlign);
    blk.contentIndex = blockIdx;
    blk.sourceStart = raw.sourceStart + bodyOffset;
    blk.sourceEnd = raw.sourceEnd + bodyOffset;
    blk.dirty = false;
    blk.snappedToGrid = false;
    blk.lines = [];
    blk.bbox = createBoundingBox(x, 0, width, g.height);
    // The strip's box inside the block's, then both on the sheet: the
    // offset between them is where the comic stands in the block's box
    // there (a mirrored or turned frame moves it, wherever the block is).
    const stripY = g.captionAbove ? g.captionRoom : 0;
    const blockOnSheet = flowRectToPage(page, createBoundingBox(0, 0, width, g.height));
    const stripOnSheet = flowRectToPage(page, createBoundingBox(g.dx, stripY, g.stripWidth, g.extent));
    blk.comic = layoutComicStrip(source, {
      resolved,
      width: vertical ? g.extent : g.stripWidth,
      height: vertical ? g.stripWidth : g.extent,
      x: stripOnSheet.x - blockOnSheet.x,
      y: stripOnSheet.y - blockOnSheet.y,
      resources: resourceById,
      sourceOffset: bodyOffset,
      pageIndex,
    });
    if (g.caption) {
      const c = g.caption;
      const fonts = c.fonts;
      const color = c.style.color.hex;
      const labelColor = c.style.labelColor.hex;
      // Under the strip after the gap, or over it with the gap below.
      const bandY = g.captionAbove ? 0 : g.extent + c.gapPx;
      blk.fontString = fonts.fontString;
      blk.boldFontString = fonts.boldFontString;
      blk.italicFontString = fonts.italicFontString;
      blk.boldItalicFontString = fonts.boldItalicFontString;
      blk.color = color;
      blk.refColor = c.linkColor;
      blk.textAlign = c.style.align;
      // Every segment carries its font and colour: a renderer paints them
      // as the lines of a paragraph, in the caption's face and colours.
      const fontOf = (bold: boolean | undefined, italic: boolean | undefined): string =>
        bold && italic ? fonts.boldItalicFontString : bold ? fonts.boldFontString : italic ? fonts.italicFontString : fonts.fontString;
      blk.lines = c.lines.map((line) => ({
        ...line,
        bbox: createBoundingBox(line.bbox.x + g.dx + c.paddingPx, line.bbox.y + bandY + c.paddingPx, line.bbox.width, line.bbox.height),
        baseline: line.baseline + bandY + c.paddingPx,
        ...(line.segments
          ? {
              segments: line.segments.map((seg) => ({
                ...seg,
                ...(seg.fontString === undefined && (seg.kind === 'text' || seg.kind === 'space') ? { fontString: fontOf(seg.bold, seg.italic) } : {}),
                ...(seg.color === undefined && seg.refResourceId === undefined ? { color: seg.captionLabel ? labelColor : color } : {}),
              })),
            }
          : {}),
      }));
      const place = comicStripPlacement(source.attrs);
      const numbered = place.type !== undefined ? stripNumbers[blockIdx] : undefined;
      blk.stripCaption = {
        firstLine: 0,
        lineCount: blk.lines.length,
        position: g.captionAbove ? 'above' : 'below',
        ...(numbered ? { typeId: numbered.typeId, number: numbered.number, ...(place.id ? { id: place.id } : {}) } : {}),
        ...(c.style.backgroundEnabled
          ? { bar: { rect: createBoundingBox(g.dx, bandY, g.stripWidth, c.bandHeight), background: c.style.background.hex } }
          : {}),
      };
    }
    return blk;
  };
  /** Give a strip set in the flow (`here`, or in a box) the placeholder
   *  line that carries its height, as an inline figure's does: before its
   *  caption, or after a caption set over it (block-relative). */
  const withStripPlaceholder = (blk: VDTBlock, g: StripGeometry): void => {
    const y = g.captionAbove ? g.captionRoom : 0;
    const placeholder: VDTLine = { text: '', bbox: { x: g.dx, y, width: g.stripWidth, height: g.extent }, baseline: y, hyphenated: false, segments: [], isLastLine: true };
    if (g.captionAbove) {
      blk.lines = [...blk.lines, placeholder];
    } else {
      blk.lines = [placeholder, ...blk.lines];
      if (blk.stripCaption) blk.stripCaption.firstLine = 1;
    }
  };
  /** Shift a strip block's lines (its caption, its placeholder) by
   *  `(dx, dy)`: a float set at its band. */
  const shiftStripLines = (blk: VDTBlock, dx: number, dy: number): void => {
    for (const line of blk.lines) {
      shiftLineX(line, dx);
      line.bbox.y += dy;
      line.baseline += dy;
    }
  };
  return {
    CALLOUT_FLOAT_PREFIX, calloutFloatOf, COMIC_STRIP_PREFIX, comicStripOf, stripGeometry,
    buildComicStripBlock, withStripPlaceholder, shiftStripLines
  };
}
