/** @deprecated Legacy content-model resource used by the VDT renderer
 *  (`VDTBlock.resource`). The Resources-panel feature uses the newer
 *  `Resource` / `ResourceType` model below. Retained until the renderer
 *  migrates off it. */
export interface PostextResource {
  id: string;
  type: 'image' | 'table' | 'figure' | 'pullQuote';
  src?: string;
  alt?: string;
  caption?: string;
  content?: string;
  width?: number;
  height?: number;
}

// ---------------------------------------------------------------------------
// Resources model (issue #49) — user-managed, typed, numbered resources
// (images, SVGs, HTML tables) that can be referenced inline.
// ---------------------------------------------------------------------------

/** How a counter renders for a given resource type. */
export type ResourceCounterFormat =
  | 'decimal'
  | 'roman-lower'
  | 'roman-upper'
  | 'alpha-lower'
  | 'alpha-upper';

/** When the per-type counter resets back to its starting value. `'never'`
 *  yields a single document-wide running count; `'h1'..'h6'` resets the
 *  counter whenever a heading of that level is encountered. */
export type ResourceCounterReset = 'never' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

/** Where a resource floats on the page. `'auto'` (the default) detaches the
 *  resource from the running text and lands it in the first free slot after
 *  its first reference — the bottom of the referencing column, the top or
 *  bottom of the next empty column on the same page, then the bands of the
 *  next page. `'top'` / `'bottom'` restrict the search to top or bottom
 *  slots. `'here'` opts out of floating and embeds the resource inline at
 *  the exact `::resource` directive position. */
export type ResourceFloatPosition = 'auto' | 'top' | 'bottom' | 'here';

/** How wide a floated resource is. `'column'` keeps it within a single column;
 *  `'page'` spans the full content width across all columns (a full-width
 *  float that breaks the column flow). In a single-column layout the two are
 *  equivalent. */
export type ResourceFloatSpan = 'column' | 'page';

/** Placement of a resource on the page. Resolved per resource, falling back to
 *  its {@link ResourceType.defaultPlacement} and then the built-in default
 *  (`auto` / `column`). See {@link resolveResourcePlacement}. */
export interface ResourcePlacement {
  position?: ResourceFloatPosition;
  span?: ResourceFloatSpan;
}

/** A user-definable category of resource (e.g. "Figure", "Table"). Drives
 *  numbering, caption prefixes, and inline-reference labels. */
export interface ResourceType {
  /** Stable identifier, referenced by `Resource.typeId`. */
  id: string;
  /** Display name, singular (e.g. "Figure"). */
  name: string;
  /** Optional plural display name (e.g. "Figures"). */
  namePlural?: string;
  /** Compact label used in inline references (e.g. "Fig."). */
  shortLabel: string;
  /** Template for the computed number. Placeholders: `{n}` (the counter),
   *  `{h1}`..`{h6}` (current heading numbers). E.g. `'{h1}.{n}'`. */
  numberingTemplate: string;
  /** When the counter resets. */
  resetOn: ResourceCounterReset;
  /** How the `{n}` counter is formatted. */
  counterFormat: ResourceCounterFormat;
  /** Prefix prepended to the caption (e.g. "Figure"). The computed number
   *  follows this prefix. */
  captionPrefix: string;
  /** Default placement for resources of this type, used when a resource does
   *  not specify its own `placement`. Falls back to `top` / `column`. */
  defaultPlacement?: ResourcePlacement;
  /** Optional partial caption-style override for resources of this type.
   *  Only the keys set here replace the resolved global `captionStyle`; the
   *  rest is inherited (see `mergeCaptionStyle`). */
  captionStyle?: CaptionStyleConfig;
}

/** The concrete payload kind a `Resource` carries. */
export type ResourceKind = 'bitmap' | 'svg' | 'table';

/** Horizontal alignment of a table cell's content. */
export type TableCellAlign = 'left' | 'center' | 'right';

/** Vertical alignment of a table cell's content. */
export type TableCellVerticalAlign = 'top' | 'middle' | 'bottom';

/** Position of a cell within a {@link TableModel} grid (zero-based). */
export interface TableCellPos {
  row: number;
  col: number;
}

export interface TableCell {
  /** Cell content (plain text / inline markdown). */
  content: string;
  /** Number of columns this cell spans. Default 1. */
  colSpan?: number;
  /** Number of rows this cell spans. Default 1. */
  rowSpan?: number;
  /** When true, render as a header cell (`<th>`). */
  isHeader?: boolean;
  align?: TableCellAlign;
  verticalAlign?: TableCellVerticalAlign;
  /** When set, this cell is covered by a merge whose primary (top-left) cell
   *  is at the referenced position. Hidden cells are skipped during rendering
   *  and restored on unmerge. */
  hiddenBy?: TableCellPos;
}

export interface TableModel {
  /** Row-major grid of cells. */
  rows: TableCell[][];
  /** Number of leading rows that form the table header. Default 0. */
  headerRowCount?: number;
  /** Relative column weights (one per column), normalised at layout time —
   *  `[2, 1, 1]` gives the first column half the width. Unset, a wrong
   *  length, or any non-positive weight falls back to an equal split. */
  columnWidths?: number[];
}

/** A user-managed resource instance. Binary payloads (bitmaps, SVGs) are
 *  stored out-of-band (IndexedDB in the sandbox) and referenced by
 *  `fileId`; table resources carry their model inline. */
export interface Resource {
  /** Stable identifier, referenced by inline `ref`s. */
  id: string;
  /** The `ResourceType.id` this resource belongs to. */
  typeId: string;
  kind: ResourceKind;
  /** Optional caption text (the type prefix + number are computed). */
  caption?: string;
  /** Optional note (source line, credits, footnote-like remark) set in a
   *  smaller run under the resource. Accepts the same inline formatting and
   *  `:ref` marks as the caption. Styled by `captionStyle.note`. */
  note?: string;
  /** Accessibility alt text. */
  altText?: string;
  /** Creation timestamp (ms since epoch). */
  createdAt: number;
  /** Last-modified timestamp (ms since epoch). */
  updatedAt: number;
  /** Present when `kind === 'bitmap'`. */
  bitmap?: {
    fileId: string;
    format: string;
    width: number;
    height: number;
  };
  /** Present when `kind === 'svg'`. */
  svg?: {
    fileId: string;
    /** Intrinsic width in px (from the SVG's `width`/`height` or `viewBox`),
     *  used to preserve aspect ratio on layout. Absent for SVGs with no
     *  declared size. */
    width?: number;
    /** Intrinsic height in px; see `width`. */
    height?: number;
  };
  /** Present when `kind === 'table'`. */
  table?: {
    model: TableModel;
  };
  /** Optional per-resource placement override. When unset, the resource's
   *  type default (then `top` / `column`) applies. A `position` of `'top'` or
   *  `'bottom'` floats the resource to a band on the page near its first
   *  reference; `'here'` embeds it inline at its `::resource` directive. */
  placement?: ResourcePlacement;
}

export interface PostextNote {
  id: string;
  type: 'footnote' | 'endnote' | 'marginNote';
  content: string;
  marker?: string;
}

export interface DocumentMetadata {
  title?: string;
  subtitle?: string;
  author?: string;
  publishDate?: string;
  [key: string]: unknown;
}

export interface PostextContent {
  markdown: string;
  metadata?: DocumentMetadata;
  /** User-managed resources (issue #49) embedded via `::resource{id=…}` and
   *  referenced inline via `:ref{id=…}`. Binary payloads (bitmaps, SVGs) are
   *  resolved out-of-band by the renderer; table resources carry their model
   *  inline. */
  resources?: Resource[];
  notes?: PostextNote[];
}

export type PlacementStrategy =
  | 'topOfColumn'
  | 'inline'
  | 'floatLeft'
  | 'floatRight'
  | 'fullWidthBreak'
  | 'margin';

export interface ColumnConfig {
  count?: number;
  gutter?: string;
  columnRule?: {
    width?: string;
    style?: string;
    color?: string;
  };
  balancing?: boolean;
}

export interface ResourcePlacementConfig {
  defaultStrategy?: PlacementStrategy;
  deferPlacement?: boolean;
  preserveAspectRatio?: boolean;
}

