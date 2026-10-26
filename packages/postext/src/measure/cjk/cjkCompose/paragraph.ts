// The entry points: composeCjkParagraph with its start indent, and the
// word breaks a CJK text offers (#1276: split out of cjkCompose.ts).
import type { InlineSpan } from '../../../parse/index.js';
import type { VDTLine } from '../../../vdt.js';
import { type MeasureBlockOptions, type MeasuredBlock, lineIndentAt, lineInsetsAt, lineMeasure, markInsetLines } from '../../types.js';
import { normalSpaceWidthFor } from '../../canvas.js';
import { findPxSize } from '../../fontString.js';
import { setLabelTabs, type PendingSegment, expandSmallCaps, textWidth } from '../../rich.js';
import { getCjkCircledNumbers, setCjkCircledNumbers, getCjkLineBreak, isLineStartProhibited, cjkClassOf, isCjkGrapheme, type CjkLineBreakLevel } from '../cjkClasses.js';
import { graphemesOf, graphemeCount } from '../../graphemes.js';
import { getMeasureWritingMode, withMeasureWritingMode, lineBaselineOffset } from '../../vertical.js';
import { type CjkComposition, compositionFor, getCjkComposition, routesSharedMarks, joinsDashPairs, DEFAULT_TITLE_MIN_CHARS, DEFAULT_NOTE_MIN_CHARS } from '../cjkPunctuation.js';
import { breakOpportunities, titleBreaks, noteBreaks, keepAllBreaks } from './breaks.js';
import { lineFitOf, type LineRange, breakUnits } from './breakUnits.js';
import { buildAllUnits, buildUnits } from './buildUnits.js';
import { type ComposeContext, composeLine } from './composeLine.js';
import { type MarkRouting, prepareUnits } from './prepareUnits.js';
import { sizeRubies, sizeKunten } from './ruby.js';
import type { Unit, Fonts } from './units.js';

/**
 * The first line's indent of a paragraph that opens with an opening
 * bracket, as `cjk.paragraphStartBracket` sets it (JLReq §3.1.5), with the
 * bracket's blank before its glyph given up (it is `units`' own unit,
 * replaced): pattern ① (`indent`) keeps the indent, ③ (`half`) sets the
 * bracket's glyph inside the indent so the text after it starts where the
 * indent ends (the bracket and its half em of blank fill a one-em indent),
 * 天付き (`flush`) drops the indent. `indentPx` when the composition leaves
 * the bracket to the line-start rules, the paragraph has no indent or
 * does not open with a bracket.
 */
