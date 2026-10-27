// Text of a design element: wrapping with hyphenation, ellipsis and
// clipping, stacked lines, mirrored text seams, CJK rows and rich text
// (#1276: split out of layout.ts).
import type { VAlign, TextOverflow, ResolvedDesignTextElement } from '../../types.js';
import type { InlineSpan } from '../../parse/types.js';
import { getHyphenationRulesKey, hyphenateText, hyphenateByDictionary, withoutEdgeSoftHyphens, withoutSlashJoints } from '../../hyphenation/hyphenate.js';
import { withLineEndHyphen } from '../../measure/geminate.js';
import { NO_BREAK_SPACES, BREAKING_SPACE_RUNS_SPLIT_RE, isBreakingSpaceRun } from '../../measure/spaces.js';
import { type DesignPlaceholderContext, resolveDesignText } from '../placeholders.js';
import { hasJoiningScript } from '../../writing/bidi.js';
import { type CjkDesignFonts, composesDesignAsCjk, composeCjkDesignParagraph } from '../cjkText.js';
import { ellipsisEndCut, ellipsisStartCut, ellipsisMiddleCut, type DesignTextRun, plainDesignText, RichMeasurer, wrapRich, type RichLine, singleRichLine } from '../richText.js';
import type { WrappedLine } from './primitives.js';

// ---------------------------------------------------------------------------
// Text layout — wrap / ellipsis / clip
// ---------------------------------------------------------------------------

/** Width of a run of text in the element's font, tracking included. */
export type TextMeasure = (text: string) => number;

/** How far a text's lines move down from the top of its content box
 *  (`contentHeight` tall) for `verticalAlign`. Lines taller than the box
 *  run out on the side the alignment leaves free, as CSS flex alignment
 *  does: upwards for `'bottom'`, both ways for `'middle'` (EF-138; up to
 *  postext 1.4 they always hung from the top). */
export function textVerticalOffset(
  verticalAlign: VAlign,
  contentHeight: number,
  lines: readonly { topY: number; height: number }[],
): number {
  const linesHeight = lines.reduce((s, l) => Math.max(s, l.topY + l.height), 0);
  if (verticalAlign === 'top') return 0;
  if (verticalAlign === 'bottom') return contentHeight - linesHeight;
  return (contentHeight - linesHeight) / 2;
}

/** The tracking a line's measured width carries after its last glyph: the
 *  element's `letterSpacingPx` when the line holds any text. Canvas, CSS and
 *  PDF all add it after every character, the last one included; it is
 *  advance, not ink, so alignment leaves it out (EF-153). */
export function trailingTracking(text: string, letterSpacingPx: number): number {
  return letterSpacingPx !== 0 && text.length > 0 ? letterSpacingPx : 0;
}

function ellipsize(
  text: string,
  measure: TextMeasure,
  maxWidth: number,
  mode: 'start' | 'end' | 'middle',
): string {
  const ellipsis = '…';
  if (measure(text) <= maxWidth) return text;
  const ellipsisWidth = measure(ellipsis);
  if (ellipsisWidth > maxWidth) return '';
  const budget = maxWidth - ellipsisWidth;
  if (mode === 'end') {
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (measure(text.slice(0, mid)) <= budget) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    // At a word boundary, without the space before the ellipsis (EF-76).
    return text.slice(0, ellipsisEndCut(text, 0, text.length, lo)) + ellipsis;
  }
  if (mode === 'start') {
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (measure(text.slice(mid)) <= budget) {
        hi = mid;
      } else {
        lo = mid + 1;
      }
    }
    return ellipsis + text.slice(ellipsisStartCut(text, 0, text.length, lo));
  }
  // middle
  let leftLen = 0;
  let rightLen = 0;
  while (true) {
    const candidate = text.slice(0, leftLen + 1) + text.slice(text.length - rightLen);
    if (measure(candidate) + ellipsisWidth > maxWidth) break;
    leftLen++;
    if (leftLen + rightLen >= text.length) break;
    const candidate2 = text.slice(0, leftLen) + text.slice(text.length - (rightLen + 1));
    if (measure(candidate2) + ellipsisWidth > maxWidth) break;
    rightLen++;
    if (leftLen + rightLen >= text.length) break;
  }
  const kept = ellipsisMiddleCut(text, 0, text.length, leftLen, rightLen);
  return text.slice(0, kept.left) + ellipsis + text.slice(text.length - kept.right);
}

