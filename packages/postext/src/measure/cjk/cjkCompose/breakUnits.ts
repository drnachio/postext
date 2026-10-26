// The breaker: how much of a run fits a line, overflow and push-out, runs
// divided at a joint, and breakUnits walking the paragraph
// (#1276: split out of cjkCompose.ts).
import { getMeasureLanguage } from '../../canvas.js';
import { textWidth, urlBreakIndices, type RichToken, emergencySplit } from '../../rich.js';
import { cjkClassOf, type CjkLineBreakLevel, getCjkLineBreak } from '../cjkClasses.js';
import { graphemeCount, lastGrapheme } from '../../graphemes.js';
import { getMeasureWritingMode } from '../../vertical.js';
import { foldWidth, splitNote } from '../cjkAnnotate.js';
import { type CjkComposition, isPlainComposition, isJlreqSpacing, lineEdgeCut, punctuationShrink, applyLineEdges, mayHang } from '../cjkPunctuation.js';
import { endProhibited } from './breaks.js';
import { noteRowStartProhibited } from './composeLine.js';
import { emOfFont, isMarkUnit } from './prepareUnits.js';
import { type Unit, FIT_EPS } from './units.js';

/** One line as the breaker found it: units `start` to `end` (exclusive),
 *  the first replaced by `first` (the rest of a unit the line before cut)
 *  and `head` appended (the part of unit `end` that fits). */
export interface LineRange {
  start: number;
  end: number;
  first?: Unit;
  head?: Unit;
  hyphenated: boolean;
  hardHyphen?: boolean;
  /** The line's last unit hangs past its end (`cjk.hangingPunctuation`). */
  hang?: boolean;
}

/**
 * What the breaker asks of a composition (see `cjkPunctuation.ts`): the
 * blank a mark gives up at a line start (`lead`) or end (`tail`) — less
 * the blank it gave to a mark across the break, which comes back, so
 * either may be negative —, and what a unit gives when its line is
 * compressed to take one more character (`give`, at the line's start or
 * end or inside it): a mark down to half an em as its style allows, a word
 * space down to a quarter em, a Han–Latin space down to an eighth. `edge`
 * sets a mark as it stands at a line edge (its `punct` must be the line's
 * own copy) and returns what it gave up.
 */
export interface LineFit {
  lead(u: Unit): number;
  tail(u: Unit): number;
  give(u: Unit, atStart: boolean, atEnd: boolean): number;
  edge(u: Unit, start: boolean, end: boolean): number;
  /** Whether unit `k` may hang when it ends a line: a pause or stop mark
   *  the composition lets hang, with no other mark before or after it. */
  hangs(units: readonly Unit[], k: number, unitAt: (k: number) => Unit): boolean;
  hanging: 'none' | 'allow' | 'force';
  /** JLReq spacing (`isJlreqSpacing`): the line gives up blank in JLReq's
   *  order, the half em at its end all or nothing, and is never spread at
   *  JLReq's inseparable places. */
  jlreq: boolean;
}

export function lineFitOf(c: CjkComposition): LineFit | undefined {
  if (isPlainComposition(c)) return undefined;
  const jlreq = isJlreqSpacing(c);
  return {
    lead: (u) => (u.punct ? lineEdgeCut(u.punct, c, true, false) : 0),
    tail: (u) => (u.punct ? lineEdgeCut(u.punct, c, false, true) : 0),
    give(u, atStart, atEnd) {
      if (u.kind === 'space') {
        if (u.aki) return 0;
        const em = emOfFont(u.style.font);
        return Math.max(0, u.width - (u.auto ? em / 8 : em / 4));
      }
      if (!u.punct) return 0;
      if (!atStart && !atEnd) return punctuationShrink(u.punct, c);
      const box = { ...u.punct };
      applyLineEdges(box, c, atStart, atEnd);
      // JLReq: a mark ending the line gives up the blank after its glyph
      // (and, a middle dot, nothing before it: §3.8.3 steps 2–3).
      return punctuationShrink(box, c, jlreq && atEnd);
    },
    edge: (u, start, end) => (u.punct ? applyLineEdges(u.punct, c, start, end) : 0),
    hangs(units, k, unitAt) {
      const u = unitAt(k);
      if (u.kind !== 'text' || u.run || u.graphemes !== 1 || u.note || u.ruby || u.kunten || !mayHang(u.text, u.first, c)) return false;
      if (k > 0 && isMarkUnit(unitAt(k - 1))) return false;
      return k + 1 >= units.length || !isMarkUnit(units[k + 1]);
    },
    hanging: c.hangingPunctuation,
    jlreq,
  };
}

/** The last unit that must share a line with unit `k` when `k` ends one:
 *  the units after it up to the next break (a closing quote after a
 *  full stop). -1 when that is more than a few units away or crosses a
 *  space the line may not break after. */
