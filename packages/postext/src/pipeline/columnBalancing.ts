/**
 * Vertical column balancing — editorial bottom alignment.
 *
 * Publishers expect every column of a page to start at the top of the page
 * and end flush with the bottom. The placement pass naturally leaves short
 * columns: orphan/widow rules, keep-with-next headings, and unsplittable
 * groups all push content to the next column before the current one is full,
 * leaving one or more empty grid lines at its bottom.
 *
 * The fix mirrors what a human compositor does: add whole baseline-grid
 * lines to the top margin of the headings inside the short column, pushing
 * the content below them down until the column ends on the last grid slot.
 * Because the column break is element-bound (the element that opens the next
 * column did not fit in the gap, so it still won't fit in a smaller one),
 * shifting a column's tail down by at most its gap never moves content into
 * the next column or page — the adjustment is local and exact.
 *
 * When a column needs several lines and holds several headings, the extra
 * lines are distributed round-robin in importance order (lowest heading
 * level first), so the most important heading always receives the largest
 * share — e.g. 3 lines over an h2 and an h3 become +2 above the h2 and +1
 * above the h3.
 *
 * When the column's headings cannot absorb the whole gap, three further
 * levers apply in editorial priority order:
 *  - first of all, a callout box closing the column takes the room under
 *    its foot as space above it, so the foot lands on the last grid slot of
 *    the page, level with the last line of the column beside it;
 *  - extra grid lines where a list/enumeration ends (space after a list
 *    reads naturally), capped per list end;
 *  - extra grid lines between a top float band (a figure or table at the
 *    head of the column) and the text under it, capped per band — a
 *    little more air under a figure is invisible;
 *  - as a last resort, up to `maxLooseParagraphs` paragraphs of the column
 *    are each re-broken one line looser (TeX \looseness=+1) via the
 *    Knuth-Plass `looseness` option — always within the configured
 *    `maxWordSpacing`, so type colour never exceeds the user's limit. When
 *    word spacing alone cannot gain the line, the placement pass also tries
 *    a little positive tracking on that paragraph (the compositor's classic
 *    fix), keeping the smallest value that works, never above `maxTracking`.
 */

import type { VDTBlock, VDTColumn, VDTDocument, VDTPage } from '../vdt';

/** Tolerance against FP drift when converting free space to grid lines. */
const EPS = 0.01;

/** Balancing attempts a segment of pages (see {@link pageSegments}) may
 *  spend: passes in which it tried new levers. */
export const MAX_BALANCING_PASSES = 10;

/** Hard cap on the balancing passes of one document, whatever its segments
 *  still want to try — every pass places the whole document. */
export const MAX_BALANCING_PASSES_PER_DOCUMENT = MAX_BALANCING_PASSES * 3;

/** Inclusive run of page indices. */
export interface PageRange {
  from: number;
  to: number;
}

/**
 * The runs of pages laid out independently of one another: every page in
 * `forcedBreakPages` (a `:::pagebreak`, a heading `breakBefore`, a chapter
 * opener) closes a segment and the next page opens another. Nothing flows
 * across such a break, so a balancing lever inside one segment cannot
 * move a line of any other — the convergence loop judges each on its own.
 */
export function pageSegments(pageCount: number, forcedBreakPages: ReadonlySet<number>): PageRange[] {
  const out: PageRange[] = [];
  let from = 0;
  const breaks = [...forcedBreakPages].filter((p) => p >= 0 && p < pageCount - 1).sort((a, b) => a - b);
  for (const p of breaks) {
    if (p < from) continue;
    out.push({ from, to: p });
    from = p + 1;
  }
  out.push({ from, to: Math.max(from, pageCount - 1) });
  return out;
}

/** Empty grid lines over the balanceable columns of the pages in `range`. */
export function gapLinesIn(gaps: readonly ColumnGap[], range: PageRange): number {
  let n = 0;
  for (const g of gaps) if (g.pageIndex >= range.from && g.pageIndex <= range.to) n += g.gapLines;
  return n;
}

export type BalanceCandidateKind = 'heading' | 'listEnd' | 'afterDisplay' | 'afterFloat' | 'trailingCallout' | 'looseParagraph';

