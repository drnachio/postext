import type {
  ColorPaletteEntry,
  DocumentMetadata,
  PostextResource,
  Resource,
  TableCellAlign,
  TableCellVerticalAlign,
  ResolvedPageConfig,
  ResolvedLayoutConfig,
  ResolvedBodyTextConfig,
  ResolvedHeadingsConfig,
  ResolvedTableStyleConfig,
  TableRules,
  ResolvedCaptionStyleConfig,
  ResolvedDiagramStyleConfig,
  ResolvedParagraphStyleConfig,
  ResolvedCalloutStyleConfig,
  CalloutSpan,
  CalloutPlacement,
  ResolvedUnorderedListsConfig,
  ResolvedOrderedListsConfig,
  ResolvedMathConfig,
  ResolvedDesignSlot,
  ResolvedPartsConfig,
  ResolvedHeadingStyleConfig,
  ResolvedTocConfig,
  PageRole,
  PartState,
} from './types';
import type { NumeralStyle } from './numbering';
import type { MathRender } from './math/types';

// ---------------------------------------------------------------------------
// Bounding box — all values in px, relative to page origin
// ---------------------------------------------------------------------------

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Resolved config aggregate (all sub-configs fully resolved to non-optional)
// ---------------------------------------------------------------------------

export interface ResolvedConfig {
  page: ResolvedPageConfig;
  layout: ResolvedLayoutConfig;
  bodyText: ResolvedBodyTextConfig;
  headings: ResolvedHeadingsConfig;
  tableStyle: ResolvedTableStyleConfig;
  captionStyle: ResolvedCaptionStyleConfig;
  diagramStyle: ResolvedDiagramStyleConfig;
  paragraphStyles: ResolvedParagraphStyleConfig[];
  calloutStyles: ResolvedCalloutStyleConfig[];
  unorderedLists: ResolvedUnorderedListsConfig;
  orderedLists: ResolvedOrderedListsConfig;
  math: ResolvedMathConfig;
  header: ResolvedDesignSlot;
  footer: ResolvedDesignSlot;
  /** Part dividers (`:::part` containers). */
  parts: ResolvedPartsConfig;
  /** Named heading styles (`# Title {style="…"}`). */
  headingStyles: ResolvedHeadingStyleConfig[];
  /** The table of contents `:::toc` prints. */
  toc: ResolvedTocConfig;
  /** The document's colour palette, kept so per-resource-type caption
   *  overrides (`ResourceType.captionStyle`) can resolve palette colours at
   *  layout time. Absent when the config defines no palette. */
  colorPalette?: ColorPaletteEntry[];
}

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
  | 'callout';

export type TextAlign = 'left' | 'justify' | 'center' | 'right';

export interface VDTLineSegment {
  kind: 'text' | 'space' | 'math' | 'swatch';
  text: string;
  width: number;
  bold?: boolean;
  italic?: boolean;
  /** Present when `kind === 'math'`. The rendered formula. */
  mathRender?: MathRender;
  /** Present when `kind === 'swatch'`: an inline colour swatch (`:swatch{…}`),
   *  a square of `width` px filled with `color` (a hex; absent when the
   *  colour did not resolve — the square is then an empty outline), sitting
   *  on the baseline and outlined in the text colour. */
  swatch?: { color?: string };
  /** Present when this segment renders an inline `:ref{…}` to a resource.
   *  Renderers recolour it (link colour) and the PDF backend emits a link
   *  annotation to the resource's named destination. */
  refResourceId?: string;
  /** True when this segment is part of a caption's numbered label, so renderers
   *  paint it in the configured caption-label colour. */
  captionLabel?: boolean;
  /** Font of this segment when it differs from the block's (a contents
   *  entry's page number, leader or subtitle). Renderers paint the segment
   *  with it instead of the block font the bold / italic flags would pick. */
  fontString?: string;
  /** Colour of this segment when it differs from the block's. */
  color?: string;
  /** Superscript / subscript segment (`^…^` / `~…~`): `fontString` carries
   *  the reduced size and `baselineShift` the offset (px, positive down)
   *  renderers add to the line's baseline. */
  script?: 'sup' | 'sub';
  baselineShift?: number;
}