export const SOFT_HYPHEN = '\u00AD';

export function breakWordWithHyphenation(
  word: string,
  measure: TextMeasure,
  maxWidth: number,
  useHyphenation: boolean,
): { head: string; tail: string; divided?: 'syllable' | 'character' } | undefined {
  // Returns a split of the word where head (with trailing hyphen if hyphenated)
  // fits in maxWidth. Returns undefined if no split is possible. `divided`:
  // how the word was cut (#1150), absent for a cut at a no-break space.
  // A group glued by no-break spaces ("Fig. 3") parts at the last of them
  // that leaves a head that fits, before any syllable or character (EF-66).
  for (let i = word.length - 2; i >= 1; i--) {
    if (!NO_BREAK_SPACES.includes(word[i]!) || NO_BREAK_SPACES.includes(word[i - 1]!)) continue;
    if (measure(word.slice(0, i)) <= maxWidth) return { head: word.slice(0, i), tail: word.slice(i + 1) };
  }
  // A word of a joining script (Arabic) is never hyphenated or cut: it runs
  // past the line, whole.
  if (hasJoiningScript(word)) return undefined;
  if (useHyphenation) {
    // Syllables only: the slash joints would ride along into the pieces.
    // A word the document's rules keep whole is divided at the dictionary's
    // syllables when no point of its own fits (#699).
    for (const divide of getHyphenationRulesKey() === '' ? [hyphenateText] : [hyphenateText, hyphenateByDictionary]) {
      // A soft hyphen typed at the word's edge or next to punctuation is no
      // break (#700).
      const hy = withoutEdgeSoftHyphens(word, withoutSlashJoints(word, divide(word)));
      if (!hy.includes(SOFT_HYPHEN)) continue;
      const parts = hy.split(SOFT_HYPHEN);
      let best: { head: string; tail: string } | undefined;
      for (let i = 1; i < parts.length; i++) {
        const headRaw = parts.slice(0, i).join('');
        const tailRaw = parts.slice(i).join('');
        const headWithHyphen = withLineEndHyphen(headRaw);
        if (measure(headWithHyphen) <= maxWidth) {
          best = { head: headWithHyphen, tail: tailRaw };
        } else {
          break;
        }
      }
      if (best) return { ...best, divided: 'syllable' };
    }
  }
  // Last-resort character break so text never overflows when it can't fit.
  let lo = 1;
  let hi = word.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(word.slice(0, mid)) <= maxWidth) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  if (lo < 1) return undefined;
  return { head: word.slice(0, lo), tail: word.slice(lo), ...(lo < word.length ? { divided: 'character' as const } : {}) };
}