function groupEnd(units: readonly Unit[], breaks: Uint8Array, k: number): number {
  const n = units.length;
  for (let q = k; q < k + 6; q++) {
    if (q + 1 >= n) return q;
    if (units[q + 1]!.kind === 'space') {
      let r = q + 1;
      while (r < n && units[r]!.kind === 'space') r++;
      return r >= n || breaks[r] ? q : -1;
    }
    if (breaks[q + 1]) return q;
  }
  return -1;
}

/** The advance of the first `idx` UTF-16 units of a Western run, the
 *  block's tracking included. */
function prefixWidth(u: Unit, idx: number, letterSpacingPx: number): number {
  const head = u.text.slice(0, idx);
  return textWidth(head, u.style.font, u.style.smallCaps) + (letterSpacingPx === 0 ? 0 : letterSpacingPx * graphemeCount(head));
}

/** Characters of a run kept past the first that does not fit when it is
 *  cut: enough for the dictionary and the joints of a web address to read
 *  the text around every cut that fits as they read the whole run. */
const CUT_CONTEXT = 32;

/** The shortest prefix of a Western run (in UTF-16 units) wider than
 *  `room`, or its length when all of it fits: found by doubling, then
 *  halving, so a run many lines long costs what one line of it does. */
function overflowAt(u: Unit, room: number, letterSpacingPx: number): number {
  const len = u.text.length;
  let fit = 0;
  let over = len;
  for (let step = 1; fit + step < len; step *= 2) {
    if (prefixWidth(u, fit + step, letterSpacingPx) > room + FIT_EPS) {
      over = fit + step;
      break;
    }
    fit += step;
  }
  if (over === len && u.width <= room + FIT_EPS) return len;
  while (over - fit > 1) {
    const mid = (fit + over) >> 1;
    if (prefixWidth(u, mid, letterSpacingPx) > room + FIT_EPS) over = mid;
    else fit = mid;
  }
  return over;
}

/** How many characters of the rest of a run are measured with what
 *  follows the cut (see {@link runTail}), as `REST_WINDOW` of
 *  `measure/rich.ts`. */
const TAIL_WINDOW = 32;

/** The rest of a run after its first `from` UTF-16 units (`cutWidth` px).
 *
 *  In a document shaped in its own language the rest is as wide as the
 *  text that opens the next line (#770), not the run less what stayed
 *  above: the browser measured the run whole, and what the face draws
 *  across the cut is not painted on either line. The address of the
 *  GB/T 7714 paper, cut before `.w3.org/TR/clreq/`, left that rest
 *  1.67 px (0.82 pt) narrower than it is painted alone. Its first
 *  {@link TAIL_WINDOW} characters are measured from the cut and the
 *  others as the run grew by them, so a run many lines long still costs
 *  what a line of it does. Vertical text keeps the widths it had. */
function runTail(u: Unit, from: number, cutWidth: number, letterSpacingPx: number): Unit {
  const tail = u.text.slice(from);
  let width = u.width - cutWidth;
  if (getMeasureLanguage() !== undefined && getMeasureWritingMode() !== 'vertical-rl') {
    let end = Math.min(u.text.length, from + TAIL_WINDOW);
    if (end < u.text.length && (u.text.charCodeAt(end) & 0xFC00) === 0xDC00) end++;
    const head = u.text.slice(from, end);
    const own = textWidth(head, u.style.font, u.style.smallCaps) + (letterSpacingPx === 0 ? 0 : letterSpacingPx * graphemeCount(head));
    width = end === u.text.length ? own : own + u.width - prefixWidth(u, end, letterSpacingPx);
  }
  return {
    ...u,
    text: tail,
    width,
    graphemes: u.graphemes - graphemeCount(u.text.slice(0, from)),
    first: cjkClassOf(tail),
    at: u.at + from,
    glueBefore: false,
    zwspBefore: false,
  };
}

/** Cut a web address at its last joint (after a slash, before a dot…)
 *  whose head fits `room`: nothing is added at the break. Only the joints
 *  before the first character that does not fit are tried. */
function cutAtJoint(u: Unit, room: number, letterSpacingPx: number): { head: Unit; tail: Unit } | null {
  const over = overflowAt(u, room, letterSpacingPx);
  const joints = urlBreakIndices(u.text.slice(0, Math.min(u.text.length, over + CUT_CONTEXT)));
  for (let j = joints.length - 1; j >= 0; j--) {
    const idx = joints[j]!;
    if (idx >= over) continue;
    const head = u.text.slice(0, idx);
    const w = prefixWidth(u, idx, letterSpacingPx);
    if (w > room + FIT_EPS) continue;
    return {
      head: { ...u, text: head, width: w, graphemes: graphemeCount(head), last: cjkClassOf(lastGrapheme(head)), url: false },
      tail: runTail(u, idx, w, letterSpacingPx),
    };
  }
  return null;
}