export interface TypographyConfig {
  orphans?: number;
  widows?: number;
  hyphenation?: boolean;
  ragOptimization?: boolean;
  spacing?: {
    beforeHeading?: string;
    afterHeading?: string;
    beforeFigure?: string;
    afterFigure?: string;
    beforeBlockQuote?: string;
    afterBlockQuote?: string;
  };
  keepTogether?: {
    headingWithParagraph?: boolean;
    figureWithCaption?: boolean;
  };
}

export interface ReferenceConfig {
  footnotes?: {
    placement?: 'columnBottom' | 'pageBottom' | 'endOfSection';
    marker?: 'number' | 'symbol' | 'custom';
  };
  figureNumbering?: boolean;
  tableNumbering?: boolean;
  marginNotes?: boolean;
}

export type ColorModel = 'hex' | 'rgb' | 'cmyk' | 'hsl';

export interface ColorValue {
  hex: string;
  model: ColorModel;
  paletteId?: string;
}

export interface ColorPaletteEntry {
  id: string;
  name: string;
  value: ColorValue;
}

export type DimensionUnit = 'cm' | 'mm' | 'in' | 'pt' | 'px' | 'em' | 'rem';

export interface Dimension {
  value: number;
  unit: DimensionUnit;
}

export type PageSizePreset = '11x17' | '12x19' | '17x24' | '21x28' | 'custom';

export interface PageMargins {
  top?: Dimension;
  bottom?: Dimension;
  /** Inner (spine-side) margin when `mirror` is on; left margin otherwise. */
  left?: Dimension;
  /** Outer margin when `mirror` is on; right margin otherwise. */
  right?: Dimension;
  /** Mirrored (facing-page) margins: `left` is the inner margin and `right`
   *  the outer one. Odd pages (page 1 = odd) keep them as written; even
   *  pages swap them so the inner margin always faces the spine. Default
   *  `false`. */
  mirror?: boolean;
}

export interface BaselineGridConfig {
  enabled: boolean;
  color?: ColorValue;
  lineWidth?: Dimension;
}

export interface CutLinesConfig {
  enabled: boolean;
  bleed?: Dimension;
  markLength?: Dimension;
  markOffset?: Dimension;
  markWidth?: Dimension;
  color?: ColorValue;
}

export type PageNumberFormat =
  | 'decimal'
  | 'lower-roman'
  | 'upper-roman'
  | 'lower-alpha'
  | 'upper-alpha';

export interface PageNumberingConfig {
  /** Format for page labels. Default: `'decimal'`. */
  format?: PageNumberFormat;
  /** Numeric starting value assigned to the first page of the document,
   *  regardless of format. `format: 'lower-roman', startAt: 1` yields
   *  `i, ii, iii, ...`. Default: 1. */
  startAt?: number;
}

export interface ResolvedPageNumberingConfig {
  format: PageNumberFormat;
  startAt: number;
}

export interface PageConfig {
  backgroundColor?: ColorValue;
  sizePreset?: PageSizePreset;
  width?: Dimension;
  height?: Dimension;
  margins?: PageMargins;
  dpi?: number;
  cutLines?: CutLinesConfig;
  baselineGrid?: BaselineGridConfig;
  pageNumbering?: PageNumberingConfig;
}

export interface ResolvedPageConfig {
  backgroundColor: ColorValue;
  sizePreset: PageSizePreset;
  width: Dimension;
  height: Dimension;
  margins: Required<PageMargins>;
  dpi: number;
  cutLines: { enabled: boolean; bleed: Dimension; markLength: Dimension; markOffset: Dimension; markWidth: Dimension; color: ColorValue };
  baselineGrid: { enabled: boolean; color: ColorValue; lineWidth: Dimension };
  pageNumbering: ResolvedPageNumberingConfig;
}

export type LayoutType = 'single' | 'double' | 'oneAndHalf';

export interface ColumnRuleConfig {
  enabled?: boolean;
  color?: ColorValue;
  lineWidth?: Dimension;
}

export interface LayoutConfig {
  layoutType?: LayoutType;
  gutterWidth?: Dimension;
  sideColumnPercent?: number;
  columnRule?: ColumnRuleConfig;
}

export interface ResolvedLayoutConfig {
  layoutType: LayoutType;
  gutterWidth: Dimension;
  sideColumnPercent: number;
  columnRule: { enabled: boolean; color: ColorValue; lineWidth: Dimension };
}

export type TextAlign = 'left' | 'justify' | 'center';

export type HyphenationLocale =
  | 'en-us'
  | 'es'
  | 'fr'
  | 'de'
  | 'it'
  | 'pt'
  | 'ca'
  | 'nl';

export interface HyphenationConfig {
  enabled?: boolean;
  locale?: HyphenationLocale;
}

export interface ResolvedHyphenationConfig {
  enabled: boolean;
  locale: HyphenationLocale;
}

export interface BodyTextConfig {
  fontFamily?: string;
  fontSize?: Dimension;
  lineHeight?: Dimension;
  paragraphSpacing?: boolean;
  color?: ColorValue;
  boldColor?: ColorValue;
  italicColor?: ColorValue;
  /** Colour of inline `:ref` reference labels (e.g. "Fig. 1.7"). Defaults to
   *  {@link boldColor} (the emphasis colour). */
  referenceColor?: ColorValue;
  /** Whether reference labels are rendered in the bold font. Default `true`. */
  referenceBold?: boolean;
  /** Whether reference labels are rendered italic. Default `false`. */
  referenceItalic?: boolean;
  textAlign?: TextAlign;
  fontWeight?: number;
  boldFontWeight?: number;
  hyphenation?: HyphenationConfig;
  firstLineIndent?: Dimension;
  hangingIndent?: boolean;
  /** When `false`, the first paragraph immediately following a heading is
   *  rendered without first-line indent. A common typographic convention in
   *  scientific publications and many book styles ("indent run-in" style).
   *  Default `true` — every paragraph receives the indent. */
  indentAfterHeading?: boolean;
  /** Max word-spacing when justifying, as a multiplier of the normal space width.
   *  Lines that would exceed this trigger extra hyphenation/reflow attempts. */
  maxWordSpacing?: number;
  /** Min word-spacing when justifying, as a multiplier of the normal space width. */
  minWordSpacing?: number;
  /** Use Knuth-Plass optimal line breaking instead of greedy first-fit. Default true. */
  optimalLineBreaking?: boolean;
  /** When true, discourage a paragraph from ending with fewer than `orphanMinLines`
   *  lines at the top of the next column. Soft (penalty-based). Default true. */
  avoidOrphans?: boolean;
  /** Minimum lines required at the top of the next column when a paragraph is split.
   *  Only effective when `avoidOrphans` is true. Default 2. */
  orphanMinLines?: number;
  /** Demerit added when an orphan constraint is violated. Higher = stronger
   *  avoidance. 0 effectively disables the penalty. Default 1000 — chosen so
   *  orphan avoidance normally wins over slack (slackWeight·slack²) unless
   *  pushing the paragraph would leave ≳10 lines of whitespace. */
  orphanPenalty?: number;
  /** When true, list items also receive orphan protection (not just paragraphs).
   *  Only effective when `avoidOrphans` is true. Default true. */
  avoidOrphansInLists?: boolean;
  /** When true, discourage a paragraph from starting with fewer than `widowMinLines`
   *  lines at the bottom of the current column. Soft (penalty-based). Default true. */
  avoidWidows?: boolean;
  /** Minimum lines required at the bottom of the current column when a paragraph is
   *  split. Only effective when `avoidWidows` is true. Default 2. */
  widowMinLines?: number;
  /** Demerit added when a widow constraint is violated. Default 1000 (same
   *  scale as `orphanPenalty`). */
  widowPenalty?: number;
  /** When true, list items also receive widow protection (not just paragraphs).
   *  Only effective when `avoidWidows` is true. Default true. */
  avoidWidowsInLists?: boolean;
  /** Weight applied to the squared "unused column space" cost. Higher values make
   *  the layout prefer filling columns tightly; 0 disables the slack pressure.
   *  Default 10. */
  slackWeight?: number;
  /** When true, discourage paragraphs from ending with a very short last line
   *  (a "runt" — e.g. a single short word alone). Soft (Knuth-Plass penalty).
   *  Default true. */
  avoidRunts?: boolean;
  /** Approximate minimum character count for the last line of a paragraph.
   *  Interpreted internally as `runtMinCharacters * normalSpaceWidth` pixels, so
   *  the real test is "is the last line visually shorter than N characters'
   *  worth of space-width content". Default 5. */
  runtMinCharacters?: number;
  /** Equivalent-badness added to the last line when it is shorter than the
   *  runt threshold. Feeds into the Knuth–Plass squared demerit on the same
   *  scale as line `badness` (which saturates at 10000). Default 1000 —
   *  dominates alternatives up to roughly r≈2.15 word-spacing stretch. */
  runtPenalty?: number;
  /** When true, list items also receive the runt penalty (not just paragraphs).
   *  Only effective when `avoidRunts` is true. Default true. */
  avoidRuntsInLists?: boolean;
  /** When true, a paragraph ending with a colon that directly introduces a
   *  list is kept joined to the list: if placing the paragraph would leave no
   *  room for the first list item in the same column/page, the colon-bearing
   *  last line is moved to the next column together with the list (or the
   *  whole paragraph, if it is a single line). Default true. */
  keepColonWithList?: boolean;
}

