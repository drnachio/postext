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

import type { VDTColumn } from '../../vdt.js';

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
  /** Bands the same opening block and part were offered to before this
   *  one in the proposing pass (absent: none). A block offered to a band
   *  that has no room for it — a page a float fills — moves on without
   *  placing anything and opens the next band as well; the cap belongs to
   *  the band it was measured in. */
  startVisit?: number;
  /** Height of the capped band in lines: baseline-grid lines, or lines of
   *  `pitchPx` when the cap carries one. */
  lines: number;
  /** The height of one of `lines` (px) when it is not the baseline grid's:
   *  the leading the band's own text is set on (see {@link bandLinePitch},
   *  #711). A trailing cap only; absent, the cut stands on a grid line. */
  pitchPx?: number;
  /** How many times the cap may be grown by a line after an overflow, when
   *  its lines are shorter than the grid's (#711): as far as three grid
   *  lines reach, at most {@link MAX_PITCHED_CAP_RETRIES}. Absent:
   *  {@link MAX_BAND_CAP_RETRIES}. */
  retryLimit?: number;
  /** Times the cap has been grown by one line after an overflow. */
  retries: number;
  /** Trailing caps only: the zone a chapter-closing fixed box takes at the
   *  bottom of the band. The band's columns it meets (by position in the
   *  band) are cut no lower than `top`, so the box fits below them; `lines`
   *  is then the height of the other columns, which take the text the cut
   *  displaces. */
  zone?: BandCapZone;
  /** How far below its bare top the band started when the cap was
   *  proposed, because every column of it had a float band at its head
   *  (`lines` counts from under them). The capped pass can open the band
   *  before those floats land, when the band's top is still the bare one;
   *  the cut is then taken from `headPx` lower, where it was measured, or
   *  it would come that much too high and the band never end level. */
  headPx?: number;
  /** Where the proposing pass measured the band: its page index and top
   *  (px), `page:top`. A cap that overflowed its band is remembered as
   *  tried together with this place: the same cap proposed for its band
   *  standing elsewhere (the caps before it moved the flow) is a new
   *  attempt, not one already failed (#1253). */
  at?: string;
}

export interface BandCapZone {
  /** Absolute page y of the zone's top edge (grid-snapped). */
  top: number;
  /** Positions, in the band's column list, of the columns the box meets. */
  columns: number[];
}

/** Maximum number of extra placement passes the band-cap driver may run on
 *  top of the initial pass (proposals + retries). */
export const MAX_BAND_PASSES = 4;

/** The most extra passes the trailing-cap driver may run on a document
 *  whose caps keep settling (#1253): past its {@link MAX_BAND_PASSES}, a
 *  pass is run while the first cap still failing moved on in one of the
 *  last `MAX_BAND_PASSES`. */
export const MAX_TRAILING_CAP_PASSES = 64;

/** Maximum number of `lines + 1` retries for a cap whose band overflowed. */
export const MAX_BAND_CAP_RETRIES = 3;

/** The most retries a cap with a pitch of its own gets (#711). */
export const MAX_PITCHED_CAP_RETRIES = 6;

/** The retries a cap of `pitchPx` lines may take to reach as far as
 *  {@link MAX_BAND_CAP_RETRIES} grid lines do. */
export function capRetryLimit(pitchPx: number, gridPx: number): number {
  if (!(pitchPx > 0) || pitchPx >= gridPx - 0.01) return MAX_BAND_CAP_RETRIES;
  return Math.min(MAX_PITCHED_CAP_RETRIES, Math.ceil((MAX_BAND_CAP_RETRIES * gridPx) / pitchPx - 0.01));
}

/** The share of a band's lines that must stand on its leading for the band
 *  to be cut in lines of it ({@link bandLinePitch}). */
export const PITCHED_BAND_SHARE = 0.8;

/** Two line tops are on one lattice within this many pixels. */
const LATTICE_EPS = 0.25;

/**
 * The leading a band's own text is set on (#711): over the lines of the
 * flow blocks of `cols` that are not headings, not hidden and not inside a
 * box, the line height most of them share. The grid when that height is
 * the grid's, when no height is shared by more than half of the lines, or
 * when the band holds no such line: a band of body text is cut on the grid
 * as it always was, and so is one that mixes two leadings in equal parts.
 *
 * The lines must also stand on that leading: in each column, at least
 * {@link PITCHED_BAND_SHARE} of them a whole number of lines from one
 * another. References of three lines with a gap between entries, or an
 * index whose groups stand a hand-set margin apart, share a line height
 * and no lattice: a cut counted in their lines falls no better than one on
 * the grid, and such a band keeps the grid.
 */
