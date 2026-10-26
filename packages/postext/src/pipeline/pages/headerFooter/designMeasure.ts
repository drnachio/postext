// Heading and box designs measured and laid out against their band: the
// height a design reserves, the page boxes a heading design paints, and a
// box style's design (#1276: split out of headerFooter.ts).
import type { DocumentMetadata, ResolvedHeadingLevelConfig, Resource, ResolvedDesignSlot, Dimension, ResolvedCalloutDesignConfig } from '../../../types.js';
import type { VDTPage, VDTDesignBlock } from '../../../vdt.js';
import { dimensionToPx } from '../../../units.js';
import { type ResolvedPrimitive, type DesignFrames, layoutDesignSlot } from '../../../design/layout.js';
import type { HeadingPlaceholderInfo, DesignPlaceholderContext } from '../../../design/placeholders.js';
import { type SlotLayoutExtras, layoutSlotToVdt } from './slotLayout.js';

/** Where a primitive's reservation ends: its foot, except for a drop cap,
 *  whose line box runs a quarter of its size under its baseline. The letter
 *  sits inside its paragraph's lines, so it reserves nothing below the text
 *  (`text`, the primitive before it) — at most down to its own baseline,
 *  should the text end above it (EF-108). */
function reservedBottom(prim: ResolvedPrimitive, text: ResolvedPrimitive | undefined): number {
  const foot = prim.y + prim.height;
  if (prim.kind !== 'text' || !prim.dropCap || !text) return foot;
  const baseline = prim.y + (prim.lines[0]?.baselineY ?? prim.height);
  return Math.min(foot, Math.max(text.y + text.height, baseline));
}

/** Height of the container a design is measured against: large enough
 *  that nothing reaches its foot. */
export const MEASURE_CONTAINER_HEIGHT = 1e6;

/** The placeholder context a heading design is laid out with during body
 *  layout, before the pages exist (a one-page stub). */
export function headingPlaceholders(
  heading: HeadingPlaceholderInfo,
  metadata: DocumentMetadata,
  pageIndex: number,
): DesignPlaceholderContext {
  const stubPage = { index: pageIndex, pageLabel: '1' } as unknown as VDTPage;
  return {
    kind: 'heading',
    page: stubPage,
    allPages: [stubPage],
    metadata,
    chapterTitleByPageIndex: [],
    heading,
  };
}

/**
 * The page boxes a heading's design paints, laid out against `container`
 * — the band the placed heading takes, as `buildHeadersAndFooters` lays it
 * out — in absolute page px. Only the elements that reserve room: those
 * with `reserve: false` are decoration the text and the floats may cover.
 * The placement pass keeps the float-only side column clear of them
 * (EF-78): a chapter numeral set in the margin column is no room for a
 * marginal figure.
 */
export function headingDesignBoxes(
  level: ResolvedHeadingLevelConfig,
  heading: HeadingPlaceholderInfo,
  container: { x: number; y: number; width: number; height: number },
  dpi: number,
  metadata: DocumentMetadata,
  pageIndex: number,
  frames?: DesignFrames,
  resourceById?: ReadonlyMap<string, Resource>,
): Array<{ x: number; y: number; width: number; height: number }> {
  if (!level.advancedDesign.enabled || level.advancedDesign.slot.elements.length === 0) return [];
  const result = layoutDesignSlot(
    level.advancedDesign.slot,
    { container, dpi, placeholders: headingPlaceholders(heading, metadata, pageIndex), frames, resourceById },
    pageIndex,
  );
  const excluded = new Set(level.advancedDesign.slot.elements.filter((el) => el.kind !== 'connector' && el.reserve === false).map((el) => el.id));
  const out: Array<{ x: number; y: number; width: number; height: number }> = [];
  result.primitives.forEach((prim, i) => {
    if (excluded.has(result.elementIds[i]!)) return;
    if (![prim.x, prim.y, prim.width, prim.height].every(Number.isFinite)) return;
    const bottom = reservedBottom(prim, result.primitives[i - 1]);
    out.push({ x: prim.x, y: prim.y, width: prim.width, height: Math.max(0, bottom - prim.y) });
  });
  return out;
}

/** Measure the natural bottom of a heading's advanced-design slot when laid
 *  out against a container of the given `width` with unbounded height.
 *  Returns 0 if the level has no advanced design or the slot is empty. Used
 *  during body layout to enlarge a heading block's reserved height so
 *  subsequent blocks sit below the actual bottom of the design content
 *  rather than below the natural text bottom. Applies to both in-column
 *  headings (overlay in block bbox) and page-spanning openers (width is the
 *  full content area; passed in by the caller).
 *
 *  Two kinds of element never count: those flagged `reserve: false`
 *  (decoration that may overlap the text), and those whose position or
 *  height follows the container's height — anchored to its middle or its
 *  foot, `'fill'` tall, or chained to such an element. The container at
 *  paint time is the band this height reserves, so they are laid out
 *  against the result and cannot set it. They are found by laying the slot
 *  out against two container heights and keeping only the primitives that
 *  did not move. */