export interface ResolvedBodyTextConfig {
  fontFamily: string;
  fontSize: Dimension;
  lineHeight: Dimension;
  paragraphSpacing: boolean;
  color: ColorValue;
  boldColor?: ColorValue;
  italicColor?: ColorValue;
  /** Resolved colour for inline `:ref` labels (defaults to the bold colour). */
  referenceColor: ColorValue;
  /** Whether reference labels use the bold font. */
  referenceBold: boolean;
  /** Whether reference labels are italic. */
  referenceItalic: boolean;
  textAlign: TextAlign;
  fontWeight: number;
  boldFontWeight: number;
  hyphenation: ResolvedHyphenationConfig;
  firstLineIndent: Dimension;
  hangingIndent: boolean;
  indentAfterHeading: boolean;
  maxWordSpacing: number;
  minWordSpacing: number;
  optimalLineBreaking: boolean;
  avoidOrphans: boolean;
  orphanMinLines: number;
  orphanPenalty: number;
  avoidOrphansInLists: boolean;
  avoidWidows: boolean;
  widowMinLines: number;
  widowPenalty: number;
  avoidWidowsInLists: boolean;
  slackWeight: number;
  avoidRunts: boolean;
  runtMinCharacters: number;
  runtPenalty: number;
  avoidRuntsInLists: boolean;
  keepColonWithList: boolean;
}

// ---------------------------------------------------------------------------
// Table & caption styling (resource figures/tables)
// ---------------------------------------------------------------------------

/** User-facing styling for embedded `kind: 'table'` resources. Every field is
 *  optional; unset fields inherit body-text defaults (font family, size,
 *  colour) so a document with no table config looks the same as before this
 *  config existed. See {@link ResolvedTableStyleConfig}. */
export interface TableStyleConfig {
  /** Body-cell font family. Defaults to the body-text family. */
  bodyFontFamily?: string;
  /** Body-cell font size. Defaults to the body-text size. */
  bodyFontSize?: Dimension;
  /** Body-cell text colour. Defaults to the body-text colour. */
  bodyColor?: ColorValue;
  /** Header-cell font family. Defaults to the body-text family. */
  headerFontFamily?: string;
  /** Header-cell font size. Defaults to the body-text size. */
  headerFontSize?: Dimension;
  /** Header-cell text colour. Defaults to the body-text colour. */
  headerColor?: ColorValue;
  /** Render header cells bold. Default `true`. */
  headerBold?: boolean;
  /** Render header cells italic. Default `false`. */
  headerItalic?: boolean;
  /** Fill header cells with {@link headerBackground}. Default `true`. */
  headerBackgroundEnabled?: boolean;
  /** Header-cell fill colour. Default light grey. */
  headerBackground?: ColorValue;
  /** Fill body cells with {@link bodyBackground}. Default `false`. */
  bodyBackgroundEnabled?: boolean;
  /** Body-cell fill colour. Default white. */
  bodyBackground?: ColorValue;
  /** Draw cell borders. Default `true`. */
  borders?: boolean;
  /** Border colour. Defaults to the body-text colour. */
  borderColor?: ColorValue;
  /** Border thickness. Default `0.75pt` (≈1px at 96dpi). */
  borderWidth?: Dimension;
  /** Inner padding inside each cell. Default `0.375em`. */
  cellPadding?: Dimension;
  /** Which rules to stroke when {@link borders} is on. Default `'grid'`. */
  rules?: TableRules;
}

/** Rule pattern of a table: the full cell grid, horizontal rules only (top
 *  and bottom edge of every row), the outer frame only, or none. */
export type TableRules = 'grid' | 'horizontal' | 'outer' | 'none';

export interface ResolvedTableStyleConfig {
  bodyFontFamily: string;
  bodyFontSize: Dimension;
  bodyColor: ColorValue;
  headerFontFamily: string;
  headerFontSize: Dimension;
  headerColor: ColorValue;
  headerBold: boolean;
  headerItalic: boolean;
  headerBackgroundEnabled: boolean;
  headerBackground: ColorValue;
  bodyBackgroundEnabled: boolean;
  bodyBackground: ColorValue;
  borders: boolean;
  borderColor: ColorValue;
  borderWidth: Dimension;
  cellPadding: Dimension;
  rules: TableRules;
}

/** Where a resource caption sits relative to the figure body. */
export type CaptionPosition = 'above' | 'below';

/** Styling of the optional resource note (`Resource.note`) — a smaller run
 *  set under the resource (source line, credits). Inherits the caption
 *  typeface; every field is optional. */
export interface CaptionNoteStyleConfig {
  /** Note font size. Default 0.85 × the caption size. */
  fontSize?: Dimension;
  /** Note text colour. Defaults to the caption {@link CaptionStyleConfig.color}. */
  color?: ColorValue;
  /** Render the note italic. Default `false`. */
  italic?: boolean;
  /** Gap between the note and what precedes it (body or caption). Default `0.35em`. */
  gap?: Dimension;
  /** Horizontal alignment of the note. Default `'left'`. */
  align?: TextAlign;
}

export interface ResolvedCaptionNoteStyleConfig {
  fontSize: Dimension;
  color: ColorValue;
  italic: boolean;
  gap: Dimension;
  align: TextAlign;
}

/** User-facing styling for resource captions (the numbered label such as
 *  "Figure 1." plus the description text). The label and description share one
 *  typeface and size (the caption is measured as a single wrapped run); they
 *  differ in weight, slant, and colour. Every field is optional and inherits
 *  body-text defaults. See {@link ResolvedCaptionStyleConfig}. */
export interface CaptionStyleConfig {
  /** Caption font family (label + description). Defaults to the body family. */
  fontFamily?: string;
  /** Caption font size (label + description). Defaults to the body size. */
  fontSize?: Dimension;
  /** Description text colour. Defaults to the body-text colour. */
  color?: ColorValue;
  /** Horizontal alignment of caption text. Default `'left'`. */
  align?: TextAlign;
  /** Gap between the figure body and the caption. Default `0.75em`. */
  gap?: Dimension;
  /** Render the numbered label bold. Default `true`. */
  labelBold?: boolean;
  /** Render the numbered label italic. Default `false`. */
  labelItalic?: boolean;
  /** Numbered-label colour. Defaults to {@link color}. */
  labelColor?: ColorValue;
  /** Render the description italic. Default `false`. */
  descriptionItalic?: boolean;
  /** Caption placement: under the figure body (`'below'`, default) or on top
   *  of it (`'above'`), as a table heading. */
  position?: CaptionPosition;
  /** Paint a bar behind the caption spanning the block width. Default `false`. */
  backgroundEnabled?: boolean;
  /** Bar colour. Defaults to the document's main palette colour. */
  background?: ColorValue;
  /** Inner padding between the bar edge and the caption text. Default `0.35em`. */
  padding?: Dimension;
  /** Styling of the optional resource note (`Resource.note`). */
  note?: CaptionNoteStyleConfig;
}

export interface ResolvedCaptionStyleConfig {
  fontFamily: string;
  fontSize: Dimension;
  color: ColorValue;
  align: TextAlign;
  gap: Dimension;
  labelBold: boolean;
  labelItalic: boolean;
  labelColor: ColorValue;
  descriptionItalic: boolean;
  position: CaptionPosition;
  backgroundEnabled: boolean;
  background: ColorValue;
  padding: Dimension;
  note: ResolvedCaptionNoteStyleConfig;
}

/** Styling for embedded SVG diagrams (`kind: 'svg'` resources). When
 *  {@link singleInk} is on, every colour in the SVG is remapped to a tint of
 *  {@link inkColor} by luminance — light fills become light tints, dark
 *  strokes and text approach the full ink — so figures reproduce faithfully
 *  when a document is printed with a single spot colour. */
