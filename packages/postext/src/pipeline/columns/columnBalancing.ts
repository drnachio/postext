/**
 * Vertical column balancing — editorial bottom alignment.
 *
 * Publishers expect every column of a page to start at the top of the page
 * and end flush with the bottom. The placement pass naturally leaves short
 * columns: orphan/widow rules, keep-with-next headings, and unsplittable
 * groups all push content to the next column before the current one is full,
 * leaving one or more empty grid lines at its bottom.
 *
 * The fix mirrors what a human compositor does: add whole baseline-grid
 * lines to the top margin of the headings inside the short column, pushing
 * the content below them down until the column ends on the last grid slot.
 * Because the column break is element-bound (the element that opens the next
 * column did not fit in the gap, so it still won't fit in a smaller one),
 * shifting a column's tail down by at most its gap never moves content into
 * the next column or page — the adjustment is local and exact.
 *
 * When a column needs several lines and holds several headings, the extra
 * lines are distributed round-robin in importance order (lowest heading
 * level first), so the most important heading always receives the largest
 * share — e.g. 3 lines over an h2 and an h3 become +2 above the h2 and +1
 * above the h3. A heading takes at most `maxLinesBeforeLoose` lines (two)
 * that way before the levers below are tried, and its further lines, up to
 * `maxLinesPerHeading`, only when they have nothing left to give (#707).
 *
 * When the column's headings cannot absorb the whole gap, further levers
 * apply in editorial priority order:
 *  - a picture with a safe area (`Resource.safeArea`, #442) set inline in
 *    the column, or floated at its head or foot over that column alone,
 *    grows by whole grid lines, cropped within its safe area: a taller
 *    picture leaves no hole anywhere, so it is tried right after the
 *    closing box and before any space is added;
 *  - first of all, a callout box closing the column takes the room under
 *    its foot as space above it, so the foot lands on the last grid slot of
 *    the page, level with the last line of the column beside it (with
 *    `headings.balancing.closingBox: 'last'` it runs after the spacing
 *    levers and takes only what they leave; with `'off'` never);
 *  - extra grid lines where a list/enumeration ends (space after a list
 *    reads naturally), capped per list end;
 *  - one grid line under a display formula or a callout box (it reads as
 *    the element's own margin), unless `stretchAfterDisplays` is off;
 *  - extra grid lines between a top float band (a figure or table at the
 *    head of the column) and the text under it, capped per band — a
 *    little more air under a figure is invisible. Under a figure across
 *    several columns that holds only while their heads stay level: the
 *    columns under it move together, or one moves alone to end flush
 *    (`stretchAfterWideFloats`, #708);
 *  - as a last resort, up to `maxLooseParagraphs` paragraphs of the column
 *    are each re-broken one line looser (TeX \looseness=+1) via the
 *    Knuth-Plass `looseness` option — always within the configured
 *    `maxWordSpacing`, so type colour never exceeds the user's limit. When
 *    word spacing alone cannot gain the line, the placement pass also tries
 *    a little positive tracking on that paragraph (the compositor's classic
 *    fix), keeping the smallest value that works, never above `maxTracking`.
 *
 * On a character grid (`cjk.grid`, #632) every character stands in a cell
 * one em wide and every line on the grid's line pitch, which is the
 * baseline grid: the levers that move text by whole grid lines keep it on
 * the grid, and `headings.balancing.gridLines: 'off'` keeps them out (a
 * standard that counts lines has no empty row to give). The closing box
 * and the pictures with a safe area are off the grid by design and work as
 * anywhere. A loose paragraph is the exception: a CJK paragraph gains its
 * line by breaking each line short and spreading the characters over the
 * measure, which moves them off their cells; there it is accepted only
 * when no gap between characters spreads past `maxTracking`, and no
 * tracking is added to its letters (`measureLooseParagraph`). Balancing is
 * off by default on a grid (`balancingOnByDefault`).
 */



export { MAX_BALANCING_PASSES, MAX_BALANCING_PASSES_PER_DOCUMENT, pageSegments, gapLinesIn, boxRoomIn, boxLeverKeys, candidateKey, flexFigureKey, flexFloatKey, balanceKey, firstDivergentColumn } from './columnBalancing/segments.js';
export type { PageRange, BalanceCandidateKind, ColumnPosition } from './columnBalancing/segments.js';
export { collectColumnGaps, totalGapLines } from './columnBalancing/columnGaps.js';
export type { ColumnGap } from './columnBalancing/columnGaps.js';
export { GRID_LINE_LEVERS, proposeBalanceLines } from './columnBalancing/proposal.js';
export type { BalanceState, BalanceProposalOptions, LooseBudget, BalanceProposal } from './columnBalancing/proposal.js';
