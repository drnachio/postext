// The float queue of a pass: floats waiting for a slot, opener floats, side
// boxes waiting for their band, and the gates that hold a float until the
// line citing it is set.
// Part of the placement pass (pass.ts), split out of it in #1276.
import type { PlannedFloat } from '../../floats/floatPlacement.js';
import type { PlannedCallout } from '../../callouts/calloutLayout.js';
import type { ResolvedCalloutStyleConfig } from '../../../types.js';
import type { VDTPage, ContentWarning, VDTColumn, VDTLine, VDTBlock, ResolvedConfig, VDTDocument } from '../../../vdt.js';
import { currentBand, bandColumns, sideColumnOf, type PlacementCursor } from '../../blocks/placement.js';
import { isMarkerBlock } from '../../blocks/buildHelpers.js';
import type { ContentBlock } from '../../../parse/index.js';
import type { CalloutLayouter } from '../../callouts/frameLayout.js';
import type { PassState, PassLate } from './state.js';

/** What createFloatQueue takes from the pass. */
export interface FloatQueueDeps {
  resolved: ResolvedConfig;
  doc: VDTDocument;
  bodyOffset: number;
  contentBlocks: ContentBlock[];
  floatsByFirstBlock: Map<number, PlannedFloat[]>;
  calloutFloats: Map<number, { plan: PlannedCallout; style: ResolvedCalloutStyleConfig; L: CalloutLayouter; }>;
  cursor: PlacementCursor;
  state: PassState;
  late: PassLate;
}