export interface DiagramStyleConfig {
  /** Recolour diagrams to tints of a single ink. Default `false`. */
  singleInk?: boolean;
  /** The ink. Defaults to the document's main palette colour. */
  inkColor?: ColorValue;
}

export interface ResolvedDiagramStyleConfig {
  singleInk: boolean;
  inkColor: ColorValue;
}

/** A named paragraph style, applied to the paragraphs inside a
 *  `:::paragraphs{style="<id>"}` container. Every typographic field is
 *  optional and inherits the body text when unset, so a style only needs to
 *  spell out what differs from running text. See
 *  {@link ResolvedParagraphStyleConfig}. */
export interface ParagraphStyleConfig {
  /** Identifier referenced from `:::paragraphs{style="…"}`. */
  id: string;
  /** Human-readable name (editor UI only). Defaults to {@link id}. */
  name?: string;
  /** Defaults to the body font family. */
  fontFamily?: string;
  /** Defaults to the body font size. */
  fontSize?: Dimension;
  /** Leading. `em`/`rem` are relative to the style's own font size.
   *  Defaults to the body line height. */
  lineHeight?: Dimension;
  /** Defaults to the body text colour. */
  color?: ColorValue;
  /** Defaults to the body alignment (`center` is not available here). */
  textAlign?: 'left' | 'justify';
  /** Hyphenate when justified. Defaults to the body hyphenation setting. */
  hyphenation?: boolean;
  /** Defaults to the body first-line indent. Ignored when
   *  {@link hangingIndent} is non-zero. */
  firstLineIndent?: Dimension;
  /** Indent applied to every line except the first (bibliographies,
   *  glossaries). Non-zero replaces {@link firstLineIndent}. Default `0`. */
  hangingIndent?: Dimension;
  /** Vertical gap between consecutive paragraphs in the container. Default
   *  `0` — entries abut, off the baseline grid until the container closes. */
  spaceBetween?: Dimension;
  /** Space above the container's first block. Default `0`. */
  marginTop?: Dimension;
  /** Minimum space below the container's last block; the flow snaps back
   *  to the baseline grid after it. Default `0`. */
  marginBottom?: Dimension;
}

export interface ResolvedParagraphStyleConfig {
  id: string;
  name: string;
  fontFamily: string;
  fontSize: Dimension;
  lineHeight: Dimension;
  color: ColorValue;
  textAlign: 'left' | 'justify';
  hyphenation: boolean;
  firstLineIndent: Dimension;
  hangingIndent: Dimension;
  spaceBetween: Dimension;
  marginTop: Dimension;
  marginBottom: Dimension;
}

// ---------------------------------------------------------------------------
// Callout styles — boxed content for `:::callout{type="…"}` containers.
// ---------------------------------------------------------------------------

/** Horizontal extent of a callout: its column, or the full content width. */
export type CalloutSpan = 'column' | 'page';
/** Where a callout lands: inline in the flow (`'here'`), floated to the
 *  top / bottom band of a page like a resource, or at fixed page coordinates
 *  (`'fixed'` — anchored through {@link CalloutFixedConfig}, out of the
 *  column flow; text columns it overlaps are shortened around it). */
export type CalloutPlacement = 'here' | 'top' | 'bottom' | 'fixed';

/** Position of a `placement: 'fixed'` callout on the page where it occurs in
 *  the flow. The anchor's `container` is the page content area (mirrored on
 *  even pages); `page` / `bleed` anchor to the trim / bleed frames. */
export interface CalloutFixedConfig {
  /** Default `{ to: 'container', edge: 'bottom-left' }`. Element-relative
   *  edges are not meaningful here and fall back to `top-left`. */
  anchor?: ElementAnchor;
  /** Offset from the anchored position. Default `0` / `0`. */
  offset?: { x?: Dimension; y?: Dimension };
}
/** `'fill'` spans the available width; `'auto'` shrink-wraps the title
 *  (badge use — children are ignored). */
export type CalloutWidth = 'fill' | 'auto';
export type CalloutStripeSide = 'left' | 'right' | 'top';
export type CalloutIconKind = 'none' | 'glyph' | 'resource';
export type CalloutIconAlign = 'top' | 'center';
export type CalloutTextTransform = 'none' | 'uppercase';

export interface CalloutBorderConfig {
  enabled?: boolean;
  color?: ColorValue;
  width?: Dimension;
}

export interface CalloutPaddingConfig {
  top?: Dimension;
  right?: Dimension;
  bottom?: Dimension;
  left?: Dimension;
}

/** Solid band along one edge of the box. A side stripe reduces the inner
 *  width; a top stripe reduces the inner height. */
export interface CalloutStripeConfig {
  enabled?: boolean;
  side?: CalloutStripeSide;
  width?: Dimension;
  color?: ColorValue;
}

/** Icon drawn beside the title/body: a text glyph or a resource image. When
 *  the style has a side stripe the icon is centred over the stripe;
 *  otherwise it reserves its own column (`size` + `titleStyle.gap`). */
export interface CalloutIconConfig {
  kind?: CalloutIconKind;
  /** Glyph text for `kind: 'glyph'` (e.g. `'!'`, `'✎'`). */
  glyph?: string;
  /** Resource id (bitmap / svg) for `kind: 'resource'`. */
  resourceId?: string;
  /** Glyph font family. Defaults to the headings font. */
  fontFamily?: string;
  fontWeight?: number;
  /** Icon box size (square). Default `1.5em` of the callout body size. */
  size?: Dimension;
  color?: ColorValue;
  align?: CalloutIconAlign;
}

export interface CalloutTitleStyleConfig {
  /** Defaults to the headings font family. */
  fontFamily?: string;
  /** Defaults to the body font size. */
  fontSize?: Dimension;
  fontWeight?: number;
  italic?: boolean;
  color?: ColorValue;
  textTransform?: CalloutTextTransform;
  /** Vertical gap between the title and the first child block (also the
   *  horizontal gap between the icon column and the content). */
  gap?: Dimension;
}

/** Body typography inside the callout. Every field inherits `bodyText`. */
export interface CalloutBodyStyleConfig {
  fontFamily?: string;
  fontSize?: Dimension;
  lineHeight?: Dimension;
  color?: ColorValue;
  textAlign?: 'left' | 'justify';
  hyphenation?: boolean;
  paragraphSpacing?: boolean;
  firstLineIndent?: Dimension;
}

/** List typography inside the callout. Every field inherits
 *  `unorderedLists` (`color`, `indent`, `gap`, `itemSpacing` also apply to
 *  ordered lists). */
export interface CalloutListStyleConfig {
  bulletChar?: string;
  color?: ColorValue;
  indent?: Dimension;
  gap?: Dimension;
  itemSpacing?: Dimension;
}

/** A named callout style, selected by `:::callout{type="<id>"}`. */
export interface CalloutStyleConfig {
  id: string;
  /** Human-readable name (editor UI only). Defaults to {@link id}. */
  name?: string;
  /** Default title text; empty / unset = no title. The fence `title`
   *  attribute overrides it per instance. */
  title?: string;
  /** Default `'column'`. Overridable per instance with the `span` attribute. */
  span?: CalloutSpan;
  /** Default `'here'`. Overridable per instance with the `placement` attribute. */
  placement?: CalloutPlacement;
  /** Anchor and offset used when the placement is `'fixed'`. */
  fixed?: CalloutFixedConfig;
  /** Pending floats (figures / tables referenced earlier) are placed before
   *  this box — in the current page's free slots or on pages opened ahead of
   *  it — so no float escapes past a chapter's closing box. Default `false`.
   *  Chapter openers, `:::part` and the end of the document always act as
   *  barriers. */
  floatBarrier?: boolean;
  /** Default `'fill'`. */
  width?: CalloutWidth;
  /** Default `true`. */
  backgroundEnabled?: boolean;
  /** Default `#f4f4f4`. */
  background?: ColorValue;
  /** Default off, `#cccccc`, `0.5pt`. */
  border?: CalloutBorderConfig;
  /** Default `0`. */
  borderRadius?: Dimension;
  /** Default `0.75em` on every side. */
  padding?: CalloutPaddingConfig;
  /** Default off, `left`, `1.5em`, main colour. */
  stripe?: CalloutStripeConfig;
  /** Default `kind: 'none'`. */
  icon?: CalloutIconConfig;
  titleStyle?: CalloutTitleStyleConfig;
  body?: CalloutBodyStyleConfig;
  lists?: CalloutListStyleConfig;
  /** Space above the box. Default `0.75em`. */
  marginTop?: Dimension;
  /** Minimum space below the box; the flow snaps back to the baseline grid
   *  after it. Default `0.75em`. */
  marginBottom?: Dimension;
  /** Always `true` in v1: callouts never split across columns or pages. */
  keepTogether?: boolean;
}

