import {
  buildFontString,
  dimensionToPx,
  measureGlyphWidth,
  parseMarkdown,
  resolveHeadingsConfig,
  resolveLayoutConfig,
  resolvePageConfig,
} from 'postext';
import type { Dimension, DesignSlot, LayoutType, PageMargins, PostextConfig, ResolvedHeadingsConfig } from 'postext';
import { htmlViewerDpi, LOCALE_TO_HYPHENATION, PADDING_PX, type ColumnMode } from './constants';

/** The leaf a heading design was drawn on: its size and the margins that
 *  place the design's container (the band under the text block's top-left
 *  corner) on it, in px at the viewer's DPI. */
interface LeafGeometry {
  width: number;
  height: number;
  margins: { top: number; right: number; bottom: number; left: number };
}

/** Whether any element of `value` anchors to the leaf itself. Such a slot
 *  is laid out against the page or bleed box on paper — a cover panel
 *  filling the trim, a band bleeding off the edge — so the viewer gives it
 *  the top of a leaf to live in (see {@link viewerHeadingDesign}). */
function anchorsToLeaf(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(anchorsToLeaf);
  if (value === null || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  if ((obj.to === 'page' || obj.to === 'bleed') && 'edge' in obj) return true;
  return Object.values(obj).some(anchorsToLeaf);
}

/** Whether the slot carries a plate: an image at least half the leaf wide
 *  (a photo opener, not a logo in a band). A box or a rule stretches with
 *  the frame it fills; a plate keeps its measure, so on a page wider than
 *  the leaf it stops short of the fills beside it. */
function hasPlate(slot: DesignSlot, leafWidth: number, dpi: number): boolean {
  return (slot.elements as unknown as Array<Record<string, any>>).some((el) => {
    if (el.kind !== 'image') return false;
    const w = el.placement?.size?.width;
    if (w === 'fill') return true;
    return Boolean(w) && typeof w === 'object' && dimensionToPx(w, dpi) >= leafWidth / 2;
  });
}

/** Multiply every dimension in `value` — offsets, sizes, type sizes, rule
 *  thicknesses — by `k`, units untouched. Plain numbers (a line height, a
 *  font weight) and everything else are left alone. */
function scaleDimensions(value: unknown, k: number): unknown {
  if (k === 1) return value;
  if (Array.isArray(value)) return value.map((v) => scaleDimensions(v, k));
  if (value === null || typeof value !== 'object') return value;
  const obj = value as Record<string, unknown>;
  if (typeof obj.value === 'number' && typeof obj.unit === 'string') {
    return { ...obj, value: obj.value * k };
  }
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(obj)) out[key] = scaleDimensions(v, k);
  return out;
}

const px = (value: number): Dimension => ({ value, unit: 'px' });

/** How far right of its container's left edge, at most, a slot draws:
 *  the widest `offset.x + width` among its sized elements. The slot's
 *  measure on paper, which the viewer's page may be narrower than. */
function slotExtentPx(slot: DesignSlot, dpi: number): number {
  let extent = 0;
  for (const el of slot.elements as unknown as Array<Record<string, any>>) {
    const size = el.placement?.size?.width;
    if (!size || typeof size !== 'object') continue;
    const x = el.placement?.offset?.x ? dimensionToPx(el.placement.offset.x, dpi) : 0;
    extent = Math.max(extent, x + dimensionToPx(size, dpi));
  }
  return extent;
}

/** Id of the invisible box {@link rebaseToBand} spans the band with. */
const BAND_ID = 'htmlViewerBand';

/** Re-anchor a leaf-drawn slot to the band that stands for the leaf's top
 *  on screen. The viewer's page is not a leaf — it is as wide as the
 *  measure asks and as tall as the screen or the text — so the `page` and
 *  `bleed` frames would put a cover plate or an opener panel far from the
 *  words it belongs to. The band is drawn as the top `band.height` px of
 *  the leaf: page and bleed anchors keep their offsets (a leaf's top-left
 *  is the band's), container anchors travel by the margins that placed the
 *  container on the leaf, and `fill` sizes take the frame they reached on
 *  paper. Offsets become px so the margins can be added to them.
 *
 *  Bottom anchors cannot use the container: a heading's container is its
 *  text block, measured with no floor at all, so a credit line pinned to
 *  the foot of a cover would sink the heading's reserved height past any
 *  page. They are aligned instead with the bottom of an invisible box as
 *  tall as the band. */