interface BalanceCandidate {
  /** Stable content-block index keying the adjustment across passes. */
  contentIndex: number;
  kind: BalanceCandidateKind;
  /** Heading level (1–6) for `kind: 'heading'`; 0 otherwise. */
  level: number;
  /** Reading-order tiebreak within the column. */
  order: number;
  /** Line count of the block — loose-paragraph preference (more lines =
   *  more glue = least visible loosening). */
  lineCount: number;
  /** `trailingCallout` only: room (px) between the box's foot and the last
   *  grid slot of the column — the exact space to add above the box. */
  gapPx?: number;
  /** The fragment of a split block the candidate is (0 = the block or its
   *  head): the fragments of one split box — or of a paragraph continuing
   *  under a float band — share a content index and are levered on their
   *  own (see {@link balanceKey}). */
  part?: number;
}

/** Key of a balancing adjustment: the content index of the block, or, for a
 *  continuation fragment (of a split callout, or of a paragraph resuming
 *  under a float band), a composite that keeps the fragments of one block
 *  apart — they share its content index. */
export function balanceKey(contentIndex: number, part: number): number {
  return part > 0 ? -(contentIndex * 1024 + part) : contentIndex;
}

/** Whether a float band sits right above `col` (a figure at the head of the
 *  column): the column's content then has something to be pushed down from. */
function floatBandAbove(page: VDTPage, col: VDTColumn): boolean {
  const left = col.bbox.x;
  const right = col.bbox.x + col.bbox.width;
  return (page.floats ?? []).some((f) =>
    f.bbox.x < right - 0.5 && f.bbox.x + f.bbox.width > left + 0.5 && f.bbox.y + f.bbox.height <= col.bbox.y + EPS);
}

export interface ColumnGap {
  pageIndex: number;
  columnIndex: number;
  /** Whole empty grid lines at the bottom of the column. */
  gapLines: number;
  /** Stretch points inside this column that can absorb extra lines. */
  candidates: BalanceCandidate[];
}

function pageHasBodyContent(page: VDTPage): boolean {
  return page.columns.some((c) => c.blocks.length > 0);
}

/** Which fragment of a split block this one is: a callout frame carries its
 *  own index, a paragraph continuing into a new column carries it in its id
 *  (`…-cont-2`). 0 for a block that starts here. */
function fragmentOf(b: VDTBlock): number {
  if (b.callout?.part !== undefined) return b.callout.part;
  const m = /-cont-(\d+)$/.exec(b.id);
  return m ? Number(m[1]) : 0;
}

/** Whether a float band sits right above the column (the column's top was
 *  pushed down under it): a float on the page overlapping the column
 *  horizontally whose box ends at or above the column's top. */
function columnUnderTopFloat(page: VDTPage, col: VDTColumn): boolean {
  const floats = page.floats ?? [];
  const left = col.bbox.x;
  const right = col.bbox.x + col.bbox.width;
  return floats.some((f) =>
    f.bbox.x < right - 0.5
    && f.bbox.x + f.bbox.width > left + 0.5
    && f.bbox.y + f.bbox.height <= col.bbox.y + 0.5
    && f.bbox.y >= page.contentArea.y - 0.5,
  );
}

/** Regular flow column with a usable height — never a page-span block's
 *  full-width column, nor a band closed at its own top. */
function isTextColumn(col: VDTColumn): boolean {
  return col.kind !== 'span' && col.kind !== 'side' && col.bbox.height > 0.5;
}

/**
 * Collect the bottom gaps of every balanceable column.
 *
 * A column is balanceable when content flowed past it into a later column of
 * the same page, or — for the page's last non-empty column — when the page
 * flows naturally into a later content page (no `:::pagebreak`, heading
 * `breakBefore`, or chapter opener forced the break, and it is not the last
 * content page: a short final column at the end of a chapter is legitimate).
 *
 * Eligible headings are heading blocks that are neither the first block of
 * their column (their top margin is suppressed there so the column keeps
 * starting at the page top) nor the last (space above a trailing heading
 * would strand it at the column bottom); a heading that opens a column
 * under a float band is eligible too (it is a heading lever, not an
 * after-float point). List-end points are the first
 * non-list block after a run of list items — they may be last in column
 * (pushing a trailing paragraph down by at most the gap is local: the
 * element that opened the next column still does not fit). After-float
 * points are the first block of a column that starts under a float band (a
 * whole block, not a continuation, and not a callout). Loose-paragraph
 * candidates are justified paragraphs wholly contained in the column (never
 * split parts — loosening those would reshuffle lines across columns).
 */
