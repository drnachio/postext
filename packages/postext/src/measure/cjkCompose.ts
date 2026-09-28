/**
 * The CJK line composer: Chinese (and Japanese, Korean) paragraphs, on both
 * the plain and the formatted path, broken between characters under the
 * clreq prohibitions of the document's `cjk.lineBreak` and, when justified,
 * spread between characters.
 *
 * Linear in the paragraph: every unit (one grapheme, a Western run a line
 * never breaks inside, a 2-em dash or ellipsis, an atomic box) is measured
 * once — the width cache holds single characters, not prefixes — and the
 * breaker walks the units once with a running width. A line that would
 * start with a prohibited mark gives up characters to the next line
 * (push-out), back to the last break the rules allow.
 *
 * Justification (clreq §6.2.2.4): a justified line that is not its
 * paragraph's last is stretched to the measure — word spaces first, up to
 * ½ em each, then every gap between characters equally, never inside a
 * Western run (a word, a number with its signs), a 2-em dash or ellipsis,
 * and never next to a connector or a solidus. The spread is carried as
 * segment `tracking` (px after each grapheme, in the segment's width); a
 * Western run or a dash pair that a gap follows gives its last grapheme a
 * segment of its own. A line that needs more than the cap (½ em, or
 * `bodyText.maxJustifyTracking` when set) is set with the cap and flagged
 * `cjkLoose` and `ragged`; a line with no CJK character on it (the head of
 * a long web address) is set `ragged` without the flag.
 *
 * Segments: a Western run keeps one of its own, and single characters
 * share one only when they have one style, link and spacing and advance
 * alike, so a caret spread evenly over a segment lands on its characters
 * and a Markdown link covers only its own.
 */

import type { InlineSpan } from '../parse';
import type { VDTLine, VDTLineSegment } from '../vdt';
import { createBoundingBox } from '../vdt';
import { lineMeasure, type MeasuredBlock, type MeasureBlockOptions } from './types';
import { measureTextWidth, normalSpaceWidthFor } from './canvas';
import {
  atomicSpanToken,
  emergencySplit,
  expandSmallCaps,
  pickSpanFont,
  scriptMetrics,
  spanScriptFields,
  stackedScriptPairs,
  textWidth,
  tokenSegment,
  URL_LIKE_RE,
  urlBreakIndices,
  type PendingSegment,
  type RichToken,
} from './rich';
import {
  cjkBreakAllowed,
  cjkClassOf,
  getCjkLineBreak,
  isCjkGrapheme,
  isFullwidthAlnum,
  isFullwidthDigit,
  isLineEndProhibited,
  isLineStartProhibited,
  isWordInnerMark,
  type CjkClass,
  type CjkLineBreakLevel,
} from './cjkClasses';
import { hasCJK } from './cjk';
import { graphemeCount, graphemesOf, lastGrapheme } from './graphemes';
import { isBreakingSpace } from './spaces';
import { trimChipLineEdges } from './chipEdges';
import { cellAdvance, getMeasureWritingMode, withMeasureWritingMode } from './vertical';

/** Fit tolerance of the breaker (px): running sums of many widths may
 *  land a hair past a measure they fill exactly. */
const FIT_EPS = 1e-6;

const FONT_SIZE_RE = /(\d*\.?\d+)px/;

/** Letters of the scripts set without spaces (Han, kana, bopomofo, hangul),
 *  as {@link isCjkParagraph} counts them. */
const CJK_LETTER_RE = /[\u3005-\u3007\u3040-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3100-\u312F\u31A0-\u31BF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF66-\uFF9F\u{20000}-\u{3FFFF}]/u;

/**
 * Whether a paragraph is set by the CJK composer: it holds more CJK letters
 * than word spaces. A Latin paragraph that quotes a Chinese title or name
 * ("the novel 紅樓夢 was …") has more spaces, stays with Knuth–Plass and
 * breaks next to the characters it quotes; a Chinese paragraph with Latin
 * words in it ("用 iPhone 拍照") is composed.
 */
export function isCjkParagraph(text: string): boolean {
  let letters = 0;
  let spaces = 0;
  let inSpace = false;
  for (const ch of text) {
    if (isBreakingSpace(ch)) {
      if (!inSpace) spaces++;
      inSpace = true;
      continue;
    }
    inSpace = false;
    if (CJK_LETTER_RE.test(ch)) letters++;
  }
  return letters > spaces;
}