function rebaseToBand(
  slot: DesignSlot,
  leaf: LeafGeometry,
  band: { height: number; container: number; fillWidth: number },
  dpi: number,
): DesignSlot {
  const { margins: m } = leaf;
  const containerW = leaf.width - m.left - m.right;
  let usesBandBox = false;
  const elements = (slot.elements as unknown as Array<Record<string, any>>).map((el) => {
    const placement = el.placement;
    if (!placement?.anchor) return el;
    const to = placement.anchor.to;
    if (to !== 'page' && to !== 'bleed' && to !== 'container') return el;
    const onLeaf = to !== 'container';
    const edge: string = placement.anchor.edge ?? 'top-left';
    const offX = placement.offset?.x ? dimensionToPx(placement.offset.x, dpi) : 0;
    const offY = placement.offset?.y ? dimensionToPx(placement.offset.y, dpi) : 0;
    const size = { ...(placement.size ?? {}) };
    // What runs past the trim on paper (a plate sized for the bleed) is cut
    // there by the guillotine; on screen it would overhang the panel it
    // sits on, so it stops at the leaf's edge.
    if (onLeaf && size.width && typeof size.width === 'object' && offX >= 0) {
      const w = dimensionToPx(size.width, dpi);
      if (offX + w > leaf.width) size.width = px(Math.max(0, leaf.width - offX));
    }
    if (size.width === 'fill') size.width = px(onLeaf ? band.fillWidth : containerW);
    if (size.height === 'fill') size.height = px(onLeaf ? band.height : band.container);
    // Where the frame's anchor point sits in the band: the leaf's is the
    // band's own; the container's lies in by the margins.
    const dx = onLeaf ? 0
      : edge.includes('left') ? m.left : edge.includes('right') ? -m.right : (m.left - m.right) / 2;
    const dy = onLeaf ? 0
      : edge.startsWith('top') ? m.top
      : edge.startsWith('bottom') ? m.top + band.container - band.height
      : m.top + band.container / 2 - band.height / 2;
    if (edge.startsWith('bottom')) {
      usesBandBox = true;
      const frameW = onLeaf ? leaf.width : containerW;
      const w = size.width && typeof size.width === 'object' ? dimensionToPx(size.width, dpi) : 0;
      // `align-bottom` pins the element's left edge to the band's; the
      // horizontal part of the edge is folded into the offset.
      const x0 = onLeaf ? 0 : m.left;
      const x = edge.includes('right') ? x0 + frameW - w : edge === 'bottom' ? x0 + (frameW - w) / 2 : x0;
      return {
        ...el,
        placement: {
          ...placement,
          anchor: { to: `#${BAND_ID}`, edge: 'align-bottom' },
          offset: { x: px(x + offX), y: px(offY + (onLeaf ? 0 : m.top + band.container - band.height)) },
          size,
        },
      };
    }
    return {
      ...el,
      placement: { ...placement, anchor: { to: 'container', edge }, offset: { x: px(offX + dx), y: px(offY + dy) }, size },
    };
  });
  if (usesBandBox) {
    elements.unshift({
      kind: 'box',
      id: BAND_ID,
      placement: {
        anchor: { to: 'container', edge: 'top-left' },
        offset: { x: px(0), y: px(0) },
        size: { width: px(leaf.width), height: px(band.height) },
      },
    });
  }
  return { ...slot, elements } as unknown as DesignSlot;
}

/** A heading's design slot as the viewer draws it: a cover plate, an opener
 *  band, the type set over them — kept, not dropped, so the book opens on
 *  screen the way it opens on paper.
 *
 *  A slot drawn against the leaf (page or bleed anchors) gets a band that
 *  stands for the leaf's top, down to the bottom of the band the design
 *  reserves under the top margin — the whole leaf for a cover, the opener
 *  panel for an article — and keeps the leaf's proportions in it (see
 *  {@link rebaseToBand}). Every slot is then scaled down, type and all,
 *  when it is wider than the viewer's page or, in the paged view, taller
 *  than a page, rather than spilling past its edge. */
