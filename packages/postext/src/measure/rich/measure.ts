// The entry points measureRichBlock and measureRichSnippet, and
// measureRichText breaking the tokens into lines (#1276: split out of rich.ts).
import { FORCED_BREAK, measureForcedBreaks } from '../hardBreaks.js';
import { placeTab } from '../tabs.js';
import { type VDTLineSegment, type VDTLine, createBoundingBox } from '../../vdt.js';
import { uprightArabicSpans } from '../../writing/uprightArabic.js';
import type { InlineSpan } from '../../parse/index.js';
import { richTokensToItems, computeBreakpoints, reconstructRichLines } from '../../knuthPlass/index.js';
import { type MeasureBlockOptions, type MeasuredBlock, lineStartAt, lineWidthAt, lineWidthFunction, uniformMeasureFrom, markInsetLines } from '../types.js';
import { normalSpaceWidthFor, measureTextWidth, cleanSoftHyphens } from '../canvas.js';
import { isRuntLastLine } from '../runts.js';
import { hasOverfullLine } from '../plain.js';
import { justifiedSpaceRatios } from '../spaceRatios.js';
import { trimChipLineEdges } from '../chipEdges.js';
import { hasCJK, cjkJoinBreaks } from '../cjk/cjk.js';
import { composesDashRow, composesAsCjk, composeCjkParagraph } from '../cjk/cjkCompose.js';
import { getCjkComposition } from '../cjk/cjkPunctuation.js';
import { graphemeCount } from '../graphemes.js';
import { getMeasureWritingMode, withMeasureWritingMode, measuringVertically, getMeasureUprightDigits, getMeasureRegion, lineBaselineOffset } from '../vertical.js';
import { isBlankText } from '../spaces.js';
import { raggedStretchPx } from '../breakRules.js';
import { joiningScriptIn } from '../rtl/joining.js';
import { spanLanguages, applySegmentLanguages } from '../rtl/bidiLines.js';
import { justifyLinesWithKashida } from '../rtl/kashida.js';
import { sidewaysNumberSpans, setLabelTabs, tokenSegment } from './spanTokens.js';
import { tabsAsSpaces, paragraphBidi, markKashidaCapacity, withDirections, tabRun, setTabbedLine } from './tabsAndBidi.js';
import { tokenizeSpans } from './tokenize.js';
import { type RichToken, tokenFont, pickSpanFont, rtlWordWidth, expandSmallCaps, type RichBreakPoint } from './tokens.js';
import { ownRest, markRestShifts, withLeadingHyphen, MAX_RAGGED_HYPHEN_RUN, trailingSpaceWidth, splitToken, isDivisible, emergencySplit, gluedTailLength, lastPlainBreakInGroup, lastSyllableInGroup } from './wordBreaks.js';

/**
 * Measure a rich text block with mixed font weights.
 * Uses canvas measureText for per-token measurement and greedy line-breaking.
 * A text of nothing but whitespace, no-break spaces included, sets no line.
 */
export function measureRichBlock(
  spans: InlineSpan[],
  normalFont: string,
  boldFont: string,
  italicFont: string,
  boldItalicFont: string,
  maxWidthPx: number,
  lineHeightPx: number,
  options?: MeasureBlockOptions,
): MeasuredBlock {
  const plainText = spans.map((s) => s.text).join('');
  if (plainText.trim() === '') {
    return { lines: [], totalHeight: 0 };
  }
  return measureRichText(spans, plainText, normalFont, boldFont, italicFont, boldItalicFont, maxWidthPx, lineHeightPx, options);
}

/**
 * {@link measureRichBlock} for a paragraph of a table cell, or a piece of a
 * caption or a note: a text of nothing but no-break spaces sets a line of
 * them, as CommonMark reads a line holding U+00A0 (EF-154). Ordinary
 * whitespace, and a lone zero-width U+FEFF, still set none (see
 * {@link isBlankText}). The body keeps {@link measureRichBlock}'s rule, as
 * its parser drops such a paragraph too.
 */
export function measureRichSnippet(
  spans: InlineSpan[],
  normalFont: string,
  boldFont: string,
  italicFont: string,
  boldItalicFont: string,
  maxWidthPx: number,
  lineHeightPx: number,
  options?: MeasureBlockOptions,
): MeasuredBlock {
  const plainText = spans.map((s) => s.text).join('');
  if (isBlankText(plainText)) {
    return { lines: [], totalHeight: 0 };
  }
  return measureRichText(spans, plainText, normalFont, boldFont, italicFont, boldItalicFont, maxWidthPx, lineHeightPx, options);
}

