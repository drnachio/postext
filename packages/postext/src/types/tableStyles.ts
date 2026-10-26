import type { FigureStyle, TextAlign, TextAlignKeyword } from './locale.js';
import type { ColorValue, Dimension } from './page.js';

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
  /** The figures of every cell, header and body (see {@link FigureStyle}):
   *  `'lining-tabular'` lines the digits of a column up. Default: those of
   *  the family the cells take (the body's, with its figures). */
  figureStyle?: FigureStyle;
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
  /** Tracking after every character of a header cell (spaces included),
   *  as CSS `letter-spacing`: positive spreads the letters (capitals set
   *  with {@link headerTextTransform} usually want a little), negative
   *  tightens them. An `em` value is relative to {@link headerFontSize}.
   *  Measured into the header lines, so they wrap and align with it, and
   *  painted the same by canvas, HTML and PDF. Applies to every header
   *  cell: the header rows and a cell marked `isHeader`. Default `0`. */
  headerLetterSpacing?: Dimension;
  /** Letter case of the header cells: `'uppercase'` sets their text in
   *  capitals. The transform keeps the text's length, so the editor's
   *  source map stays exact: a letter whose capital is longer (`ß` → `SS`)
   *  is left as it is. Resource references keep their label. Default
   *  `'none'`. */
  headerTextTransform?: TableTextTransform;
  /** Fill header cells with {@link headerBackground}. Default `true`. */
  headerBackgroundEnabled?: boolean;
  /** Header-cell fill colour. Default light grey. */
  headerBackground?: ColorValue;
  /** Fill body cells with {@link bodyBackground}. Default `false`. */
  bodyBackgroundEnabled?: boolean;
  /** Body-cell fill colour. Default white. */
  bodyBackground?: ColorValue;
  /** Zebra rows: fill every second body row with
   *  {@link bodyAlternateBackground}. Counting starts at the first row
   *  after the header rows, which keeps `bodyBackground` (or no fill); a
   *  merged cell takes the stripe of its first row, header cells keep the
   *  header fill and a cell's own `background` wins over both. A table
   *  split across pages keeps each row's stripe. Default `false`. */
  bodyAlternateBackgroundEnabled?: boolean;
  /** Fill of the alternate body rows. Default a light grey (`#f2f2f2`). */
  bodyAlternateBackground?: ColorValue;
  /** Draw cell borders. Default `true`. */
  borders?: boolean;
  /** Border colour. Defaults to the body-text colour. */
  borderColor?: ColorValue;
  /** Border thickness. Default `0.75pt` (≈1px at 96dpi). */
  borderWidth?: Dimension;
  /** Inner padding inside each cell. Default `0.375em`. */
  cellPadding?: Dimension;
  /** Which rules to stroke when {@link borders} is on. Default `'grid'`.
   *  `'booktabs'` strokes its own widths ({@link heavyRuleWidth},
   *  {@link lightRuleWidth}, {@link spanRuleWidth}) and ignores
   *  {@link borderWidth}. */
  rules?: TableRules;
  /** Corner radius of the table's outer frame. Default `0` (square). The
   *  cell fills are clipped to the rounded frame, whatever the rules (with
   *  `'none'` the fills alone show the rounded shape); the inner rules stay
   *  straight. A table split across pages rounds the top corners of its
   *  first part and the bottom corners of its last. `'booktabs'` rules
   *  have no frame to round: they stay straight (the fills are still
   *  clipped). */
  borderRadius?: Dimension;
  /** `'booktabs'` (#625): width of the rules above the table and under its
   *  last row (LaTeX `\heavyrulewidth`). An `em` value is relative to
   *  {@link bodyFontSize}. Default `0.08em`. */
  heavyRuleWidth?: Dimension;
  /** `'booktabs'`: width of the rule under the header rows and of the
   *  group rules (`\lightrulewidth`). An `em` value is relative to
   *  {@link bodyFontSize}. Default `0.05em`. */
  lightRuleWidth?: Dimension;
  /** `'booktabs'`: width of the rules under header cells that span several
   *  columns (`\cmidrulewidth`). An `em` value is relative to
   *  {@link bodyFontSize}. Default `0.03em`. */
  spanRuleWidth?: Dimension;
  /** `'booktabs'`: the rules under header cells that span more than one
   *  column, above the last header row: shortened at both ends by
   *  {@link spanRuleTrim} so neighbouring rules do not touch
   *  (`'trimmed'`, the default, `\cmidrule(lr)`), across the whole cell
   *  (`'full'`), or none (`'none'`). */
  spanRules?: TableSpanRules;
  /** `'booktabs'`: how much a `'trimmed'` span rule is shortened at each
   *  end. An `em` value is relative to {@link bodyFontSize}. Default
   *  `0.5em`. */
  spanRuleTrim?: Dimension;
  /** `'booktabs'`: a light rule above every body row that heads a group
   *  (one cell across every column, or all header cells), except one that
   *  opens a page. Default `false`. */
  groupRules?: boolean;
  /** `'booktabs'`: the rule that closes a part of a split table that goes
   *  on overleaf: the heavy bottom rule (`'bottom'`), a light rule
   *  (`'light'`, the default: the heavy rule closes only the real last
   *  row), or none (`'none'`). */
  continuedFootRule?: TableContinuedFootRule;
  /** What happens to a table taller than the space a page offers: continue
   *  it on the following pages (`'split'`, the default), keep only the rows
   *  that fit (`'clip'`), or leave it out (`'hide'`). See {@link TableOverflow}. */
  overflow?: TableOverflow;
  /** Apply {@link overflow} to tables placed `here` too (#634): an inline
   *  table that does not fit the room left in its column is cut between
   *  rows and goes on at the head of the next column, before the text
   *  after it (`'split'`); one taller than a column keeps its leading
   *  rows (`'clip'`) or is left out (`'hide'`). `false` keeps the rule of
   *  postext 1.24 and earlier: an inline table moves whole to the next
   *  column. Default `true`. */
  splitInline?: boolean;
  /** Suffix appended to the caption of every continuation slice of a split
   *  table (e.g. "Table 6-4. Title *(cont.)*"). Defaults to `"(cont.)"`. */
  continuedSuffix?: string;
  /** Set a marker under every slice that continues on the next page.
   *  Default `true`. */
  continuesMarkerEnabled?: boolean;
  /** Text of that marker, set right-aligned under the slice in the note
   *  style. Defaults to `"Continued"` (`"Continúa"` for Spanish documents). */
  continuesMarker?: string;
}

