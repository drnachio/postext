// The lines a balancing pass asks of each lever: the gap of every short
// column shared out over its candidates in editorial order, and the loose
// paragraphs offered with their budget (#1276: split out of columnBalancing.ts).
import type { VDTDocument } from '../../../vdt.js';
import type { StretchAfterWideFloats, ClosingBoxLever } from '../../../types.js';
import { type ColumnGap, collectColumnGaps } from './columnGaps.js';
import { type BalanceCandidateKind, type BalanceCandidate, candidateKey } from './segments.js';

/** Grid lines the after-display lever may add under one display formula or
 *  callout box. It has a switch (`stretchAfterDisplays`, #710) and no cap
 *  setting: nobody wants two lines of white under a formula. */
const MAX_LINES_AFTER_DISPLAY = 1;

/** Adjustments already applied in the layout being inspected. */
export interface BalanceState {
  /** Extra spacing grid lines per content index (headings + list ends). */
  lines: ReadonlyMap<number, number>;
  /** Loose paragraphs: contentIndex → extra lines (1, or -1 for a
   *  paragraph `fillShortColumns` sets a line short). */
  loose: ReadonlyMap<number, number>;
}

export interface BalanceProposalOptions {
  maxLinesPerHeading: number;
  /** `headings.balancing.maxLinesBeforeLoose` (#707): lines a heading may
   *  take before the levers after it are tried. Omitted, the headings take
   *  all their lines first. */
  maxLinesBeforeLoose?: number;
  stretchAfterLists: boolean;
  maxLinesAfterList: number;
  /** `headings.balancing.stretchAfterDisplays` (#710); on when omitted. */
  stretchAfterDisplays?: boolean;
  stretchAfterFloats: boolean;
  maxLinesAfterFloat: number;
  /** `headings.balancing.stretchAfterWideFloats` (#708): `'flush'` moves a
   *  column down under a float over several columns only with the others
   *  under it or to end it flush. Omitted, as `'always'`. */
  stretchAfterWideFloats?: StretchAfterWideFloats;
  looseParagraphs: boolean;
  /** Loose paragraphs allowed per short column (one extra line each). */
  maxLooseParagraphs: number;
  /** `bodyText.optimalLineBreaking` — the loose lever needs the K-P path. */
  optimalLineBreaking: boolean;
  /** Loose candidates that failed to gain a line in a previous attempt. */
  failedLoose: ReadonlySet<number>;
  /** `headings.balancing.fillShortColumns` (#1236): when the column's loose
   *  candidates have nothing left to give, offer one of them a line short
   *  (looseness -1). Off when omitted. */
  fillShortColumns?: boolean;
  /** Candidates set a line short in a previous attempt that lost their
   *  line, or did not shorten the column's gap. */
  failedTight?: ReadonlySet<number>;
  /** Spacing candidates (headings, list ends, after-float points) that may
   *  not take more lines than already applied: a pass that gave them more
   *  moved content across a column break (see {@link firstDivergentColumn})
   *  and was discarded. */
  failedLines?: ReadonlySet<number>;
  /** Where the lever of a box closing a column runs
   *  (`headings.balancing.closingBox`); the document's setting when
   *  omitted. */
  closingBox?: ClosingBoxLever;
  /** Whether the levers that add whole grid lines (headings, list ends,
   *  after a display, after a float band) run: false on a character grid
   *  with `headings.balancing.gridLines: 'off'` (#632). Default true. */
  gridLines?: boolean;
}

/** The levers that add whole grid lines to a column, which
 *  `headings.balancing.gridLines: 'off'` keeps out of a character grid. */