function wrapToWidth(
  text: string,
  measure: TextMeasure,
  maxWidth: number,
  hyphenate: boolean,
  /** Filled by line index: how the line's last word was cut (#1150). */
  cuts?: ('syllable' | 'character' | undefined)[],
): string[] {
  // Greedy word wrap; preserves existing line breaks.
  const paragraphs = text.split('\n');
  const out: string[] = [];
  for (const para of paragraphs) {
    // Words part at breaking spaces only: a no-break space glues (EF-66).
    const words = para.split(BREAKING_SPACE_RUNS_SPLIT_RE);
    let current = '';
    for (const part of words) {
      const test = current + part;
      if (measure(test) <= maxWidth || (current.length === 0 && (part === '' || isBreakingSpaceRun(part)))) {
        current = test;
      } else if (current.length === 0) {
        // Single word doesn't fit — try hyphenation / char break.
        let remaining = part;
        while (remaining.length > 0) {
          if (measure(remaining) <= maxWidth) {
            current = remaining;
            break;
          }
          const split = breakWordWithHyphenation(remaining, measure, maxWidth, hyphenate);
          if (!split || split.head.length === 0) {
            current = remaining;
            break;
          }
          out.push(split.head);
          if (cuts) cuts[out.length - 1] = split.divided;
          remaining = split.tail;
        }
      } else {
        out.push(current.trimEnd());
        // New line starts with this part; if the part itself doesn't fit, split it.
        const trimmed = part.replace(/^\s+/, '');
        if (measure(trimmed) <= maxWidth) {
          current = trimmed;
        } else {
          let remaining = trimmed;
          current = '';
          while (remaining.length > 0) {
            if (measure(remaining) <= maxWidth) {
              current = remaining;
              break;
            }
            const split = breakWordWithHyphenation(remaining, measure, maxWidth, hyphenate);
            if (!split || split.head.length === 0) {
              current = remaining;
              break;
            }
            out.push(split.head);
            if (cuts) cuts[out.length - 1] = split.divided;
            remaining = split.tail;
          }
        }
      }
    }
    if (current.length > 0) out.push(current.trimEnd());
    else out.push('');
  }
  return out.length > 0 ? out : [''];
}

export interface TextMeasurement {
  lines: WrappedLine[];
  contentWidth: number;
  contentHeight: number;
  needsClip: boolean;
  /** A line lost characters to an ellipsis, or is wider than the room a
   *  clip leaves it. */
  truncated?: boolean;
}

/** How much wider than its room a clipped line may be before it counts as
 *  cut: rounding, not a hidden glyph. */
const CLIP_SLACK_PX = 0.5;

/** Lines stacked from the top of the content box, `lineHeightPx` apart. */
function stackLines(rows: { text: string; width: number; runs?: DesignTextRun[]; wordDivided?: 'syllable' | 'character' }[], lineHeightPx: number): WrappedLine[] {
  return rows.map((r, i) => ({
    text: r.text,
    width: r.width,
    topY: i * lineHeightPx,
    baselineY: i * lineHeightPx + lineHeightPx * 0.8,
    height: lineHeightPx,
    ...(r.runs ? { runs: r.runs } : {}),
    ...(r.wordDivided ? { wordDivided: r.wordDivided } : {}),
  }));
}

/** Lay out a plain text. A newline always starts a new line; `overflow`
 *  decides what happens to a line wider than `maxContentWidth`: wrap onto
 *  more lines, or stay one line that is truncated (`ellipsis-*`) or clipped
 *  by the renderer (`clip`). */
export function layoutText(
  text: string,
  measure: TextMeasure,
  lineHeightPx: number,
  overflow: TextOverflow,
  /** When not undefined, constrains text width. Otherwise measure natural. */
  maxContentWidth: number | undefined,
  hyphenate: boolean | undefined,
): TextMeasurement {
  if (maxContentWidth !== undefined && overflow === 'wrap') {
    const cuts: Parameters<typeof wrapToWidth>[4] = [];
    const lines = wrapToWidth(text, measure, maxContentWidth, hyphenate ?? false, cuts);
    const wrapped = stackLines(lines.map((t, i) => ({ text: t, width: measure(t), ...(cuts[i] ? { wordDivided: cuts[i] } : {}) })), lineHeightPx);
    const w = wrapped.reduce((m, l) => Math.max(m, l.width), 0);
    return {
      lines: wrapped,
      contentWidth: w,
      contentHeight: wrapped.length * lineHeightPx,
      needsClip: false,
    };
  }
  const rows = text.split('\n');
  if (maxContentWidth === undefined || overflow === 'clip') {
    // Natural lines (clipped to the box by the renderer for `clip`).
    const lines = stackLines(rows.map((t) => ({ text: t, width: measure(t) })), lineHeightPx);
    const natural = lines.reduce((m, l) => Math.max(m, l.width), 0);
    return {
      lines,
      contentWidth: maxContentWidth === undefined ? natural : Math.min(natural, maxContentWidth),
      contentHeight: lines.length * lineHeightPx,
      needsClip: maxContentWidth !== undefined,
      ...(maxContentWidth !== undefined && natural > maxContentWidth + CLIP_SLACK_PX ? { truncated: true } : {}),
    };
  }
  // ellipsis-*
  const mode: 'start' | 'end' | 'middle' =
    overflow === 'ellipsis-start' ? 'start'
    : overflow === 'ellipsis-middle' ? 'middle'
    : 'end';
  let truncated = false;
  const lines = stackLines(rows.map((t) => {
    const visible = ellipsize(t, measure, maxContentWidth, mode);
    if (visible !== t) truncated = true;
    return { text: visible, width: measure(visible) };
  }), lineHeightPx);
  return {
    lines,
    contentWidth: lines.reduce((m, l) => Math.max(m, l.width), 0),
    contentHeight: lines.length * lineHeightPx,
    needsClip: false,
    ...(truncated ? { truncated: true } : {}),
  };
}