export function collectColumnGaps(
  doc: VDTDocument,
  forcedBreakPages: ReadonlySet<number>,
): ColumnGap[] {
  let lastContentPage = -1;
  for (let i = 0; i < doc.pages.length; i++) {
    if (pageHasBodyContent(doc.pages[i]!)) lastContentPage = i;
  }

  // Multiplicity of each content index across the whole document — a count
  // above 1 means the block was split across columns/pages.
  const partCount = new Map<number, number>();
  for (const page of doc.pages) {
    for (const col of page.columns) {
      for (const b of col.blocks) {
        if (b.contentIndex !== undefined) {
          partCount.set(b.contentIndex, (partCount.get(b.contentIndex) ?? 0) + 1);
        }
      }
    }
  }

  /** The trailing-callout candidate of a closing column whose last blocks
   *  are one callout box: the room between the box's foot and the foot of
   *  the lowest last line in the other text columns of its band. */
  const closingBoxGap = (d: VDTDocument, page: VDTPage, col: VDTColumn): BalanceCandidate | null => {
    const visible = col.blocks.filter((b) => !b.hidden);
    const last = visible[visible.length - 1];
    if (!last || last.containerId === undefined) return null;
    const frameAt = visible.findIndex((b) => b.type === 'callout' && b.containerId === last.containerId);
    const frame = frameAt >= 1 ? visible[frameAt]! : undefined;
    if (!frame || frame.contentIndex === undefined || (frame.callout?.part ?? 0) > 0) return null;
    if (!visible.slice(frameAt).every((b) => b.containerId === last.containerId)) return null;
    let target = -Infinity;
    for (const other of page.columns) {
      if (other === col || !isTextColumn(other) || (other.band ?? 0) !== (col.band ?? 0)) continue;
      const blocks = other.blocks.filter((b) => !b.hidden && b.lines.length > 0);
      const tail = blocks[blocks.length - 1];
      const line = tail?.lines[tail.lines.length - 1];
      if (line) target = Math.max(target, line.bbox.y + line.bbox.height);
    }
    const foot = frame.bbox.y + frame.bbox.height;
    const room = col.bbox.y + col.bbox.height - foot;
    const gapPx = Math.min(target - foot, room);
    // Only a small gap closes this way: a box pushed far down would open a
    // hole between the text above it and itself (the trailing cap levels
    // such a band instead).
    if (!(gapPx > d.baselineGrid * 0.1) || gapPx > d.baselineGrid * 6 + EPS) return null;
    return { contentIndex: frame.contentIndex, part: 0, kind: 'trailingCallout', level: 0, order: frameAt, lineCount: 0, gapPx };
  };

  const gaps: ColumnGap[] = [];
  for (let p = 0; p <= lastContentPage; p++) {
    const page = doc.pages[p]!;
    if (page.blankForParity || page.blankForForce) continue;

    // Only text columns balance. A page-span block's full-width column is
    // exactly as tall as its content, and a band closed before any text
    // landed in it is zero-height — neither has a gap to absorb. The "last
    // column of the page" is likewise the last non-empty TEXT column: a
    // trailing span column must not turn a chapter's real closing column
    // into a balanceable one.
    let lastNonEmpty = -1;
    for (let c = 0; c < page.columns.length; c++) {
      const col = page.columns[c]!;
      if (isTextColumn(col) && col.blocks.length > 0) lastNonEmpty = c;
    }
    if (lastNonEmpty === -1) continue;

    const pageFlowsOn = p < lastContentPage && !forcedBreakPages.has(p);

    for (let c = 0; c <= lastNonEmpty; c++) {
      const col = page.columns[c]!;
      if (!isTextColumn(col) || col.blocks.length === 0) continue;
      // The closing column of a page that does not flow on ends where its
      // text ends — unless a trailing cap cut it level with the columns
      // beside it: then it fills up to the cut like any other.
      // One exception: a closing column that ends with a callout box moves
      // the box down (the trailing-callout lever alone) so its foot ends
      // level with the last line of the columns beside it.
      if (c === lastNonEmpty && !pageFlowsOn && !col.trailingCap) {
        const closing = closingBoxGap(doc, page, col);
        if (closing) gaps.push({ pageIndex: p, columnIndex: c, gapLines: 0, candidates: [closing] });
        continue;
      }
      // A `:::columnbreak` ended this column on purpose — leave its gap.
      if (col.forcedBreak) continue;

      // A column closed by a list tail: the tail's box bakes the list's
      // bottom margin and grid snap in (so the flow after it lands on the
      // grid), which can hide a whole empty line under the last item — one
      // a stretch point above could still use; the item would simply land
      // with less margin below it. Measure the room below its last line.
      let free = col.availableHeight;
      for (let i = col.blocks.length - 1; i >= 0; i--) {
        const b = col.blocks[i]!;
        if (b.hidden) continue;
        const lastLine = b.lines[b.lines.length - 1];
        if (b.type === 'listItem' && lastLine) {
          free = Math.max(free, col.bbox.y + col.bbox.height - (lastLine.bbox.y + lastLine.bbox.height));
        }
        break;
      }
      // A column of a closing band cut level by a trailing cap stretches up
      // to the tallest column beside it, not to the cut itself: when that
      // column could not fill its last line (a split kept clear of a widow)
      // the band ends one line short of the cap, and this one must end with
      // it rather than a line lower.
      // The same holds for any band cut level (a band cap before a
      // page-span box) and for the columns of a page that does not flow on:
      // they end with the tallest column of their band.
      if (col.trailingCap || col.bandCapped || !pageFlowsOn) {
        const usedBottom = (k: VDTColumn): number => k.bbox.y + (k.bbox.height - k.availableHeight);
        const level = Math.max(...page.columns
          .filter((k) => k !== col && isTextColumn(k) && (k.band ?? 0) === (col.band ?? 0) && k.blocks.length > 0)
          .map(usedBottom), -Infinity);
        if (Number.isFinite(level)) {
          const mine = usedBottom(col);
          // No column of such a band ends past the tallest other one: a
          // closing page ends level, it does not grow one column away.
          free = Math.min(free, Math.max(0, level - mine));
        }
      }
      let gapLines = Math.floor((free + EPS) / doc.baselineGrid);

      const candidates: BalanceCandidate[] = [];
      // A callout box closing the column (its frame and children are the
      // column's last blocks) takes the room under its foot, up to the
      // column's last grid slot, as space above it — provided something
      // sits above it to push down from: text blocks, or a float band at
      // the column's head. A continuation fragment of a split box counts
      // like a head: under a figure it lands level with the foot of the
      // head in the column before, as any note closing a column. The box's
      // tail bakes its bottom margin and a grid snap in, so that room is
      // measured from the frame itself and taken exactly, not by the line.
      const visible = col.blocks.filter((b) => !b.hidden);
      const last = visible[visible.length - 1];
      if (last && last.containerId !== undefined) {
        const frameAt = visible.findIndex((b) => b.type === 'callout' && b.containerId === last.containerId);
        const frame = frameAt >= 0 ? visible[frameAt]! : undefined;
        if (
          frame
          && (frameAt >= 1 || floatBandAbove(page, col))
          && frame.contentIndex !== undefined
          && visible.slice(frameAt).every((b) => b.containerId === last.containerId)
        ) {
          const lastSlotBottom = col.bbox.y + Math.floor((col.bbox.height + EPS) / doc.baselineGrid) * doc.baselineGrid;
          // A continuation lands level with the foot of the fragment before
          // it when that one closes a column of the same page (the note's
          // head at the band bottom of the column beside), else on the
          // column's true foot — box interiors are off-grid anyway.
          const part = frame.callout?.part ?? 0;
          let target = lastSlotBottom;
          if (part > 0) {
            const trueBottom = col.bbox.y + col.bbox.height;
            const before = doc.blocks.find((b) =>
              b.type === 'callout' && b.containerId === frame.containerId && b.pageIndex === frame.pageIndex && b.callout?.part === part - 1);
            const beforeFoot = before ? before.bbox.y + before.bbox.height : undefined;
            target = beforeFoot !== undefined && beforeFoot <= trueBottom + EPS ? beforeFoot : trueBottom;
          }
          const gapPx = target - (frame.bbox.y + frame.bbox.height);
          if (gapPx > doc.baselineGrid * 0.1) {
            candidates.push({ contentIndex: frame.contentIndex, part: frame.callout?.part ?? 0, kind: 'trailingCallout', level: 0, order: frameAt, lineCount: 0, gapPx });
            // The box takes its room exactly; the whole-line levers above it
            // may only take the whole lines of it (a line more overflows the
            // column — or the cut of a capped band — and the pass is lost).
            gapLines = Math.max(gapLines, Math.floor(gapPx / doc.baselineGrid + EPS));
          }
        }
      }
      if (gapLines < 1 && candidates.length === 0) continue;

      for (let i = 0; i < col.blocks.length; i++) {
        const b = col.blocks[i]!;
        if (b.hidden || b.contentIndex === undefined) continue;
        // Callout frames and their children form one unbreakable unit whose
        // interior is off-grid by design — never a stretch point.
        if (b.containerId !== undefined) continue;

        // A heading opening a column under a float band is a heading lever
        // (its cap and priority), not an after-float point: the room goes
        // above a title, where the reader expects it. A paragraph resuming
        // from the column before is a lever like any other — the room goes
        // under the figure, where nobody reads a gap, and its lines land
        // back on the grid of the column beside it.
        const underFloat = i === 0 && columnUnderTopFloat(page, col);
        if (
          b.type === 'heading'
          && b.headingLevel !== undefined
          && (i >= 1 || underFloat)
          && i < col.blocks.length - 1
        ) {
          candidates.push({
            contentIndex: b.contentIndex,
            kind: 'heading',
            level: b.headingLevel,
            order: i,
            lineCount: b.lines.length,
          });
        } else if (underFloat) {
          candidates.push({
            contentIndex: b.contentIndex,
            part: fragmentOf(b),
            kind: 'afterFloat',
            level: 0,
            order: i,
            lineCount: b.lines.length,
          });
        } else if (
          i >= 1
          && col.blocks[i - 1]!.type === 'listItem'
          && col.blocks[i - 1]!.containerId === undefined
          && b.type !== 'listItem'
          && b.type !== 'heading' // a heading after a list is a heading candidate
          && !b.id.includes('-cont-')
          && !b.tocEntry && !b.tocPart // the contents keep their own rhythm
        ) {
          candidates.push({
            contentIndex: b.contentIndex,
            kind: 'listEnd',
            level: 0,
            order: i,
            lineCount: b.lines.length,
          });
        } else if (
          i >= 1
          && (
            (col.blocks[i - 1]!.type === 'mathDisplay' && col.blocks[i - 1]!.containerId === undefined)
            // …or the last block of a callout box (its children carry the
            // box's container id; the block after it is back in the flow).
            || col.blocks[i - 1]!.containerId !== undefined
          )
          && b.type !== 'heading'
          && b.type !== 'mathDisplay'
          && !b.id.includes('-cont-')
        ) {
          // The space under a display formula or a box: a whole grid line
          // more there reads as the element's own margin, not as a hole in
          // the text.
          candidates.push({
            contentIndex: b.contentIndex,
            kind: 'afterDisplay',
            level: 0,
            order: i,
            lineCount: b.lines.length,
          });
        }

        if (
          b.type === 'paragraph'
          && b.textAlign === 'justify'
          && b.lines.length >= 2
          && partCount.get(b.contentIndex) === 1
        ) {
          candidates.push({
            contentIndex: b.contentIndex,
            kind: 'looseParagraph',
            level: 0,
            order: i,
            lineCount: b.lines.length,
          });
        }
      }
      gaps.push({ pageIndex: p, columnIndex: c, gapLines, candidates });
    }
  }
  return gaps;
}

