/**
 * `:::callout{type="…"}` containers — boxed content (notes, tips, warnings,
 * objectives) styled by a `CalloutStyleConfig`.
 *
 * `layoutCallout` lays out one callout — decoration frame, optional title
 * and the child blocks — against a given width, in block-relative
 * coordinates (frame origin = `(0,0)`). It is pure in `width`, so the
 * placement code can re-run it when a callout lands in a column of a
 * different width, and the pagination phase (`spanBlocks`) can run it at
 * page width for `span: 'page'` boxes. `offsetCalloutToAbsolute` then moves
 * the whole result to its final page position.
 *
 * Children are measured with the ordinary per-block measurer against a
 * *derived* resolved config (`deriveCalloutResolvedConfig`) whose body text
 * and list sections carry the style's `body` / `lists` overrides, so the
 * existing style resolvers produce the callout typography unchanged.
 *
 * v1 limits: callouts never split (`keepTogether` is always on); nested
 * `:::callout` fences inside a callout are flattened into the outer box;
 * `width: 'auto'` shrink-wraps the title only and ignores the children.
 */

import type { ContentBlock, DirectiveAttrs } from '../parse';
import type {
  CalloutPlacement,
  CalloutSpan,
  Dimension,
  ResolvedCalloutStyleConfig,
} from '../types';
import { dimensionToPx } from '../units';
import {
  createBoundingBox,
  createVDTBlock,
  type ResolvedConfig,
  type ResolvedResourceBlock,
  type VDTBlock,
  type VDTDesignBlock,
  type VDTDesignSlot,
  type VDTDesignTextBlock,
} from '../vdt';
import { buildFontString, measureBlock, measureTextWidth } from '../measure';
import { applyStyleAttrs, isMarkerBlock } from './buildHelpers';
import { resetLinePositions } from './placement';
import { resolveBodyStyle, resolveBlockquoteStyle, type BlockStyle } from './styles';
import { computeLevelIndentsPx, computeOrderedLevelIndentsPx } from './lists';
import { measureContentBlock, type BlockMeasureContext } from './measureContentBlock';
import { uppercasePreservingLength } from './buildBlockKind';

// ---------------------------------------------------------------------------
// Pre-pass: callout ranges keyed by the start marker's content-block index.
// ---------------------------------------------------------------------------

export interface PlannedCallout {
  /** Index of the matching `containerEnd` marker. */
  endIdx: number;
  /** Attributes parsed from the opening fence. */
  attrs: DirectiveAttrs;
  /** Parser `containerId` shared by the marker pair. */
  containerId: number;
}

/** Map every `containerStart{callout}` index to its range. Resolved up front
 *  (like `:::paragraphs`) because keep-with-next rollbacks rewind the
 *  placement loop and replay blocks. Unclosed containers are auto-closed by
 *  the parser, so every start has an end. */
export function planCallouts(contentBlocks: readonly ContentBlock[]): Map<number, PlannedCallout> {
  const plan = new Map<number, PlannedCallout>();
  const openByIdx = new Map<number, number>(); // containerId → startIdx
  for (let i = 0; i < contentBlocks.length; i++) {
    const b = contentBlocks[i]!;
    if (b.containerName !== 'callout' || b.containerId === undefined) continue;
    if (b.type === 'containerStart') {
      openByIdx.set(b.containerId, i);
    } else if (b.type === 'containerEnd') {
      const startIdx = openByIdx.get(b.containerId);
      if (startIdx === undefined) continue;
      openByIdx.delete(b.containerId);
      const start = contentBlocks[startIdx]!;
      plan.set(startIdx, { endIdx: i, attrs: start.containerAttrs ?? {}, containerId: b.containerId });
    }
  }
  return plan;
}

/** The style a `:::callout{type="…"}` selects: the matching id, else the
 *  first configured style (the sandbox flags unknown types as a warning). */
export function pickCalloutStyle(
  styles: readonly ResolvedCalloutStyleConfig[],
  type: string | undefined,
): ResolvedCalloutStyleConfig | undefined {
  if (styles.length === 0) return undefined;
  if (type) {
    const match = styles.find((s) => s.id === type);
    if (match) return match;
  }
  return styles[0];
}

// ---------------------------------------------------------------------------
// Derived config: body/list overrides folded into the resolved config.
// ---------------------------------------------------------------------------

