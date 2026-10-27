import { FORCED_BREAK } from './hardBreaks.js';
import { type LayoutCursor, layoutNextLine } from '@chenglou/pretext';
import { type VDTLine, createBoundingBox } from '../vdt.js';
import { hyphenateTextKeepingCompounds, hyphenateText, withoutEdgeSoftHyphens } from '../hyphenation/hyphenate.js';
import { pretextSegmentsToItems, computeBreakpoints, reconstructPretextLines } from '../knuthPlass/index.js';
import { type MeasureBlockOptions, type MeasuredBlock, lineStartAt, maxLineIndent, maxLineInset, SOFT_HYPHEN, lineWidthFunction, uniformMeasureFrom, markInsetLines, lineWidthAt } from './types.js';
import { withLineEndHyphen, endsInsideGeminate, GEMINATE_DOT } from './geminate.js';
import { normalSpaceWidthFor, cleanSoftHyphens, measureTextWidth } from './canvas.js';
import { isRuntLastLine } from './runts.js';
import { justifiedSpaceRatios } from './spaceRatios.js';
import { measureRichBlock } from './rich.js';
import { hasCJK, hasCJKRun } from './cjk/cjk.js';
import { composesAsCjk, composesDashRow } from './cjk/cjkCompose.js';
import { markCuts } from './cjk/markCuts.js';
import { getMeasureWritingMode, withMeasureWritingMode, measuringVertically, getMeasureUprightDigits, getMeasureRegion, lineBaselineOffset } from './vertical.js';
import { holdsVerticalCell } from '../writing/writingMode.js';
import { hasCompound, raggedStretchPx } from './breakRules.js';
import { joiningScriptIn } from './rtl/joining.js';
import { getMeasureDirection } from './rtl/bidiLines.js';
import { needsBidi } from '../writing/bidi.js';
import { getMeasureScriptContext, faceReadsScript } from './script.js';
import { prepareInLanguage } from './pretextLanguage.js';
import { UNIT_SQUARE_RE, holdsLetterlessWord, holdsLetterlessPiece, FIGURE_SPACE, hasOverwideGluedGroup, hasOverwideMixedWord, hasOverwideJoiningWord, hasOverwideCompoundPart, measuresWordsWhole } from './plain/overwide.js';
import { geminateDotWidth, getHyphenWidth, hasOverfullLine, throughGeminate, extractSegments, findLastTextSegmentIndex, geminateDotRoom } from './plain/segments.js';