export interface ResolvedCalloutStyleConfig {
  id: string;
  name: string;
  title: string;
  span: CalloutSpan;
  placement: CalloutPlacement;
  fixed: { anchor: ElementAnchor; offset: { x: Dimension; y: Dimension } };
  floatBarrier: boolean;
  width: CalloutWidth;
  backgroundEnabled: boolean;
  background: ColorValue;
  border: { enabled: boolean; color: ColorValue; width: Dimension };
  borderRadius: Dimension;
  padding: { top: Dimension; right: Dimension; bottom: Dimension; left: Dimension };
  stripe: { enabled: boolean; side: CalloutStripeSide; width: Dimension; color: ColorValue };
  icon: {
    kind: CalloutIconKind;
    glyph: string;
    resourceId: string;
    fontFamily: string;
    fontWeight: number;
    size: Dimension;
    color: ColorValue;
    align: CalloutIconAlign;
  };
  titleStyle: {
    fontFamily: string;
    fontSize: Dimension;
    fontWeight: number;
    italic: boolean;
    color: ColorValue;
    textTransform: CalloutTextTransform;
    gap: Dimension;
  };
  body: {
    fontFamily: string;
    fontSize: Dimension;
    lineHeight: Dimension;
    color: ColorValue;
    textAlign: 'left' | 'justify';
    hyphenation: boolean;
    paragraphSpacing: boolean;
    firstLineIndent: Dimension;
  };
  lists: {
    bulletChar: string;
    color: ColorValue;
    indent: Dimension;
    gap: Dimension;
    itemSpacing: Dimension;
  };
  marginTop: Dimension;
  marginBottom: Dimension;
  keepTogether: boolean;
}

/** Parity constraint for a forced page break.
 *
 *  - `'any'` — no constraint; the break just opens a new page.
 *  - `'odd'` / `'even'` — ensure the new page falls on the requested
 *    side of the spread. If the natural next page already matches, no
 *    blank is inserted; otherwise one blank page is inserted.
 *  - `'always-odd'` / `'always-even'` — guarantee at least one blank
 *    page between the previous content and the new page, then enforce
 *    parity. The leading blank is attributed to the *previous* chapter;
 *    any subsequent parity-padding blanks belong to the *new* chapter.
 *    Useful for books where every chapter must start a fresh spread. */
export type HeadingBreakParity = 'any' | 'odd' | 'even' | 'always-odd' | 'always-even';

export interface HeadingBreakBeforeConfig {
  /** When true, force a page break before every heading of this level. */
  enabled?: boolean;
  /** Optional parity constraint on the page the heading opens on.
   *  `'odd'` / `'even'` inserts a blank padding page when needed. Default:
   *  `'any'`. */
  parity?: HeadingBreakParity;
}

export interface ResolvedHeadingBreakBeforeConfig {
  enabled: boolean;
  parity: HeadingBreakParity;
}

/** Whether a heading occupies the single column it sits in, or spans the
 *  full page content width. `'page'` only takes effect on headings that
 *  start a new page (via `breakBefore.enabled`). */
export type HeadingSpan = 'column' | 'page';

/** Advanced design configuration for a heading level. When `enabled: true`
 *  the heading is rendered from `slot` and the inline typography fields
 *  (`fontFamily`, `fontSize`, `fontWeight`, `color`, `italic`,
 *  `numberingTemplate`-as-prefix) on `HeadingLevelConfig` are ignored. The
 *  heading's own text is carried via the `{titleText}` placeholder. */
export interface HeadingAdvancedDesignConfig {
  enabled: boolean;
  slot: DesignSlot;
  /** Minimum height reserved for the heading in the column flow. The
   *  reserved height is `max(design content bottom, minHeight)`, so an
   *  opener can push body text down even when its elements are short (or
   *  anchored to the page/bleed frames above the heading). */
  minHeight?: Dimension;
}

export interface ResolvedHeadingAdvancedDesignConfig {
  enabled: boolean;
  slot: ResolvedDesignSlot;
  minHeight?: Dimension;
}

export interface HeadingLevelConfig {
  level: number;
  fontSize?: Dimension;
  lineHeight?: Dimension;
  fontFamily?: string;
  color?: ColorValue;
  fontWeight?: number;
  marginTop?: Dimension;
  marginBottom?: Dimension;
  numberingTemplate?: string;
  italic?: boolean;
  breakBefore?: HeadingBreakBeforeConfig;
  /** Column vs full-page span. Default `'column'`. */
  span?: HeadingSpan;
  /** When enabled, the heading renders as a design slot. */
  advancedDesign?: HeadingAdvancedDesignConfig;
  /** Letter-case transform applied to the heading title (after any
   *  numbering prefix, which is kept as written). Length-preserving so the
   *  editor's source map stays 1:1 — characters whose upper-case form
   *  expands (`ß` → `SS`) are left unchanged. Default `'none'`. */
  textTransform?: HeadingTextTransform;
}

export type HeadingTextTransform = 'none' | 'uppercase';

export interface ResolvedHeadingLevelConfig {
  level: number;
  fontSize: Dimension;
  lineHeight: Dimension;
  fontFamily: string;
  color: ColorValue;
  fontWeight: number;
  marginTop: Dimension;
  marginBottom: Dimension;
  numberingTemplate: string;
  italic: boolean;
  breakBefore: ResolvedHeadingBreakBeforeConfig;
  span: HeadingSpan;
  advancedDesign: ResolvedHeadingAdvancedDesignConfig;
  textTransform: HeadingTextTransform;
}

export interface HeadingsConfig {
  fontFamily?: string;
  lineHeight?: Dimension;
  color?: ColorValue;
  textAlign?: TextAlign;
  fontWeight?: number;
  marginTop?: Dimension;
  marginBottom?: Dimension;
  /** When true, a heading is never placed as the last element of a column/page.
   *  If the following block would not have at least one line of room after the
   *  heading, the heading is pushed to the next column/page so it stays joined
   *  to its text. Default true. */
  keepWithNext?: boolean;
  /** Vertical column balancing — editorial bottom alignment. When a column
   *  ends short of its bottom, extra baseline-grid lines are added above the
   *  column's headings so every column ends flush with the page bottom.
   *  Extra lines are distributed across the column's headings, favouring the
   *  most important (lowest-level) heading. Default enabled. */
  balancing?: ColumnBalancingConfig;
  levels?: HeadingLevelConfig[];
}

export interface ColumnBalancingConfig {
  enabled?: boolean;
  /** Maximum extra grid lines that may be added above a single heading. */
  maxLinesPerHeading?: number;
  /** Allow extra grid lines where a list/enumeration ends, when the column's
   *  headings cannot absorb the whole gap. Default true. */
  stretchAfterLists?: boolean;
  /** Maximum extra grid lines after a single list end. Default 1. */
  maxLinesAfterList?: number;
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
  /** Balance the closing band of a chapter / the document: when the flow
   *  ends before the page is full and its columns are uneven, they are cut
   *  level (via a band cap) so the last columns end at the same height, the
   *  way a compositor sets a short closing page. Default true. */
  trailing?: boolean;
}

export interface ResolvedHeadingsConfig {
  fontFamily: string;
  lineHeight: Dimension;
  color: ColorValue;
  textAlign: TextAlign;
  fontWeight: number;
  marginTop: Dimension;
  marginBottom: Dimension;
  keepWithNext: boolean;
  balancing: {
    enabled: boolean;
    maxLinesPerHeading: number;
    stretchAfterLists: boolean;
    maxLinesAfterList: number;
    looseParagraphs: boolean;
    maxLooseParagraphs: number;
    trackParagraphs: boolean;
    maxTracking: number;
    trailing: boolean;
  };
  levels: ResolvedHeadingLevelConfig[];
}

export interface UnorderedListLevelConfig {
  level: number;
  bulletChar?: string;
  fontFamily?: string;
  fontSize?: Dimension;
  color?: ColorValue;
  fontWeight?: number;
  italic?: boolean;
  indent?: Dimension;
  /** Fine-tune bullet vertical position. Negative = up, positive = down. Accepts negative values. */
  verticalOffset?: Dimension;
}

