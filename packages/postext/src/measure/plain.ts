import {
  prepareWithSegments,
  layoutNextLine,
  type PreparedTextWithSegments,
  type LayoutCursor,
} from '@chenglou/pretext';
import type { VDTLine, VDTLineSegment } from '../vdt';
import { createBoundingBox } from '../vdt';
import type { TextAlign } from '../types';
import { hyphenateText, hyphenateTextKeepingCompounds } from '../hyphenate';
import {
  pretextSegmentsToItems,
  computeBreakpoints,
  reconstructPretextLines,
} from '../knuthPlass';
import { SOFT_HYPHEN } from './types';
import { lineMeasure, uniformMeasureFrom, type MeasuredBlock, type MeasureBlockOptions } from './types';
import { cleanSoftHyphens, measureTextWidth, normalSpaceWidthFor } from './canvas';
import { isRuntLastLine } from './runts';
import { measureRichBlock } from './rich';
import { hasCJKRun } from './cjk';
import { WORDS_AND_SPACES_RE } from './spaces';
import { breaksAfterHardHyphen, hasCompound, raggedStretchPx } from './breakRules';

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const FIGURE_SPACE = '\u2007';
/** The no-break spaces pretext glues its neighbours to (EF-66). */
const PRETEXT_GLUE_RE = /[\u00A0\u202F\uFEFF]/;

/**
 * Whether `text` holds a group of words glued by a no-break space that is
 * wider than `widthPx`. Pretext cuts such a group between characters, inside
 * a number ("300 0" / "00 0"); the word-by-word breaker breaks it at its last
 * no-break space first (EF-66), so the paragraph goes there. Only text that
 * holds a no-break space is measured.
 */
function hasOverwideGluedGroup(text: string, font: string, widthPx: number): boolean {
  if (!PRETEXT_GLUE_RE.test(text)) return false;
  for (const word of text.match(WORDS_AND_SPACES_RE) ?? []) {
    if (PRETEXT_GLUE_RE.test(word) && measureTextWidth(word, font) > widthPx) return true;
  }
  return false;
}

/**
 * Whether `text` holds a compound with a part wider than `widthPx`: a word
 * with a hyphen between two letters, the parts being what lies between its
 * breaks after those hyphens ("counterrevolutionaries-" of
 * "counterrevolutionaries-internationalization"). When the dictionary leaves
 * compounds whole (`hyphenation.compounds: false`) such a part has no soft
 * hyphen, and pretext would cut it between two characters with no hyphen;
 * the word-by-word breaker divides it at the dictionary's syllables, as it
 * does any word wider than the line, so the paragraph goes there.
 */
function hasOverwideCompoundPart(text: string, font: string, widthPx: number): boolean {
  if (!hasCompound(text)) return false;
  for (const word of text.match(WORDS_AND_SPACES_RE) ?? []) {
    if (!hasCompound(word)) continue;
    let start = 0;
    for (let i = 1; i < word.length - 1; i++) {
      if (word[i] !== '-' || !breaksAfterHardHyphen(word[i - 1], word[i + 1])) continue;
      if (measureTextWidth(word.slice(start, i + 1), font) > widthPx) return true;
      start = i + 1;
    }
    if (measureTextWidth(word.slice(start), font) > widthPx) return true;
  }
  return false;
}

/** Graphemes `from` to `to` (exclusive; to the end when undefined) of a
 *  segment, as pretext counts a cursor's `graphemeIndex`. */
function graphemeSlice(text: string, from: number, to: number | undefined): string {
  return Array.from(graphemeSegmenter.segment(text), (g) => g.segment).slice(from, to).join('');
}

