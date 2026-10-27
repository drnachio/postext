// Choosing a balloon's line breaks: line tables, the best breaks for a
// width, line scores and the candidate line sets.
import { hasCJK } from '../../../measure/cjk/cjk.js';
import type { BreakPoint, PreparedText } from '../text.js';
import { ovalProfile } from '../shape-text.js';
import type { Measurer } from './measure.js';

export interface Candidate {
  breaks: number[];
  lines: { start: number; end: number; width: number }[];
  score: number;
  aspect: number;
  breakCost: number;
  wordCuts: number;
}

/** Widths and lone-line penalties of the lines between two break points
 *  (indices into the break points with the start prepended: a line from
 *  after `j` to the end of `k`). The dynamic programmes of every line
 *  count, width and shaping of a text ask for the same lines over and
 *  over: each is worked out once, on first asking. */
interface LineTable {
  width(j: number, k: number): number;
  lone(j: number, k: number): number;
}

function lineTable(all: readonly BreakPoint[], m: Measurer, lone: (a: number, b: number) => number): LineTable {
  const P = all.length;
  const widths: (Float64Array | undefined)[] = new Array(P);
  const lones: (Float64Array | undefined)[] = new Array(P);
  const startOf = (j: number) => (j === 0 ? 0 : all[j]!.next);
  const row = (rows: (Float64Array | undefined)[], j: number) => (rows[j] ??= new Float64Array(P).fill(Number.NaN));
  return {
    width(j, k) {
      const r = row(widths, j);
      let v = r[k]!;
      if (Number.isNaN(v)) r[k] = v = m.width(startOf(j), all[k]!.end);
      return v;
    },
    lone(j, k) {
      const r = row(lones, j);
      let v = r[k]!;
      if (Number.isNaN(v)) r[k] = v = lone(startOf(j), all[k]!.end);
      return v;
    },
  };
}

/**
 * The best breaks for `n` lines aimed at a block `W` wide with an oval
 * profile (dynamic programme over the legal breaks). Forced breaks are
 * always taken. Undefined when `n` lines cannot hold the text that way.
 */
function bestBreaksFor(
  pts: readonly BreakPoint[],
  t: LineTable,
  n: number,
  W: number,
  maxLen: number,
  penaltyWeight: number,
): number[] | undefined {
  const P = pts.length;
  // dp[i][k]: cost of i lines ending at point k (k = 0 is the start).
  const INF = Number.POSITIVE_INFINITY;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(P).fill(INF));
  const from: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(P).fill(-1));
  dp[0]![0] = 0;
  for (let i = 0; i < n; i++) {
    const target = W * ovalProfile(i, n);
    for (let j = 0; j < P; j++) {
      const base = dp[i]![j]!;
      if (base === INF) continue;
      for (let k = j + 1; k < P; k++) {
        const pt = pts[k]!;
        const w = t.width(j, k);
        // The same weights as `scoreLines`, so that the programme looks
        // for what the score rewards.
        let c = (12 / n) * ((w - target) / W) ** 2 + pt.penalty * penaltyWeight + t.lone(j, k);
        if (w > W * 1.15) c += 5 * (w / W - 1.15) + 1;
        if (w > maxLen) c += 20 * ((w - maxLen) / maxLen) + 20;
        const last = i === n - 1;
        if (last && k !== P - 1) {
          // The last line must end the text.
        } else if (!last && k === P - 1) {
          // Not the last line: cannot end the text.
        } else {
          if (last && n >= 2) {
            const r = w / (W * ovalProfile(i, n));
            if (r < 0.5) c += 6 * (0.5 - r);
          }
          if (base + c < dp[i + 1]![k]!) {
            dp[i + 1]![k] = base + c;
            from[i + 1]![k] = j;
          }
        }
        if (pt.forced) break; // a line never runs past a forced break
        if (w > W * 2.6 && w > maxLen) break;
      }
    }
  }
  if (dp[n]![P - 1] === INF) return undefined;
  const breaks: number[] = [];
  let k = P - 1;
  for (let i = n; i > 0; i--) {
    breaks.unshift(k);
    k = from[i]![k]!;
  }
  return breaks;
}

/** Scores of a line set (lower is better). */
function scoreLines(
  lines: { start: number; end: number; width: number }[],
  pts: readonly BreakPoint[],
  breaks: readonly number[],
  em: number,
  pitch: number,
  vertical: boolean,
  target: number,
  maxLen: number,
  penaltyWeight: number,
  lone: (a: number, b: number) => number,
  cjk: boolean,
): { score: number; aspect: number } {
  const n = lines.length;
  const wMax = Math.max(1e-6, ...lines.map((l) => l.width));
  const across = (n - 1) * pitch + em;
  // Width / height across lines; for columns, length / width: both read
  // as how far the block runs along its lines.
  const aspect = wMax / across;
  // A text that fits one short line (column) keeps it: the aspect only
  // shapes texts long enough to need several.
  // (A Latin line of more than about fifteen letters, a Chinese or
  // Japanese one of more than five characters, is a "sausage": two short
  // lines read better.)
  const short = n === 1 && (vertical ? wMax <= maxLen : wMax <= (cjk ? 5.5 : 7) * em);
  let s = (short ? 0.15 : 4) * Math.log(aspect / target) ** 2;
  // Diamond profile: each line against the oval chord at its place.
  let dev = 0;
  for (let i = 0; i < n; i++) {
    const c = ovalProfile(i, n) / ovalProfile(Math.floor((n - 1) / 2), n);
    dev += (lines[i]!.width / wMax - Math.min(1, c)) ** 2;
  }
  s += (8 * dev) / n;
  if (n >= 2) {
    const last = lines[n - 1]!.width / wMax;
    if (last < 0.45) s += 6 * (0.45 - last); // parking space
    const first = lines[0]!.width / wMax;
    if (first < 0.3) s += 3 * (0.3 - first);
  }
  // Line count: 2–5 preferred (one line is fine when it is short).
  if (n === 1 && wMax > 10 * em) s += 0.5;
  if (n > 5) s += 0.3 * (n - 5);
  let pen = 0;
  for (const b of breaks.slice(0, -1)) pen += pts[b]!.penalty;
  s += penaltyWeight * pen;
  for (const l of lines) {
    if (l.width > maxLen + 0.5) s += 20 * ((l.width - maxLen) / em);
    s += lone(l.start, l.end);
  }
  return { score: s, aspect };
}

