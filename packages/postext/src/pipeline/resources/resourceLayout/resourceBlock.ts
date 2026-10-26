// layoutResourceBlock: a figure or table with its caption and notes as one
// block, the upright layout of a rotated one, and moving it sideways
// (#1276: split out of resourceLayout.ts).
import { layoutScoreResource } from '../scoreBlocks.js';
import { bitmapLayoutSize } from '../../../bitmapResolution.js';
import { measuringVertically, withMeasureWritingMode } from '../../../measure/vertical.js';
import type { InlineSpan } from '../../../parse/index.js';
import { resourceSafeArea, safeAreaHeightRange, safeAreaSource } from '../safeArea.js';
import { layoutVideo } from '../videoOverlay.js';
import type { ResourceSafeArea } from '../../../types.js';
import { type ResolvedResourceBlock, type VDTTableSlice, type VDTResourceTableLayout, type VDTLine, createBoundingBox } from '../../../vdt.js';
import { buildFontString, measureRichBlock } from '../../../measure/index.js';
import { dimensionToPx } from '../../../units.js';
import { type BooktabsRuleSpec, booktabsStrokes } from '../../../table/booktabs.js';
import { parseInlineSnippetSpans } from '../../../parse/inlineSnippet.js';
import { chipContextOf, resolveChipSpans } from '../../text/chips.js';
import { withSnippetInlineCode } from '../../code/codeInline.js';
import { pickTableStyle } from '../../../defaults/resources/tableStyle.js';
import { startEndAsLeftRight } from '../../../defaults/shared.js';
import { resolveBodyStyle } from '../../styles.js';
import { FIT_EPS } from '../../blocks/placement.js';
import { captionInsideShare } from '../captionInside.js';
import { resolveCitationSpans } from '../../references/citations.js';
import { layoutCaptionText } from './captions.js';
import type { ResourceLayoutInput, TableRowMetrics } from './input.js';
import { annotatedSpans, resolveSwatchSpans, resolveRefSpans } from './refSpans.js';
import { withSnippetCache, fitWidth, snippetMathSpans, measureSnippetLines, alignFactor, shiftLines } from './snippets.js';
import { type TableLayoutStyle, layoutTable } from './tableLayout.js';
import { rulePx, MIN_BORDER_PX, tableSliceRows, tableHeaderRowCount } from './tableSlices.js';

export function layoutResourceBlock(input: ResourceLayoutInput): ResourceBlockLayout {
  return withSnippetCache(input.cache, () => layoutResourceBlockIn(input));
}

/** A resource block laid out (see {@link layoutResourceBlock}). */
export interface ResourceBlockLayout {
  block: ResolvedResourceBlock;
  totalHeight: number;
  /** Height of the caption + note band set beside the body
   *  (`captionAside`); absent otherwise. */
  asideHeight?: number;
  /** Row metrics of a table laid out in full (no `slice`), for
   *  {@link planTableSlice}. */
  tableRows?: TableRowMetrics;
}

