// Short lists kept whole (composition rule shortListSplit) and the room a
// cited footnote takes.
// Part of the placement pass (pass.ts), split out of it in #1276.
import { type BlockMeasureContext, measureContentBlock } from '../../blocks/measureContentBlock.js';
import { isMarkerBlock, prevNonMarkerBlock } from '../../blocks/buildHelpers.js';
import { FIT_EPS, type PlacementCursor } from '../../blocks/placement.js';
import { chooseParagraphSplit } from '../../blocks/orphanWidow.js';
import type { ContentBlock } from '../../../parse/index.js';
import type { VDTLine, VDTColumn, ContentWarning, ResolvedConfig, VDTDocument, VDTPage } from '../../../vdt.js';
import { listItemGapPx, listItemSpacingPx } from '../../text/lists.js';
import { enumerateCurrentPageSlots, type ColumnCapKind, type FloatSlotPosition, type FloatMeasure } from '../../floats/floatSlots.js';
import type { PartPlan } from '../../sections/parts.js';
import type { HeadingSectionPlan } from '../../sections/headingStyles.js';
import type { PlannedFloat } from '../../floats/floatPlacement.js';
import type { CompositionRule } from '../../../types/bodyText.js';
import type { TableSliceSpec } from '../../resources/resourceLayout.js';
import type { FloatRotation, CaptionAside } from './types.js';
import type { ResolvedHeadingStyleConfig } from '../../../types.js';
import type { PassState } from './state.js';

/** What createShortLists takes from the pass. */
export interface ShortListsDeps {
  resolved: ResolvedConfig;
  doc: VDTDocument;
  bodyOffset: number;
  contentBlocks: ContentBlock[];
  partPlan: PartPlan;
  sectionPlan: HeadingSectionPlan;
  pendingFloats: PlannedFloat[];
  openerPages: Set<VDTPage>;
  openerFloatRule: CompositionRule;
  citationGates: Map<string, { blockIdx: number; line: number; }>;
  capKindOf: (col: VDTColumn) => ColumnCapKind;
  probeFloatBand: (page: VDTPage, f: PlannedFloat, targetCols: readonly VDTColumn[], position: FloatSlotPosition, pageSpan: boolean, anchorToCap: boolean, side?: boolean, refY?: number) => { need: number; y: number; measure: FloatMeasure; slice: TableSliceSpec | undefined; width: number; xLeft: number; rotated: FloatRotation | undefined; aside?: CaptionAside; sideCol?: VDTColumn; } | null;
  availableAfterBand: (col: VDTColumn, position: FloatSlotPosition, probe: { need: number; y: number; measure: FloatMeasure; }, anchorToCap: boolean) => number;
  partMeasureCtx: BlockMeasureContext;
  cursor: PlacementCursor;
  sectionMeasureCtx: (style: ResolvedHeadingStyleConfig | undefined) => BlockMeasureContext;
  openerHeadOf: (col: VDTColumn) => number | undefined;
  state: PassState;
}