/** Shallow copy of `resolved` whose `bodyText`, `unorderedLists` and
 *  `orderedLists` carry the callout style's `body` / `lists` overrides, so
 *  `resolveBodyStyle`, the list item resolvers and the indent cascade yield
 *  the callout typography without any callout-specific branches. Child
 *  headings (rare) keep the normal heading styles. */
export function deriveCalloutResolvedConfig(
  resolved: ResolvedConfig,
  style: ResolvedCalloutStyleConfig,
): ResolvedConfig {
  const { body, lists } = style;
  const ul = resolved.unorderedLists;
  const ol = resolved.orderedLists;
  // Level-specific bullets/colours only follow the override when it actually
  // differs from the general value they were resolved from — a style that
  // inherits keeps the document's per-level bullets intact.
  const bulletOverride = lists.bulletChar !== ul.bulletChar;
  const colorOverride = lists.color.hex !== ul.color.hex;
  return {
    ...resolved,
    bodyText: {
      ...resolved.bodyText,
      fontFamily: body.fontFamily,
      fontSize: body.fontSize,
      lineHeight: body.lineHeight,
      color: body.color,
      textAlign: body.textAlign,
      hyphenation: { ...resolved.bodyText.hyphenation, enabled: body.hyphenation },
      paragraphSpacing: body.paragraphSpacing,
      firstLineIndent: body.firstLineIndent,
    },
    unorderedLists: {
      ...ul,
      bulletChar: lists.bulletChar,
      color: lists.color,
      indent: lists.indent,
      gap: lists.gap,
      itemSpacing: lists.itemSpacing,
      levels: ul.levels.map((l) => ({
        ...l,
        bulletChar: bulletOverride ? lists.bulletChar : l.bulletChar,
        color: colorOverride ? lists.color : l.color,
      })),
    },
    orderedLists: {
      ...ol,
      color: colorOverride ? lists.color : ol.color,
      indent: lists.indent,
      gap: lists.gap,
      itemSpacing: lists.itemSpacing,
      levels: ol.levels.map((l) => ({ ...l, color: colorOverride ? lists.color : l.color })),
    },
  };
}

/** Measurement context for the children: the derived config plus the body
 *  / blockquote styles and list indents recomputed from it. Ordered-list run
 *  metrics (number widths) are kept from the document context — they were
 *  measured with the document's list font, a close-enough approximation. */
