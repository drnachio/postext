// Before a text block's lines are placed: list items, grid snapping, the
// split rules and the widths the lines are broken for.
// Part of the placement pass (pass.ts), split out of its loop in #1276.
import type { BlockIteration } from './blockIteration.js';
import type { ResolvedConfig, VDTLine, VDTBlock, VDTPage } from '../../../../vdt.js';
import type { HeadingLevelResolver } from '../../../sections/headingStyles.js';
import type { ContentBlock } from '../../../../parse/index.js';
import { lineInsetsAt } from '../../../../measure/types.js';
import { resolvedDirection, arabicNumbersOf } from '../../../config.js';
import { mirrorListMarker, directListMarker, listBulletPosition, listItemGapPx, listItemSpacingPx } from '../../../text/lists.js';
import { measuringVertically } from '../../../../measure/vertical.js';
import { nextNonMarkerBlock } from '../../../blocks/buildHelpers.js';
import { verseSnaps } from '../../passHelpers.js';
import { versesLineByLine } from '../../../text/verseLines.js';
import { raggedLooseLines } from '../../../text/raggedLines.js';
import { flowColumnsAfter } from '../../../blocks/placement.js';
import { runsBesideWrap } from '../../../floats/textWrap.js';
import { type MeasureContentBlockOptions, measureContentBlock } from '../../../blocks/measureContentBlock.js';

/** What createBlockLines takes from around the loop. */
export interface BlockLinesDeps {
  resolved: ResolvedConfig;
  headingLevels: HeadingLevelResolver;
  freshPageFlowColumns: () => number;
  contentBlocks: ContentBlock[];
  gateCitedFloats: (blockIdx: number, lines: readonly VDTLine[]) => void;
  measuredAcrossPage: (raw: ContentBlock) => boolean;
}

