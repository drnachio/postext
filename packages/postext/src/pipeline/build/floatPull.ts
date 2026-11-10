// Floats pulled back to the page that cites them (`layout.pullFloatsToCitation`,
// #1492): the driver's rounds that set the citing page's paragraphs a line
// tighter, then crop a picture within its safe area, so a float that missed
// that page by a few lines lands on it.
//
// Not recommended: it buys the page by force (paragraphs set tighter than
// the line breaker chose, pictures cropped) where the rule-based placement
// would move the float on. `placement.citingPage` / `layout.floatsAtCitingPage`
// and `placement.shrink: 'slot'` reach the citing page by rule.
import type { VDTDocument } from '../../vdt.js';
import type { BandCap } from '../columns/bandCaps.js';
import type { LooseBudget } from '../columns/columnBalancing.js';
import { floatPagesOf } from './passHelpers.js';
import type { PassHints, PassResult } from './passTypes.js';

/** The most lines the citing page's paragraphs are asked to give a float. */
const MAX_PULL_LINES = 4;
/** Lever groups of the pull's line budgets, apart from the balancing's
 *  (page × columns + column, never negative). */
const PULL_GROUP_BASE = -1;

interface OffCitation {
  resourceId: string;
  citePage: number;
  citeIndex: number;
  page: number;
}

/** The floats of `doc` that landed on a later page than the first line
 *  citing them. */
function floatsOffCitation(doc: VDTDocument): OffCitation[] {
  const cite = new Map<string, { page: number; index: number }>();
  for (const b of doc.blocks) {
    if (b.pageIndex === undefined) continue;
    for (const l of b.lines) for (const s of l.segments ?? []) {
      const id = s.refResourceId;
      if (id && (cite.get(id)?.page ?? Infinity) > b.pageIndex) cite.set(id, { page: b.pageIndex, index: b.contentIndex ?? -1 });
    }
  }
  const out: OffCitation[] = [];
  for (const [id, page] of floatPagesOf(doc)) {
    const c = cite.get(id);
    if (c !== undefined && page > c.page) out.push({ resourceId: id, citePage: c.page, citeIndex: c.index, page });
  }
  return out;
}

/** The content indexes of the paragraphs set on page `pageIndex`, up to
 *  the one at `upTo` (the citing paragraph), in reading order: a line won
 *  above the citation is room after it. */
function paragraphsOnPage(doc: VDTDocument, pageIndex: number, upTo: number): number[] {
  const out = new Set<number>();
  for (const b of doc.blocks) {
    if (b.pageIndex === pageIndex && b.type === 'paragraph' && b.contentIndex !== undefined && b.contentIndex <= upTo && b.lines.length > 1) out.add(b.contentIndex);
  }
  return [...out].sort((a, b) => a - b);
}

/** The floats of `ids` that `doc` sets on a later page than their citation. */
function offOf(doc: VDTDocument, ids: Iterable<string>): Set<string> {
  const want = new Set(ids);
  return new Set(floatsOffCitation(doc).filter((m) => want.has(m.resourceId)).map((m) => m.resourceId));
}

/**
 * Whether `next` may replace `best`: more floats on their citing page, no
 * page more, no float on a later page than before, the floats pulled so
 * far (`held`) still on theirs, and what the driver settled before kept as
 * the balancing keeps it: every band cap `best` delivered still delivered,
 * no float heading its citing page (#633) refused that `best` kept.
 */
function pullImproves(best: PassResult, next: PassResult, bandCaps: ReadonlyMap<number, BandCap>, held: ReadonlySet<string>): boolean {
  if (next.doc.pages.length > best.doc.pages.length) return false;
  const before = floatPagesOf(best.doc);
  for (const [id, page] of floatPagesOf(next.doc)) if (page > (before.get(id) ?? Infinity)) return false;
  for (const i of bandCaps.keys()) if (best.spanPlacedInBand.has(i) && !next.spanPlacedInBand.has(i)) return false;
  for (const id of next.citingPageRefused.keys()) if (!best.citingPageRefused.has(id)) return false;
  if (offOf(next.doc, held).size > 0) return false;
  return floatsOffCitation(next.doc).length < floatsOffCitation(best.doc).length;
}

/** What the pull settled: the layout it kept and the passes it took, and
 *  the hints every later pass carries so the pulled floats stay. */
export interface PullOutcome {
  result: PassResult;
  passes: number;
  /** Paragraphs set a line tighter, by content index (looseness -1). */
  tightened: Map<number, number>;
  /** Pictures the pass may crop to stay on their citing page. */
  crop: Set<string>;
  /** The floats brought back to their citing page. */
  pulled: Set<string>;
}

/**
 * A float that missed the page citing it by at most a few lines gets them
 * back, in two steps, each kept only when {@link pullImproves} says so:
 *
 * 1. Tighter paragraphs: the paragraphs of the citing page above the
 *    citation are offered a line shorter (looseness -1, no tracking) with a
 *    budget of the lines the float lacks (`balanceLooseBudget`), so the
 *    pass stops tightening once that many were won. Only the paragraphs
 *    that gave a line, on the pages whose float came back, are kept.
 * 2. A crop: a picture with a safe area still off its page may be cropped
 *    within it (`PassHints.pullCrop`), no more than the slot needs. Each
 *    crop is reported (`floatCropped`).
 *
 * `start` is the layout after the band caps; `bandCaps` ride along.
 */
