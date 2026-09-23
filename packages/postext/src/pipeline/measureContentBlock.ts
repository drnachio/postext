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
import { resolveRefSpans, resolveSwatchSpans, shiftResourceBlockX } from './resourceLayout';
import { chipContextOf, resolveChipSpans } from './chips';
import type { ResourceNumberingMap } from './resourceNumbering';
import { measureTocBlock } from './toc';

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
  /** Tracking the text was measured with (px per glyph), when column
   *  balancing asked for it — renderers must paint the block with it. */
  letterSpacingPx?: number;
}

export interface MeasureContentBlockOptions {
  /** Column-balancing "run a paragraph long" — Knuth-Plass looseness. Left
   *  undefined for the common case so measurement cache keys are unchanged. */
  looseness?: number;
  /** Column-balancing tracking for a loose paragraph, in em per glyph
   *  (`headings.balancing.maxTracking / 1000` at most). Rich path only. */
  trackingEm?: number;
  /** Paragraph style forced by an enclosing `:::paragraphs` container. */
  styleOverride?: BlockStyle;
  /** Resource blocks: the widest a figure's image may be set, its caption
   *  keeping the column's width (`layout.fitFiguresToPage`). */
  figureMaxBodyWidth?: number;
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

  // A block of an expanded `:::toc`: title, number, leader, page label.
  if (rawBlock.toc) return measureTocBlock(rawBlock, columnWidth, ctx);

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
    // A resource narrower than its column (`placement.width`) sits in it
    // per `placement.align`.
    const rawFrac = kind.resource.placement?.width ?? kind.resourceType?.defaultPlacement?.width;
    const frac = typeof rawFrac === 'number' && rawFrac > 0 && rawFrac < 1 ? rawFrac : 1;
    const align = kind.resource.placement?.align ?? kind.resourceType?.defaultPlacement?.align ?? 'left';
    const embedWidth = columnWidth * frac;
    const { resourceBlock, measured } = runMeasurement({
      vdtType,
      rawBlock,
      contentBlock,
      style,
      measureMaxWidth: embedWidth,
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
      ...(opts?.figureMaxBodyWidth !== undefined ? { maxBodyWidth: opts.figureMaxBodyWidth } : {}),
    });
    if (!resourceBlock) return null;
    if (frac < 1) {
      const dx = (columnWidth - embedWidth) * (align === 'center' ? 0.5 : align === 'right' ? 1 : 0);
      shiftResourceBlockX(resourceBlock, dx);
    }
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

  // Inline colour swatches: a palette id resolves to its hex here.
  if (contentBlock.spans.some((s) => s.swatch)) {
    contentBlock = { ...contentBlock, spans: resolveSwatchSpans(contentBlock.spans, resolved.colorPalette) };
  }

  // Inline chips: the style resolves to a box sized against this text.
  if (contentBlock.spans.some((s) => s.chip)) {
    contentBlock = { ...contentBlock, spans: resolveChipSpans(contentBlock.spans, chipContextOf(resolved), style.fontSizePx) };
  }

  const hasRichSpans = contentBlock.spans.some((s) => s.bold || s.italic || s.mathRender || s.ref || s.swatch || s.chip || s.script);

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
  // Tracking is measured on the rich path (per-token canvas widths); left
  // undefined when unused so the common-case cache keys stay unchanged.
  const hasRichFonts = !!(style.boldFontString && style.italicFontString && style.boldItalicFontString);
  const letterSpacingPx = hasRichFonts && opts?.trackingEm ? opts.trackingEm * style.fontSizePx : 0;
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
    letterSpacingPx: letterSpacingPx !== 0 ? letterSpacingPx : undefined,
  };
  // URLs / DOIs get their bare break opportunities on the rich path only.
  const hasUrl = /(?:^|\s)(?:(?:https?|ftp):\/\/|www\.|10\.\d{4,}\/)\S/i.test(contentBlock.text);
  const useRich = hasRichFonts && (hasRichSpans || letterSpacingPx !== 0 || hasUrl);

  const first = runMeasurement({
    vdtType, rawBlock, contentBlock, style, measureMaxWidth, measureOptions, mathEnabled, useRich, cache,
  });
  const { mathDisplayRender } = first;
  let measured = first.measured;
  let trackingPx = letterSpacingPx;

  // A runt the penalty could not break up (the alternatives all cost more):
  // set the paragraph one line shorter, the way a compositor does. Tighter
  // word spacing first — every feasible break already keeps the spaces at or
  // above `minWordSpacing` — and then a little tracking, the smallest rung
  // that carries the line.
  if (measured.lastLineRunt && runtActive && resolved.bodyText.tightenRunts && opts?.looseness === undefined) {
    const target = measured.lines.length - 1;
    for (const rung of runtTrackingLadder(resolved.bodyText.maxRuntTracking, hasRichFonts)) {
      const spacing = letterSpacingPx - (rung / 1000) * style.fontSizePx;
      const attempt = runMeasurement({
        vdtType, rawBlock, contentBlock, style, measureMaxWidth, mathEnabled, cache,
        measureOptions: {
          ...measureOptions,
          looseness: -1,
          letterSpacingPx: spacing !== 0 ? spacing : undefined,
        },
        useRich: hasRichFonts && (hasRichSpans || spacing !== 0 || hasUrl),
      });
      if (attempt.measured.lines.length === target && !attempt.measured.lastLineRunt) {
        measured = attempt.measured;
        trackingPx = spacing;
        break;
      }
    }
  }

  if (measured.lines.length === 0) return null;

  if (lineXShift > 0) {
    for (const line of measured.lines) {
      line.bbox.x += lineXShift;
    }
  }

  // Per-line source-range mapping using the block's plain→source map.
  // Accounts for heading numbering prefix which prepends chars with no source.
  const { prefixLen, absoluteSourceMap } = stampSourceRanges(measured, rawBlock, contentBlock, bodyOffset);

  return {
    kind, contentBlock, measured, prefixLen, absoluteSourceMap, mathDisplayRender,
    ...(trackingPx !== 0 ? { letterSpacingPx: trackingPx } : {}),
  };
}

/** Tracking rungs a runt fix may climb, in thousandths of an em: none
 *  first — word spacing alone may carry the line — then 5‰ steps to the
 *  cap, the cap always included. Tracking is measured on the rich path, so
 *  a block without rich fonts only gets the first rung. */
function runtTrackingLadder(maxTracking: number, hasRichFonts: boolean): number[] {
  const rungs = [0];
  if (!hasRichFonts || maxTracking <= 0) return rungs;
  for (let t = 5; t < maxTracking; t += 5) rungs.push(t);
  rungs.push(maxTracking);
  return rungs;
}
