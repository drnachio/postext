// Floats pulled back to the page that cites them (`layout.pullFloatsToCitation`):
// the driver's rounds that set the citing page's paragraphs a line shorter
// so a float that missed that page by a few lines lands on it.
import type { VDTDocument } from '../../vdt.js';
import type { BandCap } from '../columns/bandCaps.js';
import { floatPagesOf } from './passHelpers.js';
import type { PassHints, PassResult } from './passTypes.js';

/** Passes the driver spends at most pulling floats back to their pages. */
const MAX_PULL_ROUNDS = 2;
/** The most lines the citing page's paragraphs are asked to give a float. */
const MAX_PULL_LINES = 4;

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
 *  the one at `upTo` (the citing paragraph): a line won above the citation
 *  is room after it. */
function paragraphsOnPage(doc: VDTDocument, pageIndex: number, upTo: number): number[] {
  const out = new Set<number>();
  for (const b of doc.blocks) {
    if (b.pageIndex === pageIndex && b.type === 'paragraph' && b.contentIndex !== undefined && b.contentIndex <= upTo && b.lines.length > 1) out.add(b.contentIndex);
  }
  return [...out];
}

/** The floats of `missed` that `doc` sets on their citing page. */
function floatsOnCitationPage(doc: VDTDocument, missed: readonly OffCitation[]): Set<string> {
  const pages = floatPagesOf(doc);
  return new Set(missed.filter((m) => pages.get(m.resourceId) === m.citePage).map((m) => m.resourceId));
}

/** Whether `next` sets more floats on their citing page than `best`,
 *  with no page more and no float on a later page than before. */
function pullImproves(best: VDTDocument, next: VDTDocument): boolean {
  if (next.pages.length > best.pages.length) return false;
  const before = floatPagesOf(best);
  for (const [id, page] of floatPagesOf(next)) if (page > (before.get(id) ?? Infinity)) return false;
  return floatsOffCitation(next).length < floatsOffCitation(best).length;
}

/**
 * A figure that missed the page that cites it by a few lines gets them:
 * the paragraphs of that page are set a line shorter where the word
 * spacing allows (looseness -1, no tracking), and the layout is kept only
 * where the figure then lands on that page, with no page more and no float
 * later. `kept` is told of every layout kept (the one it starts from too)
 * and how many passes it took. Returns the paragraphs set shorter, which
 * stay so under the balancing that follows ({@link pulledLooseness}).
 */
export function* pullFloatsToCitation(
  start: PassResult,
  bandCaps: ReadonlyMap<number, BandCap> | undefined,
  runPass: (hints?: PassHints) => PassResult,
  kept: (result: PassResult, passes: number) => void,
): Generator<void, Map<number, number>, void> {
  const pulled = new Map<number, number>();
  let best = start;
  kept(best, 0);
  if (!best.doc.config.layout.pullFloatsToCitation) return pulled;
  const caps = bandCaps ? { bandCaps } : {};
  for (let round = 0; round < MAX_PULL_ROUNDS; round++) {
    // Only what a few lines can win back: the shortfall the pass found.
    const reach = MAX_PULL_LINES * best.doc.baselineGrid;
    const missed = floatsOffCitation(best.doc).filter((m) => {
      const short = best.pullShortfalls?.get(m.resourceId);
      return short !== undefined && short.page === m.citePage && short.px <= reach;
    });
    if (missed.length === 0) break;
    // Every paragraph on the citing pages, at once.
    const proposal = new Map(pulled);
    const byPage = new Map<number, number[]>();
    for (const m of missed) {
      if (byPage.has(m.citePage)) continue;
      const keys = paragraphsOnPage(best.doc, m.citePage, m.citeIndex).filter((k) => !proposal.has(k));
      byPage.set(m.citePage, keys);
      for (const k of keys) proposal.set(k, -1);
    }
    if (proposal.size === pulled.size) break;
    let passes = 1;
    const trial = runPass({ ...caps, balanceLooseness: proposal, balanceUntracked: new Set(proposal.keys()) });
    yield;
    // Keep the pages whose figure came back; the others give theirs up.
    const back = floatsOnCitationPage(trial.doc, missed);
    const keep = new Map(pulled);
    for (const m of missed) if (back.has(m.resourceId)) for (const k of byPage.get(m.citePage) ?? []) keep.set(k, -1);
    if (keep.size === pulled.size) {
      kept(best, passes);
      break;
    }
    let next = trial;
    if (keep.size !== proposal.size) {
      next = runPass({ ...caps, balanceLooseness: keep, balanceUntracked: new Set(keep.keys()) });
      passes++;
      yield;
    }
    if (!pullImproves(best.doc, next.doc)) {
      kept(best, passes);
      break;
    }
    best = next;
    kept(best, passes);
    for (const [k, v] of keep) pulled.set(k, v);
  }
  return pulled;
}

/** The balancing hints' looseness with the paragraphs set shorter to pull a
 *  float back (`pulled`): they stay so, unless a balancing lever sets them
 *  otherwise, and keep their letters as set (a lever's line short may
 *  tighten them, as `fillShortColumns` does). */
export function pulledLooseness(
  pulled: ReadonlyMap<number, number>,
  loose: ReadonlyMap<number, number>,
): Pick<PassHints, 'balanceLooseness' | 'balanceUntracked'> {
  if (pulled.size === 0) return { balanceLooseness: loose };
  const untracked = [...pulled.keys()].filter((k) => !loose.has(k));
  return {
    balanceLooseness: new Map([...pulled, ...loose]),
    ...(untracked.length > 0 ? { balanceUntracked: new Set(untracked) } : {}),
  };
}
