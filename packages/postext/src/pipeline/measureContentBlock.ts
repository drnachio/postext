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
import type { ResolvedResourceBlock, VDTLine } from '../vdt';
import type { BreakTrace, MeasuredBlock, MeasurementCache } from '../measure';
import type { renderMath } from '../math';
import type { BlockStyle } from './styles';
import {
  computeMeasureViewport,
  enrichMathSpans,
  isMarkerBlock,
  stampSourceRanges,
} from './buildHelpers';
import { resolveBlockKind, uppercasePreservingLength, type BlockKind, type BlockKindContext } from './buildBlockKind';
import { runMeasurement } from './buildMeasurement';
import { linkSegments } from '../measure/links';
import { composesAsCjk } from '../measure/cjkCompose';
import { measuringVertically } from '../measure/vertical';
import { resolveRefSpans, resolveSwatchSpans, shiftResourceBlockX, type AnchorRefContext } from './resourceLayout';
import { chipContextOf, resolveChipSpans } from './chips';
import { hasAnnotations, resolveAnnotationSpans } from './annotations';
import type { ResourceNumberingMap } from './resourceNumbering';
import { measureTocBlock } from './toc';
import { measureIndexBlock } from './indexDirective';
import { LINE_MAX_SPACE_RATIO } from './raggedLines';
import { dimensionToPx } from '../units';

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
  /** The markdown body the blocks' source offsets index (before
   *  `bodyOffset`): lines read it to start at the backslash of an escape
   *  they open with (see `stampSourceRanges`). */
  source?: string;
  resources: Resource[];
  resourceTypes: ResourceType[];
  resourceNumbering: ResourceNumberingMap;
  /** Ids of resources that float to page bands (never placed inline). */
  floatedIds: ReadonlySet<string>;
  /** Content indices of the `containerStart` markers of the boxes that left
   *  the flow — set in the side column, floated to a band or fixed — filled
   *  by the placement pass as it sets them. A paragraph after a heading
   *  looks past them (`bodyText.indentAfterHeading`). */
  leftFlow?: ReadonlySet<number>;
  /** Footnote id → printed number (`[^id]` markers print it). */
  footnoteNumbers?: ReadonlyMap<string, string>;
  /** The anchors a `:ref` may name and the words it prints (#262); absent
   *  when no reference names anything but resources. */
  anchorRefs?: AnchorRefContext;
}

/** Index of the `containerStart` marker that the `containerEnd` at `endIdx`
 *  closes, when there is one. */