function extractSegments(
  prepared: PreparedTextWithSegments,
  start: LayoutCursor,
  end: LayoutCursor,
  font: string,
): { segments: VDTLineSegment[]; hyphenated: boolean } {
  const result: VDTLineSegment[] = [];
  let hyphenated = false;
  const kinds = (prepared as unknown as { kinds: string[] }).kinds;
  // A word wider than the line is cut between graphemes: the line then
  // starts or ends inside a segment, and holds only that part of it.
  const last = end.graphemeIndex > 0 ? end.segmentIndex : end.segmentIndex - 1;

  for (let i = start.segmentIndex; i <= last; i++) {
    let seg = prepared.segments[i]!;
    let w = prepared.widths[i]!;
    const from = i === start.segmentIndex ? start.graphemeIndex : 0;
    const to = i === end.segmentIndex ? end.graphemeIndex : undefined;
    if (from > 0 || to !== undefined) {
      seg = graphemeSlice(seg, from, to);
      if (seg === '') continue;
      w = measureTextWidth(seg, font);
    }

    if (seg === SOFT_HYPHEN) {
      // If this is the last segment before the break, mark as hyphenated
      if (i === end.segmentIndex - 1) hyphenated = true;
      continue;
    }
    // A zero-width break opportunity (the one the dictionary puts after a
    // slash) is no text: Knuth–Plass lines leave it out too.
    if (kinds[i] === 'zero-width-break') continue;

    if (seg.trim().length === 0) {
      result.push({ kind: 'space', text: seg, width: w });
    } else {
      result.push({ kind: 'text', text: seg, width: w });
    }
  }

  // Check if the break point is at a soft hyphen
  if (!hyphenated && end.segmentIndex < prepared.segments.length) {
    if (prepared.segments[end.segmentIndex] === SOFT_HYPHEN) {
      hyphenated = true;
    }
  }

  // Trim trailing spaces
  while (result.length > 0 && result[result.length - 1]!.kind === 'space') {
    result.pop();
  }

  return { segments: result, hyphenated };
}

function findLastTextSegmentIndex(segments: VDTLineSegment[]): number {
  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i]!.kind === 'text') return i;
  }
  return -1;
}

function getHyphenWidth(prepared: PreparedTextWithSegments, font: string): number {
  // Use discretionaryHyphenWidth from pretext internals
  const core = prepared as unknown as { discretionaryHyphenWidth?: number };
  if (core.discretionaryHyphenWidth && core.discretionaryHyphenWidth > 0) {
    return core.discretionaryHyphenWidth;
  }
  return measureTextWidth('-', font);
}

/**
 * Whether a Knuth–Plass line runs past its measure even with its spaces
 * removed: a word wider than the whole line has no feasible break around
 * it, and the search then sets it — with everything before it back to the
 * last feasible break — on one overfull line. A ragged line's spaces do not
 * shrink (`rigidSpaces`): they count.
 */
export function hasOverfullLine(lines: VDTLine[], lineWidth: (lineIndex: number) => number, rigidSpaces = false): boolean {
  return lines.some((line, i) => {
    let width = 0;
    for (const seg of line.segments ?? []) if (rigidSpaces || seg.kind !== 'space') width += seg.width;
    return width > lineWidth(i) + 0.5;
  });
}

export function computeJustifiedSpaceRatio(
  segments: VDTLineSegment[],
  lineMaxWidth: number,
  normalSpaceWidth: number,
  textAlign: TextAlign,
  isLastLine: boolean,
): number | undefined {
  if (textAlign !== 'justify' || isLastLine || normalSpaceWidth <= 0) return undefined;
  let wordWidth = 0;
  let spaceCount = 0;
  for (const s of segments) {
    if (s.kind === 'space') spaceCount++;
    else wordWidth += s.width;
  }
  if (spaceCount === 0) return undefined;
  const justifiedSpaceWidth = (lineMaxWidth - wordWidth) / spaceCount;
  return justifiedSpaceWidth / normalSpaceWidth;
}

/**
 * Measure a text block: break it into lines within maxWidthPx
 * and return VDTLine data with bounding boxes.
 *
 * The returned lines have bbox positions relative to the block origin (0,0).
 * The pipeline will offset them to absolute page coordinates later.
 */