export interface VDTLine {
  text: string;
  bbox: BoundingBox;
  baseline: number;
  hyphenated: boolean;
  /** Per-segment data for justified rendering */
  segments?: VDTLineSegment[];
  /** Whether this is the last line of the paragraph (ragged even when justified) */
  isLastLine?: boolean;
  /** Set ragged inside a justified paragraph: a line a URL made unfillable
   *  (its few word spaces would stretch past the loose-line threshold). */
  ragged?: boolean;
  /** Approximate character offset in the original markdown source where this line begins */
  sourceStart?: number;
  /** Approximate character offset just past the last source character contributing to this line */
  sourceEnd?: number;
  /** Plain-text start offset within the block's plain text (inclusive) */
  plainStart?: number;
  /** Plain-text end offset within the block's plain text (exclusive) */
  plainEnd?: number;
  /** For justified (non-last) lines: ratio of the applied justified space width
   *  to the normal space width of the block's font. 1.0 means natural spacing. */
  justifiedSpaceRatio?: number;
}

// ---------------------------------------------------------------------------
// Resolved resource block (issue #49) — a measured, placement-ready embed of a
// `Resource` (bitmap / svg / table) plus its caption. Produced during the
// measurement phase so canvas/PDF renderers can draw it synchronously. All
// geometry is in px, relative to the block origin (`(0,0)` = block top-left),
// and offset to absolute page coordinates at placement time.
// ---------------------------------------------------------------------------

/** A single laid-out table cell: its primary grid position, pixel rect within
 *  the block, alignment, header flag, and the measured rich-text lines of its
 *  content. Cells covered by a merge are omitted (only the primary is kept). */
/** A cell's embedded image (`TableCell.image`), resolved to its payload and
 *  placed inside the cell. */
export interface VDTResourceTableCellImage {
  /** The referenced `Resource.id`. */
  resourceId: string;
  kind: 'bitmap' | 'svg';
  /** Out-of-band binary id, resolved at render time like a figure's. */
  fileId: string;
  /** For bitmaps: the source format (e.g. `'png'`, `'jpeg'`). */
  format?: string;
  /** Alternative text of the image (the resource's `altText`, else its
   *  caption), for accessible output. */
  altText?: string;
  /** Pixel rect of the image, in the same frame as the cell `rect`. */
  rect: BoundingBox;
}

export interface VDTResourceTableCell {
  row: number;
  col: number;
  colSpan: number;
  rowSpan: number;
  isHeader: boolean;
  align: TableCellAlign;
  verticalAlign: TableCellVerticalAlign;
  /** Pixel rect of the cell relative to the resource block origin. */
  rect: BoundingBox;
  /** Measured content lines, with bboxes relative to the cell's text origin. */
  lines: VDTLine[];
  /** The cell's embedded image, when it has one and the resource resolved. */
  image?: VDTResourceTableCellImage;
  /** The cell's own fill (hex, `TableCell.background` resolved through the
   *  palette), painted instead of the table's header / body fill. */
  background?: string;
}

/** Laid-out table geometry for a `kind: 'table'` resource block. */
export interface VDTResourceTableLayout {
  /** Body-cell font strings used for the rich-text line renderer. */
  fontString: string;
  boldFontString: string;
  italicFontString: string;
  boldItalicFontString: string;
  /** Body-cell text colour (hex). */
  color: string;
  /** Header-cell font strings. Header cells are measured with these, so the
   *  renderer must paint header cells with the same set. */
  headerFontString: string;
  headerBoldFontString: string;
  headerItalicFontString: string;
  headerBoldItalicFontString: string;
  /** Header-cell text colour (hex). */
  headerColor: string;
  /** Border colour (hex). */
  borderColor: string;
  /** Border thickness in px; `0` means no borders. */
  borderWidthPx: number;
  /** Header background colour (hex), or undefined for no fill. */
  headerBackground?: string;
  /** Body background colour (hex), or undefined for no fill. */
  bodyBackground?: string;
  cells: VDTResourceTableCell[];
  /** Column x-edges (length = columnCount + 1) relative to block origin. */
  columnEdges: number[];
  /** Row y-edges (length = rowCount + 1) relative to the table's top. */
  rowEdges: number[];
  /** Which rules to stroke with `borderWidthPx` (`'grid'` when absent). */
  rules?: TableRules;
}