function containerStartOf(blocks: readonly ContentBlock[], endIdx: number): number | undefined {
  const id = blocks[endIdx]?.containerId;
  if (id === undefined) return undefined;
  for (let i = endIdx - 1; i >= 0; i--) {
    const b = blocks[i]!;
    if (b.type === 'containerStart' && b.containerId === id) return i;
  }
  return undefined;
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
  /** Resource blocks on a vertical page: set upright, the frame at most
   *  this wide (see `ResourceLayoutInput.upright`). */
  uprightMaxLength?: number;
  /** Lines (1-based) a column or a page ends on, which should not end on
   *  a hyphen (`bodyText.hyphenateAcrossColumns: false`). */
  avoidHyphenAtLines?: readonly number[];
  /** The breaks of the lines of an earlier setting to keep as they are
   *  (see `MeasureBlockOptions.keepBreaks`): a paragraph broken again after
   *  its first lines were placed. Such a measurement is not cached. */
  keepBreaks?: BreakTrace;
  /** Columns of other widths the paragraph runs on into, in line order:
   *  from line `fromLine` (0-based) on, its lines are broken for a column
   *  `columnWidth` px wide (see `MeasureBlockOptions.restWidths`). Such a
   *  measurement is not cached. */
  restColumnWidths?: readonly { fromLine: number; columnWidth: number }[];
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
  // A block of an expanded `:::index`: an entry and its page numbers.
  if (rawBlock.index) return measureIndexBlock(rawBlock, columnWidth, ctx);

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
      ...(opts?.uprightMaxLength !== undefined ? { upright: { maxLength: opts.uprightMaxLength } } : {}),
    });
    if (!resourceBlock) return null;
    if (frac < 1) {
      const dx = (columnWidth - embedWidth) * (align === 'center' ? 0.5 : align === 'right' ? 1 : 0);
      // An upright block (a vertical page) moves its frame along the flow.
      if (resourceBlock.rotation) resourceBlock.rotation.originX += dx;
      else shiftResourceBlockX(resourceBlock, dx);
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
    const spans = resolveRefSpans(contentBlock.spans, ctx.resourceNumbering, ctx.resourceTypes, ctx.resources, {
      bold: bodyStyle.referenceBold ?? true,
      italic: bodyStyle.referenceItalic ?? false,
      labelNumberGap: resolved.captionStyle.labelNumberGap,
      ...(ctx.anchorRefs ? { anchors: ctx.anchorRefs } : {}),
    });
    contentBlock = {
      ...contentBlock,
      // A paragraph style in capitals sets the labels so too (EF-173).
      spans: style.uppercase
        ? spans.map((s) => (s.ref ? { ...s, text: uppercasePreservingLength(s.text) } : s))
        : spans,
    };
  }

  // Footnote markers print their note's number as a superscript, or on
  // the baseline at `footnotes.markerSize` (`markerPosition: 'inline'`):
  // one atomic token tagged with the note id (`VDTLineSegment.footnoteId`).
  if (contentBlock.spans.some((s) => s.footnote)) {
    const f = resolved.footnotes;
    const inline = f.markerPosition === 'inline';
    const size = f.markerSize;
    const scale = !inline ? undefined
      : size.unit === 'em' || size.unit === 'rem' ? size.value
        : dimensionToPx(size, resolved.page.dpi, style.fontSizePx) / style.fontSizePx;
    contentBlock = {
      ...contentBlock,
      spans: contentBlock.spans.map((s) => (s.footnote
        ? inline
          ? {
              ...s,
              text: ctx.footnoteNumbers?.get(s.footnote.id) ?? '?',
              bold: false,
              italic: false,
              footnote: { id: s.footnote.id, ...(scale !== undefined && Math.abs(scale - 1) > 1e-6 ? { scale } : {}) },
            }
          : { ...s, text: ctx.footnoteNumbers?.get(s.footnote.id) ?? '?', script: 'sup' as const, bold: false, italic: false }
        : s)),
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

  // A small-caps style (paragraph style, callout body) sets every span so.
  if (style.smallCaps && contentBlock.spans.some((s) => !s.smallCaps)) {
    contentBlock = { ...contentBlock, spans: contentBlock.spans.map((s) => (s.smallCaps ? s : { ...s, smallCaps: true })) };
  }

  // Chinese annotations (#193–#195): emphasis dots for `*…*`, book-title
  // brackets, the fonts of readings and notes.
  if (hasAnnotations(contentBlock.spans, resolved.cjk)) {
    contentBlock = {
      ...contentBlock,
      spans: resolveAnnotationSpans(contentBlock.spans, { cjk: resolved.cjk, dpi: resolved.page.dpi, fontString: style.fontString, fontSizePx: style.fontSizePx }),
    };
  }

  // The orientation marks of vertical text change nothing in horizontal
  // text, which is measured as before them.
  const vertical = measuringVertically();
  const hasRichSpans = contentBlock.spans.some((s) => s.bold || s.italic || s.mathRender || s.ref || s.footnote || s.swatch || s.chip || s.script || s.smallCaps || s.fixedSpace || s.labelTab
    || s.emphasisMark || s.properName !== undefined || s.bookTitle || s.ruby || s.warichu || s.inserted
    || (vertical && (s.combineUpright || s.orientation)));

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
    // A paragraph after a `:::space` opens a space break and is set flush
    // too — the usual rule for text resuming after a blank line. A box
    // that left the flow (set in the side column, floated or fixed) and a
    // floated figure are no block before it in its column: they are looked
    // past (EF-67).
    let prevIdx = blockIdx - 1;
    let afterSpace = false;
    while (prevIdx >= 0) {
      const prev = contentBlocks[prevIdx]!;
      if (prev.type === 'containerEnd' && ctx.leftFlow && ctx.leftFlow.size > 0) {
        const start = containerStartOf(contentBlocks, prevIdx);
        if (start !== undefined && ctx.leftFlow.has(start)) {
          prevIdx = start - 1;
          continue;
        }
      }
      if (prev.type === 'resourceBlock' && prev.resourceId !== undefined && ctx.floatedIds.has(prev.resourceId)) {
        prevIdx--;
        continue;
      }
      if (prev.type !== 'directive' && !isMarkerBlock(prev)) break;
      if (prev.directiveName === 'space') afterSpace = true;
      prevIdx--;
    }
    if (afterSpace || (prevIdx >= 0 && contentBlocks[prevIdx]!.type === 'heading')) {
      effectiveFirstLineIndent = 0;
    }
  }
  // The text after a display formula (EF-85): a paragraph written right
  // under the closing `$$` continues the one the formula interrupted, and
  // is set flush as in TeX; with `math.indentAfterDisplay: false`, so is
  // any paragraph that follows a display formula.
  if (vdtType === 'paragraph' && !style.hangingIndent && effectiveFirstLineIndent !== 0) {
    if (rawBlock.continuesParagraph) {
      effectiveFirstLineIndent = 0;
    } else if (!resolved.math.indentAfterDisplay && contentBlocks[blockIdx - 1]?.type === 'mathDisplay') {
      effectiveFirstLineIndent = 0;
    }
  }

  const runtActive = resolved.bodyText.avoidRunts
    && (vdtType === 'paragraph'
      || (vdtType === 'listItem' && resolved.bodyText.avoidRuntsInLists));
  // Tracking is measured on the rich path (per-token canvas widths); left
  // undefined when unused so the common-case cache keys stay unchanged.
  const hasRichFonts = !!(style.boldFontString && style.italicFontString && style.boldItalicFontString);
  // The style's own tracking (a heading level's `letterSpacing`, EF-83),
  // plus what column balancing asks of a loose paragraph.
  const letterSpacingPx = hasRichFonts
    ? (style.letterSpacingPx ?? 0) + (opts?.trackingEm ? opts.trackingEm * style.fontSizePx : 0)
    : 0;
  const measureOptions = {
    textAlign: style.textAlign,
    hyphenate: style.hyphenate,
    firstLineIndentPx: effectiveFirstLineIndent,
    hangingIndent: measureHangingIndent,
    // A numbered bibliography entry (#290): its label in a column as wide
    // as the turnover lines' indent.
    ...(measureHangingIndent && contentBlock.spans.some((s) => s.labelTab) ? { labelColumnPx: measureFirstLineIndent } : {}),
    optimal: resolved.bodyText.optimalLineBreaking,
    maxStretchRatio: resolved.bodyText.maxWordSpacing,
    minShrinkRatio: resolved.bodyText.minWordSpacing,
    runtPenalty: runtActive ? resolved.bodyText.runtPenalty : 0,
    runtMinCharacters: runtActive ? resolved.bodyText.runtMinCharacters : 0,
    // Left undefined when off, so the common-case cache keys stay unchanged.
    runtGraded: runtActive && resolved.bodyText.gradedRuntPenalty ? true : undefined,
    avoidHyphenAtLines: opts?.avoidHyphenAtLines,
    ...(opts?.keepBreaks ? { keepBreaks: opts.keepBreaks } : {}),
    ...(opts?.restColumnWidths && opts.restColumnWidths.length > 0
      ? {
        restWidths: opts.restColumnWidths.map((s) => ({
          fromLine: s.fromLine,
          maxWidthPx: computeMeasureViewport(s.columnWidth, style, listBullet).measureMaxWidth,
        })),
      }
      : {}),
    looseness: opts?.looseness,
    letterSpacingPx: letterSpacingPx !== 0 ? letterSpacingPx : undefined,
    hyphenationZonePx: style.hyphenationZonePx,
    // Justification tracking (EF-65): left undefined when off, so the
    // common-case cache keys stay unchanged.
    justifyTrackingPx: resolved.bodyText.maxJustifyTracking > 0 && style.textAlign === 'justify' && vdtType !== 'heading'
      ? (resolved.bodyText.maxJustifyTracking / 1000) * style.fontSizePx
      : undefined,
    // Breaks after a closed dash (EF-141) and Knuth–Plass on ragged running
    // text (EF-147): left undefined when off, the 1.4 breaks.
    breakAfterDashes: resolved.bodyText.breakAfterDashes ? true : undefined,
    // A compound's hyphen on every path (EF-186), compounds the dictionary
    // leaves whole (EF-169) and the repeated hyphen: left undefined when
    // they keep the 1.4 breaks.
    breakAfterHyphens: resolved.bodyText.breakAfterHyphens ? true : undefined,
    hyphenateCompounds: resolved.bodyText.hyphenation.compounds ? undefined : false,
    repeatHyphen: resolved.bodyText.repeatHyphen ? true : undefined,
    optimalRagged: resolved.bodyText.optimalRagged && style.textAlign !== 'justify'
      && (vdtType === 'paragraph' || vdtType === 'blockquote' || vdtType === 'listItem')
      ? true
      : undefined,
  };
  // URLs / DOIs get their bare break opportunities on the rich path only,
  // and so does a hyphenation zone (the rich greedy breaker weighs it).
  const hasUrl = /(?:^|\s)(?:(?:https?|ftp):\/\/|www\.|10\.\d{4,}\/)\S/i.test(contentBlock.text);
  const zoned = style.hyphenationZonePx !== undefined;
  // A Markdown link in a paragraph the CJK composer sets: on the formatted
  // path the composer sees the link's range and gives its characters
  // segments of their own, so the link covers them and nothing else (the
  // lines are the same on both paths).
  const cjkLinks = contentBlock.spans.some((s) => s.links !== undefined && s.links.length > 0) && composesAsCjk(contentBlock.text);
  const useRich = hasRichFonts && (hasRichSpans || letterSpacingPx !== 0 || hasUrl || zoned || cjkLinks);

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
  // that carries the line. A shorter setting is no fix (EF-65), and the
  // runt stays, when a line of it that stays justified stretches past
  // `maxWordSpacing` or, when the paragraph already has a looser justified
  // line, past that line; or when it has more lines past 3x than the
  // paragraph had (`raggedLooseLines` sets those ragged). A line the
  // paragraph sets ragged does not raise the bar: trading it for loose
  // justified lines is no better.
  if (measured.lastLineRunt && runtActive && resolved.bodyText.tightenRunts && opts?.looseness === undefined) {
    const target = measured.lines.length - 1;
    const natural = wordSpacingProfile(measured.lines);
    const loosestAllowed = Math.max(resolved.bodyText.maxWordSpacing, natural.loosest) + 1e-9;
    for (const rung of runtTrackingLadder(resolved.bodyText.maxRuntTracking, hasRichFonts)) {
      const spacing = letterSpacingPx - (rung / 1000) * style.fontSizePx;
      const attempt = runMeasurement({
        vdtType, rawBlock, contentBlock, style, measureMaxWidth, mathEnabled, cache,
        measureOptions: {
          ...measureOptions,
          looseness: -1,
          letterSpacingPx: spacing !== 0 ? spacing : undefined,
        },
        useRich: hasRichFonts && (hasRichSpans || spacing !== 0 || hasUrl || zoned || cjkLinks),
      });
      if (attempt.measured.lines.length !== target || attempt.measured.lastLineRunt) continue;
      const profile = wordSpacingProfile(attempt.measured.lines);
      if (profile.loosest <= loosestAllowed && profile.ragged <= natural.ragged) {
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

  // Markdown links: the target rides on the segments of the linked words
  // (the layout itself never sees them).
  measured = { ...measured, lines: linkSegments(measured.lines, contentBlock.spans) };

  // Per-line source-range mapping using the block's plain→source map.
  // Accounts for heading numbering prefix which prepends chars with no source.
  const { prefixLen, absoluteSourceMap } = stampSourceRanges(measured, rawBlock, contentBlock, bodyOffset, ctx.source);

  return {
    kind, contentBlock, measured, prefixLen, absoluteSourceMap, mathDisplayRender,
    ...(trackingPx !== 0 ? { letterSpacingPx: trackingPx } : {}),
  };
}

/** How loose a paragraph's justified lines are: the widest word spacing of
 *  the ones that stay justified, as a multiple of the normal space
 *  (`VDTLine.justifiedSpaceRatio`; 0 when none is), and how many stretch
 *  past `LINE_MAX_SPACE_RATIO`, which `raggedLooseLines` sets ragged. */
function wordSpacingProfile(lines: readonly VDTLine[]): { loosest: number; ragged: number } {
  let loosest = 0;
  let ragged = 0;
  for (const line of lines) {
    const ratio = line.justifiedSpaceRatio;
    if (line.isLastLine || ratio === undefined) continue;
    if (ratio > LINE_MAX_SPACE_RATIO) ragged++;
    else if (ratio > loosest) loosest = ratio;
  }
  return { loosest, ragged };
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
