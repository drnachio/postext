// Text first, then the balloon (SPEC D3.1): the lines of a balloon are
// chosen for shape — a diamond or lozenge block, the longest lines in the
// middle, no "parking space" (a last line much shorter than the others),
// no "sausage" (one long thin line) — at one fixed size. Candidate line
// sets come from a small dynamic programme per line count, aimed at an
// oval profile; each is scored on its aspect, its profile, its line count
// and how badly its breaks part words or phrases. Vertical text (Japanese,
// Traditional Chinese) is shaped the same way in columns of at most
// `maxColumnChars`. The winning lines are then set as an ordinary design
// text (one forced break per line), so bidi ordering, vertical cells, tcy
// and JLReq orientation come from the engine's design-text layout.

import { flowTextWidth, withMeasureWritingMode } from '../../measure/vertical';
import { graphemeCount } from '../../measure/graphemes';
import { buildFontString } from '../../measure';
import { joiningScriptIn } from '../../measure/joining';
import { hasJoiningScript } from '../../bidi';
import { hasCJK } from '../../measure/cjk';
import { parseRichDesignText, RichMeasurer } from '../../design/richText';
import { layoutTextElementAt } from '../../design/layout';
import { designBaseDirection } from '../../design/bidiText';
import { primitiveToBlock } from '../../pipeline/headerFooter';
import { cjkRegionOf, directionOf, isJapaneseLanguage, languageOf } from '../../locale';
import type { CjkLineBreakLevel } from '../../measure/cjkClasses';
import type { CjkRegion, ResolvedDesignTextElement } from '../../types';
import type { VDTDesignTextBlock } from '../../vdt';
import { breakPoints, hasMarks, markupOf, type BreakPoint, type PreparedText } from './text';
import { boundsOf } from './geom';
import type { LetteringStyle, Rect } from './types';

/** Settings of one shaping. */
export interface ShapeOptions {
  locale: string;
  vertical: boolean;
  dpi: number;
  /** Target aspect (text block width / height; height / width when
   *  vertical) overriding the style's (reshaping). */
  aspect?: number;
  cjkLineBreak?: CjkLineBreakLevel;
  cjkRegion?: CjkRegion;
  mirrored?: boolean;
  /** Longest line (column) allowed, px, below the style's own cap: a
   *  balloon reshaped to fit a short or narrow panel. */
  maxLength?: number;
}

/** A shaped text: its design text block laid out with the top left corner
 *  of its box at (0, 0), the ink of every line, and how it was chosen. */
export interface ShapedText {
  block: VDTDesignTextBlock;
  /** Ruby readings over (beside) their bases, same frame as `block`. */
  rubies?: VDTDesignTextBlock[];
  vertical: boolean;
  /** Ranges of the prepared text per line (column). */
  lines: { start: number; end: number; width: number }[];
  /** Ink box of every line (column), relative to the block's origin. */
  ink: Rect[];
  inkBox: Rect;
  em: number;
  lineHeightPx: number;
  /** Aspect of the text block as scored. */
  aspect: number;
  score: number;
}

/** Default target aspects of a text block. */
export const DEFAULT_ASPECT_HORIZONTAL = 1.8;
export const DEFAULT_ASPECT_VERTICAL = 1.3;

/** The CJK line-break level of a locale when the book names none: the
 *  strictest Japanese one (no column opens with a small kana or ー; balloon
 *  columns are short, and break at phrases anyway), GB/T for Chinese. */
export function defaultCjkLineBreak(locale: string): CjkLineBreakLevel {
  return isJapaneseLanguage(locale) ? 'ja-very-strict' : 'gb';
}

/** The fraction of the widest line a line `i` of `n` takes in an oval
 *  block: the chord of a superellipse at the line's middle, the ends kept
 *  off zero. */
export function ovalProfile(i: number, n: number): number {
  if (n <= 1) return 1;
  const y = ((i + 0.5) / n) * 2 - 1;
  const k = n / (n + 0.8);
  return Math.pow(Math.max(0, 1 - Math.pow(Math.abs(y * k), 2.2)), 1 / 2.2);
}

