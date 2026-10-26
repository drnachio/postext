// Nested boxes and :::columns groups inside a box: stacking a group, its
// galley, balanced cuts and distributing it over the columns.
// Part of layoutCallout (layoutCallout.ts), split out of it in #1276.
import type { ContentBlock } from '../../../parse/index.js';
import { type VDTBlock, createBoundingBox, type VDTDesignBlock } from '../../../vdt.js';
import type { CalloutUnit, OpenNestedCallout, ColumnsSpec, CalloutLayoutInput, CalloutGroupLayout } from './inputs.js';
import { pickCalloutStyle } from './plan.js';
import { layoutCallout } from './layoutCallout.js';
import { offsetCalloutToAbsolute, offsetBlock } from './geometry.js';
import { resetLinePositions } from '../../blocks/placement.js';
import type { GroupPos, CalloutLineWidth } from '../../columns/cutTypes.js';
import { isMarkerBlock } from '../../blocks/buildHelpers.js';
import { type GalleyItem, galleyBreaks, fillGalley, minFillHeight } from '../../columns/columnsGroup.js';
import type { ResolvedCalloutStyleConfig } from '../../../types/boxes/callouts.js';
import type { BlockMeasureContext } from '../../blocks/measureContentBlock.js';
import type { Dimension } from '../../../types.js';
import type { Stack, GroupItem, ColumnCut } from './layoutCalloutTypes.js';

/** What createChildGroups takes from the pass. */
export interface ChildGroupsDeps {
  input: CalloutLayoutInput;
  style: ResolvedCalloutStyleConfig;
  childStartIdx: number;
  ctx: BlockMeasureContext;
  containerId: number;
  children: readonly ContentBlock[];
  em: number;
  px: (d: Dimension) => number;
  innerX: number;
  innerWidth: number;
  childBlocks: VDTBlock[];
  units: CalloutUnit[];
  groupLayouts: CalloutGroupLayout[];
  groupRules: VDTDesignBlock[];
  nestPath: readonly number[] | undefined;
  addSpace: (raw: ContentBlock, st: Stack) => void;
  childWidthAt: (boxWidth: number, width: number) => number;
  isStripChild: (raw: ContentBlock) => boolean;
  placeChild: (raw: ContentBlock, k: number, width: number, x: number, st: Stack, into: VDTBlock[], unitsInto: CalloutUnit[], lineCut?: { from: number; to?: number; widths?: readonly CalloutLineWidth[]; }) => VDTBlock | undefined;
  containerMargin: (raw: ContentBlock, k: number, st: Stack) => void;
}