function viewerHeadingDesign<T extends { enabled?: boolean; minHeight?: Dimension; slot?: DesignSlot }>(
  advancedDesign: T | undefined,
  opts: { maxBandPx: number | null; pageWidthPx: number; columnWidthPx: number; dpi: number; leaf: LeafGeometry },
): { advancedDesign?: T; span?: 'column' } {
  if (!advancedDesign) return {};
  if (!advancedDesign.enabled || !advancedDesign.slot || advancedDesign.slot.elements.length === 0) {
    return { advancedDesign };
  }
  const { maxBandPx, pageWidthPx, columnWidthPx, dpi, leaf } = opts;
  const askedPx = advancedDesign.minHeight ? dimensionToPx(advancedDesign.minHeight, dpi) : 0;
  let slot = advancedDesign.slot;
  let bandPx = askedPx;
  let widthPx = slotExtentPx(slot, dpi);
  // The height the band is measured against: its own, or for a leaf-drawn
  // slot the leaf's — the paged view's page then reads as the leaf scaled
  // to the screen, and an opener panel takes the share of it it takes of
  // the leaf instead of the whole screen.
  let tallPx = askedPx;
  const onLeaf = anchorsToLeaf(slot);
  if (onLeaf) {
    bandPx = Math.min(leaf.height, leaf.margins.top + askedPx);
    widthPx = leaf.width;
    tallPx = leaf.height;
  }
  // A photo opener on a page wider than its leaf — a viewer page hosting
  // two text columns — cannot stretch its plate the way a band of boxes
  // and type stretches, and a plate two thirds of the page wide under a
  // bar the whole page wide reads as a mistake. It is set in one text
  // column instead, the leaf's top scaled to the column's width, and the
  // body flows on beside it as it flows on under any column heading. A
  // cover keeps the page: it is the whole leaf, and nothing follows it.
  const inColumn = onLeaf && bandPx < leaf.height && columnWidthPx < pageWidthPx && hasPlate(slot, leaf.width, dpi);
  const kW = inColumn
    ? columnWidthPx / widthPx
    : widthPx > pageWidthPx && widthPx > 0 ? pageWidthPx / widthPx : 1;
  // A band as tall as the page itself is more than a column can reserve
  // under the heading's own spacing: keep a line's worth short of it.
  const roomPx = maxBandPx !== null ? maxBandPx * 0.95 : null;
  const kH = roomPx !== null && tallPx > roomPx && tallPx > 0 ? roomPx / tallPx : 1;
  const k = Math.min(kW, kH);
  if (onLeaf) {
    // A panel filling the leaf's width runs across the viewer's page, as
    // it runs across the leaf; a cover (a band the whole leaf tall) keeps
    // the leaf's shape instead, a page standing on the screen, and so does
    // an opener set in a column, whose column is the leaf's width scaled.
    const fillWidth = bandPx >= leaf.height || inColumn ? leaf.width : Math.max(leaf.width, pageWidthPx / k);
    slot = rebaseToBand(slot, leaf, { height: bandPx, container: askedPx, fillWidth }, dpi);
  }
  return {
    advancedDesign: {
      ...advancedDesign,
      ...(bandPx > 0 ? { minHeight: px(bandPx * k) } : {}),
      slot: scaleDimensions(slot, k) as DesignSlot,
    },
    ...(inColumn ? { span: 'column' as const } : {}),
  };
}

/** The face the viewer sets a part title in: the H1's, with its leading as
 *  a multiple of the type size. An absolute H1 line height below the type
 *  size is a grid step the heading snaps across, not a leading a free-set
 *  title can use — lines that tight would overprint — so it falls back to
 *  1.2 like any unitless text. */
function partTitleFace(headings: ResolvedHeadingsConfig, dpi: number) {
  const h1 = headings.levels.find((l) => l.level === 1) ?? headings.levels[0]!;
  const fontSizePx = dimensionToPx(h1.fontSize, dpi);
  const absLinePx = h1.lineHeight.unit === 'em' ? 0 : dimensionToPx(h1.lineHeight, dpi);
  const lineHeight = h1.lineHeight.unit === 'em'
    ? h1.lineHeight.value
    : absLinePx >= fontSizePx && fontSizePx > 0 ? absLinePx / fontSizePx : 1.2;
  return { h1, fontSizePx, lineHeight, linePx: fontSizePx * lineHeight };
}

/** Lines a part title takes at `widthPx` in the given font, word-wrapped
 *  the way the design text element wraps it; forced breaks (`\\` in the
 *  title, `\n` here) start a new line. */
