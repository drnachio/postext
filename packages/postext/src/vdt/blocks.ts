// Blocks and the columns that hold them: drop caps, strip captions,
// callouts, balancing, exclusions and the footnote area
// (#1276: split out of vdt.ts).
import type { PostextResource, CalloutSpan, CalloutPlacement } from '../types.js';
import type { MathRender } from '../math/types.js';
import type { VDTDesignSlot } from './design.js';
import type { BoundingBox } from './document.js';
import type { VDTLine } from './lines.js';
import type { VDTComicPage } from './pages.js';
import type { ResolvedResourceBlock } from './resources.js';
import type { VDTCaptionBar } from './resourceTables.js';

// ---------------------------------------------------------------------------
// VDT node types
// ---------------------------------------------------------------------------

export type VDTBlockType =
  | 'paragraph'
  | 'heading'
  | 'resource'
  | 'blockquote'
  | 'listItem'
  | 'footnoteRef'
  | 'mathDisplay'
  | 'callout'
  /** A line of a code listing (#624): one line per source line, set as
   *  written (see `VDTLine.codeLine`), inside the listing's box. */
  | 'code'
  /** One engraved system of a music score (#1172): a single line whose
   *  segment carries the system (`VDTLineSegment.scoreSystem`). */
  | 'score';

/** A score block's place in its score (#1172). */
export interface VDTScoreInfo {
  /** 0-based system number, of `count`. */
  index: number;
  count: number;
  /** Alt text: the fence's `alt`, else the title and composer read from the
   *  notation. Set on the first system. */
  alt?: string;
}

export type TextAlign = 'left' | 'justify' | 'center' | 'right';

/**
 * A paragraph's drop cap (#623, {@link VDTBlock.dropCap}), in page
 * coordinates of the flow frame, as a list marker's are. The block's
 * lines do not hold it: its first line starts after it. Its plain text and
 * source range are the paragraph's own, so the block's `sourceMap` and the
 * first line's `plainStart` (which counts past it) read the word whole.
 */
export interface VDTDropCap {
  /** The initial as printed: its letters, with an opening mark set with
   *  the cap (`punctuation: 'with-cap'`). */
  text: string;
  fontString: string;
  /** Hex. */
  color: string;
  /** Left edge of the initial's advance. */
  x: number;
  /** The baseline it stands on: that of the paragraph's line `sink`. */
  baselineY: number;
  /** Its advance width. */
  width: number;
  /** Its size (px) and how many lines it spans and sinks. */
  fontSizePx: number;
  lines: number;
  sink: number;
  /** Source range of the characters it prints (an opening mark hung or set
   *  with it included). */
  sourceStart?: number;
  sourceEnd?: number;
  /** The paragraph's plain-text range it stands for, from 0 (the first
   *  line's `plainStart` counts past it). */
  plainStart: number;
  plainEnd: number;
  /** The whole first word as the paragraph reads it, the initial
   *  included ("Se" of "Se puso"): a tagged PDF gives it as the
   *  `/ActualText` of the initial and the rest of the word. */
  word: string;
  /** How many characters of the first line's text finish that word (the
   *  "e" of "Se"); 0 when the initial is a word of its own. */
  wordRest: number;
  /** An opening mark hung before the initial at text size
   *  (`punctuation: 'hang'`), on the first line's baseline. */
  hang?: { text: string; fontString: string; x: number; baselineY: number; width: number };
}

/** See {@link VDTBlock.stripCaption}. */
export interface VDTStripCaption {
  /** Index of the first caption line in the block's `lines`, and how many
   *  there are (an inline strip's placeholder line is the other one). */
  firstLine: number;
  lineCount: number;
  /** Under the strip or over it (`captionStyle.position`). */
  position: 'above' | 'below';
  /** The resource type the strip is counted in (`type=…`) and its number,
   *  when it is numbered; then also its `id`, when it has one: a `:ref`
   *  naming it links here (renderers set the target, as for a figure). */
  typeId?: string;
  number?: string;
  id?: string;
  /** The bar behind the caption (`captionStyle.backgroundEnabled`): its
   *  rect RELATIVE TO THE BLOCK'S BOX (flow coordinates), and its fill. */
  bar?: VDTCaptionBar;
}

