// Wrapped callout boxes, inline asides and inline table slices.
// Part of the placement pass (pass.ts), split out of it in #1276.
import { type PlannedCallout, offsetCalloutToAbsolute } from '../../callouts/calloutLayout.js';
import type { ResolvedCalloutStyleConfig, Resource, ResourceType } from '../../../types.js';
import { type CalloutLayouter, CUT_START } from '../../callouts/frameLayout.js';
import { type ResolvedWrap, wrapGapPx, minTextWidthPx, columnCursorY, resolveResourceWrap } from '../../floats/textWrap.js';
import { currentColumn, advanceToNextColumn, sideUsedBottom, sideColumnOf, FIT_EPS, placeBlockInColumn, type PlacementCursor } from '../../blocks/placement.js';
import { type VDTPage, pageIsVertical, type VDTColumn, type VDTBlock, createVDTBlock, type ResolvedConfig, type VDTDocument, type ResolvedResourceBlock, type ContentWarning } from '../../../vdt.js';
import { resolveResourcePlacement } from '../../floats/floatPlacement.js';
import type { ContentBlock } from '../../../parse/index.js';
import { type BlockMeasureContext, type MeasureContentBlockOptions, measureContentBlock } from '../../blocks/measureContentBlock.js';
import type { InlineAside } from '../passTypes.js';
import type { BlockStyle } from '../../styles.js';
import { pickTableStyle } from '../../../defaults/resources/tableStyle.js';
import { type TableSliceSpec, type TableRowMetrics, MIN_TAIL_ROWS, chooseTableSlice } from '../../resources/resourceLayout.js';
import type { SideObstacle } from '../../floats/floatSlots.js';
import type { PassState } from './state.js';

/** What createCalloutWrapped takes from the pass. */
export interface CalloutWrappedDeps {
  resolved: ResolvedConfig;
  dpi: number;
  baselineGrid: number;
  doc: VDTDocument;
  pageWidthPx: number;
  pageHeightPx: number;
  bodyOffset: number;
  contentBlocks: ContentBlock[];
  bodyStyle: BlockStyle;
  floatGapPx: number;
  offsetResourceBlockToAbsolute: (rb: ResolvedResourceBlock, ox: number, oy: number) => void;
  wrapExclusionWidth: (columnWidth: number, itemWidth: number, gap: number) => number;
  textWrapNotes: ContentWarning[];
  sideObstacles: WeakMap<VDTColumn, (SideObstacle & { owner: VDTBlock; })[]>;
  onNewPage: (page: VDTPage) => void;
  onAtomicNewPage: (heightPx: number) => (page: VDTPage) => void;
  cursor: PlacementCursor;
  stampBlockExtras: (blk: VDTBlock, raw: ContentBlock) => void;
  atColumnHead: (col: VDTColumn) => boolean;
  sideObstacleColumn: WeakMap<VDTBlock, VDTColumn>;
  enterBand: (contentIndex: number, part: number) => void;
  stampCalloutSource: (frame: VDTBlock, startIdx: number, plan: PlannedCallout, range?: { firstChildIdx: number; lastChildIdx: number; }) => void;
  mirroredOf: (page: VDTPage) => boolean;
  state: PassState;
}

