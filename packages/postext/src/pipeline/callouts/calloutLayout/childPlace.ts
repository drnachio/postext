// Placing one child of a box: a strip child, a block, a resource or a
// nested fence, and the margins containers add.
// Part of layoutCallout (layoutCallout.ts), split out of it in #1276.
import type { ContentBlock } from '../../../parse/index.js';
import { type VDTBlock, createBoundingBox, createVDTBlock } from '../../../vdt.js';
import { type CalloutUnit, designedBoxHeadings, type CalloutLayoutInput } from './inputs.js';
import { shiftLineX, getMeasureDirection, getMeasureArabicNumbers } from '../../../measure/rtl/bidiLines.js';
import type { CalloutLineWidth } from '../../columns/cutTypes.js';
import { containerStyle, paragraphStyleIdOf, type ParagraphContainer } from '../paragraphContainers.js';
import { measureContentBlock, type BlockMeasureContext, type MeasureContentBlockOptions, type MeasuredContentBlock } from '../../blocks/measureContentBlock.js';
import { measureBlockMemo } from '../../composedPages/measureMemo.js';
import { headingIsHidden, headingStyleOf } from '../../sections/headingStyles.js';
import { listItemGapPx, mirrorListMarker, directListMarker, listBulletPosition } from '../../text/lists.js';
import { exclusionInsets, offsetResourceBlock, type BoxExclusion } from './geometry.js';
import { applyStyleAttrs, widthLessEndIndent } from '../../blocks/buildHelpers.js';
import { tocBlockStamps } from '../../contents/toc.js';
import { raggedLooseLines } from '../../text/raggedLines.js';
import { scoreInfoOf } from '../../resources/scoreBlocks.js';
import { resetLinePositions } from '../../blocks/placement.js';
import { measuringVertically } from '../../../measure/vertical.js';
import type { ResolvedCalloutStyleConfig } from '../../../types/boxes/callouts.js';
import type { BlockStyle } from '../../styles.js';
import type { Stack } from './layoutCalloutTypes.js';

/** What createChildPlace takes from the pass. */
export interface ChildPlaceDeps {
  input: CalloutLayoutInput;
  style: ResolvedCalloutStyleConfig;
  childStartIdx: number;
  ctx: BlockMeasureContext;
  containerId: number;
  children: readonly ContentBlock[];
  derivedCtx: BlockMeasureContext;
  bodyStyle: BlockStyle;
  restyleContainer: (container: ParagraphContainer | undefined) => ParagraphContainer | undefined;
  innerTop: number;
  exclusions: BoxExclusion[];
  highlights: { y: number; height: number }[];
  nestPath: readonly number[] | undefined;
  resourceGapPx: number;
  resourceGapBelow: boolean;
  isFirstRealOf: (k: number) => boolean;
  isLastRealOf: (k: number) => boolean;
  measureFirstChildAcrossWidths: (raw: ContentBlock, blockIdx: number, k: number, width: number, styleOverride: MeasureContentBlockOptions["styleOverride"]) => MeasuredContentBlock | undefined;
  measureAcrossSteps: (raw: ContentBlock, blockIdx: number, styleOverride: MeasureContentBlockOptions["styleOverride"], lineFrom: number, steps: readonly { fromLine: number; columnWidth: number; }[]) => MeasuredContentBlock | undefined;
  isStripChild: (raw: ContentBlock) => boolean;
}

