// What measureContentBlock reads and returns: the measure context, the
// drop-cap notes it leaves, the measured block and the options a caller
// passes (#1278: split out of measureContentBlock.ts).
import type { ContentBlock } from '../../../parse/index.js';
import type { Resource, ResourceType } from '../../../types.js';
import type { ResolvedResourceBlock, VDTBlock } from '../../../vdt.js';
import type { MeasurementCache, MeasuredBlock, BreakTrace } from '../../../measure/index.js';
import type { renderMath } from '../../../math/index.js';
import type { BlockStyle } from '../../styles.js';
import type { BlockKindContext, BlockKind } from '../buildBlockKind.js';
import type { AnchorRefContext, TableRowMetrics, TableSliceSpec } from '../../resources/resourceLayout.js';
import type { ResourceNumberingMap } from '../../resources/resourceNumbering.js';
import type { CaptionCitations } from '../../references/citations.js';
import type { MeasuredDropCap } from '../../text/dropCap.js';
import type { LineInsetStep } from '../../../measure/types.js';

/** Everything `measureContentBlock` needs that is constant across one
 *  placement pass. Built once before the loop; `blockIdx` and the paragraph
 *  style override are per-call (see `measureContentBlock` arguments). */
export interface BlockMeasureContext
  extends Omit<BlockKindContext, 'blockIdx' | 'paragraphStyleOverride'> {
  /** The parsed blocks of the document — for neighbour lookaheads. */
  contentBlocks: readonly ContentBlock[];
  cache?: MeasurementCache;
  /** Source offset of the markdown body inside the original document. */
  bodyOffset: number;
  /** The markdown body the blocks' source offsets index (before
   *  `bodyOffset`): lines read it to start at the backslash of an escape
   *  they open with (see `stampSourceRanges`). */
  source?: string;
  resources: Resource[];
  resourceTypes: ResourceType[];
  resourceNumbering: ResourceNumberingMap;
  /** The formatted citations of resource captions and notes (#529). */
  captionCitations?: ReadonlyMap<string, CaptionCitations>;
  /** Ids of resources that float to page bands (never placed inline). */
  floatedIds: ReadonlySet<string>;
  /** Content indices of the `containerStart` markers of the boxes that left
   *  the flow — set in the side column, floated to a band or fixed — filled
   *  by the placement pass as it sets them. A paragraph after a heading
   *  looks past them (`bodyText.indentAfterHeading`). */
  leftFlow?: ReadonlySet<number>;
  /** Footnote id → printed number (`[^id]` markers print it). */
  footnoteNumbers?: ReadonlyMap<string, string>;
  /** The anchors a `:ref` may name and the words it prints (#262); absent
   *  when no reference names anything but resources. */
  anchorRefs?: AnchorRefContext;
  /** Filled by the measurement: the content indices of the blocks whose
   *  style asks for letter-spacing (`letterSpacing`) on text of a joining
   *  script (Arabic…), which is set without it. The build reports them
   *  (`joiningScriptLetterSpacing`). */
  joiningLetterSpacing?: Set<number>;
  /** Filled by the measurement: the content indices of the paragraphs a
   *  drop cap was meant to open and could not as configured (#623), and
   *  why; the build reports them (`dropCap` content warnings). */
  dropCapNotes?: Map<number, DropCapNote>;
}

/** Why a paragraph's drop cap was not set as configured (see
 *  `BlockMeasureContext.dropCapNotes`). */
export interface DropCapNote {
  reason: 'shortParagraph' | 'joiningScript' | 'verticalText' | 'noLetter' | 'split' | 'inBox';
  handling?: 'reserve' | 'shrink' | 'skip';
  lines?: number;
}

