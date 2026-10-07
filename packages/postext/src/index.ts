export { createLayout } from './createLayout';
export { buildDocument, BuildCancelledError, continuationAfter, contentOutline, computeOutline, computeOutlineFor, outlineFromDoc, outlineKey, sameOutline, hasTocDirective, hasIndexDirective, tocOutline, indexOutline, anchorOutline, hasAnchors, locateAnchors, duplicateAnchors } from './pipeline';
export type { BuildDocumentOptions } from './pipeline';
export { formatFootnoteNumber, footnoteFormatOf, footnoteSymbol, DEFAULT_FOOTNOTE_SYMBOLS } from './pipeline/footnotes';
export type { FootnoteFormat } from './pipeline/footnotes';
export { renderToCanvas, renderPage, renderPageToCanvas, registerResourceImage, unregisterResourceImage, clearResourceImages, getResourceImage, registerVerticalAlternates, unregisterVerticalAlternates, loadVerticalAlternates, verticalTwinName, VERTICAL_ALTERNATE_SAMPLE } from './canvas-backend';
export type { RenderPageOptions, ResourceImageSource, RegisterResourceImageOptions, VerticalAlternatesFace } from './canvas-backend';
export { renderToHtml, renderToHtmlIndexed, anchoredResourceIds, HTML_TEXT_RESET } from './html-backend';
export { renderComicHtml, comicPanelSvg } from './htmlComic';
export type { ComicHtmlPaint, ComicPanelSvgOptions } from './htmlComic';
export type { RenderHtmlOptions, HtmlRenderIndex, HtmlRenderIndexPage } from './html-backend';
export { dimensionToPx } from './units';
export { computePageTextExtent } from './vdt';
export { columnRuleSegments, footnoteRuleSegments, pageColumnRule } from './columnRule';
export type { FootnoteRuleSegment } from './columnRule';
export { cropMarkSegments } from './cropMarks';
export type { CropMarkSegment } from './cropMarks';
export { columnClipRect, designOverlayOverhang, headingDesignOverhangAbove, hangingPunctuationOverhang } from './columnClip';
export { lineInkExtent } from './lineInk';
export { applyCjkGrid, cjkGridGeometry, cjkGridCells, CHARACTER_GRID_COLOR } from './pipeline/cjkGrid';
export type { CjkGridGeometry, CjkGridCells } from './pipeline/cjkGrid';
export type { ColumnRuleSegment } from './columnRule';
export { findLooseLines, drawLooseLines, lineLooseness } from './looseLines';
export type { LooseLine, FindLooseLinesOptions, DrawLooseLinesOptions } from './looseLines';
export { primaryFontFamily } from './measure/font';
export { buildFontString, measureBlock, measureRichBlock, measureGlyphWidth, initHyphenator, clearMeasurementCache, createMeasurementCache, cachedMeasureBlock, cachedMeasureRichBlock, setCjkLineBreak, getCjkLineBreak, setCjkComposition, getCjkComposition, cjkCompositionOf, punctuationAdvance, punctuationSide, PLAIN_CJK_COMPOSITION } from './measure';
export type { CjkComposition, PunctuationSide } from './measure';
export type { BreakTrace, LineWidthStep, MeasuredBlock, MeasureBlockOptions, MeasurementCache } from './measure';
export { hyphenateText, setHyphenationLocale, HYPHENATION_LOCALES, matchHyphenationLocale } from './hyphenate';
export { DOCUMENT_LANGUAGES, isCjkLanguage, isJapaneseLanguage, isUnhyphenatedLanguage, localeScript, chineseScriptOf, cjkRegionOf, stringsKeyOf, sameContentLocale, matchContentLocale, canonicalLocaleTag, renderLangOf, stringsFor, directionOf, defaultNumeralsFor } from './locale';
export type { DocumentLanguage } from './locale';
export { parseMarkdown } from './parse';
export { addRow, addColumn, removeRow, removeColumn, mergeCells, unmergeCell, setCellContent, setCellImage, setCellBackground, setAlignment, parseTSV, tableGridIssues } from './table/model';
export type { CellPos, CellRange, ParseTSVOptions, TableGridIssue } from './table/model';
export { collectContentWarnings, formatWarning } from './pipeline/contentWarnings';
export { collectHeadingDesignCuts } from './pipeline/headingDesignCuts';
export { normalizeSafeArea, resourceSafeArea, safeAreaHeightRange, safeAreaSource, uncroppedPictureBox } from './pipeline/safeArea';
export {
  parseComicSplit, serializeComicSplit, moveComicSplitLine, splitComicCell, mergeComicCells, comicSplitLines, comicSplitLeaves, comicSplitListAt, COMIC_MIN_CELL_PERCENT,
  parseComicScript, parseComicPoint, readBalloonText, parseComicFence, isComicFence, COMIC_FENCES,
  comicGeometry, pointInPolygon, polygonBBox, physicalSide,
  comicArtCrop, comicCropFeasibleRange, comicArtPointToPage, comicArtRectToPage, anchorsOutsideSafeArea,
  layoutComicPage, comicViewerLeaf, letterPanels, comicPageDirection, comicPanelPadding, parseComicDimension, comicPageLayoutWarnings,
  comicSourceWarnings, COMIC_RESERVED_KEYS,
  layoutComicFrame, comicPageFrame, layoutComicStrip, comicStripPlacement, comicStripExtent, comicStripAspect, comicSplitGrid, parseComicAspect,
  layoutComicSpread, isComicSpread,
  translateComicPage, translateComicPanel, translateComicSplitter, translateComicBalloon, translateSvgPath, comicBlockOnSheet, pageComics,
  comicLetteringStyle, comicLetteringLocale, comicLetteringVertical, comicFontFamilies, markdownHasComics,
  letterPanel, letterPanelDetailed, presetLetteringStyles,
  comicBalloonKind, comicBalloonText, comicSpeakerName, comicBalloonGroups, comicPanelPathData, comicBorderPathData, polygonPathData,
} from './comics';
export type {
  ComicSplitAxis, ComicSplitSize, ComicSplitItem, ComicSplitList, ComicSplitToken, ComicSplitIssue, ComicSplitParse, ComicScriptLine,
  ComicCell, ComicSplitLine, ComicGeometry, ComicGeometryInput, ComicFrameSide, ComicCropInput, ComicCrop, ComicPageContext, LetterPanelsInput,
  LetteringItem, LetteringPanel, LetteringStyle, LetteringAnchor, LetteringDiagnostic, LetteringResult, LetteringEnv,
  ComicPageSource, ComicPanelSource, ComicScriptItem, ComicScriptRole, ComicSourceRange, ComicTailSide,
  ComicFrameContext, ComicStripPlacement, ComicStripContext, ComicSpreadContext, ComicSpreadPage, ComicBalloonKind,
} from './comics';
export { renderComicPanels, renderComicPanel, comicPanelPath, comicRoughBorder, renderComicBalloons, renderComicBalloon, renderComicPage } from './canvas-backend/comic';
export { DEFAULT_PANEL_STYLE, DEFAULT_COMIC_GUTTER, DEFAULT_LETTERING_STATIC, DEFAULT_BALLOON_STYLES, DEFAULT_BALLOON_STYLE_IDS, defaultComicFont, defaultComicSfxFont, resolveComicsConfig, resolvedComics, pickPanelStyle, pickBalloonStyle, stripComicsDefaults } from './defaults/comics';
export { layoutVideo, playMarkTriangle, qrModuleRuns } from './pipeline/videoOverlay';
export { encodeQr } from './video/qr';
export { coordinateVideoPlayback, playsAlongside, videosToPause, VIDEO_PLAYBACK_SCRIPT } from './video/playback';
export type { QrMatrix, QrErrorCorrection } from './video/qr';
export { parseVideoUrl, videoWatchUrl, resourceVideoLink, videoEmbedUrl, videoEmbedAllow, videoElementAttributes, mediaFragment, videoMimeType, videoFormatOfUrl, resourceVideoFormat, isHlsMimeType, HLS_MIME_TYPE, youtubePosterUrls } from './video/url';
export type { ParsedVideoUrl } from './video/url';
export type { HeadingDesignCut } from './pipeline/headingDesignCuts';
export { extractFrontmatter, metadataText } from './frontmatter';
export type { ParsedFrontmatter } from './frontmatter';
export { DEFAULT_PAGE_CONFIG, DEFAULT_CUT_LINES, DEFAULT_PAGE_NUMBERING, PAGE_SIZE_PRESETS, resolvePageConfig, DEFAULT_LAYOUT_CONFIG, DEFAULT_COLUMN_RULE, DEFAULT_COLUMN_BALANCING, resolveLayoutConfig, stripLayoutDefaults, DEFAULT_BODY_TEXT_CONFIG, DEFAULT_HYPHENATION_CONFIG, DEFAULT_BLOCKQUOTE_CONFIG, resolveBodyTextConfig, stripBodyTextDefaults, hyphenationEqual, DEFAULT_HEADINGS_CONFIG, resolveHeadingsConfig, stripHeadingsDefaults, resolveTableStyleConfig, stripTableStyleDefaults, resolveTableStylesConfig, stripTableStylesDefaults, pickTableStyle, defaultTableContinuationStrings, resolveCaptionStyleConfig, stripCaptionStyleDefaults, mergeCaptionStyle, defaultCaptionLabels, DEFAULT_DIAGRAM_STYLE_CONFIG, resolveDiagramStyleConfig, stripDiagramStyleDefaults, DEFAULT_VIDEO_STYLE_CONFIG, DEFAULT_VIDEO_PLAYER_OPTIONS, resolveVideoStyleConfig, resolveVideoPlayerOptions, stripVideoStyleDefaults, DEFAULT_PARAGRAPH_STYLES, resolveParagraphStylesConfig, stripParagraphStylesDefaults, DEFAULT_CALLOUT_STYLES, DEFAULT_CALLOUT_STYLE_STATIC, resolveCalloutStylesConfig, stripCalloutStylesDefaults, DEFAULT_CHIP_STYLES, DEFAULT_CHIP_STYLE_STATIC, resolveChipStylesConfig, stripChipStylesDefaults, pickChipStyle, DEFAULT_UNORDERED_LISTS_STATIC, resolveUnorderedListsConfig, stripUnorderedListsDefaults, DEFAULT_ORDERED_LISTS_STATIC, resolveOrderedListsConfig, stripOrderedListsDefaults, DEFAULT_MATH_CONFIG, resolveMathConfig, stripMathDefaults, dimensionsEqual, colorsEqual, resolveColorValue, applyPaletteToConfig, applyPaletteToResolvedConfig, DEFAULT_COLOR_PALETTE, DEFAULT_MAIN_COLOR, DEFAULT_MAIN_COLOR_ID, DEFAULT_MAIN_COLOR_NAME, DEFAULT_MAIN_COLOR_HEX, cloneDefaultColorPalette, isDefaultColorPalette, stripPageDefaults, stripConfigDefaults, DEFAULT_DEBUG_CONFIG, resolveDebugConfig, stripDebugDefaults, DEFAULT_HTML_VIEWER_CONFIG, resolveHtmlViewerConfig, stripHtmlViewerDefaults, mergeConfigOverrides, applyHtmlViewerOverrides, DEFAULT_PDF_GENERATION_CONFIG, resolvePdfGenerationConfig, stripPdfGenerationDefaults, FOLIO_PAPER_STOCKS, FOLIO_MAX_TILT, DEFAULT_FOLIO_CONFIG, isNewspaperSizePreset, folioDefaultsFor, folioForTrim, resolveFolioConfig, stripFolioDefaults, wrapFolioYaw, DEFAULT_HEADER_FOOTER_SLOT, DEFAULT_HEADER_SLOT, DEFAULT_FOOTER_SLOT, DEFAULT_TEXT_ELEMENT, DEFAULT_RULE_ELEMENT, resolveHeaderFooterConfig, stripHeaderFooterDefaults, defaultResourceTypes, defaultVideoResourceType, effectiveResourceTypes, DEFAULT_PARTS_CONFIG, resolvePartsConfig, stripPartsDefaults, DEFAULT_HEADING_STYLES, resolveHeadingStylesConfig, stripHeadingStylesDefaults, DEFAULT_TOC_CONFIG, resolveTocConfig, stripTocDefaults, DEFAULT_FOOTNOTES_CONFIG, resolveFootnotesConfig, stripFootnotesDefaults, parseFootnoteNumberFormat, resolveCrossRefsConfig, stripCrossRefsDefaults, DEFAULT_CITATIONS_CONFIG, resolveCitationsConfig, stripCitationsDefaults, DEFAULT_INDEX_CONFIG, resolveIndexConfig, stripIndexDefaults, DEFAULT_CJK_CONFIG, resolveCjkConfig, stripCjkDefaults, defaultCjkLineBreak, defaultCjkPunctuationWidth, defaultCjkCompression, defaultCjkEmphasis, defaultCjkBookTitleMark, defaultCjkBookTitleBrackets, defaultCjkEmphasisMark, defaultCjkWarichuBrackets, defaultCjkHangingPunctuation, defaultCjkSpaceAfterQuestion, defaultCjkParagraphStartBracket, defaultCjkRubyOverhang, defaultCjkRubyAlign } from './defaults';
export type { FolioPaperStock } from './defaults';
export { resolvePlaceholders, computeChapterTitles, computeChapterTitlesAtTop, computeChapterNumbers, computeChapterNumbersAtTop, collectPlaceholderNames, isKnownPlaceholder, isMetadataPlaceholder, computeChapterAttrs, computePartValues, blockLinesText, plainTitleText } from './pipeline/placeholders';
export type { PlaceholderContext, PlaceholderResult, PlaceholderResolveOptions, ChapterTitlePageInfo, PartPageInfo, PageMarks, BlockLinesTextOptions } from './pipeline/placeholders';
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
  ResourceSafeArea,
  ResourceAnchor,
  ComicsConfig,
  ResolvedComicsConfig,
  ComicReadingDirection,
  ComicPanelBorderStyle,
  ComicPanelFit,
  PanelStyleConfig,
  NamedPanelStyleConfig,
  ResolvedPanelStyleConfig,
  ResolvedNamedPanelStyleConfig,
  LetteringConfig,
  ResolvedLetteringConfig,
  ComicBalloonShape,
  ComicBalloonTail,
  ComicBalloonPosition,
  BalloonStyleConfig,
  ResolvedBalloonStyleConfig,
  ComicCastMember,
  ComicViewerLeafConfig,
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
  WritingMode,
  PageBinding,
  ColumnRuleConfig,
  ColumnBalancingConfig,
  ClosingBoxLever,
  KeepWithNextSplit,
  ColonListRoom,
  ParagraphContainerSpacing,
  EmphasisStyle,
  TashkilMode,
  LayoutConfig,
  ResolvedLayoutConfig,
  InlineResourceGap,
  TextAlign,
  HyphenationLocale,
  LocaleTag,
  DocumentDirection,
  DigitSystem,
  NumeralsSetting,
  HyphenationConfig,
  ResolvedHyphenationConfig,
  BodyTextConfig,
  ResolvedBodyTextConfig,
  KashidaSetting,
  KashidaPatterns,
  ResolvedKashidaConfig,
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
  VideoSource,
  VideoPlayerOptions,
  ResolvedVideoPlayerOptions,
  ResourceVideo,
  ResourceVideoPoster,
  VideoOverlayPosition,
  VideoPlayMarkConfig,
  VideoQrConfig,
  VideoStyleConfig,
  ResolvedVideoPlayMarkConfig,
  ResolvedVideoQrConfig,
  ResolvedVideoStyleConfig,
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
  CrossRefsConfig,
  ResolvedCrossRefsConfig,
  CitationsConfig,
  ResolvedCitationsConfig,
  CjkConfig,
  CjkRegion,
  CjkLineBreak,
  CjkPunctuationWidth,
  CjkHangingPunctuation,
  CjkWordBreak,
  CjkGridConfig,
  CjkEmphasis,
  CjkBookTitleMark,
  CjkBracketPair,
  CjkEmphasisMarkConfig,
  CjkEmphasisMarkStyle,
  ResolvedCjkEmphasisMarkConfig,
  CjkRubyPosition,
  CjkRubyConfig,
  CjkRubyOverhang,
  CjkRubyAlign,
  CjkWarichuConfig,
  CjkKuntenConfig,
  CjkKuntenPlacement,
  ResolvedCjkConfig,
  ResolvedCjkGridConfig,
  ResolvedCjkRubyConfig,
  ResolvedCjkWarichuConfig,
  ResolvedCjkKuntenConfig,
  FootnotePlacement,
  FootnoteNumbering,
  FootnoteNumberFormat,
  FootnoteMarkerPosition,
  FootnoteSeparatorConfig,
  PdfColorSpace,
  PdfGenerationConfig,
  ResolvedPdfGenerationConfig,
  FolioConfig,
  FolioPaperConfig,
  FolioBindingConfig,
  FolioSurfaceConfig,
  FolioLightingConfig,
  ResolvedFolioConfig,
  FolioPaperType,
  FolioPaperFinish,
  FolioPaperTexture,
  FolioBindingType,
  FolioCoverMaterial,
  FolioCoverSource,
  FolioSurfaceType,
  FolioEnvironment,
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
  HeadingNumberPosition,
  HeadingAdvancedDesignConfig,
  ResolvedHeadingAdvancedDesignConfig,
} from './types';
export type {
  BoundingBox,
  ResolvedConfig,
  VDTBlockType,
  VDTLineSegment,
  VDTSegmentMarks,
  VDTAnnotationRun,
  VDTRuby,
  VDTKunten,
  VDTWarichu,
  VDTLineMark,
  VDTChip,
  VDTChipRun,
  VDTLine,
  VDTAnchor,
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
  VDTResourceVideo,
  VDTVideoPlayMark,
  VDTVideoQr,
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
  VDTFlowFrame,
  VDTVerticalFlowFrame,
  VDTMirroredFlowFrame,
  TableCellFillRects,
  VDTPoint,
  VDTComicArt,
  VDTComicPanel,
  VDTComicSplitter,
  VDTComicBalloon,
  VDTComicPage,
} from './vdt';
export { resourceBlockToPage, resourceBlockToLocal, resourceBlockRectToPage, tableFrameOutline, tableCellFill, tableCellFillRects } from './vdt';
export { flowToPage, pageToFlow, flowRectToPage, pageRectToFlow, pageIsVertical, pageIsMirrored, verticalFlowOf, lineTextAlign, DEFAULT_CENTRAL_BASELINE } from './vdt';
export { verticalOrientation, verticalRuns, uaxVerticalOrientation, isVerticalCell, verticalCellEms, CORNER_OFFSET_EM, uprightDigitRuns, forcedVerticalRuns, segmentOrientation } from './writingMode';
export { graphemesOf } from './measure/graphemes';
export type { VerticalGlyph, VerticalOrientationKind, VerticalRun, UaxVerticalOrientation, UprightDigits, ForcedOrientation } from './writingMode';
export {
  bidiClassOf, isRtlScriptChar, needsBidi, mirroredChar, mirroredCodePoint, joiningTypeOf, hasJoiningScript, joinsWithNext,
  joinsLetters, resolveParagraph, resolveSpans, spanIsolates, lineLevels, visualOrder, lineVisualOrder, lineRuns, BIDI_CLASS_NAMES,
} from './bidi';
export type { BidiClass, BaseDirection, BidiParagraph, BidiIsolate, BidiRun, JoiningType } from './bidi';
export { computeColumnEdges } from './pipeline/resourceLayout';
export { findAnnotations } from './parse/annotations';
export type { FoundAnnotation, AnnotationName } from './parse/annotations';
export type { ContentBlock, ContentBlockType, DirectiveAttrs, VerseInfo, DirectiveName, ContainerName, RefCase, InlineSpan, InlineLink, TextSpan, MathSpan, MathMeta, ListKind, ParseIssue, ParseIssueKind, UnclosedMathIssue, UnclosedContainerIssue, TocBlockInfo, IndexBlockInfo, IndexMark, ChipBox, EmphasisMark, InlineRuby, InlineWarichu, InlineDirection, InlineSideline, InlineKunten } from './parse';
export { parseMarkdownWithIssues, MATH_PLACEHOLDER, SWATCH_PLACEHOLDER, CHIP_PLACEHOLDER, KNOWN_DIRECTIVES, KNOWN_CONTAINERS, spaceDirectiveLines, MAX_SPACE_LINES } from './parse';
export { computeSourceMap, parseInlineSnippetSpans, mapInlineSnippet, orientationMarkAt, contentHasMath, resourceHasMath } from './parse';
export type { OrientationMark } from './parse';
export type { InlineSnippetMapping } from './parse';
export { buildPageLabels, collectPageLabelRuns, formatNumeral, documentNumeralStyle, parseNumberFormat, chineseInformalStyle, hanInformalStyle, EAST_ASIAN_NUMERAL_STYLES, ARABIC_NUMERAL_STYLES } from './numbering';
export type { NumeralStyle, NumberFormatStyle, EastAsianNumeralStyle, ArabicNumeralStyle, PageNumberSegment, PageLabelInfo, PageLabelRun } from './numbering';
export { withDigits, asciiDigits } from './arabicNumerals';
export { parseChineseNumeral } from './chineseNumerals';
export { collectConfigWarnings } from './configWarnings';
export type { MathRender, MathPath, MathViewBox } from './math/types';
export { initMathEngine, isMathReady, onMathReady, renderMath, placeholderRender, clearMathCache } from './math';
export { applySingleInkToSvg } from './svg/singleInk';