export interface VDTBlock {
  id: string;
  type: VDTBlockType;
  bbox: BoundingBox;
  lines: VDTLine[];
  resource?: PostextResource;
  /** Resolved resource embed (issue #49). Present only for `type ===
   *  'resource'` blocks; carries the measured image/table + caption layout. */
  resourceBlock?: ResolvedResourceBlock;
  pageIndex: number;
  columnIndex: number;
  dirty: boolean;
  snappedToGrid: boolean;
  headingLevel?: number;
  /** Heading attributes parsed from a trailing `{key="value" …}` on the
   *  heading line (first part of a heading only). Exposed to design slots
   *  as `{attr.key}` placeholders. */
  attrs?: Record<string, string>;
  /** Source range of each quoted heading attribute value. */
  attrSources?: Record<string, { start: number; end: number }>;
  /** Forced title breaks (plain-text indices, prefix excluded) and the parsed
   *  title length, so opener designs can re-insert the line breaks that the
   *  in-column rendering shows as spaces. */
  titleBreaks?: number[];
  titleLength?: number;
  /** The heading's title as written in the source — before its level's
   *  (or style's) `textTransform`, numbering prefix excluded, forced title
   *  breaks as plain text reads them (a space between Latin words, the
   *  ideographic space between two Chinese characters, nothing where a
   *  Chinese character meets Latin text or a digit; `plainTitleBreak`).
   *  Present only when the lines print it otherwise (an
   *  `uppercase` heading) and the title cites no resource (a `:ref` label
   *  is resolved in the lines only), so PDF bookmarks can name the heading
   *  as it was written (EF-81). The `{titleText}` design placeholder is
   *  the title as printed, transform applied. */
  sourceTitle?: string;
  /** Index of the originating content block in the parsed markdown block
   *  list. Stable across layout passes — used by column balancing to key
   *  extra-spacing adjustments to headings. A floated figure or table (in
   *  `page.floats`, or a page-wide one in a span column) carries the index
   *  of the block that first cites or embeds it, which is where a tagged
   *  PDF reads it. */
  contentIndex?: number;
  /** The block's text comes from another chapter of the book (#943): the
   *  position of that chapter. Its source offsets (`sourceStart`,
   *  `sourceEnd`, the lines' maps) are offsets in that chapter's file, not
   *  this document's. Set on the blocks of a story that jumped in from an
   *  earlier chapter. */
  sourceChapter?: number;
  /** Set on the paragraph a footnote is set as (at a column foot, or after
   *  the chapter's last block): the note's id. */
  footnoteNote?: string;
  /** A bibliography entry (#269): the key of the work it lists. */
  bibEntry?: string;
  /** The paragraph style (`paragraphStyles[].id`) the block's text is set
   *  in: a paragraph of a `:::paragraphs{style=…}` container (the innermost
   *  one), a poem whose `:::verse` fence names a style. Every fragment of a
   *  split paragraph carries it. Metadata for other renditions (a
   *  reflowable EPUB); the layout does not read it. */
  paragraphStyleId?: string;
  /** A block of a back-of-book index (`:::index`): the level of the entry
   *  it sets (0 a main entry). The page-less entries heading that entry
   *  are set in the same block, above it; each entry's first line carries
   *  its own level ({@link VDTLine.indexLevel}). */
  indexLevel?: number;
  /** Id of the heading style (`{style="…"}`) applied to this heading. */
  headingStyleId?: string;
  /** A heading set in a box or a frame of a composed page whose level or
   *  heading style has a design of its own (#906): what the design
   *  (`designOverlay`) is laid out with. Such a heading carries no
   *  `headingStyleId`, `attrs` or `titleBreaks`: in the flow those open a
   *  styled section, a chapter's attributes, an opener band or a page's
   *  role, which a heading inside a box does not. The block is as tall as
   *  the design needs, as a heading in a column is. */
  boxDesign?: {
    styleId?: string;
    attrs?: Record<string, string>;
    attrSources?: Record<string, { start: number; end: number }>;
    titleBreaks?: number[];
    titleLength?: number;
  };
  /** True for a heading whose style has `numbered: false`: it advances no
   *  counter and `{chapterNumber}` is empty on its pages. */
  unnumbered?: boolean;
  /** True for a level-1 heading whose style has `runningChapter: false` (a
   *  plate, a map): the running heads pass over it and keep naming the
   *  chapter in force before it (`{chapterTitle}`, `{chapterNumber}`,
   *  `{attr.<key>}`, the `h1` guide words). */
  notRunningChapter?: boolean;
  /** Present on the part row of an expanded `:::toc`: the row's design is
   *  laid out from `toc.parts.design` with these values (see
   *  `buildHeadersAndFooters`), replacing the block's (empty) line.
   *  `continued`: the head row of a cut contents block repeated at the top
   *  of the column it goes on in (`toc.groups.continuation`, #850), its
   *  title followed by the continuation mark; a reading of the contents
   *  (EPUB navigation) leaves it out. */
  tocPart?: { number: string; title: string; pageLabel: string; palette?: Record<string, string>; pageIndex?: number; continued?: true };
  /** Present on an entry of an expanded `:::toc`, with the book page index
   *  the entry points at once known (`OutlineEntry.pageIndex`): renderers
   *  make the row a link to it. The contents keep their own rhythm:
   *  entries and part rows neither snap to the baseline grid nor serve as
   *  column-balancing stretch points. `continued`: a repeated head row (see
   *  `tocPart`). `headingSource`: where the heading the entry lists starts
   *  in its chapter's Markdown body (`OutlineEntry.headingSource`, #857). */
  tocEntry?: { pageIndex?: number; continued?: true; headingSource?: number };
  numberPrefix?: string;
  /** What joins {@link numberPrefix} to the title
   *  (`HeadingLevelConfig.numberSeparator`), when it is not one space:
   *  `'　'` or `''` in a Chinese heading. Absent means `' '`. */
  numberSeparator?: string;
  /** A numbered heading's counter: its level's running count (the `3` of
   *  a third chapter, whatever its template prints). Backs `{numberDecimal}`,
   *  `{numberRoman}`, `{numberWords}`… in heading designs. Absent on
   *  unnumbered headings and other blocks. */
  headingNumber?: number;
  fontString: string;
  boldFontString?: string;
  italicFontString?: string;
  boldItalicFontString?: string;
  color: string;
  boldColor?: string;
  italicColor?: string;
  /** Set when the block's `*…*` runs (its segments flagged `italic`) are
   *  set upright with a rule over them (`bodyText.emphasis: 'overline'`,
   *  #376): the layout draws the rules as `VDTLine.marks`. Absent
   *  otherwise. */
  emphasis?: 'overline';
  /** Colour for inline `:ref` segments (`refResourceId` set). */
  refColor?: string;
  textAlign: TextAlign;
  /** Tracking applied to this block's text (px added after every glyph;
   *  negative tightens). Set by column balancing on a loose paragraph, on
   *  a paragraph set a line short to pull up a runt, and on a heading whose
   *  level or heading style sets `letterSpacing` (EF-83). Renderers paint it
   *  via canvas `letterSpacing`, CSS `letter-spacing` or PDF `Tc`, adding a
   *  line's own `VDTLine.letterSpacing`. */
  letterSpacing?: number;
  /** Set one line shorter to take up a runt (`bodyText.tightenRunts`,
   *  #733): `tracking` is the negative tracking used, in thousandths of an
   *  em, 0 when the word spaces alone carried the line. Absent when no fix
   *  was made. The tracking itself is in {@link letterSpacing}, with
   *  whatever else the style asks for; the renderers do not read this. */
  runtFix?: { tracking: number };
  /** Column balancing: the levers that fired on this block — space added
   *  above it, the paragraph run a line long — and how much. Absent when
   *  balancing left the block alone. The band caps that cut a band level
   *  are recorded on its columns (`VDTColumn.bandCapped`, `trailingCap`). */
  balancing?: VDTBalancing;
  /** Character offset in the original markdown where the source content for this block starts */
  sourceStart?: number;
  /** Character offset just past the last source character for this block */
  sourceEnd?: number;
  /** Absolute source offsets (in original markdown) per plain-text char of rawBlock.text */
  sourceMap?: number[];
  /** Length of any prepended numbering prefix in the block's plain text (0 if none) */
  plainPrefixLen?: number;
  /** List item nesting depth (1-based), only set for `listItem` blocks */
  listDepth?: number;
  /** Bullet character to render (only for `listItem`) */
  bulletText?: string;
  /** Font string used to render the bullet glyph */
  bulletFontString?: string;
  /** Bullet color (hex) */
  bulletColor?: string;
  /** Absolute page X coordinate where the bullet is drawn */
  bulletOffsetX?: number;
  /** Absolute page Y coordinate for the bullet's vertical midpoint (paired
   *  with textBaseline='middle'): its em box centred on the text's
   *  x-height. Every marker has it, a contents number included, as up to
   *  postext 1.4; a renderer that knows `bulletBaselineY` prefers that. */
  bulletY?: number;
  /** Absolute page Y coordinate of the baseline a marker set as text sits
   *  on — a contents entry's number, which shares the first line's baseline
   *  whatever its face and size. When present, renderers paint the marker
   *  (and its separator) with its alphabetic baseline here instead of
   *  centring it on `bulletY`. Absent for list bullets and numbers. */
  bulletBaselineY?: number;
  /** Ordered-list separator drawn as its own run after the number (only when
   *  its style differs from the number's; otherwise `bulletText` carries it). */
  separatorText?: string;
  /** Font string of the separator run */
  separatorFontString?: string;
  /** Separator colour (hex) */
  separatorColor?: string;
  /** Absolute page X coordinate where the separator run starts (shares the
   *  bullet's `bulletY`, or its `bulletBaselineY` when set) */
  separatorX?: number;
  /** Ordered-list prefix drawn as its own run before the number (`（` of
   *  （一）), in the separator run's font and colour; set only with a
   *  separator run (otherwise `bulletText` carries it). */
  prefixText?: string;
  /** Absolute page X coordinate where the prefix run starts (on the
   *  bullet's `bulletY` / `bulletBaselineY`, as the separator). */
  prefixX?: number;
  /** How the marker reads when its block is set right to left (#664):
   *  `bulletText`, and the prefix and separator runs with it, are resolved
   *  at a right-to-left paragraph level (UAX #9) and painted run by run in
   *  visual order from their x (`markerRuns`), so `١-` has its hyphen on
   *  the number's left and a bracket is mirrored. `'rtl-arabic'`: the same
   *  in an Arabic-script document, where European digits read as Arabic
   *  numbers (`3-1` with the 3 on the right, as `٣-١`; #665). Absent for a
   *  left-to-right marker, painted as one run. */
  bulletDirection?: 'rtl' | 'rtl-arabic';
  /** The box of a task item (`- [ ]`, `- [x]`), which the renderers draw
   *  (#765): a square outline of `side` px from `bulletOffsetX`, centred on
   *  `bulletY`, its `stroke` px inside the square, with a tick when
   *  `checked` (`taskBox.ts` has the shape). It stands for ☐ or ☑, which
   *  is what a reader hears and a copy takes; the block then has no
   *  `bulletText` and no `bulletFontString`, and nothing asks a font for
   *  the character. Absent when the list settings name a character of
   *  their own, or keep the character of postext 1.28
   *  (`unorderedLists.taskBox: 'character'`). */
  bulletBox?: { side: number; stroke: number; checked: boolean };
  /** A drop cap opening the paragraph (#623), on the fragment that holds
   *  its first line only: renderers paint it beside the lines, which were
   *  set short of it. */
  dropCap?: VDTDropCap;
  /** A code listing's lines (#624, `type: 'code'`): its language as the
   *  fence names it; when its lines are numbered, the numbers' face and
   *  colour and the room between them and the code (they are set in the
   *  page's `lineNumbers` slot, out of the text, right-aligned before the
   *  code); and how its lines were fitted when one was too wide. */
  code?: {
    lang?: string;
    numbers?: { gap: number; fontString: string; color: string };
    fit?: { mode: 'wrap' | 'shrink' | 'clip'; lines: number; scale: number };
  };
  /** List kind for `listItem` blocks — drives bullet shape and text decoration. */
  listKind?: 'unordered' | 'ordered' | 'task';
  /** When true, the canvas backend draws a strikethrough through the block's lines (completed tasks). */
  strikethroughText?: boolean;
  /** Present on `mathDisplay` blocks. */
  mathRender?: MathRender;
  /** Present on `score` blocks (#1172): which system of which score. */
  score?: VDTScoreInfo;
  /** Original TeX source for math spans/blocks — used for warnings and the
   *  disabled-math fallback rendering. */
  tex?: string;
  /** When true, the block is skipped during rendering but still reserves
   *  its bbox space within the column flow. Used for headings with
   *  `span: 'page'` whose visual output is produced by an opener band, and
   *  for structural headings (`hidden` on their level or style), which
   *  reserve nothing: their lines keep the text (contents, bookmarks,
   *  running heads) but have no height. */
  hidden?: boolean;
  /** Optional in-column design slot rendered in place of the block's default
   *  text content. Populated for heading blocks whose level has
   *  `advancedDesign.enabled` and (for `span: 'column'`) at least one
   *  element. Renderers render this instead of `lines` when present. */
  designOverlay?: VDTDesignSlot;
  /** Painted turned half round (180°) about this point of the page (#1229):
   *  the frame and the content of a box whose fence says `turn="180"` (an
   *  answer printed upside down). */
  turn?: { cx: number; cy: number };
  /** Present on `type === 'callout'` frame blocks: the resolved callout
   *  geometry. The frame has no text lines of its own — its decoration
   *  (background, stripe, icon, title) is carried on `designOverlay`, and
   *  its content blocks follow it in the column with `containerId` set. */
  callout?: ResolvedCalloutBlock;
  /** Id of the enclosing `:::callout` container (the parser's
   *  `containerId`), set on the frame block and on every block laid out
   *  inside it. Column balancing and keep-with-next rollbacks treat such
   *  blocks as part of one unbreakable unit. */
  containerId?: number;
  /** Inside a nested `:::callout` (a box laid out within another box): the
   *  parser `containerId`s of the nested boxes enclosing the block,
   *  outermost first — the top-level box stays `containerId`. A nested
   *  frame's own id is the last entry of its path. Absent at top level. */
  calloutPath?: number[];
  /** Base direction of the block's text (its paragraph embedding level),
   *  when it differs from its page frame's: a left-to-right island in a
   *  right-to-left book, an Arabic quotation in a left-to-right one.
   *  Absent when the block runs as its frame does. */
  direction?: 'ltr' | 'rtl';
  /** A comic strip (`:::strip`, #566) on a `type: 'resource'` block with no
   *  `resourceBlock`: its panels, split lines and lettering. Coordinates
   *  are relative to the top-left corner of the block's box ON THE SHEET
   *  (`flowRectToPage(page, block.bbox)`), physical whatever the page's
   *  writing mode or direction; renderers and the Sandbox read it through
   *  `comicBlockOnSheet` / `pageComics`, which move it onto the sheet.
   *  A strip narrower than its measure (`width`, #590) stands inside the
   *  box (`comic.frame` then starts away from the corner). */
  comic?: VDTComicPage;
  /** A strip's caption (`:::strip{caption=…}`, #590): its lines are the
   *  block's own `lines` (`stripCaption.lines` of them, from
   *  `firstLine`), set in the caption style — the block's fonts and colour
   *  are the caption's, and each segment carries its own font and colour
   *  (the label's) — and painted like the lines of any text block, in the
   *  flow. Present only on a strip block whose fence has a caption. */
  stripCaption?: VDTStripCaption;
}

