// Committing callout boxes: their source, narrow groups, strip blocks,
// frame layouters and splitting a box at a cut.
// Part of the placement pass (pass.ts), split out of it in #1276.
import { type ContentWarning, type VDTColumn, type VDTBlock, pageIsVertical, type VDTLine, type VDTPage, type ResolvedConfig, type VDTDocument } from '../../../../vdt.js';
import { type CalloutLayoutResult, type PlannedCallout, offsetCalloutToAbsolute } from '../../../callouts/calloutLayout.js';
import type { ContentBlock } from '../../../../parse/index.js';
import { defaultOpenerTitle, markedTitleFields, measureHeadingDesign, measureBoxDesign, layoutBoxDesign } from '../../../pages/headerFooter.js';
import type { HeadingPlaceholderInfo } from '../../../../design/placeholders.js';
import { resolvedLocale, arabicNumbersOf } from '../../../config.js';
import { type FrameLayoutPass, type CalloutLayouter, makeCalloutLayouter as makeCalloutLayouterIn, frameCutRules, type CalloutCut, type CalloutFragment, splitCalloutFragment as splitCalloutFragmentIn, tallerThanColumn as tallerThanColumnIn } from '../../../callouts/frameLayout.js';
import { isFlowColumnsStyle } from '../../../columns/flowColumns.js';
import { FRAME_STYLE_ID } from '../../../../composed/wrap.js';
import type { ResolvedCalloutStyleConfig, Resource, ResolvedHeadingStyleConfig } from '../../../../types.js';
import { flowPageMirrored } from '../../../blocks/buildHelpers.js';
import { CAPPED_OVERFLOW_PX } from '../../passTypes.js';
import { sideColumnOf, sideUsedBottom, bandUsedBottom, type PlacementCursor } from '../../../blocks/placement.js';
import type { HeadingLevelResolver, HeadingSectionPlan } from '../../../sections/headingStyles.js';
import type { ParagraphContainerPlan } from '../../../callouts/paragraphContainers.js';
import type { PartPlan } from '../../../sections/parts.js';
import type { ComicPageSource } from '../../../../comics/types.js';
import type { StripGeometry } from '../types.js';
import type { BlockMeasureContext } from '../../../blocks/measureContentBlock.js';
import type { PassState } from '../state.js';

/** What createCalloutCommit takes from the pass. */
export interface CalloutCommitDeps {
  resolved: ResolvedConfig;
  headingLevels: HeadingLevelResolver;
  doc: VDTDocument;
  pageIndexOffset: number;
  bodyOffset: number;
  contentBlocks: ContentBlock[];
  chapterNumberByBlock: string[];
  resourceById: Map<string, Resource>;
  calloutResolved: ResolvedConfig;
  paragraphContainers: ParagraphContainerPlan;
  partPlan: PartPlan;
  sectionPlan: HeadingSectionPlan;
  stripGeometry: (blockIdx: number, source: ComicPageSource, measure: number, max: number, vertical: boolean) => StripGeometry;
  buildComicStripBlock: (blockIdx: number, source: ComicPageSource, x: number, width: number, max: number, pageIndex: number, keep?: StripGeometry) => VDTBlock;
  withStripPlaceholder: (blk: VDTBlock, g: StripGeometry) => void;
  floatGapPx: number;
  measureCtx: BlockMeasureContext;
  partMeasureCtx: BlockMeasureContext;
  cursor: PlacementCursor;
  sectionMeasureCtx: (style: ResolvedHeadingStyleConfig | undefined) => BlockMeasureContext;
  stampCalloutSource: (frame: VDTBlock, startIdx: number, plan: PlannedCallout, range?: { firstChildIdx: number; lastChildIdx: number; }) => void;
  state: PassState;
}