/** Whether the CJK composer sets a paragraph of this text: it holds CJK
 *  text (not only unit squares or marks Latin shares with Chinese) and more
 *  CJK letters than word spaces (see {@link isCjkParagraph}). Both
 *  measuring paths ask this, so they agree. */
export function composesAsCjk(text: string): boolean {
  return hasCJK(text) && isCjkParagraph(text);
}

/** The style a unit is painted in: every unit of a span shares it, and
 *  consecutive text units with the same `key` merge into one segment. */
interface UnitStyle {
  key: string;
  bold: boolean;
  italic: boolean;
  captionLabel?: boolean;
  script?: 'sup' | 'sub';
  scriptFont?: string;
  baselineShift?: number;
  smallCaps?: boolean;
  /** The font the unit is measured and painted with. */
  font: string;
}

/** What the composer breaks and spreads. */
interface Unit {
  kind: 'text' | 'space' | 'atomic';
  /** The text as painted (soft hyphens and zero-width spaces left out). */
  text: string;
  /** Advance in px, the block's tracking included. */
  width: number;
  /** Graphemes of `text`: the characters tracking spreads. */
  graphemes: number;
  first: CjkClass;
  last: CjkClass;
  /** Whether the first / last grapheme is a CJK character: a line may break
   *  next to it. */
  firstCjk: boolean;
  lastCjk: boolean;
  style: UnitStyle;
  /** Offset of the unit's first character in its span's text. */
  at: number;
  /** No break before this unit: a superscript, a subscript, a footnote
   *  marker or a `:ref` stays with the text it marks. */
  glueBefore?: boolean;
  /** A zero-width space before it: a break at any level. */
  zwspBefore?: boolean;
  /** An atomic unit's token (a chip, a formula, a swatch, a `:ref`, a
   *  footnote marker). */
  token?: RichToken;
  /** A run of Western text (a word, a number with its signs): no tracking
   *  inside, divided only when wider than a line. */
  run?: boolean;
  /** A web address: cut at its joints when it does not fit. */
  url?: boolean;
  /** One of a subscript and a superscript set over each other. */
  stacked?: 'first' | 'second';
  /** The Markdown link the unit is part of (its span and range), so a
   *  segment never holds linked and unlinked characters. */
  link?: string;
}

interface Fonts {
  normal: string;
  bold: string;
  italic: string;
  boldItalic: string;
}

function styleOf(span: InlineSpan, fonts: Fonts): UnitStyle {
  const script = spanScriptFields(span, fonts.normal, fonts.bold, fonts.italic, fonts.boldItalic);
  const font = script.scriptFont ?? pickSpanFont(span.bold, span.italic, fonts.normal, fonts.bold, fonts.italic, fonts.boldItalic);
  return {
    key: `${span.bold ? 'b' : ''}${span.italic ? 'i' : ''}${span.captionLabel ? 'c' : ''}${span.smallCaps ? 's' : ''}|${script.script ?? ''}|${font}|${script.baselineShift ?? ''}`,
    bold: span.bold,
    italic: span.italic,
    ...(span.captionLabel ? { captionLabel: true } : {}),
    ...script,
    ...(span.smallCaps ? { smallCaps: true } : {}),
    font,
  };
}

/** A grapheme set as a Chinese character here: a CJK grapheme, unless it
 *  is the apostrophe or the interpunct of a Latin word ("don’t", "l·l"). */
function isCjkHere(g: string, prev: string | undefined, next: string | undefined): boolean {
  return isCjkGrapheme(g) && !isWordInnerMark(g, prev, next);
}

/** Marks that pair up into one 2-em unit (破折号, 省略号). */
function pairable(g: string): boolean {
  return g === '\u2014' || g === '\u2015' || g === '\u2026' || g === '\u22EF'; // — ― … ⋯
}

/**
 * The units of a paragraph's spans, in order. `letterSpacingPx` (the
 * block's tracking) is measured into every width, per grapheme. In
 * `vertical` text a CJK character advances by its cell (`cellAdvance`).
 */