interface Measurer {
  width(a: number, b: number): number;
  /** Markup of the whole text, when it is set with inline marks. */
  rich: boolean;
}

function fontSpec(style: LetteringStyle) {
  return {
    family: style.fontFamily,
    sizePx: style.fontSizePx,
    weight: style.fontWeight ?? 400,
    italic: style.italic ?? false,
  };
}

function fontString(style: LetteringStyle): string {
  const w = style.fontWeight ?? 400;
  return buildFontString(style.fontFamily, style.fontSizePx, w === 400 ? 'normal' : String(w), style.italic ? 'italic' : 'normal');
}

/** Markup of the whole prepared text, paragraph by paragraph (a marker
 *  never runs across a forced break). */
function wholeMarkup(p: PreparedText): string {
  const parts: string[] = [];
  let a = 0;
  for (let i = 0; i <= p.text.length; i++) {
    if (i === p.text.length || p.text[i] === '\n') {
      parts.push(markupOf(p, a, i));
      a = i + 1;
    }
  }
  return parts.join('\n');
}

/** Tracking a text is set with: none for a joining script (Arabic). */
function trackingOf(p: PreparedText, style: LetteringStyle): number {
  const t = style.letterSpacing ?? 0;
  return Number.isFinite(t) && !joiningScriptIn(p.text) ? t : 0;
}

/** A measurer of line widths over the prepared text, in the writing mode
 *  in force (call inside `withMeasureWritingMode`). Rich text is measured
 *  through the design-text measurer of its own markup, so that what is
 *  measured is what the layout sets; a markup that does not read back to
 *  the same text falls back to plain. */
function measurerFor(p: PreparedText, style: LetteringStyle): Measurer {
  const tracking = trackingOf(p, style);
  const memo = new Map<number, number>();
  const key = (a: number, b: number) => a * 100003 + b;
  if (hasMarks(p)) {
    const rt = parseRichDesignText(wholeMarkup(p), fontSpec(style));
    if (rt.text === p.text) {
      const m = new RichMeasurer(rt, tracking);
      return {
        rich: true,
        width(a, b) {
          const k = key(a, b);
          let w = memo.get(k);
          if (w === undefined) memo.set(k, (w = a >= b ? 0 : m.measure(a, b)));
          return w;
        },
      };
    }
  }
  const font = fontString(style);
  return {
    rich: false,
    width(a, b) {
      const k = key(a, b);
      let w = memo.get(k);
      if (w === undefined) {
        const s = p.text.slice(a, b).replace(/[\u2066-\u2069]/g, '');
        memo.set(k, (w = a >= b ? 0 : Math.max(0, flowTextWidth(s, font) + tracking * graphemeCount(s))));
      }
      return w;
    },
  };
}

interface Candidate {
  breaks: number[];
  lines: { start: number; end: number; width: number }[];
  score: number;
  aspect: number;
}

/**
 * The best breaks for `n` lines aimed at a block `W` wide with an oval
 * profile (dynamic programme over the legal breaks). Forced breaks are
 * always taken. Undefined when `n` lines cannot hold the text that way.
 */