export function bandLinePitch(cols: readonly VDTColumn[], gridPx: number): number {
  // Heights compared to a hundredth of a pixel; the pitch is the exact
  // height (a rounded one drifts by a line over a tall band).
  const counts = new Map<number, { n: number; height: number }>();
  let total = 0;
  const tops: number[][] = [];
  for (const col of cols) {
    const colTops: number[] = [];
    for (const block of col.blocks) {
      if (block.type === 'heading' || block.hidden || block.containerId !== undefined) continue;
      for (const line of block.lines) {
        const height = line.bbox.height;
        if (!(height > 0)) continue;
        const key = Math.round(height * 100);
        const seen = counts.get(key);
        if (seen) seen.n++;
        else counts.set(key, { n: 1, height });
        colTops.push(line.bbox.y);
        total++;
      }
    }
    tops.push(colTops);
  }
  let pitch = gridPx;
  let most = 0;
  for (const { n, height } of counts.values()) if (n > most) { most = n; pitch = height; }
  if (total === 0 || most * 2 <= total || Math.abs(pitch - gridPx) <= 0.01) return gridPx;
  // On the lattice: per column, the largest set of lines whose tops differ
  // by whole lines of the pitch (a heading above them shifts them all alike).
  let onLattice = 0;
  for (const colTops of tops) {
    const phases = new Map<number, number>();
    let best = 0;
    for (const y of colTops) {
      // Measured from the column's first line, half a line in: the lines on
      // its lattice fall mid-range, clear of the seam of the modulo.
      const d = y - colTops[0]! + pitch / 2;
      const phase = ((d % pitch) + pitch) % pitch;
      // Quarter-pixel buckets; a phase at the seam of two counts in both.
      const lo = Math.floor(phase / LATTICE_EPS);
      for (const k of lo * LATTICE_EPS + LATTICE_EPS / 2 > phase ? [lo, lo - 1] : [lo, lo + 1]) {
        const n = (phases.get(k) ?? 0) + 1;
        phases.set(k, n);
        if (n > best) best = n;
      }
    }
    onLattice += best;
  }
  return onLattice >= total * PITCHED_BAND_SHARE ? pitch : gridPx;
}

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

/** Top edge of a band: the highest column top. A column whose top was
 *  pushed down by a float band starts below it. */
export function bandTop(cols: readonly VDTColumn[]): number {
  return Math.min(...cols.map((c) => c.bbox.y));
}

/** Top edge of a band before the float bands at its columns' heads pushed
 *  them down: `floatHead` gives the px reserved at a column's head. Equal
 *  to {@link bandTop} unless every column holds such a float. */
export function bareBandTop(cols: readonly VDTColumn[], floatHead: (col: VDTColumn) => number): number {
  return Math.min(...cols.map((c) => c.bbox.y - floatHead(c)));
}

/** Cut every column of a (still empty) band level at `top + capPx` (`top`
 *  defaults to {@link bandTop}),
 *  remembering each column's true bottom in `uncappedBottoms` so the band
 *  can be restored (`uncapBand`) when the span block cuts it. The cut is an
 *  absolute line, so a column that starts lower (under a top float band)
 *  gets a shorter height and the columns still end level. Idempotent; a
 *  column already ending above the cut (bottom float) is left alone. A
 *  column that already holds content keeps its used height — the cap then
 *  only trims what is left. */
export function applyBandCap(
  cols: readonly VDTColumn[],
  capPx: number,
  uncappedBottoms: Map<VDTColumn, number>,
  zone?: BandCapZone,
  trailing = false,
  top = bandTop(cols),
): void {
  const cut = top + capPx;
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i]!;
    const colCut = zone && zone.columns.includes(i) ? Math.min(cut, zone.top) : cut;
    const height = Math.max(c.bbox.height - c.availableHeight, colCut - c.bbox.y);
    if (c.bbox.height <= height + 0.01) continue;
    if (trailing) c.trailingCap = true;
    c.bandCapped = true;
    if (!uncappedBottoms.has(c)) uncappedBottoms.set(c, c.bbox.y + c.bbox.height);
    const trimmed = c.bbox.height - height;
    c.bbox.height = height;
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
    c.bandCapped = false;
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

/** Grid lines (from the band top) a level cut of the band would need: the
 *  content spread over the band's columns evenly, rounded up to whole
 *  lines. A column starting under a top float band counts that offset as
 *  used, so the cut lands at the same absolute height in every column;
 *  `extraPx` adds space the band must also hold (float bands reserved at
 *  column feet, which shortened the columns instead of filling them). */
