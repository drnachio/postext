/**
 * The box typesetter (#855): lay a run of content blocks out as a box of a
 * callout style at a width, and cut it at a height, resumably.
 *
 * Factored out of `placeDocumentPass` (`build.ts`) with an explicit pass
 * context so callouts and the frames of composed pages (DESIGN §5.1) share
 * it: a callout's fragments (`keepTogether: false`) and a frame's content
 * cut at the frame's foot are the same operation. Nothing here reads the
 * page or the cursor; the pass context hands in what the layout needs.
 */
import type { ContentBlock } from '../../parse/index.js';
import type { ResolvedCalloutStyleConfig } from '../../types.js';
import type { ResolvedConfig, VDTBlock } from '../../vdt.js';
import type { BlockMeasureContext } from '../blocks/measureContentBlock.js';
import type { ParagraphContainerPlan } from './paragraphContainers.js';
import type { MeasureMemo } from '../composedPages/measureMemo.js';
import { layoutKey, memoLayout, type LayoutMemo } from '../composedPages/layoutMemo.js';
import { isMarkerBlock } from '../blocks/buildHelpers.js';
import {
  isDesignedBoxHeading,
  layoutCallout,
  boxTextOf,
  type BoxDesign,
  type BoxHeadingDesign,
  type CalloutLayoutInput,
  type CalloutLayoutResult,
  type CalloutLineWidth,
  type CalloutUnit,
  type GroupPos,
  type PlannedCallout,
} from './calloutLayout.js';
import { fillGalley, galleyBreaks } from '../columns/columnsGroup.js';
import type { CalloutCut } from '../columns/cutTypes.js';
export type { CalloutCut } from '../columns/cutTypes.js';

/** What a frame of a composed page (#855) adds to a box's layout: its exact
 *  height, where content shorter than it sits, the rectangles its text
 *  runs round, and the scale of its pictures (#858). Absent for callouts. */
export type FrameBoxOptions = Pick<CalloutLayoutInput, 'boxHeight' | 'verticalAlign' | 'exclusions' | 'pictureScale' | 'continuedMark' | 'uprightMaxLength'>;

/** What the box typesetter reads of a layout pass. */
export interface FrameLayoutPass {
  /** The pass's content blocks (after every block transform). */
  readonly contentBlocks: readonly ContentBlock[];
  /** The pass's configuration (`layout.flowColumns`,
   *  `layout.boxChildSplitMinLines`). */
  readonly resolved: ResolvedConfig;
  /** The configuration boxes are laid out with: `resolved` plus the
   *  synthetic box styles of the pass. */
  readonly calloutResolved: ResolvedConfig;
  readonly paragraphContainers: ParagraphContainerPlan;
  /** The measure context the children of the box that opens at `startIdx`
   *  are set with (a main-flow group's box sets its blocks as the text
   *  around it is set). */
  measureCtxFor(startIdx: number, style: ResolvedCalloutStyleConfig): BlockMeasureContext;
  /** Lays out a comic strip among a box's children (see
   *  `CalloutLayoutInput.stripBlock`). */
  stripBlock(raw: ContentBlock, idx: number, width: number): VDTBlock | undefined;
  /** The height of an empty, full-height column of the current page (see
   *  {@link tallerThanColumn}). */
  columnHeight(): number;
  /** The room a heading's own design takes in a box (#906; see
   *  `CalloutLayoutInput.headingDesign`). */
  headingDesign?: BoxHeadingDesign;
  /** A box style's design (#1014; see `CalloutLayoutInput.boxDesign`). */
  boxDesign?: BoxDesign;
  /** The measurements of one layout of a composed page (#953), dropped
   *  with it. */
  measureMemo?: MeasureMemo;
  /** The whole layouts of one layout of a composed page (#972), dropped
   *  with it. */
  layoutMemo?: LayoutMemo;
}

/** The widths a child's lines are counted at in a fragment `width` wide
 *  that opens `from` (see `CalloutCut.widths`). */
export const cutWidths = (from: CalloutCut, width: number): readonly CalloutLineWidth[] => {
  const before = from.line > 0 ? from.widths : undefined;
  if (!before || before.length === 0) return [{ fromLine: 0, width }];
  const last = before[before.length - 1]!;
  return Math.abs(last.width - width) <= 0.5 ? before : [...before, { fromLine: from.line, width }];
};
export const CUT_START: CalloutCut = { child: 0, line: 0 };

