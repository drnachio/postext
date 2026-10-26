import type { ArabicNumeralStyle, EastAsianNumeralStyle } from '../numbering.js';
import type { CmykPercent } from './print.js';

export type ColorModel = 'hex' | 'rgb' | 'cmyk' | 'hsl';

export interface ColorValue {
  hex: string;
  model: ColorModel;
  /** The exact process values of a colour authored in CMYK (`model:
   *  'cmyk'`), percent: a CMYK print render (`print`, or a `'cmyk'` PDF
   *  colour space) sets them as they are instead of separating `hex`,
   *  which is their screen rendering. */
  cmyk?: CmykPercent;
  /** The `colorPalette` entry this colour follows, wherever it sits in the
   *  configuration (designs, callout labels and the `:ref` colour
   *  included): the entry's `hex` / `model` win, and the ones stored here
   *  are the fallback when the palette has no such entry. */
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

/** A trim size by name: the book sizes in centimetres, and the newspaper
 *  formats (#506) — `'broadsheet'` 375 × 597 mm, `'berliner'` 315 × 470 mm
 *  `'tabloid'` 280 × 430 mm and `'compact'` 297 × 420 mm (a half-broadsheet
 *  fold). */
export type PageSizePreset = '11x17' | '12x19' | '17x24' | '21x28' | 'broadsheet' | 'berliner' | 'tabloid' | 'compact' | 'custom';

export interface PageMargins {
  top?: Dimension;
  bottom?: Dimension;
  /** Inner (spine-side) margin when `mirror` is on; left margin otherwise. */
  left?: Dimension;
  /** Outer margin when `mirror` is on; right margin otherwise. */
  right?: Dimension;
  /** Mirrored (facing-page) margins: `left` is the inner margin and `right`
   *  the outer one. Odd pages (page 1 = odd) keep them as written; even
   *  pages swap them so the inner margin always faces the spine. In a
   *  right-bound book (`page.binding`) it is the other way round: the
   *  recto (odd) is the left page of the spread, its spine on its right,
   *  so odd pages swap and even pages keep the margins as written — `left`
   *  is still the inner margin. Default `false`. */
  mirror?: boolean;
}

/** The baseline grid: lines one body line height apart from the top of
 *  the content area. The layout uses it whether or not it is drawn
 *  (headings, list ends, boxes, figures and display formulas snap the flow
 *  back onto it, unless their own `snapToGrid` is off); this config only
 *  draws it. */
export interface BaselineGridConfig {
  /** Draw the grid lines over the pages (canvas and PDF renderers, the
   *  Sandbox views). Only the drawing: the layout is the same either way. */
  enabled: boolean;
  color?: ColorValue;
  lineWidth?: Dimension;
}

/** Bleed and crop marks. When enabled, the sheet grows by
 *  `bleed + markOffset + markLength` on every side, with the trimmed page
 *  in its middle (see `cropMarkSegments`). */
export interface CutLinesConfig {
  enabled: boolean;
  /** How far art may run past the trim. Default 3 mm. */
  bleed?: Dimension;
  /** Length of each crop mark. Default 5 mm. */
  markLength?: Dimension;
  /** Gap between the trim edge and the start of each crop mark. A mark
   *  never starts inside the bleed: when `bleed` is wider, it starts at
   *  the bleed edge. Default 3 mm. */
  markOffset?: Dimension;
  /** Stroke width of the marks. Default 0.25 pt. */
  markWidth?: Dimension;
  /** Colour of the marks on the canvas (the screen preview). A PDF
   *  always paints them in registration colour (the `/All` separation),
   *  whatever its colour space, so they print on every plate. Default
   *  black. */
  color?: ColorValue;
}

export type PageNumberFormat =
  | 'decimal'
  | 'lower-roman'
  | 'upper-roman'
  | 'lower-alpha'
  | 'upper-alpha'
  | EastAsianNumeralStyle
  | ArabicNumeralStyle;

export interface PageNumberingConfig {
  /** Format for page labels. Default: `'decimal'`. The list and resource
   *  spellings of a format are read too (`'arabic'`, `'roman-lower'`,
   *  `'i'`…, see `parseNumberFormat`); an unknown value numbers in decimal
   *  and is reported by `collectConfigWarnings`. */
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

/** The edge a book is bound on (see `PageConfig.binding`). */
export type PageBinding = 'auto' | 'left' | 'right';

export interface PageConfig {
  backgroundColor?: ColorValue;
  sizePreset?: PageSizePreset;
  width?: Dimension;
  height?: Dimension;
  margins?: PageMargins;
  /** Layout px per inch: every length is converted at this rate, and a
   *  bitmap without a resolution of its own (see `Resource.bitmap.resolution`
   *  and `layout.bitmapResolution`) is laid out one pixel per layout px.
   *  Default 300. */
  dpi?: number;
  cutLines?: CutLinesConfig;
  baselineGrid?: BaselineGridConfig;
  pageNumbering?: PageNumberingConfig;
  /** The edge the book is bound on. `'left'`: pages turn right to left, as
   *  in any Western book. `'right'`: the book is bound on its right edge,
   *  as vertical Chinese and Japanese books and Arabic and Hebrew books
   *  are (clreq §7.1.1.1): page 1 is
   *  still the recto (odd), but it is the LEFT page of a spread, its inner
   *  margin is on its right, and viewers show the pairs `[3 | 2]`. With
   *  mirrored margins the recto therefore swaps `left` and `right`: `left`
   *  stays the inner margin. `'auto'` (the default) is `'right'` when
   *  `layout.writingMode` is `'vertical-rl'`, when the document runs right
   *  to left (`PostextConfig.direction`), or when the config has a
   *  `comics` section whose comics read right to left
   *  (`comics.readingDirection` resolved, `comicReadingDirection`: a
   *  manga, a Japanese or Traditional Chinese edition of a Western comic),
   *  else `'left'`. The `comics` section decides, not the `:::page` blocks
   *  of a chapter, so every chapter of a book is bound alike. Book-level:
   *  a heading style's own `layout` never changes it. */
  binding?: PageBinding;
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
  /** `binding` resolved: `'auto'` is `'right'` in a vertical document, a
   *  right-to-left one and a comic book read right to left. */
  binding: 'left' | 'right';
}

/** How the body is divided into columns. `'single'`, `'double'` and
 *  `'oneAndHalf'` (a main column and a narrower side column); `'multiple'`:
 *  {@link LayoutConfig.columnCount} equal columns, the grid of newspapers
 *  and of many magazines (since postext 1.18, #505). */
export type LayoutType = 'single' | 'double' | 'oneAndHalf' | 'multiple';

/** The direction lines run in (see `LayoutConfig.writingMode`). */
export type WritingMode = 'horizontal-tb' | 'vertical-rl';

/** What the narrow column of a `oneAndHalf` layout carries. `'text'` (the
 *  default): body text flows into it after the main column, as into any
 *  column. `'floats'`: it is a side channel that never takes body text —
 *  the flow stays in the main column and the side column receives the
 *  resources and callouts placed with `span: 'side'`, stacked beside the
 *  paragraph that first references them (the marginal figures and key
 *  boxes of a textbook). */
export type SideColumnRole = 'text' | 'floats';

/** Which edge of the content area the side column of a `oneAndHalf` layout
 *  sits at. `'right'` (the default) and `'left'` are fixed; `'outer'` /
 *  `'inner'` follow the page parity when the margins are mirrored — the
 *  outer edge is the right edge of a recto (odd page) and the left edge of
 *  a verso. Without mirrored margins `'outer'` is `'right'` and `'inner'`
 *  is `'left'`. */
export type SideColumnSide = 'right' | 'left' | 'outer' | 'inner';

export interface ColumnRuleConfig {
  enabled?: boolean;
  color?: ColorValue;
  lineWidth?: Dimension;
}