/** Total empty grid lines across all balanceable columns — the quantity the
 *  convergence loop minimises. */
export function totalGapLines(
  doc: VDTDocument,
  forcedBreakPages: ReadonlySet<number>,
): number {
  return collectColumnGaps(doc, forcedBreakPages).reduce((sum, g) => sum + g.gapLines, 0);
}

/** Adjustments already applied in the layout being inspected. */
export interface BalanceState {
  /** Extra spacing grid lines per content index (headings + list ends). */
  lines: ReadonlyMap<number, number>;
  /** Loose paragraphs: contentIndex → extra lines (always 1). */
  loose: ReadonlyMap<number, number>;
}

export interface BalanceProposalOptions {
  maxLinesPerHeading: number;
  stretchAfterLists: boolean;
  maxLinesAfterList: number;
  stretchAfterFloats: boolean;
  maxLinesAfterFloat: number;
  looseParagraphs: boolean;
  /** Loose paragraphs allowed per short column (one extra line each). */
  maxLooseParagraphs: number;
  /** `bodyText.optimalLineBreaking` — the loose lever needs the K-P path. */
  optimalLineBreaking: boolean;
  /** Loose candidates that failed to gain a line in a previous attempt. */
  failedLoose: ReadonlySet<number>;
  /** Spacing candidates (headings, list ends, after-float points) that may
   *  not take more lines than already applied: a pass that gave them more
   *  moved content across a column break (see {@link firstDivergentColumn})
   *  and was discarded. */
  failedLines?: ReadonlySet<number>;
}