function countTitleLines(text: string, font: string, widthPx: number): number {
  const space = measureGlyphWidth(' ', font);
  let lines = 0;
  for (const segment of text.split('\n')) {
    const words = segment.split(/\s+/).filter(Boolean);
    lines++;
    let x = 0;
    for (const word of words) {
      const w = measureGlyphWidth(word, font);
      if (x > 0 && x + space + w > widthPx) {
        lines++;
        x = w;
      } else {
        x += (x > 0 ? space : 0) + w;
      }
    }
  }
  return Math.max(lines, 1);
}

/** A part divider on the viewer's surface: its title set as type at the top
 *  of the scroll unit, the part's own content (the chapters it lists) below
 *  it. In print the title band is purely decorative and `parts.margins`
 *  keeps the body clear of it — geometry measured for a leaf the viewer
 *  does not have, so it supplies both here: a band anchored to the top of
 *  the page and a matching top margin. */
function viewerPartDesign(face: ReturnType<typeof partTitleFace>, bandPx: number): DesignSlot {
  const { h1, lineHeight } = face;
  return {
    elements: [
      {
        kind: 'text',
        id: 'htmlViewerPartTitle',
        placement: {
          anchor: { to: 'container', edge: 'top-left' },
          offset: { x: { value: 0, unit: 'px' }, y: { value: 0, unit: 'px' } },
          size: { width: 'fill', height: { value: bandPx, unit: 'px' } },
        },
        content: '{number} {titleText}',
        fontFamily: h1.fontFamily,
        fontSize: h1.fontSize,
        fontWeight: h1.fontWeight,
        italic: h1.italic,
        color: h1.color,
        align: 'left',
        verticalAlign: 'top',
        lineHeight,
        overflow: 'wrap',
        hyphenate: true,
      },
    ],
  };
}

/** Whether a part design paints its page: a box with a fill, the panel
 *  the divider's type is set on in print. */
function paintsPage(design: DesignSlot | undefined): boolean {
  return (design?.elements ?? []).some((el) => el.kind === 'box' && Boolean(el.style?.backgroundColor));
}

/** `value` without its colour fields, at any depth — a part's body style as
 *  it reads off the viewer's plain divider. */
function withoutColors(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutColors);
  if (value === null || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (/colou?r$/i.test(k)) continue;
    out[k] = withoutColors(v);
  }
  return out;
}

/** Layout config for one HTML viewer pass. `base` is the document config as
 *  the viewer sees it — pass it through `applyHtmlViewerOverrides` first so
 *  the screen-only `htmlViewer.overrides` take part in the heading scaling
 *  and parity handling below. */