export interface ResolvedUnorderedListLevelConfig {
  level: number;
  bulletChar: string;
  fontFamily: string;
  fontSize: Dimension;
  color: ColorValue;
  fontWeight: number;
  italic: boolean;
  /** User-overridden indent for this level. When undefined, the renderer cascades:
   *  level 1 → general indent; level N>1 → previous level's text-start (indent + bullet width + gap). */
  indent?: Dimension;
  verticalOffset: Dimension;
}

export interface UnorderedListsConfig {
  fontFamily?: string;
  color?: ColorValue;
  fontWeight?: number;
  italic?: boolean;
  bulletChar?: string;
  bulletFontSize?: Dimension;
  gap?: Dimension;
  /** Base indent step — level N defaults to `indent * N` unless the level overrides `indent`. Use 0 to pin bullets to the column edge. */
  indent?: Dimension;
  /** Fine-tune bullet vertical position. Negative = up, positive = down. */
  bulletVerticalOffset?: Dimension;
  marginTop?: Dimension;
  marginBottom?: Dimension;
  itemSpacing?: Dimension;
  hangingIndent?: boolean;
  levels?: UnorderedListLevelConfig[];
  /** GFM task list rendering. The bullet glyph is replaced with a checkbox. */
  taskCheckboxChar?: string;
  taskCheckedChar?: string;
  taskCompletedStrikethrough?: boolean;
  /** Optional color for the text of completed tasks. When undefined, body color is used. */
  taskCompletedColor?: ColorValue;
}

export interface ResolvedUnorderedListsConfig {
  fontFamily: string;
  color: ColorValue;
  fontWeight: number;
  italic: boolean;
  bulletChar: string;
  bulletFontSize: Dimension;
  gap: Dimension;
  indent: Dimension;
  bulletVerticalOffset: Dimension;
  marginTop: Dimension;
  marginBottom: Dimension;
  itemSpacing: Dimension;
  hangingIndent: boolean;
  levels: ResolvedUnorderedListLevelConfig[];
  taskCheckboxChar: string;
  taskCheckedChar: string;
  taskCompletedStrikethrough: boolean;
  /** Undefined => inherit body text color at render time. */
  taskCompletedColor?: ColorValue;
}

export type OrderedListNumberFormat =
  | 'arabic'
  | 'lower-alpha'
  | 'upper-alpha'
  | 'lower-roman'
  | 'upper-roman';

export interface OrderedListLevelConfig {
  level: number;
  numberFormat?: OrderedListNumberFormat;
  separator?: string;
  fontFamily?: string;
  fontSize?: Dimension;
  color?: ColorValue;
  fontWeight?: number;
  italic?: boolean;
  indent?: Dimension;
  verticalOffset?: Dimension;
  /** Separator run styling for this level; each field inherits the level's
   *  number style (or the list-wide separator setting) when unset. */
  separatorFontFamily?: string;
  separatorFontWeight?: number;
  separatorItalic?: boolean;
  separatorColor?: ColorValue;
  separatorGap?: Dimension;
}

export interface ResolvedOrderedListLevelConfig {
  level: number;
  numberFormat: OrderedListNumberFormat;
  separator: string;
  fontFamily: string;
  fontSize: Dimension;
  color: ColorValue;
  fontWeight: number;
  italic: boolean;
  /** User-overridden indent for this level. Undefined => pipeline cascades. */
  indent?: Dimension;
  verticalOffset: Dimension;
  separatorFontFamily: string;
  separatorFontWeight: number;
  separatorItalic: boolean;
  separatorColor: ColorValue;
  separatorGap: Dimension;
}

export interface OrderedListsConfig {
  fontFamily?: string;
  color?: ColorValue;
  fontWeight?: number;
  italic?: boolean;
  numberFormat?: OrderedListNumberFormat;
  separator?: string;
  numberFontSize?: Dimension;
  gap?: Dimension;
  indent?: Dimension;
  numberVerticalOffset?: Dimension;
  marginTop?: Dimension;
  marginBottom?: Dimension;
  itemSpacing?: Dimension;
  hangingIndent?: boolean;
  levels?: OrderedListLevelConfig[];
  /** Font family of the separator run. Inherits the number's `fontFamily`. */
  separatorFontFamily?: string;
  /** Weight of the separator run. Inherits the number's `fontWeight`. */
  separatorFontWeight?: number;
  /** Italic separator run. Inherits the number's `italic`. */
  separatorItalic?: boolean;
  /** Colour of the separator run. Inherits the number's `color`. */
  separatorColor?: ColorValue;
  /** Space between the number and the separator. Default `0em`. */
  separatorGap?: Dimension;
}

export interface ResolvedOrderedListsConfig {
  fontFamily: string;
  color: ColorValue;
  fontWeight: number;
  italic: boolean;
  numberFormat: OrderedListNumberFormat;
  separator: string;
  numberFontSize: Dimension;
  gap: Dimension;
  indent: Dimension;
  numberVerticalOffset: Dimension;
  marginTop: Dimension;
  marginBottom: Dimension;
  itemSpacing: Dimension;
  hangingIndent: boolean;
  levels: ResolvedOrderedListLevelConfig[];
  separatorFontFamily: string;
  separatorFontWeight: number;
  separatorItalic: boolean;
  separatorColor: ColorValue;
  separatorGap: Dimension;
}

export interface SyncIndicatorConfig {
  enabled: boolean;
  color?: ColorValue;
}

export interface LooseLineHighlightConfig {
  enabled: boolean;
  color?: ColorValue;
  /** Threshold as a multiplier of the normal space width. Lines whose
   *  justified space ratio exceeds this are highlighted. */
  threshold?: number;
}

export interface WarningsToggleConfig {
  missingFont?: boolean;
  looseLines?: boolean;
  headingHierarchy?: boolean;
  consecutiveHeadings?: boolean;
  listAfterHeading?: boolean;
  designIssues?: boolean;
}

export interface ResolvedWarningsToggleConfig {
  missingFont: boolean;
  looseLines: boolean;
  headingHierarchy: boolean;
  consecutiveHeadings: boolean;
  listAfterHeading: boolean;
  designIssues: boolean;
}

export interface DebugConfig {
  cursorSync?: SyncIndicatorConfig;
  selectionSync?: SyncIndicatorConfig;
  looseLineHighlight?: LooseLineHighlightConfig;
  pageNegative?: { enabled: boolean };
  warnings?: WarningsToggleConfig;
}

export interface ResolvedDebugConfig {
  cursorSync: { enabled: boolean; color: ColorValue };
  selectionSync: { enabled: boolean; color: ColorValue };
  looseLineHighlight: { enabled: boolean; color: ColorValue; threshold: number };
  pageNegative: { enabled: boolean };
  warnings: ResolvedWarningsToggleConfig;
}

/** Partial document config that applies to the HTML viewer only (see
 *  `HtmlViewerConfig.overrides`). */
export type HtmlViewerOverrides = Omit<PostextConfig, 'htmlViewer'>;

export interface HtmlViewerConfig {
  /** Target column width in characters — drives the measured width of the
   *  single or multi-column layout in the HTML viewer. */
  maxCharsPerLine?: number;
  /** Horizontal gap between columns in multi-column mode, in pixels. */
  columnGap?: number;
  /** Use Knuth-Plass optimal line breaking in the HTML viewer. When false,
   *  overrides `bodyText.optimalLineBreaking` only for HTML rendering to
   *  favour performance. Default false. */
  optimalLineBreaking?: boolean;
  /** Screen-only alternative to parts of the document config. The HTML
   *  viewer merges it over the document config before laying out (see
   *  `applyHtmlViewerOverrides`); canvas and PDF ignore it. Objects merge
   *  recursively; a `levels` array (headings, lists) merges entry by entry
   *  on `level`; every other array — a design slot's `elements`,
   *  `calloutStyles`, `colorPalette`… — replaces the base array wholesale.
   *  Typical use: a chapter opener without the print bands, a part page
   *  whose title wraps against the number instead of a fixed trim-box
   *  width. */
  overrides?: HtmlViewerOverrides;
}

export interface ResolvedHtmlViewerConfig {
  maxCharsPerLine: number;
  columnGap: number;
  optimalLineBreaking: boolean;
  /** Carried through unchanged; absent when the config sets none. */
  overrides?: HtmlViewerOverrides;
}

