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
import { kashidaMeasureOptions } from '../measure/kashida';
import { measureVerse } from './verse';
import { measureVerseLines, verseLinesSettings, versesLineByLine } from './verseLines';
import { composesAsCjk } from '../measure/cjkCompose';
import { measuringVertically } from '../measure/vertical';
import { resolveRefSpans, resolveSwatchSpans, shiftResourceBlockX, type AnchorRefContext } from './resourceLayout';
import { chipContextOf, resolveChipSpans } from './chips';
import { hasAnnotations, resolveAnnotationSpans } from './annotations';
import type { ResourceNumberingMap } from './resourceNumbering';
import type { CaptionCitations } from './citations';
import { measureTocBlock } from './toc';
import { measureIndexBlock } from './indexDirective';
import { flushEndMark } from './statementNumbering';
import { LINE_MAX_SPACE_RATIO } from './raggedLines';
import { dimensionToPx } from '../units';
import { joiningScriptIn, mostlyJoiningScript } from '../measure/joining';
import { getMeasureDirection, mirrorLineSpans, shiftLineX } from '../measure/bidiLines';
import { startEndAsLeftRight } from '../defaults/shared';
import { prepareTabs } from './tabs';
import { fullPlainOffset, paragraphDropCap, prepareDropCap, type MeasuredDropCap, type PreparedDropCap } from './dropCap';
import { lineIndentAt } from '../measure/types';
import { measureCodeLines } from './codeLines';
import { withInlineCode } from './codeInline';
import type { VDTBlock } from '../vdt';

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
  /** The formatted citations of resource captions and notes (#529). */
  captionCitations?: ReadonlyMap<string, CaptionCitations>;
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
  /** Filled by the measurement: the content indices of the blocks whose
   *  style asks for letter-spacing (`letterSpacing`) on text of a joining
   *  script (Arabic…), which is set without it. The build reports them
   *  (`joiningScriptLetterSpacing`). */
  joiningLetterSpacing?: Set<number>;
  /** Filled by the measurement: the content indices of the paragraphs a
   *  drop cap was meant to open and could not as configured (#623), and
   *  why; the build reports them (`dropCap` content warnings). */
  dropCapNotes?: Map<number, DropCapNote>;
}

/** Why a paragraph's drop cap was not set as configured (see
 *  `BlockMeasureContext.dropCapNotes`). */
export interface DropCapNote {
  reason: 'shortParagraph' | 'joiningScript' | 'verticalText' | 'noLetter' | 'split';
  handling?: 'reserve' | 'shrink' | 'skip';
  lines?: number;
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
  /** A paragraph a drop cap opens (#623): the letter, relative to the
   *  column. Its lines were set short of it. */
  dropCap?: MeasuredDropCap;
  /** A code listing (#624): its language, numbers and fit (see
   *  `VDTBlock.code`). */
  code?: NonNullable<VDTBlock['code']>;
  /** A code listing set from the far side of a mirrored frame (#624): its
   *  block reads left to right. */
  direction?: 'ltr';
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
  /** Resource blocks: px a picture with a safe area is set taller (or
   *  shorter, when negative) by cropping outside it (the fit and balancing
   *  levers, #442). */
  figureHeightDelta?: number;
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
  /** Internal to the drop cap (#623): the paragraph measured again set
   *  without it (`skip`), with the initial over `lines` lines (a short
   *  paragraph's `'shrink'`), or with a lead-in of `leadInWords` words
   *  (the first line's, counted by the first setting). */
  dropCap?: { skip?: true; lines?: number; leadInWords?: number };
}

/**
 * Resolve and measure one content block at `columnWidth`. Returns `null` when
 * there is nothing to place inline: empty text, an unknown resource id, or a
 * resource that floats to a page band.
 */
/** The spans of a block as they are measured: inline maths rendered,
 *  `:ref` labels, footnote markers, swatches and chips resolved, small
 *  capitals and Chinese and Japanese annotations applied. */