export function createFloatQueue(deps: FloatQueueDeps) {
  const {
    resolved, doc, bodyOffset, contentBlocks, floatsByFirstBlock, calloutFloats, cursor, state, late
  } = deps;
  // Floats whose first reference has been passed but which are not yet placed
  // into a page band, in reading order.
  const pendingFloats: PlannedFloat[] = [];
  /** `span: 'side'` boxes that found no room in the side column of their
   *  page: they take the side column of the next page the flow opens, in
   *  order (see `placeCalloutSide`). */
  const pendingSideBoxes: { startIdx: number; plan: PlannedCallout; style: ResolvedCalloutStyleConfig; pageIndex: number }[] = [];
  /** The flow segment has ended and its floats and side boxes are taking
   *  pages after the text (see `drainPendingFloats`, #639). */
  state.drainingAfterText = false;
  /** Opener pages (`layout.openerFloats`, #749): the page a part opens,
   *  the page a heading opens with its own break, and the first page of a
   *  document that starts with a heading. Under `'avoid'` they offer a
   *  float no slot (see `placeFloatInColumns`), so it takes the first one
   *  after them; under `'warn'` each float set on one is reported. */
  const openerPages = new Set<VDTPage>();
  const openerFloatRule = resolved.layout.openerFloats;
  /** The `openerFloat` warnings of this pass, and the floats they name. */
  const openerFloatNotes: ContentWarning[] = [];
  const openerFloatsNoted = new Set<string>();
  const noteOpenerFloat = (page: VDTPage, f: PlannedFloat): void => {
    if (openerFloatRule !== 'warn' || !openerPages.has(page) || openerFloatsNoted.has(f.resourceId)) return;
    openerFloatsNoted.add(f.resourceId);
    const box = f.callout ? calloutFloats.get(f.callout.startIdx) : undefined;
    const first = contentBlocks[box ? f.callout!.startIdx : f.firstBlockIdx];
    const last = contentBlocks[box ? box.plan.endIdx : f.firstBlockIdx];
    openerFloatNotes.push({
      kind: 'openerFloat',
      ...(box ? {} : { resourceId: f.resourceId }),
      ...(first && last ? { sourceStart: first.sourceStart + bodyOffset, sourceEnd: last.sourceEnd + bodyOffset } : {}),
      pageIndex: page.index,
    });
  };
  /** `span: 'side'` boxes of a style with `sideAtColumnEnd: 'after'`
   *  (EF-161), and the side boxes fenced behind them, waiting for the text
   *  after their fence to land (see `settleAwaitingSideBoxes`). Each keeps
   *  where its fence was: its page, band, text column and the y the text
   *  would have gone on at. */
  const awaitingSideBoxes: {
    box: { startIdx: number; plan: PlannedCallout; style: ResolvedCalloutStyleConfig };
    pageIndex: number;
    band: number;
    column: VDTColumn;
    refY: number;
  }[] = [];
  /** Whether the band the cursor is in lays out as a multi-column band:
   *  two or more text columns, or one beside a float-only side column — a
   *  page-span block then cuts the band across every column. */
  const multiColumnBand = (page: VDTPage): boolean => {
    const band = currentBand(page, cursor);
    return bandColumns(page, band).length > 1 || sideColumnOf(page, band) !== undefined;
  };
  /** Resource ids already enqueued in this pass — a keep-with-next rewind
   *  replays the loop top for the rolled-back blocks and must not enqueue
   *  (and later place) the same float twice. */
  const enqueuedFloatIds = new Set<string>();
  const enqueueFloatsFor = (blockIdx: number): void => {
    const fl = floatsByFirstBlock.get(blockIdx);
    if (!fl) return;
    const page = doc.pages[cursor.pageIndex];
    const col = page?.columns[cursor.columnIndex];
    for (const f of fl) {
      if (enqueuedFloatIds.has(f.resourceId)) continue;
      enqueuedFloatIds.add(f.resourceId);
      // Where the citing block starts: a side float stacks beside it.
      const stamped: PlannedFloat = col
        ? { ...f, refPageIndex: page!.index, refY: col.bbox.y + (col.bbox.height - col.availableHeight) + (col.blocks.length > 0 ? state.pendingSpacing : 0) }
        : f;
      pendingFloats.push(stamped);
    }
  };
  /** Floats first cited in a text block that is still being placed, keyed
   *  by resource id: the block and the index, among its measured lines, of
   *  the line that holds the citation. A float is queued when its citing
   *  block starts, but until that line is placed it takes no slot — not the
   *  head of a page the block's earlier lines open, nor that of the page
   *  the whole block moves on to — so it never lands above the line that
   *  cites it (EF-69). Side floats sit beside their text and are not held. */
  const citationGates = new Map<string, { blockIdx: number; line: number }>();
  /** The text block whose lines are being placed, and how many are. */
  const citedLines = { blockIdx: -1, placed: 0 };
  const awaitsCitation = (f: PlannedFloat): boolean => citationGates.has(f.resourceId);
  /** Drop the gates of blocks before `blockIdx` (a block always places all
   *  its lines before the flow moves past it; this only guards against a
   *  gate outliving its block), or every gate at a chapter barrier. */
  const releaseStaleCitationGates = (blockIdx = Infinity): void => {
    for (const [id, gate] of citationGates) if (gate.blockIdx < blockIdx) citationGates.delete(id);
  };
  /** Gate the pending floats first cited in `lines` of text block
   *  `blockIdx`, before its first line is placed. A keep-with-next rewind
   *  that places the headings before it again leaves its gates standing:
   *  they belong to a later block. */
  const gateCitedFloats = (blockIdx: number, lines: readonly VDTLine[]): void => {
    citedLines.blockIdx = blockIdx;
    citedLines.placed = 0;
    const fl = floatsByFirstBlock.get(blockIdx);
    if (!fl) return;
    for (const f of fl) {
      if (f.span === 'side' || !pendingFloats.some((p) => p.resourceId === f.resourceId)) continue;
      const line = lines.findIndex((l) => l.segments?.some((s) => s.refResourceId === f.resourceId));
      if (line >= 0) citationGates.set(f.resourceId, { blockIdx, line });
    }
  };
  /** A paragraph re-broken after some of its lines were placed (the lines
   *  placed are unchanged): the floats it still holds back wait for the
   *  line of the new setting that cites them. */
  const regateCitedFloats = (blockIdx: number, lines: readonly VDTLine[]): void => {
    for (const [id, gate] of citationGates) {
      if (gate.blockIdx !== blockIdx || gate.line === Infinity) continue;
      const line = lines.findIndex((l) => l.segments?.some((s) => s.refResourceId === id));
      if (line >= 0) citationGates.set(id, { blockIdx, line });
    }
  };
  /** Gate the pending floats first cited by the children of a box (content
   *  indices `from`…`to`) until the fragment that holds the citing child
   *  is committed: a box split across pages must not let a figure its
   *  second part cites head the page that part opens (above it). */
  const gateBoxCitations = (from: number, to: number): void => {
    for (let i = from; i <= to; i++) {
      for (const f of floatsByFirstBlock.get(i) ?? []) {
        if (f.span === 'side' || !pendingFloats.some((p) => p.resourceId === f.resourceId)) continue;
        citationGates.set(f.resourceId, { blockIdx: i, line: Infinity });
      }
    }
  };
  /** A box fragment was committed: every child before content index
   *  `placedBefore` is set whole, so the floats they cite may take slots
   *  from here on. */
  const releaseBoxCitations = (placedBefore: number): void => {
    for (const [id, gate] of citationGates) {
      if (gate.line !== Infinity || gate.blockIdx >= placedBefore) continue;
      citationGates.delete(id);
      const at = pendingFloats.findIndex((p) => p.resourceId === id);
      if (at >= 0) pendingFloats[at] = { ...pendingFloats[at]!, refPageIndex: cursor.pageIndex };
    }
  };
  /** The block a free heading at `blockIdx` keeps with: the first one after
   *  it that is not a heading, a directive or a container marker (a box's
   *  opening fence counts: the box is placed there). `undefined` without
   *  keep-with-next, or when nothing follows. */
  const keepWithNextTarget = (blockIdx: number): number | undefined => {
    if (!resolved.headings.keepWithNext) return undefined;
    for (let j = blockIdx + 1; j < contentBlocks.length; j++) {
      const b = contentBlocks[j]!;
      if (b.type === 'containerStart' && b.containerName === 'callout') return j;
      if (b.type === 'heading' || b.type === 'directive' || isMarkerBlock(b)) continue;
      return j;
    }
    return undefined;
  };
  /** `placed`, the part of the block just set in its column, holds its
   *  next lines: release the floats they cite, stamped with the page and
   *  height of the citing line. A free heading's floats wait instead for
   *  the block it keeps with: until that block is placed, a keep-with-next
   *  rollback can still carry the heading to the next column or page, and
   *  a float placed meanwhile would sit above the line that cites it. The
   *  gate moves to that block's first line (`releaseStaleCitationGates`
   *  keeps it; its first `citedLinesPlaced` releases it, or the flow moving
   *  past it does), and a rollback that replays the heading gates it on the
   *  heading again (`gateCitedFloats`). */
  const citedLinesPlaced = (blockIdx: number, placed: VDTBlock): void => {
    late.reserveCitedNotes(placed);
    // Side boxes waiting for the text after their fence stand beside it
    // before the floats this text cites take the side column.
    late.settleAwaitingSideBoxes(false);
    if (citedLines.blockIdx !== blockIdx) return;
    const from = citedLines.placed;
    citedLines.placed += placed.lines.length;
    const keeper = placed.type === 'heading' && placed.containerId === undefined
      ? keepWithNextTarget(blockIdx)
      : undefined;
    for (const [id, gate] of citationGates) {
      if (gate.blockIdx !== blockIdx || gate.line >= citedLines.placed) continue;
      if (keeper !== undefined) {
        citationGates.set(id, { blockIdx: keeper, line: 0 });
        continue;
      }
      citationGates.delete(id);
      const at = pendingFloats.findIndex((p) => p.resourceId === id);
      const line = placed.lines[Math.max(0, gate.line - from)];
      if (at >= 0 && line) pendingFloats[at] = { ...pendingFloats[at]!, refPageIndex: cursor.pageIndex, refY: line.bbox.y };
    }
  };
  return {
    pendingFloats, pendingSideBoxes, openerPages, openerFloatRule, openerFloatNotes, noteOpenerFloat,
    awaitingSideBoxes, multiColumnBand, enqueuedFloatIds, enqueueFloatsFor, citationGates,
    awaitsCitation, releaseStaleCitationGates, gateCitedFloats, regateCitedFloats, gateBoxCitations,
    releaseBoxCitations, citedLinesPlaced
  };
}
