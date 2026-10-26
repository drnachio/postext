// Flow segments and page breaks: closing a flow segment, part, paper and
// numbering breaks, and the heading runs that may leave a column.
// Part of the placement pass (pass.ts), split out of it in #1276.
import type { VDTColumn, VDTPage, VDTBlock, ResolvedConfig, VDTDocument, ResolvedResourceBlock } from '../../../vdt.js';
import { settleColumnWraps } from '../../textWrap.js';
import { currentColumn, sideColumns, bandColumns, currentBand, pageHasContent, advanceToNextColumn, advanceToNextPageBoundary, type PlacementCursor } from '../../placement.js';
import type { PlannedFloat } from '../../floatPlacement.js';
import type { PageNumberSegment } from '../../../numbering.js';
import type { ContentBlock } from '../../../parse/index.js';
import { rollbackTrailingBlocks } from '../../buildHelpers.js';
import type { PlannedCallout } from '../../calloutLayout.js';
import type { HeadingLevelResolver } from '../../headingStyles.js';
import type { LayoutContinuation } from '../../../types/content.js';
import type { BandCapZone } from '../../bandCaps.js';
import type { PassState, PassLate } from './state.js';

/** What createBreaks takes from the pass. */
export interface BreaksDeps {
  resolved: ResolvedConfig;
  headingLevels: HeadingLevelResolver;
  baselineGrid: number;
  doc: VDTDocument;
  continuation: LayoutContinuation | undefined;
  afterPartPage: boolean;
  pageWidthPx: number;
  pageHeightPx: number;
  bodyOffset: number;
  contentBlocks: ContentBlock[];
  pendingFloats: PlannedFloat[];
  releaseStaleCitationGates: (blockIdx?: number) => void;
  floatGapPx: number;
  offsetResourceBlockToAbsolute: (rb: ResolvedResourceBlock, ox: number, oy: number) => void;
  tryPlacePendingFloatsOnCurrentPage: (preferTop?: boolean, nextBlockIdx?: number, anyPosition?: boolean) => void;
  drainPendingFloats: () => void;
  cursor: PlacementCursor;
  markForcedBreak: () => void;
  openerOwnColumn: Map<VDTColumn, VDTBlock>;
  openerHeadFloats: Map<VDTColumn, number>;
  spanHeadingOpenedHere: Map<number, string>;
  rollbackHeadings: (col: VDTColumn) => VDTBlock[];
  proposeTrailingCap: (boundaryIndex: number, zone?: BandCapZone, closeLevel?: boolean) => void;
  state: PassState;
  late: PassLate;
}

