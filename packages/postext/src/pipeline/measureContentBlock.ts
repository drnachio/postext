/**
 * Per-block measurement for the placement loop: resolves a parsed content
 * block into its kind/style, enriches inline math and `:ref` spans, lays out
 * the text (or the resource group) against a column width, and stamps source
 * ranges. Pure with respect to the document — nothing here touches pages,
 * columns, or the cursor — so the main loop can re-run it freely (e.g. the
 * column-balancing "loose paragraph" re-measure) and stays focused on
 * placement decisions.
 */

import type { ContentBlock } from '../parse';
import type { Resource, ResourceType } from '../types';
import type { ResolvedResourceBlock } from '../vdt';
import type { MeasuredBlock, MeasurementCache } from '../measure';
import type { renderMath } from '../math';
import type { BlockStyle } from './styles';
import {
  computeMeasureViewport,
  enrichMathSpans,
  isMarkerBlock,
  stampSourceRanges,
} from './buildHelpers';
import { resolveBlockKind, type BlockKind, type BlockKindContext } from './buildBlockKind';
import { runMeasurement } from './buildMeasurement';
import { resolveRefSpans } from './resourceLayout';
import type { ResourceNumberingMap } from './resourceNumbering';

/** Everything `measureContentBlock` needs that is constant across one
 *  placement pass. Built once before the loop; `blockIdx` and the paragraph
 *  style override are per-call (see `measureContentBlock` arguments). */
export interface BlockMeasureContext
  extends Omit<BlockKindContext, 'blockIdx' | 'paragraphStyleOverride'> {
  /** The parsed blocks of the document — for neighbour lookaheads. */
  contentBlocks: readonly ContentBlock[];
  cache?: MeasurementCache;
  /** Source offset of the markdown body inside the original document. */
  bodyOffset: number;
  resources: Resource[];
  resourceTypes: ResourceType[];
  resourceNumbering: ResourceNumberingMap;
  /** Ids of resources that float to page bands (never placed inline). */
  floatedIds: ReadonlySet<string>;
}

export interface MeasuredContentBlock {
  kind: BlockKind;
  /** The block after math/ref enrichment — what was actually measured. */
  contentBlock: ContentBlock;
  measured: MeasuredBlock;
  /** Length of the heading-number prefix prepended to the plain text. */
  prefixLen: number;
  /** `rawBlock.sourceMap` shifted by `bodyOffset`. */
  absoluteSourceMap: number[];
  mathDisplayRender?: ReturnType<typeof renderMath>;
  /** Present for `resource` kinds: the laid-out image/table + caption group. */
  resourceBlock?: ResolvedResourceBlock;
}

export interface MeasureContentBlockOptions {
  /** Column-balancing "run a paragraph long" — Knuth-Plass looseness. Left
   *  undefined for the common case so measurement cache keys are unchanged. */
  looseness?: number;
  /** Paragraph style forced by an enclosing `:::paragraphs` container. */
  styleOverride?: BlockStyle;
}

/**
 * Resolve and measure one content block at `columnWidth`. Returns `null` when
 * there is nothing to place inline: empty text, an unknown resource id, or a
 * resource that floats to a page band.
 */
