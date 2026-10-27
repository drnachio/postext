/**
 * Per-block measurement for the placement loop: resolves a parsed content
 * block into its kind/style, enriches inline math and `:ref` spans, lays out
 * the text (or the resource group) against a column width, and stamps source
 * ranges. Pure with respect to the document — nothing here touches pages,
 * columns, or the cursor — so the main loop can re-run it freely (e.g. the
 * column-balancing "loose paragraph" re-measure) and stays focused on
 * placement decisions.
 */

import type { ContentBlock } from '../../parse/index.js';
import type { VDTBlock } from '../../vdt.js';
import { computeMeasureViewport, stampSourceRanges, isMarkerBlock } from './buildHelpers.js';
import { resolveBlockKind } from './buildBlockKind.js';
import { runMeasurement } from './buildMeasurement.js';
import { linkSegments } from '../../measure/links.js';
import { kashidaMeasureOptions } from '../../measure/rtl/kashida.js';
import { measureVerse } from '../text/verse.js';
import { versesLineByLine, measureVerseLines, verseLinesSettings } from '../text/verseLines.js';
import { composesAsCjk } from '../../measure/cjk/cjkCompose.js';
import { measuringVertically } from '../../measure/vertical.js';
import { shiftResourceBlockX } from '../resources/resourceLayout.js';
import { measureTocBlock } from '../contents/toc.js';
import { measureIndexBlock } from '../contents/indexDirective.js';
import { flushEndMark } from '../text/statementNumbering.js';
import { joiningScriptIn, mostlyJoiningScript } from '../../measure/rtl/joining.js';
import { getMeasureDirection, shiftLineX, mirrorLineSpans } from '../../measure/rtl/bidiLines.js';
import { startEndAsLeftRight } from '../../defaults/shared.js';
import { prepareTabs } from '../text/tabs.js';
import { resolveResourceWrap } from '../floats/textWrap.js';
import { captionInsideShare } from '../resources/captionInside.js';
import { type PreparedDropCap, paragraphDropCap, dropCapRefusedInBox, prepareDropCap, fullPlainOffset, type MeasuredDropCap } from '../text/dropCap.js';
import { lineInsetsAt } from '../../measure/types.js';
import { measureCodeLines } from '../code/codeLines.js';
import { withInlineCode } from '../code/codeInline.js';
import { containerStartOf, wordSpacingProfile, runtTrackingLadder, headingJidori } from './measureContentBlock/helpers.js';
import { resolveInlineSpans, poemStanzaIndices } from './measureContentBlock/inlineSpans.js';
import type { BlockMeasureContext, MeasureContentBlockOptions, MeasuredContentBlock } from './measureContentBlock/types.js';
import { createMeasureOptions } from './measureContentBlock/measureOptions.js';

export type { BlockMeasureContext, DropCapNote, MeasuredContentBlock, MeasureContentBlockOptions } from './measureContentBlock/types.js';
export { wordSpacingProfile } from './measureContentBlock/helpers.js';

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
    // A picture text wraps round (#627) takes its share of the column at
    // its side (horizontal text only).
    // A picture with its caption beside it inside the column (#1106) keeps
    // the column's width: the resource layout narrows the picture.
    const inside = !measuringVertically() && opts?.uprightMaxLength === undefined
      && captionInsideShare(kind.resource, kind.resourceType) !== undefined;
    const wrap = measuringVertically() ? undefined : resolveResourceWrap(kind.resource, kind.resourceType, resolved.layout.wrap);
    const rawFrac = kind.resource.placement?.width ?? kind.resourceType?.defaultPlacement?.width;
    const frac = wrap ? wrap.width : !inside && typeof rawFrac === 'number' && rawFrac > 0 && rawFrac < 1 ? rawFrac : 1;
    const align = wrap ? wrap.side : startEndAsLeftRight(kind.resource.placement?.align ?? kind.resourceType?.defaultPlacement?.align ?? 'left');
    const embedWidth = columnWidth * frac;
    // Where a narrower embed starts in its column (`placement.align`).
    const embedDx = frac < 1 ? (columnWidth - embedWidth) * (align === 'center' ? 0.5 : align === 'right' ? 1 : 0) : 0;
    const { resourceBlock, measured, tableRows, asideHeight } = runMeasurement({
      vdtType,
      bodyOffset: ctx.bodyOffset,
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
      ...(opts?.tableSlice ? { tableSlice: opts.tableSlice } : {}),
      // The band is measured from the embed's own left, which the shift
      // below moves with the rest of the block.
      ...(opts?.captionAside ? { captionAside: { dx: opts.captionAside.dx - embedDx, width: opts.captionAside.width, alignBottom: false } } : {}),
    });
    if (!resourceBlock) return null;
    if (frac < 1) {
      const dx = embedDx;
      // An upright block (a vertical page) moves its frame along the flow.
      if (resourceBlock.rotation) resourceBlock.rotation.originX += dx;
      else shiftResourceBlockX(resourceBlock, dx);
    }
    return { kind, contentBlock, measured, prefixLen: 0, absoluteSourceMap: [], resourceBlock, ...(tableRows ? { tableRows } : {}), ...(asideHeight !== undefined ? { asideHeight } : {}) };
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
  // Asked for in a box, where no drop cap is set (#922): said once.
  if (!capSettings && vdtType === 'paragraph' && !opts?.dropCap && dropCapRefusedInBox(rawBlock, blockIdx, style, ctx)) ctx.dropCapNotes?.set(blockIdx, { reason: 'inBox' });
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
  // own by `pipeline/text/verseLines.ts`, against the poem's other stanzas
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

  // A poem (#378): its bayts are laid out by `pipeline/text/verse.ts`, each
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
  // measurer leaves them untracked, `measure/rtl/joining.ts`): say so.
  if (ctx.joiningLetterSpacing && hasRichFonts && (style.letterSpacingPx ?? 0) !== 0 && joiningScriptIn(contentBlock.text)) {
    ctx.joiningLetterSpacing.add(blockIdx);
  }

  const {
    measureOptions
  } = createMeasureOptions({
    opts, resolved, kind, style, vdtType, listBullet, contentBlock, prepared, dropCap,
    measureFirstLineIndent, measureHangingIndent, measureLineIndents, effectiveFirstLineIndent,
    runtActive, letterSpacingPx
  });
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
  let runtTracking: number | undefined;

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
        runtTracking = rung;
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
    mirrorLineSpans(measured.lines, measureMaxWidth, measureOptions.restWidths, measureOptions.lineInsets);
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
    // Beside a wrapped picture (#627) the initial stands past its inset.
    const capInset = lineInsetsAt(measureOptions.lineInsets, 0);
    const capX = (opposite ? measureMaxWidth - width - capInset.end : capInset.start) + xShift;
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
      ...(runtTracking !== undefined ? { runtTracking } : {}),
      dropCap: placed,
    };
  }
  const { prefixLen, absoluteSourceMap } = stampSourceRanges(measured, rawBlock, contentBlock, bodyOffset, ctx.source);

  return {
    kind, contentBlock, measured, prefixLen, absoluteSourceMap, mathDisplayRender,
    ...(trackingPx !== 0 ? { letterSpacingPx: trackingPx } : {}),
    ...(runtTracking !== undefined ? { runtTracking } : {}),
  };
}