export interface PostextSectionOverride {
  selector: string;
  columns?: ColumnConfig;
  typography?: TypographyConfig;
  resourcePlacement?: ResourcePlacementConfig;
}

export interface MathConfig {
  /** Enable LaTeX rendering. When false, `$...$` / `$$...$$` spans are
   *  still parsed (so warnings track unclosed delimiters) but rendered as
   *  their literal TeX source. */
  enabled?: boolean;
  /** Scale applied to the body font size when rendering math. 1.0 = match
   *  body text. Range: typically 0.5–2.0. */
  fontSizeScale?: number;
  /** Formula colour. If omitted, inherits the body colour. */
  color?: ColorValue;
  /** Top margin for display math blocks. */
  marginTop?: Dimension;
  /** Bottom margin for display math blocks. Baseline grid snap uses this
   *  as the *minimum* bottom gap (the grid always wins). */
  marginBottom?: Dimension;
}

export interface ResolvedMathConfig {
  enabled: boolean;
  fontSizeScale: number;
  color?: ColorValue;
  marginTop: Dimension;
  marginBottom: Dimension;
}

export type PdfColorSpace = 'rgb' | 'cmyk' | 'grayscale';

export interface PdfGenerationConfig {
  /** Emit PDF outlines (bookmarks) so readers can jump between headings. */
  outlines?: boolean;
  /** When true, convert every colour in the rendered PDF to `colorSpace`. */
  forceColorSpace?: boolean;
  /** Target colour space when `forceColorSpace` is true. */
  colorSpace?: PdfColorSpace;
}

export interface ResolvedPdfGenerationConfig {
  outlines: boolean;
  forceColorSpace: boolean;
  colorSpace: PdfColorSpace;
}

export type CustomFontFormat = 'woff2' | 'woff' | 'ttf' | 'otf';
export type CustomFontStyle = 'normal' | 'italic';

export interface CustomFontVariant {
  /** CSS font-weight (100..900). */
  weight: number;
  style: CustomFontStyle;
  /** Identifier of the binary stored out-of-band (IndexedDB). */
  fileId: string;
  format: CustomFontFormat;
  /** Original filename of the uploaded binary. Shown in the sandbox UI
   *  so the user can tell variants apart at a glance. Optional for
   *  backward compatibility with configs saved before this field was
   *  introduced. */
  fileName?: string;
}

export interface CustomFontFamily {
  /** Family name — used anywhere a Google Font family name would be used. */
  name: string;
  variants: CustomFontVariant[];
}

export type PageParity = 'all' | 'odd' | 'even';
export type HeaderFooterHAlign = 'left' | 'center' | 'right';

/** Classification of a laid-out page, computed after placement
 *  (`pipeline/pageRoles.ts`):
 *  - `'blank'` — parity / force-blank padding, or a page with no content;
 *  - `'part'` — a part-divider page (`partInfo` set);
 *  - `'opener'` — the first block in reading order is a heading whose level
 *    spans the page or forces a page break before it (a chapter opener);
 *  - `'body'` — everything else. */
export type PageRole = 'body' | 'opener' | 'part' | 'blank';

/** Which page roles a design element renders on. `'all'` (default) renders
 *  on every page the parity filter admits. */
export type PageRoleFilter = 'all' | PageRole;

// ---------------------------------------------------------------------------
// Unified design slot primitives — shared by header, footer, and advanced
// heading designs. Each element is placed by an anchor (container-relative
// nine-point grid or element-to-element), with optional offset and size.
// Paint order is strictly array order (first = back, last = front).
// ---------------------------------------------------------------------------

export type HAlign = 'left' | 'center' | 'right';
export type VAlign = 'top' | 'middle' | 'bottom';

export type AnchorEdge =
  // Container-relative (nine-point grid)
  | 'top-left' | 'top' | 'top-right'
  | 'left' | 'center' | 'right'
  | 'bottom-left' | 'bottom' | 'bottom-right'
  // Element-to-element (requires anchor.to = '#elementId')
  | 'right-of' | 'left-of' | 'below' | 'above'
  | 'align-top' | 'align-bottom' | 'align-left' | 'align-right';

export interface ElementAnchor {
  /** `'container'` (the slot's own container), `'page'` (the trim box),
   *  `'bleed'` (the trim box expanded by `cutLines.bleed` when cut lines are
   *  enabled, otherwise the trim box) or `'#elementId'` — a reference to
   *  another element in the slot. Page/bleed anchoring also makes that frame
   *  the reference for `size: 'fill'` and auto-width clamping, so a band can
   *  run edge to edge regardless of the page margins. */
  to: 'container' | 'page' | 'bleed' | `#${string}`;
  edge: AnchorEdge;
}

export type ElementSize = 'auto' | 'fill' | Dimension;

export interface ElementPlacement {
  anchor: ElementAnchor;
  offset?: { x?: Dimension; y?: Dimension };
  size?: {
    width?: ElementSize;
    height?: ElementSize;
  };
}

export interface ElementBoxStyle {
  backgroundColor?: ColorValue;
  borderColor?: ColorValue;
  borderWidth?: Dimension;
  borderRadius?: Dimension;
  padding?: { top?: Dimension; right?: Dimension; bottom?: Dimension; left?: Dimension };
}

export type TextOverflow = 'wrap' | 'ellipsis-start' | 'ellipsis-end' | 'ellipsis-middle' | 'clip';

export interface DesignTextElement {
  kind: 'text';
  /** Stable, unique within the slot. Anchors reference elements by `#id`. */
  id: string;
  /** Header/footer only; ignored by heading designs. */
  parity?: PageParity;
  /** Page roles this element renders on (see `PageRoleFilter`). Default
   *  `'all'`. */
  pages?: PageRoleFilter;
  placement: ElementPlacement;
  /** Template with placeholders (see design/placeholders.ts). Use `{{`/`}}`
   *  for literal braces. */
  content: string;
  fontFamily?: string;
  fontSize: Dimension;
  fontWeight?: number;
  italic?: boolean;
  color?: ColorValue;
  /** Horizontal alignment within the element's box. */
  align?: HAlign;
  /** Vertical alignment within the element's box. */
  verticalAlign?: VAlign;
  lineHeight?: number;
  letterSpacing?: Dimension;
  overflow: TextOverflow;
  /** When true, break long words at syllable boundaries while wrapping.
   *  Uses the document's active hyphenation locale. */
  hyphenate?: boolean;
  box?: ElementBoxStyle;
}

export interface DesignRuleElement {
  kind: 'rule';
  id: string;
  parity?: PageParity;
  /** Page roles this element renders on. Default `'all'`. */
  pages?: PageRoleFilter;
  placement: ElementPlacement;
  direction: 'horizontal' | 'vertical';
  color: ColorValue;
  thickness: Dimension;
}

export interface DesignBoxElement {
  kind: 'box';
  id: string;
  parity?: PageParity;
  /** Page roles this element renders on. Default `'all'`. */
  pages?: PageRoleFilter;
  placement: ElementPlacement;
  style: ElementBoxStyle;
}

export type DesignElement = DesignTextElement | DesignRuleElement | DesignBoxElement;

export interface DesignSlot {
  /** Array order = paint order: first = back, last = front. */
  elements: DesignElement[];
}

// ---------------------------------------------------------------------------
// Resolved design slot — same shape with required-where-necessary fields.
// Resolution mostly normalizes defaults; geometry resolution happens at
// layout time (see design/layout.ts).
// ---------------------------------------------------------------------------

export interface ResolvedDesignTextElement extends Omit<DesignTextElement, 'fontFamily' | 'fontWeight' | 'italic' | 'color' | 'align' | 'verticalAlign' | 'lineHeight' | 'parity'> {
  parity: PageParity;
  fontFamily: string;
  fontWeight: number;
  italic: boolean;
  color: ColorValue;
  align: HAlign;
  verticalAlign: VAlign;
  lineHeight: number;
}

export interface ResolvedDesignRuleElement extends Omit<DesignRuleElement, 'parity'> {
  parity: PageParity;
}

export interface ResolvedDesignBoxElement extends Omit<DesignBoxElement, 'parity'> {
  parity: PageParity;
}

export type ResolvedDesignElement =
  | ResolvedDesignTextElement
  | ResolvedDesignRuleElement
  | ResolvedDesignBoxElement;

export interface ResolvedDesignSlot {
  elements: ResolvedDesignElement[];
}