export function measureContentBlock(
  rawBlock: ContentBlock,
  blockIdx: number,
  columnWidth: number,
  ctx: BlockMeasureContext,
  opts?: MeasureContentBlockOptions,
): MeasuredContentBlock | null {
  const { resolved, bodyStyle, contentBlocks, cache, bodyOffset } = ctx;

  const kind = resolveBlockKind(rawBlock, {
    ...ctx,
    blockIdx,
    paragraphStyleOverride: opts?.styleOverride,
  });
  const { style, vdtType, listBullet } = kind;
  let contentBlock = kind.contentBlock;
  const mathEnabled = resolved.math.enabled;

  // --- Resource blocks (image / svg / table + caption) -----------------
  // Laid out as one atomic group. Unknown ids produce nothing (the warnings
  // phase surfaces them); floated resources are anchored by their directive
  // but land in a page band, so they are never measured inline.
  if (vdtType === 'resource') {
    if (!kind.resource || ctx.floatedIds.has(kind.resource.id)) return null;
    const { resourceBlock, measured } = runMeasurement({
      vdtType,
      rawBlock,
      contentBlock,
      style,
      measureMaxWidth: columnWidth,
      measureOptions: { textAlign: style.textAlign },
      mathEnabled,
      useRich: false,
      resolved,
      resources: ctx.resources,
      resourceTypes: ctx.resourceTypes,
      resourceNumbering: ctx.resourceNumbering,
      resource: kind.resource,
      resourceType: kind.resourceType,
      resourceNumber: kind.resourceNumber,
    });
    if (!resourceBlock) return null;
    return { kind, contentBlock, measured, prefixLen: 0, absoluteSourceMap: [], resourceBlock };
  }

  // Resolve inline math on spans (no-op when the block has no math).
  contentBlock = enrichMathSpans(contentBlock, style, resolved);

  // Resolve inline `:ref{…}` spans to their computed label so references
  // print their number in the running text. Each label becomes one atomic,
  // non-breaking token tagged with its `refResourceId` (handled by the
  // rich-text measurer), so we always take the rich path for ref blocks.
  if (contentBlock.spans.some((s) => s.ref)) {
    contentBlock = {
      ...contentBlock,
      spans: resolveRefSpans(contentBlock.spans, ctx.resourceNumbering, ctx.resourceTypes, ctx.resources, {
        bold: bodyStyle.referenceBold ?? true,
        italic: bodyStyle.referenceItalic ?? false,
      }),
    };
  }

  const hasRichSpans = contentBlock.spans.some((s) => s.bold || s.italic || s.mathRender || s.ref);

  // List items reserve horizontal space for indent + bullet + gap.
  const {
    measureMaxWidth,
    lineXShift,
    measureFirstLineIndent,
    measureHangingIndent,
  } = computeMeasureViewport(columnWidth, style, listBullet);

  // First-paragraph-after-heading: typographic convention used in many
  // scientific publications and book styles where the paragraph that
  // immediately follows a heading is rendered without first-line indent.
  // Only applies to regular paragraphs without hanging indent; list items
  // and hanging-indent paragraphs are unaffected.
  let effectiveFirstLineIndent = measureFirstLineIndent;
  if (
    vdtType === 'paragraph'
    && !resolved.bodyText.indentAfterHeading
    && !style.hangingIndent
    && blockIdx > 0
  ) {
    let prevIdx = blockIdx - 1;
    while (
      prevIdx >= 0
      && (contentBlocks[prevIdx]!.type === 'directive' || isMarkerBlock(contentBlocks[prevIdx]))
    ) prevIdx--;
    if (prevIdx >= 0 && contentBlocks[prevIdx]!.type === 'heading') {
      effectiveFirstLineIndent = 0;
    }
  }

  const runtActive = resolved.bodyText.avoidRunts
    && (vdtType === 'paragraph'
      || (vdtType === 'listItem' && resolved.bodyText.avoidRuntsInLists));
  const measureOptions = {
    textAlign: style.textAlign,
    hyphenate: style.hyphenate,
    firstLineIndentPx: effectiveFirstLineIndent,
    hangingIndent: measureHangingIndent,
    optimal: resolved.bodyText.optimalLineBreaking,
    maxStretchRatio: resolved.bodyText.maxWordSpacing,
    minShrinkRatio: resolved.bodyText.minWordSpacing,
    runtPenalty: runtActive ? resolved.bodyText.runtPenalty : 0,
    runtMinCharacters: runtActive ? resolved.bodyText.runtMinCharacters : 0,
    looseness: opts?.looseness,
  };
  const useRich = !!(hasRichSpans && style.boldFontString && style.italicFontString && style.boldItalicFontString);

  const { measured, mathDisplayRender } = runMeasurement({
    vdtType, rawBlock, contentBlock, style, measureMaxWidth, measureOptions, mathEnabled, useRich, cache,
  });

  if (measured.lines.length === 0) return null;

  if (lineXShift > 0) {
    for (const line of measured.lines) {
      line.bbox.x += lineXShift;
    }
  }

  // Per-line source-range mapping using the block's plain→source map.
  // Accounts for heading numbering prefix which prepends chars with no source.
  const { prefixLen, absoluteSourceMap } = stampSourceRanges(measured, rawBlock, contentBlock, bodyOffset);

  return { kind, contentBlock, measured, prefixLen, absoluteSourceMap, mathDisplayRender };
}