/** Position of a column in a document, in reading order. */
export interface ColumnPosition {
  pageIndex: number;
  columnIndex: number;
}

/** Identity of a column's content: its blocks (content index plus the
 *  continuation mark) and the floats reserved on it. */
function columnKey(page: VDTPage, col: VDTColumn): string {
  const blocks = col.blocks.map((b) => `${b.contentIndex ?? '?'}${b.id.includes('-cont-') ? 'c' : ''}`).join(',');
  const floats = (page.floats ?? [])
    .filter((f) => f.columnIndex === col.index)
    .map((f) => f.resourceBlock?.resource.id ?? f.id)
    .join(',');
  return `${blocks}|${floats}`;
}

/**
 * First column, in reading order, whose content differs between two
 * layouts of the same document — where a balancing pass stopped being
 * local. Null when every column of `a` has its counterpart in `b`. With
 * `range`, only those pages of `a` are compared.
 */
export function firstDivergentColumn(a: VDTDocument, b: VDTDocument, range?: PageRange): ColumnPosition | null {
  const from = range?.from ?? 0;
  const to = Math.min(range?.to ?? a.pages.length - 1, a.pages.length - 1);
  for (let p = from; p <= to; p++) {
    const pa = a.pages[p]!;
    const pb = b.pages[p];
    for (let c = 0; c < pa.columns.length; c++) {
      const ca = pa.columns[c]!;
      const cb = pb?.columns[c];
      if (!cb || columnKey(pa, ca) !== columnKey(pb, cb)) return { pageIndex: p, columnIndex: c };
    }
  }
  return null;
}