export function buildHtmlConfigOverride(
  base: PostextConfig,
  opts: {
    fontScale: number;
    columnMode: ColumnMode;
    /** Width of one viewer page. In multi mode this hosts the document's
     *  real column structure (`layoutType`), so it may span several text
     *  columns plus gutters. */
    pageWidthPx: number;
    /** Column structure each viewer page lays out with. Single-scroll mode
     *  passes 'single'; multi mode passes the document's own layout type. */
    layoutType: LayoutType;
    viewportHeightPx: number;
    locale: string;
    optimalLineBreaking: boolean;
    /** The document's part titles as the divider sets them (`number` and
     *  title, `\n` for a forced break). The band is as tall as the longest
     *  wraps to at `pageWidthPx`; without them it reserves two lines. */
    partTitles?: readonly string[];
  },
): PostextConfig {
  const {
    fontScale,
    columnMode,
    pageWidthPx,
    layoutType,
    viewportHeightPx,
    locale,
    optimalLineBreaking,
    partTitles,
  } = opts;

  // Font scale: the viewer renders at HTML_DPI (8pt ≈ 16px at fontScale=1)
  // and scales by changing the DPI itself, so every absolute size in the
  // design — body, headings, callouts, tables, captions, list markers,
  // paddings, rules, figure widths — grows by the same factor and the
  // layout keeps its proportions. Page geometry is in px and stays put.
  const dpi = htmlViewerDpi(fontScale);

  const hypLocale =
    base.bodyText?.hyphenation?.locale ?? LOCALE_TO_HYPHENATION[locale] ?? 'en-us';

  // Single-column mode: disable widow/orphan/runt avoidance (no column breaks
  // to protect — the whole document lives on one tall, scrollable page).
  const disableParagraphRules = columnMode === 'single';

  // Page height: single-column mode needs one very tall page so content never
  // flows to a second. Multi-column mode uses the viewport inner height, so
  // each VDT "page" = one column and horizontal stacking produces the scroll.
  const pageHeightPx =
    columnMode === 'single'
      ? Math.max(viewportHeightPx * 20, 200_000)
      : Math.max(viewportHeightPx - PADDING_PX * 2, 400);

  // The viewer has no leaves — a "page" is a scroll unit, never a recto or a
  // verso — so odd/even break parity (and the blank pages it pads with) is
  // meaningless here. Chapter and part breaks keep their page break but drop
  // the parity.
  const resolvedHeadings = resolveHeadingsConfig(base.headings);
  // A design band may be as tall as a leaf. The scroll has room for it; the
  // paged view has only its page, so a band taller than that is scaled to
  // fit (see viewerHeadingDesign).
  // The leaf the designs were drawn on, defaults filled in.
  const leafPage = resolvePageConfig(base.page);
  const leafOf = (margins: PageMargins | undefined): LeafGeometry => {
    const m = { ...leafPage.margins, ...margins };
    const at = (d: Dimension | undefined): number => (d ? dimensionToPx(d, dpi) : 0);
    return {
      width: at(leafPage.width),
      height: at(leafPage.height),
      margins: { top: at(m.top), right: at(m.right), bottom: at(m.bottom), left: at(m.left) },
    };
  };
  // The main text column of a viewer page, as the engine will cut it
  // (`computeColumnBboxes` on a page with no margins): the page itself,
  // half of it less the gutter, or what the side column leaves.
  const layoutResolved = resolveLayoutConfig(base.layout);
  const gutterPx = dimensionToPx(layoutResolved.gutterWidth, dpi);
  const columnWidthPx = layoutType === 'double'
    ? (pageWidthPx - gutterPx) / 2
    : layoutType === 'oneAndHalf'
      ? pageWidthPx * (1 - layoutResolved.sideColumnPercent / 100) - gutterPx
      : pageWidthPx;
  const designOpts = {
    maxBandPx: columnMode === 'single' ? null : pageHeightPx,
    pageWidthPx,
    columnWidthPx: Math.max(Math.min(columnWidthPx, pageWidthPx), 1),
    dpi,
    leaf: leafOf(undefined),
  };
  const headingLevels = resolvedHeadings.levels.map((lvl) => ({
    ...lvl,
    breakBefore: { ...lvl.breakBefore, parity: 'any' as const },
    ...viewerHeadingDesign(lvl.advancedDesign, designOpts),
  }));
  // Room for the part title on the viewer's own divider: as many lines of
  // the H1 face as the longest title wraps to (two when the titles are not
  // known) plus half a line of air before the part's content.
  const partFace = partTitleFace(resolvedHeadings, dpi);
  const partFont = buildFontString(
    partFace.h1.fontFamily,
    partFace.fontSizePx,
    String(partFace.h1.fontWeight),
    partFace.h1.italic ? 'italic' : 'normal',
  );
  const partLines = partTitles && partTitles.length > 0
    ? Math.max(...partTitles.map((t) => countTitleLines(t, partFont, pageWidthPx)))
    : 2;
  const partBandPx = partFace.linePx * partLines;
  const parts: PostextConfig['parts'] = {
    ...base.parts,
    breakBefore: { ...base.parts?.breakBefore, parity: 'any' },
    // A part opens a scroll unit of its own; the blank verso that follows
    // its leaf in print would only be an empty screen here.
    breakAfter: { enabled: false, parity: 'any' },
    // The divider's page design and the margins that leave room for it are
    // built for the leaf, not for this surface: the viewer sets the title
    // as type at the top of the unit and starts the body under it.
    design: viewerPartDesign(partFace, partBandPx),
    versoDesign: { elements: [] },
    // Type coloured for the panel the print divider paints (white on the
    // part's colour) would vanish on the viewer's plain one: it takes the
    // text colours instead.
    ...(base.parts?.bodyStyle && paintsPage(base.parts.design)
      ? { bodyStyle: withoutColors(base.parts.bodyStyle) as NonNullable<PostextConfig['parts']>['bodyStyle'] }
      : {}),
    margins: {
      top: { value: partBandPx + partFace.linePx * 0.5, unit: 'px' },
      bottom: { value: 0, unit: 'px' },
      left: { value: 0, unit: 'px' },
      right: { value: 0, unit: 'px' },
    },
  };

  return {
    ...base,
    page: {
      ...base.page,
      dpi,
      width: { value: pageWidthPx, unit: 'px' },
      height: { value: pageHeightPx, unit: 'px' },
      margins: {
        top: { value: 0, unit: 'px' },
        bottom: { value: 0, unit: 'px' },
        left: { value: 0, unit: 'px' },
        right: { value: 0, unit: 'px' },
      },
      cutLines: { ...(base.page?.cutLines ?? {}), enabled: false },
      // baselineGrid.enabled is a pure display flag (layout uses the grid
      // value regardless of enabled), so let the user's setting flow through
      // to drive the SVG overlay in HtmlPreview.
      backgroundColor: { hex: 'transparent', model: 'hex' },
    },
    layout: {
      ...base.layout,
      layoutType,
      // A page here is a screen tall: a figure sized for the leaf may not
      // fit it, and one taller than the page would run off its foot.
      fitFiguresToPage: true,
      // No rectos or versos on screen: a side column at the outer edge
      // takes the right, one at the inner edge the left — except in the
      // vertical scroll, which has no spine to sit against, so a
      // leaf-relative side reads in the right margin either way. A side
      // set explicitly to left or right is kept as asked.
      ...(base.layout?.sideColumnSide === 'outer' ? { sideColumnSide: 'right' as const } : {}),
      ...(base.layout?.sideColumnSide === 'inner'
        ? { sideColumnSide: columnMode === 'single' ? ('right' as const) : ('left' as const) }
        : {}),
    },
    bodyText: {
      ...base.bodyText,
      optimalLineBreaking,
      hyphenation: {
        ...(base.bodyText?.hyphenation ?? {}),
        locale: hypLocale,
      },
      ...(disableParagraphRules
        ? {
            avoidOrphans: false,
            avoidWidows: false,
            avoidRunts: false,
            avoidOrphansInLists: false,
            avoidWidowsInLists: false,
            avoidRuntsInLists: false,
          }
        : {}),
    },
    headings: {
      ...base.headings,
      levels: headingLevels,
    },
    parts,
    // The HTML viewer is a continuous reading surface, not a page: running
    // headers and footers (folios, running titles, page-edge tabs anchored
    // to the bleed) have no place on it — neither the document's nor the
    // ones a heading style sets for its section's pages.
    header: { elements: [] },
    footer: { elements: [] },
    ...(base.headingStyles
      ? {
          headingStyles: base.headingStyles.map((style) => ({
            ...style,
            // No rectos here: a style's odd/even break keeps the break, not
            // the blank screen before it (see the levels above).
            ...(style.breakBefore ? { breakBefore: { ...style.breakBefore, parity: 'any' as const } } : {}),
            header: { elements: [] },
            footer: { elements: [] },
            // A style's page geometry belongs to the leaf it was measured
            // for — a cover's text box in the lower corner of a 225 mm page
            // leaves no content area at all on a viewer page.
            margins: undefined,
            ...viewerHeadingDesign(style.advancedDesign, { ...designOpts, leaf: leafOf(style.margins) }),
          })),
        }
      : {}),
  };
}

