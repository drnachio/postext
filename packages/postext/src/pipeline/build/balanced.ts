// Column balancing: the passes that level the closing bands of a chapter
// with the balancing levers, in editorial order (#1276: split out of
// build.ts).
import type { PostextContent, PostextConfig } from '../../types.js';
import type { VDTDocument, VDTBlock, VDTGridBalancing, BalanceLever } from '../../vdt.js';
import type { MeasurementCache } from '../../measure/index.js';
import { type PageRange, collectColumnGaps, pageSegments, gapLinesIn, boxRoomIn, type LooseBudget, type ColumnGap, candidateKey, firstDivergentColumn, MAX_BALANCING_PASSES_PER_DOCUMENT, proposeBalanceLines, boxLeverKeys, MAX_BALANCING_PASSES, GRID_LINE_LEVERS } from '../columns/columnBalancing.js';
import { resolveBandCapsGen, resolveTrailingCapsGen } from '../columns/bandCaps.js';
import { type CitingPageState, now, MAX_CITING_PAGE_ROUNDS } from './drivers.js';
import { buildDocumentPass } from './pass.js';
import { floatPagesOf } from './passHelpers.js';
import { type BuildDocumentOptions, type PassHints, type PassResult, BOX_ROOM_EPS_PX } from './passTypes.js';
import { unplacedByDoc, SPLICED_WARNING_MAPS } from './warnings.js';