export function createShortLists(deps: ShortListsDeps) {
  const {
    resolved, doc, bodyOffset, contentBlocks, partPlan, sectionPlan, pendingFloats, openerPages,
    openerFloatRule, citationGates, capKindOf, probeFloatBand, availableAfterBand, partMeasureCtx,
    cursor, sectionMeasureCtx, openerHeadOf, state
  } = deps;
  /**
   * `bodyText.keepColonWithList` with `colonListRoom: 'item'` (EF-110):
   * whether the first item of the list after the lead-in paragraph
   * `leadIdx` can start in `roomPx` of column under it — it fits whole, or
   * the orphan and widow rules for lists would leave some of its lines
   * there, as they do when it is set.
   */
  const firstListItemStarts = (leadIdx: number, roomPx: number, width: number, ctx: BlockMeasureContext): boolean => {
    let idx = leadIdx + 1;
    while (idx < contentBlocks.length && isMarkerBlock(contentBlocks[idx]!)) idx++;
    const raw = contentBlocks[idx];
    // A poem (#378) after its introducer: its first bayts, by the
    // paragraph rules.
    const verse = raw?.verse !== undefined;
    if (!raw || (raw.type !== 'listItem' && !verse)) return true;
    const item = measureContentBlock(raw, idx, width, ctx);
    if (!item) return true;
    const lines = item.measured.lines.length;
    const fit = Math.floor((roomPx + FIT_EPS) / item.kind.style.lineHeightPx);
    if (lines <= fit) return true;
    if (fit < 1) return false;
    const body = resolved.bodyText;
    return chooseParagraphSplit(lines, fit, {
      avoidOrphans: body.avoidOrphans && (verse || body.avoidOrphansInLists),
      orphanMinLines: body.orphanMinLines,
      orphanPenalty: body.orphanPenalty,
      avoidWidows: body.avoidWidows && (verse || body.avoidWidowsInLists),
      widowMinLines: body.widowMinLines,
      widowPenalty: body.widowPenalty,
      slackWeight: body.slackWeight,
    }).splitAt > 0;
  };

  // --- Short lists kept whole (`bodyText.shortListSplit`, #749) -------------
  const shortListRule = resolved.bodyText.shortListSplit;
  /** The short lists of the running text by the content index of their
   *  first item (`null`: a block that opens none). */
  const shortLists = new Map<number, { items: number[] } | null>();
  /**
   * The short list content block `idx` opens: a run of list items (seen
   * through container markers, its nested lists included) of up to
   * `bodyText.shortListMaxItems` items, `idx` being its first. Not the
   * entries of the contents or of an index, which are set as list items.
   */
  const shortListFrom = (idx: number): { items: number[] } | undefined => {
    const known = shortLists.get(idx);
    if (known !== undefined) return known ?? undefined;
    const isItem = (b: ContentBlock | undefined): boolean =>
      b?.type === 'listItem' && b.toc === undefined && b.index === undefined;
    let found: { items: number[] } | null = null;
    if (isItem(contentBlocks[idx]) && prevNonMarkerBlock(contentBlocks, idx)?.type !== 'listItem') {
      const items: number[] = [];
      let i = idx;
      for (; i < contentBlocks.length; i++) {
        const b = contentBlocks[i]!;
        if (isMarkerBlock(b)) continue;
        if (!isItem(b)) break;
        items.push(i);
        if (items.length > resolved.bodyText.shortListMaxItems) break;
      }
      if (items.length <= resolved.bodyText.shortListMaxItems) found = { items };
    }
    shortLists.set(idx, found);
    return found ?? undefined;
  };
  /** The room a short list takes in a column `width` wide, from the top of
   *  its first line to the foot of its last (the space above it aside),
   *  and its lines, for the notes they cite. Undefined when an item
   *  cannot be measured. */
  const shortListNeed = (list: { items: number[] }, width: number, ctx: BlockMeasureContext): { height: number; lines: VDTLine[] } | undefined => {
    let height = 0;
    const lines: VDTLine[] = [];
    let prev: ContentBlock | undefined;
    for (const idx of list.items) {
      const raw = contentBlocks[idx]!;
      const item = measureContentBlock(raw, idx, width, ctx);
      if (!item) return undefined;
      if (prev) {
        height += listItemGapPx(
          { spacingPx: listItemSpacingPx(prev, ctx.resolved), depth: prev.depth ?? 1 },
          { spacingPx: listItemSpacingPx(raw, ctx.resolved), depth: raw.depth ?? 1 },
        );
      }
      height += item.measured.lines.length * item.kind.style.lineHeightPx;
      lines.push(...item.measured.lines);
      prev = raw;
    }
    return { height, lines };
  };
  /**
   * The room the floats text block `blockIdx` cites would take from the
   * foot of `col` once their citing lines are placed: for each one still
   * held back for it, the band of its first slot on the page, when that is
   * a foot band over `col` that the room the block leaves under it
   * (`roomAfter`) still holds. Read before the block is placed, so an
   * estimate: the colon line of a short list set whole counts it, since
   * the figure that line cites takes the foot of the column right after
   * it, where the list would have gone.
   */
  const citedFootTake = (blockIdx: number, col: VDTColumn, roomAfter: number): number => {
    const page = doc.pages[cursor.pageIndex]!;
    if (openerFloatRule === 'avoid' && openerPages.has(page)) return 0;
    let take = 0;
    for (const [id, gate] of citationGates) {
      if (gate.blockIdx !== blockIdx) continue;
      const f = pendingFloats.find((p) => p.resourceId === id);
      const slot = f ? enumerateCurrentPageSlots(page, cursor.columnIndex, f, capKindOf, openerHeadOf)[0] : undefined;
      if (!f || !slot || slot.side || slot.position !== 'bottom' || !slot.cols.includes(col)) continue;
      const probe = probeFloatBand(page, f, slot.cols, slot.position, slot.pageSpan, false);
      if (!probe) continue;
      const band = col.availableHeight - availableAfterBand(col, 'bottom', probe, false);
      if (band <= roomAfter + FIT_EPS) take = Math.max(take, band);
    }
    return take;
  };
  /** The short list item `idx` belongs to, and its place in it. */
  const shortListItemAt = (idx: number): { list: { items: number[] }; item: number } | undefined => {
    if (contentBlocks[idx]?.type !== 'listItem') return undefined;
    let start = idx;
    for (let i = idx - 1, seen = 0; i >= 0 && seen <= resolved.bodyText.shortListMaxItems; i--) {
      const b = contentBlocks[i]!;
      if (isMarkerBlock(b)) continue;
      if (b.type !== 'listItem') break;
      start = i;
      seen++;
    }
    const list = shortListFrom(start);
    const item = list ? list.items.indexOf(idx) : -1;
    return list && item >= 0 ? { list, item } : undefined;
  };
  /**
   * Under `'avoid'`, the short list content block `idx` opens or goes on
   * with, as the floats offered a slot right before it see a keep-together
   * box (`slotStarvesBox`): its height at a column width, from that item
   * on. A float yields to it when the cursor's column holds the list whole
   * and would not with the float: the figure a list's own lead-in cites
   * would otherwise take the foot of the column once its citing line is
   * placed, and cut the list under it.
   */
  const shortListBoxAt = (idx: number): { heightAt: (width: number) => number; stays: boolean } | null => {
    if (shortListRule !== 'avoid') return null;
    const at = shortListItemAt(idx);
    if (!at) return null;
    const ctx = partPlan.byBlock[idx] ? partMeasureCtx : sectionMeasureCtx(sectionPlan.byBlock[idx]);
    const rest = { items: at.list.items.slice(at.item) };
    const heights = new Map<number, number>();
    return {
      stays: true,
      heightAt: (width) => {
        const key = Math.round(width * 100);
        let h = heights.get(key);
        if (h === undefined) {
          const need = shortListNeed(rest, width, ctx);
          h = need ? need.height + state.pendingSpacing : 0;
          heights.set(key, h);
        }
        return h;
      },
    };
  };
  /** A `shortListSplit` warning for each short list whose items the pass
   *  set in more than one column: all of them under `'warn'`, under
   *  `'avoid'` the ones no column could hold whole. */
  const shortListWarnings = (): ContentWarning[] => {
    if (shortListRule === 'allow') return [];
    // Where each list item of the running text landed (a box's children
    // carry `containerId`).
    const placed = new Map<number, { pageIndex: number; columns: Set<string> }>();
    for (const page of doc.pages) {
      for (const c of page.columns) {
        for (const b of c.blocks) {
          if (b.type !== 'listItem' || b.containerId !== undefined || b.contentIndex === undefined) continue;
          const at = placed.get(b.contentIndex) ?? { pageIndex: page.index, columns: new Set<string>() };
          at.columns.add(`${page.index}:${c.index}`);
          placed.set(b.contentIndex, at);
        }
      }
    }
    const out: ContentWarning[] = [];
    for (let idx = 0; idx < contentBlocks.length; idx++) {
      const list = placed.has(idx) ? shortListFrom(idx) : undefined;
      if (!list) continue;
      const columns = new Set<string>();
      for (const item of list.items) for (const key of placed.get(item)?.columns ?? []) columns.add(key);
      if (columns.size < 2) continue;
      const first = contentBlocks[list.items[0]!]!;
      const last = contentBlocks[list.items[list.items.length - 1]!]!;
      out.push({
        kind: 'shortListSplit',
        items: list.items.length,
        sourceStart: first.sourceStart + bodyOffset,
        sourceEnd: last.sourceEnd + bodyOffset,
        pageIndex: placed.get(idx)!.pageIndex,
      });
    }
    return out;
  };
  return {
    firstListItemStarts, shortListRule, shortListFrom, shortListNeed, citedFootTake, shortListBoxAt,
    shortListWarnings
  };
}
