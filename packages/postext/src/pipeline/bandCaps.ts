/**
 * Band caps — page-span blocks, stage 2 (mid-page bands).
 *
 * Stage 1 (`placement.ts`) only inserts a page-span block where the current
 * column band is *level*; a block arriving with the columns uneven moves to
 * the top of the next page. Stage 2 lets it land mid-page the way a
 * compositor would set it: the text above the box is cut level across all
 * columns, the box spans the page, and the columns resume below it.
 *
 * Rather than redistributing already-placed blocks in place (which would
 * bypass orphan / widow / keep-with-next), the engine re-runs the placement
 * pass with a **band cap**: the columns of the band that opens with a given
 * content block are shortened to `lines` grid lines, so they fill and
 * overflow into each other naturally — every placement rule keeps applying
 * — and end level at `bandTop + lines·grid`, where the span block then cuts
 * the band. A cap is proposed by the pass that saw the block arrive in an
 * uneven band with room below (`lines = ceil(Σ used px / N / grid)`), and
 * consumed by the next pass. When the capped band overflows differently
 * (e.g. keep-with-next moved a heading and the text no longer fits above
 * the cut), the cap is retried one line taller a bounded number of times,
 * then dropped — the block falls back to stage 1.
 */

import type { VDTColumn } from '../vdt';

/** Cap on the band that opens with content block `startContentIndex`
 *  (part `startPart` — a split paragraph's continuation can open a band
 *  too), keyed in `bandCaps` by the span block's own content index. */
export interface BandCap {
  /** `'span'`: proposed by a page-span block that wants to cut the band
   *  mid-page (the box then sits on the cut). `'trailing'`: proposed at a
   *  chapter / document boundary to level the closing band's columns; the
   *  band ends inside the cap and nothing cuts it. */
  kind: 'span' | 'trailing';
  startContentIndex: number;
  /** Part index of the band's opening block (`0` unless it is the
   *  continuation of a paragraph split across columns / pages). */
  startPart: number;
  /** Height of the capped band in baseline-grid lines. */
  lines: number;
  /** Times the cap has been grown by one line after an overflow. */
  retries: number;
}

/** Maximum number of extra placement passes the band-cap driver may run on
 *  top of the initial pass (proposals + retries). */
export const MAX_BAND_PASSES = 4;

/** Maximum number of `lines + 1` retries for a cap whose band overflowed. */
export const MAX_BAND_CAP_RETRIES = 3;

/** What a placement pass reports back to the band-cap driver. */
export interface BandPassReport {
  /** New caps, keyed by the proposing span block's content index. */
  bandCapProposals: ReadonlyMap<number, BandCap>;
  /** Span blocks inserted in the band their cap was applied to — and, for
   *  trailing caps, boundaries reached while the flow was still inside the
   *  capped band (the content did not spill past the level cut). */
  spanPlacedInBand: ReadonlySet<number>;
  /** Caps whose opening block did open a band in this pass. */
  bandCapsApplied: ReadonlySet<number>;
}

/** Shorten every column of a (still empty) band to `capPx`, remembering
 *  each column's true bottom in `uncappedBottoms` so the band can be
 *  restored (`uncapBand`) when the span block cuts it. Idempotent; a column
 *  already shorter than the cap (bottom float) is left alone. A column that
 *  already holds content keeps its used height — the cap then only trims
 *  what is left. */
export function applyBandCap(
  cols: readonly VDTColumn[],
  capPx: number,
  uncappedBottoms: Map<VDTColumn, number>,
): void {
  for (const c of cols) {
    if (c.bbox.height <= capPx + 0.01) continue;
    if (!uncappedBottoms.has(c)) uncappedBottoms.set(c, c.bbox.y + c.bbox.height);
    const trimmed = c.bbox.height - capPx;
    c.bbox.height = capPx;
    c.availableHeight = Math.max(0, c.availableHeight - trimmed);
  }
}

/** Give capped columns their true bottom back (the slack below the cap
 *  returns to `availableHeight`). */
export function uncapBand(
  cols: readonly VDTColumn[],
  uncappedBottoms: Map<VDTColumn, number>,
): void {
  for (const c of cols) {
    const bottom = uncappedBottoms.get(c);
    if (bottom === undefined) continue;
    const height = bottom - c.bbox.y;
    c.availableHeight += height - c.bbox.height;
    c.bbox.height = height;
    uncappedBottoms.delete(c);
  }
}

/** True bottom of a column — the remembered one while it is capped. */
export function columnBottom(col: VDTColumn, uncappedBottoms: ReadonlyMap<VDTColumn, number>): number {
  return uncappedBottoms.get(col) ?? col.bbox.y + col.bbox.height;
}

/** Grid lines a level cut of the band would need: the content spread over
 *  the band's columns evenly, rounded up to whole lines. */
export function bandCapLines(cols: readonly VDTColumn[], gridPx: number): number {
  let total = 0;
  for (const c of cols) total += c.bbox.height - c.availableHeight;
  return Math.max(1, Math.ceil((total / cols.length - 0.01) / gridPx));
}

const capKey = (spanIndex: number, cap: BandCap): string =>
  `${spanIndex}:${cap.startContentIndex}:${cap.startPart}:${cap.lines}`;

/**
 * Drive the band-cap passes. `initial` is the plain first pass; `runPass`
 * re-places the document with the given caps. Returns the layout to carry
 * into column balancing, the caps it was built with, and the number of
 * passes run (including the initial one).
 *
 * Each round first settles the caps of the previous pass — a cap whose
 * block was not inserted in its band is retried one line taller (while it
 * did apply and `retries` allows), otherwise dropped — then adopts the new
 * proposals (never one already tried). Rounds stop when nothing changes or
 * `MAX_BAND_PASSES` extra passes were run. The layout returned never carries
 * an undelivered cap: failing caps are removed and, when none survive, the
 * initial pass is returned untouched — a document whose span blocks all
 * fit stage 1 costs no extra pass at all.
 */