export function* buildDocumentBalanced(
  content: PostextContent,
  config?: PostextConfig,
  cache?: MeasurementCache,
  options?: BuildDocumentOptions,
  tocRound = 0,
  footnoteNumbers?: ReadonlyMap<string, string>,
  /** Floats heading their citing page settled by an earlier round of the
   *  same build (#633): seeds the hints and the refusals. */
  citing: CitingPageState = { hints: new Map(), refused: new Set() },
): Generator<void, VDTDocument, void> {
  // Each pass reports its own progress, numbered in build order.
  let passIndex = 0;
  const onProgress = options?.onProgress;
  const onPass = options?.onPass;
  const passOptions: BuildDocumentOptions | undefined = onProgress
    ? { ...options, onProgress: (p) => onProgress({ ...p, pass: passIndex }) }
    : options;
  // Side captions moved under their figure (see `PassHints.captionUnder`):
  // once a pass asks for one, every later pass keeps it.
  const captionUnder = new Set<string>();
  // Loose paragraphs any pass found would gain their line only off the
  // character grid (#632): the columns they leave short say so.
  const looseOffGrid = new Set<number>();
  // Floats heading the page or column that cites them (#633,
  // `PassHints.citingPageFloats`): once a pass keeps one there, every later
  // pass opens that page with it; a float refused once (its citing line
  // left the page, or it could not be set there) is never proposed again.
  const citingPage = citing.hints;
  const citingRefused = citing.refused;
  const runPass = (hints?: PassHints): PassResult => {
    passIndex++;
    const started = onPass ? now() : 0;
    const result = buildDocumentPass(content, config, cache, passOptions, {
      ...hints,
      captionUnder,
      ...(footnoteNumbers ? { footnoteNumbers } : {}),
      ...(citingPage.size > 0 ? { citingPageFloats: new Map(citingPage) } : {}),
    });
    for (const id of result.captionUnderProposals) captionUnder.add(id);
    for (const k of result.looseOffGrid) looseOffGrid.add(k);
    onPass?.({ pass: passIndex, tocRound, ms: now() - started, pages: result.doc.pages.length });
    return result;
  };
  // The first pass is a pass too: let a cancel land before the caps run.
  let initial = runPass();
  yield;
  // A side box or side float spilled over a figure's side caption: place
  // again with that caption under the figure (a moved caption can free or
  // crowd another side column, hence the short loop).
  for (let round = 0; round < 3 && initial.captionUnderProposals.size > 0; round++) {
    const before = captionUnder.size;
    initial = runPass();
    yield;
    if (captionUnder.size === before) break;
  }

  // --- Floats at the head of their citing page (#633) --------------------
  // A float that may head the page (column) its citing line lands on and
  // went on to a later one is proposed there; the next pass opens that
  // page with it. A pass that could not keep one there (the text it pushed
  // down took the citing line to the next page) drops it for good. A few
  // rounds at most, as the side captions get; then any hint still refused
  // is dropped, each pass with fewer, until every one left holds.
  /** Drop the hints `r` could not keep; whether there were any. */
  const dropRefusedCiting = (r: PassResult): boolean => {
    let dropped = false;
    for (const id of r.citingPageRefused.keys()) {
      citingRefused.add(id);
      if (citingPage.delete(id)) dropped = true;
    }
    return dropped;
  };
  for (let round = 0; round < MAX_CITING_PAGE_ROUNDS; round++) {
    let changed = dropRefusedCiting(initial);
    for (const [id, slot] of initial.citingPageProposals) {
      if (citingRefused.has(id) || citingPage.has(id)) continue;
      citingPage.set(id, slot);
      changed = true;
    }
    if (!changed) break;
    initial = runPass();
    yield;
  }
  while (dropRefusedCiting(initial)) {
    initial = runPass();
    yield;
  }

  // --- Band caps (page-span blocks mid-page) -----------------------------
  // A span block that arrived in an uneven band proposes a cap; the driver
  // re-places the document with it (and grows / drops caps whose band
  // overflowed) before balancing runs. Documents without such blocks get
  // their first pass back untouched — no extra pass.
  let bands = yield* resolveBandCapsGen(initial, (bandCaps) => runPass({ bandCaps }));
  // A cap that took a citing line off the page its float heads: drop that
  // float's hint and settle the caps again without it.
  while (dropRefusedCiting(bands.result)) {
    initial = runPass();
    yield;
    const passes = bands.passCount;
    bands = yield* resolveBandCapsGen(initial, (bandCaps) => runPass({ bandCaps }));
    bands = { ...bands, passCount: bands.passCount + passes + 1 };
  }
  let best = bands.result;
  const bandCaps = bands.bandCaps;
  let passCount = bands.passCount;
  best.doc.iterationCount = passCount;

  // --- Column balancing (vertical justification) ------------------------
  // Iteratively re-place the document with extra grid lines above headings
  // (and the other levers) until every balanceable column ends flush with
  // the page bottom, or no further adjustment is possible. Each retry
  // recomputes the remaining gaps on the freshly placed document, so
  // split / keep-with-next decisions that shift under the new spacing are
  // accounted for. The best layout (fewest leftover gap lines) always wins
  // — a retry that regresses is discarded.
  //
  // The pages between explicit breaks (chapter openers, `:::pagebreak`)
  // are laid out independently of one another — nothing flows across such
  // a break, so a lever inside one run of pages cannot move a line of any
  // other. The loop therefore judges every run (a *segment*, see
  // `pageSegments`) on its own: a pass places the whole document, but each
  // segment keeps or rejects its share of the levers by its own score,
  // blacklists its own cascades, plateaus on its own and spends its own
  // budget of attempts; a rejected segment gets its pages back from the
  // best pass it had (`spliceSegments`). A book of thirty chapters thus
  // balances exactly as its chapters would one by one, instead of one
  // cascade anywhere costing every page of the book a pass.
  const balancing = best.doc.config.headings.balancing;
  const onGrid = best.doc.config.cjk.grid.enabled;
  // Why the columns of a page on a character grid may end short (#632):
  // balancing off by the grid's default (vertical text has it off by its
  // own), or its whole-line levers kept out.
  const gridBalancing = onGrid
    ? (!balancing.enabled
      ? (config?.headings?.balancing?.enabled === undefined && best.doc.config.layout.writingMode !== 'vertical-rl' ? { off: true as const } : undefined)
      : (balancing.gridLines === 'off' ? { gridLines: 'off' as const } : undefined))
    : undefined;
  if (!balancing.enabled) {
    if (gridBalancing) best.doc.gridBalancing = gridBalancing;
    return best.doc;
  }

  interface Segment {
    range: PageRange;
    /** Fewest empty grid lines seen over its columns. */
    bestScore: number;
    /** Passes in which the segment tried new levers. */
    attempts: number;
    /** Nothing more to do: flush, out of levers, plateaued or out of attempts. */
    done: boolean;
    /** Flush, or no lever left to propose (the loop's notion of converged). */
    stable: boolean;
    failedLoose: Set<number>;
    failedLines: Set<number>;
    /** Paragraphs set a line short (`fillShortColumns`, #1236) that lost
     *  no line or bought nothing. */
    failedTight: Set<number>;
  }

  /** Levers accepted so far, over every segment (keyed by content index /
   *  `balanceKey`; each key belongs to exactly one segment). */
  const applied = { lines: new Map<number, number>(), loose: new Map<number, number>() };
  let segments: Segment[] = [];
  /** (Re)derive the segments of the current best layout, keeping the
   *  attempts and blacklists of the segment at the same position. */
  const resetSegments = (): void => {
    const gaps = collectColumnGaps(best.doc, best.forcedBreakPages);
    const prev = segments;
    segments = pageSegments(best.doc.pages.length, best.forcedBreakPages).map((range, i) => {
      const score = gapLinesIn(gaps, range);
      const old = prev[i];
      return {
        range,
        bestScore: score,
        attempts: old?.attempts ?? 0,
        done: score === 0 && boxRoomIn(gaps, range) <= BOX_ROOM_EPS_PX,
        stable: score === 0,
        failedLoose: old?.failedLoose ?? new Set<number>(),
        failedLines: old?.failedLines ?? new Set<number>(),
        failedTight: old?.failedTight ?? new Set<number>(),
      };
    });
  };

  const hintsFrom = (
    lines: ReadonlyMap<number, number>,
    loose: ReadonlyMap<number, number>,
    looseBudget?: ReadonlyMap<number, LooseBudget>,
  ): PassHints => {
    const extraPx = new Map<number, number>();
    for (const [idx, n] of lines) if (n > 0) extraPx.set(idx, n * best.doc.baselineGrid);
    return {
      balanceExtraPx: extraPx,
      balanceLooseness: loose,
      ...(looseBudget ? { balanceLooseBudget: looseBudget } : {}),
      bandCaps,
    };
  };

  const segmentAt = (pageIndex: number): number =>
    segments.findIndex((s) => pageIndex >= s.range.from && pageIndex <= s.range.to);
  /** Segment owning each lever key of the current best layout. */
  const keyOwners = (gaps: readonly ColumnGap[]): Map<number, number> => {
    const owner = new Map<number, number>();
    for (const g of gaps) {
      const si = segmentAt(g.pageIndex);
      if (si < 0) continue;
      for (const c of g.candidates) owner.set(candidateKey(c), si);
    }
    return owner;
  };
  /** Whether two block lists set the same content: every content index
   *  that one places, the other places too (in however many pieces). */
  const sameContent = (a: readonly VDTBlock[], b: readonly VDTBlock[]): boolean => {
    const set = (list: readonly VDTBlock[]): Set<number> => {
      const out = new Set<number>();
      for (const blk of list) if (blk.contentIndex !== undefined) out.add(blk.contentIndex);
      return out;
    };
    const sa = set(a);
    const sb = set(b);
    if (sa.size !== sb.size) return false;
    for (const k of sa) if (!sb.has(k)) return false;
    return true;
  };
  /** First page each content index was placed on. */
  const pageOfContent = (doc: VDTDocument): Map<number, number> => {
    const m = new Map<number, number>();
    for (const b of doc.blocks) {
      if (b.contentIndex !== undefined && b.pageIndex !== undefined && !m.has(b.contentIndex)) m.set(b.contentIndex, b.pageIndex);
    }
    return m;
  };
  const inRange = (r: PageRange, p: number | undefined): boolean => p !== undefined && p >= r.from && p <= r.to;

  /** Whether the explicit breaks before / around a segment fell on the same
   *  pages in `next` as in the best layout — the segment's pages then line
   *  up and can be compared or spliced. `before` checks only the pages
   *  ahead of it (an earlier segment's cascade shifts everything after). */
  const breaksMatch = (next: PassResult, upTo: number): boolean => {
    for (let p = 0; p < upTo; p++) {
      if (best.forcedBreakPages.has(p) !== next.forcedBreakPages.has(p)) return false;
    }
    return true;
  };
  const startIntact = (next: PassResult, s: Segment): boolean => breaksMatch(next, s.range.from);
  const wholeIntact = (next: PassResult, s: Segment, last: boolean): boolean => {
    if (!breaksMatch(next, s.range.to + 1)) return false;
    if (next.doc.pages.length <= s.range.to) return false;
    return !last || next.doc.pages.length === best.doc.pages.length;
  };

  /**
   * The best layout with the pages of `ranges` taken from `next` (whose
   * breaks line up with it there): pages, the blocks and warnings on them,
   * and the pass report entries whose block sits on them.
   */
  const spliceSegments = (next: PassResult, ranges: readonly PageRange[]): PassResult => {
    const taken = (p: number | undefined): boolean => ranges.some((r) => inRange(r, p));
    const pages = best.doc.pages.map((pg, i) => (taken(i) ? next.doc.pages[i]! : pg));
    const blocks = [
      ...best.doc.blocks.filter((b) => !taken(b.pageIndex)),
      ...next.doc.blocks.filter((b) => taken(b.pageIndex)),
    ].sort((a, b) => (a.pageIndex ?? -1) - (b.pageIndex ?? -1));
    const warnings = [
      ...(best.doc.warnings ?? []).filter((w) => !taken(w.pageIndex)),
      ...(next.doc.warnings ?? []).filter((w) => taken(w.pageIndex)),
    ].sort((a, b) => (a.pageIndex ?? -1) - (b.pageIndex ?? -1));
    // Everything the layout sets must survive the splice: a float or box
    // that moved to a page outside the ranges in `next` (one drained before
    // a chapter's end) would otherwise drop out of both halves (#515).
    // Such a splice is not taken.
    if (!sameContent(blocks, next.doc.blocks)) return best;
    const doc: VDTDocument = { ...best.doc, pages, blocks, ...(warnings.length > 0 ? { warnings } : { warnings: undefined }) };
    // It holds what `next` holds: what `next` placed nowhere is still
    // missing from it (#639).
    const unplaced = unplacedByDoc.get(next.doc);
    if (unplaced) unplacedByDoc.set(doc, unplaced);
    // The other per-document warnings follow their pages as `warnings` do;
    // one with no page is the pass's, as `unplaced` is (#1203).
    for (const map of SPLICED_WARNING_MAPS) {
      const merged = [
        ...(map.get(best.doc) ?? []).filter((w) => w.pageIndex !== undefined && !taken(w.pageIndex)),
        ...(map.get(next.doc) ?? []).filter((w) => w.pageIndex === undefined || taken(w.pageIndex)),
      ];
      if (merged.length > 0) map.set(doc, merged);
    }
    const pageBest = pageOfContent(best.doc);
    const pageNext = pageOfContent(next.doc);
    const mergeMap = <V,>(a: ReadonlyMap<number, V>, b: ReadonlyMap<number, V>): Map<number, V> => {
      const out = new Map<number, V>();
      for (const [k, v] of a) if (!taken(pageBest.get(k))) out.set(k, v);
      for (const [k, v] of b) if (taken(pageNext.get(k))) out.set(k, v);
      return out;
    };
    const mergeSet = (a: ReadonlySet<number>, b: ReadonlySet<number>): Set<number> => {
      const out = new Set<number>();
      for (const k of a) if (!taken(pageBest.get(k))) out.add(k);
      for (const k of b) if (taken(pageNext.get(k))) out.add(k);
      return out;
    };
    return {
      doc,
      forcedBreakPages: best.forcedBreakPages,
      bandCapProposals: mergeMap(best.bandCapProposals, next.bandCapProposals),
      spanPlacedInBand: mergeSet(best.spanPlacedInBand, next.spanPlacedInBand),
      bandCapsApplied: mergeSet(best.bandCapsApplied, next.bandCapsApplied),
      looseOutcome: mergeMap(best.looseOutcome, next.looseOutcome),
      looseOffGrid: new Set([...best.looseOffGrid, ...next.looseOffGrid]),
      captionUnderProposals: new Set([...best.captionUnderProposals, ...next.captionUnderProposals]),
      citingPageProposals: best.citingPageProposals,
      citingPageRefused: best.citingPageRefused,
    };
  };

  /**
   * A rejected segment moved content across a column break somewhere in
   * its pages (a split paragraph whose head no longer fits, a float that
   * lost its slot, a lead-in that left with its list…): the pages after
   * that point re-flow, gaps open elsewhere and a span cap may miss its
   * band. The levers are meant to be local, so contain the damage: find
   * the first column of the segment whose content changed and blacklist
   * the levers this pass newly applied there (failing that, on its page;
   * failing that, in the whole segment), so the next proposal keeps the
   * working levers before it and tries again without the one that
   * cascaded. Returns whether anything was blacklisted.
   */
  const containCascade = (
    next: PassResult,
    s: Segment,
    newLines: readonly number[],
    newLoose: readonly number[],
    gaps: readonly ColumnGap[],
  ): boolean => {
    const div = firstDivergentColumn(best.doc, next.doc, s.range);
    if (!div) return false;
    if (newLines.length === 0 && newLoose.length === 0) return false;
    // Where the headings hold lines back for the loose paragraphs (#707),
    // a pass that tried both in the columns at fault blames the paragraphs
    // first: run a line long, they are what moves text across a column
    // break, and a heading blacklisted with them could never take the lines
    // it took alone up to 1.27. The spacing levers are tried again without
    // them, and blacklisted in their turn if the cascade is theirs.
    const looseFirst = balancing.maxLinesBeforeLoose < balancing.maxLinesPerHeading;
    const blacklist = (cands: ReadonlySet<number> | null): boolean => {
      let hit = false;
      for (const k of newLoose) if (!cands || cands.has(k)) { failLoose(s, k); hit = true; }
      if (hit && looseFirst) return true;
      for (const k of newLines) if (!cands || cands.has(k)) { s.failedLines.add(k); hit = true; }
      return hit;
    };
    const keysOf = (pick: (g: ColumnGap) => boolean): Set<number> =>
      new Set(gaps.filter(pick).flatMap((g) => g.candidates.map((c) => candidateKey(c))));
    if (blacklist(keysOf((g) => g.pageIndex === div.pageIndex && g.columnIndex === div.columnIndex))) return true;
    if (blacklist(keysOf((g) => g.pageIndex === div.pageIndex))) return true;
    return blacklist(null);
  };

  /** The paragraphs the current proposal sets a line short (#1236): their
   *  failures go to the segment's `failedTight`, the others' to
   *  `failedLoose`. */
  let tightKeys: ReadonlySet<number> = new Set<number>();
  const failLoose = (s: Segment, k: number): void => {
    (tightKeys.has(k) ? s.failedTight : s.failedLoose).add(k);
  };

  let balancingPasses = 0;
  function* balance(): Generator<void, void, void> {
    while (balancingPasses < MAX_BALANCING_PASSES_PER_DOCUMENT) {
      const active = segments.filter((s) => !s.done);
      if (active.length === 0) break;
      const gaps = collectColumnGaps(best.doc, best.forcedBreakPages);
      const owner = keyOwners(gaps);
      const failedLoose = new Set<number>();
      const failedLines = new Set<number>();
      const failedTight = new Set<number>();
      for (const s of segments) {
        for (const k of s.failedLoose) failedLoose.add(k);
        for (const k of s.failedLines) failedLines.add(k);
        for (const k of s.failedTight) failedTight.add(k);
      }
      const proposal = proposeBalanceLines(best.doc, best.forcedBreakPages, applied, {
        maxLinesPerHeading: balancing.maxLinesPerHeading,
        maxLinesBeforeLoose: balancing.maxLinesBeforeLoose,
        stretchAfterLists: balancing.stretchAfterLists,
        maxLinesAfterList: balancing.maxLinesAfterList,
        stretchAfterDisplays: balancing.stretchAfterDisplays,
        stretchAfterFloats: balancing.stretchAfterFloats,
        maxLinesAfterFloat: balancing.maxLinesAfterFloat,
        stretchAfterWideFloats: balancing.stretchAfterWideFloats,
        looseParagraphs: balancing.looseParagraphs,
        maxLooseParagraphs: balancing.maxLooseParagraphs,
        optimalLineBreaking: best.doc.config.bodyText.optimalLineBreaking,
        failedLoose,
        failedLines,
        ...(balancing.fillShortColumns ? { fillShortColumns: true, failedTight } : {}),
        closingBox: balancing.closingBox,
        ...(onGrid && balancing.gridLines === 'off' ? { gridLines: false } : {}),
      });
      // The levers newly proposed, by segment; those of a segment that is
      // done (plateaued, out of attempts) are withdrawn from the pass.
      const newLines: number[] = [];
      const newLoose: number[] = [];
      for (const [k, n] of proposal.lines) {
        const cur = applied.lines.get(k) ?? 0;
        if (n <= cur) continue;
        const si = owner.get(k);
        if (si === undefined || segments[si]!.done) {
          if (cur > 0) proposal.lines.set(k, cur);
          else proposal.lines.delete(k);
          continue;
        }
        newLines.push(k);
      }
      for (const k of [...proposal.loose.keys()]) {
        if (applied.loose.has(k)) continue;
        const si = owner.get(k);
        if (si === undefined || segments[si]!.done) {
          proposal.loose.delete(k);
          proposal.looseBudget.delete(k);
          continue;
        }
        newLoose.push(k);
      }
      tightKeys = new Set(newLoose.filter((k) => proposal.loose.get(k)! < 0));
      const trying = new Set<number>([...newLines, ...newLoose].map((k) => owner.get(k)!));
      if (trying.size === 0) {
        // No stretch point can absorb the remaining gaps — stable.
        for (const s of active) { s.done = true; s.stable = true; }
        break;
      }
      for (const si of trying) segments[si]!.attempts++;
      const next = runPass(hintsFrom(proposal.lines, proposal.loose, proposal.looseBudget));
      passCount++;
      balancingPasses++;
      yield;
      const nextGaps = collectColumnGaps(next.doc, next.forcedBreakPages);
      const capPage = pageOfContent(best.doc);
      const accepted: PageRange[] = [];
      const boxKeys = boxLeverKeys(gaps);
      for (const si of trying) {
        const s = segments[si]!;
        // An earlier segment's cascade shifted this one's pages: the pass
        // says nothing about its levers. They are offered again once the
        // culprit is blacklisted.
        if (!startIntact(next, s)) { s.attempts--; continue; }
        const keysLines = newLines.filter((k) => owner.get(k) === si);
        const keysLoose = newLoose.filter((k) => owner.get(k) === si);
        // Band caps ride along unchanged; a retry that unsettles one of the
        // segment's (its span block no longer lands in the capped band, or
        // a levelled closing band spills past its cut) is a regression —
        // capped columns without their box are not a layout we may keep.
        const capsDelivered = [...bandCaps.keys()].every((i) => !inRange(s.range, capPage.get(i)) || next.spanPlacedInBand.has(i));
        // So is one that loses a float heading its citing page (#633): the
        // levers pushed its citing line off it.
        const citingKept = ![...next.citingPageRefused.keys()].some((id) => inRange(s.range, citingPage.get(id)?.pageIndex));
        const score = capsDelivered && citingKept && wholeIntact(next, s, si === segments.length - 1)
          ? gapLinesIn(nextGaps, s.range)
          : Infinity;
        // Loose paragraphs that gained no line at any tracking rung are
        // blacklisted whatever the score did, and never counted as applied.
        // Candidates the pass never tried (their column's budget was met
        // first) stay eligible for a later proposal.
        const looseFailed = keysLoose.filter((k) => next.looseOutcome.get(k) === null);
        for (const k of looseFailed) failLoose(s, k);
        const looseWon = keysLoose.filter((k) => typeof next.looseOutcome.get(k) === 'number');
        // A box closing its column that moves down onto the column's last
        // grid slot (or level with the column beside it) closes less than a
        // line, which the score does not count. On its own — no other new
        // lever in the segment — such a pass is kept when it holds the
        // score, moves nothing across a column and closes room under a box
        // (EF-70).
        const boxesOnly = keysLines.length > 0 && keysLoose.length === 0 && keysLines.every((k) => boxKeys.has(k));
        if (score < s.bestScore) {
          for (const k of keysLines) applied.lines.set(k, proposal.lines.get(k)!);
          for (const k of looseWon) applied.loose.set(k, proposal.loose.get(k)!);
          s.bestScore = score;
          if (score === 0) { s.done = true; s.stable = true; }
          accepted.push(s.range);
        } else if (
          boxesOnly && score === s.bestScore
          && firstDivergentColumn(best.doc, next.doc, s.range) === null
          && boxRoomIn(nextGaps, s.range) < boxRoomIn(gaps, s.range) - BOX_ROOM_EPS_PX
        ) {
          for (const k of keysLines) applied.lines.set(k, proposal.lines.get(k)!);
          accepted.push(s.range);
        } else if (!containCascade(next, s, keysLines, keysLoose, gaps)) {
          // Plateau or regression without a cascade to contain: retry when
          // a loose candidate was just blacklisted (the proposer falls
          // through to the next one), or when the new loose paragraphs
          // gained their lines yet the segment did not improve (the gain
          // landed elsewhere — drop them too). A pure spacing plateau means
          // the segment is done: it keeps the best layout found so far —
          // unless a closing box rode along with the levers that bought
          // nothing: those are dropped and the box is tried on its own.
          const boxes = keysLines.filter((k) => boxKeys.has(k));
          if (boxes.length > 0 && !boxesOnly) {
            for (const k of keysLines) if (!boxKeys.has(k)) s.failedLines.add(k);
            for (const k of keysLoose) failLoose(s, k);
          } else if (looseFailed.length > 0 || looseWon.length > 0) {
            for (const k of looseWon) failLoose(s, k);
          } else {
            s.done = true;
          }
        }
        if (!s.done && s.attempts >= MAX_BALANCING_PASSES) s.done = true;
      }
      if (accepted.length > 0) best = spliceSegments(next, accepted);
    }
  }

  resetSegments();
  yield* balance();

  // --- Trailing bands (closing columns cut level) -------------------------
  // Once the balancing levers have settled the earlier pages, level the
  // closing band of every chapter / the document with a trailing cap. It is
  // resolved AFTER balancing because a cap is keyed by the block that opens
  // its band, and that block moves whenever an earlier page absorbs extra
  // lines; with the balancing hints frozen the band opens with the same
  // block and the cap applies. A short polish round then lets the levers
  // fill what the cut left short (a column ending a line under the cap).
  if (balancing.trailing) {
    const frozen = hintsFrom(applied.lines, applied.loose);
    const trailing = yield* resolveTrailingCapsGen(
      best,
      bandCaps,
      (caps) => runPass({ ...frozen, bandCaps: caps, floatPages: floatPagesOf(best.doc) }),
    );
    passCount += trailing.passCount;
    // A cap that takes a citing line off the page its float heads (#633)
    // is not kept.
    if (trailing.result !== best && trailing.result.citingPageRefused.size === 0) {
      best = trailing.result;
      for (const [i, cap] of trailing.caps) bandCaps.set(i, cap);
      // The capped layout is a new problem: the polish round gets its own
      // pass budget and fresh segments — the first round may have spent
      // every attempt, or blacklisted the very lever (a heading, a formula)
      // that now fills the line the cut left short.
      balancingPasses = 0;
      segments = [];
      resetSegments();
      yield* balance();
    }
  }

  best.doc.iterationCount = passCount;
  best.doc.converged = segments.every((s) => s.stable || s.bestScore === 0);
  if (onGrid) markGridRefusals(best.doc, best.forcedBreakPages, looseOffGrid, gridBalancing);
  return best.doc;
}