export function createChildGroups(deps: ChildGroupsDeps) {
  const {
    input, style, childStartIdx, ctx, containerId, children, em, px, innerX, innerWidth, childBlocks,
    units, groupLayouts, groupRules, nestPath, addSpace, childWidthAt, isStripChild, placeChild,
    containerMargin
  } = deps;
  /** Lay out the nested box whose fence opens with `open` (content index
   *  `openIdx`) over `children[k0 … k1 - 1]` — `k1` is its closing marker's
   *  position, or `children.length` when the range ends inside it — at
   *  `width` from `x`, appending its frame and blocks to `into` (one unit)
   *  and advancing the stack. `reopened` marks a box the fragment opens
   *  inside: a continuation of it, holding the line cut `lineFrom` and the
   *  boxes `openRest` it opens inside in turn. Returns the blocks, frame
   *  first, or `undefined` when no style applies (then the caller flattens). */
  const placeNested = (
    open: ContentBlock,
    openIdx: number,
    k0: number,
    k1: number,
    width: number,
    x: number,
    st: Stack,
    into: VDTBlock[],
    unitsInto: CalloutUnit[],
    reopened?: { openRest: readonly OpenNestedCallout[] },
  ): VDTBlock[] | undefined => {
    const nestedStyle = pickCalloutStyle(input.resolved.calloutStyles, open.containerAttrs?.type);
    if (!nestedStyle || open.containerId === undefined) return undefined;
    const closed = k1 < children.length;
    const nested = layoutCallout({
      style: nestedStyle,
      attrs: open.containerAttrs ?? {},
      ...(open.direction ? { direction: open.direction } : {}),
      children: children.slice(k0, k1),
      childStartIdx: childStartIdx + k0,
      width,
      ctx,
      resolved: input.resolved,
      containerId,
      frameId: input.nextChildId(),
      nextChildId: input.nextChildId,
      ...(input.paragraphContainers ? { paragraphContainers: input.paragraphContainers } : {}),
      ...(input.bodyOffset !== undefined ? { bodyOffset: input.bodyOffset } : {}),
      continuation: !!reopened,
      // Cut before its closing marker, the nested box goes on in the next
      // fragment too.
      ...(!closed ? { continues: true } : {}),
      ...(reopened && input.lineFrom !== undefined ? { lineFrom: input.lineFrom } : {}),
      // The nested box is `input.width - width` narrower at every width.
      ...(reopened && input.lineWidths
        ? { lineWidths: input.lineWidths.map((h) => ({ fromLine: h.fromLine, width: childWidthAt(h.width, width) })) }
        : {}),
      ...(!closed && input.lineTo !== undefined ? { lineTo: input.lineTo } : {}),
      ...(reopened && reopened.openRest.length > 0 ? { openNested: reopened.openRest } : {}),
      mirrored: input.mirrored,
      nestPath: [...(nestPath ?? []), open.containerId],
      ...(input.headingDesign ? { headingDesign: input.headingDesign } : {}),
      ...(input.boxDesign ? { boxDesign: input.boxDesign } : {}),
      ...(input.measureMemo ? { measureMemo: input.measureMemo } : {}),
    });
    // Spacing above: as a paragraph's (margin collapsing, none at the top
    // of the box beyond the title gap).
    const spacing = st.first ? st.prevMarginBottom : Math.max(st.prevMarginBottom, nested.marginTopPx);
    st.cursorY += spacing;
    const { frame } = nested;
    frame.contentIndex = openIdx;
    // The box always flows inside its parent.
    if (frame.callout) { frame.callout.span = 'column'; frame.callout.placement = 'here'; }
    const bodyOff = input.bodyOffset ?? ctx.bodyOffset;
    const firstRaw = reopened ? children[k0] : open;
    const lastRaw = closed ? children[k1] : children[k1 - 1];
    if (firstRaw) frame.sourceStart = firstRaw.sourceStart + bodyOff;
    if (lastRaw) frame.sourceEnd = lastRaw.sourceEnd + bodyOff;
    offsetCalloutToAbsolute(nested, x, st.cursorY);
    const blocks = [frame, ...nested.children];
    into.push(...blocks);
    unitsInto.push({
      kind: 'box',
      box: { result: nested, style: nestedStyle, startIdx: openIdx, ...(closed ? { endIdx: childStartIdx + k1 } : {}) },
    });
    st.cursorY += nested.totalHeight;
    st.prevMarginBottom = nested.marginBottomPx;
    st.pull = false;
    st.prevWasListItem = false;
    st.first = false;
    return blocks;
  };
  /** Position of the marker closing the nested fence `id` opened before
   *  position `from`, or `children.length` when the range ends inside it. */
  const closeOf = (id: number | undefined, from: number): number => {
    let e = from;
    while (e < children.length && !(children[e]!.type === 'containerEnd' && children[e]!.containerId === id)) e++;
    return e;
  };

  /** The tail of a text block cut at line `l`: a block of its own with the
   *  lines from `l` on (no bullet — the head keeps it), at y = 0. */
  const tailOf = (blk: VDTBlock, l: number): VDTBlock => {
    const lh = blk.lines[0]?.bbox.height ?? 0;
    const tail: VDTBlock = { ...blk, id: input.nextChildId(), lines: resetLinePositions(blk.lines.slice(l), lh) };
    delete tail.bulletText; delete tail.bulletFontString; delete tail.bulletColor; delete tail.bulletBox;
    delete tail.bulletOffsetX; delete tail.bulletY; delete tail.bulletBaselineY;
    delete tail.separatorText; delete tail.separatorFontString; delete tail.separatorColor; delete tail.separatorX;
    delete tail.prefixText; delete tail.prefixX; delete tail.bulletDirection;
    tail.bbox = createBoundingBox(blk.bbox.x, 0, blk.bbox.width, tail.lines.length * lh);
    tail.sourceStart = tail.lines[0]?.sourceStart ?? blk.sourceStart;
    return tail;
  };
  /** Lay children `kFrom … kTo - 1` of a group out in one galley at the
   *  sub-column `width` (a nested box is one item: never cut, moved
   *  whole). `open` / `close`: the position a fragment opens / ends at,
   *  inside a paragraph when its `line` is past 0 (#634). */
  const stackGroup = (kFrom: number, kTo: number, kEnd: number, width: number, open?: GroupPos, close?: GroupPos): GroupItem[] & { end?: number } => {
    const gst: Stack = { cursorY: 0, prevMarginBottom: 0, pull: false, prevWasListItem: false, first: true, keepLeadingSpace: false };
    const stack: GroupItem[] = [];
    for (let k = kFrom; k < kTo; k++) {
      const raw = children[k]!;
      const into: VDTBlock[] = [];
      const unitsInto: CalloutUnit[] = [];
      if (raw.type === 'containerStart' && raw.containerName === 'callout') {
        const e = closeOf(raw.containerId, k + 1);
        if (placeNested(raw, childStartIdx + k, k + 1, Math.min(e, kEnd), width, innerX, gst, into, unitsInto)) {
          stack.push({ blocks: into, unit: unitsInto[0]!, k, lineBase: 0 });
          k = e;
          continue;
        }
      }
      addSpace(raw, gst);
      containerMargin(raw, k, gst);
      if ((raw.type === 'directive' && !isStripChild(raw)) || isMarkerBlock(raw)) continue;
      const from = open && open.child === k && open.line > 0 ? open.line : 0;
      const to = close && close.child === k && close.line > 0 ? close.line : undefined;
      const lineCut = from > 0 || to !== undefined
        ? { from, ...(to !== undefined ? { to } : {}), ...(from > 0 && open?.widths ? { widths: open.widths } : {}) }
        : undefined;
      if (placeChild(raw, k, width, innerX, gst, into, unitsInto, lineCut)) stack.push({ blocks: into, unit: unitsInto[0]!, k, lineBase: from });
    }
    // Where the stack ends, a `:::space` after its last item included.
    return Object.assign(stack, { end: gst.cursorY });
  };
  /** The galley of stacked items, for the split code (see `columnsGroup.ts`).
   *  A heading is never cut, and under `headings.keepWithNext` no cut
   *  follows it: it goes to the next column with what it heads (#1019). */
  const galleyOf = (stack: readonly GroupItem[]): GalleyItem[] => stack.map((it) => {
    const blk = it.blocks[0]!;
    const heading = it.unit.kind === 'block' && blk.type === 'heading';
    const cuttable = it.unit.kind === 'block' && !heading && blk.type !== 'resource' && blk.type !== 'mathDisplay' && blk.type !== 'score' && blk.lines.length > 1 && !blk.mathRender;
    return {
      child: it.k,
      lineBase: it.lineBase,
      y: blk.bbox.y,
      height: blk.bbox.height,
      ...(cuttable ? { lineBottoms: blk.lines.map((l) => l.bbox.y + l.bbox.height - blk.bbox.y) } : {}),
      ...(heading && input.resolved.headings.keepWithNext ? { keepWithNext: true } : {}),
    };
  });
  /** Balanced cuts (#934): the cuts at which the galley fills `cols`
   *  columns with the tallest as short as it can be, as a group that goes
   *  on is cut (`minFillHeight`). A cut inside a paragraph leaves at least
   *  the body's widow lines at the foot of a column and its orphan lines
   *  at the head of the next (`bodyText.avoidWidows` / `widowMinLines`,
   *  `avoidOrphans` / `orphanMinLines`), and the space before an item
   *  vanishes at a column's head, so a paragraph boundary beats a line
   *  cut that leaves a lone line. */
  const balancedCuts = (stack: readonly GroupItem[], cols: number): ColumnCut[] => {
    if (stack.length === 0) return [];
    const body = input.resolved.bodyText;
    const galley = galleyOf(stack);
    const breaks = galleyBreaks(
      galley,
      body.avoidWidows ? Math.max(1, body.widowMinLines) : 1,
      body.avoidOrphans ? Math.max(1, body.orphanMinLines) : 1,
    );
    const fill = fillGalley(galley, breaks, cols, minFillHeight(galley, breaks, cols));
    return fill.cuts.map((j) => ({ y: breaks[j]!.startY, block: breaks[j]!.item, line: breaks[j]!.line }));
  };
  /** The stack indices `breaks` starts columns at (`breaks="3"`: the third
   *  child opens the second column), at most `cols - 1` of them, rising. */
  const breakStarts = (stack: readonly GroupItem[], cols: number, breaks: readonly number[]): number[] => {
    const out: number[] = [];
    let prevY = 0;
    for (const b of breaks.slice(0, cols - 1)) {
      const i = b - 1;
      if (i <= 0 || i >= stack.length) continue;
      const y = stack[i]!.blocks[0]!.bbox.y;
      if (y <= prevY + 0.01) continue;
      out.push(i);
      prevY = y;
    }
    return out;
  };
  /** Set a stack in columns at its cuts, the first at `groupTop`; a cut
   *  inside a text block leaves its head behind and opens the next column
   *  with the tail (a block of its own, bullet-less). Returns the height
   *  the columns take. */
  const distributeGroup = (stack: GroupItem[], cuts: readonly ColumnCut[], colW: number, gap: number, groupTop: number): number => {
    const columns: { blocks: VDTBlock[]; unit: CalloutUnit }[][] = [[]];
    const columnStarts: number[] = [stack[0]?.blocks[0]?.bbox.y ?? 0];
    let cutIdx = 0;
    for (let i = 0; i < stack.length; i++) {
      let item: { blocks: VDTBlock[]; unit: CalloutUnit } = stack[i]!;
      while (cutIdx < cuts.length && cuts[cutIdx]!.block === i && cuts[cutIdx]!.line === 0) {
        columns.push([]); columnStarts.push(cuts[cutIdx]!.y); cutIdx++;
      }
      let consumed = 0;
      while (cutIdx < cuts.length && cuts[cutIdx]!.block === i && cuts[cutIdx]!.line > 0) {
        const blk = item.blocks[0]!;
        const cut = cuts[cutIdx]!;
        const l = cut.line - consumed;
        cutIdx++;
        if (l <= 0 || l >= blk.lines.length) continue;
        const lh = blk.lines[0]?.bbox.height ?? 0;
        const tail = tailOf(blk, l);
        blk.lines = blk.lines.slice(0, l);
        blk.bbox = createBoundingBox(blk.bbox.x, blk.bbox.y, blk.bbox.width, l * lh);
        columns[columns.length - 1]!.push(item);
        offsetBlock(tail, 0, cut.y);
        columns.push([]); columnStarts.push(cut.y);
        consumed += l;
        item = { blocks: [tail], unit: { kind: 'block', block: tail } };
      }
      columns[columns.length - 1]!.push(item);
    }
    let groupHeight = 0;
    columns.forEach((items, c) => {
      const shiftX = c * (colW + gap);
      const shiftY = groupTop - (columnStarts[c] ?? 0);
      for (const item of items) {
        for (const blk of item.blocks) {
          offsetBlock(blk, shiftX, shiftY);
          childBlocks.push(blk);
          groupHeight = Math.max(groupHeight, blk.bbox.y + blk.bbox.height - groupTop);
        }
        units.push(item.unit);
      }
    });
    return groupHeight;
  };

  /** A `:::columns{count=N}` group: children `k0 … k1 - 1` in N columns
   *  (`spec`). Set whole, its stack is cut where the columns balance best,
   *  or at its `breaks`. A fragment that opens or ends inside it (#634,
   *  `cut`) sets the part of the galley between its positions: a
   *  `'snake'` group that goes on fills its columns as level as the cuts
   *  allow, the closing part balances as a whole group does; a
   *  `'parallel'` group sets each stream from its own position in its own
   *  column, top-aligned. The galley this layout starts with is recorded
   *  in `groupLayouts` for the split code. */
  const placeColumnsGroup = (k0: number, k1: number, spec: ColumnsSpec, st: Stack, cut: { from?: readonly GroupPos[]; to?: readonly GroupPos[] } = {}): void => {
    const cols = Math.max(1, Math.min(6, spec.count));
    const gap = spec.gapPx;
    const colW = Math.max(1, (innerWidth - gap * (cols - 1)) / cols);
    // Spacing above the group: as a block with no margin of its own, or
    // with the one its fence asks for (`marginTop`, #714: merged with the
    // space pending, none when the group opens the box; a part of a group
    // that goes on from an earlier fragment takes none).
    const ownTop = cut.from || st.first ? 0 : spec.marginTopPx ?? 0;
    const groupTop = st.cursorY + Math.max(st.prevMarginBottom, ownTop);
    const childMin = Math.min(Math.max(1, style.splitMinLines), input.resolved.layout.boxChildSplitMinLines);
    const parallel = spec.flow === 'parallel' && (spec.breaks?.length ?? 0) > 0;
    let groupHeight = 0;
    let streams: GalleyItem[][] = [];
    /** Where each stream ends: the next one's first child, the last at the
     *  closing marker. */
    let ends: number[] = [k1];
    if (!cut.from && !cut.to) {
      // The whole group (as before #634).
      const stack = stackGroup(k0, k1, k1, colW);
      if (stack.length === 0) return;
      const starts = spec.breaks && spec.breaks.length > 0 ? breakStarts(stack, cols, spec.breaks) : undefined;
      const galley = galleyOf(stack);
      if (parallel && starts) {
        const bounds = [0, ...starts, stack.length];
        ends = [...starts.map((i) => stack[i]!.k), k1];
        streams = bounds.slice(0, -1).map((b, s) => {
          const part = galley.slice(b, bounds[s + 1]);
          const y0 = part[0]?.y ?? 0;
          return part.map((g) => ({ ...g, y: g.y - y0 }));
        });
      } else {
        streams = [galley];
      }
      const cuts = starts
        ? starts.map((i) => ({ y: stack[i]!.blocks[0]!.bbox.y, block: i, line: 0 }))
        : balancedCuts(stack, cols);
      groupHeight = distributeGroup(stack, cuts, colW, gap, groupTop);
    } else if (!parallel) {
      // A snake group cut across fragments: the part of its galley between
      // the fragment's positions.
      const a = cut.from?.[0];
      const b = cut.to?.[0];
      const kTo = b ? Math.min(k1, b.line > 0 ? b.child + 1 : b.child) : k1;
      const stack = stackGroup(a ? Math.max(k0, a.child) : k0, kTo, k1, colW, a, b);
      if (stack.length === 0) return;
      const galley = galleyOf(stack);
      streams = [galley];
      let cuts: ColumnCut[];
      if (b) {
        const breaks = galleyBreaks(galley, childMin);
        const fill = fillGalley(galley, breaks, cols, minFillHeight(galley, breaks, cols));
        cuts = fill.cuts.map((j) => ({ y: breaks[j]!.startY, block: breaks[j]!.item, line: breaks[j]!.line }));
      } else {
        cuts = balancedCuts(stack, cols);
      }
      groupHeight = distributeGroup(stack, cuts, colW, gap, groupTop);
    } else {
      // A parallel group cut across fragments: its streams are the runs
      // its breaks start in the whole group; each goes on from its own
      // position, in its own column.
      const whole = stackGroup(k0, k1, k1, colW);
      if (whole.length === 0) return;
      const starts = [0, ...breakStarts(whole, cols, spec.breaks!)];
      const startChild = starts.map((i) => whole[i]!.k);
      ends = [...startChild.slice(1), k1];
      startChild.forEach((sk, s) => {
        const ek = startChild[s + 1] ?? k1;
        const a = cut.from?.[s];
        const b = cut.to?.[s];
        const kFrom = Math.max(sk, a?.child ?? sk);
        const kTo = Math.min(ek, b ? (b.line > 0 ? b.child + 1 : b.child) : ek);
        const stack = kFrom < kTo ? stackGroup(kFrom, kTo, k1, colW, a, b) : [];
        streams.push(galleyOf(stack));
        if (stack.length === 0) return;
        const y0 = stack[0]!.blocks[0]!.bbox.y;
        for (const item of stack) {
          for (const blk of item.blocks) {
            offsetBlock(blk, s * (colW + gap), groupTop - y0);
            childBlocks.push(blk);
            groupHeight = Math.max(groupHeight, blk.bbox.y + blk.bbox.height - groupTop);
          }
          units.push(item.unit);
        }
      });
    }
    groupLayouts.push({
      open: k0 - 1,
      close: k1,
      flow: parallel ? 'parallel' : 'snake',
      columns: cols,
      columnWidth: colW,
      top: groupTop,
      streams,
      ends,
      contentIndex: childStartIdx + k0 - 1,
      ...(colW < 6 * em ? { narrow: true as const } : {}),
    });
    // A rule down each gutter (`rule`), the page's column rule.
    if (spec.rule && cols > 1 && groupHeight > 0) {
      const ruleSpec = input.resolved.layout.columnRule;
      const w = Math.max(0.25, px(ruleSpec.lineWidth));
      for (let c = 1; c < cols; c++) {
        const x = innerX + c * (colW + gap) - gap / 2;
        groupRules.push({
          kind: 'rule',
          bbox: createBoundingBox(x - w / 2, groupTop, w, groupHeight),
          color: ruleSpec.color.hex,
          thicknessPx: w,
          direction: 'vertical',
        });
      }
    }
    st.cursorY = groupTop + groupHeight;
    // The fence's `marginBottom` is the space pending after the group
    // (#714): it merges with the next block's own and is dropped at the
    // box's foot, like any last child's. A part that goes on leaves none.
    st.prevMarginBottom = cut.to ? 0 : spec.marginBottomPx ?? 0;
    st.pull = false;
    st.prevWasListItem = false;
    st.first = false;
  };
  return {
    placeNested, closeOf, placeColumnsGroup
  };
}
