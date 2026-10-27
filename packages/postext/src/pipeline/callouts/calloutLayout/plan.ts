// The callout pre-pass (box ranges by start marker, the style each box
// picks) and the resolved configuration a box's text is set with
// (#1276: split out of calloutLayout.ts).
import type { DirectiveAttrs, ContentBlock } from '../../../parse/index.js';
import type { ResolvedCalloutStyleConfig } from '../../../types.js';
import type { ResolvedConfig } from '../../../vdt.js';
import { resolveBodyStyle, resolveBlockquoteStyle } from '../../styles.js';
import { computeLevelIndentsPx, computeOrderedLevelIndentsPx } from '../../text/lists.js';
import type { BlockMeasureContext } from '../../blocks/measureContentBlock.js';
import { isFlowColumnsStyle } from '../../columns/flowColumns.js';
import { FRAME_STYLE_ID } from '../../../composed/wrap.js';

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
 *  first configured style (`collectContentWarnings` reports an unknown type
 *  in `doc.contentWarnings`). */
export function pickCalloutStyle(
  styles: readonly ResolvedCalloutStyleConfig[],
  type: string | undefined,
): ResolvedCalloutStyleConfig | undefined {
  if (styles.length === 0) return undefined;
  if (type) {
    const match = styles.find((s) => s.id === type);
    if (match) return match;
  }
  // The build's own boxes (page-span embeds, code listings) are no style
  // an unknown type falls back to.
  return styles.find((s) => !s.id.startsWith('__postext-'));
}

// ---------------------------------------------------------------------------
// Derived config: body/list overrides folded into the resolved config.
// ---------------------------------------------------------------------------

/** Shallow copy of `resolved` whose `bodyText`, `unorderedLists` and
 *  `orderedLists` carry the callout style's `body` / `lists` overrides, so
 *  `resolveBodyStyle`, the list item resolvers and the indent cascade yield
 *  the callout typography without any callout-specific branches (the
 *  body's `italic` / `smallCaps` ride on `bodyText` for that). Child
 *  headings (rare) keep the normal heading styles. */
export function deriveCalloutResolvedConfig(
  resolved: ResolvedConfig,
  style: ResolvedCalloutStyleConfig,
): ResolvedConfig {
  // A main-flow group's box (#634) lends its blocks nothing: they are set
  // as the text around them.
  if (isFlowColumnsStyle(style.id)) return resolved;
  const { body, lists } = style;
  const ul = resolved.unorderedLists;
  const ol = resolved.orderedLists;
  // Level-specific bullets/colours only follow the override when it actually
  // differs from the general value they were resolved from — a style that
  // inherits keeps the document's per-level bullets intact (and so does one
  // that repeats the document's bullet or colour: its nested levels keep
  // their dashes).
  const bulletOverride = lists.bulletChar !== ul.bulletChar;
  const colorOverride = lists.color.hex !== ul.color.hex;
  // The numbers of ordered lists take the box's colour whenever the style
  // sets it, also to the document's bullet colour (EF-92): the ordered lists
  // have a colour of their own, which an unset `lists.color` leaves alone.
  // A resolved style without the flag (built by hand) keeps the old rule.
  const numberColorOverride = lists.colorSet === true || colorOverride;
  // The bullet's face (#1103): the style's own, else the level's. A bullet
  // size of its own sets a level whose face was only the body's in the
  // box's body face, as before; a list or level face of its own (a symbol
  // face) is kept.
  const bulletFamily = (levelFamily: string): string | undefined =>
    lists.bulletFontFamily
      ?? (lists.bulletFontSize && levelFamily === resolved.bodyText.fontFamily ? body.fontFamily : undefined);
  // List margins of the box's own (#1103), on ordered lists too; unset,
  // the document's.
  const listMargins = {
    ...(lists.marginTop ? { marginTop: lists.marginTop } : {}),
    ...(lists.marginBottom ? { marginBottom: lists.marginBottom } : {}),
  };
  // A paragraph style's unset type fields take the box's body (#1119):
  // the face, size, leading, weights and colour the style leaves to the
  // body text are the box's here. A configuration that pins the rule of
  // postext 1.51 (`paragraphStylesInBoxes: 'document'`) keeps the
  // document's.
  const boxBody = {
    fontFamily: body.fontFamily,
    fontSize: body.fontSize,
    lineHeight: body.lineHeight,
    fontWeight: body.fontWeight,
    boldFontWeight: body.boldFontWeight,
    color: body.color,
  };
  const paragraphStyles = resolved.bodyText.paragraphStylesInBoxes === 'document'
    || !resolved.paragraphStyles.some((s) => s.inheritsBody)
    ? resolved.paragraphStyles
    : resolved.paragraphStyles.map((s) => (s.inheritsBody
      ? { ...s, ...Object.fromEntries(s.inheritsBody.map((f) => [f, boxBody[f]])) }
      : s));
  return {
    ...resolved,
    paragraphStyles,
    bodyText: {
      ...resolved.bodyText,
      fontFamily: body.fontFamily,
      fontSize: body.fontSize,
      lineHeight: body.lineHeight,
      color: body.color,
      boldColor: body.boldColor ?? body.color,
      ...(body.italicColor ? { italicColor: body.italicColor } : {}),
      fontWeight: body.fontWeight,
      boldFontWeight: body.boldFontWeight,
      ...(body.italic ? { italic: true } : {}),
      ...(body.smallCaps ? { smallCaps: true } : {}),
      ...(body.letterSpacing ? { letterSpacing: body.letterSpacing } : {}),
      textAlign: body.textAlign,
      hyphenation: { ...resolved.bodyText.hyphenation, enabled: body.hyphenation },
      paragraphSpacing: body.paragraphSpacing,
      firstLineIndent: body.firstLineIndent,
      // The box's own tab stops replace the body's (#622).
      ...(body.tabStops ? { tabStops: body.tabStops } : {}),
      ...(body.tabInterval ? { tabInterval: body.tabInterval } : {}),
    },
    unorderedLists: {
      ...ul,
      bulletChar: lists.bulletChar,
      color: lists.color,
      indent: lists.indent,
      gap: lists.gap,
      itemSpacing: lists.itemSpacing,
      ...listMargins,
      levels: ul.levels.map((l) => {
        const fontFamily = bulletFamily(l.fontFamily);
        return {
          ...l,
          bulletChar: bulletOverride ? lists.bulletChar : l.bulletChar,
          color: colorOverride ? lists.color : l.color,
          ...(lists.bulletFontSize ? { fontSize: lists.bulletFontSize } : {}),
          ...(fontFamily ? { fontFamily } : {}),
          ...(lists.bulletFontWeight !== undefined ? { fontWeight: lists.bulletFontWeight } : {}),
        };
      }),
    },
    orderedLists: {
      ...ol,
      color: numberColorOverride ? lists.color : ol.color,
      indent: lists.indent,
      gap: lists.gap,
      itemSpacing: lists.itemSpacing,
      ...listMargins,
      levels: ol.levels.map((l) => ({ ...l, color: numberColorOverride ? lists.color : l.color })),
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
  // A main-flow group's box and a composed page's frameless story (#855)
  // lend their children nothing: they are set as the text around them.
  if (isFlowColumnsStyle(style.id) || style.id === FRAME_STYLE_ID) return ctx;
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