/** A named table style (`PostextConfig.tableStyles`), picked per table by
 *  `Resource.table.styleId`. Every field left unset inherits the document's
 *  {@link TableStyleConfig} (`tableStyle`), and through it the body text —
 *  so a style only states what sets its tables apart. */
export interface NamedTableStyleConfig extends TableStyleConfig {
  /** Identifier a table resource references with `table.styleId`. */
  id: string;
  /** Human-readable name (editor UI only). Defaults to {@link id}. */
  name?: string;
}

export interface ResolvedNamedTableStyleConfig extends ResolvedTableStyleConfig {
  id: string;
  name: string;
}

/** Letter case of a table's header cells (`TableStyleConfig.headerTextTransform`). */
export type TableTextTransform = 'none' | 'uppercase';

/** Rule pattern of a table: the full cell grid, horizontal rules only (top
 *  and bottom edge of every row), the outer frame only, none, or the
 *  booktabs pattern of journal tables (#625): a heavy rule above the table
 *  and under its last row, a light rule under the header, short rules
 *  under spanning header cells and no vertical rules. */
export type TableRules = 'grid' | 'horizontal' | 'outer' | 'none' | 'booktabs';

/** Rules of a `'booktabs'` table under header cells that span several
 *  columns (`TableStyleConfig.spanRules`). */
export type TableSpanRules = 'trimmed' | 'full' | 'none';

/** What closes a part of a `'booktabs'` table that continues on the next
 *  page (`TableStyleConfig.continuedFootRule`). */
export type TableContinuedFootRule = 'bottom' | 'light' | 'none';

/** Behaviour of a table taller than the page: `'split'` breaks it between
 *  rows and continues on the following pages, repeating the header rows and
 *  suffixing the caption; `'clip'` keeps the leading rows that fit and drops
 *  the rest; `'hide'` leaves the table out entirely. */
export type TableOverflow = 'split' | 'clip' | 'hide';

export interface ResolvedTableStyleConfig {
  bodyFontFamily: string;
  bodyFontSize: Dimension;
  bodyColor: ColorValue;
  headerFontFamily: string;
  headerFontSize: Dimension;
  headerColor: ColorValue;
  headerBold: boolean;
  headerItalic: boolean;
  headerLetterSpacing: Dimension;
  headerTextTransform: TableTextTransform;
  headerBackgroundEnabled: boolean;
  headerBackground: ColorValue;
  bodyBackgroundEnabled: boolean;
  bodyBackground: ColorValue;
  bodyAlternateBackgroundEnabled: boolean;
  bodyAlternateBackground: ColorValue;
  borders: boolean;
  borderColor: ColorValue;
  borderWidth: Dimension;
  cellPadding: Dimension;
  rules: TableRules;
  borderRadius: Dimension;
  heavyRuleWidth: Dimension;
  lightRuleWidth: Dimension;
  spanRuleWidth: Dimension;
  spanRules: TableSpanRules;
  spanRuleTrim: Dimension;
  groupRules: boolean;
  continuedFootRule: TableContinuedFootRule;
  overflow: TableOverflow;
  splitInline: boolean;
  continuedSuffix: string;
  continuesMarkerEnabled: boolean;
  continuesMarker: string;
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
  align?: TextAlignKeyword;
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
  /** The figures of the caption, label and description (see
   *  {@link FigureStyle}). Default: those of its family (the body's, with its
   *  figures, when it takes the body's). */
  figureStyle?: FigureStyle;
  /** Caption font size (label + description). Defaults to the body size. */
  fontSize?: Dimension;
  /** Description text colour. Defaults to the body-text colour. */
  color?: ColorValue;
  /** Horizontal alignment of caption text. Default `'left'`. */
  align?: TextAlignKeyword;
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
  /** What stands between the label and the number: in the caption
   *  ("Figure 1.7") and in an inline `:ref` ("Fig. 1.7"). Default a no-break
   *  space (U+00A0); `''` sets them solid, as Chinese does (图1-1). */
  labelNumberGap?: string;
  /** What follows the number in the caption, before the description.
   *  Default `'. '` ("Figure 1.7. A caption"); Chinese sets an ideographic
   *  space (`'　'`: 图1-1　标题). A label without a number keeps its own rule
   *  (a stop unless the prefix ends in one). */
  labelSeparator?: string;
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
  labelNumberGap: string;
  labelSeparator: string;
}