export function createBlockLines(deps: BlockLinesDeps) {
  const {
    resolved, headingLevels, freshPageFlowColumns, contentBlocks, gateCitedFloats,
    measuredAcrossPage
  } = deps;
  /** Sets up what placing the block's lines needs. */
  const prepareLines = (blockTurn: BlockIteration): void => {
    const {
      rawBlock, paragraphContainer, isContainerTail, blockMeasureCtx, styleOverride, tryLoose,
      measureWidth, contentBlock, measured, vdtType, listBullet, listDepth, listKind,
      bulletXOffsetInColumn, strikethroughText, style
    } = blockTurn;
    const finalizeListItem = (blk: VDTBlock, isFirstPart: boolean) => {
      // The drop cap (#623) stands on the baseline of the line it sinks to,
      // beside the first fragment only.
      const capLine = blk.lines[0];
      if (isFirstPart && blockTurn.capInfo && capLine) {
        const cap = blockTurn.capInfo;
        blk.dropCap = {
          text: cap.text,
          fontString: cap.fontString,
          color: cap.color,
          x: blk.bbox.x + cap.x,
          baselineY: capLine.baseline + (cap.sink - 1) * style.lineHeightPx,
          width: cap.width,
          fontSizePx: cap.fontSizePx,
          lines: cap.lines,
          sink: cap.sink,
          ...(cap.sourceStart !== undefined ? { sourceStart: cap.sourceStart, sourceEnd: cap.sourceEnd } : {}),
          plainStart: cap.plainStart,
          plainEnd: cap.plainEnd,
          word: cap.word,
          wordRest: cap.wordRest,
          ...(cap.hang ? { hang: { text: cap.hang.text, fontString: cap.hang.fontString, x: blk.bbox.x + cap.hang.x, baselineY: capLine.baseline, width: cap.hang.width } } : {}),
        };
        // The block's source range starts at the initial.
        if (cap.sourceStart !== undefined && (blk.sourceStart === undefined || cap.sourceStart < blk.sourceStart)) blk.sourceStart = cap.sourceStart;
      }
      if (!listBullet) return;
      blk.listDepth = listDepth;
      blk.listKind = listKind;
      // Bullet (and its positional metadata) only belongs on the first part of
      // a split list item; continuation parts render without a bullet.
      if (!isFirstPart) return;
      // A task item's drawn box (#765) stands for its character and face.
      if (listBullet.box) blk.bulletBox = listBullet.box;
      else {
        blk.bulletText = listBullet.bulletText;
        blk.bulletFontString = listBullet.bulletFontString;
      }
      blk.bulletColor = listBullet.bulletColor;
      // `bulletXOffsetInColumn` is `indentPx` for unordered/task, and
      // `indentPx + (maxNumberWidth - thisNumberWidth)` for ordered — giving
      // the right-aligned separator.
      // Beside a wrapped picture on the left (#627) the marker stands past
      // it, with its text.
      blk.bulletOffsetX = blk.bbox.x + bulletXOffsetInColumn + lineInsetsAt(blockTurn.wrapInsets, 0).start;
      if (listBullet.separatorText !== undefined) {
        blk.separatorText = listBullet.separatorText;
        blk.separatorFontString = listBullet.separatorFontString;
        blk.separatorColor = listBullet.separatorColor;
        blk.separatorX = blk.bulletOffsetX + (listBullet.separatorOffsetPx ?? 0);
        if (listBullet.prefixText !== undefined) {
          blk.prefixText = listBullet.prefixText;
          blk.prefixX = blk.bulletOffsetX + (listBullet.prefixOffsetPx ?? 0);
        }
      }
      // A list set against the document's direction: its marker on the
      // other side, with its text (#371).
      if (rawBlock.direction !== undefined && rawBlock.direction !== resolvedDirection(resolved)) mirrorListMarker(blk);
      // And reads in its item's direction (#664).
      directListMarker(blk, rawBlock.direction ?? resolvedDirection(resolved), arabicNumbersOf(resolved), measuringVertically());
      if (strikethroughText) blk.strikethroughText = true;
      // Bullet Y = x-height midpoint of the item's first text line.
      // Pairs with `textBaseline='middle'` at render so the bullet stays
      // visually centered on the text regardless of its own font size. A
      // contents number sits on the line's baseline instead.
      const firstLine = blk.lines[0];
      if (firstLine) {
        const at = listBulletPosition(listBullet, firstLine.baseline);
        blk.bulletY = at.bulletY;
        if (at.bulletBaselineY !== undefined) blk.bulletBaselineY = at.bulletBaselineY;
      }
    };

    // Neighbour lookaheads see through container markers.
    const nextBlock = nextNonMarkerBlock(contentBlocks, blockTurn.blockIdx) ?? null;
    const nextIsListItem = nextBlock?.type === 'listItem';
    /** The space before the next item of the list (EF-165): the item
     *  spacing of the shallower list, so the item after a nested list
     *  takes its own list's spacing, not the nested one's. */
    const itemGapPx = (bullet: NonNullable<typeof listBullet>): number => (nextBlock?.type === 'listItem'
      ? listItemGapPx(
          { spacingPx: bullet.itemSpacingPx, depth: listDepth ?? 1 },
          { spacingPx: listItemSpacingPx(nextBlock, blockMeasureCtx.resolved), depth: nextBlock.depth ?? 1 },
        )
      : bullet.itemSpacingPx);

    // For headings, only snap to baseline grid if the next block is NOT a heading.
    // Consecutive headings flow without grid snapping; the last heading in the
    // group snaps so that the following body text realigns with the grid.
    // Same rule for list items: the LAST item of a list snaps so that text
    // after the list realigns with the baseline grid, even when non-grid
    // spacings (itemSpacing, marginTop/Bottom) were chosen. And for the last
    // paragraph of a `:::paragraphs` container, whose leading and spacing
    // are off-grid by design.
    const nextIsHeading = nextBlock?.type === 'heading';
    // The contents (`:::toc`) keep their own rhythm: an entry set as a list
    // item is not a list tail to realign the text after it. A heading snaps
    // per its level (or style), which inherits `headings.snapToGrid`.
    const shouldSnapToGrid = rawBlock.toc === undefined && rawBlock.index === undefined && (
      (vdtType === 'heading' && !nextIsHeading
        && (headingLevels.forBlock(rawBlock)?.snapToGrid ?? resolved.headings.snapToGrid)) ||
      (vdtType === 'listItem' && !nextIsListItem) ||
      (vdtType === 'paragraph' && isContainerTail && paragraphContainer?.snapToGrid !== false) ||
      // A poem, like a container of one block: its own leading and the
      // margins of its style are off the grid, the text after it is not.
      // A stanza between two of a poem in the line layout snaps too, so the
      // space between stanzas is whole grid lines (#620); one of a poem set
      // as single hemistichs (a configuration stored before #620) does not,
      // as the one block postext 1.22 set it in did not.
      (vdtType === 'paragraph' && rawBlock.verse !== undefined && verseSnaps(rawBlock.verse.attrs.style, resolved)
        && (rawBlock.verse.stanza === undefined || rawBlock.verse.stanza.last || versesLineByLine(rawBlock, resolved))) ||
      vdtType === 'mathDisplay' ||
      // A score's last system: the text after it goes back on the grid.
      (vdtType === 'score' && (rawBlock.score?.index ?? 0) === (rawBlock.score?.count ?? 1) - 1)
    );

    // Place block, splitting across columns/pages if needed.
    // List items may split too — orphan/widow protection per-list is gated by
    // `avoidOrphansInLists` / `avoidWidowsInLists`; bullet stays on first part.
    const canSplit = vdtType === 'paragraph' || vdtType === 'blockquote' || vdtType === 'listItem';
    // A justified line the breaker could not fill (a link breaking at its
    // joints, a last word that cannot come up) is set ragged, not stretched.
    blockTurn.remainingLines = [...raggedLooseLines(measured.lines, style.textAlign)];
    blockTurn.partIndex = 0;
    // The floats this block cites wait for the line that cites them.
    gateCitedFloats(blockTurn.blockIdx, blockTurn.remainingLines);
    /** Times this block left an EMPTY short column (see `shortColumn`) —
     *  bounded so a page whose columns are all short (footnotes, design
     *  bands) cannot make it wander forever. */
    blockTurn.shortColumnMoves = 0;
    /** Whether the paragraph was already re-broken to keep a hyphen off
     *  the last line of a column (`bodyText.hyphenateAcrossColumns`). */
    blockTurn.columnEndHyphenRetried = false;
    /** The lines (1-based, counted from the first line still to place) the
     *  guard keeps a hyphen off: the line the split falls after and one
     *  every full column after it, or, under `'withinPage'` (#701), those
     *  of them that close a page — the j-th column end from here does when
     *  the `rest` columns left on this page that still take a line of this
     *  text are used up and a whole number of fresh pages, of `perPage`
     *  flow columns each, has gone by. */
    const guardedColumnEnds = (mode: false | 'withinPage', splitAt: number, lineCount: number, fullColumn: number, page: VDTPage, columnIndex: number): number[] => {
      const ends: number[] = [];
      const rest = mode === false ? 0 : flowColumnsAfter(page, columnIndex, style.lineHeightPx);
      const perPage = mode === false ? 1 : freshPageFlowColumns();
      for (let n = splitAt, j = 0; n < lineCount; n += fullColumn, j++) {
        if (j >= rest && (j - rest) % perPage === 0) ends.push(n);
      }
      return ends;
    };
    /** `hyphenateAcrossColumns: false`: the paragraph's lines as set now
     *  (a re-break replaces them) and where the breaker broke them, the
     *  lines (1-based) its last re-break kept a hyphen off, and the part
     *  last re-broken from. */
    blockTurn.paragraphLines = blockTurn.remainingLines;
    blockTurn.paragraphBreaks = measured.breaks;
    blockTurn.guardedEnds = [];
    blockTurn.columnEndHyphenPart = -1;
    /** The column width the block was broken for, and the columns of other
     *  widths its later lines were broken for since (EF-157). A text block
     *  that goes on into a column of another width — a one-and-a-half
     *  layout with text in both columns, a styled section with its own
     *  margins — is broken again there: its placed lines stay, the rest is
     *  broken for the new column. Not the loose paragraphs balancing runs
     *  long (placed whole where they were measured), nor a page-span
     *  heading, painted across the page. */
    blockTurn.brokenForWidth = measureWidth;
    blockTurn.laterWidths = [];
    /** Text wrap (#627): the lines of the block set short beside what text
     *  wraps round, as its lines are now set (paragraph line numbers). */
    blockTurn.wrapInsets = [];
    const wrapsBeside = canSplit && runsBesideWrap(rawBlock);
    const rebreaksForColumn = !tryLoose && rawBlock.toc === undefined && rawBlock.index === undefined
      && (canSplit || (vdtType === 'heading' && !measuredAcrossPage(rawBlock)));
    /** Measure the block again for the columns it is set in (see
     *  `laterWidths`), with `extra` options. */
    const measureForColumns = (extra: MeasureContentBlockOptions) =>
      measureContentBlock(rawBlock, blockTurn.blockIdx, blockTurn.brokenForWidth, blockMeasureCtx, {
        styleOverride,
        ...(blockTurn.laterWidths.length > 0 ? { restColumnWidths: blockTurn.laterWidths } : {}),
        ...(blockTurn.wrapInsets.length > 0 ? { lineInsets: blockTurn.wrapInsets } : {}),
        ...extra,
      });

    // "Keep with next" for colon-introduced lists: a paragraph ending in `:`
    // (or the full-width `：` of Chinese text and its presentation forms `︰`
    // `﹕`, #211) followed directly by a list acts as a lead-in title — the colon-bearing
    // line must share a column with the first list item. Only checked for the
    // original, unsplit paragraph (partIndex === 0) on the iteration that is
    // about to place it.
    const endsWithColon = vdtType === 'paragraph'
      && resolved.bodyText.keepColonWithList
      && nextIsListItem
      && /[:：︰﹕]\s*$/.test(contentBlock.text);
    // A poem (#378) after this paragraph, which introduces it («فأنشد
    // يقول:»): see the lead-in rule below.
    const nextIsVerse = vdtType === 'paragraph' && contentBlock.verse === undefined
      && nextBlock?.type === 'paragraph' && nextBlock.verse !== undefined;
    blockTurn.finalizeListItem = finalizeListItem;
    blockTurn.nextBlock = nextBlock;
    blockTurn.nextIsListItem = nextIsListItem;
    blockTurn.itemGapPx = itemGapPx;
    blockTurn.nextIsHeading = nextIsHeading;
    blockTurn.shouldSnapToGrid = shouldSnapToGrid;
    blockTurn.canSplit = canSplit;
    blockTurn.guardedColumnEnds = guardedColumnEnds;
    blockTurn.wrapsBeside = wrapsBeside;
    blockTurn.rebreaksForColumn = rebreaksForColumn;
    blockTurn.measureForColumns = measureForColumns;
    blockTurn.endsWithColon = endsWithColon;
    blockTurn.nextIsVerse = nextIsVerse;
  };
  return { prepareLines };
}