/** Resolved geometry of a `:::callout` frame block (see `VDTBlock.callout`). */
export interface ResolvedCalloutBlock {
  /** Id of the `CalloutStyleConfig` that styled the box. */
  styleId: string;
  span: CalloutSpan;
  placement: CalloutPlacement;
  /** Content area inside padding / stripe / icon column, relative to the
   *  frame's `bbox` origin. Children are laid out inside it. */
  innerRect: BoundingBox;
  /** Ids of the child blocks (in reading order). */
  childIds: string[];
  /** `fileId` of the icon resource image when `icon.kind === 'resource'`. */
  iconFileId?: string;
  /** Bitmap format of the icon image (`'png'`, `'jpeg'`, …) when known. */
  iconFormat?: string;
  /** `fileId` of the marker resource image when `marker.kind === 'resource'`. */
  markerFileId?: string;
  /** Bitmap format of the marker image when known. */
  markerFormat?: string;
  /** Set on the frames of a callout split across columns / pages
   *  (`keepTogether: false`): 0-based index of this fragment. Every
   *  fragment shares the fence's `contentIndex` and `containerId`. */
  part?: number;
  /** On a split callout: `true` while another fragment follows this one. */
  continued?: boolean;
  /** The fence asks the box to be printed upside down (`turn="180"`,
   *  #1229): an answer turned for the reader to turn the book round. */
  turned?: true;
}

