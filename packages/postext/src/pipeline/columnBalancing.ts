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
 * When the column's headings cannot absorb the whole gap, two further
 * levers apply in editorial priority order:
 *  - extra grid lines where a list/enumeration ends (space after a list
 *    reads naturally), capped per list end;
 *  - as a last resort, ONE paragraph of the column is re-broken one line
 *    looser (TeX \looseness=+1) via the Knuth-Plass `looseness` option —
 *    always within the configured `maxWordSpacing`, so type colour never
 *    exceeds the user's limit.
 */

import type { VDTDocument, VDTPage } from '../vdt';

/** Tolerance against FP drift when converting free space to grid lines. */
const EPS = 0.01;

/** Maximum number of placement passes (initial + balancing retries). */
export const MAX_BALANCING_PASSES = 7;

export type BalanceCandidateKind = 'heading' | 'listEnd' | 'looseParagraph';

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
}

interface ColumnGap {
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
 * would strand it at the column bottom). List-end points are the first
 * non-list block after a run of list items — they may be last in column
 * (pushing a trailing paragraph down by at most the gap is local: the
 * element that opened the next column still does not fit). Loose-paragraph
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

  const gaps: ColumnGap[] = [];
  for (let p = 0; p <= lastContentPage; p++) {
    const page = doc.pages[p]!;
    if (page.blankForParity || page.blankForForce) continue;

    let lastNonEmpty = -1;
    for (let c = 0; c < page.columns.length; c++) {
      if (page.columns[c]!.blocks.length > 0) lastNonEmpty = c;
    }
    if (lastNonEmpty === -1) continue;

    const pageFlowsOn = p < lastContentPage && !forcedBreakPages.has(p);

    for (let c = 0; c <= lastNonEmpty; c++) {
      const col = page.columns[c]!;
      if (col.blocks.length === 0) continue;
      if (c === lastNonEmpty && !pageFlowsOn) continue;

      const gapLines = Math.floor((col.availableHeight + EPS) / doc.baselineGrid);
      if (gapLines < 1) continue;

      const candidates: BalanceCandidate[] = [];
      for (let i = 0; i < col.blocks.length; i++) {
        const b = col.blocks[i]!;
        if (b.hidden || b.contentIndex === undefined) continue;

        if (
          b.type === 'heading'
          && b.headingLevel !== undefined
          && i >= 1
          && i < col.blocks.length - 1
        ) {
          candidates.push({
            contentIndex: b.contentIndex,
            kind: 'heading',
            level: b.headingLevel,
            order: i,
            lineCount: b.lines.length,
          });
        } else if (
          i >= 1
          && col.blocks[i - 1]!.type === 'listItem'
          && b.type !== 'listItem'
          && b.type !== 'heading' // a heading after a list is a heading candidate
          && !b.id.includes('-cont-')
        ) {
          candidates.push({
            contentIndex: b.contentIndex,
            kind: 'listEnd',
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
  looseParagraphs: boolean;
  /** `bodyText.optimalLineBreaking` — the loose lever needs the K-P path. */
  optimalLineBreaking: boolean;
  /** Loose candidates that failed to gain a line in a previous attempt. */
  failedLoose: ReadonlySet<number>;
}

export interface BalanceProposal {
  /** Extra spacing grid lines per content index (cumulative across passes). */
  lines: Map<number, number>;
  /** Loose paragraphs per content index (cumulative across passes). */
  loose: Map<number, number>;
  /** Whether the proposal adds anything over `current`. */
  changed: boolean;
}

/**
 * Propose the next round of adjustments. Per column gap, levers apply in
 * strict editorial priority order, on top of the already-applied `current`
 * state:
 *  1. headings — round-robin in importance order (level asc, then reading
 *     order), capped at `maxLinesPerHeading`;
 *  2. list ends — round-robin in reading order, capped at
 *     `maxLinesAfterList`;
 *  3. one loose paragraph per column (cumulative across passes) — the one
 *     with the most lines (most glue = least visible loosening), skipping
 *     candidates that already failed to gain a line.
 */
export function proposeBalanceLines(
  doc: VDTDocument,
  forcedBreakPages: ReadonlySet<number>,
  current: BalanceState,
  options: BalanceProposalOptions,
): BalanceProposal {
  const lines = new Map(current.lines);
  const loose = new Map(current.loose);
  let changed = false;

  /** Round-robin one extra line at a time over `cands` until the gap is
   *  absorbed or every candidate hits `cap`. Returns the unabsorbed rest. */
  const distribute = (cands: BalanceCandidate[], remaining: number, cap: number): number => {
    let progress = true;
    while (remaining > 0 && progress) {
      progress = false;
      for (const cand of cands) {
        if (remaining <= 0) break;
        const cur = lines.get(cand.contentIndex) ?? 0;
        if (cur >= cap) continue;
        lines.set(cand.contentIndex, cur + 1);
        remaining--;
        changed = true;
        progress = true;
      }
    }
    return remaining;
  };

  for (const gap of collectColumnGaps(doc, forcedBreakPages)) {
    let remaining = gap.gapLines;

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

    if (
      remaining > 0
      && options.looseParagraphs
      && options.optimalLineBreaking
    ) {
      const columnLoose = gap.candidates.filter((c) => c.kind === 'looseParagraph');
      // One loose paragraph per column, cumulative across passes.
      const alreadyLoose = columnLoose.some((c) => loose.has(c.contentIndex));
      if (!alreadyLoose) {
        const pick = columnLoose
          .filter((c) => !options.failedLoose.has(c.contentIndex))
          .sort((a, b) => b.lineCount - a.lineCount || a.order - b.order)[0];
        if (pick) {
          loose.set(pick.contentIndex, 1);
          changed = true;
        }
      }
    }
  }
  return { lines, loose, changed };
}
