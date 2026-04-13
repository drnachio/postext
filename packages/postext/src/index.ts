export { createLayout } from './createLayout';
export { buildDocument } from './pipeline';
export { renderToCanvas, renderPage, renderPageToCanvas } from './canvas-backend';
export { dimensionToPx } from './units';
export { buildFontString, measureBlock, measureRichBlock, initHyphenator, clearMeasurementCache } from './measure';
export type { MeasuredBlock, MeasureBlockOptions } from './measure';
export { hyphenateText, setHyphenationLocale } from './hyphenate';
export { parseMarkdown } from './parse';
export { DEFAULT_PAGE_CONFIG, DEFAULT_CUT_LINES, PAGE_SIZE_PRESETS, resolvePageConfig, DEFAULT_LAYOUT_CONFIG, DEFAULT_COLUMN_RULE, resolveLayoutConfig, stripLayoutDefaults, DEFAULT_BODY_TEXT_CONFIG, DEFAULT_HYPHENATION_CONFIG, resolveBodyTextConfig, stripBodyTextDefaults, hyphenationEqual, DEFAULT_HEADINGS_CONFIG, resolveHeadingsConfig, stripHeadingsDefaults, dimensionsEqual, colorsEqual, stripPageDefaults, stripConfigDefaults } from './defaults';
export type {
  PostextContent,
  PostextResource,
  PostextNote,
  PostextConfig,
  PostextSectionOverride,
  ColumnConfig,
  ResourcePlacementConfig,
  TypographyConfig,
  ReferenceConfig,
  PlacementStrategy,
  ColorModel,
  ColorValue,
  DimensionUnit,
  Dimension,
  PageSizePreset,
  PageMargins,
  BaselineGridConfig,
  CutLinesConfig,
  PageConfig,
  ResolvedPageConfig,
  LayoutType,
  ColumnRuleConfig,
  LayoutConfig,
  ResolvedLayoutConfig,
  TextAlign,
  HyphenationLocale,
  HyphenationConfig,
  ResolvedHyphenationConfig,
  BodyTextConfig,
  ResolvedBodyTextConfig,
  HeadingLevelConfig,
  ResolvedHeadingLevelConfig,
  HeadingsConfig,
  ResolvedHeadingsConfig,
} from './types';
export type {
  BoundingBox,
  ResolvedConfig,
  VDTBlockType,
  VDTLineSegment,
  VDTLine,
  VDTBlock,
  VDTColumn,
  VDTFootnoteArea,
  VDTPage,
  VDTDocument,
} from './vdt';
export type { ContentBlock, ContentBlockType, InlineSpan } from './parse';