export interface CalloutLayouter {
  /** Content blocks between the fence markers. */
  children: readonly ContentBlock[];
  /** Content index of `children[0]`. */
  childBase: number;
  /** Positions in `children` of the blocks the box lays out (marker
   *  blocks of nested containers and directives are skipped). */
  realAt: readonly number[];
  /** The cut past the last child (the end of the box). */
  end: CalloutCut;
  /** `:::columns` groups among the children ([start, end] marker
   *  positions): only the cuts the group itself offers fall inside one
   *  (#634), and none inside a group of a nested box. */
  groups: readonly [number, number][];
  /** Lay out the children from cut `from` to cut `to` at `width` as one
   *  box — a `continuation` (every fragment after the head) without
   *  title / icon. A cut inside a child keeps only the lines on its side. */
  layoutRange: (from: CalloutCut, to: CalloutCut, width: number, frameId: string, continuation: boolean, mirrored?: boolean, frame?: FrameBoxOptions) => CalloutLayoutResult;
  /** `layoutRange` for a caller that only reads the result (the split
   *  probes): with a layout memo (#972) the stored layout itself, never to
   *  be moved or changed. */
  peekRange: (from: CalloutCut, to: CalloutCut, width: number, frameId: string, continuation: boolean, mirrored?: boolean, frame?: FrameBoxOptions) => CalloutLayoutResult;
}