// ---------------------------------------------------------------------------
// Header/footer — the unified model. `HeaderFooterSlot` and friends are
// type aliases on top of the design primitives, kept for naming
// back-compat.
// ---------------------------------------------------------------------------

export type HeaderFooterElement = DesignElement;
export type HeaderFooterSlot = DesignSlot;

export type ResolvedHeaderFooterElement = ResolvedDesignElement;
export type ResolvedHeaderFooterSlot = ResolvedDesignSlot;

// ---------------------------------------------------------------------------
// Legacy header/footer types — retained solely so the migrator can
// recognize pre-migration configs and convert them to DesignSlot.
// ---------------------------------------------------------------------------

export interface LegacyHeaderFooterTextElement {
  kind: 'text';
  align: HeaderFooterHAlign;
  content: string;
  parity: PageParity;
  /** Absolute distance between the element's body-facing edge and the body
   *  edge. Elements are independent — two with the same `marginFromBody`
   *  overlap rather than stacking. In a header, gap from element bottom to
   *  body top; in a footer, gap from element top to body bottom. */
  marginFromBody?: Dimension;
  /** Horizontal inset from the aligned content edge. When `align` is
   *  `'left'`, offset from the left content edge; when `'right'`, from the
   *  right. Ignored when `align` is `'center'`. */
  marginFromEdge?: Dimension;
  fontFamily?: string;
  fontSize?: Dimension;
  fontWeight?: number;
  italic?: boolean;
  color?: ColorValue;
}

export interface LegacyHeaderFooterRuleElement {
  kind: 'rule';
  color: ColorValue;
  thickness: Dimension;
  width: Dimension | 'full';
  align: HeaderFooterHAlign;
  marginFromBody?: Dimension;
  marginFromEdge?: Dimension;
  parity: PageParity;
}

export type LegacyHeaderFooterElement = LegacyHeaderFooterTextElement | LegacyHeaderFooterRuleElement;

export interface LegacyHeaderFooterSlot {
  elements: LegacyHeaderFooterElement[];
}

/** @deprecated Use `DesignTextElement`. Kept as alias for legacy API exports. */
export type HeaderFooterTextElement = DesignTextElement;
/** @deprecated Use `DesignRuleElement`. */
export type HeaderFooterRuleElement = DesignRuleElement;
/** @deprecated Use `ResolvedDesignTextElement`. */
export type ResolvedHeaderFooterTextElement = ResolvedDesignTextElement;
/** @deprecated Use `ResolvedDesignRuleElement`. */
export type ResolvedHeaderFooterRuleElement = ResolvedDesignRuleElement;

// ---------------------------------------------------------------------------
// Parts — `:::part{number="…" title="…"}` dividers. A part opens a dedicated
// single-column page whose opener design is laid out against the full trim
// box; the blocks inside the fence (typically the chapter list) flow in that
// column with their own typography.
// ---------------------------------------------------------------------------

export interface PartsBreakBeforeConfig {
  /** Parity of the page the part opens on. Default `'odd'`. */
  parity?: HeadingBreakParity;
}

export interface PartsBreakAfterConfig {
  /** Whether the content after the part moves to a fresh page. Default `true`. */
  enabled?: boolean;
  /** Parity of that fresh page. Default `'any'` — the next chapter's own
   *  `breakBefore.parity` then decides whether a blank verso follows. */
  parity?: HeadingBreakParity;
}

/** Typography of the blocks inside a `:::part` container. Every field
 *  inherits `bodyText` / the list configs when unset. */
export interface PartsBodyStyleConfig {
  fontFamily?: string;
  fontSize?: Dimension;
  lineHeight?: Dimension;
  color?: ColorValue;
  textAlign?: TextAlign;
  /** Bullet colour of unordered lists inside the part. */
  bulletColor?: ColorValue;
  /** Number colour of ordered lists inside the part (numbers are set bold). */
  numberColor?: ColorValue;
  /** Partial overrides applied on top of the document's `unorderedLists`
   *  inside the part (after `bulletColor`). */
  unorderedLists?: UnorderedListsConfig;
  /** Partial overrides applied on top of the document's `orderedLists`
   *  inside the part (after `numberColor` and the bold weight). */
  orderedLists?: OrderedListsConfig;
}

export interface PartsConfig {
  breakBefore?: PartsBreakBeforeConfig;
  breakAfter?: PartsBreakAfterConfig;
  /** Body area of the part page. Defaults to the page margins (`mirror`
   *  honoured). */
  margins?: PageMargins;
  /** Opener design. Its container is the page trim box, so `'page'` /
   *  `'bleed'` anchors and container anchors coincide. Purely decorative —
   *  it never reserves body space; raise `margins.top` to leave room for
   *  it. When empty, `{number} {titleText}` is synthesised from the H1
   *  typography. */
  design?: DesignSlot;
  /** Design of the blank verso that follows a part page (the back of the
   *  divider leaf). Same container and placeholders as `design`; when
   *  empty the verso stays plain. */
  versoDesign?: DesignSlot;
  bodyStyle?: PartsBodyStyleConfig;
}

export interface ResolvedPartsBreakBeforeConfig {
  parity: HeadingBreakParity;
}

export interface ResolvedPartsBreakAfterConfig {
  enabled: boolean;
  parity: HeadingBreakParity;
}

export interface ResolvedPartsBodyStyleConfig {
  fontFamily: string;
  fontSize: Dimension;
  lineHeight: Dimension;
  color: ColorValue;
  textAlign: TextAlign;
  bulletColor: ColorValue;
  numberColor: ColorValue;
  /** Kept partial: applied on top of the resolved document lists inside parts. */
  unorderedLists?: UnorderedListsConfig;
  orderedLists?: OrderedListsConfig;
}

export interface ResolvedPartsConfig {
  breakBefore: ResolvedPartsBreakBeforeConfig;
  breakAfter: ResolvedPartsBreakAfterConfig;
  margins: Required<PageMargins>;
  design: ResolvedDesignSlot;
  versoDesign: ResolvedDesignSlot;
  bodyStyle: ResolvedPartsBodyStyleConfig;
}

export interface PostextConfig {
  page?: PageConfig;
  layout?: LayoutConfig;
  bodyText?: BodyTextConfig;
  headings?: HeadingsConfig;
  /** Styling for embedded table resources. */
  tableStyle?: TableStyleConfig;
  /** Styling for resource captions (numbered label + description). */
  captionStyle?: CaptionStyleConfig;
  /** Styling for embedded SVG diagrams (single-ink reproduction). */
  diagramStyle?: DiagramStyleConfig;
  /** Named paragraph styles for `:::paragraphs{style="…"}` containers. */
  paragraphStyles?: ParagraphStyleConfig[];
  /** Named callout styles for `:::callout{type="…"}` containers. Defaults
   *  to a single neutral `note` style when unset. */
  calloutStyles?: CalloutStyleConfig[];
  /** Part dividers (`:::part` containers): page breaks, body area,
   *  opener design and body typography. */
  parts?: PartsConfig;
  unorderedLists?: UnorderedListsConfig;
  orderedLists?: OrderedListsConfig;
  math?: MathConfig;
  header?: HeaderFooterSlot;
  footer?: HeaderFooterSlot;

  columns?: number;
  gutter?: string;

  columnConfig?: ColumnConfig;
  resourcePlacement?: ResourcePlacementConfig;
  typography?: TypographyConfig;
  references?: ReferenceConfig;

  /** Document locale — used as the fallback hyphenation locale when
   *  `bodyText.hyphenation.locale` is not explicitly set. */
  locale?: HyphenationLocale;

  sectionOverrides?: PostextSectionOverride[];

  renderer?: 'web' | 'pdf';

  debug?: DebugConfig;

  htmlViewer?: HtmlViewerConfig;

  pdfGeneration?: PdfGenerationConfig;

  colorPalette?: ColorPaletteEntry[];

  /** User-provided font families. Referenced the same way as Google Fonts:
   *  set `bodyText.fontFamily` (or any other font-family field) to the
   *  family's `name`. Custom fonts take precedence over a same-named
   *  Google Font. Binary data is stored out-of-band (IndexedDB in the
   *  sandbox) and referenced by `fileId`. */
  customFonts?: CustomFontFamily[];

  /** User-definable resource categories (figures, tables, etc.) that drive
   *  typed numbering, caption prefixes, and inline references. Defaults to
   *  the built-in 'figure' and 'table' types when unset. */
  resourceTypes?: ResourceType[];
}
