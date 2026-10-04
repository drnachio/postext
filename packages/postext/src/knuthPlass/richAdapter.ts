/**
 * Adapter between the bold/italic/math-aware "rich token" stream produced
 * by the measure pipeline and the Knuth-Plass item stream, plus
 * reconstruction of VDT lines from the optimal breakpoint sequence.
 */

import type { VDTChip, VDTLine, VDTLineSegment, VDTSegmentMarks } from '../vdt';
import { createBoundingBox } from '../vdt';
import type { TextAlign } from '../types';
import type { KPItem, RichTokenMeta } from './types';
import { HYPHEN_PENALTY, KP_INFINITY, MAX_STRETCH } from './constants';
import { cleanSoftHyphens } from './utils';
import { trimChipLineEdges } from '../measure/chipEdges';
import { lineTracking, trackSegments } from './tracking';
import { graphemeCount } from '../measure/graphemes';
import { endsInsideGeminate, withLineEndHyphen } from '../measure/geminate';
import { joiningScriptIn } from '../measure/joining';

interface RichBreakPoint {
  charIndex: number;
  widthBefore: number;
  /** A hard hyphen the word carries: the line ends as it is, no hyphen added. */
  bare?: boolean;
  /** No hyphenation point (between ideographs): nothing added, no penalty. */
  free?: boolean;
  /** For the greedy breaker only (after a dash): not a break here. */
  greedyOnly?: boolean;
  /** A soft hyphen typed in the text: never held back by a hyphenation
   *  zone. */
  author?: boolean;
  /** A free break next to a CJK character: the line is not hyphenated. */
  cjk?: boolean;
  /** Inside a Catalan `l·l`: the hyphen replaces the middle dot, this wide. */
  replacesWidth?: number;
}

interface RichToken {
  text: string;
  bold: boolean;
  italic: boolean;
  script?: 'sup' | 'sub';
  scriptFont?: string;
  baselineShift?: number;
  /** An inline footnote marker's own font (see `measure/rich.ts`). */
  markerFont?: string;
  /** One of a subscript and a superscript set over each other (see
   *  `stackedScriptPairs` in `measure/rich.ts`): the `first` has width 0,
   *  the `second` the pair's advance. */
  stacked?: 'first' | 'second';
  /** Small capitals: flagged on the segment, which the measurer splits into
   *  capital runs once the lines are built (see `measure/rich.ts`). */
  smallCaps?: boolean;
  kind: 'text' | 'space';
  width: number;
  breakPoints?: RichBreakPoint[];
  hyphenWidth?: number;
  mathRender?: import('../math/types').MathRender;
  refResourceId?: string;
  refAnchor?: true;
  refPageIndex?: number;
  footnoteId?: string;
  /** A bibliography label's space (#290, see `measure/rich.ts`). */
  labelTab?: 'lead' | 'gap';
  /** An inline colour swatch (atomic square; see `measure/rich.ts`). */
  swatch?: { color?: string };
  /** An inline chip (atomic box; see `measure/rich.ts`). */
  chip?: VDTChip;
  /** Chinese marks on the token's text (#193). */
  cjkMarks?: VDTSegmentMarks;
  /** Characters the layout added (a book title's 《》). */
  inserted?: boolean;
  /** Bare break points (URL joints): no hyphen is appended at the break. */
  bareBreaks?: boolean;
  /** Ends on a closed dash the next, touching token follows: a free break
   *  after it (see `markDashJoins` in `measure/rich.ts`). */
  dashJoin?: boolean;
  /** Vertical text: a `:tcy[…]` cell, a `:upright[…]` or `:sideways[…]`
   *  run (see `measure/rich.ts`). */
  tcy?: true;
  orientation?: 'upright' | 'sideways';
  /** Styled runs of one word of a joining script (see `measure/rich.ts`). */
  runs?: { text: string; bold?: boolean; italic?: boolean }[];
}