function resolveInlineSpans(block: ContentBlock, style: BlockStyle, ctx: BlockMeasureContext): ContentBlock {
  const { resolved, bodyStyle } = ctx;
  let contentBlock = block;
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
  // A Japanese marker (JLReq §4.2.3) stands in the line gap beside the text
  // (`'side'`) or, down a vertical line, flush with its right side
  // (`'right'`; a superscript in horizontal text).
  if (contentBlock.spans.some((s) => s.footnote)) {
    const f = resolved.footnotes;
    const position = f.markerPosition === 'right' && !measuringVertically() ? 'superscript' : f.markerPosition;
    const inline = position !== 'superscript';
    const place = position === 'side' || position === 'right' ? position : undefined;
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
              footnote: { id: s.footnote.id, ...(scale !== undefined && Math.abs(scale - 1) > 1e-6 ? { scale } : {}), ...(place ? { place } : {}) },
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

  // Chinese and Japanese annotations (#193–#195, #421): emphasis dots for
  // `*…*` and the region's mark, book-title brackets, the fonts of
  // readings and notes.
  if (hasAnnotations(contentBlock.spans, resolved.cjk)) {
    contentBlock = {
      ...contentBlock,
      spans: resolveAnnotationSpans(contentBlock.spans, { cjk: resolved.cjk, dpi: resolved.page.dpi, fontString: style.fontString, fontSizePx: style.fontSizePx }),
    };
  }
  return contentBlock;
}

/** The stanzas of the poem `raw` (a stanza of the line layout, #620) sets,
 *  in order, as content indices: the run of blocks around it that carry
 *  the same poem. */
function poemStanzaIndices(contentBlocks: readonly ContentBlock[], raw: ContentBlock, blockIdx: number): number[] {
  const stanza = raw.verse?.stanza;
  const at = contentBlocks[blockIdx] === raw ? blockIdx : contentBlocks.indexOf(raw);
  if (!stanza || at < 0) return [];
  const of = (i: number) => contentBlocks[i]?.verse?.stanza;
  let from = at;
  while (from > 0 && of(from - 1)?.poem === stanza.poem && of(from - 1)!.index === of(from)!.index - 1) from--;
  let to = at;
  while (to + 1 < contentBlocks.length && of(to + 1)?.poem === stanza.poem && of(to + 1)!.index === of(to)!.index + 1) to++;
  return Array.from({ length: to - from + 1 }, (_, k) => from + k);
}

export function measureContentBlock(
  rawBlock: ContentBlock,
  blockIdx: number,
  columnWidth: number,
  ctx: BlockMeasureContext,
  opts?: MeasureContentBlockOptions,
): MeasuredContentBlock | null {
  const { resolved, contentBlocks, cache, bodyOffset } = ctx;

  // A block of an expanded `:::toc`: title, number, leader, page label.
  if (rawBlock.toc) return measureTocBlock(rawBlock, columnWidth, ctx);
  // A block of an expanded `:::index`: an entry and its page numbers.
  if (rawBlock.index) return measureIndexBlock(rawBlock, columnWidth, ctx);

  const kind = resolveBlockKind(rawBlock, {
    ...ctx,
    blockIdx,
    paragraphStyleOverride: opts?.styleOverride,
  });

  // A code listing (#624): line by line as written, in its box's measure.
  if (rawBlock.type === 'code') {
    const mirrored = getMeasureDirection() === 'rtl' && !measuringVertically();
    const measured = measureCodeLines({
      block: rawBlock,
      fontSizePx: kind.style.fontSizePx,
      lineHeightPx: kind.style.lineHeightPx,
      color: kind.style.color,
      measure: columnWidth,
      resolved,
      bodyOffset,
      ...(mirrored ? { mirrored: true } : {}),
    });
    if (measured.lines.length === 0) return null;
    const code: NonNullable<VDTBlock['code']> = {
      ...(rawBlock.code?.lang ? { lang: rawBlock.code.lang } : {}),
      ...(measured.numbers ? { numbers: measured.numbers } : {}),
      ...(measured.fit ? { fit: measured.fit } : {}),
    };
    return {
      kind,
      contentBlock: rawBlock,
      measured: { lines: measured.lines, totalHeight: measured.totalHeight },
      prefixLen: 0,
      absoluteSourceMap: rawBlock.sourceMap.map((o) => o + bodyOffset),
      code,
      ...(mirrored ? { direction: 'ltr' as const } : {}),
    };
  }
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
    const align = startEndAsLeftRight(kind.resource.placement?.align ?? kind.resourceType?.defaultPlacement?.align ?? 'left');
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
      ...(ctx.captionCitations ? { captionCitations: ctx.captionCitations } : {}),
      resource: kind.resource,
      resourceType: kind.resourceType,
      resourceNumber: kind.resourceNumber,
      ...(opts?.figureMaxBodyWidth !== undefined ? { maxBodyWidth: opts.figureMaxBodyWidth } : {}),
      ...(opts?.figureHeightDelta ? { bodyHeightDelta: opts.figureHeightDelta } : {}),
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

  // Inline code in the code face (#624, `codeStyle.inline`), before the
  // spans are resolved: they still match the parsed text then.
  contentBlock = withInlineCode(contentBlock, rawBlock, resolved, style.fontSizePx);
  contentBlock = resolveInlineSpans(contentBlock, style, ctx);

  // The orientation marks of vertical text change nothing in horizontal
  // text, which is measured as before them.
  const vertical = measuringVertically();
  // Tabs (#622): a tab character is a tab only under tab stops, and only
  // the formatted-text breaker sets tabs.
  const hasRichFonts = !!(style.boldFontString && style.italicFontString && style.boldItalicFontString);
  const prepared = prepareTabs(contentBlock, style, resolved, { vertical, rich: hasRichFonts });
  contentBlock = prepared.block;
  // A drop cap (#623): the initial comes out of the text the measurers
  // break, and the lines it stands beside are indented by it.
  let dropCap: PreparedDropCap | undefined;
  const capSettings = vdtType === 'paragraph' && !opts?.dropCap?.skip ? paragraphDropCap(rawBlock, blockIdx, style, ctx) : undefined;
  if (capSettings) {
    if (!opts?.dropCap) ctx.dropCapNotes?.delete(blockIdx);
    const shrunk = opts?.dropCap?.lines;
    const settings = shrunk !== undefined ? { ...capSettings, lines: shrunk, sink: Math.min(capSettings.sink, shrunk) } : capSettings;
    if (vertical) {
      ctx.dropCapNotes?.set(blockIdx, { reason: 'verticalText' });
    } else {
      const prep = prepareDropCap(contentBlock, settings, style, resolved, opts?.dropCap?.leadInWords);
      if (typeof prep === 'string') ctx.dropCapNotes?.set(blockIdx, { reason: prep });
      else {
        dropCap = prep;
        contentBlock = prep.block;
      }
    }
  }
  const hasRichSpans = contentBlock.spans.some((s) => s.bold || s.italic || s.mathRender || s.ref || s.footnote || s.swatch || s.chip || s.script || s.smallCaps || s.fixedSpace || s.labelTab || s.tab
    || s.emphasisMark || s.properName !== undefined || s.bookTitle || s.ruby || s.warichu || s.inserted || s.sideline || s.kunten
    // An inline `:rtl[…]` / `:ltr[…]` isolate is read on the spans.
    || s.direction !== undefined
    || (vertical && (s.combineUpright || s.orientation)));

  // List items reserve horizontal space for indent + bullet + gap.
  const {
    measureMaxWidth,
    lineXShift,
    measureFirstLineIndent,
    measureHangingIndent,
    measureLineIndents,
  } = computeMeasureViewport(columnWidth, style, listBullet);

  // A poem in the line layout (#620): each line of verse measured on its
  // own by `pipeline/verseLines.ts`, against the poem's other stanzas
  // (their longest line centres the poem); none of the paragraph's levers
  // apply but the word spaces' shrink, down to `minWordSpacing`, that
  // keeps a line a little too wide on one line.
  if (contentBlock.verse?.stanza && versesLineByLine(rawBlock, resolved)) {
    const direction = contentBlock.direction ?? getMeasureDirection();
    const indices = poemStanzaIndices(contentBlocks, rawBlock, blockIdx);
    const poem = indices.length === 0 ? [contentBlock] : indices.map((j) => {
      if (j === blockIdx) return contentBlock;
      const sibling = resolveBlockKind(contentBlocks[j]!, { ...ctx, blockIdx: j, paragraphStyleOverride: opts?.styleOverride });
      return prepareTabs(resolveInlineSpans(sibling.contentBlock, sibling.style, ctx), sibling.style, resolved, { vertical, rich: hasRichFonts }).block;
    });
    const measured = measureVerseLines({
      contentBlock,
      poem,
      style,
      measureMaxWidth,
      settings: verseLinesSettings(contentBlock.verse.attrs, style, resolved, vertical),
      direction,
      frameDirection: getMeasureDirection(),
      minWordSpacing: resolved.bodyText.minWordSpacing,
      ...(cache ? { cache } : {}),
    });
    if (measured.lines.length === 0) return null;
    if (lineXShift > 0) for (const line of measured.lines) shiftLineX(line, lineXShift);
    const linked = { ...measured, lines: linkSegments(measured.lines, contentBlock.spans) };
    const { prefixLen, absoluteSourceMap } = stampSourceRanges(linked, rawBlock, contentBlock, bodyOffset, ctx.source);
    return { kind, contentBlock, measured: linked, prefixLen, absoluteSourceMap };
  }

  // A poem (#378): its bayts are laid out by `pipeline/verse.ts`, each
  // hemistich measured on its own; none of the paragraph's levers apply.
  if (contentBlock.verse) {
    const direction = contentBlock.direction ?? getMeasureDirection();
    const measured = measureVerse({
      contentBlock,
      style,
      measureMaxWidth,
      dpi: resolved.page.dpi,
      minWordSpacing: resolved.bodyText.minWordSpacing,
      kashida: kashidaMeasureOptions(resolved.bodyText, style.fontString, style.fontSizePx),
      direction,
      frameDirection: getMeasureDirection(),
      ...(cache ? { cache } : {}),
    });
    if (measured.lines.length === 0) return null;
    if (lineXShift > 0) for (const line of measured.lines) shiftLineX(line, lineXShift);
    const linked = { ...measured, lines: linkSegments(measured.lines, contentBlock.spans) };
    const { prefixLen, absoluteSourceMap } = stampSourceRanges(linked, rawBlock, contentBlock, bodyOffset, ctx.source);
    return { kind, contentBlock, measured: linked, prefixLen, absoluteSourceMap };
  }

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
  // The style's own tracking (a heading level's `letterSpacing`, EF-83),
  // plus what column balancing asks of a loose paragraph.
  const letterSpacingPx = hasRichFonts
    ? (style.letterSpacingPx ?? 0) + (opts?.trackingEm ? opts.trackingEm * style.fontSizePx : 0)
    : 0;
  // The words of a joining script take none of the style's tracking (the
  // measurer leaves them untracked, `measure/joining.ts`): say so.
  if (ctx.joiningLetterSpacing && hasRichFonts && (style.letterSpacingPx ?? 0) !== 0 && joiningScriptIn(contentBlock.text)) {
    ctx.joiningLetterSpacing.add(blockIdx);
  }
  // The paragraph's base direction: its own (`{dir=…}`), else the
  // document's (`setMeasureDirection`). Passed only when the block sets
  // one, so the measurements of every other block keep their cache keys.
  // The drop cap's lines (#623): its width and gap on each line it sinks,
  // the paragraph's own indents after them (its first-line indent dropped).
  const capIndents = dropCap
    ? (() => {
      const base = { firstLineIndentPx: effectiveFirstLineIndent, hangingIndent: measureHangingIndent, ...(measureLineIndents ? { lineIndentsPx: measureLineIndents } : {}) };
      const after = dropCap.sink === 0 ? 0 : lineIndentAt(base, dropCap.sink);
      return [...dropCap.indents, measureHangingIndent || measureLineIndents ? after : 0];
    })()
    : undefined;
  const measureOptions = {
    ...(contentBlock.direction !== undefined ? { direction: contentBlock.direction } : {}),
    textAlign: style.textAlign,
    hyphenate: style.hyphenate,
    // A paragraph style's own `wordBreak`: passed only when set, so the
    // measurements of every other block keep their cache keys.
    ...(style.cjkWordBreak !== undefined ? { cjkWordBreak: style.cjkWordBreak } : {}),
    firstLineIndentPx: capIndents ? 0 : effectiveFirstLineIndent,
    hangingIndent: capIndents ? false : measureHangingIndent,
    // A first-line indent paired with a hanging one (#620), or the lines a
    // drop cap shortens (#623): passed only then, so every other block
    // keeps its cache key.
    ...(capIndents ? { lineIndentsPx: capIndents } : measureLineIndents ? { lineIndentsPx: measureLineIndents } : {}),
    // A numbered bibliography entry (#290): its label in a column as wide
    // as the turnover lines' indent.
    ...(measureHangingIndent && !measureLineIndents && !capIndents && contentBlock.spans.some((s) => s.labelTab) ? { labelColumnPx: measureFirstLineIndent } : {}),
    // Tab stops (#622): passed only to a block that holds a tab.
    ...(prepared.tabs ? { tabs: prepared.tabs } : {}),
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
    // Kashida justification (#375): undefined when off (every document
    // not in an Arabic-script language), so those cache keys are unchanged.
    kashida: style.textAlign === 'justify' && vdtType !== 'heading'
      ? kashidaMeasureOptions(resolved.bodyText, style.fontString, style.fontSizePx)
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
  // A box's end mark (#530) is moved on its line segment by segment.
  const useRich = hasRichFonts && (hasRichSpans || letterSpacingPx !== 0 || hasUrl || zoned || cjkLinks || contentBlock.endMark !== undefined);

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
    // An Arabic paragraph takes no tracking: its words would stay untracked
    // and only its spaces would tighten, which the first rung already tries.
    for (const rung of runtTrackingLadder(resolved.bodyText.maxRuntTracking, hasRichFonts && !mostlyJoiningScript(contentBlock.text))) {
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

  // 字取り (jidori, JLReq §3.7.3, #424): a one-line heading narrower than
  // its `jidori` width is spaced out evenly to fill it, 序章 at three
  // characters set as 序　章. The space goes between the characters as
  // tracking: the advance after the last one is no part of the width (the
  // renderers align a tracked line by its letters, EF-153), so `n`
  // characters fill the width with `n - 1` equal gaps. How many tracked
  // advances the line holds is read off a trial setting, so a tate-chu-yoko
  // number or a ruby base counts as the composer counts it.
  const jidori = vdtType === 'heading' ? headingJidori(style, rawBlock) : undefined;
  if (jidori !== undefined && hasRichFonts && measured.lines.length === 1 && opts?.trackingEm === undefined) {
    const target = jidori * style.fontSizePx;
    const naturalWidth = measured.lines[0]!.bbox.width;
    const tracked = (spacing: number) => runMeasurement({
      vdtType, rawBlock, contentBlock, style, measureMaxWidth, mathEnabled, cache,
      measureOptions: { ...measureOptions, letterSpacingPx: spacing !== 0 ? spacing : undefined },
      useRich: true,
    }).measured;
    if (naturalWidth < target - 0.5) {
      const probe = tracked(trackingPx + 1);
      const advances = probe.lines.length === 1 ? Math.round(probe.lines[0]!.bbox.width - naturalWidth) : 0;
      if (advances >= 2) {
        const untracked = naturalWidth - advances * trackingPx;
        const spacing = (target - untracked) / (advances - 1);
        const spaced = tracked(spacing);
        if (spaced.lines.length === 1) {
          measured = spaced;
          trackingPx = spacing;
        }
      }
    }
  }

  if (measured.lines.length === 0) return null;

  if (dropCap) {
    // A lead-in of the whole first line: its words, counted on this
    // setting, set again in small capitals (two settings at most).
    if (dropCap.settings.leadIn?.words === 'line' && opts?.dropCap?.leadInWords === undefined) {
      const first = measured.lines[0]!;
      const words = first.text.trim().split(/\s+/).filter((w) => w.length > 0).length - (first.hyphenated && measured.lines.length > 1 ? 1 : 0);
      return measureContentBlock(rawBlock, blockIdx, columnWidth, ctx, { ...opts, dropCap: { ...opts?.dropCap, leadInWords: Math.max(1, words) } });
    }
    // A paragraph of fewer lines than the initial sinks.
    const n = measured.lines.length;
    if (n < dropCap.sink && opts?.dropCap?.lines === undefined) {
      const handling = dropCap.settings.shortParagraph;
      ctx.dropCapNotes?.set(blockIdx, { reason: 'shortParagraph', handling, ...(handling === 'shrink' ? { lines: n } : {}) });
      if (handling === 'skip') return measureContentBlock(rawBlock, blockIdx, columnWidth, ctx, { ...opts, dropCap: { skip: true } });
      if (handling === 'shrink') return measureContentBlock(rawBlock, blockIdx, columnWidth, ctx, { ...opts, dropCap: { ...opts?.dropCap, lines: n } });
    }
  }

  // A callout style's end mark (a proof's ∎, #530): flush right on the
  // last line.
  if (contentBlock.endMark !== undefined) measured = flushEndMark(measured, contentBlock.endMark, measureMaxWidth);

  // A paragraph whose direction opposes its frame's (the document's: a
  // right-to-left document's pages are mirrored, #370), such as an Arabic
  // quotation in an English book: its lines start on the frame's far side,
  // their indent too (`VDTLine.measure`).
  // A paragraph style's indent and a list item's marker column go to that
  // side too: the lines take the measure from the block's left edge, the
  // marker the room on its right (`mirrorListMarker`).
  const opposite = contentBlock.direction !== undefined && contentBlock.direction !== getMeasureDirection();
  if (opposite) {
    mirrorLineSpans(measured.lines, measureMaxWidth, measureOptions.restWidths);
  }

  const xShift = opposite ? Math.max(0, columnWidth - lineXShift - measureMaxWidth) : lineXShift;
  if (xShift > 0) {
    for (const line of measured.lines) {
      shiftLineX(line, xShift);
    }
  }

  // Markdown links: the target rides on the segments of the linked words
  // (the layout itself never sees them).
  measured = { ...measured, lines: linkSegments(measured.lines, contentBlock.spans) };

  // Per-line source-range mapping using the block's plain→source map.
  // Accounts for heading numbering prefix which prepends chars with no source.
  if (dropCap) {
    // The lines were cut from the text without the initial: they are
    // stamped against it, and their plain offsets then count past it, so
    // they index the paragraph's own text and source map.
    const { start, end } = dropCap.removed;
    const strippedRaw: ContentBlock = {
      ...rawBlock,
      text: rawBlock.text.slice(0, start) + rawBlock.text.slice(end),
      sourceMap: [...rawBlock.sourceMap.slice(0, start), ...rawBlock.sourceMap.slice(end)],
      sourceStart: start === 0 ? rawBlock.sourceMap[end] ?? rawBlock.sourceStart : rawBlock.sourceStart,
    };
    stampSourceRanges(measured, strippedRaw, contentBlock, bodyOffset, ctx.source);
    for (const line of measured.lines) {
      if (line.plainStart !== undefined) line.plainStart = fullPlainOffset(dropCap, line.plainStart);
      if (line.plainEnd !== undefined) line.plainEnd = fullPlainOffset(dropCap, line.plainEnd);
    }
    const map = rawBlock.sourceMap;
    const width = dropCap.width;
    const capX = (opposite ? measureMaxWidth - width : 0) + xShift;
    const placed: MeasuredDropCap = {
      text: dropCap.text,
      fontString: dropCap.fontString,
      fontSizePx: dropCap.fontSizePx,
      color: dropCap.color,
      width,
      x: capX,
      lines: dropCap.lines,
      sink: dropCap.sink,
      rise: dropCap.rise,
      minLines: dropCap.settings.shortParagraph === 'reserve' ? dropCap.sink : 0,
      plainStart: dropCap.plainStart,
      plainEnd: dropCap.plainEnd,
      // From the block's start when it opens the paragraph (markup before
      // the letter, `**L`, included), so the block's range is unchanged.
      ...(map.length > dropCap.plainStart
        ? { sourceStart: (dropCap.plainStart === 0 ? rawBlock.sourceStart : map[dropCap.plainStart]!) + bodyOffset, sourceEnd: map[dropCap.plainEnd - 1]! + 1 + bodyOffset }
        : {}),
      word: dropCap.word,
      wordRest: dropCap.wordRest,
      ...(dropCap.hang ? { hang: { ...dropCap.hang, x: opposite ? capX + width : capX - dropCap.hang.width } } : {}),
    };
    return {
      kind, contentBlock, measured, prefixLen: 0, absoluteSourceMap: rawBlock.sourceMap.map((o) => o + bodyOffset), mathDisplayRender,
      ...(trackingPx !== 0 ? { letterSpacingPx: trackingPx } : {}),
      dropCap: placed,
    };
  }
  const { prefixLen, absoluteSourceMap } = stampSourceRanges(measured, rawBlock, contentBlock, bodyOffset, ctx.source);

  return {
    kind, contentBlock, measured, prefixLen, absoluteSourceMap, mathDisplayRender,
    ...(trackingPx !== 0 ? { letterSpacingPx: trackingPx } : {}),
  };
}

/** A heading's jidori width in its own ems: its `{jidori=N}` attribute
 *  (`0` or anything under 1 turns the level's off), else its level's
 *  `jidori`. Undefined: none. */
function headingJidori(style: BlockStyle, block: ContentBlock): number | undefined {
  const own = block.attrs?.jidori;
  if (own !== undefined) {
    const n = Number(own.trim());
    return Number.isFinite(n) && n > 1 ? n : undefined;
  }
  return style.jidori;
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