export interface MeasuredContentBlock {
  kind: BlockKind;
  /** The block after math/ref enrichment — what was actually measured. */
  contentBlock: ContentBlock;
  measured: MeasuredBlock;
  /** Length of the heading-number prefix prepended to the plain text. */
  prefixLen: number;
  /** `rawBlock.sourceMap` shifted by `bodyOffset`. */
  absoluteSourceMap: number[];
  mathDisplayRender?: ReturnType<typeof renderMath>;
  /** Present for `resource` kinds: the laid-out image/table + caption group. */
  resourceBlock?: ResolvedResourceBlock;
  /** A table measured in full: its row metrics at this width, from which a
   *  slice is planned (an inline table split across columns, #634). */
  tableRows?: TableRowMetrics;
  /** A resource measured with its caption beside it (`captionAside`,
   *  #729): the height of the caption band, which the block's own height
   *  leaves out. */
  asideHeight?: number;
  /** Tracking the text was measured with (px per glyph), when column
   *  balancing asked for it — renderers must paint the block with it. */
  letterSpacingPx?: number;
  /** The paragraph was set one line shorter to take up a runt (#733): the
   *  rung of negative tracking that carried it, in thousandths of an em, 0
   *  when tighter word spaces alone did. Absent when no fix was made. */
  runtTracking?: number;
  /** A paragraph a drop cap opens (#623): the letter, relative to the
   *  column. Its lines were set short of it. */
  dropCap?: MeasuredDropCap;
  /** A code listing (#624): its language, numbers and fit (see
   *  `VDTBlock.code`). */
  code?: NonNullable<VDTBlock['code']>;
  /** A code listing set from the far side of a mirrored frame (#624): its
   *  block reads left to right. */
  direction?: 'ltr';
}

export interface MeasureContentBlockOptions {
  /** Column-balancing "run a paragraph long" — Knuth-Plass looseness. Left
   *  undefined for the common case so measurement cache keys are unchanged. */
  looseness?: number;
  /** Column-balancing tracking for a loose paragraph, in em per glyph
   *  (`headings.balancing.maxTracking / 1000` at most). Rich path only. */
  trackingEm?: number;
  /** Column balancing on a character grid (#632): the most a justified
   *  line of a paragraph the CJK composer sets may spread between two
   *  characters, in em (`headings.balancing.maxTracking / 1000`). A line
   *  that needs more is set ragged and flagged `cjkLoose`, so the loose
   *  paragraph is refused. Other paragraphs ignore it. */
  gridTrackingEm?: number;
  /** Paragraph style forced by an enclosing `:::paragraphs` container. */
  styleOverride?: BlockStyle;
  /** Resource blocks: the widest a figure's image may be set, its caption
   *  keeping the column's width (`layout.fitFiguresToPage`). */
  figureMaxBodyWidth?: number;
  /** Resource blocks: px a picture with a safe area is set taller (or
   *  shorter, when negative) by cropping outside it (the fit and balancing
   *  levers, #442). */
  figureHeightDelta?: number;
  /** Resource blocks on a vertical page: set upright, the frame at most
   *  this wide (see `ResourceLayoutInput.upright`). */
  uprightMaxLength?: number;
  /** Resource blocks: set the caption and note beside the body, in a band
   *  `width` wide whose left edge is `dx` from the column's left (the
   *  float-only side column, #729), level with the body's top. The
   *  measured height is then the body's alone, and `asideHeight` the
   *  caption band's. Never cached: a resource block is laid out afresh on
   *  every call. */
  captionAside?: { dx: number; width: number };
  /** Table resources: lay out only these rows, the slice of an inline
   *  table split across columns (#634, `ResourceLayoutInput.slice`). */
  tableSlice?: TableSliceSpec;
  /** Lines (1-based) a column or a page ends on, which should not end on
   *  a hyphen (`bodyText.hyphenateAcrossColumns: false`). */
  avoidHyphenAtLines?: readonly number[];
  /** The breaks of the lines of an earlier setting to keep as they are
   *  (see `MeasureBlockOptions.keepBreaks`): a paragraph broken again after
   *  its first lines were placed. Such a measurement is not cached. */
  keepBreaks?: BreakTrace;
  /** Columns of other widths the paragraph runs on into, in line order:
   *  from line `fromLine` (0-based) on, its lines are broken for a column
   *  `columnWidth` px wide (see `MeasureBlockOptions.restWidths`). Such a
   *  measurement is not cached. */
  restColumnWidths?: readonly { fromLine: number; columnWidth: number }[];
  /** Lines set short beside a picture that text wraps round (#627, see
   *  `MeasureBlockOptions.lineInsets`): `startInsetPx` is the room the
   *  picture takes on the column's left in the flow, `endInsetPx` on its
   *  right; both add to the block's own indents. Such a measurement is not
   *  cached. */
  lineInsets?: readonly LineInsetStep[];
  /** Internal to the drop cap (#623): the paragraph measured again set
   *  without it (`skip`), with the initial over `lines` lines (a short
   *  paragraph's `'shrink'`), or with a lead-in of `leadInWords` words
   *  (the first line's, counted by the first setting). */
  dropCap?: { skip?: true; lines?: number; leadInWords?: number };
}