function bestBreaksFor(
  pts: readonly BreakPoint[],
  m: Measurer,
  n: number,
  W: number,
  maxLen: number,
  penaltyWeight: number,
  lone: (a: number, b: number) => number,
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
      const start = j === 0 ? 0 : pts[j]!.next;
      for (let k = j + 1; k < P; k++) {
        const pt = pts[k]!;
        const w = m.width(start, pt.end);
        // The same weights as `scoreLines`, so that the programme looks
        // for what the score rewards.
        let c = (12 / n) * ((w - target) / W) ** 2 + pt.penalty * penaltyWeight + lone(start, pt.end);
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

/** Line sets for every line count, each scored; the best first. */
function candidatesFor(
  p: PreparedText,
  pts: readonly BreakPoint[],
  m: Measurer,
  em: number,
  pitch: number,
  vertical: boolean,
  target: number,
  maxLen: number,
  penaltyWeight: number,
): Candidate[] {
  const all = [{ end: 0, next: 0, penalty: 0, forced: false }, ...pts];
  const lone = loneLinePenalty(p, all);
  const cjk = hasCJK(p.text);
  const total = m.width(0, p.text.length);
  const forcedCount = pts.filter((x) => x.forced).length;
  const nMax = Math.max(forcedCount, Math.min(16, pts.length, Math.ceil(total / (1.5 * em)) + forcedCount));
  const out: Candidate[] = [];
  const seen = new Set<string>();
  for (let n = forcedCount; n <= nMax; n++) {
    let mean = 0;
    for (let i = 0; i < n; i++) mean += ovalProfile(i, n);
    mean /= n;
    const base = total / n / mean;
    for (const f of [0.85, 0.95, 1.05, 1.15, 1.3]) {
      const W = Math.min(base * f, maxLen);
      const br = bestBreaksFor(all, m, n, W, maxLen, penaltyWeight, lone);
      if (!br) continue;
      const sig = br.join(',');
      if (seen.has(sig)) continue;
      seen.add(sig);
      const lines = br.map((k, i) => {
        const start = i === 0 ? 0 : all[br[i - 1]!]!.next;
        const end = all[k]!.end;
        return { start, end, width: m.width(start, end) };
      });
      const { score, aspect } = scoreLines(lines, all, br, em, pitch, vertical, target, maxLen, penaltyWeight, lone, cjk);
      out.push({ breaks: br, lines, score, aspect });
    }
  }
  out.sort((a, b) => a.score - b.score || a.lines.length - b.lines.length);
  return out;
}

/** The writing mode a style sets its text in on a panel. */
export function styleIsVertical(style: LetteringStyle, panelVertical: boolean): boolean {
  if (style.writingMode === 'horizontal') return false;
  if (style.writingMode === 'vertical') return true;
  return panelVertical;
}

/** The base direction of a balloon text: its first strong letter, else
 *  the locale's. */
function baseDirection(text: string, locale: string): 'ltr' | 'rtl' {
  return designBaseDirection('auto', text, directionOf(locale));
}

/** Ascent and descent of a line's ink, in em, by script. */
function inkMetrics(text: string): { asc: number; desc: number } {
  if (hasJoiningScript(text)) return { asc: 0.82, desc: 0.42 };
  if (hasCJK(text)) return { asc: 0.88, desc: 0.12 };
  return { asc: 0.74, desc: /[gjpqyQ,;()[\]{}]/.test(text) ? 0.21 : 0.05 };
}

/**
 * Shape a prepared text and set it: the best line set for the style's
 * aspect (or `opts.aspect`), laid out as a design text block at (0, 0).
 * Lengths are page px.
 */
export function shapeText(p: PreparedText, style: LetteringStyle, opts: ShapeOptions): ShapedText {
  return shapeTextCandidates(p, style, opts, 1)[0]!;
}

/** The `count` best shapings (distinct line sets), best first. */
export function shapeTextCandidates(p: PreparedText, style: LetteringStyle, opts: ShapeOptions, count: number): ShapedText[] {
  const vertical = opts.vertical;
  const em = style.fontSizePx;
  const pitch = em * style.lineHeight;
  const lang = languageOf(opts.locale);
  const level = opts.cjkLineBreak ?? defaultCjkLineBreak(opts.locale);
  const region: CjkRegion = opts.cjkRegion ?? cjkRegionOf(opts.locale) ?? (lang === 'ja' ? 'japan' : 'mainland');
  const target = opts.aspect ?? style.aspect ?? (vertical ? DEFAULT_ASPECT_VERTICAL : DEFAULT_ASPECT_HORIZONTAL);
  const ownMax = vertical ? (style.maxColumnChars ?? 8) * em + 0.01 : Number.POSITIVE_INFINITY;
  const maxLen = opts.maxLength !== undefined && opts.maxLength > 0 ? Math.min(ownMax, Math.max(opts.maxLength, 1.01 * em)) : ownMax;
  const pts = breakPoints(p, level, lang === 'ja');
  const mode = vertical ? 'vertical-rl' : 'horizontal-tb';
  const { cands, rich } = withMeasureWritingMode(mode, () => {
    const m = measurerFor(p, style);
    // Japanese phrase breaks weigh more than a perfect profile: columns
    // move by whole characters.
    const penaltyWeight = lang === 'ja' ? 1 : 0.5;
    return { cands: candidatesFor(p, pts, m, em, pitch, vertical, target, maxLen, penaltyWeight), rich: m.rich };
  }, region);
  const out: ShapedText[] = [];
  for (const c of cands.slice(0, Math.max(1, count))) {
    out.push(setLines(p, style, opts, c, { vertical, em, pitch, region, rich }));
  }
  return out;
}

/** Set a chosen line set as a design text block at (0, 0). */
function setLines(
  p: PreparedText,
  style: LetteringStyle,
  opts: ShapeOptions,
  c: Candidate,
  ctx: { vertical: boolean; em: number; pitch: number; region: CjkRegion; rich: boolean },
): ShapedText {
  const { vertical, em, region, rich } = ctx;
  const content = c.lines.map((l) => (rich ? markupOf(p, l.start, l.end) : p.text.slice(l.start, l.end))).join('\n');
  const direction = vertical ? 'ltr' : baseDirection(p.text, opts.locale);
  const el: ResolvedDesignTextElement = {
    kind: 'text',
    id: 'balloon',
    parity: 'all',
    placement: { anchor: { to: 'container', edge: 'top-left' } },
    content,
    fontFamily: style.fontFamily,
    fontSize: { value: em, unit: 'px' },
    fontWeight: style.fontWeight ?? 400,
    italic: style.italic ?? false,
    color: { hex: style.color, model: 'hex' },
    align: style.align === 'start' ? 'start' : 'center',
    verticalAlign: 'top',
    lineHeight: style.lineHeight,
    ...(style.letterSpacing ? { letterSpacing: { value: style.letterSpacing, unit: 'px' as const } } : {}),
    overflow: 'wrap',
    hyphenate: false,
    ...(rich ? { inlineMarks: true } : {}),
    direction,
    ...(vertical ? { writingMode: 'vertical-rl' as const } : {}),
  };
  const block = stripIsolates(withMeasureWritingMode('horizontal-tb', () => {
    const prim = layoutTextElementAt(el, content, 0, 0, opts.dpi, { direction, mirrored: opts.mirrored === true });
    return primitiveToBlock(prim) as VDTDesignTextBlock;
  }, region));
  const ink = inkOf(block, em, vertical);
  const rubies = rubyBlocks(p, style, opts, c, block, ink, ctx);
  for (const r of rubies) ink.push({ ...r.bbox });
  return {
    block,
    ...(rubies.length ? { rubies } : {}),
    vertical,
    lines: c.lines,
    ink,
    inkBox: boundsOf(ink.flatMap((r) => [{ x: r.x, y: r.y }, { x: r.x + r.width, y: r.y + r.height }])),
    em,
    lineHeightPx: ctx.pitch,
    aspect: c.aspect,
    score: c.score,
  };
}

/** A block with the isolate controls of its text taken out (they set the
 *  bidi order of the lines and print nothing). */
function stripIsolates(block: VDTDesignTextBlock): VDTDesignTextBlock {
  const re = /[\u2066-\u2069]/g;
  if (!block.lines.some((l) => /[\u2066-\u2069]/.test(l.text))) return block;
  return {
    ...block,
    lines: block.lines.map((l) => ({
      ...l,
      text: l.text.replace(re, ''),
      ...(l.runs ? { runs: l.runs.map((r) => ({ ...r, text: r.text.replace(re, '') })) } : {}),
    })),
  };
}

/**
 * The ruby (furigana) of a shaped text as small design-text blocks: each
 * reading at half the text's size, centred over its base in horizontal
 * lines and beside it (to the right) in columns, in the gap the leading
 * leaves. A group ruby is one reading over its whole run; a mono ruby one
 * reading per character. Lines a bidi run reorders take none.
 */
function rubyBlocks(
  p: PreparedText,
  style: LetteringStyle,
  opts: ShapeOptions,
  c: Candidate,
  block: VDTDesignTextBlock,
  ink: readonly Rect[],
  ctx: { vertical: boolean; em: number; region: CjkRegion; rich: boolean },
): VDTDesignTextBlock[] {
  if (!p.style.some((st) => st.ruby)) return [];
  const { vertical, em, region } = ctx;
  const size = em * 0.5;
  const out: VDTDesignTextBlock[] = [];
  const printed = block.lines.filter((l) => l.text.length > 0);
  withMeasureWritingMode(vertical ? 'vertical-rl' : 'horizontal-tb', () => {
    const m = measurerFor(p, style);
    c.lines.forEach((line, li) => {
      const pl = printed[li];
      const box = ink[li];
      if (!pl || !box || pl.order || pl.runs?.some((r) => r.rtl)) return;
      let k = line.start;
      while (k < line.end) {
        const r = p.style[k]!.ruby;
        if (!r) {
          k++;
          continue;
        }
        let e = k + 1;
        if (r.group) while (e < line.end && p.style[e]!.ruby?.id === r.id) e++;
        const from = m.width(line.start, k);
        const to = m.width(line.start, e);
        const reading = r.text;
        const el: ResolvedDesignTextElement = {
          kind: 'text', id: 'ruby', parity: 'all',
          placement: { anchor: { to: 'container', edge: 'top-left' } },
          content: reading,
          fontFamily: style.fontFamily,
          fontSize: { value: size, unit: 'px' },
          fontWeight: style.fontWeight ?? 400,
          italic: false,
          color: { hex: style.color, model: 'hex' },
          align: 'center', verticalAlign: 'top', lineHeight: 1,
          overflow: 'wrap', hyphenate: false, direction: 'ltr',
          ...(vertical ? { writingMode: 'vertical-rl' as const } : {}),
        };
        const rb = withMeasureWritingMode('horizontal-tb', () => primitiveToBlock(layoutTextElementAt(el, reading, 0, 0, opts.dpi, {})) as VDTDesignTextBlock, region);
        let dx: number;
        let dy: number;
        if (vertical) {
          // Beside the column, centred along its run.
          dx = box.x + box.width + 0.04 * em - rb.bbox.x;
          dy = box.y + (from + to) / 2 - (rb.bbox.y + rb.bbox.height / 2);
        } else {
          dx = block.bbox.x + pl.xOffset + (from + to) / 2 - (rb.bbox.x + rb.bbox.width / 2);
          dy = box.y - 0.06 * em - (rb.bbox.y + rb.bbox.height) + 0.12 * size;
        }
        out.push({ ...translateBlock(rb, dx, dy), artifact: true });
        k = e;
      }
    });
  }, region);
  return out;
}

/** The ink box of every line (column) of a laid-out block. */
export function inkOf(block: VDTDesignTextBlock, em: number, vertical: boolean): Rect[] {
  const b = block.bbox;
  if (vertical) {
    const family = Object.keys(block.vertical?.centralBaselines ?? {})[0];
    const central = (family !== undefined ? block.vertical?.centralBaselines[family] : undefined) ?? 0.38;
    return block.lines.filter((l) => l.text.length > 0).map((l) => {
      const cx = b.x + b.width - (l.baselineY - central * em);
      return { x: cx - em / 2, y: b.y + l.xOffset, width: em, height: l.width };
    });
  }
  const tracking = block.letterSpacingPx ?? 0;
  return block.lines.filter((l) => l.text.length > 0).map((l) => {
    const { asc, desc } = inkMetrics(l.text);
    const w = Math.max(0, l.width - (tracking && l.text.length ? tracking : 0));
    return { x: b.x + l.xOffset, y: l.baselineY - asc * em, width: w, height: (asc + desc) * em };
  });
}

/** A copy of a block moved by (dx, dy): horizontal baselines are page
 *  coordinates, vertical ones are measured from the box. */
export function translateBlock(block: VDTDesignTextBlock, dx: number, dy: number): VDTDesignTextBlock {
  return {
    ...block,
    bbox: { ...block.bbox, x: block.bbox.x + dx, y: block.bbox.y + dy },
    lines: block.lines.map((l) => ({ ...l, ...(block.vertical ? {} : { baselineY: l.baselineY + dy }), ...(l.runs ? { runs: l.runs.map((r) => ({ ...r })) } : {}) })),
  };
}