/** Divide a Western run wider than the whole line (see `emergencySplit`):
 *  at a dictionary syllable with a hyphen, else at the last character that
 *  fits. Only the run up to a little past the first character that does not
 *  fit is handed to the divider, so each line of a long run costs what the
 *  line holds. */
function divideRun(u: Unit, room: number, letterSpacingPx: number): { head: Unit; tail: Unit; hyphen: boolean; hard: boolean } | null {
  const end = Math.min(u.text.length, overflowAt(u, room, letterSpacingPx) + CUT_CONTEXT);
  const text = end === u.text.length ? u.text : u.text.slice(0, end);
  const width = end === u.text.length ? u.width : prefixWidth(u, end, letterSpacingPx);
  const token: RichToken = {
    text,
    bold: u.style.bold,
    italic: u.style.italic,
    kind: 'text',
    width,
    ...(u.style.smallCaps ? { smallCaps: true } : {}),
  };
  const split = emergencySplit(token, u.style.font, letterSpacingPx, room);
  if (!split) return null;
  const headText = split.head.text;
  const hyphen = headText.length > 0 && headText.endsWith('-') && !u.text.startsWith(headText);
  // Where the rest starts (past a no-break space the divider parted at)
  // and the advance of what comes before it.
  const from = text.length - split.tail.text.length;
  return {
    head: { ...u, text: headText, width: split.head.width, graphemes: graphemeCount(headText), last: cjkClassOf(lastGrapheme(headText)), url: false },
    // What stayed on the line: the truncated text less its rest, or, where
    // that rest was measured as a text of its own (#770), the advance of
    // the characters before it.
    tail: runTail(u, from, split.tail.ownPieces !== undefined ? prefixWidth(u, from, letterSpacingPx) : width - split.tail.width, letterSpacingPx),
    hyphen,
    hard: split.hard === true,
  };
}

/**
 * Break the units into lines, first fit with push-out: a line takes units
 * while they fit its measure less `reserve`; the unit that does not fit
 * opens the next line when a break before it is allowed, else (when the
 * composition cannot push it in or hang it) the line ends
 * at the last allowed break (the characters after it go down with the
 * unit). A space never overflows: the line ends before it, when the line
 * may break after it. A unit wider
 * than the whole line is divided when it is a Western run (a web address
 * at a joint first), else set on a line of its own. `pull` names a line
 * that takes in the rest of the paragraph when the line can give up the
 * blank for it (push-in, to save a last line of one character).
 */