export function bandCapLines(cols: readonly VDTColumn[], gridPx: number, extraPx = 0): number {
  const top = bandTop(cols);
  const used = (c: VDTColumn): number => (c.bbox.height - c.availableHeight) + (c.bbox.y - top);
  // Columns of different widths (a one-and-a-half layout with text in both
  // columns): text runs on from one into the other broken again for its
  // width, so a line of the wide column fills more than a line of the
  // narrow one. The cut spreads the text by area, each column's height
  // weighted by its width (EF-157).
  const widths = cols.map((c) => c.bbox.width);
  if (Math.max(...widths) - Math.min(...widths) > 0.5) {
    const area = cols.reduce((sum, c) => sum + used(c) * c.bbox.width, 0);
    const width = widths.reduce((sum, w) => sum + w, 0);
    return Math.max(1, Math.ceil((area / width + extraPx / cols.length - 0.01) / gridPx));
  }
  let total = extraPx;
  for (const c of cols) total += used(c);
  return Math.max(1, Math.ceil((total / cols.length - 0.01) / gridPx));
}

/** Grid lines the columns of a closing band NOT under a fixed box's zone
 *  need when the columns under it are cut at `zone.top`: the band's content
 *  minus what fits above the zone, spread over the other columns and
 *  rounded up to whole lines. `null` when no column is left to take the
 *  displaced text, or when the level cut already clears the zone (a plain
 *  level cap does the job), or when the other columns cannot hold it
 *  within their true height (the box would not fit on the page anyway). */
export function bandCapLinesAroundZone(
  cols: readonly VDTColumn[],
  gridPx: number,
  zone: BandCapZone,
  trueBottom: (col: VDTColumn) => number,
): number | null {
  const top = bandTop(cols);
  const level = top + bandCapLines(cols, gridPx) * gridPx;
  if (level <= zone.top + 0.5) return null;
  const under = cols.filter((_, i) => zone.columns.includes(i));
  const others = cols.filter((_, i) => !zone.columns.includes(i));
  if (under.length === 0 || others.length === 0) return null;
  let total = 0;
  for (const c of cols) total += (c.bbox.height - c.availableHeight) + (c.bbox.y - top);
  const aboveZone = under.length * Math.max(0, zone.top - top);
  const lines = Math.max(1, Math.ceil(((total - aboveZone) / others.length - 0.01) / gridPx));
  const room = Math.min(...others.map((c) => trueBottom(c) - top));
  return lines * gridPx <= room + 0.5 ? lines : null;
}

const capKey = (spanIndex: number, cap: BandCap): string =>
  `${spanIndex}:${cap.startContentIndex}:${cap.startPart}:${cap.startVisit ?? 0}:${cap.lines}${cap.pitchPx !== undefined ? `@${cap.pitchPx.toFixed(2)}` : ''}${cap.at !== undefined ? `/${cap.at}` : ''}`;

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
  return drainPasses(resolveBandCapsGen(initial, runPass));
}

/** Run a pass driver to completion synchronously. */
export function drainPasses<R>(gen: Generator<void, R, void>): R {
  for (;;) {
    const step = gen.next();
    if (step.done) return step.value;
  }
}

/** {@link resolveBandCaps} as a generator that yields after every pass it
 *  runs, so a host driving the build asynchronously can let a cancel land
 *  (or the event loop turn) between passes. */