function layoutResourceBlockIn(input: ResourceLayoutInput): ResourceBlockLayout {
  // Captions, notes and table cells are set horizontally on every page: a
  // resource of a vertical flow stands upright, its text read as on a
  // horizontal page.
  if (measuringVertically()) return withMeasureWritingMode('horizontal-tb', () => layoutResourceBlock(input));
  if (input.upright) return layoutUprightResourceBlock(input, input.upright.maxLength);
  const {
    resource,
    resourceType,
    number,
    resolved,
    columnWidth: footprintWidth,
    resourceNumbering,
    resourceTypes,
    resources,
    rotate,
  } = input;
  // A rotated block is laid out upright, `rotatedLength` wide; its upright
  // height must then fit the band's width on the page (`footprintWidth`).
  const columnWidth = rotate ? Math.max(1, input.rotatedLength ?? footprintWidth) : footprintWidth;
  const palette = resolved.colorPalette;
  // A slice only applies to tables; a slice covering the whole table from
  // row 0 is the full table (no continuation marks).
  const model = resource.kind === 'table' ? resource.table?.model : undefined;
  const slice: VDTTableSlice | undefined = model && input.slice
    && (input.slice.startRow > 0 || input.slice.endRow < model.rows.length || input.slice.continues)
    ? {
        startRow: Math.max(0, Math.min(input.slice.startRow, model.rows.length)),
        endRow: Math.max(0, Math.min(input.slice.endRow, model.rows.length)),
        continued: input.slice.startRow > 0,
        continues: input.slice.continues,
      }
    : undefined;

  // The style a table is set in: its named style, else the document's.
  const tableStyle = pickTableStyle(resolved, resource.table?.styleId);
  const bodyStyle = resolveBodyStyle(resolved);
  const dpi = resolved.page.dpi;
  // Normal / bold weights reused for table + caption font sets.
  const normalWeight = resolved.bodyText.fontWeight.toString();
  const boldWeight = resolved.bodyText.boldFontWeight.toString();
  // Line-height ratio of the body text — applied to any custom table/caption
  // font size so a resized run keeps a proportional leading (and reproduces the
  // previous heights exactly when the size is left at the body default).
  const lineHeightRatio = bodyStyle.lineHeightPx / bodyStyle.fontSizePx;
  // Inline `:ref` emphasis (bold/italic), applied to refs in captions + cells.
  const refStyle = { bold: resolved.bodyText.referenceBold, italic: resolved.bodyText.referenceItalic, labelNumberGap: resolved.captionStyle.labelNumberGap, breakLabels: resolved.crossRefs.breakLabels };

  // A caption beside the picture inside its slot (`placement.captionSide:
  // 'inside'`, #1106): the picture takes its share of the slot on its
  // `align` side, the caption and note the rest after the gutter. A band
  // too narrow to read goes back under the picture.
  const inside = (() => {
    const share = !rotate && !input.captionAside ? captionInsideShare(resource, resourceType) : undefined;
    if (share === undefined) return undefined;
    const gapPx = Math.max(0, dimensionToPx(resolved.layout.gutterWidth, dpi, bodyStyle.fontSizePx));
    const bodyMax = columnWidth * share;
    const captionWidth = columnWidth - bodyMax - gapPx;
    if (!(captionWidth >= columnWidth * CAPTION_INSIDE_MIN_SHARE)) return undefined;
    const right = startEndAsLeftRight(resource.placement?.align ?? resourceType?.defaultPlacement?.align ?? 'left') === 'right';
    return { bodyMax, captionWidth, captionX: right ? 0 : bodyMax + gapPx, right };
  })();
  // Widest the picture is set: the caller's cap, and the share `inside`
  // gives it.
  const pictureMaxWidth = Math.min(columnWidth, input.maxBodyWidth ?? columnWidth, inside?.bodyMax ?? Infinity);

  // --- Figure body -------------------------------------------------------
  let bodyWidth = columnWidth;
  let bodyHeight = 0;
  let table: VDTResourceTableLayout | undefined;
  let tableRows: TableRowMetrics | undefined;
  let fileId: string | undefined;
  let format: string | undefined;
  let scoreBody: ReturnType<typeof layoutScoreResource> | undefined;

  if (resource.kind === 'bitmap' && resource.bitmap) {
    fileId = resource.bitmap.fileId;
    format = resource.bitmap.format;
    // Its pixels at its own resolution (#631), else at `page.dpi`; the
    // column caps it, a smaller picture keeps its size.
    const natural = bitmapLayoutSize(resource.bitmap, dpi);
    const fit = fitWidth(natural.width, natural.height, pictureMaxWidth);
    bodyWidth = fit.width;
    bodyHeight = fit.height;
  } else if (resource.kind === 'svg' && resource.svg) {
    fileId = resource.svg.fileId;
    // SVGs are vector: fill the column width and derive height from the
    // intrinsic aspect ratio (viewBox / width:height). Fall back to a 4:3 box
    // only when no intrinsic size was captured.
    const iw = resource.svg.width ?? 0;
    const ih = resource.svg.height ?? 0;
    bodyWidth = pictureMaxWidth;
    bodyHeight = iw > 0 && ih > 0 ? bodyWidth * (ih / iw) : bodyWidth * 0.75;
  } else if (resource.kind === 'video') {
    // A video is set as its poster (#454): the column's width, the poster's
    // ratio (else the video's, else 16:9). Posters are screen-sized, so
    // they fill the measure like an SVG rather than keep their pixel size.
    const poster = resource.video?.poster;
    fileId = poster?.fileId;
    format = poster?.format;
    const iw = poster?.width ?? resource.video?.width ?? 0;
    const ih = poster?.height ?? resource.video?.height ?? 0;
    bodyWidth = pictureMaxWidth;
    bodyHeight = iw > 0 && ih > 0 ? bodyWidth * (ih / iw) : bodyWidth * (9 / 16);
  } else if (resource.kind === 'score' && resource.score) {
    // A music example (#1172): its systems stacked at the column's width.
    scoreBody = layoutScoreResource(resource, resolved, pictureMaxWidth);
    bodyWidth = scoreBody.width;
    bodyHeight = scoreBody.height;
  } else if (resource.kind === 'table' && resource.table) {
    const ts = tableStyle;
    const bodyFontPx = dimensionToPx(ts.bodyFontSize, dpi);
    const headerFontPx = dimensionToPx(ts.headerFontSize, dpi);
    // Header weight/slant: the header's base run is bold (and/or italic) by
    // default; inline markup still toggles relative to that base, mirroring the
    // blockquote/heading italic-flip convention.
    const hWeight = ts.headerBold ? boldWeight : normalWeight;
    const hBase = ts.headerItalic ? 'italic' : 'normal';
    const hFlip = ts.headerItalic ? 'normal' : 'italic';
    const headerTrackingPx = dimensionToPx(ts.headerLetterSpacing, dpi, headerFontPx);
    // Booktabs (#625): its own three widths, all resolved against the body
    // cell size (a larger header size must not thicken the header rule); a
    // width of 0 drops that rule.
    const booktabs: BooktabsRuleSpec | undefined = ts.borders && ts.rules === 'booktabs'
      ? {
          heavyPx: rulePx(ts.heavyRuleWidth, dpi, bodyFontPx),
          lightPx: rulePx(ts.lightRuleWidth, dpi, bodyFontPx),
          spanPx: rulePx(ts.spanRuleWidth, dpi, bodyFontPx),
          spanRules: ts.spanRules,
          spanTrimPx: Math.max(0, dimensionToPx(ts.spanRuleTrim, dpi, bodyFontPx)),
          groupRules: ts.groupRules,
          continuedFootRule: ts.continuedFootRule,
        }
      : undefined;
    const style: TableLayoutStyle = {
      dpi,
      body: {
        fontString: buildFontString(ts.bodyFontFamily, bodyFontPx, normalWeight),
        boldFontString: buildFontString(ts.bodyFontFamily, bodyFontPx, boldWeight),
        italicFontString: buildFontString(ts.bodyFontFamily, bodyFontPx, normalWeight, 'italic'),
        boldItalicFontString: buildFontString(ts.bodyFontFamily, bodyFontPx, boldWeight, 'italic'),
        color: ts.bodyColor.hex,
        lineHeightPx: bodyFontPx * lineHeightRatio,
      },
      header: {
        fontString: buildFontString(ts.headerFontFamily, headerFontPx, hWeight, hBase),
        boldFontString: buildFontString(ts.headerFontFamily, headerFontPx, boldWeight, hBase),
        italicFontString: buildFontString(ts.headerFontFamily, headerFontPx, hWeight, hFlip),
        boldItalicFontString: buildFontString(ts.headerFontFamily, headerFontPx, boldWeight, hFlip),
        color: ts.headerColor.hex,
        lineHeightPx: headerFontPx * lineHeightRatio,
        ...(headerTrackingPx !== 0 ? { letterSpacingPx: headerTrackingPx } : {}),
        ...(ts.headerTextTransform === 'uppercase' ? { uppercase: true } : {}),
      },
      borderColor: ts.borderColor.hex,
      borderWidthPx: booktabs
        ? Math.max(booktabs.heavyPx, booktabs.lightPx, booktabs.spanPx)
        : ts.borders && ts.rules !== 'none'
          ? Math.max(MIN_BORDER_PX, dimensionToPx(ts.borderWidth, dpi))
          : 0,
      cellPaddingPx: dimensionToPx(ts.cellPadding, dpi, bodyFontPx),
      headerBackground: ts.headerBackgroundEnabled ? ts.headerBackground.hex : undefined,
      bodyBackground: ts.bodyBackgroundEnabled ? ts.bodyBackground.hex : undefined,
      bodyAlternateBackground: ts.bodyAlternateBackgroundEnabled ? ts.bodyAlternateBackground.hex : undefined,
      rules: ts.rules,
      listGapPx: dimensionToPx(resolved.unorderedLists.gap, dpi, bodyFontPx),
      palette,
      chips: chipContextOf(resolved),
      ...(resolved.codeStyle?.inline ? { inlineCode: resolved.codeStyle.inline } : {}),
      annotations: { cjk: resolved.cjk, dpi },
      math: resolved.math,
    };
    const { layout, height, metrics } = layoutTable(
      resource.table.model,
      columnWidth,
      style,
      resourceNumbering,
      resourceTypes,
      resources,
      refStyle,
      slice ? tableSliceRows(resource.table.model, slice) : undefined,
      resource.table.direction,
    );
    // Rounded outer frame: a part of a split table rounds only the ends
    // the table really has — the top on the first part, the bottom on the
    // last.
    const radiusPx = Math.min(dimensionToPx(ts.borderRadius, dpi, bodyFontPx), columnWidth / 2, height / 2);
    const top = slice?.continued ? 0 : radiusPx;
    const bottom = slice?.continues ? 0 : radiusPx;
    // Booktabs rules are computed here, where the slice is known and the
    // cells of a table that runs the other way are already mirrored.
    const strokes = booktabs
      ? booktabsStrokes(layout, tableHeaderRowCount(resource.table.model), booktabs, slice?.continues ?? false)
      : undefined;
    table = {
      ...layout,
      ...(radiusPx > 0 && (top > 0 || bottom > 0) ? { frameRadii: [top, top, bottom, bottom] as [number, number, number, number] } : {}),
      ...(strokes ? { strokes } : {}),
    };
    tableRows = metrics;
    bodyWidth = columnWidth;
    bodyHeight = height;
  }

  // --- Caption -----------------------------------------------------------
  // A continued table slice: "Table 6-4. Title (cont.)" — the suffix is
  // set in italics after the description, glued to it by a plain space,
  // or solid when it opens with a wide character (表1-1　标题（续）).
  const suffix = slice?.continued ? tableStyle.continuedSuffix.trim() : '';
  const caption = layoutCaptionText({
    text: resource.caption ?? '',
    resourceType,
    number,
    resolved,
    width: input.captionAside?.width ?? inside?.captionWidth ?? input.captionWidth ?? columnWidth,
    resourceNumbering,
    resourceTypes,
    resources,
    ...(input.captionCitations?.get(resource.id)?.caption ? { citations: input.captionCitations.get(resource.id)!.caption } : {}),
    ...(suffix.length > 0 ? { suffix } : {}),
  });
  const cs = caption.style;
  const captionGapPx = caption.gapPx;
  const captionPaddingPx = caption.paddingPx;
  const { fontString: captionFontString, boldFontString: captionBoldFontString, italicFontString: captionItalicFontString, boldItalicFontString: captionBoldItalicFontString } = caption.fonts;
  const captionPrefix = resourceType?.captionPrefix ?? '';
  const linkColor = caption.linkColor;
  const measuredCaption: VDTLine[] = caption.lines;
  const captionBandHeight = caption.bandHeight;
  const captionHeight = captionBandHeight > 0 ? captionBandHeight + captionGapPx : 0;

  // --- Note --------------------------------------------------------------
  const noteFontPx = dimensionToPx(cs.note.fontSize, dpi);
  const noteLineHeightPx = noteFontPx * lineHeightRatio;
  const noteGapPx = dimensionToPx(cs.note.gap, dpi, noteFontPx);
  const noteFontString = buildFontString(cs.fontFamily, noteFontPx, normalWeight);
  const noteBoldFontString = buildFontString(cs.fontFamily, noteFontPx, boldWeight);
  const noteItalicFontString = buildFontString(cs.fontFamily, noteFontPx, normalWeight, 'italic');
  const noteBoldItalicFontString = buildFontString(cs.fontFamily, noteFontPx, boldWeight, 'italic');
  let measuredNote: VDTLine[] = [];
  const noteText = resource.note ?? '';
  // The note closes the table: a slice that continues holds it back for
  // the last slice.
  if (noteText.trim().length > 0 && !slice?.continues) {
    const noteSpans = annotatedSpans(resolveChipSpans(resolveSwatchSpans(resolveRefSpans(
      snippetMathSpans(
        resolveCitationSpans(
          withSnippetInlineCode(parseInlineSnippetSpans(noteText, { citations: true }), noteText, resolved.codeStyle?.inline, dpi, noteFontPx),
          input.captionCitations?.get(resource.id)?.note,
        ),
        noteFontPx,
        noteLineHeightPx,
        resolved.math,
      ),
      resourceNumbering,
      resourceTypes,
      resources,
      refStyle,
    ), palette, resources, { dpi, fontSizePx: noteFontPx }), chipContextOf(resolved), noteFontPx), { cjk: resolved.cjk, dpi }, noteFontString);
    const slanted: InlineSpan[] = cs.note.italic
      ? noteSpans.map((s) => ({ ...s, italic: s.italic || true }))
      : noteSpans;
    measuredNote = measureSnippetLines(
      slanted,
      [noteFontString, noteBoldFontString, noteItalicFontString, noteBoldItalicFontString],
      Math.max(1, input.captionAside?.width ?? inside?.captionWidth ?? input.captionWidth ?? columnWidth),
      noteLineHeightPx,
      { textAlign: cs.note.align },
    );
  }
  const noteHeight = measuredNote.length > 0
    ? measuredNote.length * noteLineHeightPx + noteGapPx
    : 0;

  // --- Continues marker --------------------------------------------------
  // "Continued" under a slice that goes on: the note's typeface and size,
  // italic, flush right — where the note would sit.
  let measuredContinues: VDTLine[] = [];
  const ts = tableStyle;
  const markerText = slice?.continues && ts.continuesMarkerEnabled ? ts.continuesMarker.trim() : '';
  if (markerText.length > 0) {
    const measured = measureRichBlock(
      [{ text: markerText, bold: false, italic: true }],
      noteFontString,
      noteBoldFontString,
      noteItalicFontString,
      noteBoldItalicFontString,
      Math.max(1, columnWidth),
      noteLineHeightPx,
      { textAlign: 'left' },
    );
    // Flush right: the measurer has no right alignment, so each line is
    // pushed to the block's right edge by its own width.
    measuredContinues = measured.lines.map((line) => ({
      ...line,
      bbox: createBoundingBox(columnWidth - line.bbox.width, line.bbox.y, line.bbox.width, line.bbox.height),
    }));
  }
  const continuesHeight = measuredContinues.length > 0
    ? measuredContinues.length * noteLineHeightPx + noteGapPx
    : 0;

  // A rotated figure must also fit the band's width with its caption and
  // note: scale the image down when the stack would run past it (a table
  // is cut between rows by the placer instead).
  // Intrinsic size and safe area of a picture that may be cropped to make
  // it taller or shorter (#442); `flexRange` gives its body height range at
  // a width.
  const safeArea = resourceSafeArea(resource);
  const intrinsic = resource.kind === 'bitmap' && resource.bitmap
    ? { width: resource.bitmap.width, height: resource.bitmap.height }
    : resource.kind === 'svg' && resource.svg?.width && resource.svg.height
      ? { width: resource.svg.width, height: resource.svg.height }
      : resource.kind === 'video' && resource.video?.poster
        ? { width: resource.video.poster.width, height: resource.video.poster.height }
        : undefined;
  const picture = resource.kind === 'bitmap' || resource.kind === 'svg' || resource.kind === 'video';
  const flexRange = safeArea && intrinsic && intrinsic.width > 0 && intrinsic.height > 0 && !rotate
    ? (w: number) => safeAreaHeightRange(intrinsic.width, intrinsic.height, safeArea, w)
    : undefined;
  // The content area's room for the body, when `fitFiguresToPage` caps it.
  let pageRoom: number | undefined;
  if (rotate && picture) {
    const room = footprintWidth - captionHeight - noteHeight - continuesHeight;
    if (bodyHeight > room + FIT_EPS && bodyHeight > 0) {
      const k = Math.max(0.01, room) / bodyHeight;
      bodyWidth *= k;
      bodyHeight *= k;
    }
  }
  // Likewise a figure that would stand taller than the content area, when
  // the document asks for it (`layout.fitFiguresToPage`): the image shrinks
  // so image, caption and note fit one page with a line of air to spare.
  if (
    !rotate && !input.captionAside && resolved.layout.fitFiguresToPage
    && picture
  ) {
    const m = resolved.page.margins;
    const areaHeight = dimensionToPx(resolved.page.height, dpi)
      - dimensionToPx(m.top, dpi) - dimensionToPx(m.bottom, dpi);
    // A caption set beside the picture (`inside`) takes none of its height.
    const room = areaHeight - (inside ? 0 : captionHeight + noteHeight) - continuesHeight - bodyStyle.lineHeightPx;
    // A picture with a safe area is cropped first, keeping its width.
    if (bodyHeight > room + FIT_EPS && bodyHeight > 0 && room > 0 && flexRange) {
      bodyHeight = Math.max(room, flexRange(bodyWidth).min);
    }
    if (bodyHeight > room + FIT_EPS && bodyHeight > 0 && room > 0) {
      const k = room / bodyHeight;
      bodyWidth *= k;
      bodyHeight *= k;
    }
    pageRoom = room;
  }
  // A float scaled to the room of its slot (`placement.shrink`, #626): the
  // caller gives the tallest body the slot holds. A picture with a safe
  // area is cropped first, keeping its width; then width and height scale
  // together, never below `minBodyScale`.
  let shrinkScale: number | undefined;
  // The balancing lever never grows the body past that room.
  if (input.maxBodyHeight !== undefined && picture && !rotate) {
    const cap = Math.max(0, input.maxBodyHeight);
    if (bodyHeight > cap + 0.01 && bodyHeight > 0) {
      if (flexRange) bodyHeight = Math.max(cap, flexRange(bodyWidth).min);
      if (bodyHeight > cap + 0.01) {
        const k = Math.max(Math.min(1, Math.max(0, input.minBodyScale ?? 0)), cap / bodyHeight);
        bodyWidth *= k;
        bodyHeight *= k;
        if (k < 1 - 1e-6) shrinkScale = k;
      }
    }
    pageRoom = Math.min(pageRoom ?? Infinity, Math.max(cap, bodyHeight));
  }

  // A picture with a safe area set taller or shorter than its own ratio:
  // the lever's delta, within what the safe area (and the page) allows.
  let bodySource: ResourceSafeArea | undefined;
  let bodyFlex: { shrink: number; grow: number; delta: number } | undefined;
  if (flexRange && safeArea && intrinsic && !rotate) {
    const range = flexRange(bodyWidth);
    const max = pageRoom !== undefined ? Math.max(range.min, Math.min(range.max, pageRoom)) : range.max;
    const delta = input.bodyHeightDelta ?? 0;
    const before = bodyHeight;
    if (delta !== 0) bodyHeight = Math.max(range.min, Math.min(max, bodyHeight + delta));
    bodySource = safeAreaSource(intrinsic.width, intrinsic.height, safeArea, bodyWidth, bodyHeight);
    bodyFlex = { shrink: Math.max(0, bodyHeight - range.min), grow: Math.max(0, max - bodyHeight), delta: bodyHeight - before };
  }

  // A picture narrower than its slot whose caption takes its width
  // (`placement.captionMeasure: 'body'`): laid out again with the caption
  // and note at the picture's width. A narrower caption may wrap onto more
  // lines and leave the picture less room (`fitFiguresToPage`), so a few
  // rounds follow the width down.
  const captionMeasure = resource.placement?.captionMeasure ?? resourceType?.defaultPlacement?.captionMeasure;
  if (
    captionMeasure === 'body' && picture && !rotate && !input.captionAside && !inside
    && input.captionWidth === undefined && bodyWidth < columnWidth - 0.5
  ) {
    let width = bodyWidth;
    let out = layoutResourceBlock({ ...input, captionWidth: width });
    for (let round = 0; round < 2 && out.block.bodyRect.width < width - 0.5; round++) {
      width = out.block.bodyRect.width;
      out = layoutResourceBlock({ ...input, captionWidth: width });
    }
    return out;
  }

  // --- Vertical stacking -------------------------------------------------
  // above: [caption band] gap [body] noteGap [note]
  // below: [body] gap [caption band] noteGap [note]
  // beside (`inside`): [body] gutter [caption band, noteGap, note], the
  // body and the caption band both from the block's top
  const aside = input.captionAside;
  const asideBand = aside ? captionBandHeight + noteHeight : 0;
  const besideBand = inside ? captionBandHeight + noteHeight : 0;
  const captionAbove = !aside && !inside && cs.position === 'above' && captionBandHeight > 0;
  const captionBandY = aside
    ? (aside.alignBottom ? Math.max(0, bodyHeight - asideBand) : Math.max(0, aside.offsetY ?? 0))
    : inside ? 0
    : captionAbove ? 0 : bodyHeight + (captionBandHeight > 0 ? captionGapPx : 0);
  const bodyY = captionAbove ? captionHeight : 0;
  const asideDx = aside ? aside.dx : inside ? inside.captionX : 0;
  // A caption measured to the picture (`placement.captionMeasure: 'body'`)
  // sits under it per `placement.align`, as the picture sits in the slot.
  const captionDx = !aside && !inside && input.captionWidth !== undefined && input.captionWidth < columnWidth
    ? (columnWidth - input.captionWidth) * alignFactor(resource.placement?.align ?? resourceType?.defaultPlacement?.align)
    : asideDx;
  // A picture narrower than its slot — shrunk to fit the page or the room
  // left (`layout.fitFiguresToPage`), or a bitmap smaller than the column —
  // sits in the slot per `placement.align`, as a float narrowed by
  // `placement.width` does; the caption and note keep the slot's measure.
  // A turned figure and one with its caption beside it stay flush left.
  // A picture with its caption inside the slot keeps to its own side.
  const bodyX = inside
    ? (inside.right ? columnWidth - bodyWidth : 0)
    : !rotate && !aside && picture && bodyWidth < columnWidth
    ? (columnWidth - bodyWidth) * alignFactor(resource.placement?.align ?? resourceType?.defaultPlacement?.align)
    : 0;
  const bodyRect = createBoundingBox(bodyX, bodyY, bodyWidth, bodyHeight);
  // Table cells were laid out with the table's top at y = 0; when the caption
  // sits above, move them down with the body (block-relative, like captions).
  if (table && bodyY > 0) {
    table = {
      ...table,
      cells: table.cells.map((cell) => ({
        ...cell,
        rect: createBoundingBox(cell.rect.x, cell.rect.y + bodyY, cell.rect.width, cell.rect.height),
        lines: shiftLines(cell.lines, 0, bodyY),
        ...(cell.image
          ? { image: { ...cell.image, rect: createBoundingBox(cell.image.rect.x, cell.image.rect.y + bodyY, cell.image.rect.width, cell.image.rect.height) } }
          : {}),
      })),
    };
  }
  const captionLines = shiftLines(measuredCaption, captionDx + captionPaddingPx, captionBandY + captionPaddingPx);
  // A table's rules are stroked centred on the cell edges, so its outer
  // frame reaches half a stroke beyond the body on each side; the caption
  // bar spans that same outer extent, or it would read a hair narrower.
  const barOverhang = table ? table.borderWidthPx / 2 : 0;
  const captionBar = cs.backgroundEnabled && captionBandHeight > 0
    ? {
        rect: createBoundingBox(captionDx - barOverhang || 0, captionBandY, (aside?.width ?? inside?.captionWidth ?? input.captionWidth ?? columnWidth) + 2 * barOverhang, captionBandHeight),
        background: cs.background.hex,
      }
    : undefined;
  const noteY = aside || inside
    ? captionBandY + captionBandHeight + noteGapPx
    : (captionAbove ? bodyY + bodyHeight : bodyHeight + captionHeight) + noteGapPx;
  const noteLines = shiftLines(measuredNote, captionDx, noteY);
  // The marker takes the note's slot (a continuing slice has no note).
  const continuesLines = shiftLines(measuredContinues, 0, aside ? bodyHeight + noteGapPx : noteY);
  const totalHeight = aside
    ? bodyHeight + continuesHeight
    : inside
    ? Math.max(bodyHeight, besideBand) + continuesHeight
    : bodyHeight + captionHeight + noteHeight + continuesHeight;

  const video = layoutVideo(resource, resolved, bodyWidth, bodyHeight);
  const block: ResolvedResourceBlock = {
    resource,
    kind: resource.kind,
    ...(video ? { video } : {}),
    ...(scoreBody ? { score: scoreBody.score } : {}),
    ...(slice ? { slice } : {}),
    number,
    captionPrefix,
    bodyRect,
    ...(bodySource ? { bodySource } : {}),
    ...(bodyFlex ? { bodyFlex } : {}),
    ...(shrinkScale !== undefined ? { shrinkScale } : {}),
    fileId,
    format,
    captionLines,
    captionFontString,
    captionBoldFontString,
    captionItalicFontString,
    captionBoldItalicFontString,
    captionColor: cs.color.hex,
    captionLabelColor: cs.labelColor.hex,
    linkColor,
    table,
    captionBar,
    noteLines,
    noteFontString,
    noteBoldFontString,
    noteItalicFontString,
    noteBoldItalicFontString,
    noteColor: cs.note.color.hex,
    continuesLines,
  };

  if (rotate) {
    // The inner geometry stays in the upright frame; the placer sets the
    // origin when it positions the block. On the page the block is as tall
    // as the upright frame is wide.
    block.rotation = { direction: rotate, originX: 0, originY: 0, width: columnWidth, height: totalHeight };
    return tableRows ? { block, totalHeight: columnWidth, tableRows } : { block, totalHeight: columnWidth };
  }
  return {
    block,
    totalHeight,
    ...(tableRows ? { tableRows } : {}),
    ...(aside ? { asideHeight: asideBand } : {}),
  };
}