function paragraphStartIndent(units: Unit[], indentPx: number, c: CjkComposition): number {
  const pattern = c.paragraphStartBracket;
  if (!pattern || indentPx <= 0) return indentPx;
  const f = units.findIndex((u) => u.kind !== 'space');
  const u = units[f];
  if (!u?.punct || u.first !== 'opening') return indentPx;
  // Its blank before the glyph, whatever `trimLineStart` says.
  const box = { ...u.punct };
  const lead = box.blank - box.cutStart;
  const trimmed: Unit = { ...u, punct: box };
  if (lead > 0 && box.side === 'start') {
    box.cutStart += lead;
    trimmed.width -= lead;
  }
  units[f] = trimmed;
  if (pattern === 'flush') return 0;
  if (pattern === 'half') return Math.max(0, indentPx - trimmed.width);
  return indentPx;
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
  // A composition of its own that sets the circled numbers otherwise than
  // the document's (#637): the classes read it while this paragraph is set.
  const asked = options?.cjkComposition;
  if (asked !== undefined && (asked.circledNumbers !== 'western') !== getCjkCircledNumbers()) {
    const prev = setCjkCircledNumbers(asked.circledNumbers !== 'western');
    try {
      return composeCjkParagraph(spans, normalFont, boldFont, italicFont, boldItalicFont, maxWidthPx, lineHeightPx, options);
    } finally {
      setCjkCircledNumbers(prev);
    }
  }
  const fonts: Fonts = { normal: normalFont, bold: boldFont, italic: italicFont, boldItalic: boldItalicFont };
  const letterSpacingPx = options?.letterSpacingPx ?? 0;
  const vertical = getMeasureWritingMode() === 'vertical-rl';
  // The composition works along the line in either writing mode; vertical
  // text keeps ：；？！ at one em (`CjkComposition.vertical`).
  const composition = compositionFor(options?.cjkComposition ?? getCjkComposition(), vertical);
  // The marks Latin text shares with Chinese take Chinese boxes in Chinese
  // text only (`routesSharedMarks`).
  const plainText = spans.map((s) => s.text).join('');
  // Japanese text: only its two-em dashes, drawn as one stroke (#680).
  const route: MarkRouting = routesSharedMarks(composition, plainText) || (joinsDashPairs(composition, plainText) ? 'dashes' : false);
  const units = prepareUnits(buildAllUnits(spans, fonts, letterSpacingPx, vertical, route), composition, letterSpacingPx, options?.labelLength, options?.numberSeams);
  // A bibliography label's column (#290).
  if (options?.labelColumnPx !== undefined) {
    setLabelTabs(units, (u) => u.token?.labelTab, options.labelColumnPx, (u, w) => {
      u.width = w;
      u.token = { ...u.token!, width: w };
    });
  }
  // Ruby readings (#194), laid out once their neighbours are known.
  if (units.some((u) => u.ruby)) sizeRubies(units);
  // Kanbun marks (#430), beside the readings.
  if (units.some((u) => u.kunten)) sizeKunten(units, letterSpacingPx);
  if (!units.some((u) => u.kind !== 'space')) return { lines: [], totalHeight: 0 };
  const fit = lineFitOf(composition);
  const level = options?.cjkLineBreak ?? getCjkLineBreak();
  // `keep-all` (the paragraph's own, else the document's): lines break
  // between phrases, and inside one only when it is longer than the line.
  const keepAll = options?.cjkWordBreak !== undefined ? options.cjkWordBreak === 'keep-all' : composition.keepAll === true;
  const levelBreaks = breakOpportunities(units, level);
  // Book titles keep `cjk.titleMinChars` characters on either side of a
  // break (#637); a line with no other break falls back on the level's.
  const titled = titleBreaks(units, levelBreaks, composition.titleMinChars ?? DEFAULT_TITLE_MIN_CHARS);
  // A warichu note keeps `cjk.warichu.minChars` of its characters on
  // either side of a break too (#720), with the same fallback.
  const noted = noteBreaks(units, titled, composition.noteMinChars ?? DEFAULT_NOTE_MIN_CHARS);
  const breaks = keepAll ? keepAllBreaks(units, noted) : noted;
  const emergency = keepAll || noted !== levelBreaks ? levelBreaks : undefined;
  // The first line's indent gives way to an opening bracket that starts it
  // (`paragraphStartIndent`); the others are as asked (`lineIndentAt`).
  const firstIndent = paragraphStartIndent(units, lineIndentAt(options, 0), composition);
  // A line beside a picture text wraps round (#627) starts past its start
  // inset and ends short of its end inset.
  const insetOf = (li: number) => lineInsetsAt(options?.lineInsets, li);
  const indentOf = (li: number): number => (li === 0 ? firstIndent : lineIndentAt(options, li)) + insetOf(li).start;
  const measureOf = (li: number): number => lineMeasure(maxWidthPx, options?.restWidths, li) - insetOf(li).end - indentOf(li);
  const sizeMatch = findPxSize(normalFont);
  const em = sizeMatch ? parseFloat(sizeMatch.value) : 16;
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
    baselineOffset: lineBaselineOffset(lineHeightPx, normalFont),
    indentOf,
    measureOf,
    ...(vertical ? { vertical: true } : {}),
    ...(fit ? { fit } : {}),
    level,
  };
  const compose = (ranges: LineRange[]): VDTLine[] => ranges.map((r, li) => composeLine(units, r, li, li === ranges.length - 1, ctx));

  const ranges = breakUnits(units, breaks, measureOf, 0, letterSpacingPx, fit, level, undefined, undefined, emergency);
  let lines = compose(ranges);
  // 孤字 (clreq §7.2), where the paragraph avoids runts (`bodyText.avoidRunts`
  // gives it a runt penalty): a last line that holds one character, alone
  // or with its closing marks, takes the last character the line above may
  // give up (push-out), and that line is spread to the measure. When it
  // would need more than the tracking cap, the runt stays. Japanese text
  // (泣き別れ) first tries the other way JLReq prefers (§3.8.2): the line
  // above takes the character in by giving up blank (push-in), and the
  // paragraph is a line shorter. A paragraph that is not justified gives
  // the character up too, its line above one short. On manuscript paper
  // (`cjk.grid.fullLines`, #718) it does not: the line above would stay
  // one cell short, so only a justified line, which is spread, gives it up.
  if ((options?.runtPenalty ?? 0) > 0 && endsOnOneCharacter(lines) && fit?.jlreq) {
    const pulled = breakUnits(units, breaks, measureOf, 0, letterSpacingPx, fit, level, undefined, ranges.length - 2, emergency);
    if (pulled.length === ranges.length - 1) {
      const set = compose(pulled);
      if (!set.some((l) => l.cjkLoose) && !endsOnOneCharacter(set)) lines = set;
    }
  }
  if ((options?.runtPenalty ?? 0) > 0 && (textAlign === 'justify' || !composition.gridFullLines) && endsOnOneCharacter(lines)) {
    const li = ranges.length - 2;
    const above = ranges[li]!;
    let at = above.end - 1;
    while (at > above.start && !breaks[at]) at--;
    if (!above.head && !above.hyphenated && !ranges[li + 1]!.first && at > above.start) {
      const pushed = breakUnits(units, breaks, measureOf, 0, letterSpacingPx, fit, level, { line: li, at }, undefined, emergency);
      if (pushed.length === ranges.length) {
        const set = compose(pushed);
        if (!set[li]!.cjkLoose && !endsOnOneCharacter(set)) lines = set;
      }
    }
  }
  // Column balancing asks for a paragraph one line longer: break each line
  // a little short of its measure, in eighths of an em, until the paragraph
  // gains the lines without a line past the tracking cap. The first step
  // that gains them usually carries a single character down; a setting
  // whose last line is one character, alone or with its marks (孤字), is
  // passed over for the next step's, which carries more.
  const looseness = options?.looseness ?? 0;
  if (looseness > 0) {
    const target = lines.length + looseness;
    for (let step = 1; step <= 16; step++) {
      const ranges = breakUnits(units, breaks, measureOf, (step * em) / 8, letterSpacingPx, fit, level, undefined, undefined, emergency);
      if (ranges.length < target) continue;
      if (ranges.length > target) break;
      const loose = compose(ranges);
      if (!loose.some((l) => l.cjkLoose) && !endsOnOneCharacter(loose)) {
        lines = loose;
        break;
      }
    }
  }
  if (lines.some((l) => l.segments?.some((s) => (s as PendingSegment).smallCaps))) {
    expandSmallCaps(lines, normalFont, boldFont, italicFont, boldItalicFont, letterSpacingPx);
  }
  markInsetLines(lines, maxWidthPx, options);
  return { lines, totalHeight: lines.length * lineHeightPx };
}