export function breakUnits(
  units: readonly Unit[],
  breaks: Uint8Array,
  measureOf: (line: number) => number,
  reserve: number,
  letterSpacingPx: number,
  fit?: LineFit,
  level: CjkLineBreakLevel = getCjkLineBreak(),
  /** End line `line` before unit `at` (a break), whatever else fits. */
  stop?: { line: number; at: number },
  /** Line `pull` takes every unit left when it can give up the blank. */
  pull?: number,
  /** Under `keep-all` (`breaks` holds only the breaks between phrases): the
   *  breaks the level allows between any two characters, where a phrase
   *  longer than the line is broken. */
  emergency?: Uint8Array,
): LineRange[] {
  const out: LineRange[] = [];
  const n = units.length;
  let i = 0;
  let carried: Unit | undefined;
  let carriedAt = -1;
  const unitAt = (k: number): Unit => (k === carriedAt && carried ? carried : units[k]!);
  // A warichu note's characters on the line take the advance of their two
  // rows (`foldWidth`), not their sum: where the note's part on this line
  // starts, and the line's width before it.
  let noteFrom = -1;
  let noteBase = 0;
  const foldOf = (from: number, to: number): number => {
    const widths: number[] = [];
    const startNo: boolean[] = [];
    const endNo: boolean[] = [];
    for (let q = from; q <= to; q++) {
      const uq = unitAt(q);
      widths.push(uq.width);
      startNo.push(noteRowStartProhibited(uq, level));
      endNo.push(endProhibited(uq, level));
    }
    return foldWidth(widths, splitNote(widths, startNo, endNo));
  };
  // A Japanese ruby base at a line edge widens the line (`rubyGrow`): at
  // its start, and at its end when the line may end after it.
  const endGrow = (k: number): number => {
    const g = unitAt(k).rubyGrow;
    if (!g || g.end <= 0) return 0;
    return k + 1 >= n || breaks[k + 1] || units[k + 1]!.kind === 'space' ? g.end : 0;
  };
  for (let li = 0; ; li++) {
    while (i < n && unitAt(i).kind === 'space') i++;
    if (i >= n) break;
    const max = measureOf(li) - reserve;
    let w = Math.max(0, unitAt(i).rubyGrow?.start ?? 0);
    let lastBreak = -1;
    let end = -1;
    let head: Unit | undefined;
    let tail: Unit | undefined;
    let hyphenated = false;
    let hardHyphen = false;
    let hang = false;
    // What the line could give up to take one more character (push-in).
    let give = 0;
    for (let k = i; k < n; k++) {
      if (stop && stop.line === li && k >= stop.at) {
        end = k;
        break;
      }
      const u = unitAt(k);
      if (k > i && breaks[k]) lastBreak = k;
      if (u.note) {
        if (k === i || unitAt(k - 1).note !== u.note) {
          noteFrom = k;
          noteBase = w;
        }
        const folded = noteBase + foldOf(noteFrom, k);
        if (folded <= max + FIT_EPS) {
          w = folded;
          continue;
        }
        // The part no longer folds into the line: the line ends here or at
        // the last break before, never taking the character at its own
        // advance (the fold of a part is not monotonic, so every part the
        // line may end with was one that folded).
      }
      const lead = fit && k === i ? fit.lead(u) : 0;
      if (!u.note && w + u.width - lead - (fit ? fit.tail(u) : 0) + endGrow(k) <= max + FIT_EPS) {
        w += u.width - lead;
        if (fit) give += fit.give(u, k === i, false);
        continue;
      }
      if (fit && k > i && u.kind !== 'space' && !u.note) {
        // A pause or stop mark that does not fit hangs past the measure:
        // at once under 'force', after compressing the line failed under
        // 'allow'. Else, when the unit may not open the next line (no
        // break before it), the line gives up blank to take it and what
        // must stay with it (push-in, clreq §6.2.2.3), before it would
        // push characters down. A unit that may open a line goes down and
        // the line is spread: compressing marks to take one more
        // character there would narrow Kaiming's stop marks inside the
        // line.
        const canHang = fit.hanging !== 'none' && groupEnd(units, breaks, k) === k && fit.hangs(units, k, unitAt);
        if (canHang && fit.hanging === 'force') {
          end = k + 1;
          hang = true;
          break;
        }
        const m = pull === li ? n - 1 : breaks[k] ? -1 : groupEnd(units, breaks, k);
        if (m >= k) {
          let width = w;
          let room = give;
          for (let q = k; q <= m; q++) {
            const uq = unitAt(q);
            const t = q === m ? fit.tail(uq) - endGrow(q) : 0;
            width += uq.width - t;
            room += fit.give(uq, false, q === m);
          }
          if (width - room <= max + FIT_EPS) {
            end = m + 1;
            break;
          }
        }
        if (canHang) {
          end = k + 1;
          hang = true;
          break;
        }
      }
      if (u.kind === 'space') {
        // The line ends before the space when it may break after it; else
        // it gives up characters to the next line, as for any other unit.
        let m = k + 1;
        while (m < n && units[m]!.kind === 'space') m++;
        if (m >= n || breaks[m]) {
          end = k;
          break;
        }
      }
      if (u.url) {
        const cut = cutAtJoint(u, max - w, letterSpacingPx);
        if (cut) {
          end = k;
          head = cut.head;
          tail = cut.tail;
          hyphenated = true;
          hardHyphen = false;
          break;
        }
      }
      if (k > i && breaks[k]) {
        end = k;
        break;
      }
      if (lastBreak > i) {
        end = lastBreak;
        break;
      }
      if (k === i) {
        if (u.run) {
          const split = divideRun(u, max, letterSpacingPx);
          if (split) {
            end = k;
            head = split.head;
            tail = split.tail;
            hyphenated = true;
            hardHyphen = split.hard;
            break;
          }
        }
        end = k + 1;
        break;
      }
      if (emergency) {
        // A phrase longer than the line (keep-all): it is broken inside,
        // at the last place the level allows.
        let q = k;
        while (q > i && !emergency[q]) q--;
        if (q > i) {
          end = q;
          break;
        }
      }
      // Nothing on the line may end it: break before the unit anyway.
      end = k;
      break;
    }
    if (end < 0) end = n;
    out.push({
      start: i,
      end,
      ...(carriedAt === i && carried ? { first: carried } : {}),
      ...(head ? { head } : {}),
      hyphenated,
      ...(hardHyphen ? { hardHyphen: true } : {}),
      ...(hang ? { hang: true } : {}),
    });
    if (tail) {
      carried = tail;
      carriedAt = end;
    } else if (carriedAt < end) {
      carried = undefined;
      carriedAt = -1;
    }
    i = end;
  }
  return out;
}
