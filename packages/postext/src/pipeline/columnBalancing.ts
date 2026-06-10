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
 */

import type { VDTDocument, VDTPage } from '../vdt';

/** Tolerance against FP drift when converting free space to grid lines. */
const EPS = 0.01;

/** Maximum number of placement passes (initial + balancing retries). */
export const MAX_BALANCING_PASSES = 5;

interface BalanceCandidate {
  /** Stable content-block index keying the adjustment across passes. */
  contentIndex: number;
  /** Heading level (1–6); lower = more important = larger share. */
  level: number;
  /** Reading-order tiebreak within the column. */
  order: number;
}

interface ColumnGap {
  pageIndex: number;
  columnIndex: number;
  /** Whole empty grid lines at the bottom of the column. */
  gapLines: number;
  /** Headings inside this column that can absorb extra lines. */
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
 * would strand it at the column bottom).
 */
export function collectColumnGaps(
  doc: VDTDocument,
  forcedBreakPages: ReadonlySet<number>,
): ColumnGap[] {
  let lastContentPage = -1;
  for (let i = 0; i < doc.pages.length; i++) {
    if (pageHasBodyContent(doc.pages[i]!)) lastContentPage = i;
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
      for (let i = 1; i < col.blocks.length - 1; i++) {
        const b = col.blocks[i]!;
        if (
          b.type === 'heading'
          && b.headingLevel !== undefined
          && !b.hidden
          && b.contentIndex !== undefined
        ) {
          candidates.push({ contentIndex: b.contentIndex, level: b.headingLevel, order: i });
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

export interface BalanceProposal {
  /** Extra grid lines per content-block index (cumulative across passes). */
  lines: Map<number, number>;
  /** Whether the proposal adds anything over `current`. */
  changed: boolean;
}

/**
 * Propose the next round of per-heading extra lines: for each balanceable
 * column gap, distribute its lines among the column's headings round-robin
 * in importance order, on top of the already-applied `current` adjustments
 * and capped at `maxLinesPerHeading` per heading.
 */
export function proposeBalanceLines(
  doc: VDTDocument,
  forcedBreakPages: ReadonlySet<number>,
  current: ReadonlyMap<number, number>,
  maxLinesPerHeading: number,
): BalanceProposal {
  const lines = new Map(current);
  let changed = false;

  for (const gap of collectColumnGaps(doc, forcedBreakPages)) {
    if (gap.candidates.length === 0) continue;
    const ordered = [...gap.candidates].sort(
      (a, b) => a.level - b.level || a.order - b.order,
    );
    let remaining = gap.gapLines;
    let progress = true;
    while (remaining > 0 && progress) {
      progress = false;
      for (const cand of ordered) {
        if (remaining <= 0) break;
        const cur = lines.get(cand.contentIndex) ?? 0;
        if (cur >= maxLinesPerHeading) continue;
        lines.set(cand.contentIndex, cur + 1);
        remaining--;
        changed = true;
        progress = true;
      }
    }
  }
  return { lines, changed };
}