// `.postext` bundles. The `postext/bundle` subpath carries the same API plus
// the low-level manifest helpers.
export { openBundle, createBundle, buildBundle, loadBundleFonts, registerBundleImages, bundleImageUrl, bundleVideoUrl, bundleResourceBytes, bundleFontProvider, readBundle, planBundle, resolveBundleFiles, openBundleZip, zipBundle, isBundleManifest, POSTEXT_EXTENSION } from './bundle';
export type { PostextBundle, OpenBundleOptions, CreateBundleInput, CreateBundleLocale, CreatedBundle, BundleFileData, BuildBundleOptions, BundleSource, BundleFontProviderOptions, BundleFontRequest, BundleManifest, BundleManifestV1, BundleManifestV2, BundleChapter, BundleFontFile, ReadBundleOptions, ReadBundleResult, ZipBundleOptions } from './bundle';

// Citations (#267–#272): the engine registry and the data model a citation
// processor (`postext-citeproc`) implements.
export { registerCitationEngine, citationEngine, setCitationEngineLoader, ensureCitationEngine, mayNeedCitations } from './citations/registry';
export { bookCitationContexts, citationSourceOf, citationContextKey, needsCitationContext, type CitationContext, type CitationSource } from './citations/context';
export { parseLocator } from './parse/citations';
export { parseBibtex, latexToText, type BibtexIssue } from './citations/bibtex';
export { processCitations, citationLocale, defaultBibliographyTitle, type ProcessedCitations } from './pipeline/citations';
export type {
  CslItem,
  CslName,
  CslDate,
  CitationItemInput,
  CitationClusterInput,
  FormattedCitation,
  BibliographyEntryOutput,
  BibliographyOutput,
  CitationStyleInfo,
  CitationProcessor,
  CitationProcessorOptions,
  CitationEngine,
} from './citations/types';