export function createChildPlace(deps: ChildPlaceDeps) {
  const {
    input, style, childStartIdx, ctx, containerId, children, derivedCtx, bodyStyle, restyleContainer,
    innerTop, exclusions, highlights, nestPath, resourceGapPx, resourceGapBelow, isFirstRealOf,
    isLastRealOf, measureFirstChildAcrossWidths, measureAcrossSteps, isStripChild
  } = deps;
  /** Lay out a comic strip child at `width` from `x`: an atomic block with
   *  the gap of an inline resource around it, as in running text. */
  const placeStripChild = (raw: ContentBlock, k: number, width: number, x: number, st: Stack, into: VDTBlock[], unitsInto: CalloutUnit[]): VDTBlock | undefined => {
    const blk = input.stripBlock!(raw, childStartIdx + k, width);
    if (!blk) return undefined;
    const marginTopPx = resourceGapPx;
    const marginBottomPx = resourceGapBelow ? resourceGapPx : 0;
    st.cursorY += st.first ? st.prevMarginBottom : Math.max(st.prevMarginBottom, marginTopPx);
    const height = blk.bbox.height;
    blk.containerId = containerId;
    if (nestPath) blk.calloutPath = [...nestPath];
    blk.bbox = createBoundingBox(x, st.cursorY, width, height);
    for (const line of blk.lines) {
      shiftLineX(line, x);
      line.bbox.y += st.cursorY;
      line.baseline += st.cursorY;
    }
    into.push(blk);
    unitsInto.push({ kind: 'block', block: blk });
    st.cursorY += height;
    st.prevMarginBottom = marginBottomPx;
    st.pull = false;
    st.prevWasListItem = false;
    st.prevListItem = undefined;
    st.first = false;
    return blk;
  };
  /** Lay out one child at `width` from `x`, appending it to `into` and
   *  advancing the stack. `lineCut`: the lines of the child to keep, in
   *  place of the box's own line cuts — a paragraph of a `:::columns` group
   *  a fragment opens (`from`) or ends (`to`) inside (#634); `widths` are
   *  the sub-column widths its lines before `from` were set at. */
  const placeChild = (
    raw: ContentBlock,
    k: number,
    width: number,
    x: number,
    st: Stack,
    into: VDTBlock[],
    unitsInto: CalloutUnit[],
    lineCut?: { from: number; to?: number; widths?: readonly CalloutLineWidth[] },
  ): VDTBlock | undefined => {
    if (isStripChild(raw)) return placeStripChild(raw, k, width, x, st, into, unitsInto);
    // The repeat of a contents block's head row (#850): set where the
    // fragment goes on in a cut block, skipped everywhere else (#983), as
    // the running text sets it only at the head of a fresh column.
    if (raw.toc?.group?.role === 'continuation' && !isFirstRealOf(k)) return undefined;
    const blockIdx = childStartIdx + k;
    // Inside a `:::paragraphs` container: its style, and for the block that
    // closes it the tail style, which carries the container's bottom margin.
    const container = restyleContainer(input.paragraphContainers?.byBlock[blockIdx]);
    const next = children[k + 1];
    const isContainerTail = container !== undefined && next?.type === 'containerEnd' && next.containerId === container.id;
    const styleOverride = container ? containerStyle(container, isContainerTail, bodyStyle, derivedCtx.resolved.page.dpi) : undefined;
    const groupWidths = lineCut?.widths;
    const acrossGroup = lineCut && lineCut.from > 0 && groupWidths && groupWidths.some((h) => Math.abs(h.width - width) > 0.5)
      ? measureAcrossSteps(raw, blockIdx, styleOverride, lineCut.from, [
        ...groupWidths.map((h) => ({ fromLine: h.fromLine, columnWidth: h.width })),
        ...(Math.abs(groupWidths[groupWidths.length - 1]!.width - width) > 0.5 ? [{ fromLine: lineCut.from, columnWidth: width }] : []),
      ])
      : undefined;
    let measuredBlock = acrossGroup
      ?? (lineCut ? undefined : measureFirstChildAcrossWidths(raw, blockIdx, k, width, styleOverride))
      ?? (input.uprightMaxLength !== undefined && raw.type === 'resourceBlock'
        // A turned frame's picture takes room across the page along the
        // box's stacking axis: what the box has left, the gaps kept. Only
        // the gaps the box sets (#1078): none above the box's first block,
        // none below its last, as the spacing below and the box's height
        // count them; else a frame as tall as its picture needs would set
        // the picture smaller than it measured it. A resource block is
        // never kept in the measure memo.
        ? measureContentBlock(raw, blockIdx, width, derivedCtx, {
          styleOverride,
          uprightMaxLength: Math.max(1, input.uprightMaxLength - (st.cursorY - innerTop)
            - (st.first ? st.prevMarginBottom : Math.max(st.prevMarginBottom, resourceGapPx))
            - (resourceGapBelow && !isLastRealOf(k) ? resourceGapPx : 0)),
        })
        : input.measureMemo
          ? measureBlockMemo(input.measureMemo, ctx, style, derivedCtx, raw, blockIdx, width, styleOverride)
          : measureContentBlock(raw, blockIdx, width, derivedCtx, { styleOverride }));
    if (!measuredBlock) return undefined;
    // A picture the reflow ladder scales (#858): set again at that share of
    // its width.
    const pictureScale = input.pictureScale;
    const picture = measuredBlock.resourceBlock;
    if (pictureScale !== undefined && pictureScale > 0 && pictureScale < 1 && picture && picture.kind !== 'table' && !picture.rotation) {
      const smaller = measureContentBlock(raw, blockIdx, width, derivedCtx, { styleOverride, figureMaxBodyWidth: picture.bodyRect.width * pictureScale });
      if (smaller) measuredBlock = smaller;
    }
    const { kind, mathDisplayRender, resourceBlock, code } = measuredBlock;
    let { measured, prefixLen, absoluteSourceMap, letterSpacingPx, runtTracking } = measuredBlock;
    const { vdtType, headingLevel, numberPrefix, numberSeparator, headingNumber, listBullet, listDepth, listKind, bulletXOffsetInColumn, strikethroughText } = kind;
    // A structural heading (`hidden`) keeps its lines' text but prints
    // nothing and takes no room: no line height, no margins, and the
    // spacing around it collapses as if it were not there.
    const hiddenHeading = vdtType === 'heading' && headingIsHidden(
      raw,
      derivedCtx.headingLevels?.forBlock(raw) ?? derivedCtx.resolved.headings.levels.find((l) => l.level === raw.level),
    );
    const bs = hiddenHeading ? { ...kind.style, lineHeightPx: 0, marginTopPx: 0, marginBottomPx: 0 } : kind.style;
    // An inline resource keeps the gap as in running text (EF-117): a line
    // of the box's text above it, and below it with `'around'`.
    const inlineResource = vdtType === 'resource' && !!resourceBlock;
    const marginTopPx = inlineResource ? Math.max(bs.marginTopPx, resourceGapPx) : bs.marginTopPx;
    const marginBottomPx = inlineResource && resourceGapBelow ? Math.max(bs.marginBottomPx, resourceGapPx) : bs.marginBottomPx;

    // Spacing above: margin collapsing, list-item spacing inside a run. A
    // pull (a negative container margin) applies as it is, unless the
    // block has a top margin of its own — as in running text.
    let spacing: number;
    if (hiddenHeading) {
      spacing = 0;
    } else if (st.first) {
      spacing = st.prevMarginBottom;
    } else if (st.pull && marginTopPx <= 0) {
      spacing = st.prevMarginBottom;
    } else if (vdtType === 'listItem' && st.prevWasListItem) {
      // The shallower list's spacing, as in running text (EF-165).
      const here = { spacingPx: listBullet ? listBullet.itemSpacingPx : 0, depth: listDepth ?? 1 };
      spacing = st.prevListItem ? listItemGapPx(st.prevListItem, here) : here.spacingPx;
    } else {
      spacing = Math.max(st.prevMarginBottom, marginTopPx);
    }
    st.cursorY += spacing;
    // A frame's text runs round the frames that push it (#855): set again
    // with its lines short beside them. A child the range opens inside
    // keeps the lines it was counted with.
    const opensInside = lineCut ? lineCut.from > 0 : isFirstRealOf(k) && (input.lineFrom ?? 0) > 0;
    // A drop cap (#623) in a composed page's frame (#922): on the piece
    // that holds the paragraph's first line, its rise kept clear above.
    const cap = measuredBlock.dropCap && !opensInside ? measuredBlock.dropCap : undefined;
    if (cap && cap.rise > 0.5) st.cursorY += cap.rise;
    if (exclusions.length > 0 && !opensInside && !(vdtType === 'resource' && resourceBlock) && !(vdtType === 'mathDisplay' && mathDisplayRender) && vdtType !== 'score') {
      const lineInsets = exclusionInsets(exclusions, x, width, st.cursorY, kind.style.lineHeightPx);
      if (lineInsets.length > 0) {
        const again = measureContentBlock(raw, blockIdx, width, derivedCtx, { styleOverride, lineInsets });
        if (again) ({ measured, prefixLen, absoluteSourceMap, letterSpacingPx, runtTracking } = again);
      }
    }

    const blk = createVDTBlock(input.nextChildId(), vdtType, bs.fontString, bs.color, bs.textAlign);
    applyStyleAttrs(blk, bs);
    // The tracking the lines were measured with (a runt set one line
    // shorter, a heading level's `letterSpacing`): painted as measured,
    // as in the flow (EF-111).
    if (letterSpacingPx !== undefined) blk.letterSpacing = letterSpacingPx;
    if (runtTracking !== undefined) blk.runtFix = { tracking: runtTracking };
    blk.contentIndex = blockIdx;
    blk.containerId = containerId;
    const paragraphStyleId = paragraphStyleIdOf(raw, container, derivedCtx.resolved);
    if (paragraphStyleId !== undefined) blk.paragraphStyleId = paragraphStyleId;
    blk.dirty = false;
    blk.snappedToGrid = false;
    blk.headingLevel = headingLevel;
    if (nestPath) blk.calloutPath = [...nestPath];
    if (numberPrefix) { blk.numberPrefix = numberPrefix; if (numberSeparator !== undefined) blk.numberSeparator = numberSeparator; }
    if (headingNumber !== undefined) blk.headingNumber = headingNumber;
    if (hiddenHeading) blk.hidden = true;
    // A row of the contents (#983): the page it links to, or the values of
    // its part row's design.
    if (raw.toc) Object.assign(blk, tocBlockStamps(raw));
    blk.sourceMap = absoluteSourceMap;
    blk.plainPrefixLen = prefixLen;

    // Line-level cut of the first / last child (split boxes): the kept
    // run of lines, and whether this child opens after its first line
    // (no bullet then — the head carries it).
    const isTextRun = !(vdtType === 'resource' && resourceBlock) && !(vdtType === 'mathDisplay' && mathDisplayRender) && vdtType !== 'score';
    const isFirstReal = isFirstRealOf(k);
    const isLastReal = isLastRealOf(k);
    const lineFrom = !isTextRun ? 0 : lineCut ? Math.max(0, lineCut.from) : isFirstReal ? Math.max(0, input.lineFrom ?? 0) : 0;
    const cutTo = lineCut ? lineCut.to : isLastReal ? input.lineTo : undefined;
    const lineTo = isTextRun && cutTo !== undefined
      ? Math.max(lineFrom + 1, Math.min(cutTo, measured.lines.length))
      : measured.lines.length;
    // A justified line the breaker could not fill is set ragged, as in the
    // running text (EF-104): a box's narrow measure is where it happens most.
    const textLines = isTextRun ? raggedLooseLines(measured.lines, bs.textAlign) : measured.lines;
    const keptLines = isTextRun ? textLines.slice(Math.min(lineFrom, textLines.length - 1), lineTo) : measured.lines;
    const openedMidRun = lineFrom > 0;

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
    } else if (vdtType === 'score') {
      // A score system in a box (#1172): its own height, never cut.
      const systemLine = { ...measured.lines[0]!, bbox: { ...measured.lines[0]!.bbox, y: 0 } };
      blk.lines = [systemLine];
      height = systemLine.bbox.height;
      if (raw.score) blk.score = scoreInfoOf(raw.score);
      blk.sourceStart = raw.sourceStart + ctx.bodyOffset;
      blk.sourceEnd = raw.sourceEnd + ctx.bodyOffset;
    } else {
      blk.lines = resetLinePositions(keptLines, bs.lineHeightPx);
      height = blk.lines.length * bs.lineHeightPx;
      blk.sourceStart = keptLines[0]!.sourceStart ?? raw.sourceStart + ctx.bodyOffset;
      blk.sourceEnd = keptLines[keptLines.length - 1]!.sourceEnd ?? raw.sourceEnd + ctx.bodyOffset;
      // A short paragraph keeps the room under its initial (`'reserve'`).
      if (cap && cutTo === undefined) height = Math.max(height, cap.minLines * bs.lineHeightPx);
    }

    // A heading with a design of its own (#906): the box keeps the room
    // the design takes, as a page column does. A heading opened after its
    // first line has no design to draw.
    const blockWidth = widthLessEndIndent(blk, width);
    if (vdtType === 'heading' && !hiddenHeading && !openedMidRun && isTextRun && input.headingDesign) {
      const reserve = input.headingDesign(raw, blockIdx, { lines: measured.lines, numberPrefix: numberPrefix ?? '', ...(headingNumber !== undefined ? { headingNumber } : {}) }, blockWidth);
      if (reserve !== undefined) {
        designedBoxHeadings.add(blk);
        if (Number.isFinite(reserve) && reserve > height) height = reserve;
        const offset = input.bodyOffset ?? ctx.bodyOffset;
        const styleId = headingStyleOf(raw, input.resolved)?.id;
        blk.boxDesign = {
          ...(styleId !== undefined ? { styleId } : {}),
          ...(raw.attrs ? { attrs: raw.attrs } : {}),
          ...(raw.attrSources ? { attrSources: Object.fromEntries(Object.entries(raw.attrSources).map(([k, r]) => [k, { start: r.start + offset, end: r.end + offset }])) } : {}),
          ...(raw.titleBreaks ? { titleBreaks: raw.titleBreaks, titleLength: raw.text.length } : {}),
        };
      }
    }

    // Relocate to the inner rect (box-relative).
    blk.bbox = createBoundingBox(x, st.cursorY, blockWidth, height);
    for (const line of blk.lines) {
      shiftLineX(line, x);
      line.bbox.y += st.cursorY;
      line.baseline += st.cursorY;
    }
    if (blk.resourceBlock) offsetResourceBlock(blk.resourceBlock, x, st.cursorY);
    const capLine = blk.lines[0];
    if (cap && capLine && isTextRun) {
      // As the flow stamps it (`build.ts`): on the baseline of the line it
      // sinks to.
      blk.dropCap = {
        text: cap.text,
        fontString: cap.fontString,
        color: cap.color,
        x: blk.bbox.x + cap.x,
        baselineY: capLine.baseline + (cap.sink - 1) * bs.lineHeightPx,
        width: cap.width,
        fontSizePx: cap.fontSizePx,
        lines: cap.lines,
        sink: cap.sink,
        ...(cap.sourceStart !== undefined ? { sourceStart: cap.sourceStart, sourceEnd: cap.sourceEnd } : {}),
        plainStart: cap.plainStart,
        plainEnd: cap.plainEnd,
        word: cap.word,
        wordRest: cap.wordRest,
        ...(cap.hang ? { hang: { text: cap.hang.text, fontString: cap.hang.fontString, x: blk.bbox.x + cap.hang.x, baselineY: capLine.baseline, width: cap.hang.width } } : {}),
      };
      if (cap.sourceStart !== undefined && (blk.sourceStart === undefined || cap.sourceStart < blk.sourceStart)) blk.sourceStart = cap.sourceStart;
    }
    // A code listing (#624): its language, numbers and fit; the lines a
    // fence highlights get a band across the box.
    if (code) {
      blk.code = code;
      if (measuredBlock.direction) blk.direction = measuredBlock.direction;
      for (const line of blk.lines) if (line.codeLine?.highlight) highlights.push({ y: line.bbox.y, height: line.bbox.height });
    }

    if (listBullet && !openedMidRun) {
      blk.listDepth = listDepth;
      blk.listKind = listKind;
      // A task item's drawn box (#765) stands for its character and face.
      if (listBullet.box) blk.bulletBox = listBullet.box;
      else {
        blk.bulletText = listBullet.bulletText;
        blk.bulletFontString = listBullet.bulletFontString;
      }
      blk.bulletColor = listBullet.bulletColor;
      blk.bulletOffsetX = x + bulletXOffsetInColumn;
      if (listBullet.separatorText !== undefined) {
        blk.separatorText = listBullet.separatorText;
        blk.separatorFontString = listBullet.separatorFontString;
        blk.separatorColor = listBullet.separatorColor;
        blk.separatorX = blk.bulletOffsetX + (listBullet.separatorOffsetPx ?? 0);
        if (listBullet.prefixText !== undefined) {
          blk.prefixText = listBullet.prefixText;
          blk.prefixX = blk.bulletOffsetX + (listBullet.prefixOffsetPx ?? 0);
        }
      }
      // A list set against the document's direction (#371).
      if (raw.direction !== undefined && raw.direction !== getMeasureDirection()) mirrorListMarker(blk);
      // And reads in its item's direction (#664).
      directListMarker(blk, raw.direction ?? getMeasureDirection(), getMeasureArabicNumbers(), measuringVertically());
      if (strikethroughText) blk.strikethroughText = true;
      const firstLine = blk.lines[0];
      if (firstLine) {
        const at = listBulletPosition(listBullet, firstLine.baseline);
        blk.bulletY = at.bulletY;
        if (at.bulletBaselineY !== undefined) blk.bulletBaselineY = at.bulletBaselineY;
      }
    } else if (listBullet) {
      blk.listDepth = listDepth;
      blk.listKind = listKind;
    }

    into.push(blk);
    unitsInto.push({ kind: 'block', block: blk });
    st.cursorY += height;
    if (!hiddenHeading) {
      st.prevMarginBottom = marginBottomPx;
      // A negative container bottom margin pulls the next block up.
      st.pull = isContainerTail && bs.marginBottomPx < 0;
      st.prevWasListItem = vdtType === 'listItem';
      st.prevListItem = vdtType === 'listItem' ? { spacingPx: listBullet ? listBullet.itemSpacingPx : 0, depth: listDepth ?? 1 } : undefined;
      st.first = false;
    }
    return blk;
  };

  /** A `:::paragraphs` fence among the children: the container's top margin
   *  on entry, and its bottom margin on exit when the block before is not a
   *  paragraph (a closing paragraph carries it in its tail style). Each
   *  collapses with the spacing already there, as in running text; a
   *  negative one pulls (see `Stack.pull`). At the top of the box it
   *  vanishes, as at the top of a column. Under a closing paragraph the
   *  space is at least the box's paragraph spacing, as between two
   *  paragraphs of its text (`bodyText.paragraphContainerSpacing:
   *  'collapse'`, EF-181). */
  const containerMargin = (raw: ContentBlock, k: number, st: Stack): void => {
    if ((raw.type !== 'containerStart' && raw.type !== 'containerEnd') || raw.containerId === undefined) return;
    const pc = restyleContainer(input.paragraphContainers?.byId.get(raw.containerId));
    if (!pc || st.first) return;
    if (raw.type === 'containerEnd' && children[k - 1]?.type === 'paragraph') {
      // (The container's style may set the rule itself, #715.)
      if ((pc.spacing ?? input.resolved.bodyText.paragraphContainerSpacing) === 'collapse' && !st.pull && bodyStyle.marginBottomPx > st.prevMarginBottom) {
        st.prevMarginBottom = bodyStyle.marginBottomPx;
      }
      return;
    }
    const margin = raw.type === 'containerStart' ? pc.marginTopPx : pc.marginBottomPx;
    if (margin < 0) {
      st.prevMarginBottom += margin;
      st.pull = true;
    } else if (margin > st.prevMarginBottom) {
      st.prevMarginBottom = margin;
      st.pull = false;
    }
  };
  return {
    placeChild, containerMargin
  };
}