function buildUnits(spans: readonly InlineSpan[], fonts: Fonts, letterSpacingPx: number, vertical = false): Unit[] {
  const units: Unit[] = [];
  const track = (n: number): number => (letterSpacingPx === 0 ? 0 : letterSpacingPx * n);
  let zwsp = false;
  // Which units open a span and hold all of it (the candidates for stacked
  // scripts), by index.
  const wholeSpan = new Set<number>();

  for (let si = 0; si < spans.length; si++) {
    const span = spans[si]!;
    const atomic = atomicSpanToken(span, fonts.normal, fonts.bold, fonts.italic, fonts.boldItalic, letterSpacingPx);
    if (atomic) {
      const style = styleOf(span, fonts);
      const graphemes = graphemesOf(atomic.text);
      const object = atomic.chip !== undefined || atomic.mathRender !== undefined || atomic.swatch !== undefined;
      const firstG = graphemes[0] ?? '';
      const lastG = graphemes[graphemes.length - 1] ?? '';
      units.push({
        kind: 'atomic',
        text: atomic.text,
        width: atomic.width,
        graphemes: graphemes.length,
        first: object ? 'ideograph' : cjkClassOf(firstG),
        last: object ? 'ideograph' : cjkClassOf(lastG),
        firstCjk: object || isCjkGrapheme(firstG),
        lastCjk: object || isCjkGrapheme(lastG),
        style,
        at: 0,
        token: atomic,
        ...(atomic.refResourceId !== undefined || atomic.footnoteId !== undefined ? { glueBefore: true } : {}),
        ...(zwsp ? { zwspBefore: true } : {}),
      });
      zwsp = false;
      continue;
    }
    if (span.text.length === 0) continue;
    const style = styleOf(span, fonts);
    const graphemes = graphemesOf(span.text);
    const spanFirst = units.length;
    let run: string[] = [];
    let runAt = 0;
    let runLink: string | undefined;
    let space = '';
    let spaceAt = 0;
    // A lone mark that may pair with the next one (—, …), by unit index.
    let pairOpen = -1;
    let at = 0;
    // The link a character at `offset` of the span is part of: its span and
    // range, so two links to one target stay apart.
    const links = span.links;
    const linkAt = (offset: number): string | undefined => {
      if (!links || links.length === 0) return undefined;
      for (let li = 0; li < links.length; li++) {
        const l = links[li]!;
        if (offset >= l.start && offset < l.end) return `${si}:${li}`;
      }
      return undefined;
    };
    const push = (u: Omit<Unit, 'style' | 'glueBefore' | 'zwspBefore'>): void => {
      units.push({
        ...u,
        style,
        ...(zwsp ? { zwspBefore: true } : {}),
        ...(style.script && units.length === spanFirst ? { glueBefore: true } : {}),
      });
      zwsp = false;
    };
    const flushRun = (): void => {
      if (run.length === 0) return;
      const text = run.join('');
      const firstG = run[0]!;
      const lastG = run[run.length - 1]!;
      push({
        kind: 'text',
        text,
        width: textWidth(text, style.font, style.smallCaps) + track(run.length),
        graphemes: run.length,
        first: cjkClassOf(firstG),
        last: cjkClassOf(lastG),
        firstCjk: false,
        lastCjk: false,
        at: runAt,
        run: true,
        ...(URL_LIKE_RE.test(text) ? { url: true } : {}),
        ...(runLink !== undefined ? { link: runLink } : {}),
      });
      run = [];
      pairOpen = -1;
    };
    const flushSpace = (): void => {
      if (space === '') return;
      units.push({
        kind: 'space',
        text: space,
        width: measureTextWidth(space, style.font) + track(graphemeCount(space)),
        graphemes: graphemeCount(space),
        first: 'western',
        last: 'western',
        firstCjk: false,
        lastCjk: false,
        style,
        at: spaceAt,
      });
      space = '';
      pairOpen = -1;
    };
    for (let i = 0; i < graphemes.length; i++) {
      const g = graphemes[i]!;
      const gAt = at;
      at += g.length;
      if (isBreakingSpace(g[0])) {
        flushRun();
        if (space === '') spaceAt = gAt;
        space += g;
        continue;
      }
      flushSpace();
      if (g === '\u200B') {
        flushRun();
        zwsp = true;
        pairOpen = -1;
        continue;
      }
      // A soft hyphen: the composer breaks Western words only when they are
      // wider than the line, so it is left out, and the word stays whole.
      if (g === '\u00AD') continue;
      const link = linkAt(gAt);
      if (!isCjkHere(g, graphemes[i - 1], graphemes[i + 1])) {
        // A link that starts or ends inside a run cuts it: the two parts
        // still never part (neither is CJK) and take no space between them.
        if (run.length > 0 && link !== runLink) flushRun();
        if (run.length === 0) {
          runAt = gAt;
          runLink = link;
        }
        run.push(g);
        continue;
      }
      flushRun();
      // —— and …… are one unit of two ems; a third mark opens another.
      if (pairOpen >= 0 && units[pairOpen]!.text === g && !zwsp && units[pairOpen]!.link === link) {
        const u = units[pairOpen]!;
        u.text += g;
        u.width += cellAdvance(g, style.font, vertical, u.first) + track(1);
        u.graphemes = 2;
        u.first = u.last = g === '\u2026' || g === '\u22EF' ? 'ellipsis' : 'dash';
        pairOpen = -1;
        continue;
      }
      let cls = cjkClassOf(g);
      // A single em dash (or horizontal bar) joins two words as a connector
      // (clreq §6.1.1): never at a line start.
      if (g === '\u2014' || g === '\u2015') cls = 'connector';
      push({
        kind: 'text',
        text: g,
        width: (style.smallCaps && !vertical ? textWidth(g, style.font, true) : cellAdvance(g, style.font, vertical, cls)) + track(1),
        graphemes: 1,
        first: cls,
        last: cls,
        firstCjk: true,
        lastCjk: true,
        at: gAt,
        ...(link !== undefined ? { link } : {}),
      });
      pairOpen = pairable(g) ? units.length - 1 : -1;
    }
    flushRun();
    flushSpace();
    if (units.length === spanFirst + 1 && units[spanFirst]!.kind === 'text') wholeSpan.add(spanFirst);
  }

  // A subscript and a superscript that touch are set one over the other
  // (EF-80): the first advances nothing, the second the pair's advance, and
  // the two never part.
  if (units.some((u) => u.style.script)) {
    const scripts = units.map((u, i) => (wholeSpan.has(i) && u.style.script && !u.style.smallCaps ? u.style.script : undefined));
    for (const i of stackedScriptPairs(scripts)) {
      const a = units[i]!;
      const b = units[i + 1]!;
      const sub = a.style.script === 'sub' ? a : b;
      sub.style = {
        ...sub.style,
        key: `${sub.style.key}|stacked`,
        baselineShift: scriptMetrics(pickSpanFont(sub.style.bold, sub.style.italic, fonts.normal, fonts.bold, fonts.italic, fonts.boldItalic), 'sub', true).baselineShift,
      };
      b.width = Math.max(a.width, b.width);
      a.width = 0;
      a.stacked = 'first';
      b.stacked = 'second';
      b.glueBefore = true;
    }
  }
  return units;
}

