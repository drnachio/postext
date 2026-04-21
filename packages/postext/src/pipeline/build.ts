import type { PostextContent, PostextConfig } from '../types';
import type { ListKind } from '../parse';
import { dimensionToPx } from '../units';
import {
  createBoundingBox,
  createVDTDocument,
  createVDTBlock,
  type VDTDocument,
  type VDTBlock,
} from '../vdt';
import { parseMarkdownMemo } from '../parse';
import { computeHeadingNumbers, type HeadingTemplates } from '../numbering';
import { extractFrontmatter } from '../frontmatter';
import { measureBlock, measureRichBlock, cachedMeasureBlock, cachedMeasureRichBlock, initHyphenator } from '../measure';
import type { MeasurementCache, MeasuredBlock } from '../measure';
import { resolveAllConfig, computeBaselineGrid } from './config';
import type { BlockStyle } from './styles';
import { resolveBodyStyle, resolveHeadingStyle, resolveBlockquoteStyle, resolveMathDisplayStyle } from './styles';
import { renderMath, isMathReady } from '../math';
import type { ListBulletStyle, ListItemResolved } from './lists';
import {
  computeLevelIndentsPx,
  computeOrderedLevelIndentsPx,
  computeOrderedListRunMetrics,
  resolveUnorderedListItemStyle,
  resolveOrderedListItemStyle,
} from './lists';
import type { PlacementCursor } from './placement';
import {
  resetLinePositions,
  createPageWithColumns,
  currentColumn,
  advanceToNextColumn,
  placeBlockInColumn,
} from './placement';
import { chooseParagraphSplit } from './orphanWidow';