/** A line (column) of a text of several that holds no letter or digit
 *  (a leader "……" or a "!" left alone) is an orphan, and so is a
 *  column of one character: a heavy penalty, unless a forced break made
 *  it so. */
function loneLinePenalty(p: PreparedText, all: readonly BreakPoint[]): (a: number, b: number) => number {
  const forcedEnds = new Set(all.filter((x) => x.forced).map((x) => x.end));
  const forcedStarts = new Set(all.filter((x) => x.forced).map((x) => x.next));
  return (a, b) => {
    if (a === 0 && b === p.text.length) return 0;
    if (forcedEnds.has(b) && (a === 0 || forcedStarts.has(a))) return 0;
    const t = p.text.slice(a, b).replace(/[\u2066-\u2069]/g, '');
    if (!/[\p{L}\p{N}]/u.test(t)) return 9;
    if (hasCJK(t) && [...t.replace(/[\s\p{P}\p{S}]/gu, '')].length <= 1) return 4;
    return 0;
  };
}

/** What the line sets of a text are worked out from (in one writing
 *  mode, font and break level), kept for its other shapings. */
interface Breaking {
  length: number;
  all: BreakPoint[];
  m: Measurer;
  table: LineTable;
  lone: (a: number, b: number) => number;
  /** Line sets by longest line allowed and penalty weight. */
  sets: Map<string, LineSet[]>;
}

interface LineSet {
  breaks: number[];
  lines: { start: number; end: number; width: number }[];
  breakCost: number;
  wordCuts: number;
}

export function breakingOf(p: PreparedText, pts: readonly BreakPoint[], m: Measurer): Breaking {
  const all: BreakPoint[] = [{ end: 0, next: 0, penalty: 0, forced: false }, ...pts];
  const lone = loneLinePenalty(p, all);
  return { length: p.text.length, all, m, table: lineTable(all, m, lone), lone, sets: new Map() };
}

/** Distinct line sets for every line count, each the best of its
 *  programme at a few block widths (the target aspect plays no part). */
function lineSetsFor(b: Breaking, em: number, maxLen: number, penaltyWeight: number): LineSet[] {
  const key = `${maxLen}|${penaltyWeight}`;
  const cached = b.sets.get(key);
  if (cached) return cached;
  const { all, m, table, lone } = b;
  const total = m.width(0, b.length);
  const forcedCount = all.filter((x) => x.forced).length;
  const nMax = Math.max(forcedCount, Math.min(16, all.length - 1, Math.ceil(total / (1.5 * em)) + forcedCount));
  const out: LineSet[] = [];
  const seen = new Set<string>();
  for (let n = forcedCount; n <= nMax; n++) {
    let mean = 0;
    for (let i = 0; i < n; i++) mean += ovalProfile(i, n);
    mean /= n;
    const base = total / n / mean;
    for (const f of [0.85, 0.95, 1.05, 1.15, 1.3]) {
      const W = Math.min(base * f, maxLen);
      const br = bestBreaksFor(all, table, n, W, maxLen, penaltyWeight);
      if (!br) continue;
      const sig = br.join(',');
      if (seen.has(sig)) continue;
      seen.add(sig);
      const lines = br.map((k, i) => {
        const start = i === 0 ? 0 : all[br[i - 1]!]!.next;
        const end = all[k]!.end;
        return { start, end, width: m.width(start, end) };
      });
      const breakCost = penaltyWeight * br.slice(0, -1).reduce((sum, k) => sum + all[k]!.penalty, 0)
        + lines.reduce((sum, l) => sum + lone(l.start, l.end), 0);
      out.push({ breaks: br, lines, breakCost, wordCuts: br.slice(0, -1).filter((k) => all[k]!.inWord).length });
    }
  }
  b.sets.set(key, out);
  return out;
}

/** Line sets for every line count, each scored; the best first. */
export function candidatesFor(
  p: PreparedText,
  b: Breaking,
  em: number,
  pitch: number,
  vertical: boolean,
  target: number,
  maxLen: number,
  penaltyWeight: number,
): Candidate[] {
  const cjk = hasCJK(p.text);
  const out: Candidate[] = lineSetsFor(b, em, maxLen, penaltyWeight).map(({ breaks, lines, breakCost, wordCuts }) => {
    const { score, aspect } = scoreLines(lines, b.all, breaks, em, pitch, vertical, target, maxLen, penaltyWeight, b.lone, cjk);
    return { breaks, lines, score, aspect, breakCost, wordCuts };
  });
  out.sort((a, b) => a.score - b.score || a.lines.length - b.lines.length);
  return out;
}

/** The breakings of each prepared text, by writing mode, font and break
 *  level: a balloon is shaped several times over (its preferred shape,
 *  then wider, narrower and shorter ones), all from the same lines. */
export const breakings = new WeakMap<PreparedText, Map<string, Breaking>>();