export { hasOverfullLine, computeJustifiedSpaceRatio } from './plain/segments.js';

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
  // A writing mode asked for this text alone (`options.writingMode`).
  if (options?.writingMode !== undefined && options.writingMode !== getMeasureWritingMode()) {
    const opts = options;
    return withMeasureWritingMode(opts.writingMode!, () => measureBlock(text, font, maxWidthPx, lineHeightPx, opts));
  }

  // A forced line break (#620): the word-by-word breaker breaks the text
  // between two of them on its own (`measure/hardBreaks.ts`).
  if (text.includes(FORCED_BREAK)) {
    return measureRichBlock([{ text, bold: false, italic: false }], font, font, font, font, maxWidthPx, lineHeightPx, options);
  }
  // Words set without spaces (Chinese, Japanese, Korean): the formatted
  // path's breaker, which composes a CJK paragraph (clreq line breaking,
  // inter-character justification) and breaks a Latin one that quotes CJK
  // words next to their characters. The same text gives the same lines on
  // both paths. In vertical text so does any text with a character that
  // stands in a cell of its own (— … © ×) or a short number set in one
  // (`cjk.uprightDigits`): pretext would measure it at its horizontal
  // width. And so does a word holding CJK text and two marks
  // that meet (`本）》录`): pretext would measure it with the browser's
  // trimming, where the renderers paint such marks apart (`markCuts`).
  // Each of the three CJK tests needs CJK text (`hasCJK`), looked for once.
  // A row of dashes alone in a Chinese or Japanese document goes there
  // too (#680): the composer draws it as one rule.
  if ((hasCJK(text) && (hasCJKRun(text) || composesAsCjk(text) || markCuts(text, 'words').length > 0)) || (measuringVertically() && holdsVerticalCell(text, getMeasureUprightDigits(), getMeasureRegion())) || (text.length > 1 && composesDashRow(text, options?.cjkComposition))) {
    return measureRichBlock([{ text, bold: false, italic: false }], font, font, font, font, maxWidthPx, lineHeightPx, options);
  }
  // A unit square (㎡ ㎏, `isUnitSquare`) stays with its number, as the
  // word-by-word breaker keeps it; pretext 1.0 breaks before one as Chrome
  // does (#1213).
  if (UNIT_SQUARE_RE.test(text)) {
    return measureRichBlock([{ text, bold: false, italic: false }], font, font, font, font, maxWidthPx, lineHeightPx, options);
  }
  // A paragraph set right to left, or holding right-to-left text: the
  // word-by-word breaker, which cuts its words where their direction
  // changes (`ABC،`, `(API)` in Arabic), measuring each piece as it is
  // painted (pretext measures `(API)` whole, its brackets kerned to letters
  // they end up on the far side of), and gives its lines their order
  // (`measure/rtl/bidiLines.ts`).
  if ((options?.direction ?? getMeasureDirection()) === 'rtl' || needsBidi(text)) {
    return measureRichBlock([{ text, bold: false, italic: false }], font, font, font, font, maxWidthPx, lineHeightPx, options);
  }
  // A word with no letter (`46.`, `1367)`) in a face that draws its
  // punctuation by script (#725, `measure/script.ts`): the word-by-word
  // breaker, which measures it in the script of the text around it and
  // says so on its segment. Pretext would measure it alone, in whatever
  // script the browser picks for a text with none.
  // So does a word with a letter that may part into a piece with none:
  // after its hyphen (`COVID-19`), or anywhere when it is wider than its
  // line. The breaker measures that piece in the script of its word.
  const readsScript = getMeasureScriptContext().enabled && !measuringVertically() && faceReadsScript(font);
  if (readsScript && (holdsLetterlessWord(text) || holdsLetterlessPiece(text))) {
    return measureRichBlock([{ text, bold: false, italic: false }], font, font, font, font, maxWidthPx, lineHeightPx, options);
  }
  const shouldHyphenate = options?.hyphenate ?? false;
  // Each line's start: its indent past its inset beside a picture (#627).
  const indentOf = (li: number): number => lineStartAt(options, li);
  const widestIndent = maxLineIndent(options) + maxLineInset(options?.lineInsets);
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
  if (text.includes(FIGURE_SPACE) || hasOverwideGluedGroup(text, font, Math.min(maxWidthPx, ...(options?.restWidths ?? []).map((s) => s.maxWidthPx)) - widestIndent)) {
    return measureRichBlock([{ text, bold: false, italic: false }], font, font, font, font, maxWidthPx, lineHeightPx, options);
  }
  if (readsScript && hasOverwideMixedWord(text, font, Math.min(maxWidthPx, ...(options?.restWidths ?? []).map((s) => s.maxWidthPx)) - widestIndent)) {
    return measureRichBlock([{ text, bold: false, italic: false }], font, font, font, font, maxWidthPx, lineHeightPx, options);
  }
  // Words of a joining script stay whole: pretext would break one at a soft
  // hyphen its author typed, and cut one wider than the line between two
  // letters. The word-by-word breaker does neither.
  if (joiningScriptIn(text) && (text.includes(SOFT_HYPHEN) || hasOverwideJoiningWord(text, font, Math.min(maxWidthPx, ...(options?.restWidths ?? []).map((s) => s.maxWidthPx)) - widestIndent))) {
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
  if (keepCompounds && hasOverwideCompoundPart(text, font, maxWidthPx - widestIndent)) {
    return measureRichBlock([{ text, bold: false, italic: false }], font, font, font, font, maxWidthPx, lineHeightPx, options);
  }
  const hyphenatedText = shouldHyphenate
    ? (keepCompounds ? hyphenateTextKeepingCompounds(text) : hyphenateText(text))
    : text;
  // Pretext breaks at every soft hyphen it is given: one typed at a word's
  // edge or next to punctuation is no break and is left out (#700). The
  // block's plain text keeps it, as it keeps the ones inside a line.
  const processedText = text.includes(SOFT_HYPHEN) ? withoutEdgeSoftHyphens(text, hyphenatedText) : hyphenatedText;
  // In a document shaped in its own language a word a line may end inside
  // is measured whole, as in a paragraph with a style (#772). A justified
  // paragraph whose document keeps the lines of postext 1.4 at a compound's
  // hyphen (`breakAfterHyphens: false`) stays here: the word-by-word
  // breaker always breaks there.
  const keepsCompoundLines = options?.optimal === true && textAlign === 'justify' && options.breakAfterHyphens !== true && !keepCompounds && hasCompound(text);
  if (!keepsCompoundLines && measuresWordsWhole(processedText)) {
    return measureRichBlock([{ text, bold: false, italic: false }], font, font, font, font, maxWidthPx, lineHeightPx, options);
  }

  // Measured in the document's language, like every other text (#764).
  const prepared = prepareInLanguage(processedText, font);
  const normalSpaceWidth = textAlign === 'justify' ? normalSpaceWidthFor(font) : 0;

  // Knuth-Plass optimal line breaking path (text with words set without
  // spaces went to the formatted path above; a lone CJK bracket or
  // fullwidth sign in Latin text is no reason). Ragged text takes it too
  // with `optimalRagged`: its word spaces keep their width and each line
  // gets the ragged stretch instead.
  const ragged = textAlign !== 'justify';
  if (options?.optimal && (!ragged || options.optimalRagged)) {
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
    const dotWidth = geminateDotWidth(text, font);
    const hyphenWidth = getHyphenWidth(font);
    const items = pretextSegmentsToItems(prepared, hyphenWidth, spaceWidth, maxStretchRatio, minShrinkRatio, options.breakAfterDashes === true, hardHyphens, ragged || keepCompounds ? 1 : 2, dotWidth);
    const lineWidthFn = lineWidthFunction(maxWidthPx, options);
    const lineIndentFn = indentOf;
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
      lineWidthUniformFrom: uniformMeasureFrom(options.restWidths, options.lineIndentsPx, options.lineInsets),
      trackingPerChar,
      ...(ragged ? { raggedStretch: raggedStretchPx(font) } : {}),
    });
    if (breaks.length > 0) {
      const kpLines = reconstructPretextLines(
        items, breaks, prepared, hyphenWidth, lineHeightPx,
        lineWidthFn, lineIndentFn, normalSpaceWidth, textAlign,
        trackingPerChar, lineBaselineOffset(lineHeightPx, font), dotWidth,
      );
      if (!hasOverfullLine(kpLines, lineWidthFn, ragged)) {
        markInsetLines(kpLines, maxWidthPx, options);
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
  const baselineOffset = lineBaselineOffset(lineHeightPx, font);
  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };
  let y = 0;
  let lineIndex = 0;

  while (true) {
    // The line's own indent (`lineIndentAt`): the first line's, a hanging
    // one, or the line's entry in `lineIndentsPx`; past its inset beside a
    // picture (#627).
    const lineIndent = indentOf(lineIndex);
    const lineMaxWidth = lineWidthAt(maxWidthPx, options, lineIndex);

    const next = layoutNextLine(prepared, lineMaxWidth, cursor);
    if (next === null) break;
    const line = throughGeminate(prepared, next, lineMaxWidth, font);

    const nextCursor = line.end;

    const { segments, hyphenated } = extractSegments(prepared, cursor, nextCursor, font);

    /** What the break inside an `l·l` gave back on this line, if it ends there. */
    let geminateRoom: number | undefined;
    if (hyphenated) {
      const lastTextIdx = findLastTextSegmentIndex(segments);
      if (lastTextIdx >= 0) {
        const lastSeg = segments[lastTextIdx]!;
        segments[lastTextIdx] = {
          kind: 'text',
          text: withLineEndHyphen(lastSeg.text),
          width: lastSeg.width + getHyphenWidth(font)
            - (endsInsideGeminate(lastSeg.text) ? (geminateRoom = geminateDotRoom(lastSeg.text, font)) : 0),
        };
      }
    }

    // Whether this turns out to be the last line is only known once the
    // loop ends; the ratio is computed as if it weren't and corrected below.
    // This avoids a second layoutNextLine call per line just to peek ahead.
    const spaceRatios = textAlign === 'justify' ? justifiedSpaceRatios(segments, lineMaxWidth, normalSpaceWidth) : {};

    // Pretext's line text already ends with the hyphen of a soft-hyphen
    // break; add it only when it does not. It also carries the zero-width
    // breaks the segments leave out.
    let lineText = cleanSoftHyphens(line.text).replace(/\u200B/g, '');
    let lineWidth = line.width;
    if (hyphenated) {
      const body = lineText.endsWith('-') ? lineText.slice(0, -1) : lineText;
      if (endsInsideGeminate(body)) lineWidth -= geminateRoom ?? measureTextWidth(GEMINATE_DOT, font);
      lineText = withLineEndHyphen(body);
    }
    lines.push({
      text: lineText,
      bbox: createBoundingBox(lineIndent, y, lineWidth, lineHeightPx),
      baseline: y + baselineOffset,
      hyphenated,
      segments,
      isLastLine: false,
      ...spaceRatios,
    });

    cursor = nextCursor;
    y += lineHeightPx;
    lineIndex++;
  }

  const lastLine = lines[lines.length - 1];
  if (lastLine) {
    lastLine.isLastLine = true;
    delete lastLine.justifiedSpaceRatio;
    delete lastLine.justifiedSpaceLimitRatio;
  }
  markInsetLines(lines, maxWidthPx, options);

  return { lines, totalHeight: y };
}
