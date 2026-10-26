// Comic spreads and strips placed in the flow.
// Part of the placement pass (pass.ts), split out of it in #1276.
import { advanceToNextColumn, currentColumn, FIT_EPS, placeAtomicBlock, type PlacementCursor } from '../../placement.js';
import type { ComicPageSource } from '../../../comics/types.js';
import type { PlannedComposedPage } from '../../composedLayout.js';
import { createVDTColumn, type VDTPage, type VDTComicPage, pageIsVertical, type ResolvedConfig, type VDTDocument, type VDTBlock, type VDTColumn } from '../../../vdt.js';
import { pageMirrored, type PageMetrics } from '../../buildHelpers.js';
import { layoutComicSpread, comicSpreadGutter } from '../../../comics/spread.js';
import { comicStripPlacement } from '../../../comics/strip.js';
import type { BlockMeasureContext } from '../../measureContentBlock.js';
import type { Resource, ResolvedHeadingStyleConfig } from '../../../types.js';
import type { PartPlan } from '../../parts.js';
import type { HeadingSectionPlan } from '../../headingStyles.js';
import type { PlannedFloat } from '../../floatPlacement.js';
import type { StripGeometry } from './types.js';
import type { PassState, PassLate } from './state.js';

/** What createComics takes from the pass. */
export interface ComicsDeps {
  resolved: ResolvedConfig;
  dpi: number;
  baselineGrid: number;
  doc: VDTDocument;
  pageIndexOffset: number;
  pageMetrics: PageMetrics;
  pageWidthPx: number;
  pageHeightPx: number;
  bodyOffset: number;
  resourceById: Map<string, Resource>;
  partPlan: PartPlan;
  sectionPlan: HeadingSectionPlan;
  pendingFloats: PlannedFloat[];
  enqueuedFloatIds: Set<string>;
  COMIC_STRIP_PREFIX: string;
  stripGeometry: (blockIdx: number, source: ComicPageSource, measure: number, max: number, vertical: boolean) => StripGeometry;
  buildComicStripBlock: (blockIdx: number, source: ComicPageSource, x: number, width: number, max: number, pageIndex: number, keep?: StripGeometry) => VDTBlock;
  withStripPlaceholder: (blk: VDTBlock, g: StripGeometry) => void;
  floatGapPx: number;
  onAtomicNewPage: (heightPx: number) => (page: VDTPage) => void;
  partMeasureCtx: BlockMeasureContext;
  cursor: PlacementCursor;
  sectionMeasureCtx: (style: ResolvedHeadingStyleConfig | undefined) => BlockMeasureContext;
  rollbackHeadings: (col: VDTColumn) => VDTBlock[];
  enterBand: (contentIndex: number, part: number) => void;
  trailingHeadingRun: (col: VDTColumn) => number;
  headingRunMayLeave: (col: VDTColumn, run: number, shortColumn?: boolean) => boolean;
  state: PassState;
  late: PassLate;
}

