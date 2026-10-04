/**
 * Adapter between @chenglou/pretext `PreparedTextWithSegments` and the
 * Knuth-Plass item stream, plus reconstruction of VDT lines from the
 * optimal breakpoint sequence.
 */

import { graphemeCount } from '../measure/graphemes';
import type { PreparedTextWithSegments } from '@chenglou/pretext';
import type { VDTLine, VDTLineSegment } from '../vdt';
import { createBoundingBox } from '../vdt';
import type { TextAlign } from '../types';
import type { KPItem } from './types';
import { HYPHEN_PENALTY, KP_INFINITY, MAX_STRETCH, SOFT_HYPHEN } from './constants';
import { cleanSoftHyphens } from './utils';
import { lineTracking, trackSegments } from './tracking';
import { breaksAfterDash, breaksAfterHardHyphen, isDash } from '../measure/breakRules';
import { endsInsideGeminate, withLineEndHyphen } from '../measure/geminate';
import { joiningScriptIn } from '../measure/joining';

/** Characters tracking may spread over in a segment: none in a word of a
 *  joining script, whose letters connect (`measure/joining.ts`). */
function trackedChars(seg: string): number {
  return joiningScriptIn(seg) ? 0 : graphemeCount(seg);
}

/** The break after a closed dash (`breakAfterDashes`): the line ends on the
 *  dash as it is, nothing is added and nothing is charged. */
interface FreeBreakMeta {
  free: true;
}

/** The break after a hyphen the text carries (`hardHyphens`): the line ends
 *  on that hyphen, nothing is added. */
interface BareBreakMeta {
  bare: true;
}

/** The character `back` places before the last one of segment `i` (`seg`),
 *  read back into the text segments that end right before it (no space in
 *  between), or undefined. */
function charBefore(segments: readonly string[], kinds: readonly string[], i: number, seg: string, back = 1): string | undefined {
  let k = seg.length - 1 - back;
  let s = seg;
  let j = i;
  while (k < 0) {
    if (kinds[j - 1] !== 'text') return undefined;
    j--;
    s = segments[j]!;
    k += s.length;
  }
  return s[k];
}

const LETTER = /\p{L}/u;

/** Whether the hyphen ending text segment `i` has at least two letters
 *  on each side ("e-mail" has one before it, "X-ray" one before it). */
function twoLettersAround(segments: readonly string[], kinds: readonly string[], i: number, seg: string): boolean {
  const before = charBefore(segments, kinds, i, seg, 2);
  if (before === undefined || !LETTER.test(before)) return false;
  let after = '';
  for (let j = i + 1; j < segments.length && kinds[j] === 'text' && after.length < 2; j++) after += segments[j]!;
  return after.length >= 2 && LETTER.test(after[1]!);
}