/** The column-balancing levers (`headings.balancing`), in the order they
 *  are tried on a short column:
 *  - `trailingCallout` — a box closing the column moved down by the room
 *    under its foot (after `afterFloat` with `closingBox: 'last'`, never
 *    with `'off'`);
 *  - `heading` — whole grid lines above a heading;
 *  - `listEnd` — a grid line where a list ends;
 *  - `afterDisplay` — a grid line under a display formula or a box;
 *  - `afterFloat` — a grid line under a float band heading the column;
 *  - `looseParagraph` — a paragraph re-broken a line long (plus tracking
 *    when word spacing alone could not gain the line), or with
 *    `fillShortColumns` (#1236) a line short. */
export type BalanceLever = 'trailingCallout' | 'flexFigure' | 'heading' | 'listEnd' | 'afterDisplay' | 'afterFloat' | 'looseParagraph';

/** Column balancing on a character grid (`VDTDocument.gridBalancing`,
 *  #632). */
export interface VDTGridBalancing {
  /** Balancing is off because the document is set on the grid in
   *  horizontal text and its configuration does not turn it on
   *  (`headings.balancing.enabled`): short columns are left short.
   *  (Vertical text has balancing off by default on or off the grid.) */
  off?: true;
  /** `headings.balancing.gridLines: 'off'`: no lever adds grid lines. */
  gridLines?: 'off';
}

