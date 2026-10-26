export interface ColumnBalancingConfig {
  /** Default `true`, except in vertical text (`layout.writingMode:
   *  'vertical-rl'`) and on a character grid (`cjk.grid.enabled`, #632),
   *  where columns are filled line by line and a column that ends short is
   *  left short unless the configuration sets `true` itself. */
  enabled?: boolean;
  /** Maximum extra grid lines that may be added above a single heading. */
  maxLinesPerHeading?: number;
  /** Grid lines a heading may take before the levers after it are tried
   *  (#707): each heading of a short column takes up to this many, then the
   *  list ends, the displays, the float bands and the loose paragraphs take
   *  what they can, and a heading gets its further lines, up to
   *  `maxLinesPerHeading`, only when those have nothing left to give. A
   *  value at or above `maxLinesPerHeading` gives the headings all their
   *  lines first, as up to postext 1.27; `0` tries the other levers before
   *  any line goes above a heading. Default 2; configurations stored
   *  earlier keep the old order (see `migrateConfig` in `postext/bundle`). */
  maxLinesBeforeLoose?: number;
  /** Allow extra grid lines where a list/enumeration ends, when the column's
   *  headings cannot absorb the whole gap. Default true. */
  stretchAfterLists?: boolean;
  /** Maximum extra grid lines after a single list end. Default 1. */
  maxLinesAfterList?: number;
  /** Allow one extra grid line under a display formula, and under a callout
   *  box, in the short column (the block after it moves down a line), after
   *  the headings and the list ends have been tried. `false` leaves the
   *  space under formulas and boxes as their own margins set it: the gap
   *  goes on to the levers after this one and the column ends short if they
   *  do not close it (#710). Default true. */
  stretchAfterDisplays?: boolean;
  /** Allow extra grid lines between a top float (figure / table band) and
   *  the text under it in the same column, after headings and list ends
   *  have been tried. Never on a page that does not flow on (a chapter's
   *  closing page) nor in a closing band cut level by `trailing`: there the
   *  column heads stay level and the last column may end a line short (a
   *  heading or a callout box opening a column under the float stays at its
   *  head too, whatever this says). The first block under the float may be
   *  the rest of a paragraph begun on the page before: it moves down all
   *  the same, by the line the break rules left free at the column's foot
   *  (a line the widow rule kept empty, or a paragraph space with no room
   *  for text after it); `false` keeps it right under the float. Default
   *  true. */
  stretchAfterFloats?: boolean;
  /** Maximum extra grid lines under a single float band. Default 1. */
  maxLinesAfterFloat?: number;
  /** Under a float that stands over two or more text columns (#708):
   *  `'flush'` (default) moves a column down under it only when every text
   *  column under the float takes the same lines, so their heads stay
   *  level, or when the lines end that column flush; a line that would
   *  lower one head and still leave its column short is not added.
   *  `'always'` treats such a float as any other, as up to postext 1.27.
   *  Any other value reads as `'flush'`. `stretchAfterFloats: false` turns
   *  the lever off under every float. Configurations stored earlier keep
   *  `'always'` (see `migrateConfig` in `postext/bundle`). */
  stretchAfterWideFloats?: StretchAfterWideFloats;
  /** Last resort: re-break one paragraph per short column one line looser
   *  (TeX \looseness=+1), within the configured `bodyText.maxWordSpacing`.
   *  Requires `bodyText.optimalLineBreaking`. Default true. */
  looseParagraphs?: boolean;
  /** How many paragraphs of one short column may be run a line long (one
   *  extra line each, longest paragraphs first). Default 2. */
  maxLooseParagraphs?: number;
  /** Let a loose paragraph also take a little positive tracking (letter
   *  spacing) when word spacing alone cannot gain the line — the compositor's
   *  classic fix. Only the smallest tracking that gains the line is used, and
   *  never more than `maxTracking`. Default true. */
  trackParagraphs?: boolean;
  /** Maximum tracking for a loose paragraph, in thousandths of an em (the
   *  InDesign unit: 10 = 0.01 em per character). Default 10. */
  maxTracking?: number;
  /** Fill a column the break rules left short with its own paragraphs
   *  (#1236). A column that flows on often ends a line short of its foot
   *  because the paragraph at the break would leave fewer than
   *  `bodyText.widowMinLines` lines at its foot or `orphanMinLines` at the
   *  head of the next column. The loose lever (`looseParagraphs`) closes
   *  such a gap in justified text only, and only within an absolute
   *  `bodyText.maxWordSpacing` that a narrow column of long words often
   *  passes in every setting of the paragraph. With this on, the column's
   *  paragraphs are tried as a compositor tries them:
   *  - ragged paragraphs (`textAlign: 'left'` or `'right'`, set with
   *    `bodyText.optimalRagged`) may run a line long too, within
   *    `maxLooseParagraphs` and `maxTracking` as justified ones;
   *  - a justified paragraph run long may not set a line looser than
   *    `maxWordSpacing` or than its own loosest line, whichever is looser,
   *    nor more lines past three times the space (set ragged) than it
   *    had: never worse than the paragraph as the breaker set it;
   *  - when no paragraph of the column gains its line, one is set a line
   *    shorter (TeX \looseness=-1, within `bodyText.minWordSpacing`, and
   *    with the same gate on its loosest line), so the split after it
   *    takes a line more and still keeps the widow and orphan minimums.
   *    That moves text across the column break, so it is kept only when
   *    the pages it re-flows end with fewer short columns than before.
   *  A paragraph whose new setting ends on a runt is refused, and when no
   *  candidate works the column stays as it was. Needs `looseParagraphs`
   *  and `bodyText.optimalLineBreaking`. Default false: the layout of
   *  every stored document stays as it is. */
  fillShortColumns?: boolean;
  /** Balance the closing band of a chapter / the document: when the flow
   *  ends before the page is full and its columns are uneven, they are cut
   *  level (via a band cap) so the last columns end at the same height, the
   *  way a compositor sets a short closing page. The cut keeps the rules an
   *  uncut band keeps: when a block that cannot split across it (a paragraph
   *  tail the orphan and widow minimums keep whole, a keep-together box)
   *  would run past it and lose its last lines, or — with
   *  {@link HeadingsConfig.keepWithNext} — a heading would close a column
   *  while its text opens the next, the cut is taken a line lower, up to
   *  three times, and otherwise dropped. Columns whose feet differ by one
   *  grid line or less are left as they are: a last column a line short is
   *  the usual finish of a closing band. Default true. */
  trailing?: boolean;
  /** The unit of the level cut of a closing band (`trailing`, and the cut
   *  `beforeSpan` takes behind a box that moves on), #711:
   *  - `'lines'` (default): a band whose text is set on a leading of its
   *    own (an index, a list of references, a container of small type) is
   *    cut, and retried, by whole lines of that leading: the height most
   *    lines of the band share. A band of body text has the baseline
   *    grid for its leading and is cut as before, and so is a band whose
   *    lines share a height without standing whole lines apart (entries
   *    with a gap between them, groups on a hand-set margin).
   *  - `'grid'`: every cut is a whole number of baseline-grid lines, as up
   *    to postext 1.27, which let a line more into one column of an
   *    off-grid band and lowered a failed cut by more than one of its
   *    lines.
   *  Any other value reads as `'lines'`. Configurations stored earlier
   *  keep `'grid'` (see `migrateConfig` in `postext/bundle`). */
  trailingStep?: TrailingStep;
  /** Balance the band a page-span block leaves behind: when a `span: 'page'`
   *  callout does not fit under the current columns and has to move to the
   *  next page (or split, see `CalloutStyleConfig.keepTogether`), the
   *  columns it interrupts are cut level instead of leaving the last one
   *  short — the flow ends at the same height in every column and the box
   *  (or the part of it that fits) sits under them. Default true. */
  beforeSpan?: boolean;
  /** When a callout box that closes a short column takes the room under
   *  its foot as space above it (the `trailingCallout` lever), so that its
   *  foot lands on the column's last grid slot:
   *  - `'first'` (default, the 1.4 order): before any other lever, so the
   *    box takes the whole gap, even several lines, and the headings above
   *    it get nothing;
   *  - `'last'`: after the heading, list-end, after-display and after-float
   *    levers, which take whole lines first; the box then takes only what
   *    they leave, usually a fraction of a line, and stays closer to the
   *    text it annotates;
   *  - `'off'`: never; the room under the box stays unless the other levers
   *    take it (in whole lines).
   *  On a closing page the box is the only lever that moves it level with
   *  the last line of the column beside it; `'off'` leaves it where it is
   *  there too. Any other value reads as `'first'`. */
  closingBox?: ClosingBoxLever;
  /** On a character grid (`cjk.grid.enabled`, #632): whether the levers
   *  that add whole grid lines — above a heading, where a list ends, under
   *  a display or a box, under a float band — may run. They keep every
   *  character in its cell (the baseline grid is the grid's line pitch),
   *  but a standard that counts the lines of a page (GB/T 9704: 22 lines
   *  of 28 characters) has no empty rows to give: `'off'` keeps them out
   *  and leaves the other levers. Off the grid it has no effect. Default
   *  `'allow'`; any other value reads as `'allow'`. */
  gridLines?: GridLinesLever;
}

/** Where the column-balancing lever of a box closing a column runs
 *  (`ColumnBalancingConfig.closingBox`). */
export type ClosingBoxLever = 'first' | 'last' | 'off';

/** How the after-float lever of column balancing treats a float that stands
 *  over several text columns (`headings.balancing.stretchAfterWideFloats`,
 *  #708). */
export type StretchAfterWideFloats = 'flush' | 'always';

/** The unit of the level cut of a closing band
 *  (`headings.balancing.trailingStep`, #711). */
export type TrailingStep = 'lines' | 'grid';

/** Whether the whole-line balancing levers run on a character grid
 *  (`ColumnBalancingConfig.gridLines`). */
export type GridLinesLever = 'allow' | 'off';

/** How a paragraph kept with the heading above it splits at a column's foot
 *  (`HeadingsConfig.keepWithNextSplit`). */
export type KeepWithNextSplit = 'rules' | 'fill';

/** What a snapping heading keeps of its space above at a column's head
 *  (`HeadingsConfig.columnHeadSpace`, #706). */
export type ColumnHeadSpace = 'remainder' | 'none';
