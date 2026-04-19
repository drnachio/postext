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
  resources?: PostextResource[];
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
  left?: Dimension;
  right?: Dimension;
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

export interface PageConfig {
  backgroundColor?: ColorValue;
  sizePreset?: PageSizePreset;
  width?: Dimension;
  height?: Dimension;
  margins?: PageMargins;
  dpi?: number;
  cutLines?: CutLinesConfig;
  baselineGrid?: BaselineGridConfig;
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

export type TextAlign = 'left' | 'justify';

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
  textAlign?: TextAlign;
  fontWeight?: number;
  boldFontWeight?: number;
  hyphenation?: HyphenationConfig;
  firstLineIndent?: Dimension;
  hangingIndent?: boolean;
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
   *  avoidance. 0 effectively disables the penalty. Default 3000. */
  orphanPenalty?: number;
  /** When true, discourage a paragraph from starting with fewer than `widowMinLines`
   *  lines at the bottom of the current column. Soft (penalty-based). Default true. */
  avoidWidows?: boolean;
  /** Minimum lines required at the bottom of the current column when a paragraph is
   *  split. Only effective when `avoidWidows` is true. Default 2. */
  widowMinLines?: number;
  /** Demerit added when a widow constraint is violated. Default 3000. */
  widowPenalty?: number;
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
  /** Demerit added when the last line of a paragraph is shorter than the runt
   *  threshold. Default 1500 (softer than orphan/widow since runts are
   *  aesthetic, not structural). */
  runtPenalty?: number;
}

export interface ResolvedBodyTextConfig {
  fontFamily: string;
  fontSize: Dimension;
  lineHeight: Dimension;
  paragraphSpacing: boolean;
  color: ColorValue;
  boldColor?: ColorValue;
  italicColor?: ColorValue;
  textAlign: TextAlign;
  fontWeight: number;
  boldFontWeight: number;
  hyphenation: ResolvedHyphenationConfig;
  firstLineIndent: Dimension;
  hangingIndent: boolean;
  maxWordSpacing: number;
  minWordSpacing: number;
  optimalLineBreaking: boolean;
  avoidOrphans: boolean;
  orphanMinLines: number;
  orphanPenalty: number;
  avoidWidows: boolean;
  widowMinLines: number;
  widowPenalty: number;
  slackWeight: number;
  avoidRunts: boolean;
  runtMinCharacters: number;
  runtPenalty: number;
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
}

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
}

export interface HeadingsConfig {
  fontFamily?: string;
  lineHeight?: Dimension;
  color?: ColorValue;
  textAlign?: TextAlign;
  fontWeight?: number;
  marginTop?: Dimension;
  marginBottom?: Dimension;
  levels?: HeadingLevelConfig[];
}

export interface ResolvedHeadingsConfig {
  fontFamily: string;
  lineHeight: Dimension;
  color: ColorValue;
  textAlign: TextAlign;
  fontWeight: number;
  marginTop: Dimension;
  marginBottom: Dimension;
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

export interface DebugConfig {
  cursorSync?: SyncIndicatorConfig;
  selectionSync?: SyncIndicatorConfig;
  looseLineHighlight?: LooseLineHighlightConfig;
  pageNegative?: { enabled: boolean };
}

export interface ResolvedDebugConfig {
  cursorSync: { enabled: boolean; color: ColorValue };
  selectionSync: { enabled: boolean; color: ColorValue };
  looseLineHighlight: { enabled: boolean; color: ColorValue; threshold: number };
  pageNegative: { enabled: boolean };
}

export interface PostextSectionOverride {
  selector: string;
  columns?: ColumnConfig;
  typography?: TypographyConfig;
  resourcePlacement?: ResourcePlacementConfig;
}

export interface PostextConfig {
  page?: PageConfig;
  layout?: LayoutConfig;
  bodyText?: BodyTextConfig;
  headings?: HeadingsConfig;
  unorderedLists?: UnorderedListsConfig;
  orderedLists?: OrderedListsConfig;

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

  colorPalette?: ColorPaletteEntry[];
}