/** What column balancing did to one block (`VDTBlock.balancing`). */
export interface VDTBalancing {
  /** The levers that fired on the block, in the order above. Usually one;
   *  a paragraph after a list can take the list-end line and also run a
   *  line long. */
  levers: BalanceLever[];
  /** Space the spacing levers added above the block, in px: whole grid
   *  lines, or the exact room under a closing box (`trailingCallout`).
   *  `0` when only `looseParagraph` fired — that paragraph grows by its
   *  extra lines instead. */
  spaceAbove: number;
  /** `looseParagraph`: lines the paragraph gained (-1 when
   *  `headings.balancing.fillShortColumns` set it a line short, #1236). */
  extraLines?: number;
  /** `flexFigure`: px the picture was set taller, cropped within its safe
   *  area (`Resource.safeArea`); `spaceAbove` is then `0`. */
  bodyGrowth?: number;
  /** `looseParagraph`: tracking that gained the line, in thousandths of an
   *  em (`0` when word spacing alone did; negative, tighter, for a
   *  paragraph set a line short); the block's `letterSpacing` is the same
   *  value in px. */
  tracking?: number;
}

export interface VDTColumn {
  index: number;
  bbox: BoundingBox;
  blocks: VDTBlock[];
  availableHeight: number;
  baselineOffset: number;
  /** Vertical band this column belongs to when a page is split into
   *  stacked bands (e.g. a full-width span above a multi-column flow).
   *  Absent for the plain single-band layout. */
  band?: number;
  /** `'text'` for a regular flow column, `'span'` for a full-width column
   *  that hosts page-spanning content, `'side'` for the float-only side
   *  column of a one-and-a-half layout (`layout.sideColumnRole: 'floats'`):
   *  body text never flows into it; the `span: 'side'` floats stacked in
   *  it consume its `availableHeight` from the top, so its used height is
   *  the stack's current bottom. Absent means `'text'`. */
  kind?: 'text' | 'span' | 'side';
  /** True when a `:::columnbreak` directive ended this column: its bottom
   *  gap is intentional, so column balancing leaves it alone. */
  forcedBreak?: boolean;
  /** True while a band cap (trailing or before a page-span box) cuts this
   *  column level with the others of its band. A closing band that ended
   *  level with no cap carries it too: its columns are cut on the grid line
   *  under its text when the flow of the page is closed (#713). */
  bandCapped?: boolean;
  /** True when a trailing band cap cut this column so a closing band ends
   *  level: its bottom is the level cut, and column balancing fills the
   *  column up to it even though the page does not flow on. */
  trailingCap?: boolean;
  /** Regions of the column that text wraps round (#627): a picture or a
   *  box narrower than the column, set at one of its sides, with the lines
   *  beside it set short. Page coordinates of the flow frame (as `bbox`);
   *  each covers the item and its gap on the text's side and under it, its
   *  height in whole grid lines from its top. Absent when nothing in the
   *  column wraps. */
  exclusions?: VDTExclusion[];
  /** In the column a page-span opener was set in, the foot (page y of the
   *  flow frame, as `bbox`) of the float band set under the opener at the
   *  column's head (#639, `layout.floatsUnderOpener`): the float is in
   *  `VDTPage.floats`, the column's text starts here, and the rule of the
   *  column's gutter starts no higher (`columnRuleSegments`). Absent when
   *  no float stands there. */
  headFloatFoot?: number;
  /** On a character grid (#632), the levers balancing would have used on
   *  this short column and the grid kept out: `'looseParagraph'` when a
   *  paragraph could gain its line only by spreading its characters off
   *  their cells, the whole-line levers (`'heading'`, `'listEnd'`,
   *  `'afterDisplay'`, `'afterFloat'`) under `headings.balancing.gridLines:
   *  'off'`. Why the column ends short; absent when nothing was refused. */
  gridRefused?: BalanceLever[];
}