/** The narrowest caption band set beside a picture inside its slot
 *  (`placement.captionSide: 'inside'`), as a share of the slot: a
 *  narrower one goes back under the picture. */
const CAPTION_INSIDE_MIN_SHARE = 0.2;

/** The share of its first width an upright picture keeps when its frame
 *  narrows (see `layoutUprightResourceBlock`): it may give up a quarter,
 *  about two caption lines in a full tier. */
const UPRIGHT_MIN_PICTURE_SHARE = 0.75;

/**
 * A resource set upright on a vertical page (see `ResourceLayoutInput.
 * upright`): a counter-clockwise rotated block whose upright frame is as
 * wide as its picture. The frame is first tried `maxLength` wide, which
 * gives the picture its largest size (the caption on the fewest lines). A
 * picture the tier's height shrinks (or a bitmap narrower than that) gives
 * its width back, and the block is laid out again at the picture's width
 * so the caption wraps under it, a few rounds until the width holds. A
 * narrower frame is taken only while it fits the tier and the picture
 * keeps `UPRIGHT_MIN_PICTURE_SHARE` of its first width: a caption that
 * wraps onto more lines at each narrowing would otherwise squeeze the
 * picture to nothing and run the frame past the tier. When the rounds stop
 * short of a frame as wide as the picture, the frame narrows by bisection
 * to the least width at which the picture still keeps that share, and the
 * caption runs wider than the picture. The origin is block-relative
 * (`originX` 0, `originY` the block's height in the flow), as
 * `offsetResourceBlockToAbsolute` expects.
 */
