// Bands: forced breaks, opener bands, side obstacles, page-span headings and
// the band caps column balancing proposes.
// Part of the placement pass (pass.ts), split out of it in #1276.
import type { VDTColumn, VDTBlock, VDTPage, ResolvedConfig, VDTDocument, BoundingBox } from '../../../vdt.js';
import type { ContentBlock } from '../../../parse/index.js';
import { headingIsHidden, type HeadingLevelResolver, type HeadingSectionPlan } from '../../sections/headingStyles.js';
import { bandColumns, sideColumnOf, currentBand, currentColumn, closeBandAt, type PlacementCursor } from '../../blocks/placement.js';
import { columnCursorY } from '../../floats/textWrap.js';
import type { HeadingClaim } from '../passTypes.js';
import type { ResolvedHeadingLevelConfig, Resource, ResolvedHeadingStyleConfig } from '../../../types.js';
import type { HeadingPlaceholderInfo } from '../../../design/placeholders.js';
import { headingDesignBoxes, defaultOpenerTitle, measureHeadingDesign, markedTitleFields } from '../../pages/headerFooter.js';
import type { SideObstacle } from '../../floats/floatSlots.js';
import { measureContentBlock, type BlockMeasureContext } from '../../blocks/measureContentBlock.js';
import { columnBottom, uncapBand, type BandCap, bandTop, bareBandTop, applyBandCap, type BandCapZone, bandLinePitch, bandCapLinesAroundZone, bandCapLines, capRetryLimit } from '../../columns/bandCaps.js';
import { rollbackTrailingBlocks } from '../../blocks/buildHelpers.js';
import type { BlockStyle } from '../../styles.js';
import type { PartPlan } from '../../sections/parts.js';
import type { PlannedFloat } from '../../floats/floatPlacement.js';
import type { PassState, PassLate } from './state.js';

/** What createBands takes from the pass. */
export interface BandsDeps {
  bandCaps: ReadonlyMap<number, BandCap> | undefined;
  floatPages: ReadonlyMap<string, number> | undefined;
  resolved: ResolvedConfig;
  headingLevels: HeadingLevelResolver;
  baselineGrid: number;
  doc: VDTDocument;
  designFramesOn: (page: VDTPage | undefined) => { page: BoundingBox; bleed: BoundingBox; upright?: boolean; };
  resourceById: Map<string, Resource>;
  bodyStyle: BlockStyle;
  partPlan: PartPlan;
  sectionPlan: HeadingSectionPlan;
  pendingFloats: PlannedFloat[];
  reservedOf: (col: VDTColumn) => { top: number; bottom: number; };
  floatHeadOf: (col: VDTColumn) => number;
  capOrigin: (cols: readonly VDTColumn[]) => { at: string; headPx?: number; };
  sideObstacles: WeakMap<VDTColumn, (SideObstacle & { owner: VDTBlock; })[]>;
  partMeasureCtx: BlockMeasureContext;
  cursor: PlacementCursor;
  sectionMeasureCtx: (style: ResolvedHeadingStyleConfig | undefined) => BlockMeasureContext;
  uncappedBottoms: Map<VDTColumn, number>;
  openerHeadFloats: Map<VDTColumn, number>;
  state: PassState;
  late: PassLate;
}

