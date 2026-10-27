// layoutCallout: one box laid out with its children, nested boxes, column
// groups, cuts across columns and pages, design and marker, with the memo
// of its first child's measures across widths (#1276: split out of calloutLayout.ts).
import { flowTextWidth, lineBaselineOffset } from '../../../measure/vertical.js';
import { onTextWidthCacheClear, getMeasureLanguage } from '../../../measure/canvas.js';
import { designLineOf } from '../../../design/cjkText.js';
import type { ContentBlock } from '../../../parse/index.js';
import { suffixJoiner } from '../../../parse/inlineFormatting.js';
import { spaceDirectiveLines } from '../../../parse/attrs.js';
import type { Dimension } from '../../../types.js';
import { dimensionToPx } from '../../../units.js';
import { type ResolvedConfig, type VDTDesignTextBlock, type VDTDesignBlock, createBoundingBox, type VDTLine, type VDTBlock, createVDTBlock } from '../../../vdt.js';
import { shiftContour } from '../../../contour/index.js';
import { buildFontString, measureRichBlock, measureBlock } from '../../../measure/index.js';
import { graphemeCount } from '../../../measure/graphemes.js';
import { isMarkerBlock } from '../../blocks/buildHelpers.js';
import { measureContentBlock } from '../../blocks/measureContentBlock.js';
import { uppercasePreservingLength } from '../../blocks/buildBlockKind.js';
import { directDesignTextBlock } from '../../../design/bidiText.js';
import { arabicNumbersOf } from '../../config.js';
import { restyleContainerFor } from '../paragraphContainers.js';
import { joiningScriptIn } from '../../../measure/rtl/joining.js';
import { isFlowColumnsStyle } from '../../columns/flowColumns.js';
import { logicalSides, type BoxExclusion, offsetBlock, offsetDesignBlock } from './geometry.js';
import { iconPresent, iconFootprintWidth } from './icons.js';
import { type CalloutLayoutInput, type CalloutLayoutResult, resolveCalloutAttrs, type BoxDesignInfo, boxTextOf, type CalloutUnit, type CalloutGroupLayout, columnsSpecOf, fenceMarginPx } from './inputs.js';
import { deriveCalloutMeasureContext } from './plan.js';
import { createChildMeasure } from './childMeasure.js';
import { createChildPlace } from './childPlace.js';
import { createChildGroups } from './childGroups.js';
import type { Stack } from './layoutCalloutTypes.js';
import { createBoxDecoration } from './boxDecoration.js';
import { createLabelTab } from './labelTab.js';
import { createMarkerColumn } from './markerColumn.js';
import type { CalloutState } from './layoutCalloutState.js';

/** The measures of `layoutCallout`'s first child across widths (see
 *  `CalloutLayoutInput.lineWidths`), per resolved configuration and
 *  content block: a build lays a split box out again on every pass. */
export let acrossWidthsMemo = new WeakMap<ResolvedConfig, WeakMap<ContentBlock, Map<string, ReturnType<typeof measureContentBlock> | undefined>>>();
// Measures: dropped with the widths when faces change (#629).
onTextWidthCacheClear(() => {
  acrossWidthsMemo = new WeakMap();
});

/**
 * Lay out one callout at `width`. Everything is frame-relative; see
 * {@link offsetCalloutToAbsolute}.
 */