export function createCalloutWrapped(deps: CalloutWrappedDeps) {
  const {
    resolved, dpi, baselineGrid, doc, pageWidthPx, pageHeightPx, bodyOffset, contentBlocks,
    bodyStyle, floatGapPx, offsetResourceBlockToAbsolute, wrapExclusionWidth, textWrapNotes,
    sideObstacles, onNewPage, onAtomicNewPage, cursor, stampBlockExtras, atColumnHead,
    sideObstacleColumn, enterBand, stampCalloutSource, mirroredOf, state
  } = deps;
  /**
   * Place a `:::callout` inline at the current column width as one atomic
   * unit: the frame block followed by its children in the same column. The
   * box's `marginTop` collapses with the pending spacing; `marginBottom` is
   * baked into the post-box grid snap (or, with `snapToGrid: false`, left
   * exact as pending spacing). A box that does not fit moves to the
   * next column/page (like a resource), pulling a run of trailing headings
   * along (keep-with-next). A splittable box (`keepTogether: false`, or a
   * keep-together one taller than a full column) instead leaves the
   * longest run of its children that fits in the column and continues — in
   * a box of its own, without the title or icon — at the top of the next
   * one, splitting again if needed; only a box no cut can split is placed
   * anyway in an empty column, overflowing (the sandbox warns).
   * Returns the content index to rewind the main loop to when headings
   * were rolled back, else `undefined`.
   *
   * `span: 'page'` boxes in multi-column layouts take the span-block path
   * (`placeCalloutSpan`) instead; `placement: 'top' | 'bottom'` (floating
   * boxes) still fall back to this inline placement for v1 — the frame's
   * `callout.placement` records the request.
   */
  /**
   * A box set `here` that text wraps round (#627): laid out whole at its
   * share of the column, at its side, level with the next line's top, then
   * set as a band the next running text takes back to run beside it (see
   * `pendingWrap`). It never splits: too tall for the room left, it moves
   * on to the next column (a `textWrap` warning says so). Frame and
   * children go to the page's floats, where a floated box goes. Returns
   * false, the box set in the flow as any, when the text beside it would
   * be too narrow or the box too short for lines beside it.
   */
  const placeCalloutWrapped = (
    startIdx: number,
    plan: PlannedCallout,
    style: ResolvedCalloutStyleConfig,
    L: CalloutLayouter,
    frameId: string,
    wrap: ResolvedWrap,
  ): boolean => {
    const settings = resolved.layout.wrap;
    const gap = wrapGapPx(wrap.gap, dpi, bodyStyle.fontSizePx, floatGapPx);
    const note = (reason: 'tooNarrow' | 'fewLines' | 'moved') => {
      const start = contentBlocks[startIdx]!;
      textWrapNotes.push({ kind: 'textWrap', reason, box: style.id, sourceStart: start.sourceStart + bodyOffset, sourceEnd: start.sourceEnd + bodyOffset, pageIndex: cursor.pageIndex });
    };
    let col = currentColumn(doc, cursor);
    if (col.bbox.width * (1 - wrap.width) - gap + 0.01 < minTextWidthPx(settings.minTextWidth, col.bbox.width, dpi, bodyStyle.fontSizePx)) {
      note('tooNarrow');
      return false;
    }
    for (let attempt = 0; ; attempt++) {
      col = currentColumn(doc, cursor);
      const page = doc.pages[cursor.pageIndex]!;
      const width = col.bbox.width * wrap.width;
      const result = L.layoutRange(CUT_START, L.end, width, frameId, false, mirroredOf(page));
      if (attempt === 0 && Math.ceil((result.totalHeight + gap - 0.01) / bodyStyle.lineHeightPx) < settings.minLinesBeside) {
        note('fewLines');
        return false;
      }
      const spacing = atColumnHead(col) ? 0 : state.pendingSpacing;
      if (result.totalHeight > col.availableHeight - spacing + 0.01 && col.blocks.length > 0 && attempt < 4) {
        if (attempt === 0) note('moved');
        state.pendingSpacing = 0;
        advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onNewPage);
        continue;
      }
      const top = columnCursorY(col) + spacing;
      const x = wrap.side === 'left' ? col.bbox.x : col.bbox.x + col.bbox.width - width;
      const frame = result.frame;
      stampCalloutSource(frame, startIdx, plan);
      frame.pageIndex = page.index;
      frame.columnIndex = col.index;
      offsetCalloutToAbsolute(result, x, top);
      const floats = (page.floats ??= []);
      doc.blocks.push(frame);
      floats.push(frame);
      for (const child of result.children) {
        child.pageIndex = page.index;
        child.columnIndex = col.index;
        doc.blocks.push(child);
        floats.push(child);
      }
      const bottomRel = Math.ceil((top - col.bbox.y + result.totalHeight + gap - 0.01) / baselineGrid) * baselineGrid;
      col.availableHeight = Math.max(0, Math.min(col.availableHeight, col.bbox.height - bottomRel));
      state.pendingSpacing = 0;
      state.inlineGapOwed = null;
      const exWidth = wrapExclusionWidth(col.bbox.width, width, gap);
      state.pendingWrap = {
        col,
        blocks: col.blocks.length,
        cursorY: columnCursorY(col),
        ex: {
          x: wrap.side === 'left' ? col.bbox.x : col.bbox.x + col.bbox.width - exWidth,
          y: top,
          width: exWidth,
          height: col.bbox.y + bottomRel - top,
          side: wrap.side,
          gap: exWidth - width,
          ownerId: frame.id,
        },
      };
      return true;
    }
  };

  /** Whether a resource set in the text asks for its caption in the side
   *  column (#729): `placement.captionSide` on a `span: 'column'` embed,
   *  `layout.inlineCaptionSide` on, a horizontal page, and no text wrapped
   *  round it. The side column and its room are looked at where the block
   *  is placed ({@link measureInlineAside}). */
  const inlineAsideWanted = (resource: Resource | undefined, type: ResourceType | undefined, page: VDTPage): boolean => {
    if (!resource || !resolved.layout.inlineCaptionSide || pageIsVertical(page)) return false;
    const placement = resolveResourcePlacement(resource, type);
    if (!placement.captionSide || placement.span !== 'column') return false;
    return resolveResourceWrap(resource, type, resolved.layout.wrap) === undefined;
  };
  /** Whether the side column `sc` is free over the band a caption
   *  `asideHeight` tall takes beside an embed placed next in `c`: the side
   *  stack ends above the embed's top, the band ends inside the side
   *  column, and no obstacle (a heading design, another embed's caption)
   *  stands in it or within the float gap of it. */
  const inlineAsideFree = (c: VDTColumn, sc: VDTColumn, spacing: number, asideHeight: number): boolean => {
    const top = c.bbox.y + (c.bbox.height - c.availableHeight) + (c.blocks.length === 0 ? 0 : spacing);
    const bottom = top + asideHeight;
    if (sideUsedBottom(sc) > top + 0.5) return false;
    if (bottom > sc.bbox.y + sc.bbox.height + 0.5) return false;
    return !(sideObstacles.get(sc) ?? []).some((o) => o.bottom + floatGapPx > top + 0.5 && o.top - floatGapPx < bottom - 0.5);
  };
  /** The embed measured for column `c` with its caption and note in the
   *  band's float-only side column, level with the body's top (#729), or
   *  `null` when the band has no such column or it is not free there: the
   *  caption then stays under the body. */
  const measureInlineAside = (
    raw: ContentBlock,
    blockIdx: number,
    c: VDTColumn,
    page: VDTPage,
    ctx: BlockMeasureContext,
    base: MeasureContentBlockOptions,
    spacing: number,
  ): InlineAside | null => {
    if (c.kind === 'span' || c.kind === 'side') return null;
    const sideCol = sideColumnOf(page, c.band ?? 0);
    if (!sideCol || sideCol.bbox.width <= 0.5) return null;
    const opts = { captionAside: { dx: sideCol.bbox.x - c.bbox.x, width: sideCol.bbox.width } };
    const block = measureContentBlock(raw, blockIdx, c.bbox.width, ctx, { ...base, ...opts });
    if (!block?.resourceBlock || block.asideHeight === undefined || block.resourceBlock.rotation) return null;
    if (!inlineAsideFree(c, sideCol, spacing, block.asideHeight)) return null;
    return { block, opts, sideCol, col: c };
  };
  /** The band an embed's side caption takes in the side column, recorded
   *  as an obstacle of its stack: side floats and side boxes set later go
   *  above it when they fit there, else under it. */
  const markInlineAside = (blk: VDTBlock, sideCol: VDTColumn, asideHeight: number): void => {
    if (!(asideHeight > 0)) return;
    const mark = { owner: blk, top: blk.bbox.y, bottom: blk.bbox.y + asideHeight };
    const list = sideObstacles.get(sideCol);
    if (list) list.push(mark);
    else sideObstacles.set(sideCol, [mark]);
    sideObstacleColumn.set(blk, sideCol);
  };

  /**
   * An inline table (`::resource` placed `here`) that does not fit the room
   * left in its column (#634), by its style's `overflow` when
   * `splitInline` is on: `'split'` cuts it between rows with the rules of a
   * floated table (`chooseTableSlice`: breakable edges, group heads, the
   * closing slice's three rows, header repeat, caption suffix, marker,
   * note on the last slice), the first slice keeping the float gap above
   * it and at least the header and {@link MIN_HEAD_ROWS} rows (fewer, and
   * the whole table starts in the next column, as before); every
   * continuation opens at the head of the next column, laid out at that
   * column's width, before the text after the table. `'clip'` keeps the
   * leading rows of a table taller than a column that fit the head of
   * one, `'hide'` leaves such a table out. Returns `'whole'` when the
   * table is placed as one block by the caller (it fits, or the rule does
   * not apply), `'dropped'`, or `'placed'`: every slice is placed and the
   * cursor sits in the column of the last one, which the caller snaps
   * under. `blk` is the first slice's block, filled in here. With
   * `asideWanted` the first slice sets its caption in the side column when
   * that is free beside it (#729); the continuations are set as ever.
   */
  const MIN_HEAD_ROWS = 2;
  const placeInlineTableSlices = (
    raw: ContentBlock,
    blockIdx: number,
    blk: VDTBlock,
    ctx: BlockMeasureContext,
    styleOverride: BlockStyle | undefined,
    resource: Resource,
    wholeHeight: number,
    spacingBefore: number,
    asideWanted = false,
  ): 'whole' | 'dropped' | 'placed' => {
    const style = pickTableStyle(resolved, resource.table?.styleId);
    if (!style.splitInline || pageIsVertical(doc.pages[cursor.pageIndex]!)) return 'whole';
    const rowCount = resource.table?.model.rows.length ?? 0;
    const first = currentColumn(doc, cursor);
    const room = first.availableHeight - (first.blocks.length === 0 ? 0 : spacingBefore);
    if (wholeHeight <= room + FIT_EPS) return 'whole';
    const overflow = style.overflow;
    // `'clip'` and `'hide'` concern a table no column holds; a shorter one
    // moves whole to the next column, as before.
    const taller = wholeHeight > state.contentArea.height + FIT_EPS;
    if (overflow !== 'split' && !taller) return 'whole';
    if (overflow === 'hide') return 'dropped';
    const measureAt = (width: number, slice?: TableSliceSpec) =>
      measureContentBlock(raw, blockIdx, width, ctx, { styleOverride, ...(slice ? { tableSlice: slice } : {}) });
    const metricsMemo = new Map<string, TableRowMetrics | null>();
    const metricsAt = (width: number): TableRowMetrics | null => {
      const key = width.toFixed(2);
      let m = metricsMemo.get(key);
      if (m === undefined) metricsMemo.set(key, (m = measureAt(width)?.tableRows ?? null));
      return m;
    };
    const firstMetrics = metricsAt(first.bbox.width);
    if (!firstMetrics || rowCount === 0) return 'whole';
    const headerRows = firstMetrics.headerRowCount;
    // Too few rows to leave a head and a tail worth the cut.
    if (overflow === 'split' && rowCount - headerRows < MIN_HEAD_ROWS + MIN_TAIL_ROWS) return 'whole';
    /** The rows a slice from `startRow` must carry at least, and its height
     *  at `width` (caption and marker included): what a page opened for it
     *  keeps clear of the floats it flushes (EF-160). */
    const floorOf = (startRow: number): number => (startRow === 0
      ? Math.min(rowCount, headerRows + (overflow === 'split' ? MIN_HEAD_ROWS : 1))
      : Math.max(startRow, headerRows) + 1);
    const minHeightAt = (width: number, startRow: number): number => {
      const floor = floorOf(startRow);
      const probe = measureAt(width, { startRow, endRow: floor, continues: floor < rowCount && overflow === 'split' });
      return probe?.measured.totalHeight ?? 0;
    };
    let startRow = 0;
    let part = 0;
    let moves = 0;
    let block = blk;
    /** Columns where the first slice's caption found no room at the side. */
    const asideRefused = new Set<VDTColumn>();
    for (;;) {
      enterBand(blockIdx, part);
      let col = currentColumn(doc, cursor);
      if (col.kind === 'span') {
        advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onAtomicNewPage(minHeightAt(col.bbox.width, startRow)));
        continue;
      }
      const width = col.bbox.width;
      const metrics = metricsAt(width) ?? firstMetrics;
      const spacing = part === 0 && col.blocks.length > 0 ? spacingBefore : 0;
      const avail = col.availableHeight - spacing;
      // The first slice with its caption in the side column (#729).
      const asideHere = asideWanted && startRow === 0 && !asideRefused.has(col)
        ? measureInlineAside(raw, blockIdx, col, doc.pages[cursor.pageIndex]!, ctx, { styleOverride }, spacing)
        : null;
      const sliceAt = (s?: TableSliceSpec) => (asideHere
        ? measureContentBlock(raw, blockIdx, width, ctx, { styleOverride, ...(s ? { tableSlice: s } : {}), ...asideHere.opts })
        : measureAt(width, s));
      const restSlice: TableSliceSpec | undefined = startRow > 0 ? { startRow, endRow: rowCount, continues: false } : undefined;
      const rest = sliceAt(restSlice);
      if (!rest?.resourceBlock) return part === 0 ? 'whole' : 'placed';
      let placed = rest;
      let slice: TableSliceSpec | null = null;
      if (rest.measured.totalHeight > avail + FIT_EPS) {
        const atHead = col.blocks.length === 0;
        // `'clip'` keeps the rows the head of a column holds.
        if (overflow === 'clip' && !atHead && moves < 4) {
          moves++;
          advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onAtomicNewPage(minHeightAt(width, startRow)));
          continue;
        }
        const firstBody = startRow > 0 ? Math.max(startRow, headerRows) : headerRows;
        const probe = sliceAt({ startRow, endRow: firstBody + 1, continues: true });
        const overhead = probe?.resourceBlock ? probe.measured.totalHeight - probe.resourceBlock.bodyRect.height : 0;
        // An empty column of full height (or a run of short ones behind)
        // takes the smallest slice even when it overflows: a fresh page
        // always progresses.
        const force = atHead && (col.bbox.height >= state.contentArea.height - baselineGrid || moves >= 4);
        slice = chooseTableSlice(metrics, startRow, avail - overhead, {
          floor: floorOf(startRow),
          force,
          split: overflow === 'split',
          fits: (s) => (sliceAt(s)?.measured.totalHeight ?? Infinity) <= avail + FIT_EPS,
        });
        if (!slice) {
          // Not even the head rows fit: the (rest of the) table starts in
          // the next column.
          moves++;
          state.pendingSpacing = 0;
          advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onAtomicNewPage(minHeightAt(width, startRow)));
          continue;
        }
        const m = sliceAt(slice);
        if (!m?.resourceBlock) return part === 0 ? 'whole' : 'placed';
        placed = m;
      }
      // The slice's caption (a line longer with its continuation suffix,
      // perhaps) must still find the side column free.
      if (asideHere && (placed.asideHeight === undefined || !inlineAsideFree(col, asideHere.sideCol, spacing, placed.asideHeight))) {
        asideRefused.add(col);
        continue;
      }
      // The slice's block: the first one is the caller's.
      if (part > 0) {
        block = createVDTBlock(`block-${state.blockIdCounter++}`, 'resource', blk.fontString, blk.color, blk.textAlign);
        block.contentIndex = blockIdx;
        stampBlockExtras(block, raw);
        block.dirty = false;
        block.snappedToGrid = false;
        block.sourceStart = blk.sourceStart;
        block.sourceEnd = blk.sourceEnd;
      }
      const rb = placed.resourceBlock!;
      const height = placed.measured.totalHeight;
      block.resourceBlock = rb;
      block.lines = [{
        text: '',
        bbox: { x: 0, y: 0, width: rb.bodyRect.width, height },
        baseline: 0,
        hyphenated: false,
        segments: [],
        isLastLine: true,
      }];
      col = currentColumn(doc, cursor);
      if (spacing > 0) col.availableHeight -= spacing;
      placeBlockInColumn(block, height, col, cursor);
      offsetResourceBlockToAbsolute(rb, block.bbox.x, block.bbox.y);
      if (asideHere && placed.asideHeight !== undefined) markInlineAside(block, asideHere.sideCol, placed.asideHeight);
      doc.blocks.push(block);
      enterBand(blockIdx, part);
      if (!slice?.continues) return 'placed';
      // The rest opens the next column, with no gap above it.
      startRow = slice.endRow;
      part++;
      moves = 0;
      state.pendingSpacing = 0;
      advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onAtomicNewPage(minHeightAt(width, startRow)));
    }
  };
  return {
    placeCalloutWrapped, inlineAsideWanted, measureInlineAside, markInlineAside,
    placeInlineTableSlices
  };
}