/** The placeholders that mirror text from the document: a title, a
 *  frontmatter value, an attribute, a running mark. */
const MIRRORED_PLACEHOLDER_RE = /\{(?:titleText|chapterTitle|chapterTitleAtTop|partTitle|title|subtitle|author|(?:attr|firstMark|lastMark)\.[^{}]+)\}/g;

/**
 * Where the texts a design text mirrors from the document start and end
 * in the text it prints (#724): offsets into the printed text with its
 * inline marks dropped, the text the composer sets. A number the layout
 * wrote next to such a text (`{number}{titleText}`,
 * `{chapterNumber}{chapterTitle}`, `{numberHan}、{titleText}`) is not half
 * of a number with it, so the rule that sets the 、 of 二、三日 solid does
 * not read across these offsets. Literal text of the template and the
 * inside of one placeholder's value are read as before, and so are two
 * number placeholders side by side.
 *
 * The offset of a placeholder is the length of the template's prefix
 * printed alone (placeholders filled, marks dropped, the case transformed),
 * as `withPrintedTitle` finds `{titleText}`; one the printed text does not
 * hold there (a template whose marks span the placeholder) is left out.
 * Empty when the text holds no 、 or ・.
 */
export function mirroredTextSeams(el: ResolvedDesignTextElement, printed: string, placeholders: DesignPlaceholderContext): number[] {
  if (!printed.includes('、') && !printed.includes('・')) return [];
  const upper = el.textTransform === 'uppercase';
  const print = (template: string): string => {
    const resolved = resolveDesignText(template, placeholders, el.inlineMarks === true);
    const plain = el.inlineMarks ? plainDesignText(resolved, placeholders.heading?.chipStyles !== undefined) : resolved;
    return upper ? plain.toLocaleUpperCase() : plain;
  };
  let whole: string | undefined;
  const out = new Set<number>();
  for (const m of el.content.matchAll(MIRRORED_PLACEHOLDER_RE)) {
    whole ??= print(el.content);
    const value = print(m[0]);
    if (value === '') continue;
    const start = print(el.content.slice(0, m.index)).length;
    if (whole.slice(start, start + value.length) !== value) continue;
    if (start > 0) out.add(start);
    if (start + value.length < whole.length) out.add(start + value.length);
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * Lay out a text some of whose rows (`\n` apart) compose as CJK (#637):
 * those rows are set by the CJK composer (`design/cjkText.ts`), wrapped
 * when `overflow` wraps and set on one line otherwise; the others as
 * `layoutText` (or, with inline marks, `layoutRichText`) sets them.
 * Undefined when a line wider than its room should lose characters to an
 * ellipsis: the caller then sets the text as before.
 */
export function layoutCjkRows(
  source: string,
  spansOf: (a: number, b: number) => InlineSpan[],
  fonts: CjkDesignFonts,
  richM: RichMeasurer | undefined,
  measure: TextMeasure,
  measureIn: (text: string, font: string) => number,
  lineHeightPx: number,
  letterSpacingPx: number,
  overflow: TextOverflow,
  maxContentWidth: number | undefined,
  hyphenate: boolean | undefined,
  /** The number seams of a range of `source`, relative to its start (#724). */
  seamsOf: (a: number, b: number) => number[] = () => [],
): TextMeasurement | undefined {
  const wrap = overflow === 'wrap' && maxContentWidth !== undefined;
  const rows: { text: string; width: number; runs?: DesignTextRun[]; xOffset?: number; wordDivided?: 'syllable' | 'character' }[] = [];
  let truncated = false;
  // A line wider than the room of a text that does not wrap: clipped, or
  // left to the ellipsis of the plain path.
  const tooWide = (width: number): boolean => !wrap && maxContentWidth !== undefined && width > maxContentWidth + CLIP_SLACK_PX;
  let start = 0;
  for (const row of source.split('\n')) {
    const end = start + row.length;
    if (composesDesignAsCjk(row)) {
      const lines = composeCjkDesignParagraph(spansOf(start, end), fonts, wrap ? maxContentWidth : undefined, lineHeightPx, letterSpacingPx, measureIn, [], seamsOf(start, end));
      if (lines.some((l) => tooWide(l.width))) {
        if (overflow !== 'clip') return undefined;
        truncated = true;
      }
      if (lines.length === 0) rows.push({ text: '', width: 0 });
      for (const l of lines) rows.push({ text: l.text, width: l.width, ...(l.runs ? { runs: l.runs } : {}), ...(l.xOffset ? { xOffset: l.xOffset } : {}) });
    } else if (wrap) {
      if (richM) rows.push(...wrapRich(richM, start, end, () => maxContentWidth, hyphenate ?? false));
      else {
        const cuts: Parameters<typeof wrapToWidth>[4] = [];
        wrapToWidth(row, measure, maxContentWidth, hyphenate ?? false, cuts).forEach((t, i) => rows.push({ text: t, width: measure(t), ...(cuts[i] ? { wordDivided: cuts[i] } : {}) }));
      }
    } else {
      const line = richM ? richM.rangeLine(start, end) : { text: row, width: measure(row) };
      if (tooWide(line.width)) {
        if (overflow !== 'clip') return undefined;
        truncated = true;
      }
      rows.push(line);
    }
    start = end + 1;
  }
  const lines = stackLines(rows, lineHeightPx);
  rows.forEach((r, i) => {
    if (r.xOffset) lines[i]!.xOffset = r.xOffset;
  });
  const natural = lines.reduce((mx, l) => Math.max(mx, l.width + (l.xOffset ?? 0)), 0);
  const clip = !wrap && maxContentWidth !== undefined;
  return {
    lines,
    contentWidth: clip ? Math.min(natural, maxContentWidth) : natural,
    contentHeight: lines.length * lineHeightPx,
    needsClip: clip,
    ...(truncated ? { truncated: true } : {}),
  };
}

/** Lay out a text with inline marks: the same rules as `layoutText`, with
 *  every line built from runs. */
export function layoutRichText(
  m: RichMeasurer,
  lineHeightPx: number,
  overflow: TextOverflow,
  maxContentWidth: number,
  hyphenate: boolean | undefined,
): TextMeasurement {
  const rows: RichLine[] = [];
  let start = 0;
  let truncated = false;
  const text = m.rt.text;
  for (const row of text.split('\n')) {
    const end = start + row.length;
    if (overflow === 'wrap') rows.push(...wrapRich(m, start, end, () => maxContentWidth, hyphenate ?? false));
    else {
      // `singleRichLine` cuts exactly when the whole line is wider.
      const whole = m.measure(start, end);
      if (whole > maxContentWidth + (overflow === 'clip' ? CLIP_SLACK_PX : 0)) truncated = true;
      rows.push(singleRichLine(m, start, end, maxContentWidth, overflow));
    }
    start = end + 1;
  }
  const lines = stackLines(rows, lineHeightPx);
  const natural = lines.reduce((mx, l) => Math.max(mx, l.width), 0);
  return {
    lines,
    contentWidth: overflow === 'clip' ? Math.min(natural, maxContentWidth) : natural,
    contentHeight: lines.length * lineHeightPx,
    needsClip: overflow === 'clip',
    ...(truncated ? { truncated: true } : {}),
  };
}