export function layoutCallout(input: CalloutLayoutInput): CalloutLayoutResult {
  const boxState = {} as CalloutState;
  const { style, attrs, childStartIdx, ctx, containerId, frameId } = input;
  // A design that sets the box's content (#1014) prints it in its band:
  // the children are not laid out again.
  const designSetsContent = !!input.boxDesign && !!style.design?.enabled && style.design.setsContent
    && style.design.slot.elements.length > 0;
  const children = designSetsContent ? [] : input.children;
  const dpi = input.resolved.page.dpi;
  const derivedCtx = deriveCalloutMeasureContext(ctx, style);
  const bodyStyle = derivedCtx.bodyStyle;
  // The document's `:::paragraphs` containers as this box sets them: a
  // style's unset type fields in the box's body (#1119).
  const restyleContainer = restyleContainerFor(derivedCtx.resolved, input.resolved.paragraphStyles);
  const em = bodyStyle.fontSizePx;
  const px = (d: Dimension): number => dimensionToPx(d, dpi, em);

  const { span, placement, title: rawTitle, label: labelText } = resolveCalloutAttrs(style, attrs);
  const isAuto = style.width === 'auto';
  /** The frameless box of a `:::columns` group in the running text. */
  const flowGroupBox = isFlowColumnsStyle(style.id);
  // The title, the continuation marker and the label are design text set
  // here by hand: in a right-to-left document their lines are ordered at
  // that base direction, for the mirrored flow the box is painted in.
  const rtlDocument = input.resolved.direction === 'rtl';
  const mirroredFlow = rtlDocument && input.resolved.layout.writingMode !== 'vertical-rl';
  const directText = (block: VDTDesignTextBlock, trackingPx = 0): VDTDesignTextBlock => {
    directDesignTextBlock(block, rtlDocument ? 'rtl' : 'ltr', mirroredFlow, trackingPx, arabicNumbersOf(input.resolved));
    return block;
  };

  // --- Marker column (outside the box, on its left) --------------------------
  const hasMarker = iconPresent(style.marker);
  const markerSize = hasMarker ? px(style.marker.size) : 0;
  const ruleOn = hasMarker && style.marker.rule.enabled;
  const ruleW = ruleOn ? px(style.marker.rule.width) : 0;
  const markerColumn = hasMarker ? markerSize + ruleW + px(style.marker.gap) : 0;

  // --- Box geometry ------------------------------------------------------------
  // Everything below is box-relative (box origin = `(0,0)`); the marker
  // column shifts the box right (and down, when the marker is taller) at
  // the end.
  const padT = px(style.padding.top);
  const padR = px(style.padding.right);
  const padB = px(style.padding.bottom);
  const padL = px(style.padding.left);
  // `'start'` / `'end'` sides are the box's own (#371): the flow's left
  // and right, turned over in a box set against the document's direction.
  const boxSide = logicalSides(input.direction);
  const stripeSide = boxSide(style.stripe.side);
  const stripeOn = style.stripe.enabled;
  const stripeW = stripeOn ? px(style.stripe.width) : 0;
  const sideStripe = stripeOn && stripeSide !== 'top';
  const stripeLeft = sideStripe && stripeSide === 'left';
  const stripeRight = sideStripe && stripeSide === 'right';
  const topStripe = stripeOn && stripeSide === 'top';

  // The icon is drawn on the head only (`hasIcon`), but its geometry is
  // the box's on every fragment.
  const iconOn = iconPresent(style.icon);
  const hasIcon = !input.continuation && iconOn;
  const iconSize = iconOn ? px(style.icon.size) : 0;
  const iconBoxW = iconOn && style.icon.width ? Math.max(iconSize, px(style.icon.width)) : iconSize;
  const gapPx = px(style.titleStyle.gap);
  // The icon takes its own column only when there is no side stripe to sit
  // over. A continuation keeps that column, empty (EF-114): a box has one
  // measure in columns of one width, and a continuation that opens inside a
  // paragraph (`lineFrom`) wraps its text as the head counted it, line
  // `lineFrom` on, nothing lost or doubled. In a column of another width
  // the paragraph is broken again as the fragments before counted it
  // (`lineWidths`).
  const cornerIcon = style.icon.position === 'corner';
  // A corner badge hangs on the top-right corner — or the left one, for an
  // `'outer'` badge on a verso of mirrored margins (`'inner'` on a recto).
  const cornerSide = boxSide(style.icon.cornerSide);
  const cornerRight = cornerSide === 'right'
    || (cornerSide === 'outer' && !input.mirrored)
    || (cornerSide === 'inner' && !!input.mirrored);
  const iconColumnKept = iconOn && !sideStripe && !cornerIcon;
  const iconColumn = iconColumnKept ? iconBoxW + gapPx : 0;
  // A corner badge is centred on its corner by the width it is drawn at: a
  // wide strip (`icon.width`) hangs half its width past the border, not
  // half its height (EF-142).
  const cornerIconW = cornerIcon && iconOn ? iconFootprintWidth(style.icon, iconSize, iconBoxW, ctx) : iconSize;

  const innerX = (stripeLeft ? stripeW : 0) + padL + iconColumn;
  const innerTop = (topStripe ? stripeW : 0) + padT;
  // The label tab's rise (see "Label tab" below), known here so a frame's
  // exclusions and exact height (#855) are read in box coordinates.
  // A `bottom-` tab (#1059) hangs from the foot instead; a joined tab
  // stands on the edge, out of the box by its whole height.
  const labelShown = !!style.label && !input.continuation && labelText.trim().length > 0;
  const labelAtFoot = labelShown && typeof style.label!.position === 'string' && style.label!.position.startsWith('bottom-');
  const labelJoined = labelShown && style.label!.joined === true;
  const labelOut = !labelShown ? 0
    : labelJoined ? dimensionToPx(style.label!.height, dpi, dimensionToPx(style.label!.fontSize, dpi, em))
      : Math.max(0, px(style.label!.offset));
  const riseAhead = labelShown && !labelAtFoot ? labelOut : 0;
  const dropAhead = labelAtFoot ? labelOut : 0;
  const exclusions = (input.exclusions ?? []).map((e): BoxExclusion => ({
    x: e.x - markerColumn, y: e.y - riseAhead, width: e.width, height: e.height,
    ...(e.contour ? { contour: shiftContour(e.contour, -markerColumn, -riseAhead) } : {}),
  }));

  // --- Title -----------------------------------------------------------------
  // A continuation repeats the title, with its suffix, only when the style
  // asks for it (`repeatTitle`); the repeat is pagination furniture.
  const repeatedTitle = !!input.continuation && style.repeatTitle && rawTitle.trim().length > 0;
  const suffix = repeatedTitle ? style.continuedSuffix.trim() : '';
  const shownTitle = suffix.length > 0 ? `${rawTitle}${suffixJoiner(suffix)}${suffix}` : rawTitle;
  const titleText = style.titleStyle.textTransform === 'uppercase'
    ? uppercasePreservingLength(shownTitle)
    : shownTitle;
  const titleFontPx = dimensionToPx(style.titleStyle.fontSize, dpi, em);
  const titleFont = buildFontString(
    style.titleStyle.fontFamily,
    titleFontPx,
    style.titleStyle.fontWeight.toString(),
    style.titleStyle.italic ? 'italic' : 'normal',
  );
  // The title's leading (EF-182): `em` / `rem` count its own size; 1.2 em
  // unless the style sets one.
  const titleLh = style.titleStyle.lineHeight ?? { value: 1.2, unit: 'em' as const };
  const titleLineHeight = titleLh.unit === 'em' || titleLh.unit === 'rem'
    ? titleFontPx * titleLh.value
    : dimensionToPx(titleLh, dpi, titleFontPx);
  // A title in a joining script (Arabic…) is set untracked: spacing its
  // letters apart breaks the joins (`measure/rtl/joining.ts`). A negative
  // tracking tightens the title (#1098), as it does a heading.
  const titleTrackingRaw = dimensionToPx(style.titleStyle.letterSpacing, dpi, titleFontPx);
  const titleTrackingPx = joiningScriptIn(titleText) || !Number.isFinite(titleTrackingRaw) ? 0 : titleTrackingRaw;
  // A corner badge on the left hangs half over the title's side: the title
  // starts past it (its inner half plus the icon gap), at least — a
  // configured `indent` only adds beyond that room.
  const cornerLeftRoom = hasIcon && cornerIcon && !cornerRight ? Math.max(0, cornerIconW / 2 + gapPx - padL) : 0;
  const titleIndentPx = Math.max(cornerLeftRoom, dimensionToPx(style.titleStyle.indent, dpi, titleFontPx));
  const hasTitle = (!input.continuation || repeatedTitle) && titleText.trim().length > 0;
  const titleWidthOf = (t: string): number => flowTextWidth(t, titleFont) + titleTrackingPx * graphemeCount(t);

  // Box width: `fill` uses the given width less the marker column; `auto`
  // shrink-wraps the title.
  let boxWidth = input.width - markerColumn;
  let innerWidth: number;
  if (isAuto) {
    const titleW = hasTitle ? titleWidthOf(titleText) + titleIndentPx : 0;
    innerWidth = Math.max(1, titleW);
    boxWidth = innerX + innerWidth + padR + (stripeRight ? stripeW : 0);
  } else {
    innerWidth = Math.max(1, boxWidth - innerX - padR - (stripeRight ? stripeW : 0));
  }

  let cursorY = innerTop;
  const overlayBlocks: VDTDesignBlock[] = [];
  let titleBlock: VDTDesignTextBlock | undefined;
  if (hasTitle) {
    const titleW = Math.max(1, innerWidth - titleIndentPx);
    // Tracking only changes line widths on the rich path: the plain breaker
    // would fit an untracked line and a tracked title would overrun the box
    // (or, tightened, break earlier than it needs to).
    const measured = titleTrackingPx !== 0
      ? measureRichBlock(
        [{ text: titleText, bold: false, italic: false }],
        titleFont, titleFont, titleFont, titleFont, titleW, titleLineHeight,
        { textAlign: 'left', letterSpacingPx: titleTrackingPx },
      )
      : measureBlock(titleText, titleFont, titleW, titleLineHeight, { textAlign: 'left' });
    const lines = measured.lines.length > 0
      ? measured.lines
      : [{ text: titleText, bbox: createBoundingBox(0, 0, titleW, titleLineHeight), baseline: lineBaselineOffset(titleLineHeight, titleFont), hyphenated: false }];
    const titleHeight = lines.length * titleLineHeight;
    // A line the CJK composer set carries what it spaced in its segments:
    // a Han–Latin space, a mark that gave up blank. A design line with no
    // runs is painted at its glyphs' own advances, so the line was as
    // wide as the composer made it and its text ended short of that: the
    // title `Sandboxでやってみよう` at 31.25 px, 360.91 px wide, was
    // painted 353.09 px, the quarter em between `Sandbox` and `で` gone.
    // Such a line takes the runs a design text has (`designLineOf`), each
    // with its box, as a heading design with the same text does (#770).
    // In a document shaped in its own language; one that keeps its host's
    // keeps the lines it had.
    const titleFonts = { normal: titleFont, bold: titleFont, italic: titleFont, boldItalic: titleFont };
    const composedRuns = getMeasureLanguage() !== undefined
      ? (ln: VDTLine) => (ln.cjkComposed ? designLineOf(ln, titleFonts, (t, font) => flowTextWidth(t, font) + titleTrackingPx * graphemeCount(t)).runs : undefined)
      : () => undefined;
    titleBlock = directText({
      kind: 'text',
      bbox: createBoundingBox(innerX + titleIndentPx, cursorY, titleW, titleHeight),
      fontString: titleFont,
      color: style.titleStyle.color.hex,
      lines: lines.map((ln, i) => {
        const runs = composedRuns(ln as VDTLine);
        return {
          text: ln.text,
          xOffset: 0,
          baselineY: cursorY + i * titleLineHeight + lineBaselineOffset(titleLineHeight, titleFont),
          width: ln.bbox.width,
          ...(runs ? { runs } : {}),
        };
      }),
      clip: false,
      ...(titleTrackingPx !== 0 ? { letterSpacingPx: titleTrackingPx } : {}),
      ...(repeatedTitle ? { artifact: true } : {}),
    }, titleTrackingPx);
    cursorY += titleHeight;
  }
  // "Continued from …" at the head of a piece that opens on another page
  // (#917): pagination furniture, as the "Continued" marker is.
  const fromText = input.continuation ? (input.continuedMark ?? '').trim() : '';
  let fromBlock: VDTDesignTextBlock | undefined;
  if (fromText.length > 0) {
    const font = buildFontString(style.body.fontFamily, em, style.body.fontWeight.toString(), style.continuesMarkerItalic ? 'italic' : 'normal');
    const lh = bodyStyle.lineHeightPx;
    const { lines } = measureRichBlock([{ text: fromText, bold: false, italic: false }], font, font, font, font, innerWidth, lh, { textAlign: 'left' });
    if (lines.length > 0) {
      const top = cursorY;
      const align = style.continuesMarkerAlign;
      fromBlock = directText({
        kind: 'text',
        bbox: createBoundingBox(innerX, top, innerWidth, lines.length * lh),
        fontString: font,
        color: bodyStyle.color,
        lines: lines.map((ln, i) => {
          const slack = Math.max(0, innerWidth - ln.bbox.width);
          return { text: ln.text, xOffset: align === 'right' ? slack : align === 'center' ? slack / 2 : 0, baselineY: top + i * lh + lineBaselineOffset(lh, font), width: ln.bbox.width };
        }),
        clip: false,
        artifact: true,
      });
      cursorY += lines.length * lh;
    }
  }

  // --- Design band (#1014) ---------------------------------------------------
  // The style's design takes a band across the inner width under the
  // title (the title's gap between them), on the box's first fragment
  // only; the children follow it, the gap again before the first.
  const design = !input.continuation && input.boxDesign && style.design?.enabled && style.design.slot.elements.length > 0
    ? style.design
    : undefined;
  let designBlocks: VDTDesignBlock[] = [];
  let banded = false;
  if (design) {
    const info: BoxDesignInfo = { titleText: shownTitle, attrs, boxText: input.boxText ?? boxTextOf(input.children) };
    const bandH = input.boxDesign!.measure(design, info, innerWidth);
    if (bandH > 0) {
      const top = cursorY + (hasTitle ? gapPx : 0);
      designBlocks = input.boxDesign!.layout(
        design,
        info,
        { x: innerX, y: top, width: innerWidth, height: bandH },
        { rtl: rtlDocument, mirrored: mirroredFlow },
      );
      cursorY = top + bandH;
      banded = true;
    }
  }

  // --- Children --------------------------------------------------------------
  // The children stack under the title; a `:::columns{count=N}` group among
  // them lays its own children out in N columns of equal width, cut at
  // the line boundaries that level the columns best, and takes the height
  // of the tallest column.
  const childBlocks: VDTBlock[] = [];
  const units: CalloutUnit[] = [];
  /** The `:::columns` groups among the box's own children, as laid out
   *  (#634), and the rules down their gutters. */
  const groupLayouts: CalloutGroupLayout[] = [];
  const groupRules: VDTDesignBlock[] = [];
  /** The lines of the box's code listing a fence highlights (#624),
   *  box-relative. */
  const highlights: { y: number; height: number }[] = [];
  const nestPath = input.nestPath && input.nestPath.length > 0 ? input.nestPath : undefined;
  const columnGapPx = px(style.columnGap);
  /** A `:::space` between children: body lines of the box's own type.
   *  Before the first child it is dropped, like at the top of a column —
   *  the padding already sets the content off the frame — unless it opens
   *  the head of a box under its title, or the box holds nothing else (an
   *  answer box sized by its space); at the top of a `:::columns` group or
   *  of a split box's continuation it always vanishes. */
  const addSpace = (raw: ContentBlock, st: Stack): void => {
    if (raw.type !== 'directive' || raw.directiveName !== 'space') return;
    if (st.first && !st.keepLeadingSpace) return;
    st.cursorY += (spaceDirectiveLines(raw.directiveAttrs) ?? 1) * bodyStyle.lineHeightPx;
  };
  /** The gap an inline resource keeps in the box (`layout.inlineResourceGapInBoxes`):
   *  a line of the box's text, above it and, with `inlineResourceGap:
   *  'around'`, below it. None when off (postext 1.4). */
  const resourceGapPx = input.resolved.layout.inlineResourceGapInBoxes ? bodyStyle.lineHeightPx : 0;
  const resourceGapBelow = input.resolved.layout.inlineResourceGap !== 'above';
  const isFirstRealOf = (k: number): boolean => children.slice(0, k).every((c) => c.type === 'directive' || isMarkerBlock(c));
  const isLastRealOf = (k: number): boolean => children.slice(k + 1).every((c) => c.type === 'directive' || isMarkerBlock(c));
  /** The widths of `lineWidths` as a child's measure: a child set `width`
   *  wide in a box `input.width` wide is that much narrower at every box
   *  width (the box's padding, stripe, icon and marker columns stay). */
  const childWidthAt = (boxWidth: number, width: number): number => Math.max(1, width - (input.width - boxWidth));

  const {
    measureFirstChildAcrossWidths, measureAcrossSteps, isStripChild
  } = createChildMeasure({
    input, style, derivedCtx, isFirstRealOf, childWidthAt
  });

  const {
    placeChild, containerMargin
  } = createChildPlace({
    input, style, childStartIdx, ctx, containerId, children, derivedCtx, bodyStyle, restyleContainer,
    innerTop, exclusions, highlights, nestPath, resourceGapPx, resourceGapBelow, isFirstRealOf,
    isLastRealOf, measureFirstChildAcrossWidths, measureAcrossSteps, isStripChild
  });

  const {
    placeNested, closeOf, placeColumnsGroup
  } = createChildGroups({
    input, style, childStartIdx, ctx, containerId, children, em, px, innerX, innerWidth, childBlocks,
    units, groupLayouts, groupRules, nestPath, addSpace, childWidthAt, isStripChild, placeChild,
    containerMargin
  });

  const holdsContent = children.some((c) => (c.type !== 'directive' || isStripChild(c)) && !isMarkerBlock(c));
  const st: Stack = {
    cursorY,
    prevMarginBottom: hasTitle || banded ? gapPx : 0,
    pull: false,
    prevWasListItem: false,
    first: true,
    keepLeadingSpace: !input.continuation && (hasTitle || !holdsContent),
  };
  if (!isAuto) {
    let k0 = 0;
    // A continuation opening inside a nested box redraws it (and the boxes
    // it opens inside in turn) around the children up to its closing marker.
    const [reopen, ...openRest] = input.openNested ?? [];
    if (reopen) {
      const e = closeOf(reopen.block.containerId, 0);
      placeNested(reopen.block, reopen.idx, 0, e, innerWidth, innerX, st, childBlocks, units, { openRest });
      k0 = e + 1;
    }
    for (let k = k0; k < children.length; k++) {
      const raw = children[k]!;
      if (raw.type === 'containerStart' && raw.containerName === 'callout') {
        const e = closeOf(raw.containerId, k + 1);
        if (placeNested(raw, childStartIdx + k, k + 1, e, innerWidth, innerX, st, childBlocks, units)) {
          k = e;
          continue;
        }
      }
      if (raw.type === 'containerStart' && raw.containerName === 'columns') {
        let e = k + 1;
        while (e < children.length && !(children[e]!.type === 'containerEnd' && children[e]!.containerName === 'columns' && children[e]!.containerId === raw.containerId)) e++;
        // A fragment that opens inside the group (it is then the first
        // child) or ends inside it (the last) sets its part (#634).
        // (The margins of a main-flow group's fence are its synthetic
        // box's, returned below: the group does not take them again, #714.)
        const groupSpec = columnsSpecOf(raw.containerAttrs ?? {}, columnGapPx, em, dpi);
        if (flowGroupBox) {
          delete groupSpec.marginTopPx;
          delete groupSpec.marginBottomPx;
        }
        placeColumnsGroup(k + 1, e, groupSpec, st, {
          ...(k === 0 && input.groupFrom ? { from: input.groupFrom } : {}),
          ...(e === children.length - 1 && input.groupTo ? { to: input.groupTo } : {}),
        });
        k = e;
        continue;
      }
      addSpace(raw, st);
      containerMargin(raw, k, st);
      if ((raw.type === 'directive' && !isStripChild(raw)) || isMarkerBlock(raw)) continue;
      placeChild(raw, k, innerWidth, innerX, st, childBlocks, units);
    }
  }

  // --- Continuation marker ---------------------------------------------------
  // "Continued" under the last line of a fragment that goes on, in the box's
  // body face and size, aligned in the inner width; like the repeated title
  // it is pagination furniture.
  const continuesText = style.continuesMarkerEnabled && !isAuto ? style.continuesMarker.trim() : '';
  let continuesBlock: VDTDesignTextBlock | undefined;
  let continuesMarkerPx = 0;
  if (continuesText.length > 0) {
    const font = buildFontString(
      style.body.fontFamily,
      em,
      style.body.fontWeight.toString(),
      style.continuesMarkerItalic ? 'italic' : 'normal',
    );
    const lh = bodyStyle.lineHeightPx;
    const { lines } = measureRichBlock(
      [{ text: continuesText, bold: false, italic: false }],
      font, font, font, font, innerWidth, lh,
      { textAlign: 'left' },
    );
    continuesMarkerPx = lines.length * lh;
    if (input.continues && lines.length > 0) {
      const top = st.cursorY;
      const align = style.continuesMarkerAlign;
      continuesBlock = directText({
        kind: 'text',
        bbox: createBoundingBox(innerX, top, innerWidth, continuesMarkerPx),
        fontString: font,
        color: bodyStyle.color,
        lines: lines.map((ln, i) => {
          const slack = Math.max(0, innerWidth - ln.bbox.width);
          return {
            text: ln.text,
            xOffset: align === 'right' ? slack : align === 'center' ? slack / 2 : 0,
            baselineY: top + i * lh + lineBaselineOffset(lh, font),
            width: ln.bbox.width,
          };
        }),
        clip: false,
        artifact: true,
      });
      st.cursorY += continuesMarkerPx;
    }
  }
  cursorY = st.cursorY;

  // An icon taller than the content grows the inner area to fit it; with
  // `align: 'center'` the title and children are centred on the icon.
  let contentBottom = cursorY;
  const contentH = contentBottom - innerTop;
  if (hasIcon && !cornerIcon && iconSize > contentH) {
    const extra = iconSize - contentH;
    if (style.icon.align === 'center') {
      if (titleBlock) offsetDesignBlock(titleBlock, 0, extra / 2);
      for (const b of designBlocks) offsetDesignBlock(b, 0, extra / 2);
      if (fromBlock) offsetDesignBlock(fromBlock, 0, extra / 2);
      if (continuesBlock) offsetDesignBlock(continuesBlock, 0, extra / 2);
      for (const blk of childBlocks) offsetBlock(blk, 0, extra / 2);
      for (const r of groupRules) offsetDesignBlock(r, 0, extra / 2);
      for (const g of groupLayouts) g.top += extra / 2;
    }
    contentBottom += extra;
  }
  // A frame's exact height (#855): the box is drawn that tall, the
  // content placed in it as `verticalAlign` says; content taller than the
  // room runs past the foot.
  let overflowPx: number | undefined;
  if (input.boxHeight !== undefined) {
    const room = Math.max(innerTop, input.boxHeight - riseAhead - dropAhead - padB);
    if (contentBottom < room - 0.01) {
      const extra = room - contentBottom;
      const align = input.verticalAlign ?? 'top';
      if (align === 'middle' || align === 'bottom') {
        const dy = align === 'middle' ? extra / 2 : extra;
        for (const blk of childBlocks) offsetBlock(blk, 0, dy);
        for (const r of groupRules) offsetDesignBlock(r, 0, dy);
        for (const g of groupLayouts) g.top += dy;
        if (continuesBlock) offsetDesignBlock(continuesBlock, 0, dy);
      } else if (align === 'justify' && units.length > 1) {
        units.forEach((u, i) => {
          const dy = (extra * i) / (units.length - 1);
          if (dy <= 0) return;
          const moved = u.kind === 'block' ? [u.block] : [u.box.result.frame, ...u.box.result.children];
          for (const blk of moved) offsetBlock(blk, 0, dy);
        });
      }
    } else if (contentBottom > room + 0.01) {
      overflowPx = contentBottom - room;
    }
    contentBottom = room;
  }
  const boxHeight = contentBottom + padB;
  const innerRect = createBoundingBox(innerX, innerTop, innerWidth, Math.max(0, contentBottom - innerTop));

  const {
    borderOn, radii, sides, boxShapeAt, boxPainted
  } = createBoxDecoration({
    input, style, ctx, px, padR, padL, stripeOn, stripeW, sideStripe, stripeLeft, topStripe, hasIcon,
    iconSize, iconBoxW, cornerIcon, cornerRight, iconColumn, cornerIconW, innerX, innerTop, boxWidth,
    innerWidth, overlayBlocks, groupRules, highlights, contentBottom, boxHeight, boxState
  });
  overlayBlocks.push(...designBlocks);
  if (titleBlock) overlayBlocks.push(titleBlock);
  if (fromBlock) overlayBlocks.push(fromBlock);
  if (continuesBlock) overlayBlocks.push(continuesBlock);

  createLabelTab({
    style, ctx, dpi, em, px, labelText, directText, boxSide, labelShown, labelAtFoot, labelJoined,
    boxWidth, overlayBlocks, boxHeight, borderOn, radii, sides, boxShapeAt, boxPainted, boxState
  });

  const {
    width, frameHeight, overlay
  } = createMarkerColumn({
    style, ctx, px, hasMarker, markerSize, ruleOn, ruleW, markerColumn, boxWidth, overlayBlocks,
    childBlocks, groupLayouts, boxHeight, innerRect, boxState
  });

  // --- Frame block -------------------------------------------------------------
  const frame = createVDTBlock(frameId, 'callout', bodyStyle.fontString, bodyStyle.color, bodyStyle.textAlign);
  frame.bbox = createBoundingBox(0, 0, width, frameHeight);
  frame.lines = [];
  frame.dirty = false;
  frame.snappedToGrid = false;
  frame.containerId = containerId;
  if (nestPath) frame.calloutPath = [...nestPath];
  frame.designOverlay = overlay;
  frame.callout = {
    styleId: style.id,
    span,
    placement,
    innerRect,
    childIds: childBlocks.map((b) => b.id),
    iconFileId: boxState.iconFileId,
    iconFormat: boxState.iconFormat,
    markerFileId: boxState.markerFileId,
    markerFormat: boxState.markerFormat,
    ...(attrs.turn === '180' ? { turned: true as const } : {}),
  };

  return {
    frame,
    children: childBlocks,
    units,
    width,
    totalHeight: frameHeight,
    // A main-flow group's box takes the space its fence asks for in place
    // of its style's (`wrapFlowColumns` copies the attributes, #714).
    marginTopPx: (flowGroupBox ? fenceMarginPx(attrs.marginTop, em, dpi) : undefined) ?? px(style.marginTop),
    marginBottomPx: (flowGroupBox ? fenceMarginPx(attrs.marginBottom, em, dpi) : undefined) ?? px(style.marginBottom),
    continuesMarkerPx,
    ...(overflowPx !== undefined ? { overflowPx } : {}),
    ...(groupLayouts.length > 0 ? { groups: groupLayouts } : {}),
  };
}