export function measureColumnWidthPx(
  sample: string,
  fontFamily: string,
  fontSizePx: number,
  fontWeight: number,
): number {
  const font = buildFontString(fontFamily, fontSizePx, String(fontWeight), 'normal');
  return measureGlyphWidth(sample, font);
}

/** A title's `\\` forced break, as the engine reads it (`TITLE_BREAK_RE`). */
const TITLE_BREAK_RE = /[ \t]*\\\\[ \t]*/g;

let partTitlesMemo: { markdown: string; titles: string[] } | null = null;

/** The part titles of `markdown` as a divider sets them — `{number}
 *  {titleText}`, forced breaks as `\n` — for `buildHtmlConfigOverride`'s
 *  `partTitles`. Memoised on the source: relayouts at a new width or font
 *  scale reuse the last parse. */
export function partTitlesOf(markdown: string): string[] {
  if (!markdown.includes(':::part')) return [];
  if (partTitlesMemo?.markdown === markdown) return partTitlesMemo.titles;
  const titles: string[] = [];
  for (const b of parseMarkdown(markdown)) {
    if (b.type !== 'containerStart' || b.containerName !== 'part') continue;
    const number = (b.containerAttrs?.number ?? '').trim();
    const title = (b.containerAttrs?.title ?? '').trim().replace(TITLE_BREAK_RE, '\n');
    titles.push(`${number} ${title}`.trim());
  }
  partTitlesMemo = { markdown, titles };
  return titles;
}
