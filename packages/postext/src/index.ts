export { createLayout } from './createLayout';
export { buildDocument, BuildCancelledError, continuationAfter, contentOutline, computeOutline, computeOutlineFor, outlineFromDoc, outlineKey, sameOutline, hasTocDirective, hasIndexDirective, tocOutline, indexOutline } from './pipeline';
export type { BuildDocumentOptions } from './pipeline';
export { renderToCanvas, renderPage, renderPageToCanvas, registerResourceImage, unregisterResourceImage, clearResourceImages, getResourceImage } from './canvas-backend';
export type { RenderPageOptions, ResourceImageSource, RegisterResourceImageOptions } from './canvas-backend';
export { renderToHtml, renderToHtmlIndexed, anchoredResourceIds, HTML_TEXT_RESET } from './html-backend';
export type { RenderHtmlOptions, HtmlRenderIndex, HtmlRenderIndexPage } from './html-backend';
export { dimensionToPx } from './units';
export { computePageTextExtent } from './vdt';
export { columnRuleSegments, footnoteRuleSegments, pageColumnRule } from './columnRule';
export type { FootnoteRuleSegment } from './columnRule';
export { cropMarkSegments } from './cropMarks';
export type { CropMarkSegment } from './cropMarks';
export { columnClipRect, designOverlayOverhang, headingDesignOverhangAbove, hangingPunctuationOverhang } from './columnClip';
export { lineInkExtent } from './lineInk';
export type { ColumnRuleSegment } from './columnRule';
export { findLooseLines, drawLooseLines, lineLooseness } from './looseLines';
export type { LooseLine, FindLooseLinesOptions, DrawLooseLinesOptions } from './looseLines';
export { primaryFontFamily } from './measure/font';
export { buildFontString, measureBlock, measureRichBlock, measureGlyphWidth, initHyphenator, clearMeasurementCache, createMeasurementCache, cachedMeasureBlock, cachedMeasureRichBlock, setCjkLineBreak, getCjkLineBreak, setCjkComposition, getCjkComposition, cjkCompositionOf, punctuationAdvance, punctuationSide, PLAIN_CJK_COMPOSITION } from './measure';
export type { CjkComposition, PunctuationSide } from './measure';
export type { BreakTrace, LineWidthStep, MeasuredBlock, MeasureBlockOptions, MeasurementCache } from './measure';
export { hyphenateText, setHyphenationLocale, HYPHENATION_LOCALES, matchHyphenationLocale } from './hyphenate';
export { DOCUMENT_LANGUAGES, isCjkLanguage, localeScript, chineseScriptOf, cjkRegionOf, stringsKeyOf, sameContentLocale, matchContentLocale, canonicalLocaleTag, renderLangOf, stringsFor } from './locale';
export type { DocumentLanguage } from './locale';
export { parseMarkdown } from './parse';
export { addRow, addColumn, removeRow, removeColumn, mergeCells, unmergeCell, setCellContent, setCellImage, setCellBackground, setAlignment, parseTSV, tableGridIssues } from './table/model';
export type { CellPos, CellRange, ParseTSVOptions, TableGridIssue } from './table/model';
export { collectContentWarnings, formatWarning } from './pipeline/contentWarnings';
export { collectHeadingDesignCuts } from './pipeline/headingDesignCuts';
export type { HeadingDesignCut } from './pipeline/headingDesignCuts';
export { extractFrontmatter, metadataText } from './frontmatter';
export type { ParsedFrontmatter } from './frontmatter';
export { DEFAULT_PAGE_CONFIG, DEFAULT_CUT_LINES, DEFAULT_PAGE_NUMBERING, PAGE_SIZE_PRESETS, resolvePageConfig, DEFAULT_LAYOUT_CONFIG, DEFAULT_COLUMN_RULE, DEFAULT_COLUMN_BALANCING, resolveLayoutConfig, stripLayoutDefaults, DEFAULT_BODY_TEXT_CONFIG, DEFAULT_HYPHENATION_CONFIG, DEFAULT_BLOCKQUOTE_CONFIG, resolveBodyTextConfig, stripBodyTextDefaults, hyphenationEqual, DEFAULT_HEADINGS_CONFIG, resolveHeadingsConfig, stripHeadingsDefaults, resolveTableStyleConfig, stripTableStyleDefaults, resolveTableStylesConfig, stripTableStylesDefaults, pickTableStyle, defaultTableContinuationStrings, resolveCaptionStyleConfig, stripCaptionStyleDefaults, mergeCaptionStyle, DEFAULT_DIAGRAM_STYLE_CONFIG, resolveDiagramStyleConfig, stripDiagramStyleDefaults, DEFAULT_PARAGRAPH_STYLES, resolveParagraphStylesConfig, stripParagraphStylesDefaults, DEFAULT_CALLOUT_STYLES, DEFAULT_CALLOUT_STYLE_STATIC, resolveCalloutStylesConfig, stripCalloutStylesDefaults, DEFAULT_CHIP_STYLES, DEFAULT_CHIP_STYLE_STATIC, resolveChipStylesConfig, stripChipStylesDefaults, pickChipStyle, DEFAULT_UNORDERED_LISTS_STATIC, resolveUnorderedListsConfig, stripUnorderedListsDefaults, DEFAULT_ORDERED_LISTS_STATIC, resolveOrderedListsConfig, stripOrderedListsDefaults, DEFAULT_MATH_CONFIG, resolveMathConfig, stripMathDefaults, dimensionsEqual, colorsEqual, resolveColorValue, applyPaletteToConfig, applyPaletteToResolvedConfig, DEFAULT_COLOR_PALETTE, DEFAULT_MAIN_COLOR, DEFAULT_MAIN_COLOR_ID, DEFAULT_MAIN_COLOR_NAME, DEFAULT_MAIN_COLOR_HEX, cloneDefaultColorPalette, isDefaultColorPalette, stripPageDefaults, stripConfigDefaults, DEFAULT_DEBUG_CONFIG, resolveDebugConfig, stripDebugDefaults, DEFAULT_HTML_VIEWER_CONFIG, resolveHtmlViewerConfig, stripHtmlViewerDefaults, mergeConfigOverrides, applyHtmlViewerOverrides, DEFAULT_PDF_GENERATION_CONFIG, resolvePdfGenerationConfig, stripPdfGenerationDefaults, DEFAULT_HEADER_FOOTER_SLOT, DEFAULT_HEADER_SLOT, DEFAULT_FOOTER_SLOT, DEFAULT_TEXT_ELEMENT, DEFAULT_RULE_ELEMENT, resolveHeaderFooterConfig, stripHeaderFooterDefaults, defaultResourceTypes, DEFAULT_PARTS_CONFIG, resolvePartsConfig, stripPartsDefaults, DEFAULT_HEADING_STYLES, resolveHeadingStylesConfig, stripHeadingStylesDefaults, DEFAULT_TOC_CONFIG, resolveTocConfig, stripTocDefaults, DEFAULT_FOOTNOTES_CONFIG, resolveFootnotesConfig, stripFootnotesDefaults, DEFAULT_INDEX_CONFIG, resolveIndexConfig, stripIndexDefaults, DEFAULT_CJK_CONFIG, resolveCjkConfig, stripCjkDefaults, defaultCjkLineBreak, defaultCjkPunctuationWidth, defaultCjkCompression } from './defaults';
export { resolvePlaceholders, computeChapterTitles, computeChapterTitlesAtTop, computeChapterNumbers, computeChapterNumbersAtTop, collectPlaceholderNames, isKnownPlaceholder, isMetadataPlaceholder, computeChapterAttrs, computePartValues, blockLinesText } from './pipeline/placeholders';
export type { PlaceholderContext, PlaceholderResult, PlaceholderResolveOptions, ChapterTitlePageInfo, PartPageInfo, PageMarks } from './pipeline/placeholders';
export { resolveDesignPlaceholders, allowedPlaceholdersFor, isAllowedPlaceholder, configUsesPlaceholder } from './design/placeholders';
export type { DesignPlaceholderContext, DesignContextKind, HeadingPlaceholderInfo } from './design/placeholders';
export { layoutDesignSlot } from './design/layout';
export type { DesignSlotLayout, LayoutContext, LayoutIssue, ResolvedPrimitive, ResolvedTextPrimitive, ResolvedRulePrimitive, ResolvedBoxPrimitive, ResolvedImagePrimitive, WrappedLine, DesignFrames } from './design/layout';
export { classifyPages } from './pipeline/pageRoles';
export { migrateLegacyHeaderFooterConfig, isLegacyHeaderFooterSlot, resolveDesignSlot, stripDesignSlotDefaults, DEFAULT_BOX_ELEMENT } from './defaults/headerFooter';
export type {
  PostextContent,
  LayoutContinuation,
  OutlineEntry,
  HeadingStyleConfig,
  ResolvedHeadingStyleConfig,
  ResolvedHeadingStyleOverrides,
  SectionBodyStyleConfig,
  ResolvedSectionBodyStyleConfig,
  TocConfig,
  IndexConfig,
  IndexGroupsConfig,
  IndexGroupBy,
  ResolvedIndexConfig,
  OutlineIndexMark,
  TocLevelConfig,
  TocEntryStyleConfig,
  ResolvedTocConfig,
  ResolvedTocLevelConfig,
  ResolvedTocEntryStyleConfig,
  DesignImageElement,
  ResolvedDesignImageElement,
  HeadingCounters,
  ResourceNumberEntry,
  DocumentMetadata,
  PostextResource,
  ResourceType,
  ResourceKind,
  ResourceCounterFormat,
  ResourceCounterReset,
  ResourceFloatPosition,
  ResourceFloatSpan,
  ResourceRotation,
  ResourcePlacement,
  Resource,
  TableCell,
  TableCellAlign,
  TableCellImage,
  TableCellVerticalAlign,
  TableCellPos,
  TableModel,
  PostextNote,
  PostextConfig,
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
  ColumnBalancingConfig,
  ClosingBoxLever,
  KeepWithNextSplit,
  ColonListRoom,
  ParagraphContainerSpacing,
  LayoutConfig,
  ResolvedLayoutConfig,
  InlineResourceGap,
  TextAlign,
  HyphenationLocale,
  LocaleTag,
  HyphenationConfig,
  ResolvedHyphenationConfig,
  BodyTextConfig,
  ResolvedBodyTextConfig,
  BlockquoteConfig,
  ResolvedBlockquoteConfig,
  HeadingLevelConfig,
  ResolvedHeadingLevelConfig,
  HeadingsConfig,
  ResolvedHeadingsConfig,
  TableStyleConfig,
  ResolvedTableStyleConfig,
  NamedTableStyleConfig,
  ResolvedNamedTableStyleConfig,
  TableRules,
  TableOverflow,
  TableTextTransform,
  CaptionStyleConfig,
  ResolvedCaptionStyleConfig,
  CaptionPosition,
  CaptionNoteStyleConfig,
  ResolvedCaptionNoteStyleConfig,
  DiagramStyleConfig,
  ResolvedDiagramStyleConfig,
  ParagraphStyleConfig,
  ResolvedParagraphStyleConfig,
  ParagraphTextTransform,
  CalloutStyleConfig,
  CalloutFixedConfig,
  ResolvedCalloutStyleConfig,
  ChipStyleConfig,
  ResolvedChipStyleConfig,
  CalloutSpan,
  CalloutSideAtColumnEnd,
  CalloutPlacement,
  CalloutWidth,
  CalloutStripeSide,
  CalloutIconKind,
  CalloutIconAlign,
  CalloutIconPosition,
  CalloutIconCornerSide,
  CalloutLabelConfig,
  CalloutTextTransform,
  CalloutMarkerTextAlign,
  CalloutBorderConfig,
  CalloutPaddingConfig,
  CalloutStripeConfig,
  CalloutIconConfig,
  CalloutMarkerConfig,
  CalloutMarkerRuleConfig,
  CalloutTitleStyleConfig,
  CalloutBodyStyleConfig,
  CalloutListStyleConfig,
  PartsConfig,
  PartsBreakBeforeConfig,
  PartsBreakAfterConfig,
  PartsBodyStyleConfig,
  ResolvedPartsConfig,
  ResolvedPartsBreakBeforeConfig,
  ResolvedPartsBreakAfterConfig,
  ResolvedPartsBodyStyleConfig,
  HeadingTextTransform,
  UnorderedListLevelConfig,
  ResolvedUnorderedListLevelConfig,
  UnorderedListsConfig,
  ResolvedUnorderedListsConfig,
  OrderedListLevelConfig,
  ResolvedOrderedListLevelConfig,
  OrderedListsConfig,
  ResolvedOrderedListsConfig,
  OrderedListNumberWidth,
  OrderedListNumberFormat,
  SyncIndicatorConfig,
  DebugConfig,
  ResolvedDebugConfig,
  WarningsToggleConfig,
  ResolvedWarningsToggleConfig,
  HtmlViewerConfig,
  HtmlViewerOverrides,
  ResolvedHtmlViewerConfig,
  MathConfig,
  ResolvedMathConfig,
  FootnotesConfig,
  ResolvedFootnotesConfig,
  CjkConfig,
  CjkRegion,
  CjkLineBreak,
  CjkPunctuationWidth,
  CjkHangingPunctuation,
  CjkGridConfig,
  ResolvedCjkConfig,
  ResolvedCjkGridConfig,
  FootnotePlacement,
  FootnoteNumbering,
  FootnoteSeparatorConfig,
  PdfColorSpace,
  PdfGenerationConfig,
  ResolvedPdfGenerationConfig,
  CustomFontFormat,
  CustomFontStyle,
  CustomFontVariant,
  CustomFontFamily,
  PageParity,
  PageRole,
  PageRoleFilter,
  HeaderFooterHAlign,
  HeaderFooterTextElement,
  HeaderFooterRuleElement,
  HeaderFooterElement,
  HeaderFooterSlot,
  ResolvedHeaderFooterTextElement,
  ResolvedHeaderFooterRuleElement,
  ResolvedHeaderFooterElement,
  ResolvedHeaderFooterSlot,
  HAlign,
  DesignTextAlign,
  VAlign,
  AnchorEdge,
  ElementAnchor,
  ElementPlacement,
  ElementSize,
  ElementBoxStyle,
  TextOverflow,
  DesignTextStroke,
  DesignTextElement,
  DesignRuleElement,
  DesignBoxElement,
  DesignElement,
  DesignSlot,
  ResolvedDesignTextElement,
  ResolvedDesignRuleElement,
  ResolvedDesignBoxElement,
  ResolvedDesignElement,
  ResolvedDesignSlot,
  LegacyHeaderFooterTextElement,
  LegacyHeaderFooterRuleElement,
  LegacyHeaderFooterElement,
  LegacyHeaderFooterSlot,
  HeadingSpan,
  HeadingAdvancedDesignConfig,
  ResolvedHeadingAdvancedDesignConfig,
} from './types';
export type {
  BoundingBox,
  ResolvedConfig,
  VDTBlockType,
  VDTLineSegment,
  VDTChip,
  VDTChipRun,
  VDTLine,
  VDTBlock,
  VDTColumn,
  VDTColumnRule,
  VDTFootnoteArea,
  VDTPage,
  VDTDocument,
  VDTHeaderFooterSlot,
  VDTHeaderFooterBlock,
  VDTHeaderFooterTextBlock,
  VDTRuleBlock,
  VDTDesignSlot,
  VDTDesignBlock,
  VDTDesignTextBlock,
  VDTDesignTextLine,
  VDTDesignTextRun,
  VDTDesignTextStroke,
  VDTDesignRuleBlock,
  VDTDesignBoxBlock,
  VDTDesignImageBlock,
  VDTDesignBoxStyle,
  ResolvedResourceBlock,
  ResolvedCalloutBlock,
  VDTCaptionBar,
  VDTBalancing,
  BalanceLever,
  LayoutWarning,
  ConfigWarning,
  CalloutOverflowWarning,
  ContentWarning,
  MissingImageWarning,
  RenderWarning,
  VDTResourceTableCell,
  VDTResourceTableCellImage,
  VDTResourceTableLayout,
  RoundedOutline,
  VDTResourceRotation,
  TableCellFillRects,
} from './vdt';
export { resourceBlockToPage, resourceBlockToLocal, resourceBlockRectToPage, tableFrameOutline, tableCellFill, tableCellFillRects } from './vdt';
export { computeColumnEdges } from './pipeline/resourceLayout';
export type { ContentBlock, ContentBlockType, DirectiveAttrs, DirectiveName, ContainerName, RefCase, InlineSpan, InlineLink, TextSpan, MathSpan, MathMeta, ListKind, ParseIssue, ParseIssueKind, UnclosedMathIssue, UnclosedContainerIssue, TocBlockInfo, IndexBlockInfo, IndexMark, ChipBox } from './parse';
export { parseMarkdownWithIssues, MATH_PLACEHOLDER, SWATCH_PLACEHOLDER, CHIP_PLACEHOLDER, KNOWN_DIRECTIVES, KNOWN_CONTAINERS, spaceDirectiveLines, MAX_SPACE_LINES } from './parse';
export { computeSourceMap, parseInlineSnippetSpans, mapInlineSnippet } from './parse';
export type { InlineSnippetMapping } from './parse';
export { buildPageLabels, collectPageLabelRuns, formatNumeral, parseNumberFormat, chineseInformalStyle, EAST_ASIAN_NUMERAL_STYLES } from './numbering';
export type { NumeralStyle, NumberFormatStyle, EastAsianNumeralStyle, PageNumberSegment, PageLabelInfo, PageLabelRun } from './numbering';
export { parseChineseNumeral } from './chineseNumerals';
export { collectConfigWarnings } from './configWarnings';
export type { MathRender, MathPath, MathViewBox } from './math/types';
export { initMathEngine, isMathReady, onMathReady, renderMath, placeholderRender, clearMathCache } from './math';
export { applySingleInkToSvg } from './svg/singleInk';

// `.postext` bundles. The `postext/bundle` subpath carries the same API plus
// the low-level manifest helpers.
export { openBundle, createBundle, buildBundle, loadBundleFonts, registerBundleImages, bundleImageUrl, bundleResourceBytes, bundleFontProvider, readBundle, planBundle, resolveBundleFiles, openBundleZip, zipBundle, isBundleManifest, POSTEXT_EXTENSION } from './bundle';
export type { PostextBundle, OpenBundleOptions, CreateBundleInput, CreateBundleLocale, CreatedBundle, BundleFileData, BuildBundleOptions, BundleSource, BundleFontProviderOptions, BundleFontRequest, BundleManifest, BundleManifestV1, BundleManifestV2, BundleChapter, BundleFontFile, ReadBundleOptions, ReadBundleResult, ZipBundleOptions } from './bundle';