/**
 * Column balancing on a character grid (#632): stamp the document with why
 * its balancing is limited (`VDTDocument.gridBalancing`) and every column
 * still short with the levers the grid kept from it
 * (`VDTColumn.gridRefused`): the loose paragraphs that would have gained
 * their line off the grid (`offGrid`), and the whole-line levers under
 * `headings.balancing.gridLines: 'off'`.
 */
function markGridRefusals(
  doc: VDTDocument,
  forcedBreakPages: ReadonlySet<number>,
  offGrid: ReadonlySet<number>,
  gridBalancing: VDTGridBalancing | undefined,
): void {
  if (gridBalancing) doc.gridBalancing = gridBalancing;
  const noLines = gridBalancing?.gridLines === 'off';
  for (const gap of collectColumnGaps(doc, forcedBreakPages)) {
    if (gap.gapLines < 1) continue;
    const refused = new Set<BalanceLever>();
    for (const c of gap.candidates) {
      if (noLines && GRID_LINE_LEVERS.includes(c.kind)) refused.add(c.kind);
      else if (c.kind === 'looseParagraph' && offGrid.has(c.contentIndex)) refused.add(c.kind);
    }
    if (refused.size === 0) continue;
    const col = doc.pages[gap.pageIndex]?.columns[gap.columnIndex];
    if (col) col.gridRefused = BALANCE_LEVER_ORDER.filter((l) => refused.has(l));
  }
}

/** The balancing levers in the order `BalanceLever` lists them. */
const BALANCE_LEVER_ORDER: readonly BalanceLever[] = ['trailingCallout', 'flexFigure', 'heading', 'listEnd', 'afterDisplay', 'afterFloat', 'looseParagraph'];