/** Budget shared by the loose candidates of one column: the placement pass
 *  tries them in order and stops loosening once `need` of them gained
 *  their line, so offering every candidate at once costs no extra pass. */
export interface LooseBudget {
  /** Column identity (page × columns + column). */
  group: number;
  /** Lines the column still needs from loose paragraphs. */
  need: number;
}

export interface BalanceProposal {
  /** Extra spacing grid lines per content index (cumulative across passes). */
  lines: Map<number, number>;
  /** Loose paragraphs per content index (cumulative across passes). */
  loose: Map<number, number>;
  /** Budget of the loose candidates newly offered by this proposal. */
  looseBudget: Map<number, LooseBudget>;
  /** Whether the proposal adds anything over `current`. */
  changed: boolean;
}

/**
 * Propose the next round of adjustments. Per column gap, levers apply in
 * strict editorial priority order, on top of the already-applied `current`
 * state:
 *  0. a callout box closing the column — the exact room under its foot
 *     goes above it, so the foot meets the last grid slot;
 *  1. headings — round-robin in importance order (level asc, then reading
 *     order), capped at `maxLinesPerHeading`;
 *  2. list ends — round-robin in reading order, capped at
 *     `maxLinesAfterList`;
 *  3. after-float points — the first block under a float band, capped at
 *     `maxLinesAfterFloat`;
 *  4. loose paragraphs — every eligible candidate of the column is offered,
 *     longest first (most glue = least visible loosening), with a shared
 *     budget: the pass stops loosening once the column has gained what it
 *     needs, capped at `maxLooseParagraphs` (cumulative across passes).
 *     Candidates that already failed to gain a line are skipped.
 */