const isDigitCode = (c: number): boolean => (c >= 0x30 && c <= 0x39) || isFullwidthDigit(c);

/** Whether a number keeps to the sign or unit next to it (`50 %`, `50％`,
 *  `￥５９９`, `−3 ℃`): a unit ending in a digit before a unit sign, or a
 *  currency or plus-minus sign before a digit. At every level. */
function numberGlue(a: Unit, b: Unit): boolean {
  if (a.kind !== 'text' || b.kind !== 'text') return false;
  if (b.first === 'postfix' && isDigitCode(a.text.charCodeAt(a.text.length - 1))) return true;
  return a.last === 'prefix' && isDigitCode(b.text.charCodeAt(0));
}

/** A fullwidth character unit (one grapheme, not a Western run) whose code
 *  point passes `test`. */
function fullwidthUnit(u: Unit | undefined, test: (cp: number) => boolean): boolean {
  return u !== undefined && u.kind === 'text' && !u.run && u.graphemes === 1 && test(u.text.charCodeAt(0));
}

/** Marks that join fullwidth digits into one number: a decimal point, a
 *  thousands separator, the colon of a time, the solidus of a fraction
 *  (３．１４, １２：３０, １／２). */
const isFullwidthNumberJoin = (cp: number): boolean => cp === 0xFF0E || cp === 0xFF0C || cp === 0xFF1A || cp === 0xFF0F;

/** Whether units `k - 1` and `k` belong to one fullwidth number or word
 *  (１２３, ＡＢＣ, ３．１４): each character is a unit of its own, spread
 *  like Han when the line is justified, but the line never breaks inside. */
function fullwidthGlue(units: readonly Unit[], k: number): boolean {
  const a = units[k - 1];
  const b = units[k];
  if (fullwidthUnit(a, isFullwidthAlnum) && fullwidthUnit(b, isFullwidthAlnum)) return true;
  if (fullwidthUnit(a, isFullwidthDigit) && fullwidthUnit(b, isFullwidthNumberJoin) && fullwidthUnit(units[k + 1], isFullwidthDigit)) return true;
  return fullwidthUnit(a, isFullwidthNumberJoin) && fullwidthUnit(b, isFullwidthDigit) && fullwidthUnit(units[k - 2], isFullwidthDigit);
}