export const makeCalloutLayouter = (
  pass: FrameLayoutPass,
  startIdx: number,
  plan: PlannedCallout,
  style: ResolvedCalloutStyleConfig,
): CalloutLayouter => {
  const contentBlocks = pass.contentBlocks;
  const inside = contentBlocks.slice(startIdx + 1, plan.endIdx);
  // A box whose design sets its content (#1014) has nothing to lay out or
  // cut: its design prints the content, read whole here.
  const setsContent = !!pass.boxDesign && !!style.design?.enabled && style.design.setsContent
    && style.design.slot.elements.length > 0;
  const children = setsContent ? [] : inside;
  const boxText = boxTextOf(inside);
  const realAt: number[] = [];
  children.forEach((c, k) => {
    if ((c.type !== 'directive' || (c.directiveName === 'strip' && c.comic)) && !isMarkerBlock(c)) realAt.push(k);
  });
  // `:::columns` groups among the children, as [start marker, end marker]
  // positions: a split never cuts inside one.
  const groups: [number, number][] = [];
  children.forEach((c, k) => {
    if (c.type === 'containerStart' && c.containerName === 'columns') {
      let e = k + 1;
      while (e < children.length && !(children[e]!.type === 'containerEnd' && children[e]!.containerName === 'columns' && children[e]!.containerId === c.containerId)) e++;
      groups.push([k, e]);
    }
  });
  const layoutRangeOf = (from: CalloutCut, to: CalloutCut, width: number, frameId: string, continuation: boolean, mirrored = false, frame?: FrameBoxOptions) => {
    let n = 0;
    // A fragment that opens inside a `:::columns` group starts at its
    // opening marker and one that ends inside it at its closing marker:
    // the group sets the part between the cut's positions (#634).
    const fromChild = from.group ? from.group.open : from.child;
    const closeOfGroup = (open: number): number => groups.find(([gs]) => gs === open)?.[1] ?? children.length - 1;
    // A cut inside child `to.child` includes that child (its first
    // `to.line` lines); a cut at a child's head excludes it.
    const toChild = to.group ? closeOfGroup(to.group.open) + 1 : to.line > 0 ? to.child + 1 : to.child;
    const inSlice = (pos: readonly GroupPos[]): GroupPos[] => pos.map((p) => ({ ...p, child: p.child - fromChild }));
    // Nested boxes still open at `from` (their closing markers leading
    // the range close them): the fragment opens inside them.
    const open: { idx: number; block: ContentBlock }[] = [];
    for (let k = 0; k < fromChild; k++) {
      const c = children[k]!;
      if (c.containerName !== 'callout') continue;
      if (c.type === 'containerStart') open.push({ idx: startIdx + 1 + k, block: c });
      else if (c.type === 'containerEnd') open.pop();
    }
    for (let k = fromChild; k < children.length && open.length > 0; k++) {
      const c = children[k]!;
      if (c.type !== 'containerEnd' || c.containerId !== open[open.length - 1]!.block.containerId) break;
      open.pop();
    }
    return layoutCallout({
      style,
      attrs: plan.attrs,
      ...(contentBlocks[startIdx]?.direction ? { direction: contentBlocks[startIdx]!.direction } : {}),
      continuation,
      // Any range short of the box's end is a fragment that goes on.
      ...(to.child < children.length || to.line > 0 || to.group ? { continues: true } : {}),
      children: children.slice(fromChild, toChild),
      childStartIdx: startIdx + 1 + fromChild,
      width,
      // A main-flow group's box sets its blocks as the text around it is
      // set: a styled section's or a part's body (#634).
      ctx: pass.measureCtxFor(startIdx, style),
      resolved: pass.calloutResolved,
      containerId: plan.containerId,
      frameId,
      nextChildId: () => `${frameId}-c${n++}`,
      paragraphContainers: pass.paragraphContainers,
      ...(from.line > 0 && !from.group ? { lineFrom: from.line } : {}),
      ...(from.line > 0 && !from.group && from.widths ? { lineWidths: from.widths } : {}),
      ...(to.line > 0 && !to.group ? { lineTo: to.line } : {}),
      ...(from.group ? { groupFrom: inSlice(from.group.pos) } : {}),
      ...(to.group ? { groupTo: inSlice(to.group.pos) } : {}),
      ...(open.length > 0 ? { openNested: open } : {}),
      mirrored,
      stripBlock: pass.stripBlock,
      ...(pass.headingDesign ? { headingDesign: pass.headingDesign } : {}),
      ...(pass.boxDesign ? { boxDesign: pass.boxDesign, boxText } : {}),
      ...(pass.measureMemo ? { measureMemo: pass.measureMemo } : {}),
      ...frame,
    });
  };
  const through = (shared: boolean): CalloutLayouter['layoutRange'] => (from, to, width, frameId, continuation, mirrored = false, frame) => {
    const memo = pass.layoutMemo;
    if (!memo) return layoutRangeOf(from, to, width, frameId, continuation, mirrored, frame);
    const ctx = pass.measureCtxFor(startIdx, style);
    const key = layoutKey(memo, pass, ctx, startIdx, plan.endIdx, style, from, to, width, frameId, continuation, mirrored, frame);
    return memoLayout(memo, key, ctx, shared, () => layoutRangeOf(from, to, width, frameId, continuation, mirrored, frame));
  };
  return { children, childBase: startIdx + 1, realAt, end: { child: children.length, line: 0 }, layoutRange: through(false), peekRange: through(true), groups };
};

/** The cut a page break between the parts of a contents puts in a box
 *  (`toc.parts.breakBefore`, #996): the head of the first part row after
 *  `from` that opens a page of its own, when something stands before it in
 *  the fragment. A box ignores the `:::pagebreak` rows; the rows carry the
 *  break (`TocBlockInfo.breakBefore`). Undefined when there is none. */
export const partBreakCut = (pass: FrameLayoutPass, L: CalloutLayouter, from: CalloutCut): CalloutCut | undefined => {
  let real = false;
  for (let k = from.child; k < L.children.length; k++) {
    const toc = pass.contentBlocks[L.childBase + k]?.toc;
    if (real && k > from.child && toc?.kind === 'part' && toc.breakBefore && toc.group?.role !== 'continuation') return { child: k, line: 0 };
    if (L.realAt.includes(k) && !(toc?.group?.role === 'continuation' && k !== from.child)) real = true;
  }
  return undefined;
};

/** What a cut of a composed page's frame keeps together besides
 *  `splitMinLines` (#913), as the running text does: a heading with what
 *  follows it, and the items of a list, at least `listOrphans` before the
 *  cut and `listWidows` after it (a short list under `shortListSplit:
 *  'avoid'` none: it moves whole). A list that cannot be cut so is cut
 *  before it, or inside one of its items. */
