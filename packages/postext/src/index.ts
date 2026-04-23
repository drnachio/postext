export { createLayout } from './createLayout';
export { buildDocument, BuildCancelledError } from './pipeline';
export type { BuildDocumentOptions } from './pipeline';
export { renderToCanvas, renderPage, renderPageToCanvas } from './canvas-backend';
export type { RenderPageOptions } from './canvas-backend';
export { renderToHtml, renderToHtmlIndexed } from './html-backend';
export type { RenderHtmlOptions, HtmlRenderIndex, HtmlRenderIndexPage } from './html-backend';
export { dimensionToPx } from './units';
export { buildFontString, measureBlock, measureRichBlock, measureGlyphWidth, initHyphenator, clearMeasurementCache, createMeasurementCache, cachedMeasureBlock, cachedMeasureRichBlock } from './measure';
export type { MeasuredBlock, MeasureBlockOptions, MeasurementCache } from './measure';
export { hyphenateText, setHyphenationLocale } from './hyphenate';
export { parseMarkdown } from './parse';
export { extractFrontmatter } from './frontmatter';
export type { ParsedFrontmatter } from './frontmatter';
export { DEFAULT_PAGE_CONFIG, DEFAULT_CUT_LINES, DEFAULT_PAGE_NUMBERING, PAGE_SIZE_PRESETS, resolvePageConfig, DEFAULT_LAYOUT_CONFIG, DEFAULT_COLUMN_RULE, resolveLayoutConfig, stripLayoutDefaults, DEFAULT_BODY_TEXT_CONFIG, DEFAULT_HYPHENATION_CONFIG, resolveBodyTextConfig, stripBodyTextDefaults, hyphenationEqual, DEFAULT_HEADINGS_CONFIG, resolveHeadingsConfig, stripHeadingsDefaults, DEFAULT_UNORDERED_LISTS_STATIC, resolveUnorderedListsConfig, stripUnorderedListsDefaults, DEFAULT_ORDERED_LISTS_STATIC, resolveOrderedListsConfig, stripOrderedListsDefaults, DEFAULT_MATH_CONFIG, resolveMathConfig, stripMathDefaults, dimensionsEqual, colorsEqual, resolveColorValue, applyPaletteToConfig, applyPaletteToResolvedConfig, DEFAULT_COLOR_PALETTE, DEFAULT_MAIN_COLOR, DEFAULT_MAIN_COLOR_ID, DEFAULT_MAIN_COLOR_NAME, DEFAULT_MAIN_COLOR_HEX, cloneDefaultColorPalette, isDefaultColorPalette, stripPageDefaults, stripConfigDefaults, DEFAULT_DEBUG_CONFIG, resolveDebugConfig, stripDebugDefaults, DEFAULT_HTML_VIEWER_CONFIG, resolveHtmlViewerConfig, stripHtmlViewerDefaults, DEFAULT_PDF_GENERATION_CONFIG, resolvePdfGenerationConfig, stripPdfGenerationDefaults, DEFAULT_HEADER_FOOTER_SLOT, DEFAULT_HEADER_SLOT, DEFAULT_FOOTER_SLOT, DEFAULT_TEXT_ELEMENT, DEFAULT_RULE_ELEMENT, resolveHeaderFooterConfig, stripHeaderFooterDefaults } from './defaults';
export { resolvePlaceholders, computeChapterTitles, collectPlaceholderNames, isKnownPlaceholder, isMetadataPlaceholder } from './pipeline/placeholders';
export type { PlaceholderContext, PlaceholderResult, ChapterTitlePageInfo } from './pipeline/placeholders';
export type {
  PostextContent,
  DocumentMetadata,
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
  ColorPaletteEntry,
  DimensionUnit,
  Dimension,
  PageSizePreset,
  PageMargins,
  BaselineGridConfig,
  CutLinesConfig,
  PageConfig,
  ResolvedPageConfig,
  PageNumberFormat,
  PageNumberingConfig,
  ResolvedPageNumberingConfig,
  HeadingBreakParity,
  HeadingBreakBeforeConfig,
  ResolvedHeadingBreakBeforeConfig,
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
  UnorderedListLevelConfig,
  ResolvedUnorderedListLevelConfig,
  UnorderedListsConfig,
  ResolvedUnorderedListsConfig,
  OrderedListLevelConfig,
  ResolvedOrderedListLevelConfig,
  OrderedListsConfig,
  ResolvedOrderedListsConfig,
  OrderedListNumberFormat,
  SyncIndicatorConfig,
  DebugConfig,
  ResolvedDebugConfig,
  WarningsToggleConfig,
  ResolvedWarningsToggleConfig,
  HtmlViewerConfig,
  ResolvedHtmlViewerConfig,
  MathConfig,
  ResolvedMathConfig,
  PdfColorSpace,
  PdfGenerationConfig,
  ResolvedPdfGenerationConfig,
  CustomFontFormat,
  CustomFontStyle,
  CustomFontVariant,
  CustomFontFamily,
  PageParity,
  HeaderFooterHAlign,
  HeaderFooterTextElement,
  HeaderFooterRuleElement,
  HeaderFooterElement,
  HeaderFooterSlot,
  ResolvedHeaderFooterTextElement,
  ResolvedHeaderFooterRuleElement,
  ResolvedHeaderFooterElement,
  ResolvedHeaderFooterSlot,
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
  VDTHeaderFooterSlot,
  VDTHeaderFooterBlock,
  VDTHeaderFooterTextBlock,
  VDTRuleBlock,
} from './vdt';
export type { ContentBlock, ContentBlockType, DirectiveAttrs, DirectiveName, InlineSpan, TextSpan, MathSpan, MathMeta, ListKind, ParseIssue } from './parse';
export { parseMarkdownWithIssues, MATH_PLACEHOLDER } from './parse';
export { buildPageLabels, collectPageLabelRuns, formatNumeral } from './numbering';
export type { NumeralStyle, PageNumberSegment, PageLabelInfo, PageLabelRun } from './numbering';
export type { MathRender, MathPath, MathViewBox } from './math/types';
export { initMathEngine, isMathReady, onMathReady, renderMath, placeholderRender, clearMathCache } from './math';