export function* resolveBandCapsGen<T extends BandPassReport>(
  initial: T,
  runPass: (bandCaps: ReadonlyMap<number, BandCap>) => T,
): Generator<void, { result: T; bandCaps: Map<number, BandCap>; passCount: number }, void> {
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
    yield;
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
    yield;
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
 * opened with a different block (not applied — an earlier cap's retry moved
 * the flow under it) is replaced by the fresh proposal that pass made for
 * the same boundary, else dropped. A boundary that proposes anew once the
 * caps before it have settled (a dropped one, or a closing band the earlier
 * caps uncovered) joins the next pass, so a cap that stumbles while another
 * is still being retried is not lost. Span caps must stay delivered — a
 * trailing cap that unsettles one is abandoned. Out of passes, the caps
 * still undelivered are dropped; one that was delivered and comes undone
 * once they are (the flow after them moved) is dropped in the next round,
 * and the others are kept. The layout returned never carries an
 * undelivered cap; when no trailing cap survives, `initial` is returned
 * untouched.
 */
export function resolveTrailingCaps<T extends BandPassReport>(
  initial: T,
  spanCaps: ReadonlyMap<number, BandCap>,
  runPass: (bandCaps: ReadonlyMap<number, BandCap>) => T,
): { result: T; caps: Map<number, BandCap>; passCount: number } {
  return drainPasses(resolveTrailingCapsGen(initial, spanCaps, runPass));
}

/** {@link resolveTrailingCaps} as a generator yielding after every pass. */
export function* resolveTrailingCapsGen<T extends BandPassReport>(
  initial: T,
  spanCaps: ReadonlyMap<number, BandCap>,
  runPass: (bandCaps: ReadonlyMap<number, BandCap>) => T,
): Generator<void, { result: T; caps: Map<number, BandCap>; passCount: number }, void> {
  const caps = new Map(spanCaps);
  /** Caps whose band did open under them and overflowed — the only ones a
   *  pass says anything about; a cap that never applied may come back. */
  const tried = new Set<string>();
  /** Adopt the trailing proposals of `report` for boundaries without a cap
   *  in force (never one that already failed); returns how many were taken. */
  const adopt = (report: T): number => {
    let taken = 0;
    for (const [i, cap] of report.bandCapProposals) {
      if (cap.kind !== 'trailing' || caps.has(i) || tried.has(capKey(i, cap))) continue;
      caps.set(i, { ...cap });
      taken++;
    }
    return taken;
  };
  let passCount = 0;
  if (adopt(initial) === 0) return { result: initial, caps, passCount };

  const trailingKeys = (): number[] => [...caps].filter(([, c]) => c.kind === 'trailing').map(([i]) => i);
  const giveUp = (): { result: T; caps: Map<number, BandCap>; passCount: number } =>
    ({ result: initial, caps: new Map(spanCaps), passCount });

  let result = initial;
  /** The caps `result` was placed with. */
  let ranWith: ReadonlySet<number> = new Set();
  // A cap whose lines are shorter than the grid's retries in finer steps
  // and gets as many more passes as it gets retries (#711).
  const passBound = (): number =>
    MAX_BAND_PASSES + Math.max(0, ...[...caps.values()].map((c) => (c.retryLimit ?? MAX_BAND_CAP_RETRIES) - MAX_BAND_CAP_RETRIES));
  // Caps settle in the order of their bands: a cap measured on a layout
  // the caps before it have since moved is proposed again on the moved one
  // and only then lands, so a long document whose bands close before many
  // span headings settles them a few at a time, page after page (#1253).
  // Past its bound the driver goes on while that front moves: a pass is run
  // while the first boundary whose cap still fails moved on in one of the
  // last MAX_BAND_PASSES.
  let front = -1;
  let lastGain = 0;
  const morePasses = (extra: number): boolean =>
    extra < passBound() || (extra < MAX_TRAILING_CAP_PASSES && extra - lastGain < MAX_BAND_PASSES);
  for (let extra = 0; morePasses(extra); extra++) {
    result = runPass(caps);
    ranWith = new Set(caps.keys());
    passCount++;
    yield;
    if ([...spanCaps.keys()].some((i) => !result.spanPlacedInBand.has(i))) return giveUp();
    const failing = trailingKeys().filter((i) => !result.spanPlacedInBand.has(i));
    const first = failing.length > 0 ? Math.min(...failing) : Infinity;
    if (first > front) {
      front = first;
      lastGain = extra;
    }
    for (const i of failing) {
      const cap = caps.get(i)!;
      const fresh = result.bandCapProposals.get(i);
      if (result.bandCapsApplied.has(i)) {
        tried.add(capKey(i, cap));
        if (cap.retries < (cap.retryLimit ?? MAX_BAND_CAP_RETRIES)) {
          caps.set(i, { ...cap, lines: cap.lines + 1, retries: cap.retries + 1 });
        } else {
          caps.delete(i);
        }
      } else if (fresh && fresh.kind === 'trailing' && !tried.has(capKey(i, fresh))) {
        caps.set(i, { ...fresh });
      } else {
        caps.delete(i);
      }
    }
    const adopted = adopt(result);
    if (failing.length === 0 && adopted === 0) return { result, caps, passCount };
    if (trailingKeys().length === 0) return giveUp();
  }

  // Out of passes: strip whatever is still undelivered and keep the rest.
  // Dropping a cap moves the flow after it, which can unsettle a cap that
  // was delivered: that one is dropped in turn (each round drops at least
  // one), so the caps still delivered are kept rather than all given up.
  // A cap the last round dropped (out of retries) still cut the layout that
  // round placed: that layout is placed again without it.
  let failing = trailingKeys().filter((i) => !result.spanPlacedInBand.has(i));
  let stale = [...ranWith].some((i) => !caps.has(i));
  while (failing.length > 0 || stale) {
    for (const i of failing) caps.delete(i);
    if (trailingKeys().length === 0) return giveUp();
    result = runPass(caps);
    passCount++;
    yield;
    if ([...spanCaps.keys()].some((i) => !result.spanPlacedInBand.has(i))) return giveUp();
    failing = trailingKeys().filter((i) => !result.spanPlacedInBand.has(i));
    stale = false;
  }
  return { result, caps, passCount };
}
