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
  textAlign?: TextAlign;
  fontWeight?: number;
  boldFontWeight?: number;
  hyphenation?: HyphenationConfig;
  firstLineIndent?: Dimension;
  hangingIndent?: boolean;
}

export interface ResolvedBodyTextConfig {
  fontFamily: string;
  fontSize: Dimension;
  lineHeight: Dimension;
  paragraphSpacing: boolean;
  color: ColorValue;
  textAlign: TextAlign;
  fontWeight: number;
  boldFontWeight: number;
  hyphenation: ResolvedHyphenationConfig;
  firstLineIndent: Dimension;
  hangingIndent: boolean;
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
}

export interface SyncIndicatorConfig {
  enabled: boolean;
  color?: ColorValue;
}

export interface DebugConfig {
  cursorSync?: SyncIndicatorConfig;
  selectionSync?: SyncIndicatorConfig;
}

export interface ResolvedDebugConfig {
  cursorSync: { enabled: boolean; color: ColorValue };
  selectionSync: { enabled: boolean; color: ColorValue };
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

  columns?: number;
  gutter?: string;

  columnConfig?: ColumnConfig;
  resourcePlacement?: ResourcePlacementConfig;
  typography?: TypographyConfig;
  references?: ReferenceConfig;

  sectionOverrides?: PostextSectionOverride[];

  renderer?: 'web' | 'pdf';

  debug?: DebugConfig;
}
