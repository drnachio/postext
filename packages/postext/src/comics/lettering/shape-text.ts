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

import { withMeasureWritingMode } from '../../measure/vertical.js';
import { hasJoiningScript } from '../../writing/bidi.js';
import { hasCJK } from '../../measure/cjk/cjk.js';
import { cjkCompositionKey, getCjkComposition } from '../../measure/cjk/cjkPunctuation.js';
import { layoutTextElementAt } from '../../design/layout.js';
import { designBaseDirection } from '../../design/bidiText.js';
import { primitiveToBlock } from '../../pipeline/pages/headerFooter.js';
import { isJapaneseLanguage, directionOf, languageOf, cjkRegionOf } from '../../hyphenation/locale.js';
import type { CjkLineBreakLevel } from '../../measure/cjk/cjkClasses.js';
import type { CjkRegion, ResolvedDesignTextElement } from '../../types.js';
import type { VDTDesignTextBlock } from '../../vdt.js';
import { type PreparedText, breakPoints, markupOf } from './text.js';
import { boundsOf } from './geom.js';
import type { Rect, LetteringStyle } from './types.js';
import { breakings, breakingOf, candidatesFor, type Candidate } from './shape-text/breaks.js';
import { fontString, measurerFor } from './shape-text/measure.js';
import { stripIsolates, inkOf, rubyBlocks } from './shape-text/ruby.js';

export { inkOf, translateBlock } from './shape-text/ruby.js';

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
  /** What its breaks cost (their penalties and orphan lines, weighted as
   *  in the score): how well it parts the text, whatever its shape. */
  breakCost: number;
  /** How many of its breaks part a Chinese word (`BreakPoint.inWord`,
   *  #728). */
  wordCuts: number;
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
export function inkMetrics(text: string): { asc: number; desc: number } {
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
  const mode = vertical ? 'vertical-rl' : 'horizontal-tb';
  const { cands, rich } = withMeasureWritingMode(mode, () => {
    let byKey = breakings.get(p);
    if (!byKey) breakings.set(p, (byKey = new Map()));
    // The composition is part of the key: a line the CJK composer sets is
    // measured by composing it (#723).
    // So is the direction the lines are set at, which a document shaped
    // in its own language measures them in (`flowMeasure`).
    const base = vertical ? undefined : baseDirection(p.text, opts.locale);
    const key = [mode, region, level, lang === 'ja', fontString(style), style.letterSpacing ?? 0, style.lineHeight, cjkCompositionKey(getCjkComposition()), base ?? ''].join('|');
    let b = byKey.get(key);
    if (!b) byKey.set(key, (b = breakingOf(p, breakPoints(p, level, lang === 'ja'), measurerFor(p, style, true, base))));
    // Japanese phrase breaks weigh more than a perfect profile: columns
    // move by whole characters.
    const penaltyWeight = lang === 'ja' ? 1 : 0.5;
    return { cands: candidatesFor(p, b, em, pitch, vertical, target, maxLen, penaltyWeight), rich: b.m.rich };
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
    breakCost: c.breakCost,
    wordCuts: c.wordCuts,
  };
}