export function richTokensToItems(
  tokens: RichToken[],
  normalSpaceWidth: number,
  maxStretchRatio: number,
  minShrinkRatio: number,
  /** A break after a compound's hyphen opens the next line with a hyphen
   *  too (`MeasureBlockOptions.repeatHyphen`): its penalty carries that
   *  hyphen as post-break width. */
  repeatHyphen = false,
): KPItem[] {
  const items: KPItem[] = [];
  const stretchPerSpace = normalSpaceWidth * (maxStretchRatio - 1);
  const shrinkPerSpace = normalSpaceWidth * (1 - minShrinkRatio);

  for (let t = 0; t < tokens.length; t++) {
    const token = tokens[t]!;
    const meta: RichTokenMeta = {
      bold: token.bold,
      italic: token.italic,
      originalTokenIndex: t,
    };

    if (token.kind === 'space') {
      items.push({
        type: 'glue',
        width: token.width,
        stretch: stretchPerSpace,
        shrink: shrinkPerSpace,
        sourceIndex: t,
        meta: { ...meta },
      });
      continue;
    }

    // Characters tracking spreads: none on a formula or a swatch, nor on a
    // word of a joining script (its letters connect; see
    // `measure/joining.ts`); a chip paints its own runs, so its line takes
    // no tracking at all.
    // Two stacked scripts advance as far as the wider one: the first
    // counts no character, the second the longer run's (see `trackSegments`).
    const atomic = token.mathRender !== undefined || token.swatch !== undefined || token.chip !== undefined || joiningScriptIn(token.text);
    const stackedChars = token.stacked === 'first'
      ? 0
      : token.stacked === 'second' ? Math.max(graphemeCount(token.text), graphemeCount(tokens[t - 1]?.text ?? '')) : undefined;
    const tracking = (from: number, to: number): { chars: number; noTracking?: true } => (
      token.chip ? { chars: 0, noTracking: true } : { chars: atomic ? 0 : stackedChars ?? graphemeCount(token.text.slice(from, to)) }
    );

    // Text token — may have soft-hyphen break points (the greedy breaker's
    // own ones left out: Knuth–Plass breaks there on neither path)
    const breakPoints = token.breakPoints?.filter((bp) => !bp.greedyOnly);
    if (breakPoints && breakPoints.length > 0) {
      const hyphenW = token.hyphenWidth ?? 0;
      let prevCharIndex = 0;
      let prevWidth = 0;

      for (let bp = 0; bp < breakPoints.length; bp++) {
        const breakPoint = breakPoints[bp]!;
        const fragmentWidth = breakPoint.widthBefore - prevWidth;

        // Box for the fragment before this break point
        items.push({
          type: 'box',
          width: fragmentWidth,
          sourceIndex: t,
          meta: { ...meta, subStart: prevCharIndex, subEnd: breakPoint.charIndex },
          ...tracking(prevCharIndex, breakPoint.charIndex),
        });

        // Penalty at the break: a soft hyphen adds one, a hard hyphen the
        // word carries ends the line as it is, and a break between
        // ideographs costs nothing and adds nothing.
        items.push(breakPoint.free
          ? { type: 'penalty', width: 0, penalty: 0, flagged: false, sourceIndex: t, meta: { ...meta, free: true, ...(breakPoint.cjk ? { cjk: true } : {}) } }
          : {
            type: 'penalty',
            width: breakPoint.bare ? 0 : hyphenW - (token.bareBreaks ? 0 : breakPoint.replacesWidth ?? 0),
            penalty: HYPHEN_PENALTY,
            flagged: true,
            sourceIndex: t,
            meta: {
              ...meta,
              ...(breakPoint.bare ? { bare: true } : {}),
              ...(breakPoint.replacesWidth !== undefined ? { replacesWidth: breakPoint.replacesWidth } : {}),
            },
            // The hyphen a syllable break adds (a URL joint adds none).
            ...(breakPoint.bare || token.bareBreaks ? {} : { chars: 1 }),
            // A dictionary syllable: the hyphenation zone of ragged text
            // governs it (the author's soft hyphens and the word's own
            // joints always break).
            ...(breakPoint.bare || token.bareBreaks || breakPoint.author ? {} : { zoned: true }),
            // The compound's hyphen, repeated at the start of the next line.
            ...(repeatHyphen && breakPoint.bare && !token.bareBreaks ? { postWidth: hyphenW, postChars: 1 } : {}),
          });

        prevCharIndex = breakPoint.charIndex;
        prevWidth = breakPoint.widthBefore;
      }

      // Final fragment after last break point
      items.push({
        type: 'box',
        width: token.width - prevWidth,
        sourceIndex: t,
        meta: { ...meta, subStart: prevCharIndex, subEnd: token.text.length },
        ...tracking(prevCharIndex, token.text.length),
      });
    } else {
      // Simple text token without break points
      items.push({
        type: 'box',
        width: token.width,
        sourceIndex: t,
        meta: { ...meta, subStart: 0, subEnd: token.text.length },
        ...tracking(0, token.text.length),
      });
    }

    // A closed dash that ends this run, the next run touching it: the line
    // may end on the dash, as after one inside a word.
    if (token.dashJoin) {
      items.push({ type: 'penalty', width: 0, penalty: 0, flagged: false, sourceIndex: t, meta: { ...meta, free: true } });
    }
  }

  // Final-line glue + forced break
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

export function reconstructRichLines(
  items: KPItem[],
  breaks: number[],
  tokens: RichToken[],
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
): VDTLine[] {
  const lines: VDTLine[] = [];
  let lineStart = 0;

  for (let li = 0; li < breaks.length; li++) {
    const breakAt = breaks[li]!;
    const isLastLine = li === breaks.length - 1;
    const lineIndent = lineIndentFn(li);
    const lineMaxWidth = lineWidthFn(li);
    // The break before this line repeats the compound's hyphen here.
    const before = items[lineStart - 1];
    const repeated = before?.type === 'penalty' && (before.postWidth ?? 0) > 0 ? before.postWidth! : 0;

    const breakItem = items[breakAt]!;
    // A break between ideographs ends the line inside a run, like a
    // hyphenation point, but adds no hyphen.
    const freeBreak = breakItem.type === 'penalty' && (breakItem.meta as RichTokenMeta | undefined)?.free === true;
    // …but one next to a CJK character is no hyphenation point at all.
    const cjkBreak = freeBreak && (breakItem.meta as RichTokenMeta | undefined)?.cjk === true;
    const hyphenated = breakItem.type === 'penalty' && (breakItem.flagged || (freeBreak && !cjkBreak));

    const lineSegments: (VDTLineSegment & { smallCaps?: boolean })[] = [];
    const textParts: string[] = [];

    for (let j = lineStart; j < breakAt; j++) {
      const it = items[j]!;
      if (it.sourceIndex < 0) continue;
      const meta = it.meta as RichTokenMeta | undefined;

      if (it.type === 'box' && meta) {
        const token = tokens[meta.originalTokenIndex]!;
        const subText = meta.subStart !== undefined && meta.subEnd !== undefined
          ? token.text.slice(meta.subStart, meta.subEnd)
          : token.text;
        const cleanText = cleanSoftHyphens(subText);
        lineSegments.push({
          kind: token.mathRender ? 'math' : token.swatch ? 'swatch' : token.chip ? 'chip' : 'text',
          text: cleanText,
          width: it.width,
          bold: meta.bold || undefined,
          italic: meta.italic || undefined,
          ...(token.mathRender ? { mathRender: token.mathRender } : {}),
          ...(token.swatch ? { swatch: token.swatch } : {}),
          ...(token.chip ? { chip: token.chip } : {}),
          ...(token.refResourceId !== undefined ? { refResourceId: token.refResourceId, ...(token.refAnchor ? { refAnchor: true as const } : {}), ...(token.refPageIndex !== undefined ? { refPageIndex: token.refPageIndex } : {}) } : {}),
          ...(token.footnoteId !== undefined ? { footnoteId: token.footnoteId } : {}),
          ...(token.labelTab ? { labelTab: true as const } : {}),
          ...(token.script ? { script: token.script, fontString: token.scriptFont, baselineShift: token.baselineShift } : {}),
          ...(token.markerFont && !token.script ? { fontString: token.markerFont } : {}),
          ...(token.stacked === 'first' ? { stacked: true } : {}),
          ...(token.smallCaps ? { smallCaps: true } : {}),
          ...(token.tcy ? { tcy: true as const } : {}),
          ...(token.orientation ? { orientation: token.orientation } : {}),
          ...(token.cjkMarks ? { cjkMarks: token.cjkMarks } : {}),
          ...(token.inserted ? { inserted: true } : {}),
          ...(token.runs ? { runs: token.runs } : {}),
        });
        textParts.push(cleanText);
      } else if (it.type === 'glue' && meta) {
        const token = tokens[meta.originalTokenIndex]!;
        lineSegments.push({
          kind: 'space',
          text: token.text,
          width: it.width,
        });
        textParts.push(token.text);
      }
    }

    // Trim trailing spaces
    while (lineSegments.length > 0 && lineSegments[lineSegments.length - 1]!.kind === 'space') {
      lineSegments.pop();
      textParts.pop();
    }

    // The repeated hyphen opens the line, on the tail of the compound.
    const opensRepeated = repeated > 0 && lineSegments[0]?.kind === 'text';
    if (opensRepeated) {
      lineSegments[0] = { ...lineSegments[0]!, text: `-${lineSegments[0]!.text}`, width: lineSegments[0]!.width + repeated };
      textParts[0] = `-${textParts[0]}`;
    }

    // If hyphenated, append '-' to the last text segment — unless the break
    // is a bare one inside a URL, or between ideographs, which ends the
    // line as it is.
    const breakMeta = breakItem.meta as RichTokenMeta | undefined;
    const breakToken = breakMeta ? tokens[breakMeta.originalTokenIndex] : undefined;
    if (hyphenated && !freeBreak && lineSegments.length > 0 && !breakToken?.bareBreaks && !breakMeta?.bare) {
      const hyphenW = breakToken?.hyphenWidth ?? 0;
      const lastIdx = lineSegments.length - 1;
      const last = lineSegments[lastIdx]!;
      if (last.kind === 'text' && last.refResourceId === undefined && last.footnoteId === undefined) {
        const geminate = breakMeta?.replacesWidth !== undefined && endsInsideGeminate(last.text);
        const text = geminate ? withLineEndHyphen(last.text) : last.text + '-';
        lineSegments[lastIdx] = {
          ...last,
          text,
          width: last.width + hyphenW - (geminate ? breakMeta!.replacesWidth! : 0),
        };
        textParts[textParts.length - 1] = text;
      }
    }

    const lineText = textParts.join('');
    const segments = trimChipLineEdges(lineSegments);
    // Tracking the breaker counted on for this line, spread on its letters.
    const tracking = trackingPerChar > 0 ? lineTracking(items, lineStart, breakAt, lineMaxWidth, trackingPerChar) : 0;
    if (tracking !== 0) trackSegments(segments, tracking);
    const contentWidth = segments.reduce((s, seg) => s + seg.width, 0);

    // Compute justifiedSpaceRatio
    let justifiedSpaceRatio: number | undefined;
    if (textAlign === 'justify' && !isLastLine && normalSpaceWidth > 0) {
      let wordWidth = 0;
      let spaceCount = 0;
      for (const seg of segments) {
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
      ...(hyphenated && breakMeta?.bare ? { hardHyphen: true } : {}),
      ...(opensRepeated ? { repeatedHyphen: true } : {}),
      segments,
      isLastLine,
      ...(justifiedSpaceRatio !== undefined ? { justifiedSpaceRatio } : {}),
      ...(tracking !== 0 ? { letterSpacing: tracking } : {}),
    });

    lineStart = breakAt + 1;
  }

  return lines;
}
