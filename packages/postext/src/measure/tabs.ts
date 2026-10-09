/**
 * Tab stops in body text (#622).
 *
 * A tab (`:tab`, or a tab character in a paragraph whose style sets stops)
 * is a `space` token of the rich line breaker whose width depends on where
 * its line has got to, so it is resolved while the line is filled
 * ({@link placeTab}), never once per paragraph. A paragraph that holds a
 * tab is set line by line (Knuth–Plass sums its items' widths per candidate
 * line, which a width that depends on the line's start would break), as
 * word processors and InDesign set tabbed text.
 *
 * - A tab goes to the first stop past the text before it, among the stops
 *   after the one the line's previous tab took. `'start'`: the text after
 *   the tab starts at the stop; `'end'`: the text up to the next tab (or the
 *   paragraph's end) ends there; `'center'`: it is centred on it;
 *   `'decimal'`: its first decimal separator stands on it (a run with none
 *   ends there).
 * - Past the last stop, `tabInterval` sets default stops every interval
 *   from the start of the measure; without one, a tab past the last stop is
 *   a word space.
 * - Overrun: when the text before a tab has passed every remaining stop of
 *   its line, an `'end'`, `'center'` or `'decimal'` stop takes the last word
 *   before the tab to the next line with it (the text before the stop sets
 *   narrower, as a contents row narrows its title for its page number), and
 *   a `'start'` stop breaks the line before the tab, so the text after it
 *   starts the next line at its stop. A tab that opens its line and still
 *   finds no stop for the text after it takes no room.
 * - A leader fills the room before the text at the stop, flush with its
 *   end (see `measure/leader.ts`), `gapPx` clear of the text on each side.
 */

import type { TabStopAlign } from '../types';
import { fitLeader } from './leader';

/** A tab stop with its lengths in px (see `TabStop`). `at` is px from the
 *  start edge of the measure, `'end'` that line's end edge, or a share of
 *  the measure. */
export interface TabStopPx {
  at: number | 'end' | { percent: number };
  align: TabStopAlign;
  /** The leader's text, or `'rule'`; absent: none. */
  leader?: string;
  /** Room between the text and the leader, and the leader and the stop's
   *  text (px). */
  gapPx: number;
  decimalChar: string;
}

/** The tab stops of a paragraph (`MeasureBlockOptions.tabs`). */
export interface TabSettings {
  stops: readonly TabStopPx[];
  /** Default stops every this many px past the last of {@link stops}. */
  intervalPx?: number;
}

/** The text a tab sends to its stop: from after the tab to the next tab or
 *  the paragraph's end, its width and the width before its first decimal
 *  separator (`undefined` when it holds none). */
export interface TabRun {
  width: number;
  decimalWidth: (char: string) => number | undefined;
}

/** The line a tab is placed on: where its text starts (the line's indent)
 *  and ends (its measure), from the start edge of the measure; the
 *  paragraph's measure (for `%` stops); and the stop the line's previous
 *  tab took (`-Infinity` for none). */
export interface TabLine {
  start: number;
  end: number;
  measure: number;
  usedPos: number;
}

/** A leader set before a stop: its text (empty for a rule) and width, and
 *  where it ends from the tab's start. */
export interface TabLeaderPlacement {
  text: string;
  width: number;
  rule?: true;
  end: number;
}

export type TabPlacement =
  | { kind: 'stop'; width: number; pos: number; leader?: TabLeaderPlacement }
  | { kind: 'space' }
  | { kind: 'overrun'; align: TabStopAlign };

/** Where a stop stands on a line. */
export function tabStopPos(stop: TabStopPx, line: Pick<TabLine, 'end' | 'measure'>): number {
  if (stop.at === 'end') return line.end;
  if (typeof stop.at === 'number') return stop.at;
  return (line.measure * stop.at.percent) / 100;
}

/** Rounding in the width sums is not an overrun. */
const EPS = 0.01;