export function createComics(deps: ComicsDeps) {
  const {
    resolved, dpi, baselineGrid, doc, pageIndexOffset, pageMetrics, pageWidthPx, pageHeightPx,
    bodyOffset, resourceById, partPlan, sectionPlan, pendingFloats, enqueuedFloatIds,
    COMIC_STRIP_PREFIX, stripGeometry, buildComicStripBlock, withStripPlaceholder, floatGapPx,
    onAtomicNewPage, partMeasureCtx, cursor, sectionMeasureCtx, rollbackHeadings, enterBand,
    trailingHeadingRun, headingRunMayLeave, state, late
  } = deps;
  /** The page break into a page of the parity `even` asks (a spread opens
   *  on a verso, an even page): the page the cursor stands on, an empty
   *  one, is marked a parity blank and passed while its number is odd. Even
   *  at the start of a document (page 1 stands alone, a recto). */
  const breakToEvenPage = (): void => {
    for (let guard = 0; guard < 4; guard++) {
      const page = doc.pages[cursor.pageIndex]!;
      if ((page.index + pageIndexOffset + 1) % 2 === 0) return;
      page.blankForParity = true;
      const start = cursor.pageIndex;
      do {
        advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx);
      } while (cursor.pageIndex === start);
    }
  };

  /**
   * `:::page{spread}` (#567): a comic laid over two facing pages. It opens
   * on a verso — an even page, the left one of a left-bound book and the
   * right one of a right-bound book — with a parity blank before it when
   * needed; the verso and the recto after it get one half each
   * (`layoutComicSpread`). The cursor is left on the recto.
   */
  const placeComicSpread = (source: ComicPageSource, textPlan?: PlannedComposedPage): void => {
    breakToEvenPage();
    const verso = doc.pages[cursor.pageIndex]!;
    verso.columns = [createVDTColumn(0, verso.contentArea)];
    const start = cursor.pageIndex;
    do {
      advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx);
    } while (cursor.pageIndex === start);
    const recto = doc.pages[cursor.pageIndex]!;
    recto.columns = [createVDTColumn(0, recto.contentArea)];
    const side = (page: VDTPage) => ({
      page,
      trimBox: pageMetrics.physical.trimBox,
      bleedBox: pageMetrics.physical.bleedBox,
      mirrorMargins: pageMirrored(resolved, page.index, pageIndexOffset, true),
    });
    const versoIsLeft = resolved.page.binding !== 'right';
    const [left, right] = layoutComicSpread(source, {
      resolved,
      resources: resourceById,
      sourceOffset: bodyOffset,
      left: side(versoIsLeft ? verso : recto),
      right: side(versoIsLeft ? recto : verso),
    });
    verso.comic = versoIsLeft ? left : right;
    recto.comic = versoIsLeft ? right : left;
    // The text panels (#959): each on the page that holds most of its
    // panel, off the gutter.
    if (textPlan) {
      const sides: Array<[VDTPage, VDTComicPage, VDTComicPage]> = [[verso, verso.comic, recto.comic], [recto, recto.comic, verso.comic]];
      for (const [page, own, other] of sides) {
        const width = (c: VDTComicPage, index: number): number => c.panels.find((q) => q.index === index)?.bbox.width ?? 0;
        const mine = new Set(own.panels.filter((q) => width(own, q.index) > width(other, q.index) || (width(own, q.index) === width(other, q.index) && page === (versoIsLeft ? verso : recto))).map((q) => q.index));
        const gutter = comicSpreadGutter(own, dpi, page.height);
        late.placeComicText(page, own, textPlan, { only: mine, ...(gutter ? { avoid: [gutter] } : {}) });
      }
    }
  };

  /**
   * `:::strip` (#566): a comic in the flow, kept together. Set `here`, it
   * takes the column it falls in at that column's measure — or moves whole
   * to the next column or page, taking a run of headings closing the
   * column along (keep-with-next; returns the index to replay from then).
   * Floated (`placement=top|bottom|auto`), or page-wide on a page of
   * several columns, it waits in the float queue for the first free band
   * from here on, as a figure does.
   */
  /** Boxes of page-wide strips set in the flow (no band of several
   *  columns where they stood): their markers are passed over. */
  const looseStripBoxes = new Set<number>();
  const placeComicStrip = (blockIdx: number, source: ComicPageSource): number | undefined => {
    const place = comicStripPlacement(source.attrs);
    const page = doc.pages[cursor.pageIndex]!;
    // (A page-wide strip set `here` on a page of several columns is boxed
    // by `wrapPageSpanEmbeds` and cuts the band as a page-span box does.)
    if (place.position !== 'here') {
      const key = `${COMIC_STRIP_PREFIX}${blockIdx}`;
      // A keep-with-next replay passes the fence again: enqueue once.
      if (!enqueuedFloatIds.has(key)) {
        enqueuedFloatIds.add(key);
        const col = page.columns[cursor.columnIndex];
        pendingFloats.push({
          resourceId: key,
          firstBlockIdx: blockIdx,
          position: place.position,
          span: place.span,
          ...(col ? { refPageIndex: page.index, refY: col.bbox.y + (col.bbox.height - col.availableHeight) } : {}),
        });
      }
      return undefined;
    }
    const col = currentColumn(doc, cursor);
    const g = stripGeometry(blockIdx, source, col.bbox.width, state.contentArea.height, pageIsVertical(page));
    const height = g.height;
    const spacingBefore = Math.max(state.pendingSpacing, floatGapPx);
    if (col.blocks.length > 0 && height > col.availableHeight - spacingBefore + FIT_EPS) {
      const run = trailingHeadingRun(col);
      if (headingRunMayLeave(col, run)) {
        const rolled = rollbackHeadings(col);
        state.pendingSpacing = 0;
        advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onAtomicNewPage(height));
        return (rolled[0]!.contentIndex ?? blockIdx - rolled.length) - 1;
      }
    }
    const blk = buildComicStripBlock(blockIdx, source, 0, col.bbox.width, state.contentArea.height, cursor.pageIndex);
    withStripPlaceholder(blk, g);
    enterBand(blockIdx, 0);
    placeAtomicBlock(blk, height, spacingBefore, cursor, doc, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onAtomicNewPage(height));
    enterBand(blockIdx, 0);
    // Laid out again where it landed: the page it reports on, and the
    // measure of that column (a side column, another section's).
    const landed = buildComicStripBlock(blockIdx, source, 0, blk.bbox.width, state.contentArea.height, cursor.pageIndex, g);
    blk.comic = landed.comic;
    doc.blocks.push(blk);
    // The flow after the strip goes back to the baseline grid, and the
    // float gap is owed below it, as after an inline figure.
    const rCol = currentColumn(doc, cursor);
    const usedHeight = rCol.bbox.height - rCol.availableHeight;
    const snappedBottom = Math.ceil((usedHeight - 0.01) / baselineGrid) * baselineGrid;
    rCol.availableHeight = Math.max(0, rCol.bbox.height - snappedBottom);
    const owed = resolved.layout.inlineResourceGap === 'above' ? 0 : floatGapPx - (snappedBottom - usedHeight);
    state.pendingSpacing = owed > 0.01 ? Math.ceil((owed - 0.01) / baselineGrid) * baselineGrid : 0;
    state.inlineGapOwed = state.pendingSpacing > 0 ? { afterIdx: blockIdx, pending: state.pendingSpacing, exact: owed } : null;
    return undefined;
  };

  // --- Blocks of the contents kept together (`toc.groups`, #850) -----------
  /** The measure context of content block `idx` (a part's, a styled
   *  section's). */
  const measureCtxOf = (idx: number): BlockMeasureContext =>
    (partPlan.byBlock[idx] ? partMeasureCtx : sectionMeasureCtx(sectionPlan.byBlock[idx]));
  return {
    breakToEvenPage, placeComicSpread, looseStripBoxes, placeComicStrip, measureCtxOf
  };
}