/** Whether a line may break before each unit (index 0 is never a break).
 *  A word space is a break unless the unit after it may not open a line,
 *  the last one before it may not close one, or they are a number and its
 *  sign; a zero-width space is a break at every level. */
function breakOpportunities(units: readonly Unit[], level: CjkLineBreakLevel): Uint8Array {
  const out = new Uint8Array(units.length);
  // The last unit before `k` that is not a space.
  let ink = -1;
  for (let k = 1; k < units.length; k++) {
    const a = units[k - 1]!;
    const b = units[k]!;
    if (a.kind !== 'space') ink = k - 1;
    if (b.kind === 'space') continue;
    if (b.zwspBefore) {
      out[k] = 1;
      continue;
    }
    if (a.kind === 'space') {
      const p = ink >= 0 ? units[ink]! : undefined;
      if (!p || (!numberGlue(p, b) && !isLineStartProhibited(b.first, level) && !isLineEndProhibited(p.last, level))) out[k] = 1;
      continue;
    }
    if (b.glueBefore) continue;
    if (numberGlue(a, b) || fullwidthGlue(units, k)) continue;
    if (cjkBreakAllowed(a.last, a.lastCjk, b.first, b.firstCjk, level)) out[k] = 1;
  }
  return out;
}

/** Whether justification may add space between two units that touch on a
 *  line: between characters, never inside a Western run or a 2-em mark
 *  (those are single units), never between two Western runs, next to a
 *  connector or a solidus, after an atomic box, or before a mark that
 *  keeps to the text before it. Spaces take their own share. */
function gapStretches(a: Unit, b: Unit): boolean {
  if (a.kind !== 'text' || b.kind === 'space') return false;
  if (b.glueBefore || a.stacked) return false;
  if (a.last === 'connector' || a.last === 'solidus' || b.first === 'connector' || b.first === 'solidus') return false;
  if (!a.lastCjk && !b.firstCjk) return false;
  if (a.last === b.first && (a.last === 'dash' || a.last === 'ellipsis')) return false;
  return true;
}

/** One line as the breaker found it: units `start` to `end` (exclusive),
 *  the first replaced by `first` (the rest of a unit the line before cut)
 *  and `head` appended (the part of unit `end` that fits). */