export function createBreaks(deps: BreaksDeps) {
  const {
    resolved, headingLevels, baselineGrid, doc, continuation, afterPartPage, pageWidthPx,
    pageHeightPx, bodyOffset, contentBlocks, pendingFloats, releaseStaleCitationGates, floatGapPx,
    offsetResourceBlockToAbsolute, tryPlacePendingFloatsOnCurrentPage, drainPendingFloats, cursor,
    markForcedBreak, openerOwnColumn, openerHeadFloats, spanHeadingOpenedHere, rollbackHeadings,
    proposeTrailingCap, state, late
  } = deps;
  /** Close the flow at a chapter-level boundary (block `boundaryIndex`):
   *  floats take the page's free slots, the closing band is levelled, the
   *  page is marked as an explicit break, and every float still pending is
   *  drained onto pages opened BEFORE the boundary. The caller then opens
   *  the boundary's own page.
   *
   *  The floats the boundary block itself cites first — a `breakBefore`
   *  heading that names a figure, the first paragraph after a part — were
   *  queued at the top of its iteration, but their citation is set on the
   *  page the boundary opens: they sit the drain out and stay pending (with
   *  no reference stamp, which the citing line sets), so they land after
   *  the line that cites them, in the new segment (EF-69). */
  /** Text wrap (#627): an inline figure that wraps, placed as a band, whose
   *  band the next block takes back to run beside it when it can (see
   *  `pipeline/textWrap.ts`). */
  state.pendingWrap = null;

  const closeFlowSegment = (boundaryIndex: number): void => {
    // What text wrapped round in the column the segment ends in keeps its
    // room (#627).
    state.pendingWrap = null;
    settleColumnWraps(currentColumn(doc, cursor));
    late.settleAwaitingSideBoxes(true);
    releaseStaleCitationGates();
    const ownFloats: PlannedFloat[] = [];
    for (let i = pendingFloats.length - 1; i >= 0; i--) {
      const f = pendingFloats[i]!;
      if (f.firstBlockIdx !== boundaryIndex || f.callout) continue;
      const unstamped: PlannedFloat = { ...f };
      delete unstamped.refPageIndex;
      delete unstamped.refY;
      ownFloats.unshift(unstamped);
      pendingFloats.splice(i, 1);
    }
    tryPlacePendingFloatsOnCurrentPage();
    proposeTrailingCap(boundaryIndex, undefined, true);
    markForcedBreak();
    hugClosingText();
    drainPendingFloats();
    pendingFloats.push(...ownFloats);
  };

  /** On the closing page of a chapter nothing follows the page-span floats
   *  set at the foot of its last band: they move up to sit right under the
   *  band's text (one float gap below its grid-rounded bottom, stacked in
   *  their order) instead of leaving a gap between the text and a table at
   *  the page foot. `layout.hugClosingFloats: false` leaves them where their
   *  placement put them (EF-94). */
  const hugClosingText = (): void => {
    if (!resolved.layout.hugClosingFloats) return;
    const page = doc.pages[cursor.pageIndex]!;
    const floats = page.floats ?? [];
    // A side column holds its own band under a page-span float: leave it.
    if (floats.length === 0 || page.partInfo || sideColumns(page).length > 0) return;
    const cols = bandColumns(page, currentBand(page, cursor)).filter((c) => c.kind !== 'span' && c.kind !== 'side' && c.bbox.height > 0.5);
    if (cols.length === 0 || !cols.some((c) => c.blocks.length > 0)) return;
    const textBottom = Math.max(...cols.map((c) => c.bbox.y + (c.bbox.height - c.availableHeight)));
    const spanWidth = page.contentArea.width - 0.5;
    const below = floats.filter((b) => b.bbox.y >= textBottom - 0.5).sort((a, b) => a.bbox.y - b.bbox.y);
    let nextY = page.contentArea.y + Math.ceil((textBottom - page.contentArea.y - 0.01) / baselineGrid) * baselineGrid + floatGapPx;
    for (const b of below) {
      const rb = b.resourceBlock;
      // Only resource floats across the page move; anything else below the
      // text (a fixed or floated box) keeps its place and ends the run.
      if (!rb || rb.rotation || b.bbox.width < spanWidth) break;
      const dy = nextY - b.bbox.y;
      if (dy < -0.5) {
        b.bbox.y += dy;
        offsetResourceBlockToAbsolute(rb, 0, dy);
      }
      nextY = b.bbox.y + b.bbox.height + floatGapPx;
    }
  };

  /** Parity of the page break a closed `:::part` still owes (applied before
   *  the next placed block) — from the start when the part closed the
   *  preceding content (`continuation.afterPartPage`). */
  state.pendingPartBreak = afterPartPage && resolved.parts.breakAfter.enabled
    ? resolved.parts.breakAfter.parity
    : null;
  /** Content index of the closing fence of a part set without a page
   *  (`parts.page: false`): blocks up to it are skipped. */
  state.skipPartUntil = null;

  /** `advanceToNextPageBoundary`, except that an empty part page is left
   *  behind too (its opener design is content). No floats are reserved on
   *  the page opened this way — parity padding may still follow it. */
  const leaveCurrentPage = (): void => {
    const curPage = doc.pages[cursor.pageIndex]!;
    if (curPage.partInfo && !pageHasContent(curPage)) {
      const startPageIndex = cursor.pageIndex;
      do {
        advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx);
      } while (cursor.pageIndex === startPageIndex);
      return;
    }
    advanceToNextPageBoundary(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx);
  };

  /** A closed `:::paper` still owes a page break before the next placed
   *  block. */
  state.pendingPaperBreak = false;
  /** A composed page (`::::page`, #854) owes a page break before the next
   *  placed block: `'page'` once its template was laid on the current page
   *  (nothing flowed on it), `'flow'` after content set in the flow (a page
   *  of unknown template, or what no frame took), which closes as a
   *  `:::paper` run does. */
  state.pendingComposedBreak = false;
  /** A comic page (`:::page`) was laid out on the current page: the next
   *  placed block opens a new one (a page that ends the document leaves no
   *  empty page behind). */
  state.pendingComicBreak = false;
  /** The page break around a `:::paper` run (block `boundaryIndex`): the
   *  flow closes like a chapter's and the next block opens a page. */
  const breakForPaper = (boundaryIndex: number): void => {
    state.pendingSpacing = 0;
    closeFlowSegment(boundaryIndex);
    leaveCurrentPage();
    flushPendingNumberingAtBoundary();
  };

  // Page-numbering segments. The implicit first segment comes from
  // `cfg.page.pageNumbering`; `:::numbering` directives append more,
  // each applied at the next page boundary.
  // A continued document starts where the previous page left off.
  const pageNumberSegments: PageNumberSegment[] = [
    {
      startPageIndex: 0,
      format: continuation?.pageNumbering?.format ?? resolved.page.pageNumbering.format,
      startAt: continuation?.pageNumbering?.startAt ?? resolved.page.pageNumbering.startAt,
    },
  ];
  state.pendingNumberingChange = null;
  /** The earliest page a pending change may number: the page the directive
   *  was met on while still empty, else the page after it. */
  state.pendingNumberingPage = 0;
  /** A page holding something the reader sees: column content, a float, a
   *  part opener. A parity blank is not one. */
  const pageTakesNumbering = (page: VDTPage): boolean =>
    pageHasContent(page) || (page.floats?.length ?? 0) > 0 || page.partInfo !== undefined || page.comic !== undefined || page.composed !== undefined;

  /** Commits a pending `:::numbering` change to the first page from the
   *  directive on that receives content: the page the directive opens (the
   *  head of a chapter, right after a page break) or, when that page was
   *  already written on, the next one — never a blank page padding parity
   *  in between. Called after every block iteration and page advance. */
  const flushPendingNumberingAtBoundary = (): void => {
    if (!state.pendingNumberingChange) return;
    if (cursor.pageIndex < state.pendingNumberingPage) return;
    const page = doc.pages[cursor.pageIndex]!;
    if (!pageTakesNumbering(page)) return;
    // A change already recorded for this page is replaced.
    const last = pageNumberSegments[pageNumberSegments.length - 1]!;
    if (last.startPageIndex === cursor.pageIndex && pageNumberSegments.length > 1) pageNumberSegments.pop();
    pageNumberSegments.push({
      startPageIndex: cursor.pageIndex,
      ...state.pendingNumberingChange,
    });
    state.pendingNumberingChange = null;
  };

  /** `headings.keepWithNextSpread` (#424): whether a heading may close
   *  `col` even so — the last text column of an even page, whose text then
   *  opens the facing odd page of the same spread (JLReq §4.1.7 b). Pages
   *  count as printed (`pageIndexOffset` of a chapter laid out after
   *  others), page 1 being the lone recto. */
  const headingMayCloseColumn = (col: VDTColumn): boolean => {
    if (!resolved.headings.keepWithNextSpread) return false;
    const page = doc.pages[cursor.pageIndex];
    if (!page || !page.columns.includes(col)) return false;
    if ((page.index + (doc.pageIndexOffset ?? 0) + 1) % 2 !== 0) return false;
    const flow = page.columns.filter((c) => c.kind !== 'side' && c.kind !== 'span');
    return flow[flow.length - 1] === col;
  };
  /** Heading blocks that are not part of a callout — the only ones the
   *  keep-with-next rollbacks may pull along (a callout is one unbreakable
   *  unit; its children never leave it). */
  const isFreeHeading = (b: VDTBlock): boolean => b.type === 'heading' && b.containerId === undefined;
  /** Whether `b` is the page-span opener of `col` with a float set under it
   *  at the column's head (#639): the float follows it there, so it closes
   *  no run of headings a block moving on could strand, and is never taken
   *  on to the next column with one. */
  const holdsHeadFloat = (col: VDTColumn, b: VDTBlock): boolean =>
    openerHeadFloats.has(col) && openerOwnColumn.get(col) === b;
  /** Free headings closing `col` (its trailing run), 0 unless keep-with-next
   *  is on: the headings a block moving on would strand. */
  const trailingHeadingRun = (col: VDTColumn): number => {
    if (!resolved.headings.keepWithNext || headingMayCloseColumn(col)) return 0;
    let n = 0;
    for (let j = col.blocks.length - 1; j >= 0 && isFreeHeading(col.blocks[j]!) && !holdsHeadFloat(col, col.blocks[j]!); j--) n++;
    return n;
  };
  /** Times each keep-together box left a short column holding only the
   *  headings it rolled back, by content index: the count `shortColumnMoves`
   *  bounds, kept across the rollback that sets the headings again. */
  const calloutShortMoves = new Map<number, number>();
  /** Whether a block moving on whole may take the `run` headings closing
   *  `col` along. A run that is all the column holds would open the next
   *  column just as it opens this one, and is rolled back no further —
   *  unless it opens a band a page-span heading cut under the text of the
   *  page (`spanBreak: false`, #1238): rolled back, that heading opens the
   *  next page instead (`headingLeftBand`), with the block it is kept with.
   *  Nor when `shortColumn` says the block leaves a short column (the band
   *  under a page-span heading or box, a column cut by a float) for a
   *  taller one: a run of in-column headings opening it moves on too. A
   *  hidden heading is the usual case — it takes no room, and left alone in
   *  such a column it sent its bookmark, contents entry and running head to
   *  the page before the box. */
  const headingRunMayLeave = (col: VDTColumn, run: number, shortColumn = false): boolean => {
    if (run <= 0) return false;
    if (run < col.blocks.length) return true;
    if (shortColumn && !col.blocks.some((b) => headingSpansPage(b))) return true;
    const head = col.blocks[0]!;
    return head.contentIndex !== undefined
      && spanHeadingOpenedHere.get(head.contentIndex) === `${cursor.pageIndex}:${col.band ?? 0}`;
  };
  /** Whether heading block `b` is a `span: 'page'` one: it opens its band
   *  wherever it is set, and moving it on would only open the next one. */
  const headingSpansPage = (b: VDTBlock): boolean => {
    const raw = b.contentIndex !== undefined ? contentBlocks[b.contentIndex] : undefined;
    return raw !== undefined && headingLevels.forBlock(raw)?.span === 'page';
  };

  /**
   * An index group divided between two columns keeps at least
   * `index.groups.splitMinEntries` entries on each side (#712). `entry` is
   * the entry block about to leave `col` (it does not fit, or would be
   * divided between its lines); `k` entries of its group already close the
   * column and `r` are still to place, this one included. Too few behind
   * (`k < min`): the `k` go on with it. Too few ahead (`r < min`): enough of
   * them go on for the next column to open with `min`, and all of them when
   * that would leave too few behind. The blocks taken off the column are
   * returned in column order (the caller rewinds to the first), with the
   * run of headings they would strand; empty when the rule asks for
   * nothing or cannot be met: the group's entries are all the column holds
   * under its headings (they would open the next column as they open this
   * one), or the entry that would lead the move is the rest of one begun
   * in the column before.
   */
  const rollbackIndexGroup = (col: VDTColumn, entry: ContentBlock, min: number): VDTBlock[] => {
    const info = entry.index;
    if (!info || min <= 1 || info.groupIndex === undefined || info.groupPlace === undefined || info.groupSize === undefined) return [];
    const sameGroup = (b: VDTBlock): boolean => {
      const raw = b.contentIndex !== undefined ? contentBlocks[b.contentIndex] : undefined;
      return raw?.index !== undefined && raw.index.groupIndex === info.groupIndex && raw.sourceStart === entry.sourceStart;
    };
    let k = 0;
    for (let j = col.blocks.length - 1; j >= 0 && sameGroup(col.blocks[j]!); j--) k++;
    if (k === 0) return [];
    const r = info.groupSize - info.groupPlace;
    let take = 0;
    if (k < min) take = k;
    else if (r < min) take = k - (min - r) < min ? k : min - r;
    if (take === 0) return [];
    // Nothing but the group under the column's headings: it stays.
    const above = col.blocks.slice(0, col.blocks.length - k);
    if (take === k && above.every((b) => isFreeHeading(b) || b.hidden)) return [];
    // The rest of an entry begun in the column before cannot move back.
    if (col.blocks[col.blocks.length - take]!.id.includes('-cont-')) return [];
    let left = take;
    const popped = rollbackTrailingBlocks(col, doc.blocks, () => left-- > 0);
    // The headings the group stood under go with it.
    const heads = take === k ? rollbackHeadings(col) : [];
    // The space above the blocks taken off is the column's again.
    const last = col.blocks[col.blocks.length - 1];
    if (last) col.availableHeight = col.bbox.y + col.bbox.height - (last.bbox.y + last.bbox.height);
    return [...heads, ...popped];
  };

  /** Stamp a callout frame's content index and source range: the whole
   *  fence (opening to closing marker) for an unsplit box; for a fragment
   *  of a split box, from the fence start (first fragment) or the first
   *  child it holds, to the fence end (last fragment) or the last child. */
  const stampCalloutSource = (
    frame: VDTBlock,
    startIdx: number,
    plan: PlannedCallout,
    range?: { firstChildIdx: number; lastChildIdx: number },
  ): void => {
    const startBlock = contentBlocks[startIdx]!;
    const endBlock = contentBlocks[plan.endIdx]!;
    frame.contentIndex = startIdx;
    const first = range && range.firstChildIdx > startIdx + 1 ? contentBlocks[range.firstChildIdx]! : startBlock;
    const last = range && range.lastChildIdx < plan.endIdx - 1 ? contentBlocks[range.lastChildIdx]! : endBlock;
    frame.sourceStart = first.sourceStart + bodyOffset;
    frame.sourceEnd = last.sourceEnd + bodyOffset;
  };
  return {
    closeFlowSegment, leaveCurrentPage, breakForPaper, pageNumberSegments, pageTakesNumbering,
    flushPendingNumberingAtBoundary, headingMayCloseColumn, isFreeHeading, holdsHeadFloat,
    trailingHeadingRun, calloutShortMoves, headingRunMayLeave, rollbackIndexGroup,
    stampCalloutSource
  };
}