export function deriveCalloutMeasureContext(
  ctx: BlockMeasureContext,
  style: ResolvedCalloutStyleConfig,
): BlockMeasureContext {
  const resolved = deriveCalloutResolvedConfig(ctx.resolved, style);
  const bodyStyle = resolveBodyStyle(resolved);
  return {
    ...ctx,
    resolved,
    bodyStyle,
    blockquoteStyle: resolveBlockquoteStyle(resolved),
    listLevelIndentsPx: computeLevelIndentsPx(resolved, bodyStyle.fontSizePx),
    orderedLevelIndentsPx: computeOrderedLevelIndentsPx(
      resolved,
      bodyStyle.fontSizePx,
      ctx.orderedMetrics.maxWidthByDepth,
    ),
  };
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export interface CalloutLayoutInput {
  style: ResolvedCalloutStyleConfig;
  /** Fence attributes (`type`, `title`, `span`, `placement`). */
  attrs: DirectiveAttrs;
  /** Content blocks between the markers (marker blocks of nested containers
   *  are skipped). */
  children: readonly ContentBlock[];
  /** Content-block index of `children[0]` — children keep their real index
   *  so neighbour lookups (indent-after-heading, list runs) work. */
  childStartIdx: number;
  /** Frame width to lay out against (column or page width). */
  width: number;
  ctx: BlockMeasureContext;
  resolved: ResolvedConfig;
  /** Parser `containerId` of the fence pair, stamped on the frame and children. */
  containerId: number;
  /** Block ids: the frame's own id and a generator for the children. */
  frameId: string;
  nextChildId: () => string;
  /** Optional paragraph-style override per child index (nested
   *  `:::paragraphs` containers). */
  paragraphStyleFor?: (blockIdx: number) => BlockStyle | undefined;
  /** Source offset of the markdown body inside the original document. */
  bodyOffset?: number;
}

export interface CalloutLayoutResult {
  /** The frame block (`type: 'callout'`); decoration on `designOverlay`. */
  frame: VDTBlock;
  /** Content blocks in reading order, block-relative to the frame origin. */
  children: VDTBlock[];
  /** Frame width actually used (`width`, or the shrink-wrapped width for
   *  `width: 'auto'`). */
  width: number;
  totalHeight: number;
  /** Top margin in px (applied by the caller through pending spacing). */
  marginTopPx: number;
  /** Bottom margin in px (baked into the post-callout grid snap). */
  marginBottomPx: number;
}

const VALID_SPANS: ReadonlySet<string> = new Set(['column', 'page']);
const VALID_PLACEMENTS: ReadonlySet<string> = new Set(['here', 'top', 'bottom', 'fixed']);

/** Per-instance span / placement: fence attribute when valid, else the style. */
export function resolveCalloutAttrs(
  style: ResolvedCalloutStyleConfig,
  attrs: DirectiveAttrs,
): { span: CalloutSpan; placement: CalloutPlacement; title: string } {
  const span = attrs.span !== undefined && VALID_SPANS.has(attrs.span)
    ? (attrs.span as CalloutSpan)
    : style.span;
  const placement = attrs.placement !== undefined && VALID_PLACEMENTS.has(attrs.placement)
    ? (attrs.placement as CalloutPlacement)
    : style.placement;
  const title = attrs.title !== undefined ? attrs.title : style.title;
  return { span, placement, title };
}

/** Shift a resolved resource block's caption/table geometry by `(ox, oy)`. */
function offsetResourceBlock(rb: ResolvedResourceBlock, ox: number, oy: number): void {
  for (const ln of rb.captionLines) { ln.bbox.x += ox; ln.bbox.y += oy; ln.baseline += oy; }
  for (const ln of rb.noteLines) { ln.bbox.x += ox; ln.bbox.y += oy; ln.baseline += oy; }
  if (rb.captionBar) { rb.captionBar.rect.x += ox; rb.captionBar.rect.y += oy; }
  if (rb.table) {
    for (const cell of rb.table.cells) {
      cell.rect.x += ox; cell.rect.y += oy;
      for (const cl of cell.lines) { cl.bbox.x += ox; cl.bbox.y += oy; cl.baseline += oy; }
    }
  }
}

/** Shift one block (lines, bullet, resource geometry) by `(ox, oy)`. */
function offsetBlock(blk: VDTBlock, ox: number, oy: number): void {
  blk.bbox.x += ox;
  blk.bbox.y += oy;
  for (const line of blk.lines) {
    line.bbox.x += ox;
    line.bbox.y += oy;
    line.baseline += oy;
  }
  if (blk.bulletOffsetX !== undefined) blk.bulletOffsetX += ox;
  if (blk.separatorX !== undefined) blk.separatorX += ox;
  if (blk.bulletY !== undefined) blk.bulletY += oy;
  if (blk.resourceBlock) offsetResourceBlock(blk.resourceBlock, ox, oy);
}

function offsetDesignBlock(b: VDTDesignBlock, ox: number, oy: number): void {
  b.bbox.x += ox;
  b.bbox.y += oy;
  if (b.kind === 'text') {
    for (const line of b.lines) line.baselineY += oy;
  }
}

/** Move a laid-out callout from frame-relative to absolute page coordinates
 *  with the frame's top-left at `(x, y)`. */
export function offsetCalloutToAbsolute(result: CalloutLayoutResult, x: number, y: number): void {
  const { frame } = result;
  frame.bbox = createBoundingBox(x, y, result.width, result.totalHeight);
  if (frame.designOverlay) {
    frame.designOverlay.bbox.x += x;
    frame.designOverlay.bbox.y += y;
    for (const b of frame.designOverlay.blocks) offsetDesignBlock(b, x, y);
  }
  for (const child of result.children) offsetBlock(child, x, y);
}

/**
 * Lay out one callout at `width`. Everything is frame-relative; see
 * {@link offsetCalloutToAbsolute}.
 */
export function layoutCallout(input: CalloutLayoutInput): CalloutLayoutResult {
  const { style, attrs, children, childStartIdx, ctx, containerId, frameId } = input;
  const dpi = input.resolved.page.dpi;
  const derivedCtx = deriveCalloutMeasureContext(ctx, style);
  const bodyStyle = derivedCtx.bodyStyle;
  const em = bodyStyle.fontSizePx;
  const px = (d: Dimension): number => dimensionToPx(d, dpi, em);

  const { span, placement, title: rawTitle } = resolveCalloutAttrs(style, attrs);
  const isAuto = style.width === 'auto';

  // --- Frame geometry ------------------------------------------------------
  const padT = px(style.padding.top);
  const padR = px(style.padding.right);
  const padB = px(style.padding.bottom);
  const padL = px(style.padding.left);
  const stripeOn = style.stripe.enabled;
  const stripeW = stripeOn ? px(style.stripe.width) : 0;
  const sideStripe = stripeOn && style.stripe.side !== 'top';
  const stripeLeft = sideStripe && style.stripe.side === 'left';
  const stripeRight = sideStripe && style.stripe.side === 'right';
  const topStripe = stripeOn && style.stripe.side === 'top';

  const hasIcon = style.icon.kind !== 'none'
    && (style.icon.kind === 'glyph' ? style.icon.glyph.length > 0 : style.icon.resourceId.length > 0);
  const iconSize = hasIcon ? px(style.icon.size) : 0;
  const gapPx = px(style.titleStyle.gap);
  // The icon takes its own column only when there is no side stripe to sit
  // over.
  const iconColumn = hasIcon && !sideStripe ? iconSize + gapPx : 0;

  const innerX = (stripeLeft ? stripeW : 0) + padL + iconColumn;
  const innerTop = (topStripe ? stripeW : 0) + padT;

  // --- Title -----------------------------------------------------------------
  const titleText = style.titleStyle.textTransform === 'uppercase'
    ? uppercasePreservingLength(rawTitle)
    : rawTitle;
  const titleFontPx = dimensionToPx(style.titleStyle.fontSize, dpi, em);
  const titleFont = buildFontString(
    style.titleStyle.fontFamily,
    titleFontPx,
    style.titleStyle.fontWeight.toString(),
    style.titleStyle.italic ? 'italic' : 'normal',
  );
  const titleLineHeight = titleFontPx * 1.2;
  const hasTitle = titleText.trim().length > 0;

  // Frame width: `fill` uses the given width; `auto` shrink-wraps the title.
  let width = input.width;
  let innerWidth: number;
  if (isAuto) {
    const titleW = hasTitle ? measureTextWidth(titleText, titleFont) : 0;
    innerWidth = Math.max(1, titleW);
    width = innerX + innerWidth + padR + (stripeRight ? stripeW : 0);
  } else {
    innerWidth = Math.max(1, width - innerX - padR - (stripeRight ? stripeW : 0));
  }

  let cursorY = innerTop;
  const overlayBlocks: VDTDesignBlock[] = [];
  let titleBlock: VDTDesignTextBlock | undefined;
  if (hasTitle) {
    const measured = measureBlock(titleText, titleFont, innerWidth, titleLineHeight, { textAlign: 'left' });
    const lines = measured.lines.length > 0
      ? measured.lines
      : [{ text: titleText, bbox: createBoundingBox(0, 0, innerWidth, titleLineHeight), baseline: titleLineHeight * 0.8, hyphenated: false }];
    const titleHeight = lines.length * titleLineHeight;
    titleBlock = {
      kind: 'text',
      bbox: createBoundingBox(innerX, cursorY, innerWidth, titleHeight),
      fontString: titleFont,
      color: style.titleStyle.color.hex,
      lines: lines.map((ln, i) => ({
        text: ln.text,
        xOffset: 0,
        baselineY: cursorY + i * titleLineHeight + titleLineHeight * 0.8,
        width: ln.bbox.width,
      })),
      clip: false,
    };
    cursorY += titleHeight;
  }

  // --- Children --------------------------------------------------------------
  const childBlocks: VDTBlock[] = [];
  if (!isAuto) {
    let prevMarginBottom = hasTitle ? gapPx : 0;
    let prevWasListItem = false;
    let first = true;
    for (let k = 0; k < children.length; k++) {
      const raw = children[k]!;
      const blockIdx = childStartIdx + k;
      if (raw.type === 'directive' || isMarkerBlock(raw)) continue;
      const measuredBlock = measureContentBlock(raw, blockIdx, innerWidth, derivedCtx, {
        styleOverride: input.paragraphStyleFor?.(blockIdx),
      });
      if (!measuredBlock) continue;
      const { kind, measured, prefixLen, absoluteSourceMap, mathDisplayRender, resourceBlock } = measuredBlock;
      const { style: bs, vdtType, headingLevel, numberPrefix, listBullet, listDepth, listKind, bulletXOffsetInColumn, strikethroughText } = kind;

      // Spacing above: margin collapsing, list-item spacing inside a run.
      let spacing: number;
      if (first) {
        spacing = prevMarginBottom;
      } else if (vdtType === 'listItem' && prevWasListItem) {
        spacing = listBullet ? listBullet.itemSpacingPx : 0;
      } else {
        spacing = Math.max(prevMarginBottom, bs.marginTopPx);
      }
      cursorY += spacing;

      const blk = createVDTBlock(input.nextChildId(), vdtType, bs.fontString, bs.color, bs.textAlign);
      applyStyleAttrs(blk, bs);
      blk.contentIndex = blockIdx;
      blk.containerId = containerId;
      blk.dirty = false;
      blk.snappedToGrid = false;
      blk.headingLevel = headingLevel;
      if (numberPrefix) blk.numberPrefix = numberPrefix;
      blk.sourceMap = absoluteSourceMap;
      blk.plainPrefixLen = prefixLen;

      let height: number;
      if (vdtType === 'resource' && resourceBlock) {
        height = measured.totalHeight;
        blk.resourceBlock = resourceBlock;
        blk.lines = [{
          text: '',
          bbox: createBoundingBox(0, 0, resourceBlock.bodyRect.width, height),
          baseline: 0,
          hyphenated: false,
          segments: [],
          isLastLine: true,
        }];
        blk.sourceStart = raw.sourceStart + (input.bodyOffset ?? ctx.bodyOffset);
        blk.sourceEnd = raw.sourceEnd + (input.bodyOffset ?? ctx.bodyOffset);
      } else if (vdtType === 'mathDisplay' && mathDisplayRender) {
        blk.mathRender = mathDisplayRender;
        blk.tex = raw.tex;
        const mathLine = { ...measured.lines[0]!, bbox: { ...measured.lines[0]!.bbox, y: 0 } };
        blk.lines = [mathLine];
        height = mathLine.bbox.height;
        blk.sourceStart = raw.sourceStart + ctx.bodyOffset;
        blk.sourceEnd = raw.sourceEnd + ctx.bodyOffset;
      } else {
        blk.lines = resetLinePositions(measured.lines, bs.lineHeightPx);
        height = blk.lines.length * bs.lineHeightPx;
        blk.sourceStart = measured.lines[0]!.sourceStart ?? raw.sourceStart + ctx.bodyOffset;
        blk.sourceEnd = measured.lines[measured.lines.length - 1]!.sourceEnd ?? raw.sourceEnd + ctx.bodyOffset;
      }

      // Relocate to the inner rect (frame-relative).
      blk.bbox = createBoundingBox(innerX, cursorY, innerWidth, height);
      for (const line of blk.lines) {
        line.bbox.x += innerX;
        line.bbox.y += cursorY;
        line.baseline += cursorY;
      }
      if (blk.resourceBlock) offsetResourceBlock(blk.resourceBlock, innerX, cursorY);

      if (listBullet) {
        blk.listDepth = listDepth;
        blk.listKind = listKind;
        blk.bulletText = listBullet.bulletText;
        blk.bulletFontString = listBullet.bulletFontString;
        blk.bulletColor = listBullet.bulletColor;
        blk.bulletOffsetX = innerX + bulletXOffsetInColumn;
        if (listBullet.separatorText !== undefined) {
          blk.separatorText = listBullet.separatorText;
          blk.separatorFontString = listBullet.separatorFontString;
          blk.separatorColor = listBullet.separatorColor;
          blk.separatorX = blk.bulletOffsetX + (listBullet.separatorOffsetPx ?? 0);
        }
        if (strikethroughText) blk.strikethroughText = true;
        const firstLine = blk.lines[0];
        if (firstLine) {
          blk.bulletY = firstLine.baseline - listBullet.textFontSizePx * 0.3 + listBullet.verticalOffsetPx;
        }
      }

      childBlocks.push(blk);
      cursorY += height;
      prevMarginBottom = bs.marginBottomPx;
      prevWasListItem = vdtType === 'listItem';
      first = false;
    }
  }

  const contentBottom = cursorY;
  const totalHeight = contentBottom + padB;
  const innerRect = createBoundingBox(innerX, innerTop, innerWidth, Math.max(0, contentBottom - innerTop));

  // --- Decoration (paint order: background, stripe, icon, title) -------------
  const overlay: VDTDesignSlot = { bbox: createBoundingBox(0, 0, width, totalHeight), blocks: overlayBlocks };
  const borderOn = style.border.enabled;
  if (style.backgroundEnabled || borderOn) {
    overlayBlocks.push({
      kind: 'box',
      bbox: createBoundingBox(0, 0, width, totalHeight),
      box: {
        backgroundColor: style.backgroundEnabled ? style.background.hex : undefined,
        borderColor: borderOn ? style.border.color.hex : undefined,
        borderWidthPx: borderOn ? px(style.border.width) : 0,
        borderRadiusPx: px(style.borderRadius),
      },
    });
  }
  if (stripeOn) {
    const stripeBox = topStripe
      ? createBoundingBox(0, 0, width, stripeW)
      : stripeLeft
        ? createBoundingBox(0, 0, stripeW, totalHeight)
        : createBoundingBox(width - stripeW, 0, stripeW, totalHeight);
    overlayBlocks.push({
      kind: 'box',
      bbox: stripeBox,
      box: { backgroundColor: style.stripe.color.hex, borderWidthPx: 0, borderRadiusPx: 0 },
    });
  }
  let iconFileId: string | undefined;
  let iconFormat: string | undefined;
  if (hasIcon) {
    // Over a side stripe the icon is centred on the stripe; otherwise it
    // sits in its own column left of the content.
    const iconX = sideStripe
      ? (stripeLeft ? (stripeW - iconSize) / 2 : width - stripeW + (stripeW - iconSize) / 2)
      : innerX - iconColumn;
    const iconY = style.icon.align === 'center'
      ? innerTop + Math.max(0, (contentBottom - innerTop - iconSize) / 2)
      : innerTop;
    const iconBox = createBoundingBox(iconX, iconY, iconSize, iconSize);
    if (style.icon.kind === 'resource') {
      const resource = ctx.resourceById.get(style.icon.resourceId);
      const fileId = resource?.bitmap?.fileId ?? resource?.svg?.fileId;
      if (fileId) {
        iconFileId = fileId;
        iconFormat = resource?.bitmap?.format;
        overlayBlocks.push({ kind: 'image', bbox: iconBox, fileId });
      }
    } else {
      const iconFont = buildFontString(style.icon.fontFamily, iconSize, style.icon.fontWeight.toString());
      const glyphW = measureTextWidth(style.icon.glyph, iconFont);
      overlayBlocks.push({
        kind: 'text',
        bbox: iconBox,
        fontString: iconFont,
        color: style.icon.color.hex,
        lines: [{
          text: style.icon.glyph,
          xOffset: Math.max(0, (iconSize - glyphW) / 2),
          baselineY: iconY + iconSize * 0.8,
          width: glyphW,
        }],
        clip: false,
      });
    }
  }
  if (titleBlock) overlayBlocks.push(titleBlock);

  // --- Frame block -------------------------------------------------------------
  const frame = createVDTBlock(frameId, 'callout', bodyStyle.fontString, bodyStyle.color, bodyStyle.textAlign);
  frame.bbox = createBoundingBox(0, 0, width, totalHeight);
  frame.lines = [];
  frame.dirty = false;
  frame.snappedToGrid = false;
  frame.containerId = containerId;
  frame.designOverlay = overlay;
  frame.callout = {
    styleId: style.id,
    span,
    placement,
    innerRect,
    childIds: childBlocks.map((b) => b.id),
    iconFileId,
    iconFormat,
  };

  return {
    frame,
    children: childBlocks,
    width,
    totalHeight,
    marginTopPx: px(style.marginTop),
    marginBottomPx: px(style.marginBottom),
  };
}