export function measureHeadingAdvancedDesignHeight(
  level: ResolvedHeadingLevelConfig,
  heading: HeadingPlaceholderInfo,
  width: number,
  dpi: number,
  metadata: DocumentMetadata,
  pageIndex: number,
  /** Page/bleed frames in absolute page px, for `anchor.to: 'page' |
   *  'bleed'` elements. Translated into the stub coordinate system (the
   *  heading container's top-left at `origin`) so a band anchored above the
   *  heading does not grow the reserved height, while anything extending
   *  below the heading's top does. */
  frames?: DesignFrames,
  /** Absolute page position of the heading container's top-left. Defaults
   *  to the frames' page origin when omitted. */
  origin?: { x: number; y: number },
  /** Resources by id, for `kind: 'image'` elements — the pictures painted
   *  with the design count like its other elements (EF-90). Without it an
   *  image element cannot be sized and counts nothing. */
  resourceById?: ReadonlyMap<string, Resource>,
): number {
  return measureHeadingDesign(level, heading, width, dpi, metadata, pageIndex, frames, origin, resourceById).height;
}

/** What a heading's advanced design needs of the band it is laid out in
 *  (see {@link measureHeadingDesign}). */
export interface HeadingDesignMeasure {
  /** The height the design reserves below the heading's top (see
   *  {@link measureHeadingAdvancedDesignHeight}), `minHeight` included. */
  height: number;
  /** The least height the band needs at paint time for every text that
   *  rides on it to start at or below the heading's top; 0 when none
   *  does. */
  textFloor: number;
  /** What sets `height`, for a host that explains a heading which claims
   *  its column (#997): the id of the element that reaches lowest, unless
   *  the design's own `minHeight` is taller than every element
   *  (`byMinHeight`). Both absent for a design that reserves nothing. */
  claimedBy?: string;
  byMinHeight?: true;
}

/** {@link measureHeadingAdvancedDesignHeight}, with the floor that texts
 *  riding on the band set (`textFloor`). A text anchored to the foot or
 *  the middle of the band (a title set on the last line of a tall opener)
 *  does not set the reserved height, but the band has to be tall enough to
 *  hold it: the caller keeps the band it paints at least `textFloor` tall,
 *  so such a title never rises above the heading's top into the text over
 *  it (EF-176; up to postext 1.4 it did when it was taller than the
 *  heading's own lines). Boxes, rules and pictures that ride on the band
 *  set no floor: a panel may reach above the heading on purpose. */
export function measureHeadingDesign(
  level: ResolvedHeadingLevelConfig,
  heading: HeadingPlaceholderInfo,
  width: number,
  dpi: number,
  metadata: DocumentMetadata,
  pageIndex: number,
  frames?: DesignFrames,
  origin?: { x: number; y: number },
  resourceById?: ReadonlyMap<string, Resource>,
): HeadingDesignMeasure {
  return measureDesignBand(level.advancedDesign, heading, width, dpi, metadata, pageIndex, frames, origin, resourceById);
}

/** {@link measureHeadingDesign} for any design laid out in a band: a
 *  heading's, or a box style's (#1014). */