export function* pullFloatsToCitation(
  start: PassResult,
  bandCaps: ReadonlyMap<number, BandCap>,
  runPass: (hints?: PassHints) => PassResult,
): Generator<void, PullOutcome, void> {
  const outcome: PullOutcome = { result: start, passes: 0, tightened: new Map(), crop: new Set(), pulled: new Set() };
  if (!start.doc.config.layout.pullFloatsToCitation) return outcome;
  const grid = start.doc.baselineGrid;
  const hintsOf = (tightened: ReadonlyMap<number, number>, crop: ReadonlySet<string>, budget?: ReadonlyMap<number, LooseBudget>): PassHints => ({
    bandCaps,
    ...(tightened.size > 0 ? { balanceLooseness: tightened, balanceUntracked: new Set(tightened.keys()) } : {}),
    ...(budget && budget.size > 0 ? { balanceLooseBudget: budget } : {}),
    ...(crop.size > 0 ? { pullCrop: crop } : {}),
  });
  /** The floats of `best` off their citing page by a shortfall the pull
   *  may win back. */
  const reachable = (best: PassResult): OffCitation[] => floatsOffCitation(best.doc).filter((m) => {
    const short = best.pullShortfalls?.get(m.resourceId);
    return short !== undefined && short.page === m.citePage && short.px <= MAX_PULL_LINES * grid;
  });
  const keep = (next: PassResult, back: Iterable<string>): void => {
    outcome.result = next;
    for (const id of back) outcome.pulled.add(id);
  };

  // 1. Tighter paragraphs, a budget of lines per citing page.
  const missed = reachable(outcome.result);
  if (missed.length > 0) {
    const proposal = new Map<number, number>();
    const budget = new Map<number, LooseBudget>();
    const byPage = new Map<number, number[]>();
    for (const m of missed) {
      const need = Math.max(1, Math.ceil((outcome.result.pullShortfalls!.get(m.resourceId)!.px - 0.5) / grid));
      const group = PULL_GROUP_BASE - m.citePage;
      const known = byPage.get(m.citePage);
      if (known) {
        // Two floats short on one page: the larger need.
        for (const k of known) budget.set(k, { group, need: Math.max(need, budget.get(k)!.need) });
        continue;
      }
      const keys = paragraphsOnPage(outcome.result.doc, m.citePage, m.citeIndex);
      byPage.set(m.citePage, keys);
      for (const k of keys) { proposal.set(k, -1); budget.set(k, { group, need }); }
    }
    if (proposal.size > 0) {
      const trial = runPass(hintsOf(proposal, outcome.crop, budget));
      outcome.passes++;
      yield;
      // The paragraphs that gave their line, on the pages whose float came
      // back; the others are set as they were.
      const off = offOf(trial.doc, missed.map((m) => m.resourceId));
      const backPages = new Set(missed.filter((m) => !off.has(m.resourceId)).map((m) => m.citePage));
      const kept = new Map<number, number>();
      for (const p of backPages) for (const k of byPage.get(p) ?? []) if (typeof trial.looseOutcome.get(k) === 'number') kept.set(k, -1);
      if (kept.size > 0) {
        // The trial with no budget and only the kept paragraphs: the layout
        // every later pass reproduces.
        const next = runPass(hintsOf(kept, outcome.crop));
        outcome.passes++;
        yield;
        if (pullImproves(outcome.result, next, bandCaps, outcome.pulled)) {
          keep(next, missed.filter((m) => backPages.has(m.citePage)).map((m) => m.resourceId));
          for (const [k, v] of kept) outcome.tightened.set(k, v);
        }
      }
    }
  }

  // 2. A crop within the safe area for the pictures still off their page.
  const still = reachable(outcome.result).map((m) => m.resourceId).filter((id) => !outcome.crop.has(id));
  if (still.length > 0) {
    const crop = new Set([...outcome.crop, ...still]);
    const next = runPass(hintsOf(outcome.tightened, crop));
    outcome.passes++;
    yield;
    const off = offOf(next.doc, still);
    const back = still.filter((id) => !off.has(id));
    if (back.length > 0 && pullImproves(outcome.result, next, bandCaps, outcome.pulled)) {
      keep(next, back);
      for (const id of back) outcome.crop.add(id);
    }
  }
  return outcome;
}

/** The hints of a balancing pass with what the pull settled: the
 *  paragraphs it set tighter stay so unless a balancing lever sets them
 *  otherwise (a lever's own looseness wins), with their letters as set; the
 *  pictures it cropped may be cropped again. */
export function withPull(
  pull: PullOutcome,
  loose: ReadonlyMap<number, number>,
): Pick<PassHints, 'balanceLooseness' | 'balanceUntracked' | 'pullCrop'> {
  const crop = pull.crop.size > 0 ? { pullCrop: pull.crop } : {};
  if (pull.tightened.size === 0) return { balanceLooseness: loose, ...crop };
  const untracked = [...pull.tightened.keys()].filter((k) => !loose.has(k));
  return {
    balanceLooseness: new Map([...pull.tightened, ...loose]),
    ...(untracked.length > 0 ? { balanceUntracked: new Set(untracked) } : {}),
    ...crop,
  };
}

/** Whether `doc` still sets every float the pull brought back on its
 *  citing page, among those cited on a page `inScope` accepts: a balancing
 *  or trailing-cap pass that sends one on is not kept. */
export function pullHeld(pull: PullOutcome, doc: VDTDocument, inScope: (citePage: number) => boolean = () => true): boolean {
  if (pull.pulled.size === 0) return true;
  return !floatsOffCitation(doc).some((m) => pull.pulled.has(m.resourceId) && inScope(m.citePage));
}