export function resolveBandCaps<T extends BandPassReport>(
  initial: T,
  runPass: (bandCaps: ReadonlyMap<number, BandCap>) => T,
): { result: T; bandCaps: Map<number, BandCap>; passCount: number } {
  const caps = new Map<number, BandCap>();
  let result = initial;
  let passCount = 1;
  // Only span caps are settled here; trailing caps (closing bands cut level)
  // are resolved by `resolveTrailingCaps` once column balancing has settled.
  const spanProposals = (r: T): [number, BandCap][] =>
    [...r.bandCapProposals].filter(([, c]) => c.kind === 'span');
  if (spanProposals(initial).length === 0) return { result, bandCaps: caps, passCount };

  const tried = new Set<string>();
  for (let extra = 0; extra < MAX_BAND_PASSES; extra++) {
    let changed = false;
    for (const [spanIndex, cap] of [...caps]) {
      if (result.spanPlacedInBand.has(spanIndex)) continue;
      changed = true;
      if (result.bandCapsApplied.has(spanIndex) && cap.retries < MAX_BAND_CAP_RETRIES) {
        caps.set(spanIndex, { ...cap, lines: cap.lines + 1, retries: cap.retries + 1 });
      } else {
        caps.delete(spanIndex);
      }
    }
    for (const [spanIndex, cap] of spanProposals(result)) {
      if (caps.has(spanIndex) || tried.has(capKey(spanIndex, cap))) continue;
      caps.set(spanIndex, { ...cap });
      changed = true;
    }
    if (!changed) break;
    if (caps.size === 0) {
      // Every cap was dropped and nothing new came up: the plain layout.
      result = initial;
      break;
    }
    for (const [spanIndex, cap] of caps) tried.add(capKey(spanIndex, cap));
    result = runPass(caps);
    passCount++;
  }

  // Never hand back a layout whose columns were capped for a box that did
  // not arrive: strip the failing caps (dropping an earlier cap can unsettle
  // a later one, hence the loop — each round removes at least one).
  while (caps.size > 0) {
    const failing = [...caps.keys()].filter((i) => !result.spanPlacedInBand.has(i));
    if (failing.length === 0) break;
    for (const i of failing) caps.delete(i);
    if (caps.size === 0) {
      result = initial;
      break;
    }
    result = runPass(caps);
    passCount++;
  }
  return { result, bandCaps: caps, passCount };
}

/**
 * Drive the trailing-cap passes (closing bands cut level at a chapter /
 * document boundary), after column balancing has settled: `initial` is the
 * balanced layout whose boundaries proposed the caps, `spanCaps` the caps
 * already in force, and `runPass` re-places the document with the balancing
 * hints frozen and the given caps. A trailing cap whose band overflowed
 * (applied, not delivered) is retried one line taller; one whose band
 * opened with a different block (not applied) is replaced by the fresh
 * proposal that pass made for the same boundary, else dropped. Span caps
 * must stay delivered — a trailing cap that unsettles one is abandoned.
 * The layout returned never carries an undelivered cap; when no trailing
 * cap survives, `initial` is returned untouched.
 */
export function resolveTrailingCaps<T extends BandPassReport>(
  initial: T,
  spanCaps: ReadonlyMap<number, BandCap>,
  runPass: (bandCaps: ReadonlyMap<number, BandCap>) => T,
): { result: T; caps: Map<number, BandCap>; passCount: number } {
  const caps = new Map(spanCaps);
  let adopted = 0;
  for (const [i, cap] of initial.bandCapProposals) {
    if (cap.kind !== 'trailing' || caps.has(i)) continue;
    caps.set(i, { ...cap });
    adopted++;
  }
  let passCount = 0;
  if (adopted === 0) return { result: initial, caps, passCount };

  const trailingKeys = (): number[] => [...caps].filter(([, c]) => c.kind === 'trailing').map(([i]) => i);
  const giveUp = (): { result: T; caps: Map<number, BandCap>; passCount: number } =>
    ({ result: initial, caps: new Map(spanCaps), passCount });

  let result = initial;
  for (let extra = 0; extra < MAX_BAND_PASSES; extra++) {
    result = runPass(caps);
    passCount++;
    if ([...spanCaps.keys()].some((i) => !result.spanPlacedInBand.has(i))) return giveUp();
    const failing = trailingKeys().filter((i) => !result.spanPlacedInBand.has(i));
    if (failing.length === 0) return { result, caps, passCount };
    for (const i of failing) {
      const cap = caps.get(i)!;
      const fresh = result.bandCapProposals.get(i);
      if (result.bandCapsApplied.has(i)) {
        if (cap.retries < MAX_BAND_CAP_RETRIES) {
          caps.set(i, { ...cap, lines: cap.lines + 1, retries: cap.retries + 1 });
        } else {
          caps.delete(i);
        }
      } else if (fresh && fresh.kind === 'trailing') {
        caps.set(i, { ...fresh });
      } else {
        caps.delete(i);
      }
    }
    if (trailingKeys().length === 0) return giveUp();
  }

  // Out of passes: strip whatever is still undelivered and keep the rest.
  const failing = trailingKeys().filter((i) => !result.spanPlacedInBand.has(i));
  if (failing.length === 0) return { result, caps, passCount };
  for (const i of failing) caps.delete(i);
  if (trailingKeys().length === 0) return giveUp();
  result = runPass(caps);
  passCount++;
  const delivered = [...caps.keys()].every((i) => result.spanPlacedInBand.has(i));
  return delivered ? { result, caps, passCount } : giveUp();
}