function measureRichText(
  spans: InlineSpan[],
  plainText: string,
  normalFont: string,
  boldFont: string,
  italicFont: string,
  boldItalicFont: string,
  maxWidthPx: number,
  lineHeightPx: number,
  options: MeasureBlockOptions | undefined,
): MeasuredBlock {
  // A writing mode asked for this text alone (`options.writingMode`): every
  // width below reads it.
  if (options?.writingMode !== undefined && options.writingMode !== getMeasureWritingMode()) {
    const opts = options;
    return withMeasureWritingMode(opts.writingMode!, () => measureRichText(spans, plainText, normalFont, boldFont, italicFont, boldItalicFont, maxWidthPx, lineHeightPx, opts));
  }
  // Forced line breaks (#620): the text between two of them is broken on
  // its own, by whichever breaker sets it, and the pieces stacked
  // (`measure/hardBreaks.ts`).
  if (plainText.includes(FORCED_BREAK)) {
    return measureForcedBreaks(spans, maxWidthPx, lineHeightPx, options, (piece, opts) =>
      measureRichText(piece, piece.map((s) => s.text).join(''), normalFont, boldFont, italicFont, boldItalicFont, maxWidthPx, lineHeightPx, opts));
  }
  // Tabs (#622) are word spaces in vertical text.
  if (measuringVertically() && spans.some((sp) => sp.tab)) spans = tabsAsSpaces(spans);
  // Vertical text: a short number inside a Latin sentence runs sideways
  // with it, read against the whole paragraph (#222).
  if (measuringVertically()) spans = sidewaysNumberSpans(spans, getMeasureUprightDigits(), getMeasureRegion());
  // Arabic letters are never slanted (#376, `uprightArabic.ts`).
  spans = uprightArabicSpans(spans, italicFont, boldItalicFont, normalFont, boldFont);
  // Chinese, Japanese or Korean text: its own composer, which breaks
  // between characters under the document's line-break rules and spreads
  // justified lines between them — also text with no two CJK letters in a
  // row (价¥5,999。好, 第1条、第2条). A Latin paragraph that only quotes a
  // few CJK words stays here, with a break allowed next to their characters.
  // So is a paragraph with ruby, a warichu note or kanbun marks (#194,
  // #195, #430), which the composer alone lays out.
  // The paragraph is looked at for CJK text once (`cjkText`); a Latin one
  // then never looks into its words.
  // A paragraph with a tab (#622) is set by the line breaker below, which
  // breaks Chinese and Japanese words between their characters under the
  // document's rules; one with ruby, a warichu note or kanbun marks keeps
  // the composer, its tabs set as word spaces.
  const cjkText = hasCJK(plainText);
  const annotated = spans.some((s) => s.ruby || s.warichu || s.kunten);
  const hasTabs = spans.some((s) => s.tab);
  // A row of dashes alone in a Chinese or Japanese document is one rule
  // (#680): the composer's too.
  const dashRow = !cjkText && !hasTabs && plainText.length > 1 && composesDashRow(plainText, options?.cjkComposition);
  if ((cjkText && composesAsCjk(plainText) && !hasTabs) || annotated || dashRow) {
    return composeCjkParagraph(hasTabs ? tabsAsSpaces(spans) : spans, normalFont, boldFont, italicFont, boldItalicFont, maxWidthPx, lineHeightPx, options);
  }

  const shouldHyphenate = options?.hyphenate ?? false;
  // Each line's start: its indent past its inset beside a picture (#627).
  const indentOf = (li: number): number => lineStartAt(options, li);
  const textAlign = options?.textAlign ?? 'left';
  const letterSpacingPx = options?.letterSpacingPx ?? 0;
  const hyphenationZonePx = shouldHyphenate ? options?.hyphenationZonePx : undefined;
  // A paragraph with right-to-left text: its levels, read once, cut its
  // words where they change direction and give its lines their order.
  const bidi = paragraphBidi(spans, plainText, options);
  // The languages the paragraph's isolates name (`:ltr[…]{lang=en}`), set
  // on the segments of their text (`VDTLineSegment.lang`).
  const languages = spans.some((sp) => sp.direction?.lang !== undefined || sp.direction?.outer !== undefined) ? spanLanguages(spans) : [];
  // `keep-all` holds in a Latin paragraph that quotes CJK characters as it
  // does in one the composer sets (#705).
  const keepAll = cjkText && (options?.cjkWordBreak !== undefined ? options.cjkWordBreak === 'keep-all' : (options?.cjkComposition ?? getCjkComposition()).keepAll === true);
  const tokens = tokenizeSpans(spans, normalFont, boldFont, italicFont, boldItalicFont, shouldHyphenate, letterSpacingPx, options?.breakAfterDashes === true, options?.hyphenateCompounds === false, cjkText, bidi, keepAll);
  if (options?.labelColumnPx !== undefined) setLabelTabs(tokens, (t) => t.labelTab, options.labelColumnPx, (t, w) => { t.width = w; });
  const repeatHyphen = options?.repeatHyphen === true;
  // Words whose halves at a line end are measured as the texts painted, in
  // a document shaped in its own language (#770, `RichToken.ownPieces`):
  // the font each is measured in, and the pieces of the rest of one that
  // opens a line, for the lines Knuth–Plass sets (`reconstructRichLines`).
  const ownTokens = tokens.some((t) => t.ownPieces !== undefined);
  const fontOfToken = (t: RichToken): string => tokenFont(t, normalFont, boldFont, italicFont, boldItalicFont);
  const ownFont = (t: RichToken): string | undefined => (t.ownPieces !== undefined ? fontOfToken(t) : undefined);
  const restPieces = (tokenIndex: number, from: number, cuts: readonly number[], lead: string): number[] => {
    const token = tokens[tokenIndex]!;
    const width = ownRest(token, from, fontOfToken(token), lead);
    let before = 0;
    return cuts.map((to) => {
      const upTo = width(to);
      const piece = upTo - before;
      before = upTo;
      return piece;
    });
  };
  const hasSmallCaps = tokens.some((t) => t.smallCaps);
  const normalSpaceWidth = textAlign === 'justify' ? normalSpaceWidthFor(normalFont) + letterSpacingPx : 0;

  if (tokens.length === 0) {
    return { lines: [], totalHeight: 0 };
  }

  // Kashida justification (#375): a justified paragraph with Arabic words.
  const kashida = textAlign === 'justify' && options?.kashida && bidi ? options.kashida : undefined;
  if (kashida) markKashidaCapacity(tokens, kashida, normalFont, boldFont, italicFont, boldItalicFont);
  const fontOf = (seg: VDTLineSegment) => seg.fontString ?? pickSpanFont(!!seg.bold, !!seg.italic, normalFont, boldFont, italicFont, boldItalicFont);
  const withKashida = (lines: VDTLine[]) => {
    if (!kashida) return;
    justifyLinesWithKashida(lines, (li) => {
      return lineWidthAt(maxWidthPx, options, li);
    }, normalSpaceWidth, kashida, (seg, text) => rtlWordWidth(text, fontOf(seg)));
  };

  // Knuth-Plass optimal line breaking path. A Latin paragraph quoting CJK
  // words takes it too: the breaks next to their characters are free
  // penalties, as a hyphenation point that adds nothing. Ragged text takes
  // it too with `optimalRagged`: its word spaces keep their width and each
  // line gets the ragged stretch instead.
  const ragged = textAlign !== 'justify';
  // A paragraph that holds a tab is set line by line (#622): a tab's width
  // depends on where its line starts.
  if (options?.optimal && (!ragged || options.optimalRagged) && !hasTabs) {
    const maxStretchRatio = ragged ? 1 : options.maxStretchRatio ?? 1.5;
    const minShrinkRatio = ragged ? 1 : options.minShrinkRatio ?? 0.8;
    // The runt threshold counts word spaces on ragged text too.
    const spaceWidth = ragged ? normalSpaceWidthFor(normalFont) + letterSpacingPx : normalSpaceWidth;
    // The rest of a word broken at a line end, as the text painted (#770).
    if (ownTokens) markRestShifts(tokens, fontOfToken, repeatHyphen);
    const items = richTokensToItems(tokens, spaceWidth, maxStretchRatio, minShrinkRatio, repeatHyphen);
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
      ...(options.keepBreaks?.path === 'rich' ? { fixedBreaks: options.keepBreaks.at } : {}),
      looseness: options.looseness ?? 0,
      lineWidthUniformFrom: uniformMeasureFrom(options.restWidths, options.lineIndentsPx, options.lineInsets),
      trackingPerChar,
      ...(ragged ? { raggedStretch: raggedStretchPx(normalFont) } : {}),
      ...(ragged && hyphenationZonePx !== undefined ? { hyphenationZone: hyphenationZonePx } : {}),
    });
    if (breaks.length > 0) {
      const kpLines = reconstructRichLines(
        items, breaks, tokens, lineHeightPx,
        lineWidthFn, lineIndentFn, normalSpaceWidth, textAlign,
        trackingPerChar, lineBaselineOffset(lineHeightPx, normalFont),
        ownTokens ? restPieces : undefined,
      );
      if (!hasOverfullLine(kpLines, lineWidthFn, ragged)) {
        if (hasSmallCaps) expandSmallCaps(kpLines, normalFont, boldFont, italicFont, boldItalicFont, letterSpacingPx);
        if (bidi) withDirections(kpLines, bidi, normalFont, boldFont, italicFont, boldItalicFont);
        if (languages.length > 0) applySegmentLanguages(kpLines, plainText, languages);
        withKashida(kpLines);
        markInsetLines(kpLines, maxWidthPx, options);
        return {
          lines: kpLines,
          totalHeight: kpLines.length * lineHeightPx,
          ...(isRuntLastLine(kpLines, runtMinWidth) ? { lastLineRunt: true } : {}),
          breaks: { path: 'rich', at: breaks },
        };
      }
    }
    // Fallback to greedy if K-P produced no breaks, or a line past the
    // measure (a word wider than it: the greedy breaker divides it)
  }

  const lines: VDTLine[] = [];
  const baselineOffset = lineBaselineOffset(lineHeightPx, normalFont);
  let y = 0;
  let tokenIdx = 0;
  let lineIndex = 0;
  // Lines in a row that ended on a dictionary syllable (ragged hyphenation).
  let syllableRun = 0;
  // The line before broke after a compound's hyphen, which this one repeats
  // (`repeatHyphen`).
  let repeatPending = false;
  // Tabs (#622): a leader is measured in the paragraph's face, tracked as
  // its words are; a tab past the last stop is a word space.
  const leaderWidth = (text: string): number => measureTextWidth(text, normalFont) + (letterSpacingPx === 0 ? 0 : letterSpacingPx * graphemeCount(text));
  const tabSpaceWidth = hasTabs ? normalSpaceWidthFor(normalFont) + letterSpacingPx : 0;
  // A word space a line may start or end at (a tab is none).
  const isBreakSpace = (t: RichToken): boolean => t.kind === 'space' && !t.tab;

  while (tokenIdx < tokens.length) {
    const lineIndent = indentOf(lineIndex);
    const lineMaxWidth = lineWidthAt(maxWidthPx, options, lineIndex);

    const lineTokens: RichToken[] = [];
    let lineWidth = 0;
    let lineHyphenated = false;
    let lineSyllable = false;
    // The line ends after a hyphen the word carries (EF-140).
    let lineHardHyphen = false;
    // A word of a joining script wider than the line runs past it.
    let lineWordOverflow = false;
    let lineWordDivided: 'syllable' | 'character' | undefined;
    // The line holds a tab placed at a stop (#622).
    let lineTabbed = false;

    // Consume leading spaces at line start (skip them)
    while (tokenIdx < tokens.length && isBreakSpace(tokens[tokenIdx]!)) {
      tokenIdx++;
    }
    // The compound's hyphen, repeated: the tail it broke from opens the
    // line with it, measured.
    const lineRepeated = repeatPending && tokens[tokenIdx]?.kind === 'text';
    if (lineRepeated) {
      const tail = tokens[tokenIdx]!;
      tokens[tokenIdx] = withLeadingHyphen(tail, tail.hyphenWidth ?? measureTextWidth('-', tokenFont(tail, normalFont, boldFont, italicFont, boldItalicFont)) + letterSpacingPx, ownFont(tail));
    }
    repeatPending = false;
    // This line ends after a compound's hyphen the next one repeats.
    let lineRepeatNext = false;
    // Tabs (#622): the stop the line's last tab took, and that tab's place
    // among the line's tokens.
    let tabUsedPos = -Infinity;
    let lastTabAt = -1;

    // Greedy: add tokens until we overflow
    while (tokenIdx < tokens.length) {
      let token = tokens[tokenIdx]!;

      if (token.tab) {
        const x = lineIndent + lineWidth;
        const placement = placeTab(
          x,
          tabRun(tokens, tokenIdx, normalFont, boldFont, italicFont, boldItalicFont, letterSpacingPx),
          { start: lineIndent, end: lineIndent + lineMaxWidth, measure: maxWidthPx, usedPos: tabUsedPos },
          options?.tabs,
          token.tab.stop,
          leaderWidth,
        );
        if (placement.kind === 'stop' || (placement.kind === 'overrun' && !lineTokens.some((t) => t.kind !== 'space'))) {
          // At its stop; or opening its line with no stop the text after
          // it fits: it takes no room.
          const width = placement.kind === 'stop' ? placement.width : 0;
          lineTokens.push({
            ...token,
            width,
            tabPlaced: placement.kind === 'stop' ? { align: placement.align, at: placement.pos } : { align: 'start', at: x },
            ...(placement.kind === 'stop' && placement.leader ? { tabLeader: placement.leader } : {}),
          });
          lineWidth += width;
          tokenIdx++;
          if (placement.kind === 'stop') tabUsedPos = placement.pos;
          lastTabAt = lineTokens.length - 1;
          lineTabbed = true;
          continue;
        }
        if (placement.kind === 'overrun') {
          // An end, centre or decimal stop the text before it has passed
          // takes that text's last word down with it; a start stop breaks
          // the line before the tab.
          if (placement.align !== 'start') {
            let k = lineTokens.length - 1;
            while (k > lastTabAt + 1 && !(lineTokens[k]!.kind === 'space' && !lineTokens[k]!.tab)) k--;
            if (k > lastTabAt + 1 && lineTokens.slice(lastTabAt + 1, k).some((t) => t.kind !== 'space')) {
              tokenIdx -= lineTokens.length - k;
              while (lineTokens.length > k) lineWidth -= lineTokens.pop()!.width;
            }
          }
          break;
        }
        // Past the last stop with no default stops: a word space, none at
        // the line's start.
        if (!lineTokens.some((t) => t.kind !== 'space')) {
          tokenIdx++;
          continue;
        }
        const { tab: _tab, ...space } = token;
        void _tab;
        token = { ...space, width: tabSpaceWidth, labelTab: 'gap' };
      }

      // The text a tab sent to its stop fits as measured: rounding in the
      // sums is no overflow (#622).
      if (lineWidth + token.width <= lineMaxWidth + (lineTabbed ? 0.01 : 0)) {
        lineTokens.push(token);
        lineWidth += token.width;
        tokenIdx++;
        continue;
      }

      // Doesn't fit. Try to split at a break point (a soft hyphen, a hard
      // hyphen inside the word, a URL joint, a dash, between ideographs).
      if (token.kind === 'text' && token.breakPoints && token.breakPoints.length > 0) {
        const remaining = lineMaxWidth - lineWidth;
        const plainBreak = (bp: RichBreakPoint): boolean => token.bareBreaks === true || bp.bare === true || bp.free === true;
        const markW = (bp: RichBreakPoint): number => (plainBreak(bp) ? 0 : (token.hyphenWidth ?? 0));
        // Hyphenation zone (ragged text): a dictionary syllable is taken only
        // when the word, sent whole to the next line, would leave more than
        // the zone empty at the end of this one, and never on a third line
        // in a row. The word's own joints (a hard hyphen, a URL's, a dash),
        // breaks between ideographs and the author's soft hyphens are always
        // candidates.
        const syllables = hyphenationZonePx === undefined
          || (syllableRun < MAX_RAGGED_HYPHEN_RUN
            && lineMaxWidth - (lineWidth - trailingSpaceWidth(lineTokens)) > hyphenationZonePx);
        let chosen: RichBreakPoint | null = null;
        for (const bp of token.breakPoints) {
          if (!syllables && !plainBreak(bp) && !bp.author) continue;
          if (bp.widthBefore + markW(bp) - (plainBreak(bp) ? 0 : bp.replacesWidth ?? 0) <= remaining) chosen = bp;
          else break;
        }
        if (chosen) {
          const mark = plainBreak(chosen) ? '' : '-';
          const split = splitToken(token, chosen, mark, markW(chosen), ownFont(token));
          lineTokens.push(split.head);
          lineWidth += split.head.width;
          lineHyphenated = chosen.cjk !== true;
          lineSyllable = mark !== '' && !chosen.author;
          lineHardHyphen = chosen.bare === true;
          lineRepeatNext = repeatHyphen && chosen.bare === true && !token.bareBreaks;
          tokens[tokenIdx] = split.tail;
          break;
        }
      }

      // A word wider than the whole line: divide it rather than let it run
      // past the measure (syllable first, then character).
      if (lineTokens.length === 0 && isDivisible(token) && token.width > lineMaxWidth) {
        const font = tokenFont(token, normalFont, boldFont, italicFont, boldItalicFont);
        const split = emergencySplit(token, font, letterSpacingPx, lineMaxWidth);
        if (split) {
          lineWordDivided = split.divided;
          lineTokens.push(split.head);
          lineWidth += split.head.width;
          lineHyphenated = true;
          lineHardHyphen = split.hard === true;
          lineRepeatNext = repeatHyphen && split.hard === true && !token.bareBreaks;
          tokens[tokenIdx] = split.tail;
          break;
        }
      }

      // The token touches the line's last one with no space between (a word
      // set in two runs, a parenthesis before a bold word): the line may not
      // break there, except between two ideographs.
      const glued = token.kind !== 'space' ? gluedTailLength(lineTokens) : 0;
      if (glued > 0) {
        const prev = lineTokens[lineTokens.length - 1]!;
        const font = tokenFont(token, normalFont, boldFont, italicFont, boldItalicFont);
        if (token.stacked !== 'second' && token.footnoteId === undefined && token.refResourceId === undefined && cjkJoinBreaks(prev.text, token.text)) {
          // The line ends between two runs, next to a CJK character: no
          // space is consumed and nothing is added.
          break;
        }
        // The group's latest plain break (between ideographs, a dash, a
        // hard hyphen) ends the line: kinsoku keeps 。 off the next line's
        // start by taking the ideograph before it along.
        const back = lastPlainBreakInGroup(lineTokens, glued);
        if (back && 'join' in back) {
          // After the dash that closes a run: the runs after it go down.
          const keep = back.at + 1;
          tokenIdx -= lineTokens.length - keep;
          while (lineTokens.length > keep) lineWidth -= lineTokens.pop()!.width;
          lineHyphenated = true;
          break;
        }
        if (back) {
          const origIdx = tokenIdx - (lineTokens.length - back.at);
          while (lineTokens.length > back.at) lineWidth -= lineTokens.pop()!.width;
          const split = splitToken(back.token, back.bp, '', 0, ownFont(back.token));
          lineTokens.push(split.head);
          lineWidth += split.head.width;
          tokens[origIdx] = split.tail;
          tokenIdx = origIdx;
          lineHyphenated = back.bp.cjk !== true;
          lineHardHyphen = back.bp.bare === true;
          lineRepeatNext = repeatHyphen && back.bp.bare === true && !back.token.bareBreaks;
          break;
        }
        if (glued < lineTokens.length) {
          // Send the whole group down: the line ends at the space before it.
          for (let k = 0; k < glued; k++) lineWidth -= lineTokens.pop()!.width;
          tokenIdx -= glued;
          break;
        }
        // The group opens the line, so it is wider than the line: divide this
        // word at a syllable where the line ends.
        if (isDivisible(token)) {
          const split = emergencySplit(token, font, letterSpacingPx, lineMaxWidth - lineWidth, true);
          if (split) {
            lineWordDivided = split.divided;
            lineTokens.push(split.head);
            lineWidth += split.head.width;
            lineHyphenated = true;
            lineHardHyphen = split.hard === true;
            lineRepeatNext = repeatHyphen && split.hard === true && !token.bareBreaks;
            tokens[tokenIdx] = split.tail;
            break;
          }
        }
        // Or at the last syllable of the group's own words, so the tail goes
        // down with what touches it: the full stop after **osmosis** never
        // opens a line alone (EF-73). When there is none, the line ends where
        // the runs meet, as before.
        const syllable = lastSyllableInGroup(lineTokens, glued, lineMaxWidth);
        if (syllable) {
          const origIdx = tokenIdx - (lineTokens.length - syllable.at);
          while (lineTokens.length > syllable.at) lineWidth -= lineTokens.pop()!.width;
          const split = splitToken(syllable.token, syllable.bp, '-', syllable.token.hyphenWidth ?? 0, ownFont(syllable.token));
          lineTokens.push(split.head);
          lineWidth += split.head.width;
          tokens[origIdx] = split.tail;
          tokenIdx = origIdx;
          lineHyphenated = true;
          lineSyllable = true;
          break;
        }
      }

      // Two stacked scripts never part (EF-80): the line ends before the
      // pair, or takes it whole when the pair opens it.
      if (token.stacked === 'second' && lineTokens[lineTokens.length - 1]?.stacked === 'first') {
        if (lineTokens.length > 1) {
          lineWidth -= lineTokens.pop()!.width;
          tokenIdx--;
        } else {
          lineTokens.push(token);
          lineWidth += token.width;
          tokenIdx++;
        }
        break;
      }

      // No viable split. If line is empty, force-fit this token; else break to next line.
      if (lineTokens.length === 0) {
        // A word of a joining script wider than the line is never cut: it
        // runs past the measure, and the line says so.
        if (token.width > lineMaxWidth && token.kind === 'text' && joiningScriptIn(token.text)) lineWordOverflow = true;
        lineTokens.push(token);
        lineWidth += token.width;
        tokenIdx++;
      }
      break;
    }

    if (lineTokens.length === 0) break;
    syllableRun = lineSyllable ? syllableRun + 1 : 0;
    repeatPending = lineRepeatNext;

    // Trim trailing spaces from line tokens (a tab stays: a rule to the
    // line's end is a form's blank)
    while (lineTokens.length > 0 && isBreakSpace(lineTokens[lineTokens.length - 1]!)) {
      lineWidth -= lineTokens[lineTokens.length - 1]!.width;
      lineTokens.pop();
    }

    // Check if this is the last line
    // Skip remaining leading spaces to check if there's more content
    let peekIdx = tokenIdx;
    while (peekIdx < tokens.length && isBreakSpace(tokens[peekIdx]!)) {
      peekIdx++;
    }
    const isLastLine = peekIdx >= tokens.length;

    // Build segments for justified rendering
    let segments: VDTLineSegment[] = trimChipLineEdges(lineTokens.map(tokenSegment));
    if (lineTabbed) segments = setTabbedLine(segments, lineTokens, lineMaxWidth, textAlign, isLastLine);

    const lineText = lineTokens.map((t) => cleanSoftHyphens(t.text)).join('');
    const contentWidth = segments.reduce((sum, t) => sum + t.width, 0);

    // A tabbed line is set as measured: its widths are final.
    const spaceRatios = lineTabbed || textAlign !== 'justify' || isLastLine ? {} : justifiedSpaceRatios(segments, lineMaxWidth, normalSpaceWidth);

    lines.push({
      text: lineText,
      bbox: createBoundingBox(lineIndent, y, contentWidth, lineHeightPx),
      baseline: y + baselineOffset,
      hyphenated: lineHyphenated,
      ...(lineHyphenated && lineHardHyphen ? { hardHyphen: true } : {}),
      ...(lineRepeated && lineText.startsWith('-') ? { repeatedHyphen: true } : {}),
      segments,
      isLastLine,
      ...spaceRatios,
      ...(lineWordOverflow ? { wordOverflow: true as const } : {}),
      ...(lineWordDivided ? { wordDivided: lineWordDivided } : {}),
      ...(lineTabbed ? { tabbed: true as const, ...(textAlign === 'justify' ? { ragged: true } : {}) } : {}),
    });

    y += lineHeightPx;
    lineIndex++;
  }

  if (hasSmallCaps) expandSmallCaps(lines, normalFont, boldFont, italicFont, boldItalicFont, letterSpacingPx);
  if (bidi) withDirections(lines, bidi, normalFont, boldFont, italicFont, boldItalicFont);
  if (languages.length > 0) applySegmentLanguages(lines, plainText, languages);
  withKashida(lines);
  markInsetLines(lines, maxWidthPx, options);
  return { lines, totalHeight: y };
}