function measureDesignBand(
  design: { enabled: boolean; slot: ResolvedDesignSlot; minHeight?: Dimension },
  heading: HeadingPlaceholderInfo,
  width: number,
  dpi: number,
  metadata: DocumentMetadata,
  pageIndex: number,
  frames?: DesignFrames,
  origin?: { x: number; y: number },
  resourceById?: ReadonlyMap<string, Resource>,
): HeadingDesignMeasure {
  if (!design.enabled) return { height: 0, textFloor: 0 };
  const minHeightPx = design.minHeight
    ? dimensionToPx(design.minHeight, dpi)
    : 0;
  if (design.slot.elements.length === 0) return { height: minHeightPx, textFloor: 0 };
  const placeholders = headingPlaceholders(heading, metadata, pageIndex);
  let stubFrames: DesignFrames | undefined;
  if (frames) {
    const ox = origin?.x ?? frames.page.x;
    const oy = origin?.y ?? frames.page.y;
    const shift = (f: DesignFrames['page']) => ({ x: f.x - ox, y: f.y - oy, width: f.width, height: f.height });
    stubFrames = { page: shift(frames.page), bleed: shift(frames.bleed), ...(frames.upright ? { upright: true } : {}) };
  }
  const layoutAt = (height: number) => layoutDesignSlot(
    design.slot,
    { container: { x: 0, y: 0, width, height }, dpi, placeholders, frames: stubFrames, resourceById },
    pageIndex,
  );
  const result = layoutAt(MEASURE_CONTAINER_HEIGHT);
  // Only an element reaching far down the container can follow its height
  // (its middle is half a million px down): the second layout is skipped
  // for every other design.
  const taller = result.primitives.some((p) => p.y + p.height > MEASURE_CONTAINER_HEIGHT / 4)
    ? layoutAt(2 * MEASURE_CONTAINER_HEIGHT)
    : result;
  const excluded = new Set(design.slot.elements.filter((el) => el.kind !== 'connector' && el.reserve === false).map((el) => el.id));
  let bottom = 0;
  let claimedBy: string | undefined;
  let textFloor = 0;
  result.primitives.forEach((prim, i) => {
    if (excluded.has(result.elementIds[i]!)) return;
    // A primitive a malformed value left without a finite box reserves
    // nothing: a NaN here would make the caller drop the whole reservation
    // (minHeight included).
    if (!Number.isFinite(prim.y + prim.height)) return;
    const moved = taller.primitives[i];
    if (!moved) return;
    const stretched = Math.abs(moved.height - prim.height) > 0.5;
    if (Math.abs(moved.y - prim.y) > 0.5 || stretched) {
      // A text riding on the band: its top moves `rate` px for each px of
      // band, so the band that brings it up to the heading's top (y = 0)
      // is the least it needs.
      if (prim.kind === 'text' && !stretched) {
        const rate = (moved.y - prim.y) / MEASURE_CONTAINER_HEIGHT;
        if (rate > 0) textFloor = Math.max(textFloor, MEASURE_CONTAINER_HEIGHT - prim.y / rate);
      }
      return;
    }
    const reaches = reservedBottom(prim, result.primitives[i - 1]);
    if (reaches > bottom) {
      bottom = reaches;
      claimedBy = result.elementIds[i];
    }
  });
  const byMinHeight = minHeightPx > bottom;
  return { height: Math.max(bottom, minHeightPx), textFloor, ...(byMinHeight ? { byMinHeight: true as const } : claimedBy !== undefined ? { claimedBy } : {}) };
}

/** The band a box style's design (#1014) takes `width` wide: as tall as
 *  its elements reach, or its `minHeight` (see {@link measureHeadingDesign};
 *  a text riding on the band's foot keeps it as tall as it needs). `info`
 *  is the box's title and the fence's attributes. */
export function measureBoxDesign(
  design: ResolvedCalloutDesignConfig,
  info: { titleText: string; attrs: Readonly<Record<string, string>>; boxText: readonly string[] },
  width: number,
  dpi: number,
  metadata: DocumentMetadata,
  resourceById?: ReadonlyMap<string, Resource>,
): number {
  const heading: HeadingPlaceholderInfo = { titleText: info.titleText, formattedNumber: '', attrs: { ...info.attrs }, boxText: info.boxText };
  const m = measureDesignBand(design, heading, width, dpi, metadata, 0, undefined, undefined, resourceById);
  return Math.max(m.height, m.textFloor);
}

/** A box style's design (#1014) laid out against its band, in the box's
 *  coordinates: `{titleText}` is the box title, `{attr.<key>}` the fence's
 *  attributes. Its texts are cut to fit as a heading design's are, flagged
 *  as a box's (`slot: 'box'`). */
export function layoutBoxDesign(
  design: ResolvedCalloutDesignConfig,
  info: { titleText: string; attrs: Readonly<Record<string, string>>; boxText: readonly string[] },
  band: { x: number; y: number; width: number; height: number },
  dpi: number,
  metadata: DocumentMetadata,
  extras: Pick<SlotLayoutExtras, 'resourceById' | 'direction' | 'mirrored' | 'arabicNumbers'>,
): VDTDesignBlock[] {
  const heading: HeadingPlaceholderInfo = { titleText: info.titleText, formattedNumber: '', attrs: { ...info.attrs }, boxText: info.boxText };
  const slot = layoutSlotToVdt(design.slot, band, 0, headingPlaceholders(heading, metadata, 0), dpi, {
    ...extras,
    attrs: { ...info.attrs },
    metadata: metadata as Record<string, unknown>,
    slot: 'box',
  });
  return slot?.blocks ?? [];
}