export const GRID_LINE_LEVERS: readonly BalanceCandidateKind[] = ['heading', 'listEnd', 'afterDisplay', 'afterFloat'];

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
  /** Loose paragraphs per content index (cumulative across passes): the
   *  lines each runs long, -1 for one set a line short. */
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
 *     goes above it, so the foot meets the last grid slot (`closingBox:
 *     'last'` moves this step after step 3, where it takes the room the
 *     whole lines before it left; `'off'` drops it);
 *  1. headings — round-robin in importance order (level asc, then reading
 *     order), capped at `maxLinesBeforeLoose` lines each at this point and
 *     at `maxLinesPerHeading` in step 5;
 *  2. list ends — round-robin in reading order, capped at
 *     `maxLinesAfterList`;
 *  2b. after-display points — the block after a display formula or a
 *     callout box, one line each (`stretchAfterDisplays: false` skips the
 *     step);
 *  3. after-float points — the first block under a float band, capped at
 *     `maxLinesAfterFloat`. Under a float over several text columns, with
 *     `stretchAfterWideFloats: 'flush'` (#708), the columns under it take
 *     the same number of lines together, and one takes lines alone only
 *     when they close its gap;
 *  4. loose paragraphs — every eligible candidate of the column is offered,
 *     longest first (most glue = least visible loosening), with a shared
 *     budget: the pass stops loosening once the column has gained what it
 *     needs, capped at `maxLooseParagraphs` (cumulative across passes).
 *     Candidates that already failed to gain a line are skipped. With
 *     `fillShortColumns` (#1236), once no candidate is left to run long,
 *     every candidate the column has not set short yet is offered a line
 *     short instead (budget one): the split after it takes the line the
 *     widow and orphan rules held back, plus the one it gave up;
 *  5. headings again, up to `maxLinesPerHeading` (#707), only when a gap is
 *     left and step 4 has nothing more to offer this column.
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
        const key = candidateKey(cand);
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

  const boxOrder = options.closingBox ?? doc.config?.headings?.balancing?.closingBox ?? 'first';
  // A box closing the column takes the exact room under its foot (a
  // fraction of a line is fine — the box interior is off-grid anyway),
  // which closes the column's gap outright. Taken after other levers
  // (`closingBox: 'last'`), that room is what their `used` whole lines,
  // which move the box down too, leave of it. Returns whether it took any.
  const takeBoxRoom = (gap: ColumnGap, used: number): boolean => {
    let took = false;
    for (const cand of gap.candidates) {
      if (cand.kind !== 'trailingCallout' || cand.gapPx === undefined) continue;
      const key = candidateKey(cand);
      if (options.failedLines?.has(key)) continue;
      const px = cand.gapPx - used * doc.baselineGrid;
      if (!(px > doc.baselineGrid * 0.1)) continue;
      const cur = lines.get(key) ?? 0;
      lines.set(key, cur + px / doc.baselineGrid);
      changed = true;
      took = true;
    }
    return took;
  };

  // On a character grid that counts its lines, no row is added (#632).
  const rows = options.gridLines !== false;

  /** A column gap on its way through the levers: what is left of it after
   *  the ones run so far. */
  interface GapRun { gap: ColumnGap; remaining: number; headings: BalanceCandidate[]; linesFirst: number }
  const runs: GapRun[] = [];

  // The levers before the after-float one, for every column: a float over
  // several columns is decided for the columns under it together (#708),
  // on what those levers left of each.
  for (const gap of collectColumnGaps(doc, forcedBreakPages)) {
    let remaining = gap.gapLines;
    if (boxOrder === 'first' && takeBoxRoom(gap, 0)) remaining = 0;

    // Pictures with a safe area grow first among the line levers, each by
    // as many lines as its crop still allows (on top of what earlier passes
    // gave it), in reading order.
    for (const cand of gap.candidates) {
      if (remaining <= 0) break;
      if (cand.kind !== 'flexFigure' || !cand.maxLines) continue;
      const key = candidateKey(cand);
      if (options.failedLines?.has(key)) continue;
      const take = Math.min(remaining, cand.maxLines);
      lines.set(key, (lines.get(key) ?? 0) + take);
      remaining -= take;
      changed = true;
    }

    const headings = gap.candidates
      .filter((c) => rows && c.kind === 'heading')
      .sort((a, b) => a.level - b.level || a.order - b.order);
    // A heading takes its first lines here and the rest only once the
    // levers after it have nothing left to give (#707): four lines above
    // the one heading of a page are a hole, while its paragraphs could run
    // a line long.
    const linesFirst = Math.min(options.maxLinesBeforeLoose ?? options.maxLinesPerHeading, options.maxLinesPerHeading);
    remaining = distribute(headings, remaining, linesFirst);

    if (remaining > 0 && rows && options.stretchAfterLists) {
      const listEnds = gap.candidates
        .filter((c) => c.kind === 'listEnd')
        .sort((a, b) => a.order - b.order);
      remaining = distribute(listEnds, remaining, options.maxLinesAfterList);
    }

    if (remaining > 0 && rows && options.stretchAfterDisplays !== false) {
      const afterDisplay = gap.candidates
        .filter((c) => c.kind === 'afterDisplay')
        .sort((a, b) => a.order - b.order);
      remaining = distribute(afterDisplay, remaining, MAX_LINES_AFTER_DISPLAY);
    }
    runs.push({ gap, remaining, headings, linesFirst });
  }

  // After-float points. Under a float over one column, and under any float
  // with `stretchAfterWideFloats: 'always'`, a column takes what is left of
  // its gap, up to the cap. Under a float that stands over several text
  // columns (#708) a line that lowers one column's head alone is worth it
  // only when it ends the column flush: otherwise the heads come apart and
  // the feet stay apart too.
  if (rows && options.stretchAfterFloats) {
    const flush = options.stretchAfterWideFloats === 'flush';
    const cap = options.maxLinesAfterFloat;
    /** The columns under one wide float that offer an after-float point. */
    const groups = new Map<string, { under: number; members: { run: GapRun; key: number }[] }>();
    for (const run of runs) {
      const afterFloats = run.gap.candidates
        .filter((c) => c.kind === 'afterFloat')
        .sort((a, b) => a.order - b.order);
      const narrow = flush ? afterFloats.filter((c) => !c.wideFloat) : afterFloats;
      if (run.remaining > 0) run.remaining = distribute(narrow, run.remaining, cap);
      if (!flush) continue;
      for (const cand of afterFloats) {
        if (!cand.wideFloat) continue;
        const group = groups.get(cand.wideFloat.key) ?? { under: cand.wideFloat.under, members: [] };
        group.members.push({ run, key: candidateKey(cand) });
        groups.set(cand.wideFloat.key, group);
      }
    }
    for (const { under, members } of groups.values()) {
      /** Lines the member's point may still take. */
      const room = (m: { run: GapRun; key: number }): number =>
        (options.failedLines?.has(m.key) ? 0 : Math.max(0, Math.min(m.run.remaining, cap - (lines.get(m.key) ?? 0))));
      const take = (m: { run: GapRun; key: number }, n: number): void => {
        lines.set(m.key, (lines.get(m.key) ?? 0) + n);
        m.run.remaining -= n;
        changed = true;
      };
      // Together: every text column under the float moves down by the same
      // number of lines, the smallest any of them can take, so their heads
      // stay level. A column under it with no gap, or opened by a heading
      // or a box (no after-float point), takes none, and so does the group.
      const together = members.length === under ? Math.min(...members.map(room)) : 0;
      if (together > 0) for (const m of members) take(m, together);
      // Alone: beyond that, only the lines that close the column's gap.
      for (const m of members) {
        if (m.run.remaining > 0 && m.run.remaining <= room(m)) take(m, m.run.remaining);
      }
    }
  }

  for (const run of runs) {
    const { gap, headings, linesFirst } = run;
    let remaining = run.remaining;
    if (boxOrder === 'last' && takeBoxRoom(gap, gap.gapLines - remaining)) remaining = 0;

    /** Whether this proposal offers the column a loose paragraph it has
     *  not tried yet. */
    let looseOffered = false;
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
          looseOffered = true;
        }
      }
      // Nothing left to run long (#1236): one paragraph a line short. It
      // pulls the next block's lines up from the column after, which a
      // split refused for the widow or orphan minimum may now take; the
      // driver keeps it only when the pages it re-flows end fuller. One
      // per column, and never a paragraph already run long or short.
      if (!looseOffered && options.fillShortColumns && !columnLoose.some((c) => loose.get(c.contentIndex) === -1)) {
        const budget: LooseBudget = { group: gap.pageIndex * 1024 + gap.columnIndex, need: 1 };
        const picks = columnLoose
          .filter((c) => !loose.has(c.contentIndex) && !options.failedTight?.has(c.contentIndex))
          .sort((a, b) => b.lineCount - a.lineCount || a.order - b.order);
        for (const pick of picks) {
          loose.set(pick.contentIndex, -1);
          looseBudget.set(pick.contentIndex, budget);
          changed = true;
          looseOffered = true;
        }
      }
    }

    // The headings' further lines, when the loose lever has nothing left
    // for this column: it is off, the column holds its `maxLooseParagraphs`
    // already, or every candidate is loose or has failed. Not in the
    // proposal that offers a paragraph: the pass must show what the
    // paragraphs gain first, and the next proposal sees the smaller gap.
    if (remaining > 0 && !looseOffered && linesFirst < options.maxLinesPerHeading) {
      remaining = distribute(headings, remaining, options.maxLinesPerHeading);
    }
  }
  return { lines, loose, looseBudget, changed };
}
