// Segments of a measured line: extraction, geminate dots, hyphen width,
// overfull lines and justified space ratios.
import type { PreparedTextWithSegments, LayoutCursor, LayoutLine } from '@chenglou/pretext';
import type { VDTLineSegment, VDTLine } from '../../vdt.js';
import type { TextAlign } from '../../types.js';
import { SOFT_HYPHEN } from '../types.js';
import { GEMINATE_DOT, endsInsideGeminate } from '../geminate.js';
import { measureTextWidth, getMeasureLanguage } from '../canvas.js';
import { graphemeSlice } from './overwide.js';

export function extractSegments(
  prepared: PreparedTextWithSegments,
  start: LayoutCursor,
  end: LayoutCursor,
  font: string,
): { segments: VDTLineSegment[]; hyphenated: boolean } {
  const result: VDTLineSegment[] = [];
  let hyphenated = false;
  const kinds = prepared.kinds;
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

/**
 * What a line that breaks inside a Catalan `l·l` gives back: it ends on
 * `piece`, whose last character is the dot, and the hyphen is printed in
 * the dot's place (`il-` | `lusió`).
 *
 * Up to postext 1.29, and in a document shaped in the host's language,
 * the dot set alone. But a face may set the dot after an `l` otherwise
 * than alone (#770): Castoro's is 0.129 em there in Catalan and 0.297 em
 * alone, so the head `til-` was 22.02 px for 25.28 painted at 19.4 px;
 * Lora ligates `l·`. A document shaped in its own language gives back the
 * room the dot takes in that piece, so the head is the text painted, the
 * letters before the dot and the hyphen, as a styled paragraph measures
 * it (`wordBreakPoints` in `rich.ts`).
 */
export function geminateDotRoom(piece: string, font: string): number {
  if (getMeasureLanguage() === undefined) return measureTextWidth(GEMINATE_DOT, font);
  return Math.max(0, measureTextWidth(piece, font) - measureTextWidth(piece.slice(0, -1), font));
}

/** {@link geminateDotRoom} for the pieces of `text` when it has a Catalan
 *  `l·l` (see `pretextSegmentsToItems`), else 0. */
export function geminateDotWidth(text: string, font: string): number | ((piece: string) => number) {
  if (!text.includes(GEMINATE_DOT)) return 0;
  if (getMeasureLanguage() === undefined) return measureTextWidth(GEMINATE_DOT, font);
  return (piece) => geminateDotRoom(piece, font);
}

export function findLastTextSegmentIndex(segments: VDTLineSegment[]): number {
  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i]!.kind === 'text') return i;
  }
  return -1;
}

/** The hyphen a soft-hyphen break prints (`withLineEndHyphen`), in the
 *  text's font. Up to pretext 0.0.9 the engine read the same width out of
 *  its handle; 1.0 keeps it to itself, and may measure U+2010 there. */
export function getHyphenWidth(font: string): number {
  return measureTextWidth('-', font);
}

/**
 * A line pretext ends before a word whose first piece ends inside a Catalan
 * `l·l` (`il·` | `lusió`), taken through that piece when it fits with its
 * hyphen printed in the dot's place (`il-`). Pretext 1.0 fits the dot and
 * the hyphen both (0.0.9 fitted neither), so it would not end the line
 * there (#1213). The line comes back as pretext gives a soft-hyphen break:
 * its text and width with the dot and the hyphen; the loop gives the dot
 * back.
 */
export function throughGeminate(prepared: PreparedTextWithSegments, line: LayoutLine, maxWidth: number, font: string): LayoutLine {
  const { segments, kinds, widths } = prepared;
  const i = line.end.segmentIndex;
  if (line.end.graphemeIndex !== 0 || kinds[i] !== 'text' || kinds[i + 1] !== 'soft-hyphen' || kinds[i - 1] !== 'space') return line;
  const piece = segments[i]!;
  if (!endsInsideGeminate(piece)) return line;
  let spaces = 0;
  for (let j = i - 1; j >= line.start.segmentIndex && kinds[j] === 'space'; j--) spaces += widths[j]!;
  const width = line.width + spaces + widths[i]! + getHyphenWidth(font);
  if (width - geminateDotRoom(piece, font) > maxWidth) return line;
  return { ...line, text: line.text + piece + '-', width, end: { segmentIndex: i + 2, graphemeIndex: 0 } };
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

/** The painted word-space ratio of a justified line that is not the last
 *  (`VDTLine.justifiedSpaceRatio`); the breakers call `justifiedSpaceRatios`,
 *  which gives the ratio the limits bound too (#704). */
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
