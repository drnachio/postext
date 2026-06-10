import type {
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
  ResolvedCaptionStyleConfig,
  ResolvedUnorderedListsConfig,
  ResolvedOrderedListsConfig,
  ResolvedMathConfig,
  ResolvedDesignSlot,
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
  unorderedLists: ResolvedUnorderedListsConfig;
  orderedLists: ResolvedOrderedListsConfig;
  math: ResolvedMathConfig;
  header: ResolvedDesignSlot;
  footer: ResolvedDesignSlot;
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
  | 'mathDisplay';

export type TextAlign = 'left' | 'justify' | 'center';

export interface VDTLineSegment {
  kind: 'text' | 'space' | 'math';
  text: string;
  width: number;
  bold?: boolean;
  italic?: boolean;
  /** Present when `kind === 'math'`. The rendered formula. */
  mathRender?: MathRender;
  /** Present when this segment renders an inline `:ref{…}` to a resource.
   *  Renderers recolour it (link colour) and the PDF backend emits a link
   *  annotation to the resource's named destination. */
  refResourceId?: string;
  /** True when this segment is part of a caption's numbered label, so renderers
   *  paint it in the configured caption-label colour. */
  captionLabel?: boolean;
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
}

/** The resolved, measured content of a resource block. */
export interface ResolvedResourceBlock {
  /** The source resource. */
  resource: Resource;
  kind: 'bitmap' | 'svg' | 'table';
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
}

export interface VDTColumn {
  index: number;
  bbox: BoundingBox;
  blocks: VDTBlock[];
  availableHeight: number;
  baselineOffset: number;
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

export type VDTDesignBlock = VDTDesignTextBlock | VDTDesignRuleBlock | VDTDesignBoxBlock;

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
  columns: VDTColumn[];
  header?: VDTDesignSlot;
  footer?: VDTDesignSlot;
  /** Optional full-width opener band above the column flow, used for
   *  heading-level `span: 'page'` chapter openers. */
  openerBand?: VDTDesignSlot;
  /** Floated resource blocks (figures / tables) reserved into a band at the
   *  top or bottom of this page. They live outside the column flow — their
   *  bands shrink the columns' usable height — and are rendered after the
   *  columns, clipped to the content area rather than to a single column so a
   *  `span: 'page'` float can cross the gutter. */
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

export interface VDTDocument {
  pages: VDTPage[];
  blocks: VDTBlock[];
  config: ResolvedConfig;
  baselineGrid: number;
  /** Pixel offset from canvas edge to trim edge (0 when cutLines disabled) */
  trimOffset: number;
  converged: boolean;
  iterationCount: number;
  metadata: DocumentMetadata;
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
): VDTPage {
  return {
    index,
    width,
    height,
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
    if (fb.resourceBlock) expand(fb.resourceBlock.captionLines);
  }
  return top === Infinity ? null : { top, bottom };
}