/** Background bar painted behind a resource caption (issue #49 §7). */
export interface VDTCaptionBar {
  /** Bar rect — block-relative until placement offsets it, like caption lines. */
  rect: BoundingBox;
  /** Fill colour (hex). */
  background: string;
}

/** Which rows of a split table a block carries, and how it links to the
 *  neighbouring slices (see `TableStyleConfig.overflow`). */
export interface VDTTableSlice {
  /** First model row of the slice (header rows excluded — they are repeated
   *  on every continuation regardless). */
  startRow: number;
  /** One past the last model row of the slice. */
  endRow: number;
  /** The slice continues an earlier one: its caption carries the continued
   *  suffix and the header rows are repeated. Anchors / link destinations
   *  belong to the first slice only. */
  continued: boolean;
  /** More rows follow on a later page: the continues marker is set under
   *  the slice and the note is held back for the last one. */
  continues: boolean;
}

/** The resolved, measured content of a resource block. */
/** A resource block set turned a quarter turn on the page (a landscape
 *  table in a portrait book). The block's inner geometry — `bodyRect`, the
 *  table cells, the caption, note and marker lines, the caption bar — is
 *  then expressed in the block's own upright frame (its top-left at
 *  `(0, 0)`, `width` × `height` px), and this record maps that frame onto
 *  the page: the upright origin lands at page point `(originX, originY)`
 *  and, for `'ccw'`, the upright x axis runs up the page and the y axis
 *  runs right (`'cw'`: x down, y left). See {@link resourceBlockToPage} and
 *  {@link resourceBlockToLocal}. An upright block has no `rotation` and its
 *  inner geometry is in page coordinates once placed. */
export interface VDTResourceRotation {
  direction: 'ccw' | 'cw';
  /** Page x of the upright frame's top-left corner. */
  originX: number;
  /** Page y of the upright frame's top-left corner. */
  originY: number;
  /** Width of the upright frame (its extent along the page's height). */
  width: number;
  /** Height of the upright frame (its extent along the page's width). */
  height: number;
}

/** Map a point of a resource block's inner frame to page coordinates: the
 *  identity for an upright block, the rotation for a turned one. */
export function resourceBlockToPage(
  rb: Pick<ResolvedResourceBlock, 'rotation'>,
  x: number,
  y: number,
): { x: number; y: number } {
  const r = rb.rotation;
  if (!r) return { x, y };
  return r.direction === 'ccw'
    ? { x: r.originX + y, y: r.originY - x }
    : { x: r.originX - y, y: r.originY + x };
}

/** Map a page point into a resource block's inner frame (the inverse of
 *  {@link resourceBlockToPage}). */
export function resourceBlockToLocal(
  rb: Pick<ResolvedResourceBlock, 'rotation'>,
  xPage: number,
  yPage: number,
): { x: number; y: number } {
  const r = rb.rotation;
  if (!r) return { x: xPage, y: yPage };
  return r.direction === 'ccw'
    ? { x: r.originY - yPage, y: xPage - r.originX }
    : { x: yPage - r.originY, y: r.originX - xPage };
}

/** Map an axis-aligned rect of a resource block's inner frame to the page:
 *  a quarter turn keeps it axis-aligned, with width and height swapped. */