function layoutUprightResourceBlock(input: ResourceLayoutInput, maxLength: number): ResourceBlockLayout {
  const base: ResourceLayoutInput = { ...input, upright: undefined, rotate: 'ccw' };
  const at = (length: number) => layoutResourceBlock({ ...base, rotatedLength: length });
  let length = Math.max(1, maxLength);
  let out = at(length);
  if (input.resource.kind === 'bitmap' || input.resource.kind === 'svg' || input.resource.kind === 'video') {
    const floor = out.block.bodyRect.width * UPRIGHT_MIN_PICTURE_SHARE;
    const holds = (o: ResourceBlockLayout) =>
      o.block.rotation!.height <= input.columnWidth + 0.5 && o.block.bodyRect.width >= floor;
    let settled = false;
    for (let round = 0; round < 4; round++) {
      const used = out.block.bodyRect.width;
      if (!(used > 0) || used >= length - 0.5) {
        settled = true;
        break;
      }
      const next = at(Math.max(1, used));
      if (!holds(next)) break;
      length = Math.max(1, used);
      out = next;
    }
    if (!settled) {
      let lo = Math.max(1, floor);
      let hi = length;
      for (let step = 0; step < 12 && hi - lo > 0.5; step++) {
        const mid = (lo + hi) / 2;
        const o = at(mid);
        if (holds(o)) {
          hi = mid;
          out = o;
        } else {
          lo = mid;
        }
      }
    }
  }
  const rotation = out.block.rotation!;
  rotation.originX = 0;
  rotation.originY = out.totalHeight;
  return out;
}

/** Shift a resolved resource block's geometry right by `dx` (an inline
 *  resource narrower than its column, set per `placement.align`). */
export function shiftResourceBlockX(rb: ResolvedResourceBlock, dx: number): void {
  if (!dx) return;
  rb.bodyRect = createBoundingBox(rb.bodyRect.x + dx, rb.bodyRect.y, rb.bodyRect.width, rb.bodyRect.height);
  for (const ln of [...rb.captionLines, ...rb.noteLines, ...rb.continuesLines]) ln.bbox.x += dx;
  if (rb.captionBar) rb.captionBar.rect.x += dx;
  if (rb.table) {
    for (const cell of rb.table.cells) {
      cell.rect.x += dx;
      if (cell.image) cell.image.rect.x += dx;
      for (const cl of cell.lines) cl.bbox.x += dx;
    }
  }
}