export function buildDocument(
  content: PostextContent,
  config?: PostextConfig,
  cache?: MeasurementCache,
): VDTDocument {
  const resolved = resolveAllConfig(config);
  const dpi = resolved.page.dpi;

  // Initialize hyphenator if needed
  if (resolved.bodyText.hyphenation.enabled && resolved.bodyText.textAlign === 'justify') {
    initHyphenator(resolved.bodyText.hyphenation.locale);
  }

  // Compute baseline grid
  const baselineGrid = computeBaselineGrid(resolved);

  // Create document
  const doc = createVDTDocument(resolved, baselineGrid);

  // Page dimensions in px (trim size)
  const trimWidthPx = dimensionToPx(resolved.page.width, dpi);
  const trimHeightPx = dimensionToPx(resolved.page.height, dpi);

  // Cut lines expansion: canvas grows to fit bleed + mark offset + mark length
  let trimOffset = 0;
  if (resolved.page.cutLines.enabled) {
    const bleedPx = dimensionToPx(resolved.page.cutLines.bleed, dpi);
    const markOffsetPx = dimensionToPx(resolved.page.cutLines.markOffset, dpi);
    const markLengthPx = dimensionToPx(resolved.page.cutLines.markLength, dpi);
    trimOffset = bleedPx + markOffsetPx + markLengthPx;
  }

  const pageWidthPx = trimWidthPx + trimOffset * 2;
  const pageHeightPx = trimHeightPx + trimOffset * 2;

  // Margins in px
  const marginTop = dimensionToPx(resolved.page.margins.top, dpi);
  const marginBottom = dimensionToPx(resolved.page.margins.bottom, dpi);
  const marginLeft = dimensionToPx(resolved.page.margins.left, dpi);
  const marginRight = dimensionToPx(resolved.page.margins.right, dpi);

  // Content area (offset by trimOffset so content sits inside the trim area)
  const contentArea = createBoundingBox(
    marginLeft + trimOffset,
    marginTop + trimOffset,
    trimWidthPx - marginLeft - marginRight,
    trimHeightPx - marginTop - marginBottom,
  );

  doc.trimOffset = trimOffset;

  // Create first page
  const firstPage = createPageWithColumns(0, resolved, contentArea, pageWidthPx, pageHeightPx);
  doc.pages.push(firstPage);

  // Extract frontmatter, then parse the remaining markdown body
  const { metadata: frontmatterMeta, content: markdownBody, contentOffset: bodyOffset } = extractFrontmatter(content.markdown);
  doc.metadata = { ...(content.metadata ?? {}), ...frontmatterMeta };
  const contentBlocks = parseMarkdownMemo(markdownBody);

  const headingTemplates: HeadingTemplates = {};
  for (const lvl of resolved.headings.levels) {
    if (lvl.numberingTemplate && lvl.numberingTemplate.length > 0) {
      headingTemplates[lvl.level as 1 | 2 | 3 | 4 | 5 | 6] = lvl.numberingTemplate;
    }
  }
  const headingPrefixes = computeHeadingNumbers(contentBlocks, headingTemplates);

  // Resolve styles
  const bodyStyle = resolveBodyStyle(resolved);
  const blockquoteStyle = resolveBlockquoteStyle(resolved);
  const listLevelIndentsPx = computeLevelIndentsPx(resolved, bodyStyle.fontSizePx);
  const orderedMetrics = computeOrderedListRunMetrics(contentBlocks, resolved, bodyStyle.fontSizePx);
  const orderedLevelIndentsPx = computeOrderedLevelIndentsPx(
    resolved,
    bodyStyle.fontSizePx,
    orderedMetrics.maxWidthByDepth,
  );

  // Placement cursor
  const cursor: PlacementCursor = { pageIndex: 0, columnIndex: 0 };

  let blockIdCounter = 0;
  let pendingSpacing = 0;

  for (let blockIdx = 0; blockIdx < contentBlocks.length; blockIdx++) {
    const rawBlock = contentBlocks[blockIdx]!;
    const id = `block-${blockIdCounter++}`;

    let style: BlockStyle;
    let vdtType: VDTBlock['type'];
    let headingLevel: number | undefined;
    let numberPrefix: string | undefined;
    let contentBlock = rawBlock;
    let listBullet: ListBulletStyle | undefined;
    let listDepth: number | undefined;
    let listKind: ListKind | undefined;
    let bulletXOffsetInColumn = 0;
    let strikethroughText = false;

    switch (rawBlock.type) {
      case 'heading': {
        style = resolveHeadingStyle(rawBlock.level ?? 1, resolved);
        vdtType = 'heading';
        headingLevel = rawBlock.level;
        numberPrefix = headingPrefixes[blockIdx];
        if (numberPrefix) {
          const sep = `${numberPrefix} `;
          const firstSpan = rawBlock.spans[0];
          const newSpans = firstSpan
            ? [{ text: sep + firstSpan.text, bold: firstSpan.bold, italic: firstSpan.italic }, ...rawBlock.spans.slice(1)]
            : [{ text: sep, bold: false, italic: false }];
          contentBlock = { ...rawBlock, text: sep + rawBlock.text, spans: newSpans };
        }
        break;
      }
      case 'blockquote':
        style = blockquoteStyle;
        vdtType = 'blockquote';
        break;
      case 'mathDisplay': {
        style = resolveMathDisplayStyle(resolved);
        vdtType = 'mathDisplay';
        break;
      }
      case 'listItem': {
        const depth = rawBlock.depth ?? 1;
        const kind: ListKind = rawBlock.listKind ?? 'unordered';
        let resolvedList: ListItemResolved;
        if (kind === 'ordered') {
          const metric =
            orderedMetrics.perBlock.get(blockIdx) ??
            { numberText: '', numberWidthPx: 0, maxNumberWidthPx: 0 };
          resolvedList = resolveOrderedListItemStyle(depth, resolved, orderedLevelIndentsPx, metric);
        } else {
          resolvedList = resolveUnorderedListItemStyle(
            depth,
            resolved,
            listLevelIndentsPx,
            rawBlock.checked ?? false,
            kind === 'task',
          );
        }
        style = resolvedList.text;
        listBullet = resolvedList.bullet;
        listDepth = depth;
        listKind = kind;
        bulletXOffsetInColumn = resolvedList.bulletXOffsetInColumn;
        strikethroughText = resolvedList.strikethroughText;
        vdtType = 'listItem';
        break;
      }
      default:
        style = bodyStyle;
        vdtType = 'paragraph';
        break;
    }

    // Measure text — use rich measurement for blocks with bold spans
    const col = currentColumn(doc, cursor);

    // Resolve inline math: renderMath each `span.math` and attach mathRender.
    // When math is disabled, drop the math metadata so spans fall back to
    // the raw TeX (visible as literal `$...$`).
    const mathEnabled = resolved.math.enabled;
    if (contentBlock.spans.some((s) => s.math)) {
      const mathFontSizePx = style.fontSizePx * resolved.math.fontSizeScale;
      const mathColor = resolved.math.color?.hex ?? style.color;
      const enrichedSpans = contentBlock.spans.map((s) => {
        if (!s.math) return s;
        if (!mathEnabled) {
          return { text: `$${s.math.tex}$`, bold: s.bold, italic: s.italic };
        }
        const render = isMathReady()
          ? renderMath(s.math.tex, false, mathFontSizePx, { lineBoxPx: style.lineHeightPx, color: mathColor })
          : undefined;
        return { ...s, mathRender: render };
      });
      contentBlock = { ...contentBlock, spans: enrichedSpans };
    }

    const hasRichSpans = contentBlock.spans.some((s) => s.bold || s.italic || s.mathRender);

    // List items reserve horizontal space for indent + bullet + gap.
    let measureMaxWidth = col.bbox.width;
    let lineXShift = 0;
    let measureFirstLineIndent = style.firstLineIndentPx;
    let measureHangingIndent = style.hangingIndent;
    if (listBullet) {
      const textGap = listBullet.bulletWidthPx + listBullet.gapPx;
      if (listBullet.hangingIndent) {
        measureMaxWidth = Math.max(1, col.bbox.width - listBullet.indentPx - textGap);
        lineXShift = listBullet.indentPx + textGap;
        measureFirstLineIndent = 0;
        measureHangingIndent = false;
      } else {
        measureMaxWidth = Math.max(1, col.bbox.width - listBullet.indentPx);
        lineXShift = listBullet.indentPx;
        measureFirstLineIndent = textGap;
        measureHangingIndent = false;
      }
    }
    const runtActive = resolved.bodyText.avoidRunts
      && (vdtType === 'paragraph'
        || (vdtType === 'listItem' && resolved.bodyText.avoidRuntsInLists));
    const measureOptions = {
      textAlign: style.textAlign,
      hyphenate: style.hyphenate,
      firstLineIndentPx: measureFirstLineIndent,
      hangingIndent: measureHangingIndent,
      optimal: resolved.bodyText.optimalLineBreaking,
      maxStretchRatio: resolved.bodyText.maxWordSpacing,
      minShrinkRatio: resolved.bodyText.minWordSpacing,
      runtPenalty: runtActive ? resolved.bodyText.runtPenalty : 0,
      runtMinCharacters: runtActive ? resolved.bodyText.runtMinCharacters : 0,
    };
    const useRich = hasRichSpans && style.boldFontString && style.italicFontString && style.boldItalicFontString;

    // Math display block: bypass text layout entirely. Produce a single
    // VDTLine whose bbox is the math render's pixel box, centred later.
    let mathDisplayRender: ReturnType<typeof renderMath> | undefined;
    let measured: MeasuredBlock;
    if (vdtType === 'mathDisplay') {
      const tex = rawBlock.tex ?? '';
      if (!mathEnabled) {
        // Fallback: render the literal TeX as a paragraph-like run.
        measured = useRich
          ? measureRichBlock(
              [{ text: `$$${tex}$$`, bold: false, italic: false }],
              style.fontString, style.fontString, style.fontString, style.fontString,
              measureMaxWidth, style.lineHeightPx, measureOptions,
            )
          : measureBlock(`$$${tex}$$`, style.fontString, measureMaxWidth, style.lineHeightPx, measureOptions);
      } else {
        // `renderMath` internally returns a cheap placeholder when MathJax
        // isn't initialised yet — no need to gate the call here. When the
        // real engine lands later, `CanvasPreview` bumps `resizeKey` and the
        // pipeline rebuilds with the genuine render.
        const render = renderMath(tex, true, style.fontSizePx, { color: style.color });
        mathDisplayRender = render;
        const width = Math.min(render.widthPx, measureMaxWidth);
        const height = render.heightPx;
        measured = {
          lines: [{
            text: '',
            bbox: { x: 0, y: 0, width, height },
            baseline: render.ascentPx,
            hyphenated: false,
            segments: [{ kind: 'math' as const, text: '\uFFFC', width, mathRender: render }],
            isLastLine: true,
          }],
          totalHeight: height,
        };
      }
    } else {
      measured = cache
        ? (useRich
            ? cachedMeasureRichBlock(contentBlock.spans, style.fontString, style.boldFontString!, style.italicFontString!, style.boldItalicFontString!, measureMaxWidth, style.lineHeightPx, measureOptions, cache)
            : cachedMeasureBlock(contentBlock.text, style.fontString, measureMaxWidth, style.lineHeightPx, measureOptions, cache))
        : (useRich
            ? measureRichBlock(contentBlock.spans, style.fontString, style.boldFontString!, style.italicFontString!, style.boldItalicFontString!, measureMaxWidth, style.lineHeightPx, measureOptions)
            : measureBlock(contentBlock.text, style.fontString, measureMaxWidth, style.lineHeightPx, measureOptions));
    }

    if (measured.lines.length === 0) continue;


    if (lineXShift > 0) {
      for (const line of measured.lines) {
        line.bbox.x += lineXShift;
      }
    }

    // Per-line source-range mapping using the block's plain→source map.
    // Accounts for heading numbering prefix which prepends chars with no source.
    const blockSrcStart = rawBlock.sourceStart + bodyOffset;
    const blockSrcEnd = rawBlock.sourceEnd + bodyOffset;
    const srcMap = rawBlock.sourceMap;
    const prefixLen = contentBlock.text.length - rawBlock.text.length;
    const plainToSrc = (p: number): number => {
      const idx = p - prefixLen;
      if (idx <= 0) return blockSrcStart;
      if (idx >= srcMap.length) return blockSrcEnd;
      return srcMap[idx]! + bodyOffset;
    };
    let cumPlain = 0;
    const lastLineIdx = measured.lines.length - 1;
    for (let li = 0; li < measured.lines.length; li++) {
      const line = measured.lines[li]!;
      // If segments are present, prefer their aggregate text length for a more
      // accurate plain-char count (excludes trailing hyphen for hyphenated lines).
      let lineLen: number;
      if (line.segments && line.segments.length > 0) {
        lineLen = line.segments.reduce((s, seg) => s + seg.text.length, 0);
        if (line.hyphenated) {
          const last = line.segments[line.segments.length - 1]!;
          if (last.text.endsWith('-')) lineLen -= 1;
        }
      } else {
        lineLen = line.text.length - (line.hyphenated ? 1 : 0);
      }
      line.plainStart = cumPlain;
      line.plainEnd = cumPlain + lineLen;
      // Advance past the separator space that was consumed to break the line
      // (skip when hyphenated — break was at a soft hyphen — or on the last line).
      const skipSeparator = !line.hyphenated && li !== lastLineIdx ? 1 : 0;
      cumPlain = line.plainEnd + skipSeparator;
      line.sourceStart = plainToSrc(line.plainStart);
      line.sourceEnd = plainToSrc(line.plainEnd);
    }

    const absoluteSourceMap = srcMap.map((o) => o + bodyOffset);

    const finalizeListItem = (blk: VDTBlock, isFirstPart: boolean) => {
      if (!listBullet) return;
      blk.listDepth = listDepth;
      blk.listKind = listKind;
      // Bullet (and its positional metadata) only belongs on the first part of
      // a split list item; continuation parts render without a bullet.
      if (!isFirstPart) return;
      blk.bulletText = listBullet.bulletText;
      blk.bulletFontString = listBullet.bulletFontString;
      blk.bulletColor = listBullet.bulletColor;
      // `bulletXOffsetInColumn` is `indentPx` for unordered/task, and
      // `indentPx + (maxNumberWidth - thisNumberWidth)` for ordered — giving
      // the right-aligned separator.
      blk.bulletOffsetX = blk.bbox.x + bulletXOffsetInColumn;
      if (strikethroughText) blk.strikethroughText = true;
      // Bullet Y = x-height midpoint of the item's first text line.
      // Pairs with `textBaseline='middle'` at render so the bullet stays
      // visually centered on the text regardless of its own font size.
      const firstLine = blk.lines[0];
      if (firstLine) {
        blk.bulletY = firstLine.baseline - listBullet.textFontSizePx * 0.3 + listBullet.verticalOffsetPx;
      }
    };

    const nextIsListItem = blockIdx + 1 < contentBlocks.length && contentBlocks[blockIdx + 1]!.type === 'listItem';

    // For headings, only snap to baseline grid if the next block is NOT a heading.
    // Consecutive headings flow without grid snapping; the last heading in the
    // group snaps so that the following body text realigns with the grid.
    // Same rule for list items: the LAST item of a list snaps so that text
    // after the list realigns with the baseline grid, even when non-grid
    // spacings (itemSpacing, marginTop/Bottom) were chosen.
    const nextBlock = blockIdx + 1 < contentBlocks.length ? contentBlocks[blockIdx + 1] : null;
    const nextIsHeading = nextBlock?.type === 'heading';
    const shouldSnapToGrid =
      (vdtType === 'heading' && !nextIsHeading) ||
      (vdtType === 'listItem' && !nextIsListItem) ||
      vdtType === 'mathDisplay';

    // Place block, splitting across columns/pages if needed.
    // List items may split too — orphan/widow protection per-list is gated by
    // `avoidOrphansInLists` / `avoidWidowsInLists`; bullet stays on first part.
    const canSplit = vdtType === 'paragraph' || vdtType === 'blockquote' || vdtType === 'listItem';
    let remainingLines = [...measured.lines];
    let partIndex = 0;

    // "Keep with next" for colon-introduced lists: a paragraph ending in `:`
    // followed directly by a list acts as a lead-in title — the colon-bearing
    // line must share a column with the first list item. Only checked for the
    // original, unsplit paragraph (partIndex === 0) on the iteration that is
    // about to place it.
    const endsWithColon = vdtType === 'paragraph'
      && resolved.bodyText.keepColonWithList
      && nextIsListItem
      && /:\s*$/.test(contentBlock.text);

    while (remainingLines.length > 0) {
      const curCol = currentColumn(doc, cursor);
      const isFirstInColumn = curCol.blocks.length === 0;

      // Compute spacing before this block — margin collapsing between
      // consecutive headings: only the larger of marginBottom / marginTop applies
      let spacingBefore = 0;
      if (!isFirstInColumn) {
        spacingBefore = pendingSpacing;
        if (vdtType === 'heading' || vdtType === 'mathDisplay') {
          spacingBefore = Math.max(spacingBefore, style.marginTopPx);
        } else if (vdtType === 'listItem') {
          const prevWasList = blockIdx > 0 && contentBlocks[blockIdx - 1]!.type === 'listItem';
          if (!prevWasList) {
            spacingBefore = Math.max(spacingBefore, style.marginTopPx);
          }
        }
      }

      const effectiveAvailable = curCol.availableHeight - spacingBefore;
      const linesPerAvailable = Math.floor(effectiveAvailable / style.lineHeightPx);
      // Math display blocks carry their natural pixel height on the single
      // VDTLine; text blocks use the uniform body lineHeightPx per line.
      const totalRemainHeight = vdtType === 'mathDisplay'
        ? (remainingLines[0]?.bbox.height ?? style.lineHeightPx)
        : remainingLines.length * style.lineHeightPx;

      // Keep-with-list: if this colon-paragraph would fit but would leave no
      // room for the first list item, split off the colon line (or push the
      // whole paragraph when it is a single line or the split would leave a
      // widow). Only applies to the original paragraph placement — once split,
      // the tail follows the list naturally in the next column.
      if (
        endsWithColon
        && partIndex === 0
        && totalRemainHeight <= effectiveAvailable
        && curCol.blocks.length > 0
      ) {
        const usedHeight = (curCol.bbox.height - curCol.availableHeight) + spacingBefore;
        const paragraphBottom = usedHeight + totalRemainHeight;
        const availableAfter = curCol.bbox.height - paragraphBottom;
        const nextListKind = (nextBlock as { listKind?: ListKind } | null)?.listKind ?? 'unordered';
        const nextListMarginDim = nextListKind === 'ordered'
          ? resolved.orderedLists.marginTop
          : resolved.unorderedLists.marginTop;
        const nextListMarginTopPx = dimensionToPx(nextListMarginDim, dpi, bodyStyle.fontSizePx);
        const effectiveGap = Math.max(style.marginBottomPx, nextListMarginTopPx);
        const minSpaceForList = effectiveGap + bodyStyle.lineHeightPx;
        if (availableAfter < minSpaceForList) {
          const effectiveWidowMin = resolved.bodyText.avoidWidows
            ? Math.max(1, resolved.bodyText.widowMinLines)
            : 1;
          const splitAt = remainingLines.length - 1;
          if (splitAt >= effectiveWidowMin) {
            if (spacingBefore > 0) curCol.availableHeight -= spacingBefore;
            const splitLines = remainingLines.slice(0, splitAt);
            const blk = createVDTBlock(id, vdtType, style.fontString, style.color, style.textAlign);
            if (style.boldFontString) blk.boldFontString = style.boldFontString;
            if (style.italicFontString) blk.italicFontString = style.italicFontString;
            if (style.boldItalicFontString) blk.boldItalicFontString = style.boldItalicFontString;
            if (style.boldColor) blk.boldColor = style.boldColor;
            if (style.italicColor) blk.italicColor = style.italicColor;
            blk.headingLevel = headingLevel;
            if (numberPrefix) blk.numberPrefix = numberPrefix;
            blk.lines = resetLinePositions(splitLines, style.lineHeightPx);
            blk.dirty = false;
            blk.snappedToGrid = false;
            blk.sourceStart = splitLines[0]!.sourceStart;
            blk.sourceEnd = splitLines[splitLines.length - 1]!.sourceEnd;
            blk.sourceMap = absoluteSourceMap;
            blk.plainPrefixLen = prefixLen;
            placeBlockInColumn(blk, splitAt * style.lineHeightPx, curCol, cursor);
            doc.blocks.push(blk);
            remainingLines = remainingLines.slice(splitAt);
            partIndex++;
            pendingSpacing = 0;
            advanceToNextColumn(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx);
            continue;
          }
          // Can't cleanly split the colon line off — would create a widow.
          // Pushing the whole paragraph keeps the colon+list together, but
          // strands any trailing heading(s) as last-in-column orphans. Roll
          // those along with the paragraph when there's non-heading content
          // before them; if the column contains only heading(s) (fresh after
          // a prior rollback), rolling back again would loop — fall through
          // and place the paragraph here, trading the heading-orphan for a
          // softer colon/list separation.
          let headingRunCount = 0;
          if (resolved.headings.keepWithNext) {
            for (let j = curCol.blocks.length - 1; j >= 0; j--) {
              if (curCol.blocks[j]!.type === 'heading') headingRunCount++;
              else break;
            }
          }
          if (headingRunCount > 0 && headingRunCount < curCol.blocks.length) {
            const popped = curCol.blocks.splice(curCol.blocks.length - headingRunCount);
            for (const p of popped) {
              const idx = doc.blocks.indexOf(p);
              if (idx !== -1) doc.blocks.splice(idx, 1);
              curCol.availableHeight += p.bbox.height;
            }
            blockIdx -= headingRunCount + 1;
            pendingSpacing = 0;
            advanceToNextColumn(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx);
            break;
          }
          if (headingRunCount === 0) {
            pendingSpacing = 0;
            advanceToNextColumn(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx);
            continue;
          }
          // headingRunCount === curCol.blocks.length: fall through to place.
        }
      }

      // Block fits in current column
      if (totalRemainHeight <= effectiveAvailable) {
        // Heading keep-with-next: never leave a heading as the last block of a
        // column. If the following (non-heading) block wouldn't have room to
        // place at least its widow-minimum number of lines after this heading,
        // push the heading to the next column so it stays joined to its text.
        // The threshold matches the body's widow penalty so the body doesn't
        // just get pushed whole, leaving the heading orphaned anyway. When a
        // run of consecutive headings ends in a pushed heading, any preceding
        // headings already placed in this column are rolled back and re-placed
        // with it in the next column — otherwise the earlier headings would be
        // left behind as their own orphans.
        if (
          vdtType === 'heading'
          && resolved.headings.keepWithNext
          && !nextIsHeading
          && nextBlock !== null
          && curCol.blocks.length > 0
        ) {
          const wouldUsedHeight =
            (curCol.bbox.height - curCol.availableHeight) + spacingBefore;
          const naturalBottom = wouldUsedHeight + totalRemainHeight + style.marginBottomPx;
          const snappedBottom = shouldSnapToGrid
            ? Math.ceil((naturalBottom - 0.01) / baselineGrid) * baselineGrid
            : naturalBottom;
          const remainAfterHeading = curCol.bbox.height - snappedBottom;
          const minLinesNeeded = resolved.bodyText.avoidWidows
            ? Math.max(1, resolved.bodyText.widowMinLines)
            : 1;
          const minSpaceAfter = minLinesNeeded * bodyStyle.lineHeightPx;
          if (remainAfterHeading < minSpaceAfter) {
            // Roll back any immediately-preceding heading blocks in this
            // column so they travel with this one.
            let rollbackCount = 0;
            for (let j = curCol.blocks.length - 1; j >= 0; j--) {
              if (curCol.blocks[j]!.type === 'heading') rollbackCount++;
              else break;
            }
            if (rollbackCount > 0) {
              const popped = curCol.blocks.splice(curCol.blocks.length - rollbackCount);
              for (const p of popped) {
                const idx = doc.blocks.indexOf(p);
                if (idx !== -1) doc.blocks.splice(idx, 1);
                curCol.availableHeight += p.bbox.height;
              }
              // Rewind so the for-loop's blockIdx++ lands on the first
              // rolled-back heading.
              blockIdx -= rollbackCount + 1;
              pendingSpacing = 0;
              advanceToNextColumn(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx);
              break;
            }
            pendingSpacing = 0;
            advanceToNextColumn(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx);
            continue;
          }
        }

        // Consume spacing
        if (spacingBefore > 0) {
          curCol.availableHeight -= spacingBefore;
        }

        const partId = partIndex === 0 ? id : `${id}-cont-${partIndex}`;
        const blk = createVDTBlock(partId, vdtType, style.fontString, style.color, style.textAlign);
        if (style.boldFontString) blk.boldFontString = style.boldFontString;
        if (style.italicFontString) blk.italicFontString = style.italicFontString;
        if (style.boldItalicFontString) blk.boldItalicFontString = style.boldItalicFontString;
        if (style.boldColor) blk.boldColor = style.boldColor;
        if (style.italicColor) blk.italicColor = style.italicColor;
        if (partIndex === 0) { blk.headingLevel = headingLevel; if (numberPrefix) blk.numberPrefix = numberPrefix; }
        if (vdtType === 'mathDisplay' && mathDisplayRender) {
          blk.mathRender = mathDisplayRender;
          blk.tex = rawBlock.tex;
          // Place the single line using its natural height (not the body lineHeight).
          const mathLine = { ...remainingLines[0]!, bbox: { ...remainingLines[0]!.bbox, y: 0 } };
          blk.lines = [mathLine];
        } else {
          blk.lines = resetLinePositions(remainingLines, style.lineHeightPx);
        }
        blk.dirty = false;
        blk.snappedToGrid = shouldSnapToGrid && partIndex === 0;
        if (remainingLines.length > 0) {
          blk.sourceStart = remainingLines[0]!.sourceStart ?? rawBlock.sourceStart + bodyOffset;
          blk.sourceEnd = remainingLines[remainingLines.length - 1]!.sourceEnd ?? rawBlock.sourceEnd + bodyOffset;
        }
        if (vdtType === 'mathDisplay') {
          blk.sourceStart = rawBlock.sourceStart + bodyOffset;
          blk.sourceEnd = rawBlock.sourceEnd + bodyOffset;
        }
        blk.sourceMap = absoluteSourceMap;
        blk.plainPrefixLen = prefixLen;

        let h = totalRemainHeight;
        if (shouldSnapToGrid && partIndex === 0) {
          // Snap using the absolute position in the column so that the block
          // bottom lands on a baseline grid line. This accounts for off-grid
          // starts (e.g. after consecutive unsnapped headings) and bakes in
          // the minimum marginBottom — the grid always wins, but the margin
          // below is guaranteed to be at least marginBottomPx.
          const usedHeight = curCol.bbox.height - curCol.availableHeight;
          const naturalBottom = usedHeight + totalRemainHeight + style.marginBottomPx;
          // Tolerance guards against FP drift: if naturalBottom is already on
          // the grid (e.g. marginBottom is an exact multiple of baselineGrid),
          // don't round up to the next line.
          const snappedBottom = Math.ceil((naturalBottom - 0.01) / baselineGrid) * baselineGrid;
          h = snappedBottom - usedHeight;
        }
        placeBlockInColumn(blk, h, curCol, cursor);
        finalizeListItem(blk, partIndex === 0);
        doc.blocks.push(blk);
        // For snapped headings/list-tails the margin is baked into the snap;
        // for unsnapped ones (consecutive) track it for collapsing
        if (vdtType === 'listItem' && nextIsListItem) {
          pendingSpacing = listBullet!.itemSpacingPx;
        } else {
          pendingSpacing = (shouldSnapToGrid && partIndex === 0) ? 0 : style.marginBottomPx;
        }
        break;
      }

      // Block doesn't fit — try to split (orphan/widow-aware)
      const inList = vdtType === 'listItem';
      const effectiveAvoidOrphans = resolved.bodyText.avoidOrphans
        && (!inList || resolved.bodyText.avoidOrphansInLists);
      const effectiveAvoidWidows = resolved.bodyText.avoidWidows
        && (!inList || resolved.bodyText.avoidWidowsInLists);
      if (canSplit && linesPerAvailable >= 1) {
        const choice = chooseParagraphSplit(remainingLines.length, linesPerAvailable, {
          avoidOrphans: effectiveAvoidOrphans,
          orphanMinLines: resolved.bodyText.orphanMinLines,
          orphanPenalty: resolved.bodyText.orphanPenalty,
          avoidWidows: effectiveAvoidWidows,
          widowMinLines: resolved.bodyText.widowMinLines,
          widowPenalty: resolved.bodyText.widowPenalty,
          slackWeight: resolved.bodyText.slackWeight,
        });
        if (choice.splitAt > 0) {
          // Consume spacing
          if (spacingBefore > 0) {
            curCol.availableHeight -= spacingBefore;
          }

          const partId = partIndex === 0 ? id : `${id}-cont-${partIndex}`;
          const splitLines = remainingLines.slice(0, choice.splitAt);

          const blk = createVDTBlock(partId, vdtType, style.fontString, style.color, style.textAlign);
          if (style.boldFontString) blk.boldFontString = style.boldFontString;
          if (style.italicFontString) blk.italicFontString = style.italicFontString;
          if (style.boldItalicFontString) blk.boldItalicFontString = style.boldItalicFontString;
          if (style.boldColor) blk.boldColor = style.boldColor;
          if (style.italicColor) blk.italicColor = style.italicColor;
          if (partIndex === 0) { blk.headingLevel = headingLevel; if (numberPrefix) blk.numberPrefix = numberPrefix; }
          blk.lines = resetLinePositions(splitLines, style.lineHeightPx);
          blk.dirty = false;
          blk.snappedToGrid = false;
          if (splitLines.length > 0) {
            blk.sourceStart = splitLines[0]!.sourceStart;
            blk.sourceEnd = splitLines[splitLines.length - 1]!.sourceEnd;
          }
          blk.sourceMap = absoluteSourceMap;
          blk.plainPrefixLen = prefixLen;

          const splitHeight = choice.splitAt * style.lineHeightPx;
          placeBlockInColumn(blk, splitHeight, curCol, cursor);
          finalizeListItem(blk, partIndex === 0);
          doc.blocks.push(blk);

          remainingLines = remainingLines.slice(choice.splitAt);
          partIndex++;
          pendingSpacing = 0;
          advanceToNextColumn(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx);
          continue;
        }
        // choice.splitAt === 0: fall through to push whole paragraph to next column
      }

      // Cannot split — advance to next column if current has content
      if (curCol.blocks.length > 0) {
        // Heading keep-with-next (no-fit variant): when a heading can't fit
        // in the current column and the column's tail is a run of headings,
        // pull those headings along so they don't remain stranded as orphans
        // at the column's bottom. Mirrors the rollback inside the "fits" path.
        if (vdtType === 'heading' && resolved.headings.keepWithNext) {
          let rollbackCount = 0;
          for (let j = curCol.blocks.length - 1; j >= 0; j--) {
            if (curCol.blocks[j]!.type === 'heading') rollbackCount++;
            else break;
          }
          if (rollbackCount > 0) {
            const popped = curCol.blocks.splice(curCol.blocks.length - rollbackCount);
            for (const p of popped) {
              const idx = doc.blocks.indexOf(p);
              if (idx !== -1) doc.blocks.splice(idx, 1);
              curCol.availableHeight += p.bbox.height;
            }
            blockIdx -= rollbackCount + 1;
            pendingSpacing = 0;
            advanceToNextColumn(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx);
            break;
          }
        }
        pendingSpacing = 0;
        advanceToNextColumn(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx);
        continue;
      }

      // Empty column but block still doesn't fit (block taller than page) — place anyway
      const partId = partIndex === 0 ? id : `${id}-cont-${partIndex}`;
      const blk = createVDTBlock(partId, vdtType, style.fontString, style.color, style.textAlign);
      if (style.boldFontString) blk.boldFontString = style.boldFontString;
      if (style.italicFontString) blk.italicFontString = style.italicFontString;
      if (style.boldItalicFontString) blk.boldItalicFontString = style.boldItalicFontString;
      if (style.boldColor) blk.boldColor = style.boldColor;
      if (style.italicColor) blk.italicColor = style.italicColor;
      if (partIndex === 0) blk.headingLevel = headingLevel;
      blk.lines = resetLinePositions(remainingLines, style.lineHeightPx);
      blk.dirty = false;
      blk.snappedToGrid = false;
      if (remainingLines.length > 0) {
        blk.sourceStart = remainingLines[0]!.sourceStart;
        blk.sourceEnd = remainingLines[remainingLines.length - 1]!.sourceEnd;
      }
      blk.sourceMap = absoluteSourceMap;
      blk.plainPrefixLen = prefixLen;

      placeBlockInColumn(blk, totalRemainHeight, curCol, cursor);
      finalizeListItem(blk, partIndex === 0);
      doc.blocks.push(blk);
      if (vdtType === 'listItem') {
        pendingSpacing = nextIsListItem ? listBullet!.itemSpacingPx : style.marginBottomPx;
      } else {
        pendingSpacing = style.marginBottomPx;
      }
      break;
    }
  }

  doc.converged = true;
  doc.iterationCount = 1;

  return doc;
}