export function resourceBlockRectToPage(
  rb: Pick<ResolvedResourceBlock, 'rotation'>,
  rect: BoundingBox,
): BoundingBox {
  if (!rb.rotation) return rect;
  const a = resourceBlockToPage(rb, rect.x, rect.y);
  const b = resourceBlockToPage(rb, rect.x + rect.width, rect.y + rect.height);
  return createBoundingBox(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
}

export interface ResolvedResourceBlock {
  /** The source resource. */
  resource: Resource;
  kind: 'bitmap' | 'svg' | 'table';
  /** Present when the block is one slice of a table split across pages. */
  slice?: VDTTableSlice;
  /** Present when the block is set turned on the page; the inner geometry
   *  is then in the block's upright frame (see {@link VDTResourceRotation}). */
  rotation?: VDTResourceRotation;
  /** Rendered number string (e.g. `"1.7"`) for this resource. */
  number: string;
  /** Caption prefix from the resource type (e.g. `"Figure"`). */
  captionPrefix: string;
  /** Pixel rect of the figure body (image / table area) relative to the block
   *  origin. Caption is laid out below it. */
  bodyRect: BoundingBox;
  /** For bitmap/svg: the out-of-band binary id to resolve at render time. */
  fileId?: string;
  /** For bitmap: the source format (e.g. `'png'`, `'jpeg'`, `'webp'`). */
  format?: string;
  /** Measured caption lines (bboxes relative to the block origin), already
   *  including the prefix + number. Empty when there is no caption. */
  captionLines: VDTLine[];
  /** Font strings used to render the caption (normal / bold / italic / bold+italic). */
  captionFontString: string;
  captionBoldFontString: string;
  captionItalicFontString: string;
  captionBoldItalicFontString: string;
  /** Caption description text colour (hex). */
  captionColor: string;
  /** Caption numbered-label colour (hex); applied to segments tagged
   *  `captionLabel`. */
  captionLabelColor: string;
  /** Link colour (hex) used for inline `:ref` segments inside the caption. */
  linkColor: string;
  /** Table geometry, present only when `kind === 'table'`. */
  table?: VDTResourceTableLayout;
  /** Bar behind the caption, present when `captionStyle.backgroundEnabled`
   *  and the block has a caption. Painted before the caption lines. */
  captionBar?: VDTCaptionBar;
  /** Measured note lines (`Resource.note`), placed under the body when the
   *  caption sits above, otherwise under the caption. Empty when no note. */
  noteLines: VDTLine[];
  /** Font strings used to render the note (normal / bold / italic / bold+italic). */
  noteFontString: string;
  noteBoldFontString: string;
  noteItalicFontString: string;
  noteBoldItalicFontString: string;
  /** Note text colour (hex). */
  noteColor: string;
  /** "Continued" marker lines of a table slice that goes on on a later page
   *  (`slice.continues`), right-aligned under the slice and painted with the
   *  note fonts and colour. Empty otherwise. */
  continuesLines: VDTLine[];
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
  /** Index of the originating content block in the parsed markdown block
   *  list. Stable across layout passes — used by column balancing to key
   *  extra-spacing adjustments to headings. */
  contentIndex?: number;
  /** Id of the heading style (`{style="…"}`) applied to this heading. */
  headingStyleId?: string;
  /** True for a heading whose style has `numbered: false`: it advances no
   *  counter and `{chapterNumber}` is empty on its pages. */
  unnumbered?: boolean;
  /** Present on the part row of an expanded `:::toc`: the row's design is
   *  laid out from `toc.parts.design` with these values (see
   *  `buildHeadersAndFooters`), replacing the block's (empty) line. */
  tocPart?: { number: string; title: string; pageLabel: string; palette?: Record<string, string>; pageIndex?: number };
  /** Present on an entry of an expanded `:::toc`, with the book page index
   *  the entry points at once known (`OutlineEntry.pageIndex`): renderers
   *  make the row a link to it. The contents keep their own rhythm:
   *  entries and part rows neither snap to the baseline grid nor serve as
   *  column-balancing stretch points. */
  tocEntry?: { pageIndex?: number };
  numberPrefix?: string;
  fontString: string;
  boldFontString?: string;
  italicFontString?: string;
  boldItalicFontString?: string;
  color: string;
  boldColor?: string;
  italicColor?: string;
  /** Colour for inline `:ref` segments (`refResourceId` set). */
  refColor?: string;
  textAlign: TextAlign;
  /** Tracking applied to this block's text (px added after every glyph).
   *  Set by column balancing on a loose paragraph; renderers paint it via
   *  canvas `letterSpacing`, CSS `letter-spacing` or PDF `Tc`. */
  letterSpacing?: number;
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
  /** Absolute page Y coordinate for the bullet's vertical midpoint (paired with textBaseline='middle') */
  bulletY?: number;
  /** Ordered-list separator drawn as its own run after the number (only when
   *  its style differs from the number's; otherwise `bulletText` carries it). */
  separatorText?: string;
  /** Font string of the separator run */
  separatorFontString?: string;
  /** Separator colour (hex) */
  separatorColor?: string;
  /** Absolute page X coordinate where the separator run starts (shares `bulletY`) */
  separatorX?: number;
  /** List kind for `listItem` blocks — drives bullet shape and text decoration. */
  listKind?: 'unordered' | 'ordered' | 'task';
  /** When true, the canvas backend draws a strikethrough through the block's lines (completed tasks). */
  strikethroughText?: boolean;
  /** Present on `mathDisplay` blocks. */
  mathRender?: MathRender;
  /** Original TeX source for math spans/blocks — used for warnings and the
   *  disabled-math fallback rendering. */
  tex?: string;
  /** When true, the block is skipped during rendering but still reserves
   *  its bbox space within the column flow. Used for headings with
   *  `span: 'page'` whose visual output is produced by an opener band. */
  hidden?: boolean;
  /** Optional in-column design slot rendered in place of the block's default
   *  text content. Populated for heading blocks whose level has
   *  `advancedDesign.enabled` and (for `span: 'column'`) at least one
   *  element. Renderers render this instead of `lines` when present. */
  designOverlay?: VDTDesignSlot;
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
  /** True when a trailing band cap cut this column so a closing band ends
   *  level: its bottom is the level cut, and column balancing fills the
   *  column up to it even though the page does not flow on. */
  trailingCap?: boolean;
}

export interface VDTFootnoteArea {
  bbox: BoundingBox;
  notes: VDTBlock[];
  separator: boolean;
}

/** Line of wrapped text inside a `VDTDesignTextBlock`. */
export interface VDTDesignTextLine {
  text: string;
  /** X offset of the line's visible content inside the element's content box. */
  xOffset: number;
  /** Y offset of the line baseline relative to the element's y. */
  baselineY: number;
  /** Measured width of the visible text. */
  width: number;
}

/** Rounded-rectangle box style resolved to absolute px / hex values. */
export interface VDTDesignBoxStyle {
  backgroundColor?: string;
  borderColor?: string;
  borderWidthPx: number;
  borderRadiusPx: number;
}

/** Text block rendered inside a design slot (header / footer / heading). */
export interface VDTDesignTextBlock {
  kind: 'text';
  bbox: BoundingBox;
  fontString: string;
  color: string;
  /** Absolute-page-coordinate baselines per line, already offset. */
  lines: VDTDesignTextLine[];
  box?: VDTDesignBoxStyle;
  /** Whether rendering should clip to `bbox`. */
  clip: boolean;
  /** Tracking applied after every glyph, in px (canvas `letterSpacing`,
   *  CSS `letter-spacing`, PDF `Tc`). Absent or 0 = none. */
  letterSpacingPx?: number;
  /** Source range of the text this block displays when it mirrors document
   *  text (an opener's `{titleText}`), so editors can map clicks on the
   *  band back to the markdown. */
  sourceStart?: number;
  sourceEnd?: number;
  /** The exact title text the block renders (lines joined by `\n`) and its
   *  per-character source offsets, when the text mirrors document text. */
  sourceText?: string;
  sourceMap?: number[];
}

/** Rendered rule inside a design slot. */
export interface VDTDesignRuleBlock {
  kind: 'rule';
  bbox: BoundingBox;
  color: string;
  thicknessPx: number;
  direction: 'horizontal' | 'vertical';
}

/** Decorative rounded box. */
export interface VDTDesignBoxBlock {
  kind: 'box';
  bbox: BoundingBox;
  box: VDTDesignBoxStyle;
}

/** Image drawn from the resource image registry (e.g. a callout icon). */
export interface VDTDesignImageBlock {
  kind: 'image';
  bbox: BoundingBox;
  /** Out-of-band binary id resolved at render time (canvas registry, HTML
   *  `resourceImageUrl`, PDF resource image map). */
  fileId: string;
}

export type VDTDesignBlock =
  | VDTDesignTextBlock
  | VDTDesignRuleBlock
  | VDTDesignBoxBlock
  | VDTDesignImageBlock;

export interface VDTDesignSlot {
  bbox: BoundingBox;
  blocks: VDTDesignBlock[];
}

/** @deprecated Use `VDTDesignSlot`. */
export type VDTHeaderFooterSlot = VDTDesignSlot;
/** @deprecated Use `VDTDesignBlock`. */
export type VDTHeaderFooterBlock = VDTDesignBlock;
/** @deprecated Use `VDTDesignTextBlock`. */
export type VDTHeaderFooterTextBlock = VDTDesignTextBlock;
/** @deprecated Use `VDTDesignRuleBlock`. */
export type VDTRuleBlock = VDTDesignRuleBlock;

export interface VDTPage {
  index: number;
  width: number;
  height: number;
  /** The page's own content area (px, page coordinates): the trim box inset
   *  by the margins, mirrored on even pages when `margins.mirror` is on.
   *  Columns, float bands, header/footer containers and opener bands all
   *  derive from it — renderers read it instead of inferring the area from
   *  the column bboxes. */
  contentArea: BoundingBox;
  /** Page classification (see `PageRole`), stamped after placement by
   *  `classifyPages`. Drives the per-element `pages` filter of design
   *  slots. Absent until headers/footers are built. */
  role?: PageRole;
  /** Present on part-divider pages: the part number and title. Marks the
   *  page as `role: 'part'`. */
  partInfo?: {
    number: string;
    title: string;
    /** Palette entries the part's fence overrides (id → hex), applied to
     *  the design slots of every page of the part. */
    palette?: Record<string, string>;
    titleSourceStart?: number;
    titleSourceEnd?: number;
  };
  columns: VDTColumn[];
  header?: VDTDesignSlot;
  footer?: VDTDesignSlot;
  /** Optional full-width opener band above the column flow, used for
   *  heading-level `span: 'page'` chapter openers. */
  openerBand?: VDTDesignSlot;
  /** Blocks positioned outside the column flow: floated resource blocks
   *  (figures / tables) reserved into a band of a column or of the page, and
   *  `placement: 'fixed'` callouts (frame + children) pinned to page
   *  coordinates. Their zones shrink the columns' usable height; they are
   *  rendered after the columns, clipped to the content area rather than to
   *  a single column so a `span: 'page'` float can cross the gutter. */
  floats?: VDTBlock[];
  marginNotes: VDTBlock[];
  footnoteArea?: VDTFootnoteArea;
  /** Numeric counter for this page from the active page-numbering sequence.
   *  Always set after placement — defaults to `index + 1` when no explicit
   *  numbering config applies. */
  pageNumberValue: number;
  /** Rendered label for `pageNumberValue` using `pageNumberFormat`
   *  (e.g. `'iv'`, `'1'`, `'A'`). */
  pageLabel: string;
  /** Format active at this page. */
  pageNumberFormat: NumeralStyle;
  /** Marks pages inserted purely to satisfy a parity constraint
   *  (`:::pagebreak{parity=...}` or heading `breakBefore.parity`).
   *  They render empty body content but still consume a page number. */
  blankForParity?: boolean;
  /** Marks the mandatory leading blank page inserted by an `always-odd`
   *  or `always-even` parity mode. Unlike `blankForParity`, a
   *  `blankForForce` page belongs to the *previous* chapter — it serves
   *  as a separator, not as parity padding for the upcoming one. */
  blankForForce?: boolean;
}

/** Something the layout could not set as asked and placed anyway — a box
 *  taller than any column it could go to. Hosts surface these as warnings;
 *  the geometry still describes what was painted. */
export interface LayoutWarning {
  /** `calloutOverflow`: a `:::callout` box that fits no column was placed
   *  overflowing its column (by `overflowPx`). */
  kind: 'calloutOverflow';
  pageIndex: number;
  columnIndex: number;
  /** Absolute source range of the offending construct in the markdown. */
  sourceStart?: number;
  sourceEnd?: number;
  /** How far past the column's free room the content reaches (px). */
  overflowPx: number;
}

export interface VDTDocument {
  pages: VDTPage[];
  blocks: VDTBlock[];
  /** Layout warnings raised while placing the content (see
   *  {@link LayoutWarning}); absent or empty when everything fit. */
  warnings?: LayoutWarning[];
  config: ResolvedConfig;
  baselineGrid: number;
  /** Pixel offset from canvas edge to trim edge (0 when cutLines disabled) */
  trimOffset: number;
  converged: boolean;
  iterationCount: number;
  metadata: DocumentMetadata;
  /** Physical pages before page 0 (`PostextContent.continuation`): shifts
   *  parity everywhere. Absent or 0 for a self-contained document. */
  pageIndexOffset?: number;
  /** Indices of the pages where a `:::numbering{startAt=…}` directive
   *  restarts the page count, ascending. The pages before the first one
   *  continue the inherited numbering (`continuation.pageNumbering` or
   *  `page.pageNumbering`); a host laying out a book chapter by chapter
   *  tells the two apart when the pages before the chapter shift. Absent
   *  when the count never restarts. */
  pageNumberRestarts?: number[];
  /** Chapters (level-1 headings) before this document, so `{chapterNumber}`
   *  keeps counting without a numbering template. */
  chapterOrdinalOffset?: number;
  /** The part in effect before this document's first page (from
   *  `continuation.part`): `{partTitle}` / `{partNumber}` and the part's
   *  palette overrides apply from page 0 until the document opens a part. */
  partStart?: PartState;
}

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

export function createBoundingBox(
  x: number,
  y: number,
  width: number,
  height: number,
): BoundingBox {
  return { x, y, width, height };
}

export function createVDTDocument(
  config: ResolvedConfig,
  baselineGrid: number,
): VDTDocument {
  return {
    pages: [],
    blocks: [],
    config,
    baselineGrid,
    trimOffset: 0,
    converged: false,
    iterationCount: 0,
    metadata: {},
  };
}

export function createVDTPage(
  index: number,
  width: number,
  height: number,
  contentArea?: BoundingBox,
): VDTPage {
  return {
    index,
    width,
    height,
    contentArea: contentArea ?? { x: 0, y: 0, width, height },
    columns: [],
    marginNotes: [],
    pageNumberValue: index + 1,
    pageLabel: String(index + 1),
    pageNumberFormat: 'decimal',
  };
}

export function createVDTColumn(
  index: number,
  bbox: BoundingBox,
): VDTColumn {
  return {
    index,
    bbox,
    blocks: [],
    availableHeight: bbox.height,
    baselineOffset: 0,
  };
}

export function createVDTBlock(
  id: string,
  type: VDTBlockType,
  fontString: string,
  color: string,
  textAlign: TextAlign = 'left',
): VDTBlock {
  return {
    id,
    type,
    bbox: { x: 0, y: 0, width: 0, height: 0 },
    lines: [],
    pageIndex: -1,
    columnIndex: -1,
    dirty: true,
    snappedToGrid: false,
    fontString,
    color,
    textAlign,
  };
}

/** Vertical extent actually covered by text on a page: from the top of the
 *  first text line to the bottom of the last, across all columns. Resource
 *  captions count as text — both on inline resource blocks and on floats —
 *  since bottom-band floats anchor their caption baseline to the grid and
 *  the grid should visibly reach it. Hidden blocks and design slots don't
 *  count. Returns `null` for pages with no text (e.g. blank parity pages).
 *  Used to bound debug decorations like the baseline grid. */
export function computePageTextExtent(page: VDTPage): { top: number; bottom: number } | null {
  let top = Infinity;
  let bottom = -Infinity;
  const expand = (lines: VDTLine[]): void => {
    for (const line of lines) {
      if (line.bbox.y < top) top = line.bbox.y;
      const lineBottom = line.bbox.y + line.bbox.height;
      if (lineBottom > bottom) bottom = lineBottom;
    }
  };
  for (const col of page.columns) {
    for (const block of col.blocks) {
      if (block.hidden) continue;
      expand(block.lines);
      if (block.resourceBlock) expand(block.resourceBlock.captionLines);
    }
  }
  for (const fb of page.floats ?? []) {
    if (fb.hidden) continue;
    expand(fb.lines);
    if (fb.resourceBlock) expand(fb.resourceBlock.captionLines);
  }
  return top === Infinity ? null : { top, bottom };
}