export function createCalloutCommit(deps: CalloutCommitDeps) {
  const {
    resolved, headingLevels, doc, pageIndexOffset, bodyOffset, contentBlocks, chapterNumberByBlock,
    resourceById, calloutResolved, paragraphContainers, partPlan, sectionPlan, stripGeometry,
    buildComicStripBlock, withStripPlaceholder, floatGapPx, measureCtx, partMeasureCtx, cursor,
    sectionMeasureCtx, stampCalloutSource, state
  } = deps;
  /** Shared tail of callout placement: stamp the frame's source range,
   *  convert the laid-out box to absolute coordinates at the frame's placed
   *  origin, and push frame + children — in that order — to `doc.blocks`
   *  and to the column the frame landed in. */
  /** `:::columns` groups whose sub-columns are too narrow (#634), once a
   *  group. */
  const columnsNotes: ContentWarning[] = [];
  const narrowNoted = new Set<number>();
  const noteNarrowGroups = (result: CalloutLayoutResult, pageIndex: number): void => {
    for (const g of result.groups ?? []) {
      if (!g.narrow || narrowNoted.has(g.contentIndex)) continue;
      narrowNoted.add(g.contentIndex);
      const raw = contentBlocks[g.contentIndex];
      columnsNotes.push({
        kind: 'columnsTooNarrow',
        columns: g.columns,
        widthPx: g.columnWidth,
        ...(raw ? { sourceStart: raw.sourceStart + bodyOffset, sourceEnd: raw.sourceEnd + bodyOffset } : {}),
        pageIndex,
      });
    }
    for (const u of result.units) if (u.kind === 'box') noteNarrowGroups(u.box.result, pageIndex);
  };
  const commitCallout = (
    result: CalloutLayoutResult,
    startIdx: number,
    plan: PlannedCallout,
    col: VDTColumn,
    range?: { firstChildIdx: number; lastChildIdx: number },
  ): void => {
    const frame = result.frame;
    noteNarrowGroups(result, cursor.pageIndex);
    stampCalloutSource(frame, startIdx, plan, range);
    offsetCalloutToAbsolute(result, frame.bbox.x, frame.bbox.y);
    doc.blocks.push(frame);
    for (const child of result.children) {
      child.pageIndex = frame.pageIndex;
      child.columnIndex = frame.columnIndex;
      col.blocks.push(child);
      doc.blocks.push(child);
    }
  };

  // --- Callout fragments (`keepTogether: false`) ---------------------------
  // A splittable box breaks only BETWEEN its child blocks (a list item or a
  // paragraph is never cut in two): the fragment that fits closes the
  // current column / page, the rest continues in a box of its own — same
  // frame, stripe and marker, no title or icon — on the next one, and may
  // split again. Every
  // fragment's frame shares the fence's `contentIndex` / `containerId` and
  // records its `callout.part` / `callout.continued`.



  /** A strip in a box (the box of a page-wide strip set `here`, #590):
   *  laid out at the box's inner width, as tall as a page allows, with its
   *  placeholder line; the page it lays out for is the cursor's. */
  const calloutStripBlock = (raw: ContentBlock, idx: number, width: number): VDTBlock | undefined => {
    if (!raw.comic) return undefined;
    const blk = buildComicStripBlock(idx, raw.comic, 0, width, state.contentArea.height - 2 * floatGapPx, cursor.pageIndex);
    withStripPlaceholder(blk, stripGeometry(idx, raw.comic, width, state.contentArea.height - 2 * floatGapPx, pageIsVertical(doc.pages[cursor.pageIndex]!)));
    return blk;
  };
  /** The room a heading's design takes in a box or a frame (#906): as in
   *  a column (see the heading placement below), against the heading's
   *  box; a `span: 'page'` heading is laid out at the box's width too. */
  const boxHeadingDesign = (raw: ContentBlock, blockIdx: number, lines: readonly VDTLine[], pref: string, headingNumber: number | undefined, width: number): number | undefined => {
    const lvl = headingLevels.forBlock(raw);
    if (!lvl?.advancedDesign.enabled) return undefined;
    const title = defaultOpenerTitle(lines, pref, raw.titleBreaks, raw.text.length, lvl.numberSeparator);
    const info: HeadingPlaceholderInfo = { titleText: title.titleText, ...markedTitleFields(title, resolved.chipStyles), formattedNumber: pref, numericValue: headingNumber, locale: resolvedLocale(resolved), ...(resolved.numerals ? { numerals: resolved.numerals } : {}), chapterNumber: chapterNumberByBlock[blockIdx] ?? '', attrs: raw.attrs };
    const design = measureHeadingDesign(lvl, info, width, resolved.page.dpi, doc.metadata, cursor.pageIndex, undefined, undefined, resourceById);
    return Math.max(design.height, design.textFloor);
  };
  /** What the box typesetter (`frameLayout.ts`) reads of this pass. */
  const framePass: FrameLayoutPass = {
    contentBlocks,
    resolved,
    calloutResolved,
    paragraphContainers,
    // A main-flow group's box sets its blocks as the text around it is
    // set: a styled section's or a part's body (#634).
    measureCtxFor: (startIdx, style) => (isFlowColumnsStyle(style.id) || style.id === FRAME_STYLE_ID
      ? (partPlan.byBlock[startIdx] ? partMeasureCtx : sectionMeasureCtx(sectionPlan.byBlock[startIdx]))
      : measureCtx),
    stripBlock: calloutStripBlock,
    columnHeight: () => state.contentArea.height,
    headingDesign: (raw, blockIdx, heading, width) => boxHeadingDesign(raw, blockIdx, heading.lines, heading.numberPrefix, heading.headingNumber, width),
    // A box style's design (#1014), laid out with the box.
    boxDesign: {
      measure: (design, info, width) => measureBoxDesign(design, info, width, resolved.page.dpi, doc.metadata, resourceById),
      layout: (design, info, band, flow) => layoutBoxDesign(design, info, band, resolved.page.dpi, doc.metadata, {
        resourceById,
        ...(flow.rtl ? { direction: 'rtl' as const } : {}),
        ...(flow.mirrored ? { mirrored: true } : {}),
        ...(arabicNumbersOf(resolved) ? { arabicNumbers: true } : {}),
      }),
    },
  };
  const makeCalloutLayouter = (startIdx: number, plan: PlannedCallout, style: ResolvedCalloutStyleConfig): CalloutLayouter =>
    makeCalloutLayouterIn(framePass, startIdx, plan, style);
  /** Whether a page swaps its mirrored margins (a verso of a left-bound
   *  book, a recto of a right-bound one: an `'outer'` corner icon hangs on
   *  the left there). A vertical page has no outer side: a box's outer
   *  corner stays where the style puts it. A right-to-left page answers in
   *  its flow (`flowPageMirrored`), where its spine side is turned over. */
  const mirroredOf = (page: VDTPage): boolean =>
    !pageIsVertical(page) && flowPageMirrored(resolved, page, pageIndexOffset);
  /** Where a block's paint ends: its last line's foot (a list tail's box
   *  bakes its bottom margin in and may reach past a cut with every line
   *  inside it), else its box's. */
  const paintedBottom = (b: VDTBlock): number => {
    const last = b.lines[b.lines.length - 1];
    return last ? last.bbox.y + last.bbox.height : b.bbox.y + b.bbox.height;
  };
  /** Whether a band cut by a cap holds a block painted past the cut: one
   *  that could not split across it (a paragraph tail the orphan and widow
   *  minimums keep whole, a keep-together box) was force-placed into an
   *  empty capped column and ran past its foot. */
  const capClipsLines = (cols: readonly VDTColumn[]): boolean => cols.some((c) =>
    c.bandCapped && c.blocks.some((b) => !b.hidden && paintedBottom(b) > c.bbox.y + c.bbox.height + CAPPED_OVERFLOW_PX));
  /** Used bottom of a band, the float-only side column's stack included:
   *  a span block cuts under the side boxes already set there. */
  const bandUsedBottomWithSide = (page: VDTPage, cols: readonly VDTColumn[]): number => {
    const side = sideColumnOf(page, cols[0]?.band ?? 0);
    const withSide = side && sideUsedBottom(side) > side.bbox.y + 0.5 ? [...cols, side] : cols;
    return bandUsedBottom(withSide);
  };


  /** A box of the running text is cut as a composed page's frame is
   *  (#942): a heading with its text, two list items on each side. */
  const calloutCutRules = frameCutRules(resolved);
  const splitCalloutFragment = (
    L: CalloutLayouter,
    from: CalloutCut,
    width: number,
    roomPx: number,
    frameId: string,
    continuation: boolean,
    minLines: number,
    mirrored = false,
  ): CalloutFragment | null => splitCalloutFragmentIn(framePass, L, from, width, roomPx, frameId, continuation, minLines, mirrored, undefined, calloutCutRules);


  const tallerThanColumn = (result: CalloutLayoutResult): boolean => tallerThanColumnIn(framePass, result);

  const markFragment = (result: CalloutLayoutResult, part: number, continued: boolean): void => {
    if (result.frame.callout) {
      result.frame.callout.part = part;
      result.frame.callout.continued = continued;
    }
  };
  return {
    columnsNotes, commitCallout, framePass, makeCalloutLayouter, mirroredOf, paintedBottom,
    capClipsLines, bandUsedBottomWithSide, splitCalloutFragment, tallerThanColumn, markFragment
  };
}
