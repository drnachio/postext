// The balancing pass caps, the page segments the convergence loop judges one
// by one with the gap totals it compares, the lever keys of the candidates,
// and the first column two layouts set differently (#1276: split out of columnBalancing.ts).
import type { BalanceLever, VDTPage, VDTColumn, VDTDocument } from '../../../vdt.js';
import type { ColumnGap } from './columnGaps.js';

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

/** Room (px) still open under the callout boxes that close a column of the
 *  pages in `range` — the `trailingCallout` candidates' gaps. Often less
 *  than a line, so {@link gapLinesIn} does not see it: the balancing loop
 *  uses it to break a tie between two layouts with the same empty lines. */
export function boxRoomIn(gaps: readonly ColumnGap[], range: PageRange): number {
  let px = 0;
  for (const g of gaps) {
    if (g.pageIndex < range.from || g.pageIndex > range.to) continue;
    for (const c of g.candidates) if (c.kind === 'trailingCallout') px += c.gapPx ?? 0;
  }
  return px;
}

/** Lever keys (see {@link balanceKey}) of the boxes closing a column — the
 *  `trailingCallout` candidates of `gaps`. */
export function boxLeverKeys(gaps: readonly ColumnGap[]): Set<number> {
  const keys = new Set<number>();
  for (const g of gaps) {
    for (const c of g.candidates) if (c.kind === 'trailingCallout') keys.add(candidateKey(c));
  }
  return keys;
}

/** The kind of stretch point a candidate is: one of the balancing levers,
 *  which the placement pass records on the block it applies to
 *  (`VDTBlock.balancing`). */
export type BalanceCandidateKind = BalanceLever;

export interface BalanceCandidate {
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
  /** `flexFigure`: the lever's own key ({@link flexFigureKey} /
   *  {@link flexFloatKey}), apart from the spacing keys of the blocks. */
  key?: number;
  /** `flexFigure`: whole grid lines the picture can still grow. */
  maxLines?: number;
  /** `afterFloat`, when the float the column starts under also stands over
   *  another text column of its band (#708): a key the columns under that
   *  float share, and how many text columns it stands over. */
  wideFloat?: { key: string; under: number };
}

/** The key a candidate's adjustment is stored under. */
export function candidateKey(c: { contentIndex: number; part?: number; key?: number }): number {
  return c.key ?? balanceKey(c.contentIndex, c.part ?? 0);
}

/** Key of the `flexFigure` lever of an inline picture: its lines are body
 *  growth, not space above (a part no split block reaches). */
export function flexFigureKey(contentIndex: number): number {
  return -(contentIndex * 1024 + 1023);
}

/** Key of the `flexFigure` lever of a floated picture, from its resource
 *  id (floats carry no content index): below every block key. */
export function flexFloatKey(resourceId: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < resourceId.length; i++) {
    h ^= resourceId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return -(2 ** 42 + h);
}

/** Key of a balancing adjustment: the content index of the block, or, for a
 *  continuation fragment (of a split callout, or of a paragraph resuming
 *  under a float band), a composite that keeps the fragments of one block
 *  apart — they share its content index. */
export function balanceKey(contentIndex: number, part: number): number {
  return part > 0 ? -(contentIndex * 1024 + part) : contentIndex;
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