export function pretextSegmentsToItems(
  prepared: PreparedTextWithSegments,
  normalSpaceWidth: number,
  maxStretchRatio: number,
  minShrinkRatio: number,
  /** Add a break after an em or en dash set closed between words (see
   *  `MeasureBlockOptions.breakAfterDashes`). Pretext keeps such a dash a
   *  text segment of its own, or at the end of one, between two others with
   *  no space in between, where Knuth–Plass had no break at all. */
  breakAfterDashes = false,
  /** Add a break after a hyphen the text carries between two letters
   *  ("meta-" | "analyses"), priced like a syllable, as the rich path does.
   *  Pretext ends a text segment on such a hyphen and breaks there when it
   *  sets lines one by one. Up to postext 1.4, Knuth–Plass on justified
   *  plain text never broke there: ragged text always asks for it, and
   *  justified text with `MeasureBlockOptions.breakAfterHyphens`. */
  hardHyphens = false,
  /** Letters a compound needs on each side of its hyphen for that break:
   *  2 keeps a line from ending on a lone letter ("e-" | "mail"). Justified
   *  text that asks for the break with `breakAfterHyphens` takes 2; ragged
   *  text, which pretext's line-by-line breaker gave every such break, and
   *  compounds the dictionary leaves whole take 1. */
  hardHyphenMinLetters = 1,
  /** Width of the middle dot in the text's font: a break inside a Catalan
   *  `l·l` prints the hyphen in its place (`il-` | `lusió`), so the line
   *  ending there is that much narrower. */
  geminateDotWidth = 0,
): KPItem[] {
  const items: KPItem[] = [];
  const segments = prepared.segments;
  const widths = (prepared as unknown as { widths: number[] }).widths;
  const kinds = (prepared as unknown as { kinds: string[] }).kinds;
  const discretionaryHyphenWidth =
    (prepared as unknown as { discretionaryHyphenWidth: number }).discretionaryHyphenWidth;

  const stretchPerSpace = normalSpaceWidth * (maxStretchRatio - 1);
  const shrinkPerSpace = normalSpaceWidth * (1 - minShrinkRatio);

  for (let i = 0; i < segments.length; i++) {
    const kind = kinds[i]!;
    const w = widths[i]!;

    switch (kind) {
      case 'text': {
        items.push({ type: 'box', width: w, sourceIndex: i, chars: trackedChars(segments[i]!) });
        const seg = segments[i]!;
        const last = seg[seg.length - 1];
        if (kinds[i + 1] !== 'text') break;
        // The characters before the final dash or hyphen: in this segment,
        // or at the end of the text segments before it. Pretext makes a
        // quote and a dash after a space (`said "—Hola`) a segment of their
        // own, so nothing stands before that quote.
        if (breakAfterDashes && isDash(last)) {
          if (breaksAfterDash(charBefore(segments, kinds, i, seg), last!, segments[i + 1]![0], charBefore(segments, kinds, i, seg, 2))) {
            const meta: FreeBreakMeta = { free: true };
            items.push({ type: 'penalty', width: 0, penalty: 0, flagged: false, sourceIndex: i, meta });
          }
        } else if (hardHyphens && last === '-') {
          if (
            breaksAfterHardHyphen(charBefore(segments, kinds, i, seg), segments[i + 1]![0])
            && (hardHyphenMinLetters < 2 || twoLettersAround(segments, kinds, i, seg))
          ) {
            const meta: BareBreakMeta = { bare: true };
            items.push({ type: 'penalty', width: 0, penalty: HYPHEN_PENALTY, flagged: true, sourceIndex: i, meta });
          }
        }
        break;
      }
      case 'space':
      case 'glue':
        items.push({
          type: 'glue',
          width: w,
          stretch: stretchPerSpace,
          shrink: shrinkPerSpace,
          sourceIndex: i,
        });
        break;
      case 'soft-hyphen':
        items.push({
          type: 'penalty',
          width: discretionaryHyphenWidth - (i > 0 && endsInsideGeminate(segments[i - 1]!) ? geminateDotWidth : 0),
          penalty: HYPHEN_PENALTY,
          flagged: true,
          sourceIndex: i,
          chars: 1,
        });
        break;
      case 'hard-break':
        items.push({
          type: 'penalty',
          width: 0,
          penalty: -KP_INFINITY,
          flagged: false,
          sourceIndex: i,
        });
        break;
      case 'zero-width-break':
        items.push({
          type: 'penalty',
          width: 0,
          penalty: 0,
          flagged: false,
          sourceIndex: i,
        });
        break;
      case 'preserved-space':
      case 'tab':
        items.push({ type: 'box', width: w, sourceIndex: i, chars: trackedChars(segments[i]!) });
        break;
      default:
        items.push({ type: 'box', width: w, sourceIndex: i, chars: trackedChars(segments[i]!) });
        break;
    }
  }

  // Final-line glue (infinite stretch) + forced break
  items.push({
    type: 'glue',
    width: 0,
    stretch: MAX_STRETCH,
    shrink: 0,
    sourceIndex: -1,
  });
  items.push({
    type: 'penalty',
    width: 0,
    penalty: -KP_INFINITY,
    flagged: false,
    sourceIndex: -1,
  });

  return items;
}