export function createBands(deps: BandsDeps) {
  const {
    bandCaps, floatPages, resolved, headingLevels, baselineGrid, doc, designFramesOn, resourceById,
    bodyStyle, partPlan, sectionPlan, pendingFloats, reservedOf, floatHeadOf, capOrigin,
    sideObstacles, partMeasureCtx, cursor, sectionMeasureCtx, uncappedBottoms, openerHeadFloats,
    state, late
  } = deps;
  // --- Column bands: opening block + band caps (span blocks, stage 2) ----
  // The band the cursor last placed into, its opening block (content index
  // + part: a paragraph split across pages opens the next page's band with
  // its continuation), and the cap applied to it, if any. `enterBand` runs
  // at every placement site right before a block is offered to the current
  // column: the first block offered to a band is its opening block, and if
  // a cap names it the band's columns are shortened to the cap BEFORE the
  // block is placed, so the fit / split / keep-with-next rules see the
  // capped height. Atomic placements that advance internally re-run it
  // after landing (the cap then trims whatever the block left).
  state.registeredBand = null;
  state.bandStart = null;
  /** Bands registered so far in this pass per opening block and part
   *  (`contentIndex:part`): the `visit` of the next one (see `enterBand`). */
  const bandVisits = new Map<string, number>();
  state.activeCap = null;
  /** Column balancing: height (px) the levers added inside each column so
   *  far — extra grid lines above headings / list ends and lines gained by
   *  loose paragraphs. Balancing only ever fills a column's bottom gap, so
   *  a placement rule that needs slack *after* a block (keep-colon-with-
   *  list) must see the column as it was before the levers filled it:
   *  otherwise the block that closed the column in the plain pass moves to
   *  the next column, the flow shifts on every later page, and the pass is
   *  discarded as a regression. */
  const balanceExtraInColumn = new Map<VDTColumn, number>();
  const addBalanceExtra = (col: VDTColumn, px: number): void => {
    if (px > 0) balanceExtraInColumn.set(col, (balanceExtraInColumn.get(col) ?? 0) + px);
  };
  /** Whether a heading is painted by the default opener: a `span: 'page'`
   *  level (or style) without design elements of its own, that prints
   *  (EF-100). */
  const opensDefaultOpener = (raw: ContentBlock): boolean => {
    const lvl = headingLevels.forBlock(raw);
    return lvl?.span === 'page'
      && !(lvl.advancedDesign.enabled && lvl.advancedDesign.slot.elements.length > 0)
      && !headingIsHidden(raw, lvl);
  };
  /** Whether a heading is measured across the content area: a `span:
   *  'page'` level (or style) that prints, painted by the default opener or
   *  by a design of its own, which lays out across the page as well. At the
   *  column width a designed opener's title broke into more lines than the
   *  design paints, and those lines set its band: taller than the same
   *  heading without a design, so that it no longer fitted under the text
   *  of a page the plain one opens on (#1224). */
  const measuredAcrossPage = (raw: ContentBlock): boolean => {
    const lvl = headingLevels.forBlock(raw);
    return lvl?.span === 'page' && !headingIsHidden(raw, lvl);
  };
  /** Page-spanning heading placed in `headingCol`, reserving `h` px from the
   *  top of the page: the same vertical band is reserved in every other
   *  column of the page, so body text under the opener band starts below it
   *  in ALL columns, not just the one it was placed in. A column still
   *  untouched moves its head below the band (as a top float does), so a
   *  float offered that column's head lands under the opener instead of
   *  over it. A text column's head goes to the first grid line at or under
   *  the band's foot, so what it snaps lands on the page's grid, as in the
   *  opener's own column (EF-139); its first block is then placed as
   *  `openerHeadSpacing` says. An `h` at least as tall as the columns
   *  spends them whole. `pending` is the space the opener leaves under it:
   *  its `marginBottom` when it did not snap, 0 when the snap took it in;
   *  `gridText` whether the text under it lands on the page's grid (its
   *  level snaps, or would but for the heading after it). */
  const reserveOpenerBand = (headingCol: VDTColumn, h: number, opener?: VDTBlock, pending = 0, gridText = true): void => {
    const page = doc.pages[cursor.pageIndex]!;
    if (opener) openerOwnColumn.set(headingCol, opener);
    for (const otherCol of page.columns) {
      if (otherCol === headingCol) continue;
      // An opener set mid-page (#539) heads its own band only.
      if ((otherCol.band ?? 0) !== (headingCol.band ?? 0)) continue;
      if (otherCol.blocks.length === 0 && otherCol.availableHeight >= otherCol.bbox.height - 0.01) {
        const foot = otherCol.bbox.y + h;
        const text = otherCol.kind !== 'side' && otherCol.kind !== 'span';
        const reach = (text ? gridUpOnPage(page, foot) : foot) - otherCol.bbox.y;
        const shift = Math.min(reach, otherCol.bbox.height);
        otherCol.bbox.y += shift;
        otherCol.bbox.height -= shift;
        otherCol.availableHeight = Math.max(0, otherCol.availableHeight - reach);
        if (opener && text) {
          const textTop = gridText ? gridUpOnPage(page, foot + pending) : foot + pending;
          openerBandHeads.set(otherCol, { openerCol: headingCol, opener, foot, textTop, floatTop: reservedOf(otherCol).top });
        }
        continue;
      }
      otherCol.availableHeight = Math.max(0, otherCol.availableHeight - h);
    }
  };
  /** The page grid line at or below `y` (absolute px). */
  const gridUpOnPage = (page: VDTPage, y: number): number =>
    page.contentArea.y + Math.ceil((y - page.contentArea.y - 0.01) / baselineGrid) * baselineGrid;
  /** Columns headed by a page-span opener's band (see `reserveOpenerBand`):
   *  the opener, its column, the band's foot, where text right under the
   *  opener starts and the float band the column held at its head then. */
  const openerBandHeads = new Map<VDTColumn, { openerCol: VDTColumn; opener: VDTBlock; foot: number; textTop: number; floatTop: number }>();
  /** The column each page-span opener was set in (#639). */
  const openerOwnColumn = new Map<VDTColumn, VDTBlock>();
  /**
   * The head of the opener's own column under its band (#639): the first
   * grid line at or under the opener, level with the heads the band's other
   * columns were given (`reserveOpenerBand`), while the column holds nothing
   * after the opener and the band has another text column beside it — a
   * single text column under its heading has no other head to be level
   * with, and keeps the rule every column with content has. `undefined`
   * for any other column, and under `layout.floatsUnderOpener: false`
   * (postext 1.24 and earlier: the opener's column offered no head slot,
   * so a float fenced right after the opener landed from column 2).
   */
  const openerHeadOf = (col: VDTColumn): number | undefined => {
    if (!resolved.layout.floatsUnderOpener) return undefined;
    const opener = openerOwnColumn.get(col);
    if (!opener || col.blocks[col.blocks.length - 1] !== opener) return undefined;
    const page = doc.pages[opener.pageIndex];
    if (!page) return undefined;
    const beside = bandColumns(page, col.band ?? 0).filter((c) => c !== col && c.kind !== 'side' && c.kind !== 'span');
    if (beside.length === 0) return undefined;
    return gridUpOnPage(page, columnCursorY(col));
  };
  /** Whether the flow in `col` stands right under a float set at the head
   *  of the opener's own column: the block placed next starts there as at
   *  a column's head, with no space above it. */
  const underOpenerHeadFloat = (col: VDTColumn): boolean => {
    const foot = openerHeadFloats.get(col);
    return foot !== undefined && col.blocks[col.blocks.length - 1] === openerOwnColumn.get(col)
      && Math.abs(columnCursorY(col) - foot) < 0.01;
  };
  /** Whether what is placed next in `col` opens it: the column is empty,
   *  or holds an opener and the float set under it at its head. */
  const atColumnHead = (col: VDTColumn): boolean => col.blocks.length === 0 || underOpenerHeadFloat(col);
  /**
   * The room above the first block of a column headed by an opener band,
   * relative to the column's head, or undefined for any other column (or
   * one the flow reached after a float took its head). Every column under
   * the band starts as the opener's own column does (EF-139):
   * - text starts where text right under the opener starts: the band's
   *   foot plus the space the opener leaves, taken to the next grid line
   *   when the opener's level snaps (its text lands on the page's grid, as
   *   it does when the opener did not snap only because a heading follows);
   * - a heading (or another block that keeps its top margin, `level`) is
   *   set level with the first visible block under the opener when that
   *   is a heading or a display formula, margins included as there (a
   *   balancing lever above it excepted), else level with the text there.
   *   A hidden heading (`hidden: true`) under the opener does not count:
   *   it prints nothing to line up with. Its own snap then puts the text
   *   after it on the page's grid.
   * The block may sit up to a line above the column's head, which is on
   * the grid; the renderers' column clip takes it in (`columnClipRect`).
   * Up to postext 1.4 the first block of such a column started at the
   * band's foot, off the grid when the band ended between two lines, and a
   * heading there dropped the top margin the first column's kept.
   */
  const openerHeadSpacing = (col: VDTColumn, level: boolean): number | undefined => {
    const head = openerBandHeads.get(col);
    if (!head || col.blocks.length > 0 || reservedOf(col).top !== head.floatTop) return undefined;
    let target = head.textTop;
    // (With a float under the opener in its own column, the first block
    // there stands under that float: nothing to be level with, #639.)
    if (level && !openerHeadFloats.has(head.openerCol)) {
      const at = head.openerCol.blocks.indexOf(head.opener);
      const next = at >= 0 ? head.openerCol.blocks.slice(at + 1).find((b) => !b.hidden) : undefined;
      if (next && (next.type === 'heading' || next.type === 'mathDisplay')) {
        target = Math.max(head.foot, next.bbox.y - (next.balancing?.spaceAbove ?? 0));
      }
    }
    return target - col.bbox.y;
  };
  /** The side column each in-column heading marked obstacles in (see
   *  `markSideObstacles`), to drop them when the heading is rolled back. */
  const sideObstacleColumn = new WeakMap<VDTBlock, VDTColumn>();
  /**
   * Keep the float-only side column's stack off the heading design placed
   * as `blk` (EF-78). A design element may be anchored outside the heading's
   * column — a chapter numeral set in the outer margin column of a textbook
   * opener, a section number hung in the margin — where the side stack
   * (`span: 'side'` figures, tables and boxes) would paint over it. Each
   * such element is recorded as an obstacle of the side column: what the
   * stack sets later goes above it when it fits there, else one float gap
   * under it (`clearSideObstacles`). A numeral at the head of the channel
   * thus holds the whole stack under it, while a number hung beside a
   * heading further down the page leaves the head of the channel to the
   * figures the page cites. What the stack already holds is not moved.
   * A page-spanning opener needs none of this: its band is reserved in
   * every column, the side column included (`reserveOpenerBand`).
   */
  /** The in-column headings whose design may reserve their whole column,
   *  with what sets the reservation (#997); `headingClaimWarnings` keeps
   *  those that did and sent the text on. */
  const headingClaims = new Map<VDTBlock, HeadingClaim>();
  const noteHeadingClaim = (blk: VDTBlock, design: { claim?: HeadingClaim }): void => {
    if (design.claim) headingClaims.set(blk, design.claim);
  };
  const markSideObstacles = (blk: VDTBlock, design: { lvl: ResolvedHeadingLevelConfig; info: HeadingPlaceholderInfo }): void => {
    if (design.lvl.span === 'page') return;
    const page = doc.pages[cursor.pageIndex]!;
    const side = sideColumnOf(page, currentBand(page, cursor));
    if (!side || side.bbox.height <= 0.5) return;
    const boxes = headingDesignBoxes(
      design.lvl, design.info, blk.bbox, resolved.page.dpi, doc.metadata, cursor.pageIndex, designFramesOn(page), resourceById,
    );
    const top = side.bbox.y;
    const foot = side.bbox.y + side.bbox.height;
    const left = side.bbox.x;
    const right = side.bbox.x + side.bbox.width;
    const marks: Array<SideObstacle & { owner: VDTBlock }> = [];
    for (const b of boxes) {
      if (b.width <= 0 || b.height <= 0) continue;
      if (b.x + b.width <= left + 0.5 || b.x >= right - 0.5) continue;
      if (b.y + b.height <= top + 0.5 || b.y >= foot - 0.5) continue;
      marks.push({ owner: blk, top: b.y, bottom: b.y + b.height });
    }
    if (marks.length === 0) return;
    const list = sideObstacles.get(side);
    if (list) list.push(...marks);
    else sideObstacles.set(side, marks);
    sideObstacleColumn.set(blk, side);
  };
  /** The band (`page:band`) a keep-with-next rollback last took each
   *  heading out of, by content index. */
  const headingLeftBand = new Map<number, string>();
  /** The band (`page:band`) each page-span heading opened under the text
   *  of its page was set at the head of (#1238), by content index. */
  const spanHeadingOpenedHere = new Map<number, string>();
  /**
   * A `span: 'page'` heading with `spanBreak: false` (#539) opens where the
   * text reaches: the band the flow is in closes level under its text (a
   * trailing cap levels an uneven band in the next pass, as at a chapter's
   * end) and a fresh band opens under it, the heading at the head of its
   * first column, so the opener machinery sets it across the page as at a
   * page top (`reserveOpenerBand` keeps to the band). False — the caller
   * then opens the next page as before — when the room left under the cut
   * would not hold the heading's band, its margins and the widow minimum of
   * body lines. A band nothing was placed in yet (a page top, the band under
   * a span block) takes the heading as it stands.
   */
  const openSpanHeadingHere = (blockIdx: number, rawBlock: ContentBlock, level: ResolvedHeadingLevelConfig): boolean => {
    const page = doc.pages[cursor.pageIndex]!;
    if (page.partInfo || page.comic || page.composed || currentColumn(doc, cursor).kind === 'span') return false;
    const band = currentBand(page, cursor);
    // A keep-with-next rollback took the heading out of this band already
    // (#1219): set at the band's head again, it would be rolled back again.
    if (headingLeftBand.get(blockIdx) === `${page.index}:${band}`) return false;
    const cols = bandColumns(page, band);
    if (cols.length === 0) return false;
    if (!cols.some((c) => c.blocks.length > 0)) {
      // Floats at the head of the band are its content too: the heading
      // goes under them in the band's first column.
      cursor.columnIndex = cols[0]!.index;
      return true;
    }
    // What the heading takes: its lines (at the page width when the default
    // opener paints it) or its design's band, with its margins.
    const width = page.contentArea.width;
    const measureCtx = partPlan.byBlock[blockIdx] ? partMeasureCtx : sectionMeasureCtx(sectionPlan.byBlock[blockIdx]);
    const measured = measureContentBlock(rawBlock, blockIdx, measuredAcrossPage(rawBlock) ? width : cols[0]!.bbox.width, measureCtx);
    if (!measured) return false;
    const style = measured.kind.style;
    let height = measured.measured.totalHeight;
    if (level.advancedDesign.enabled) {
      const pref = measured.kind.numberPrefix ?? '';
      const title = defaultOpenerTitle(measured.measured.lines, pref, rawBlock.titleBreaks, rawBlock.text.length, level.numberSeparator);
      const design = measureHeadingDesign(
        level,
        { titleText: title.titleText, ...markedTitleFields(title, resolved.chipStyles), formattedNumber: pref, attrs: rawBlock.attrs },
        width, resolved.page.dpi, doc.metadata, cursor.pageIndex, designFramesOn(page), undefined, resourceById,
      );
      height = Math.max(height, design.height, design.textFloor);
    }
    // Level the band first: in this pass the cap is proposed and the
    // heading opens under the uneven columns; in the capped pass it arrives
    // in the band cut level for it and the cap counts as delivered. A cap
    // the driver drops (the band's blocks do not split level within its
    // retries, a float the cut would displace) leaves this pass's layout,
    // so the heading stays on its page: moved on here, it left the rest of
    // the page empty. While a float cited in the text before is still
    // waiting, the heading moves on as before, so the float is set ahead
    // of it and not in the article it opens. So it does in a capped pass
    // whose cap was not delivered: set under the heading, the float would
    // take room in the band the next boundary measures its cap in, and
    // that cap, too tall once this one is delivered, would hold the band
    // without levelling it.
    const capHere = state.activeCap !== null && state.activeCap.spanIndex === blockIdx
      && state.activeCap.pageIndex === page.index && state.activeCap.band === band;
    proposeTrailingCap(blockIdx);
    const used = cols.map((c) => c.bbox.y + (c.bbox.height - c.availableHeight));
    if (pendingFloats.length > 0 && Math.max(...used) - Math.min(...used) > baselineGrid + 0.5
      && (capHere ? !spanPlacedInBand.has(blockIdx) : bandCapProposals.has(blockIdx))) return false;
    const cutY = gridUpOnPage(page, late.bandUsedBottomWithSide(page, cols));
    const top = gridUpOnPage(page, cutY + Math.max(state.pendingSpacing, style.marginTopPx));
    const minLines = resolved.bodyText.avoidWidows ? Math.max(1, resolved.bodyText.widowMinLines) : 1;
    const bandBottom = Math.min(...cols.map((c) => columnBottom(c, uncappedBottoms)));
    if (top + height + style.marginBottomPx + minLines * bodyStyle.lineHeightPx > bandBottom + 0.01) return false;
    if (capHere) uncapBand(cols, uncappedBottoms);
    if (!closeBandAt(page, cols, cutY, top, cursor)) return false;
    spanHeadingOpenedHere.set(blockIdx, `${page.index}:${currentBand(page, cursor)}`);
    state.pendingSpacing = 0;
    return true;
  };

  /** `rollbackTrailingBlocks` that also drops a rolled-back heading's
   *  side-column obstacles: the heading is set again further on. */
  const rollbackHeadings = (col: VDTColumn): VDTBlock[] => {
    const popped = rollbackTrailingBlocks(col, doc.blocks, (b) => late.isFreeHeading(b) && !late.holdsHeadFloat(col, b));
    for (const p of popped) {
      if (p.contentIndex !== undefined) headingLeftBand.set(p.contentIndex, `${cursor.pageIndex}:${col.band ?? 0}`);
      const side = sideObstacleColumn.get(p);
      if (!side) continue;
      sideObstacleColumn.delete(p);
      const list = sideObstacles.get(side);
      if (list) sideObstacles.set(side, list.filter((o) => o.owner !== p));
    }
    return popped;
  };
  const bandCapProposals = new Map<number, BandCap>();
  const spanPlacedInBand = new Set<number>();
  const bandCapsApplied = new Set<number>();

  /** Columns of the band each cap was last applied to. */
  const cappedBandColumns = new Map<number, readonly VDTColumn[]>();
  const enterBand = (contentIndex: number, part: number): void => {
    const page = doc.pages[cursor.pageIndex]!;
    const band = currentBand(page, cursor);
    if (state.registeredBand && state.registeredBand.pageIndex === page.index && state.registeredBand.band === band) return;
    state.registeredBand = { pageIndex: page.index, band };
    // The same block (or part) can be offered to several bands before one
    // takes it: a page a float fills leaves it no room, and it moves on to
    // the next page. Each of those bands is told apart by how many came
    // before it with the same opening block, so a cap lands on the band it
    // was measured in and not on the first one the block passed through,
    // which took nothing (EF-167, EF-189).
    const key = `${contentIndex}:${part}`;
    const visit = bandVisits.get(key) ?? 0;
    bandVisits.set(key, visit + 1);
    state.bandStart = { contentIndex, part, visit };
    state.activeCap = null;
    if (!bandCaps) return;
    for (const [spanIndex, cap] of bandCaps) {
      if (cap.startContentIndex !== contentIndex || cap.startPart !== part || (cap.startVisit ?? 0) !== visit) continue;
      // A cap whose last band took nothing (its opening block is taller
      // than the cut — a heading's leading over a one-line cap) would cut
      // the next band just as short, and the flow would open empty pages
      // forever. Leave the band whole: the cap stays undelivered and the
      // driver grows or drops it.
      const prev = cappedBandColumns.get(spanIndex);
      if (prev && prev.every((c) => c.blocks.length === 0)) continue;
      const cols = bandColumns(page, band);
      // The cut is measured from under the float bands the proposing pass
      // had at the band's head, which may not have landed yet.
      const top = Math.max(bandTop(cols), bareBandTop(cols, floatHeadOf) + (cap.headPx ?? 0));
      // A cut below the band's foot cuts nothing: the band opens lower on
      // its page than where the cap was measured (the caps before it pulled
      // the flow up), so its text runs into the page foot whatever the cap.
      // Left unapplied, the driver takes the fresh proposal of the band the
      // boundary is reached in instead of growing this one (#1253).
      const foot = Math.min(...cols.map((c) => columnBottom(c, uncappedBottoms)));
      if (cols.length > 0 && top + cap.lines * (cap.pitchPx ?? baselineGrid) > foot + 0.5) continue;
      // (A trailing cap counts the lines of its band's own leading, #711.)
      applyBandCap(cols, cap.lines * (cap.pitchPx ?? baselineGrid), uncappedBottoms, cap.zone, cap.kind === 'trailing', top);
      cappedBandColumns.set(spanIndex, cols);
      state.activeCap = { spanIndex, pageIndex: page.index, band };
      bandCapsApplied.add(spanIndex);
      break;
    }
  };

  /**
   * Trailing band balance: when the flow reaches a boundary (chapter opener,
   * `:::part`, a chapter-closing fixed box, end of document) with the
   * current band's text columns uneven, propose a cap that cuts them level
   * — `ceil(Σ used / N / grid)` lines — so the next pass re-places the band
   * and its columns end at the same height, the way a compositor sets a
   * short closing page. Keyed by the boundary block's content index
   * (`contentBlocks.length` at EOF). In the capped pass the boundary reports
   * the cap delivered when it is reached inside the capped band (nothing
   * spilled past the cut); the columns are NOT uncapped afterwards, so
   * column balancing does not stretch them back to the page bottom.
   *
   * A chapter-closing fixed box passes the `zone` it will take at the
   * bottom of the band: when the level cut would run into it, the columns
   * under the box are cut at the zone's top instead and the others take
   * the displaced text (see {@link bandCapLinesAroundZone}) — the box then
   * fits on the page, under its columns, rather than opening a page alone.
   */
  const proposeTrailingCap = (boundaryIndex: number, zone?: BandCapZone, closeLevel = false): void => {
    const balancingCfg = resolved.headings.balancing;
    if (!balancingCfg.enabled || !balancingCfg.trailing) return;
    const page = doc.pages[cursor.pageIndex]!;
    if (page.columns[cursor.columnIndex]?.kind === 'span' || page.partInfo || page.comic || page.composed) return;
    const band = currentBand(page, cursor);
    const cols = bandColumns(page, band).filter((c) => c.bbox.height > 0.5);
    // A band where text wraps round something (#627) is not levelled.
    if (cols.length < 2 || cols.some((c) => c.forcedBreak || (c.exclusions?.length ?? 0) > 0)) return;
    if (state.activeCap && state.activeCap.spanIndex === boundaryIndex
      && state.activeCap.pageIndex === page.index && state.activeCap.band === band) {
      // The cut must not cost a float its page: one the uncut layout set on
      // this page and the cut band left no room for (a picture across
      // several columns that fitted beside the uneven columns) would go to
      // a page of its own at the chapter's end. Not delivered: the cap is
      // tried a line lower, then dropped (#505).
      const displaced = floatPages && pendingFloats.some((f) => floatPages.get(f.resourceId) === page.index);
      if (!displaced) spanPlacedInBand.add(boundaryIndex);
      return;
    }
    // A cap in force for this boundary that did not open the band the
    // boundary is reached in (an earlier cap moved the flow under it, or
    // its own band overflowed) still gets a fresh proposal below: the
    // driver replaces a cap that no longer applies with it, and ignores it
    // while retrying an applied cap a line taller.
    if (state.activeCap && state.activeCap.pageIndex === page.index && state.activeCap.band === band) return;
    if (!cols.some((c) => c.blocks.length > 0)) return;
    if (!state.bandStart || !state.registeredBand || state.registeredBand.pageIndex !== page.index || state.registeredBand.band !== band) return;
    const bottoms = cols.map((c) => c.bbox.y + (c.bbox.height - c.availableHeight));
    // The cut counts lines of the band's own text (#711,
    // `trailingStep: 'lines'`): an index or a list of references set on a
    // leading of its own is cut, and retried, by whole lines of that
    // leading, where a cut on the body grid lets a line more into one
    // column and each retry lowers it by more than a line of the band. A
    // band of body text has the grid for its pitch.
    const pitch = balancingCfg.trailingStep === 'grid' ? baselineGrid : bandLinePitch(cols, baselineGrid);
    const aroundZone = zone ? bandCapLinesAroundZone(cols, pitch, zone, (c) => columnBottom(c, uncappedBottoms)) : null;
    if (aroundZone === null && Math.max(...bottoms) - Math.min(...bottoms) <= baselineGrid + 0.5) {
      // A band that is level already needs no cap and no second pass, but
      // it ends here all the same: where the boundary closes the flow of
      // its page, its columns are cut on the grid line under its text, as
      // a delivered cap would leave them, so the column rule stops with
      // the text and not at the page foot (#713). Nothing is to be filled
      // up to the cut, so the columns are not flagged `trailingCap`.
      if (closeLevel) closeLevelBand(cols, bottoms);
      return;
    }
    // Float bands reserved at the columns' feet are the band's content too:
    // the level cut must leave them room under the text (a figure placed
    // before a span box then anchors to the cut, see `anchorToCap`). A band
    // every column reserves alike — a page-span table at the page foot —
    // stays where it is under the level cut and counts for nothing: adding
    // it would push the cut down by the table's height, the capped pass
    // could no longer seat the table below the cut, and the text would
    // fill a cap far taller than its level (EMP ch. 24 p. 279).
    const feet = cols.map((c) => reservedOf(c).bottom);
    const shared = Math.min(...feet);
    const footBands = feet.reduce((sum, b) => sum + (b - shared), 0);
    // A figure heading an otherwise empty column keeps its slot: the cut
    // goes no higher than the band it takes, or the capped pass evicts it
    // to a page of its own.
    const top = bandTop(cols);
    const floatHeads = cols
      .filter((c) => c.blocks.length === 0 && reservedOf(c).top > 0)
      .map((c) => Math.ceil((c.bbox.y - top - 0.01) / pitch));
    // So does one set under a page-span opener at the head of the opener's
    // own column (#639).
    for (const c of cols) {
      if (c.headFloatFoot !== undefined) floatHeads.push(Math.ceil((c.headFloatFoot - top - 0.01) / pitch));
    }
    bandCapProposals.set(boundaryIndex, {
      kind: 'trailing',
      startContentIndex: state.bandStart.contentIndex,
      startPart: state.bandStart.part,
      ...(state.bandStart.visit > 0 ? { startVisit: state.bandStart.visit } : {}),
      lines: aroundZone ?? Math.max(bandCapLines(cols, pitch, footBands), ...floatHeads),
      ...(pitch !== baselineGrid ? { pitchPx: pitch, retryLimit: capRetryLimit(pitch, baselineGrid) } : {}),
      retries: 0,
      ...(aroundZone !== null ? { zone } : {}),
      ...capOrigin(cols),
    });
  };

  /** Cut the columns of a closing band that ends level on the grid line
   *  under its lowest text (#713). What a column paints below its used
   *  height counts too (a tail whose negative margin snapped the flow back
   *  above its last line): the renderers clip a column to its box. The true
   *  bottoms go to `uncappedBottoms`, as under a delivered cap, so notes and
   *  floats keep reading the page's foot. */
  const closeLevelBand = (cols: readonly VDTColumn[], bottoms: readonly number[]): void => {
    const top = bandTop(cols);
    let lowest = Math.max(...bottoms);
    for (const c of cols) {
      for (const b of c.blocks) {
        if (!b.hidden) lowest = Math.max(lowest, late.paintedBottom(b), b.bbox.y + b.bbox.height);
      }
    }
    const lines = Math.ceil((lowest - top - 0.01) / baselineGrid);
    applyBandCap(cols, lines * baselineGrid, uncappedBottoms, undefined, false, top);
  };
  return {
    balanceExtraInColumn, addBalanceExtra, opensDefaultOpener, measuredAcrossPage, reserveOpenerBand,
    openerOwnColumn, openerHeadOf, underOpenerHeadFloat, atColumnHead, openerHeadSpacing,
    sideObstacleColumn, headingClaims, noteHeadingClaim, markSideObstacles, spanHeadingOpenedHere,
    openSpanHeadingHere, rollbackHeadings, bandCapProposals, spanPlacedInBand, bandCapsApplied,
    cappedBandColumns, enterBand, proposeTrailingCap
  };
}