/** Whether a paragraph of two lines or more ends on a line that holds one
 *  CJK character, alone or followed by the marks that may not open a line
 *  (`图`, `版。`, `说。”`): the 孤字 Chinese typesetting avoids. */
function endsOnOneCharacter(lines: readonly VDTLine[]): boolean {
  if (lines.length < 2) return false;
  const gs = graphemesOf(lines[lines.length - 1]!.text.trim());
  let n = gs.length;
  while (n > 1 && isLineStartProhibited(cjkClassOf(gs[n - 1]!), 'basic')) n--;
  return n === 1 && isCjkGrapheme(gs[0]!) && cjkClassOf(gs[0]!) === 'ideograph';
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
 * linear time. With `keepAll` (`cjk.wordBreak: 'keep-all'`, or the block's
 * own rule) no break is left between two letters, as in a paragraph the
 * composer sets ({@link keepAllBreaks}): a quotation of a few characters
 * stays whole, and a break next to its punctuation stays where the level
 * allows it (#705).
 */
export function cjkWordBreaks(word: string, font: string, smallCaps: boolean | undefined, letterSpacingPx: number, level: CjkLineBreakLevel = getCjkLineBreak(), keepAll = false): CjkWordBreaks {
  const span: InlineSpan = { text: word, bold: false, italic: false, ...(smallCaps ? { smallCaps: true } : {}) };
  const units = buildUnits([span], { normal: font, bold: font, italic: font, boldItalic: font }, letterSpacingPx, getMeasureWritingMode() === 'vertical-rl');
  const levelBreaks = breakOpportunities(units, level);
  const opportunities = keepAll ? keepAllBreaks(units, levelBreaks) : levelBreaks;
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