export function reconstructPretextLines(
  items: KPItem[],
  breaks: number[],
  prepared: PreparedTextWithSegments,
  lineHeightPx: number,
  lineWidthFn: (lineIndex: number) => number,
  lineIndentFn: (lineIndex: number) => number,
  normalSpaceWidth: number,
  textAlign: TextAlign,
  /** `KPOptions.trackingPerChar` the breaks were found with: each line
   *  takes the tracking the breaker counted on (`VDTLine.letterSpacing`). */
  trackingPerChar = 0,
  /** How far below its top each line has its baseline
   *  (`lineBaselineOffset`); 0.8 of the line height by default. */
  baselineOffsetPx = lineHeightPx * 0.8,
  /** See `pretextSegmentsToItems`. */
  geminateDotWidth = 0,
): VDTLine[] {
  const segments = prepared.segments;
  const widths = (prepared as unknown as { widths: number[] }).widths;
  const discretionaryHyphenWidth =
    (prepared as unknown as { discretionaryHyphenWidth: number }).discretionaryHyphenWidth;

  const lines: VDTLine[] = [];
  let lineStart = 0; // item index where current line content starts

  for (let li = 0; li < breaks.length; li++) {
    const breakAt = breaks[li]!;
    const isLastLine = li === breaks.length - 1;
    const lineIndent = lineIndentFn(li);
    const lineMaxWidth = lineWidthFn(li);

    // Determine if this break is at a penalty (hyphenation). A break after
    // a closed dash, or after a hyphen the text carries, ends the line
    // inside the run too, but adds nothing.
    const breakItem = items[breakAt]!;
    const breakMeta = breakItem.type === 'penalty' ? (breakItem.meta as Partial<FreeBreakMeta & BareBreakMeta> | undefined) : undefined;
    const freeBreak = breakMeta?.free === true;
    const bareBreak = breakMeta?.bare === true;
    const hyphenated = breakItem.type === 'penalty' && (breakItem.flagged || freeBreak);

    // Collect segments for this line: items from lineStart to breakAt
    // For glue breaks: line content is items lineStart..breakAt-1 (exclude the breaking glue)
    // For penalty breaks: line content is items lineStart..breakAt-1 (exclude the penalty itself)
    const contentEnd = breakItem.type === 'glue' ? breakAt : breakAt;

    const lineSegments: VDTLineSegment[] = [];
    const textParts: string[] = [];

    for (let j = lineStart; j < contentEnd; j++) {
      const it = items[j]!;
      if (it.sourceIndex < 0) continue; // skip synthetic items

      if (it.type === 'box') {
        const seg = segments[it.sourceIndex]!;
        const w = widths[it.sourceIndex]!;
        if (seg === SOFT_HYPHEN) continue;
        const cleanText = cleanSoftHyphens(seg);
        lineSegments.push({ kind: 'text', text: cleanText, width: w });
        textParts.push(cleanText);
      } else if (it.type === 'glue') {
        const seg = segments[it.sourceIndex]!;
        const w = widths[it.sourceIndex]!;
        lineSegments.push({ kind: 'space', text: seg, width: w });
        textParts.push(seg);
      }
      // Penalties within the line are skipped (they're just potential break points)
    }

    // Trim trailing spaces
    while (lineSegments.length > 0 && lineSegments[lineSegments.length - 1]!.kind === 'space') {
      lineSegments.pop();
      textParts.pop();
    }

    // If hyphenated, append '-' to the last text segment
    if (hyphenated && !freeBreak && !bareBreak && lineSegments.length > 0) {
      const lastIdx = lineSegments.length - 1;
      const last = lineSegments[lastIdx]!;
      if (last.kind === 'text') {
        const text = withLineEndHyphen(last.text);
        lineSegments[lastIdx] = {
          kind: 'text',
          text,
          width: last.width + discretionaryHyphenWidth - (endsInsideGeminate(last.text) ? geminateDotWidth : 0),
        };
        textParts[textParts.length - 1] = text;
      }
    }

    const lineText = textParts.join('');
    // Tracking the breaker counted on for this line, spread on its letters.
    const tracking = trackingPerChar > 0 ? lineTracking(items, lineStart, breakAt, lineMaxWidth, trackingPerChar) : 0;
    if (tracking !== 0) trackSegments(lineSegments, tracking);
    const contentWidth = lineSegments.reduce((s, seg) => s + seg.width, 0);

    // Compute justifiedSpaceRatio
    let justifiedSpaceRatio: number | undefined;
    if (textAlign === 'justify' && !isLastLine && normalSpaceWidth > 0) {
      let wordWidth = 0;
      let spaceCount = 0;
      for (const seg of lineSegments) {
        if (seg.kind === 'space') spaceCount++;
        else wordWidth += seg.width;
      }
      if (spaceCount > 0) {
        const justifiedSpaceWidth = (lineMaxWidth - wordWidth) / spaceCount;
        justifiedSpaceRatio = justifiedSpaceWidth / normalSpaceWidth;
      }
    }

    lines.push({
      text: lineText,
      bbox: createBoundingBox(lineIndent, li * lineHeightPx, contentWidth, lineHeightPx),
      baseline: li * lineHeightPx + baselineOffsetPx,
      hyphenated,
      // The line ends on a hyphen the word carries (EF-140).
      ...(hyphenated && bareBreak ? { hardHyphen: true } : {}),
      segments: lineSegments,
      isLastLine,
      ...(justifiedSpaceRatio !== undefined ? { justifiedSpaceRatio } : {}),
      ...(tracking !== 0 ? { letterSpacing: tracking } : {}),
    });

    // Next line starts after the break
    lineStart = breakAt + 1;
  }

  return lines;
}