export function proposeBalanceLines(
  doc: VDTDocument,
  forcedBreakPages: ReadonlySet<number>,
  current: BalanceState,
  options: BalanceProposalOptions,
): BalanceProposal {
  const lines = new Map(current.lines);
  const loose = new Map(current.loose);
  const looseBudget = new Map<number, LooseBudget>();
  let changed = false;

  /** Round-robin one extra line at a time over `cands` until the gap is
   *  absorbed or every candidate hits `cap`. Returns the unabsorbed rest. */
  const distribute = (cands: BalanceCandidate[], remaining: number, cap: number): number => {
    let progress = true;
    while (remaining > 0 && progress) {
      progress = false;
      for (const cand of cands) {
        if (remaining <= 0) break;
        const key = balanceKey(cand.contentIndex, cand.part ?? 0);
        if (options.failedLines?.has(key)) continue;
        const cur = lines.get(key) ?? 0;
        if (cur >= cap) continue;
        lines.set(key, cur + 1);
        remaining--;
        changed = true;
        progress = true;
      }
    }
    return remaining;
  };

  for (const gap of collectColumnGaps(doc, forcedBreakPages)) {
    let remaining = gap.gapLines;
    // A box closing the column takes the exact room under its foot (a
    // fraction of a line is fine — the box interior is off-grid anyway),
    // which closes the column's gap outright.
    for (const cand of gap.candidates) {
      if (cand.kind !== 'trailingCallout' || cand.gapPx === undefined) continue;
      const key = balanceKey(cand.contentIndex, cand.part ?? 0);
      if (options.failedLines?.has(key)) continue;
      const cur = lines.get(key) ?? 0;
      lines.set(key, cur + cand.gapPx / doc.baselineGrid);
      changed = true;
      remaining = 0;
    }

    const headings = gap.candidates
      .filter((c) => c.kind === 'heading')
      .sort((a, b) => a.level - b.level || a.order - b.order);
    remaining = distribute(headings, remaining, options.maxLinesPerHeading);

    if (remaining > 0 && options.stretchAfterLists) {
      const listEnds = gap.candidates
        .filter((c) => c.kind === 'listEnd')
        .sort((a, b) => a.order - b.order);
      remaining = distribute(listEnds, remaining, options.maxLinesAfterList);
    }

    if (remaining > 0) {
      const afterDisplay = gap.candidates
        .filter((c) => c.kind === 'afterDisplay')
        .sort((a, b) => a.order - b.order);
      remaining = distribute(afterDisplay, remaining, 1);
    }

    if (remaining > 0 && options.stretchAfterFloats) {
      const afterFloats = gap.candidates
        .filter((c) => c.kind === 'afterFloat')
        .sort((a, b) => a.order - b.order);
      remaining = distribute(afterFloats, remaining, options.maxLinesAfterFloat);
    }

    if (
      remaining > 0
      && options.looseParagraphs
      && options.optimalLineBreaking
    ) {
      const columnLoose = gap.candidates.filter((c) => c.kind === 'looseParagraph');
      // Each loose paragraph gains one line. The gap already reflects the
      // paragraphs loosened in earlier passes, so only the capacity left
      // under `maxLooseParagraphs` — and only as many as the gap needs —
      // are added now.
      const alreadyLoose = columnLoose.filter((c) => loose.has(c.contentIndex)).length;
      const need = Math.min(options.maxLooseParagraphs - alreadyLoose, remaining);
      if (need > 0) {
        const budget: LooseBudget = { group: gap.pageIndex * 1024 + gap.columnIndex, need };
        const picks = columnLoose
          .filter((c) => !loose.has(c.contentIndex) && !options.failedLoose.has(c.contentIndex))
          .sort((a, b) => b.lineCount - a.lineCount || a.order - b.order);
        for (const pick of picks) {
          loose.set(pick.contentIndex, 1);
          looseBudget.set(pick.contentIndex, budget);
          changed = true;
        }
      }
    }
  }
  return { lines, loose, looseBudget, changed };
}