interface LineRange {
  start: number;
  end: number;
  first?: Unit;
  head?: Unit;
  hyphenated: boolean;
  hardHyphen?: boolean;
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

/** The rest of a run after its first `from` UTF-16 units (`cutWidth` px). */
function runTail(u: Unit, from: number, cutWidth: number): Unit {
  const tail = u.text.slice(from);
  return {
    ...u,
    text: tail,
    width: u.width - cutWidth,
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
      tail: runTail(u, idx, w),
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
    tail: runTail(u, from, width - split.tail.width),
    hyphen,
    hard: split.hard === true,
  };
}

/**
 * Break the units into lines, first fit with push-out: a line takes units
 * while they fit its measure less `reserve`; the unit that does not fit
 * opens the next line when a break before it is allowed, else the line ends
 * at the last allowed break (the characters after it go down with the
 * unit). A space never overflows: the line ends before it, when the line
 * may break after it. A unit wider
 * than the whole line is divided when it is a Western run (a web address
 * at a joint first), else set on a line of its own.
 */
function breakUnits(
  units: readonly Unit[],
  breaks: Uint8Array,
  measureOf: (line: number) => number,
  reserve: number,
  letterSpacingPx: number,
): LineRange[] {
  const out: LineRange[] = [];
  const n = units.length;
  let i = 0;
  let carried: Unit | undefined;
  let carriedAt = -1;
  const unitAt = (k: number): Unit => (k === carriedAt && carried ? carried : units[k]!);
  for (let li = 0; ; li++) {
    while (i < n && unitAt(i).kind === 'space') i++;
    if (i >= n) break;
    const max = measureOf(li) - reserve;
    let w = 0;
    let lastBreak = -1;
    let end = -1;
    let head: Unit | undefined;
    let tail: Unit | undefined;
    let hyphenated = false;
    let hardHyphen = false;
    for (let k = i; k < n; k++) {
      const u = unitAt(k);
      if (k > i && breaks[k]) lastBreak = k;
      if (w + u.width <= max + FIT_EPS) {
        w += u.width;
        continue;
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

/** A segment being built: its texts, joined once it is done. */
interface Piece {
  seg: PendingSegment;
  parts: string[];
  /** Consecutive text units of this style, link and tracking may join it. */
  key: string | undefined;
  /** The advance of each character of a piece others may join: only
   *  characters that advance alike share a segment, so the Sandbox's caret
   *  can spread a segment's width evenly over its characters. */
  cell?: number;
}

interface ComposeContext {
  fonts: Fonts;
  textAlign: string;
  letterSpacingPx: number;
  em: number;
  cap: number;
  normalSpace: number;
  lineHeightPx: number;
  indentOf: (line: number) => number;
  measureOf: (line: number) => number;
  /** Vertical text: a Western run keeps the gap after it in its width. */
  vertical?: boolean;
}

/** The segments, text and flags of one line (see the module comment for
 *  the spreading). */
function composeLine(units: readonly Unit[], range: LineRange, li: number, isLast: boolean, ctx: ComposeContext): VDTLine {
  const us: Unit[] = [];
  for (let k = range.start; k < range.end; k++) us.push(k === range.start && range.first ? range.first : units[k]!);
  if (range.head) us.push(range.head);
  while (us.length > 0 && us[us.length - 1]!.kind === 'space') us.pop();

  const measure = ctx.measureOf(li);
  const justify = ctx.textAlign === 'justify' && !isLast;
  let spaceWidth: number | undefined;
  let tracking = 0;
  let loose = false;
  let spaceRatio: number | undefined;
  let ragged = false;
  const stretches: boolean[] = [];
  if (justify) {
    let content = 0;
    let spaces = 0;
    let natural = 0;
    let widest = 0;
    let gaps = 0;
    for (let j = 0; j < us.length; j++) {
      const u = us[j]!;
      content += u.width;
      if (u.kind === 'space') {
        spaces++;
        natural += u.width;
        widest = Math.max(widest, u.width);
      }
      const s = j < us.length - 1 && gapStretches(u, us[j + 1]!);
      stretches.push(s);
      if (s) gaps++;
    }
    let slack = measure - content;
    if (slack > FIT_EPS) {
      if (gaps > 0) {
        if (spaces > 0) {
          // Word spaces first, up to half an em each, all set alike.
          spaceWidth = Math.max(widest, Math.min((natural + slack) / spaces, Math.max(ctx.em / 2, widest)));
          slack -= spaceWidth * spaces - natural;
          if (ctx.normalSpace > 0) spaceRatio = spaceWidth / ctx.normalSpace;
        }
        if (slack > FIT_EPS) {
          tracking = slack / gaps;
          if (tracking > ctx.cap + 1e-9) {
            tracking = ctx.cap;
            loose = true;
          }
        }
      } else if (spaces > 0) {
        // No gap between characters: the spaces take it all, as in a Latin
        // line (the renderers stretch them).
        if (ctx.normalSpace > 0) spaceRatio = (natural + slack) / spaces / ctx.normalSpace;
      } else if (us.some((u) => u.kind === 'text' && (u.firstCjk || u.lastCjk))) {
        // A CJK character with nothing to spread against.
        loose = true;
      } else {
        // Western text only (the head of a web address, a divided word): set
        // ragged, as a Latin line of one word is, and not reported.
        ragged = true;
      }
    }
  }

  const pieces: Piece[] = [];
  const addText = (u: Unit, text: string, width: number, t: number | undefined): void => {
    // Single characters (not Western runs, which keep a segment each) of
    // one style, link and spacing that advance alike share a segment.
    const key = u.stacked || u.run || u.graphemes !== 1 ? undefined : `${u.style.key}|${u.link ?? ''}|${t ?? ''}`;
    const last = pieces[pieces.length - 1];
    if (key !== undefined && last && last.key === key && last.cell !== undefined && Math.abs(last.cell - width) < 1e-3) {
      last.parts.push(text);
      last.seg.width += width;
      return;
    }
    const s = u.style;
    const seg: PendingSegment = {
      kind: 'text',
      text: '',
      width,
      bold: s.bold || undefined,
      italic: s.italic || undefined,
      ...(s.captionLabel ? { captionLabel: true } : {}),
      ...(s.script ? { script: s.script, fontString: s.scriptFont, baselineShift: s.baselineShift } : {}),
      ...(u.stacked === 'first' ? { stacked: true } : {}),
      ...(s.smallCaps ? { smallCaps: true } : {}),
      ...(t !== undefined ? { tracking: t } : {}),
    };
    pieces.push({ seg, parts: [text], key, ...(key !== undefined ? { cell: width } : {}) });
  };
  for (let j = 0; j < us.length; j++) {
    const u = us[j]!;
    if (u.kind === 'space') {
      pieces.push({ seg: { kind: 'space', text: u.text, width: spaceWidth ?? u.width }, parts: [u.text], key: undefined });
      continue;
    }
    if (u.kind === 'atomic') {
      const seg = tokenSegment(u.token!);
      pieces.push({ seg, parts: [seg.text], key: undefined });
      continue;
    }
    const gap = tracking > 0 && stretches[j] ? tracking : 0;
    if (gap === 0) {
      addText(u, u.text, u.width, undefined);
    } else if (ctx.vertical && u.run) {
      // In vertical text a run is painted whole, its cells and sideways
      // letters as it was measured: the gap after it is advance only, and
      // cutting its last letter off would lose the neighbour an apostrophe
      // or an interpunct inside it is read with (`verticalRuns`).
      addText(u, u.text, u.width + gap, undefined);
    } else if (u.graphemes <= 1) {
      addText(u, u.text, u.width + gap, gap);
    } else {
      // A run the gap follows: its last grapheme carries the gap, the rest
      // keeps its natural spacing.
      const lastG = lastGrapheme(u.text);
      const head = u.text.slice(0, u.text.length - lastG.length);
      const headWidth = textWidth(head, u.style.font, u.style.smallCaps) + (ctx.letterSpacingPx === 0 ? 0 : ctx.letterSpacingPx * (u.graphemes - 1));
      addText(u, head, headWidth, undefined);
      addText(u, lastG, u.width - headWidth + gap, gap);
    }
  }
  const segments: VDTLineSegment[] = [];
  for (const p of pieces) {
    if (p.parts.length > 1 || p.seg.text === '') p.seg.text = p.parts.join('');
    segments.push(p.seg);
  }
  const trimmed = trimChipLineEdges(segments);
  let width = 0;
  for (const s of trimmed) width += s.width;
  const text = trimmed.map((s) => s.text).join('');
  const y = li * ctx.lineHeightPx;
  return {
    text,
    bbox: createBoundingBox(ctx.indentOf(li), y, width, ctx.lineHeightPx),
    baseline: y + ctx.lineHeightPx * 0.8,
    hyphenated: range.hyphenated,
    ...(range.hyphenated && range.hardHyphen ? { hardHyphen: true } : {}),
    segments: trimmed,
    isLastLine: isLast,
    ...(spaceRatio !== undefined && !loose ? { justifiedSpaceRatio: spaceRatio } : {}),
    ...(loose ? { ragged: true, cjkLoose: true } : ragged ? { ragged: true } : {}),
  };
}

/**
 * Set a Chinese, Japanese or Korean paragraph (see the module comment):
 * `options.cjkLineBreak` (else the document's level) decides where lines
 * may break; `textAlign: 'justify'` spreads every line but the last to the
 * measure. First-line and hanging indents, the block's tracking
 * (`letterSpacingPx`), other measures for later lines (`restWidths`) and a
 * positive `looseness` (one line more, for column balancing: the lines are
 * broken a little short of the measure and spread to it) are honoured;
 * Knuth–Plass options are not used.
 */
export function composeCjkParagraph(
  spans: InlineSpan[],
  normalFont: string,
  boldFont: string,
  italicFont: string,
  boldItalicFont: string,
  maxWidthPx: number,
  lineHeightPx: number,
  options: MeasureBlockOptions | undefined,
): MeasuredBlock {
  // A writing mode asked for this paragraph alone: the Latin runs' widths
  // (`textWidth`) read it too.
  if (options?.writingMode !== undefined && options.writingMode !== getMeasureWritingMode()) {
    const opts = options;
    return withMeasureWritingMode(opts.writingMode!, () => composeCjkParagraph(spans, normalFont, boldFont, italicFont, boldItalicFont, maxWidthPx, lineHeightPx, opts));
  }
  const fonts: Fonts = { normal: normalFont, bold: boldFont, italic: italicFont, boldItalic: boldItalicFont };
  const letterSpacingPx = options?.letterSpacingPx ?? 0;
  const vertical = getMeasureWritingMode() === 'vertical-rl';
  const units = buildUnits(spans, fonts, letterSpacingPx, vertical);
  if (!units.some((u) => u.kind !== 'space')) return { lines: [], totalHeight: 0 };
  const level = options?.cjkLineBreak ?? getCjkLineBreak();
  const breaks = breakOpportunities(units, level);
  const indentPx = options?.firstLineIndentPx ?? 0;
  const hanging = options?.hangingIndent ?? false;
  const indentOf = (li: number): number => (indentPx > 0 ? (hanging ? (li === 0 ? 0 : indentPx) : (li === 0 ? indentPx : 0)) : 0);
  const measureOf = (li: number): number => lineMeasure(maxWidthPx, options?.restWidths, li) - indentOf(li);
  const sizeMatch = FONT_SIZE_RE.exec(normalFont);
  const em = sizeMatch ? parseFloat(sizeMatch[1]!) : 16;
  const trackingCap = options?.justifyTrackingPx && options.justifyTrackingPx > 0 ? Math.min(em / 2, options.justifyTrackingPx) : em / 2;
  const textAlign = options?.textAlign ?? 'left';
  const ctx: ComposeContext = {
    fonts,
    textAlign,
    letterSpacingPx,
    em,
    cap: trackingCap,
    normalSpace: textAlign === 'justify' ? normalSpaceWidthFor(normalFont) + letterSpacingPx : 0,
    lineHeightPx,
    indentOf,
    measureOf,
    ...(vertical ? { vertical: true } : {}),
  };
  const compose = (ranges: LineRange[]): VDTLine[] => ranges.map((r, li) => composeLine(units, r, li, li === ranges.length - 1, ctx));

  let lines = compose(breakUnits(units, breaks, measureOf, 0, letterSpacingPx));
  // Column balancing asks for a paragraph one line longer: break each line
  // a little short of its measure, in eighths of an em, until the paragraph
  // gains the lines without a line past the tracking cap.
  const looseness = options?.looseness ?? 0;
  if (looseness > 0) {
    const target = lines.length + looseness;
    for (let step = 1; step <= 16; step++) {
      const ranges = breakUnits(units, breaks, measureOf, (step * em) / 8, letterSpacingPx);
      if (ranges.length < target) continue;
      if (ranges.length > target) break;
      const loose = compose(ranges);
      if (!loose.some((l) => l.cjkLoose)) {
        lines = loose;
        break;
      }
    }
  }
  if (lines.some((l) => l.segments?.some((s) => (s as PendingSegment).smallCaps))) {
    expandSmallCaps(lines, normalFont, boldFont, italicFont, boldItalicFont, letterSpacingPx);
  }
  return { lines, totalHeight: lines.length * lineHeightPx };
}

/** Where a word that holds CJK characters may break, and its widths: see
 *  {@link cjkWordBreaks}. */
export interface CjkWordBreaks {
  /** Offsets into the word a line may break at, ascending. */
  breaks: number[];
  /** The word's advance: the sum of its units'. */
  width: number;
  /** The advance of the word's first `idx` characters. */
  widthBefore: (idx: number) => number;
}

/**
 * The breaks of one word (no breaking space inside) that holds CJK
 * characters, in a paragraph set by the word-by-word breaker (a Latin
 * paragraph quoting CJK): next to its CJK characters, under the document's
 * line-break rules. Each unit is measured once and the widths before a
 * break come from their running sums, so a long run of ideographs costs
 * linear time.
 */
export function cjkWordBreaks(word: string, font: string, smallCaps: boolean | undefined, letterSpacingPx: number, level: CjkLineBreakLevel = getCjkLineBreak()): CjkWordBreaks {
  const span: InlineSpan = { text: word, bold: false, italic: false, ...(smallCaps ? { smallCaps: true } : {}) };
  const units = buildUnits([span], { normal: font, bold: font, italic: font, boldItalic: font }, letterSpacingPx, getMeasureWritingMode() === 'vertical-rl');
  const opportunities = breakOpportunities(units, level);
  const starts: number[] = [];
  const sums: number[] = [0];
  const breaks: number[] = [];
  let total = 0;
  for (let k = 0; k < units.length; k++) {
    const u = units[k]!;
    starts.push(u.at);
    if (k > 0 && opportunities[k]) breaks.push(u.at);
    total += u.width;
    sums.push(total);
  }
  const widthBefore = (idx: number): number => {
    // The last unit that starts at or before `idx`.
    let lo = 0;
    let hi = starts.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (starts[mid]! <= idx) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    if (found < 0) return 0;
    const u = units[found]!;
    const inside = idx - u.at;
    if (inside <= 0) return sums[found]!;
    if (inside >= u.text.length) return sums[found + 1]!;
    const part = u.text.slice(0, inside);
    return sums[found]! + textWidth(part, font, smallCaps) + (letterSpacingPx === 0 ? 0 : letterSpacingPx * graphemeCount(part));
  };
  return { breaks, width: total, widthBefore };
}