export interface FrameCutRules {
  keepHeadings: boolean;
  listOrphans: number;
  listWidows: number;
  /** Lists of at most this many items are never cut between items. */
  wholeListMaxItems: number;
}

/** The cut rules of a frame under `resolved` (#913). */
export const frameCutRules = (resolved: ResolvedConfig): FrameCutRules => ({
  keepHeadings: resolved.headings.keepWithNext,
  listOrphans: resolved.bodyText.avoidOrphansInLists ? 2 : 1,
  listWidows: resolved.bodyText.avoidWidowsInLists ? 2 : 1,
  wholeListMaxItems: resolved.bodyText.shortListSplit === 'avoid' ? resolved.bodyText.shortListMaxItems : 0,
});

export interface CalloutFragment {
  /** The cut the rest of the box starts at. */
  to: CalloutCut;
  result: CalloutLayoutResult;
}

/** The longest leading fragment of the box from cut `from` on whose box
 *  is at most `roomPx` tall. Cuts fall between children or between the
 *  lines of a text child. `splitMinLines` guards text: a cut between
 *  children leaves on each side at least that many text lines or at least
 *  one indivisible block (a figure, table, display formula or nested
 *  box); a cut inside a text child counts every line on its side, a block
 *  as one line, and leaves at least `layout.boxChildSplitMinLines` lines
 *  of that child on each side (two by default, `splitMinLines` when that
 *  is lower; EF-115). A nested box that may split
 *  itself (`keepTogether: false`, or taller than a full column) offers the cuts
 *  inside it too, by its own `splitMinLines` over its own children; the
 *  fragments on both sides redraw its frame. The full layout's geometry
 *  ranks the candidates (box bottom = content bottom at the cut + the
 *  tails of the boxes closed below it); the deepest candidate that fits
 *  is laid out for real and taken when it truly fits. `null` when none
 *  does. */