/**
 * Place a tab whose line has got to `x` (see the module comment): the
 * tab's width and leader, a word space, or an overrun the breaker resolves.
 * `oneOff`: the stop of `:tab{at=…}`, the only one such a tab goes to.
 * `leaderWidth` measures a run of leader text as it is painted.
 */
export function placeTab(
  x: number,
  run: TabRun,
  line: TabLine,
  settings: TabSettings | undefined,
  oneOff: TabStopPx | undefined,
  leaderWidth: (text: string) => number,
): TabPlacement {
  const candidates = oneOff
    ? [{ stop: oneOff, pos: tabStopPos(oneOff, line) }]
    : (settings?.stops ?? [])
        .map((stop) => ({ stop, pos: tabStopPos(stop, line) }))
        .filter((c) => c.pos > line.usedPos + EPS && c.pos <= line.end + EPS)
        .sort((a, b) => a.pos - b.pos);
  for (const { stop, pos } of candidates) {
    const gap = stop.leader ? stop.gapPx : 0;
    const at = textStart(stop, pos, run);
    // A start stop is past the text when it is ahead of it; the others
    // when the text they align fits between the text before and the stop.
    const clear = stop.align === 'start' ? at > x + EPS && at - x >= gap - EPS : at >= x + gap - EPS;
    if (!clear) continue;
    const width = Math.max(0, at - x);
    const leader = stop.leader ? leaderFor(stop, x, width, run.width > 0, line.start, leaderWidth) : undefined;
    return { kind: 'stop', width, pos, ...(leader ? { leader } : {}) };
  }
  if (!oneOff && settings?.intervalPx !== undefined && settings.intervalPx > 0) {
    const interval = settings.intervalPx;
    const last = (settings.stops ?? []).reduce((m, s) => Math.max(m, tabStopPos(s, line)), -Infinity);
    const from = Math.max(x, last, line.usedPos);
    const pos = (Math.floor((from + EPS) / interval) + 1) * interval;
    if (pos <= line.end + EPS) return { kind: 'stop', width: pos - x, pos };
    return { kind: 'overrun', align: candidates[candidates.length - 1]?.stop.align ?? 'start' };
  }
  if (candidates.length > 0) return { kind: 'overrun', align: candidates[candidates.length - 1]!.stop.align };
  return { kind: 'space' };
}

/** Where the text after the tab starts for its stop at `pos`. */
function textStart(stop: TabStopPx, pos: number, run: TabRun): number {
  switch (stop.align) {
    case 'start': return pos;
    case 'end': return pos - run.width;
    case 'center': return pos - run.width / 2;
    case 'decimal': return pos - (run.decimalWidth(stop.decimalChar) ?? run.width);
  }
}

/** The leader of a tab `width` px wide from `x`: `gapPx` clear of the text
 *  before it (none when the tab opens its line) and of the text after it
 *  (none when nothing follows), flush with the end of its room. */
function leaderFor(stop: TabStopPx, x: number, width: number, textAfter: boolean, lineStart: number, leaderWidth: (text: string) => number): TabLeaderPlacement | undefined {
  const before = x > lineStart + EPS ? stop.gapPx : 0;
  const after = textAfter ? stop.gapPx : 0;
  const room = width - before - after;
  if (!(room > 0)) return undefined;
  const end = width - after;
  if (stop.leader === 'rule') return { text: '', width: room, rule: true, end };
  const fit = fitLeader(stop.leader!, room, leaderWidth);
  return fit ? { text: fit.text, width: fit.width, end } : undefined;
}

/** The decimal separator of numbers in `locale` (Western digits): `.` in
 *  English, Chinese, Japanese and Arabic text, `,` in Spanish, Catalan,
 *  Portuguese, French, German… */
export function defaultDecimalChar(locale: string | undefined): string {
  if (!locale) return '.';
  try {
    const parts = new Intl.NumberFormat(locale, { numberingSystem: 'latn' } as Intl.NumberFormatOptions).formatToParts(1.5);
    return parts.find((p) => p.type === 'decimal')?.value ?? '.';
  } catch {
    return '.';
  }
}