export function measureBlock(
  text: string,
  font: string,
  maxWidthPx: number,
  lineHeightPx: number,
  options?: MeasureBlockOptions,
): MeasuredBlock {
  if (text.trim() === '') {
    return { lines: [], totalHeight: 0 };
  }

  const shouldHyphenate = options?.hyphenate ?? false;
  const indentPx = options?.firstLineIndentPx ?? 0;
  const hanging = options?.hangingIndent ?? false;
  const textAlign = options?.textAlign ?? 'left';
  // A hyphenation zone (ragged text) needs the word-level breakers, which
  // weigh each dictionary syllable against the gap it would leave and tell
  // the dictionary's soft hyphens from the author's; pretext's takes every
  // soft hyphen that fits.
  if (shouldHyphenate && options?.hyphenationZonePx !== undefined && !(options.optimal && textAlign === 'justify')) {
    return measureRichBlock([{ text, bold: false, italic: false }], font, font, font, font, maxWidthPx, lineHeightPx, options);
  }
  // Pretext glues its neighbours to a no-break space (U+00A0, U+202F,
  // U+FEFF) but not to a figure space (U+2007), which it may break at; the
  // word-by-word breaker glues all four (EF-66).
  // A glued group wider than the narrowest line likewise (EF-66): pretext
  // would cut it between characters.
  if (text.includes(FIGURE_SPACE) || hasOverwideGluedGroup(text, font, Math.min(maxWidthPx, ...(options?.restWidths ?? []).map((s) => s.maxWidthPx)) - Math.max(0, indentPx))) {
    return measureRichBlock([{ text, bold: false, italic: false }], font, font, font, font, maxWidthPx, lineHeightPx, options);
  }
  // A hyphen repeated at the start of the line after a compound's break
  // (`repeatHyphen`) is measured by the word-by-word breaker; pretext's
  // cannot add it.
  if (options?.repeatHyphen && hasCompound(text)) {
    return measureRichBlock([{ text, bold: false, italic: false }], font, font, font, font, maxWidthPx, lineHeightPx, options);
  }
  // Compounds the dictionary leaves whole: their own hyphen is their one
  // break, so Knuth–Plass must have it. A part of one wider than the line
  // is divided at its syllables by the word-by-word breaker.
  const keepCompounds = shouldHyphenate && options?.hyphenateCompounds === false;
  if (keepCompounds && hasOverwideCompoundPart(text, font, maxWidthPx - Math.max(0, indentPx))) {
    return measureRichBlock([{ text, bold: false, italic: false }], font, font, font, font, maxWidthPx, lineHeightPx, options);
  }
  const processedText = shouldHyphenate
    ? (keepCompounds ? hyphenateTextKeepingCompounds(text) : hyphenateText(text))
    : text;

  const prepared = prepareWithSegments(processedText, font);
  const normalSpaceWidth = textAlign === 'justify' ? normalSpaceWidthFor(font) : 0;

  // Knuth-Plass optimal line breaking path. Not for words set without
  // spaces (a run of ideographs or kana): its item stream breaks only at
  // spaces and hyphenation points, so such a run would run past the column.
  // Pretext's own breaker below breaks between them, with its kinsoku
  // rules. A lone CJK bracket or fullwidth sign in Latin text is no reason.
  // Ragged text takes it too with `optimalRagged`: its word spaces keep
  // their width and each line gets the ragged stretch instead.
  const ragged = textAlign !== 'justify';
  if (options?.optimal && (!ragged || options.optimalRagged) && !hasCJKRun(text)) {
    const maxStretchRatio = ragged ? 1 : options.maxStretchRatio ?? 1.5;
    const minShrinkRatio = ragged ? 1 : options.minShrinkRatio ?? 0.8;
    // The runt threshold counts word spaces on ragged text too.
    const spaceWidth = ragged ? normalSpaceWidthFor(font) : normalSpaceWidth;
    // Ragged text keeps the break after a hyphen the text carries that
    // pretext's line-by-line breaker gave it (and the rich path has);
    // justified text takes it with `breakAfterHyphens` (with two letters
    // on each side, so no line ends on "e-"), and wherever the dictionary
    // leaves compounds whole, whose one break it is.
    const hardHyphens = ragged || options.breakAfterHyphens === true || keepCompounds;
    const items = pretextSegmentsToItems(prepared, spaceWidth, maxStretchRatio, minShrinkRatio, options.breakAfterDashes === true, hardHyphens, ragged || keepCompounds ? 1 : 2);
    const lineWidthFn = (li: number) => {
      const isFirst = li === 0;
      const indent = indentPx > 0
        ? (hanging ? (isFirst ? 0 : indentPx) : (isFirst ? indentPx : 0))
        : 0;
      return lineMeasure(maxWidthPx, options.restWidths, li) - indent;
    };
    const lineIndentFn = (li: number) => {
      const isFirst = li === 0;
      return indentPx > 0
        ? (hanging ? (isFirst ? 0 : indentPx) : (isFirst ? indentPx : 0))
        : 0;
    };
    const runtPenalty = options.runtPenalty ?? 0;
    const runtMinWidth = runtPenalty > 0
      ? (options.runtMinCharacters ?? 0) * spaceWidth
      : 0;
    const trackingPerChar = ragged ? 0 : options.justifyTrackingPx ?? 0;
    const breaks = computeBreakpoints(items, {
      lineWidth: lineWidthFn,
      normalSpaceWidth: spaceWidth,
      maxStretchRatio,
      minShrinkRatio,
      runtPenalty,
      runtMinWidth,
      runtGraded: options.runtGraded === true,
      ...(options.avoidHyphenAtLines ? { avoidHyphenAtLines: options.avoidHyphenAtLines } : {}),
      ...(options.keepBreaks?.path === 'plain' ? { fixedBreaks: options.keepBreaks.at } : {}),
      looseness: options.looseness ?? 0,
      lineWidthUniformFrom: uniformMeasureFrom(options.restWidths),
      trackingPerChar,
      ...(ragged ? { raggedStretch: raggedStretchPx(font) } : {}),
    });
    if (breaks.length > 0) {
      const kpLines = reconstructPretextLines(
        items, breaks, prepared, lineHeightPx,
        lineWidthFn, lineIndentFn, normalSpaceWidth, textAlign,
        trackingPerChar,
      );
      if (!hasOverfullLine(kpLines, lineWidthFn, ragged)) {
        return {
          lines: kpLines,
          totalHeight: kpLines.length * lineHeightPx,
          ...(isRuntLastLine(kpLines, runtMinWidth) ? { lastLineRunt: true } : {}),
          breaks: { path: 'plain', at: breaks },
        };
      }
    }
    // Fallback to greedy if K-P produced no breaks, or a line past the
    // measure (a word wider than it: the greedy breaker divides it)
  }

  const lines: VDTLine[] = [];
  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };
  let y = 0;
  let lineIndex = 0;

  while (true) {
    // First line indent: indent line 0 only. Hanging indent: indent all lines except 0.
    const isFirstLine = lineIndex === 0;
    const lineIndent = indentPx > 0
      ? (hanging ? (isFirstLine ? 0 : indentPx) : (isFirstLine ? indentPx : 0))
      : 0;
    const lineMaxWidth = lineMeasure(maxWidthPx, options?.restWidths, lineIndex) - lineIndent;

    const line = layoutNextLine(prepared, cursor, lineMaxWidth);
    if (line === null) break;

    const nextCursor = line.end;

    const { segments, hyphenated } = extractSegments(prepared, cursor, nextCursor, font);

    if (hyphenated) {
      const lastTextIdx = findLastTextSegmentIndex(segments);
      if (lastTextIdx >= 0) {
        const lastSeg = segments[lastTextIdx]!;
        segments[lastTextIdx] = {
          kind: 'text',
          text: lastSeg.text + '-',
          width: lastSeg.width + getHyphenWidth(prepared, font),
        };
      }
    }

    // Whether this turns out to be the last line is only known once the
    // loop ends; the ratio is computed as if it weren't and corrected below.
    // This avoids a second layoutNextLine call per line just to peek ahead.
    const justifiedSpaceRatio = computeJustifiedSpaceRatio(
      segments,
      lineMaxWidth,
      normalSpaceWidth,
      textAlign,
      false,
    );

    // Pretext's line text already ends with the hyphen of a soft-hyphen
    // break; add it only when it does not. It also carries the zero-width
    // breaks the segments leave out.
    const lineText = cleanSoftHyphens(line.text).replace(/\u200B/g, '');
    lines.push({
      text: hyphenated && !lineText.endsWith('-') ? lineText + '-' : lineText,
      bbox: createBoundingBox(lineIndent, y, line.width, lineHeightPx),
      baseline: y + lineHeightPx * 0.8,
      hyphenated,
      segments,
      isLastLine: false,
      ...(justifiedSpaceRatio !== undefined ? { justifiedSpaceRatio } : {}),
    });

    cursor = nextCursor;
    y += lineHeightPx;
    lineIndex++;
  }

  const lastLine = lines[lines.length - 1];
  if (lastLine) {
    lastLine.isLastLine = true;
    delete lastLine.justifiedSpaceRatio;
  }

  return { lines, totalHeight: y };
}