/** A region of a column that text wraps round (see `VDTColumn.exclusions`,
 *  #627). */
export interface VDTExclusion {
  x: number;
  y: number;
  width: number;
  height: number;
  /** The side of the column it stands at, in the flow (the text runs on the
   *  other side). */
  side: 'left' | 'right';
  /** The space between the item and the text beside it (px), part of
   *  `width`. */
  gap: number;
  /** The id of the block that wraps the text: an inline figure's block, a
   *  float's, or a box's frame. */
  ownerId: string;
  /** A contour wrap (#883): the picture's shape, which sets each line
   *  beside it short by the shape's width there rather than by
   *  {@link width}. Absent: the rectangle. */
  contour?: VDTExclusionContour;
}

/** The shape a contour wrap runs round (#883), in page px: bands of the
 *  page, each with the shape's extent across it, and the margin kept round
 *  them (across, above and below). A line meets the shape where a band
 *  lies within the margin of the line's own band. */
export interface VDTExclusionContour {
  spans: VDTContourSpan[];
  margin: number;
  /** The insets are rounded up to whole multiples of this (px): one body
   *  character under a CJK character grid, so the lines keep to it. */
  quantum?: number;
}

/** One band of a contour (`VDTExclusionContour.spans`). */
export interface VDTContourSpan {
  y: number;
  height: number;
  left: number;
  right: number;
}

/** The notes set at the foot of one column (`footnotes.placement:
 *  'column'`). The note paragraphs themselves are in `VDTPage.floats` (and
 *  `doc.blocks`), so every renderer paints them as any block; the area
 *  carries what else is painted: the separator rule. */
export interface VDTFootnoteArea {
  /** The column the notes belong to. */
  columnIndex: number;
  /** From the separator's top edge (its space above included) to the last
   *  note's foot. */
  bbox: BoundingBox;
  /** Ids of the notes, in order. */
  noteIds: string[];
  /** The separator rule, when drawn: its left end, the y of its centre
   *  line, its length and thickness (px), and colour. */
  rule?: { x: number; y: number; width: number; lineWidthPx: number; color: string };
}