export const splitCalloutFragment = (
  pass: FrameLayoutPass,
  L: CalloutLayouter,
  from: CalloutCut,
  width: number,
  roomPx: number,
  frameId: string,
  continuation: boolean,
  minLines: number,
  mirrored = false,
  frame?: FrameBoxOptions,
  rules?: FrameCutRules,
  /** Cut where a part of a contents opens a page of its own, when that
   *  cut fits (#996). */
  partBreaks = false,
): CalloutFragment | null => {
  const full = L.peekRange(from, L.end, width, frameId, continuation, mirrored, frame);
  /** Figures, tables and display formulas: never cut, not text lines. */
  const indivisible = (c: VDTBlock): boolean => c.type === 'resource' || c.type === 'mathDisplay' || c.type === 'score';
  const unitBottom = (u: CalloutUnit): number => {
    const b = u.kind === 'block' ? u.block.bbox : u.box.result.frame.bbox;
    return b.y + b.height;
  };
  const unitTop = (u: CalloutUnit): number => (u.kind === 'block' ? u.block.bbox.y : u.box.result.frame.bbox.y);
  /** Room a box keeps under its last item (padding, border, icon growth). */
  const tailOf = (r: CalloutLayoutResult): number => {
    const last = r.units[r.units.length - 1];
    return last ? r.frame.bbox.y + r.totalHeight - unitBottom(last) : 0;
  };
  if (full.units.length === 0) return null;
  // A head that goes on also carries the style's continuation marker.
  const tail = tailOf(full) + full.continuesMarkerPx;
  /** Candidate cuts with the head's content bottom. A `soft` cut parts a
   *  wrapped code line from its continuation (#624): taken only when no
   *  other cut fits. A `capSplit` cut falls before a drop cap's sink line
   *  (#947): as in the flow, the paragraph moves on whole, and is cut
   *  there only when nothing else fits (a frame too short for those
   *  lines; `dropCapWarnings` reports it, reason `split`). */
  const candidates: { cut: CalloutCut; bottom: number; soft?: true; capSplit?: true; partBreak?: true }[] = [];
  /** Collect the cuts among `units` (one box's items; `below` = the tails
   *  of the nested boxes around them), each side of a cut holding enough
   *  by the box's `min` lines: a block counts as one line, a nested box
   *  as one indivisible block. */
  const collect = (units: readonly CalloutUnit[], minLines: number, below: number, top = false): void => {
    const min = Math.max(1, minLines);
    const lineCount = (u: CalloutUnit): number => (u.kind === 'block' ? Math.max(1, u.block.lines.length) : 1);
    const isBlock = (u: CalloutUnit): boolean => u.kind === 'box' || indivisible(u.block);
    const totalLines = units.reduce((n, u) => n + lineCount(u), 0);
    const totalBlocks = units.filter(isBlock).length;
    /** A side of a cut holds enough: `lines` (blocks included) of which
     *  `blocks` are indivisible. Between children, one block suffices or
     *  the text lines alone meet the minimum; inside a text child, the
     *  lines do. */
    const holds = (lines: number, blocks: number, betweenChildren: boolean): boolean =>
      betweenChildren ? blocks > 0 || lines - blocks >= min : lines >= min;
    const bothHold = (lines: number, blocks: number, betweenChildren: boolean): boolean =>
      holds(lines, blocks, betweenChildren) && holds(totalLines - lines, totalBlocks - blocks, betweenChildren);
    let linesBefore = 0;
    let blocksBefore = 0;
    /** For each unit that is a list item, its place in its run of items
     *  and the run's length (#913). */
    const isItem = (u: CalloutUnit | undefined): boolean => u?.kind === 'block' && u.block.type === 'listItem';
    const runAt: { at: number; of: number }[] = [];
    if (rules) {
      for (let i = 0; i < units.length; ) {
        if (!isItem(units[i])) { i++; continue; }
        let j = i;
        while (j < units.length && isItem(units[j])) j++;
        for (let k = i; k < j; k++) runAt[k] = { at: k - i, of: j - i };
        i = j;
      }
    }
    /** The rows of a block of the contents (`:::toc{keep}`, #850) among
     *  the units: for each, the block it belongs to, whether its head (or
     *  the repeat of it a fragment opens with) has gone by and how many
     *  entries since. A cut between its rows leaves its head with
     *  `minEntriesAfterHead` entries, and a block that a whole frame would
     *  hold is cut only when no other cut fits, as the running text moves
     *  it whole to the next column (#983). */
    const tocOf = (u: CalloutUnit | undefined) => (u?.kind === 'block' && u.block.contentIndex !== undefined ? pass.contentBlocks[u.block.contentIndex]?.toc : undefined);
    const tocCut: { group?: NonNullable<ReturnType<typeof tocOf>>['group']; headSeen: boolean; entries: number }[] = [];
    const tocSpan = new Map<number, { first: number; last: number }>();
    {
      let id: number | undefined;
      let headSeen = false;
      let entries = 0;
      units.forEach((u, i) => {
        const toc = tocOf(u);
        const group = toc?.group;
        if (!toc || !group) {
          id = undefined;
          headSeen = false;
          entries = 0;
          tocCut[i] = { headSeen: false, entries: 0 };
          return;
        }
        if (group.id !== id) {
          id = group.id;
          headSeen = false;
          entries = 0;
        }
        if (group.role === 'head' || group.role === 'continuation') {
          headSeen = true;
          entries = 0;
        } else if (headSeen && toc.kind === 'entry') entries++;
        tocCut[i] = { group, headSeen, entries };
        const span = tocSpan.get(group.id);
        if (span) span.last = i;
        else tocSpan.set(group.id, { first: i, last: i });
      });
    }
    /** The unit is a part row that opens a page of the contents (#996). */
    const opensPage = (u: CalloutUnit | undefined): boolean => {
      const toc = tocOf(u);
      return toc?.kind === 'part' && toc.breakBefore === true && toc.group?.role !== 'continuation';
    };
    /** The block of the contents a cut after unit `i` falls inside. */
    const tocInside = (i: number): { id: number; minEntries: number } | undefined => {
      const a = tocCut[i]?.group;
      const b = tocCut[i + 1]?.group;
      return a && b && a.id === b.id ? { id: a.id, minEntries: a.minEntries } : undefined;
    };
    /** A cut after unit `i` (between two children) the frame's rules
     *  allow: not after a heading, not leaving too few items of a list on
     *  either side. */
    const ruled = (i: number): boolean => {
      const inside = tocInside(i);
      if (inside && (!tocCut[i]!.headSeen || tocCut[i]!.entries < inside.minEntries)) return false;
      if (!rules) return true;
      const u = units[i]!;
      if (rules.keepHeadings && u.kind === 'block' && u.block.type === 'heading') return false;
      const run = runAt[i];
      if (run && isItem(units[i + 1])) {
        const before = run.at + 1;
        const after = run.of - before;
        if (run.of <= rules.wholeListMaxItems) return false;
        if (before < rules.listOrphans || after < rules.listWidows) return false;
      }
      return true;
    };
    units.forEach((u, i) => {
      let next: number | undefined;
      if (u.kind === 'block') {
        const c = u.block;
        const k = (c.contentIndex ?? L.childBase) - L.childBase;
        next = k + 1;
        // A heading drawn by its design (#906) is one piece: its lines are
        // not what the page shows.
        if (!indivisible(c) && c.lines.length > 1 && !isDesignedBoxHeading(c) && !c.tocEntry && !c.tocPart) {
          // The first laid-out child of a continuation opens after
          // `from.line` lines: cuts inside it are counted from the
          // child's own head. Each side of the box still counts all its
          // lines against `min`, and a cut inside a child leaves at least
          // `layout.boxChildSplitMinLines` lines of it on each side (2 by
          // default, so no lone line: EF-115), or `min` when that is
          // lower. The count is of this fragment's part of the child,
          // since a part left behind already passed the test.
          const childMin = Math.min(min, pass.resolved.layout.boxChildSplitMinLines);
          const lineBase = k === from.child ? from.line : 0;
          // The piece holds the paragraph's first line when it carries the
          // initial (#947).
          const sink = c.dropCap?.sink ?? 0;
          for (let l = childMin; l <= c.lines.length - childMin; l++) {
            const line = c.lines[l - 1]!;
            if (bothHold(linesBefore + l, blocksBefore, false)) {
              candidates.push({
                cut: { child: k, line: lineBase + l, widths: k === from.child ? cutWidths(from, width) : [{ fromLine: 0, width }] },
                bottom: line.bbox.y + line.bbox.height + below,
                ...(c.lines[l]?.codeLine?.continued ? { soft: true as const } : {}),
                ...(l < sink ? { capSplit: true as const } : {}),
              });
            }
          }
        }
      } else {
        const { box } = u;
        if (box.endIdx !== undefined) next = box.endIdx + 1 - L.childBase;
        if (!box.style.keepTogether || tallerThanColumn(pass, box.result)) {
          collect(box.result.units, box.style.splitMinLines, below + tailOf(box.result));
        }
      }
      linesBefore += lineCount(u);
      if (isBlock(u)) blocksBefore++;
      // A part that opens a page of its own is cut before whatever the
      // minimum of lines says: the break is the author's (#996).
      const breaks = partBreaks && top && i < units.length - 1 && opensPage(units[i + 1]);
      if (i < units.length - 1 && next !== undefined && (breaks || (bothHold(linesBefore, blocksBefore, true) && ruled(i)))) {
        const inside = tocInside(i);
        const span = inside ? tocSpan.get(inside.id) : undefined;
        const whole = span ? unitBottom(units[span.last]!) - unitTop(units[span.first]!) : Infinity;
        candidates.push({ cut: { child: next, line: 0 }, bottom: unitBottom(u) + below, ...(inside && whole <= roomPx ? { soft: true as const } : {}), ...(breaks ? { partBreak: true as const } : {}) });
      }
    });
  };
  collect(full.units, minLines, 0, true);
  // Inside a `:::columns` group of the box (#634): the cut the group
  // offers for the room, where each of its sub-columns (each stream, in
  // a parallel group) ends when the galley fills them in turn; at least
  // one stream goes on and one moves on. A group of a nested box is
  // never cut, nor any group under 1.24's rules (`layout.flowColumns`).
  if (pass.resolved.layout.flowColumns) {
    const base = from.group ? from.group.open : from.child;
    const childMin = Math.min(Math.max(1, minLines), pass.resolved.layout.boxChildSplitMinLines);
    for (const g of full.groups ?? []) {
      const h = roomPx - tail - g.top;
      if (h <= 0.5) continue;
      const reopened = from.group?.open === g.open + base ? from.group : undefined;
      const pos: GroupPos[] = [];
      let moved = false;
      let left = false;
      let used = 0;
      g.streams.forEach((items, s) => {
        const end: GroupPos = { child: (g.ends[s] ?? g.close) + base, line: 0 };
        if (items.length === 0) { pos.push(end); return; }
        const breaks = galleyBreaks(items, childMin);
        const fill = fillGalley(items, breaks, g.flow === 'snake' ? g.columns : 1, h);
        if (fill.end) {
          moved = true;
          used = Math.max(used, fill.used);
          pos.push(end);
          return;
        }
        left = true;
        if (fill.cuts.length === 0) {
          // This stream takes nothing in the fragment: it stays where it is.
          pos.push(reopened?.pos[s] ?? { child: items[0]!.child + base, line: 0 });
          return;
        }
        moved = true;
        used = Math.max(used, fill.used);
        const b = breaks[fill.cuts[fill.cuts.length - 1]!]!;
        const it = items[b.item]!;
        if (b.line === 0) {
          pos.push({ child: it.child + base, line: 0 });
          return;
        }
        // The sub-column widths the paragraph's lines are set at.
        const before = it.lineBase > 0 ? reopened?.pos[s]?.widths : undefined;
        const lastW = before?.[before.length - 1];
        const widths = !before || before.length === 0
          ? [{ fromLine: 0, width: g.columnWidth }]
          : Math.abs(lastW!.width - g.columnWidth) <= 0.5 ? before : [...before, { fromLine: it.lineBase, width: g.columnWidth }];
        pos.push({ child: it.child + base, line: it.lineBase + b.line, widths });
      });
      if (!moved || !left) continue;
      candidates.push({
        cut: { child: Math.min(...pos.map((p) => p.child)), line: 0, group: { open: g.open + base, pos } },
        bottom: g.top + used,
      });
    }
  }
  const insideGroup = (cut: CalloutCut): boolean =>
    !cut.group && L.groups.some(([gs, ge]) => (cut.line === 0 ? gs < cut.child && cut.child <= ge : gs < cut.child && cut.child < ge));
  // A part that opens a page of its own ends the fragment there: no cut
  // runs past the first such break (#996).
  const breakAt = Math.min(Infinity, ...candidates.filter((c) => c.partBreak).map((c) => c.bottom));
  const viable = candidates
    .filter((c) => !insideGroup(c.cut) && c.bottom <= breakAt + 0.01)
    .sort((a, b) => b.bottom - a.bottom);
  // A wrapped code line stays with its continuations when a cut
  // elsewhere fits (#624), and a drop cap's paragraph with its sink line
  // (#947) when any other cut does.
  const rank = (c: { soft?: true; capSplit?: true }): number => (c.capSplit ? 2 : c.soft ? 1 : 0);
  viable.sort((a, b) => rank(a) - rank(b));
  for (const c of viable) {
    if (c.bottom + tail > roomPx + 0.01) continue;
    const result = L.peekRange(from, c.cut, width, frameId, continuation, mirrored, frame);
    // The caller may move what it is given: a layout memo's stored layout
    // is read, not handed over.
    if (result.totalHeight <= roomPx + 0.01) return { to: c.cut, result: pass.layoutMemo ? L.layoutRange(from, c.cut, width, frameId, continuation, mirrored, frame) : result };
  }
  return null;
};

/** Absolute content indices of the children a fragment from cut `from`
 *  to cut `to` of `L` touches, for the fragment's source range. */
export const fragmentRange = (L: CalloutLayouter, from: CalloutCut, to: CalloutCut) =>
  ({ firstChildIdx: L.childBase + from.child, lastChildIdx: L.childBase + (to.line > 0 ? to.child : to.child - 1) });

/** The (rest of the) box is taller than an empty, full-height column —
 *  a whole page's content area for a page-span box: no column could
 *  hold it, so even a keep-together box splits (with the rules of a
 *  `keepTogether: false` one) rather than overflow. */
export const tallerThanColumn = (pass: FrameLayoutPass, result: CalloutLayoutResult): boolean =>
  result.totalHeight > pass.columnHeight() + 0.01;
