import type {
  DocumentMetadata,
  PostextResource,
  ResolvedPageConfig,
  ResolvedLayoutConfig,
  ResolvedBodyTextConfig,
  ResolvedHeadingsConfig,
  ResolvedUnorderedListsConfig,
  ResolvedOrderedListsConfig,
  ResolvedMathConfig,
  ResolvedHeaderFooterSlot,
  HeaderFooterHAlign,
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
  unorderedLists: ResolvedUnorderedListsConfig;
  orderedLists: ResolvedOrderedListsConfig;
  math: ResolvedMathConfig;
  header: ResolvedHeaderFooterSlot;
  footer: ResolvedHeaderFooterSlot;
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

export interface VDTBlock {
  id: string;
  type: VDTBlockType;
  bbox: BoundingBox;
  lines: VDTLine[];
  resource?: PostextResource;
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

/** A rendered rule (horizontal separator) inside a header/footer slot. */
export interface VDTRuleBlock {
  kind: 'rule';
  bbox: BoundingBox;
  color: string;
  thicknessPx: number;
}

/** Text block rendered inside a header/footer slot. */
export interface VDTHeaderFooterTextBlock {
  kind: 'text';
  bbox: BoundingBox;
  text: string;
  align: HeaderFooterHAlign;
  fontString: string;
  color: string;
  baseline: number;
}

export type VDTHeaderFooterBlock = VDTHeaderFooterTextBlock | VDTRuleBlock;

export interface VDTHeaderFooterSlot {
  bbox: BoundingBox;
  blocks: VDTHeaderFooterBlock[];
}

export interface VDTPage {
  index: number;
  width: number;
  height: number;
  columns: VDTColumn[];
  header?: VDTHeaderFooterSlot;
  footer?: VDTHeaderFooterSlot;
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
