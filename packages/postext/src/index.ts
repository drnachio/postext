export { createLayout } from './createLayout.js';
export { registerCodeHighlighter, highlightCode, builtinCodeLanguage } from './code/highlight.js';
export { fencedCodeLines } from './parse/codeFence.js';
export type { CodeHighlighter, CodeToken } from './code/highlight.js';
export { buildDocument, resolveJumpMarks, BuildCancelledError, continuationAfter, contentOutline, pageFenceIds, laterPageIdsOf, computeOutline, computeOutlineFor, outlineFromDoc, outlineKey, sameOutline, hasTocDirective, hasIndexDirective, tocOutline, indexOutline, anchorOutline, hasAnchors, locateAnchors, duplicateAnchors, mergeCarriedOutline, carriedPlaces } from './pipeline/index.js';
export type { CarriedPlace } from './pipeline/index.js';
export type { BuildDocumentOptions } from './pipeline/index.js';
export type { ConfigOverride } from './defaults/configLayers.js';
export { formatFootnoteNumber, footnoteFormatOf, footnoteSymbol, DEFAULT_FOOTNOTE_SYMBOLS } from './pipeline/references/footnotes.js';
export type { FootnoteFormat } from './pipeline/references/footnotes.js';
export { renderToCanvas, renderPage, renderPageToCanvas, registerResourceImage, unregisterResourceImage, clearResourceImages, getResourceImage, registerVerticalAlternates, unregisterVerticalAlternates, loadVerticalAlternates, verticalTwinName, VERTICAL_ALTERNATE_SAMPLE } from './canvas-backend/index.js';
export type { RenderPageOptions, ResourceImageSource, RegisterResourceImageOptions, VerticalAlternatesFace } from './canvas-backend/index.js';
export { renderToHtml, renderToHtmlIndexed, anchoredResourceIds, HTML_TEXT_RESET } from './html-backend/html-backend.js';
export { renderComicHtml, comicPanelSvg } from './html-backend/htmlComic.js';
export type { ComicHtmlPaint, ComicPanelSvgOptions } from './html-backend/htmlComic.js';
export type { RenderHtmlOptions, HtmlRenderIndex, HtmlRenderIndexPage } from './html-backend/html-backend.js';
export { dimensionToPx } from './units.js';
export { computePageTextExtent } from './vdt.js';
export { columnRuleSegments, footnoteRuleSegments, pageColumnRule } from './paint/columnRule.js';
export type { FootnoteRuleSegment } from './paint/columnRule.js';
export { cropMarkSegments } from './paint/cropMarks.js';
export * from './color/index.js';
export { preflightDocument, placedImageResolutions } from './checks/preflight.js';
export type { PreflightIssue, PreflightKind, PreflightOptions, PreflightSeverity, PlacedImageResolution } from './checks/preflight.js';
export {
  contrastDocument,
  contrastPairs,
  contrastMedia,
  contrastRatio,
  contrastThreshold,
  relativeLuminance,
  isLargeText,
  blendColors,
  printContrastRatio,
  printLuminance,
  printSeparation,
} from './checks/contrast.js';
export type { ContrastAccepted, ContrastIssue, ContrastKind, ContrastMedium, ContrastOptions, ContrastPair, ContrastRole, PrintContrastContext, ReversedTextReason } from './checks/contrast.js';
export { bitmapResolutionFor, effectiveBitmapResolution, bitmapLayoutSize, isPlaceholderResolution } from './bitmapResolution.js';
export { bitmapResolutionOf } from './defaults/layout.js';
export { bitmapInfo, bitmapSize } from './bundle/index.js';
export type { BitmapInfo, BitmapFileResolution, BitmapResolutionSource } from './bundle/index.js';
// Contour wrap (#883): the shape of a picture text runs round, traced by
// the host from the file (the layout reads pictures by their size only).
export {
  traceResourceContour,
  withContourTrace,
  traceAlpha,
  decodePngAlpha,
  polygonRows,
  contourRowsOf,
  contourThreshold,
  DEFAULT_CONTOUR_THRESHOLD,
} from './contour/index.js';
export type { AlphaRaster, ContourRows, RgbaPixels, TraceContourOptions } from './contour/index.js';
export type { CropMarkSegment } from './paint/cropMarks.js';
export { columnClipRect, designOverlayOverhang, headingDesignOverhangAbove, hangingPunctuationOverhang } from './paint/columnClip.js';
export { lineInkExtent } from './paint/lineInk.js';
export { textDots, clearTextDots } from './paint/textDots.js';
export type { TextDots, TextDotsRequest } from './paint/textDots.js';
// The pieces of a word set as the word the layout measured (#770): the one
// rule of the canvas, the HTML and the PDF.
export { joinedWordPieces, lineWordSegments, lineWordSegmentsInOrder, cellsOf } from './paint/wordPieces.js';
export type { WordPiece, SetLine } from './paint/wordPieces.js';
export { applyCjkGrid, cjkGridGeometry, cjkGridCells, CHARACTER_GRID_COLOR } from './pipeline/text/cjkGrid.js';
export type { CjkGridGeometry, CjkGridCells } from './pipeline/text/cjkGrid.js';
export { balancingOnByDefault, avoidWidowsByDefault, avoidOrphansByDefault } from './pipeline/config.js';
export { renderTemplateNumber } from './pipeline/resources/resourceNumbering.js';
export type { ColumnRuleSegment } from './paint/columnRule.js';
export { findLooseLines, drawLooseLines, lineLooseness, lineWordSpacing } from './checks/looseLines.js';
export type { LooseLine, FindLooseLinesOptions, DrawLooseLinesOptions } from './checks/looseLines.js';
export { primaryFontFamily } from './measure/font.js';
export { buildFontString, measureBlock, measureRichBlock, measureGlyphWidth, initHyphenator, clearMeasurementCache, createMeasurementCache, cachedMeasureBlock, cachedMeasureRichBlock, setCjkLineBreak, getCjkLineBreak, setCjkComposition, getCjkComposition, cjkCompositionOf, punctuationAdvance, punctuationSide, PLAIN_CJK_COMPOSITION } from './measure/index.js';
export type { CjkComposition, PunctuationSide } from './measure/index.js';
export type { BreakTrace, LineInsetStep, LineWidthStep, MeasuredBlock, MeasureBlockOptions, MeasurementCache } from './measure/index.js';
export { hyphenateText, hyphenateByDictionary, setHyphenationLocale, setHyphenationRules, normalizeHyphenationExceptions, HYPHENATION_LOCALES, matchHyphenationLocale } from './hyphenation/hyphenate.js';
export type { HyphenationRules } from './hyphenation/hyphenate.js';
export { DOCUMENT_LANGUAGES, isCjkLanguage, isJapaneseLanguage, isUnhyphenatedLanguage, localeScript, chineseScriptOf, cjkRegionOf, stringsKeyOf, sameContentLocale, matchContentLocale, canonicalLocaleTag, renderLangOf, shapingLanguageOf, shapingTagOf, stringsFor, directionOf, comicsLocaleDirection, defaultNumeralsFor } from './hyphenation/locale.js';
export type { DocumentLanguage } from './hyphenation/locale.js';
export { parseMarkdown } from './parse/index.js';
export { addRow, addColumn, removeRow, removeColumn, mergeCells, unmergeCell, setCellContent, setCellImage, setCellBackground, setAlignment, parseTSV, tableGridIssues } from './table/model.js';
export type { CellPos, CellRange, ParseTSVOptions, TableGridIssue } from './table/model.js';
export { collectContentWarnings, formatWarning } from './pipeline/contentWarnings.js';
export { collectHeadingDesignCuts } from './pipeline/sections/headingDesignCuts.js';
export { normalizeSafeArea, resourceSafeArea, safeAreaHeightRange, safeAreaSource, uncroppedPictureBox } from './pipeline/resources/safeArea.js';
export {
  parseComicSplit, serializeComicSplit, moveComicSplitLine, splitComicCell, mergeComicCells, comicSplitLines, comicSplitLeaves, comicSplitListAt, COMIC_MIN_CELL_PERCENT,
  parseComicScript, parseComicPoint, readBalloonText, parseComicFence, isComicFence, COMIC_FENCES,
  comicGeometry, pointInPolygon, polygonBBox, physicalSide,
  comicArtCrop, comicCropFeasibleRange, comicArtPointToPage, comicArtRectToPage, anchorsOutsideSafeArea,
  layoutComicPage, comicViewerLeaf, letterPanels, comicPageDirection, comicPanelPadding, parseComicDimension, comicPageLayoutWarnings,
  comicSourceWarnings, COMIC_RESERVED_KEYS,
  layoutComicFrame, comicPageFrame, layoutComicStrip, comicStripPlacement, comicStripExtent, comicStripAspect, comicSplitGrid, parseComicAspect, parseComicStripWidth, parseComicStripAlign, comicStripWidth, comicStripOffset,
  layoutComicSpread, isComicSpread,
  translateComicPage, translateComicPanel, translateComicSplitter, translateComicBalloon, translateComicFrame, translateSvgPath, comicBlockOnSheet, pageComics,
  comicElementId, comicFrameElementId, comicBalloonElementId, comicFrameName, isComicTextPanel, comicBoxStyle, comicFrameSpecs, comicTextPanelsSupported,
  comicLetteringStyle, comicLetteringLocale, comicLetteringVertical, comicFontFamilies, markdownHasComics,
  letterPanel, letterPanelDetailed, presetLetteringStyles,
  comicBalloonKind, comicBalloonText, comicBalloonMatrix, comicSpeakerName, comicBalloonGroups, comicPanelPathData, comicBorderPathData, polygonPathData, comicPanelContinues, isComicSpreadPartner, joinComicSpread,
} from './comics/index.js';
export type {
  ComicSplitAxis, ComicSplitSize, ComicSplitItem, ComicSplitList, ComicSplitToken, ComicSplitIssue, ComicSplitParse, ComicScriptLine,
  ComicCell, ComicSplitLine, ComicGeometry, ComicGeometryInput, ComicFrameSide, ComicCropInput, ComicCrop, ComicPageContext, LetterPanelsInput,
  LetteringItem, LetteringPanel, LetteringStyle, LetteringAnchor, LetteringDiagnostic, LetteringResult, LetteringEnv,
  ComicPageSource, ComicPanelSource, ComicScriptItem, ComicScriptRole, ComicSourceRange, ComicTailSide,
  ComicFrameContext, ComicFrameSpec, ComicStripPlacement, ComicStripContext, ComicStripAlign, ComicSpreadContext, ComicSpreadPage, ComicBalloonKind,
} from './comics/index.js';
export { renderComicPanels, renderComicPanel, comicPanelPath, comicRoughBorder, renderComicBalloons, renderComicBalloon, renderComicPage } from './canvas-backend/comic.js';
export { DEFAULT_PANEL_STYLE, DEFAULT_COMIC_GUTTER, DEFAULT_LETTERING_STATIC, DEFAULT_BALLOON_STYLES, DEFAULT_BALLOON_STYLE_IDS, defaultComicFont, defaultComicSfxFont, resolveComicsConfig, resolvedComics, comicReadingDirection, pickPanelStyle, pickBalloonStyle, stripComicsDefaults } from './defaults/comics.js';
export type { ComicDirectionContext } from './defaults/comics.js';
export { layoutVideo, playMarkTriangle, qrModuleRuns } from './pipeline/resources/videoOverlay.js';
export { encodeQr } from './video/qr.js';
export { coordinateVideoPlayback, playsAlongside, videosToPause, VIDEO_PLAYBACK_SCRIPT } from './video/playback.js';
export { attachExercises, checkExerciseSlot, exercisePoints, exerciseSolutionValue, isGradedSlot, normalizeAnswer, EXERCISE_RUNTIME, EXERCISE_SCRIPT, type AttachExercisesOptions, type ExerciseResult, type ExerciseResultSlot, type ExerciseStore, type ExerciseValue } from './exercises/runtime.js';
export { exerciseDataJson, exerciseDataOf, type ExerciseData, type ExerciseDigital, type ExerciseDigitalStyleInfo, type ExerciseDigitalWords } from './exercises/digital.js';
export type { ExerciseGridInfo, ExerciseRecord, ExerciseSlot, ExerciseSlotKind } from './exercises/record.js';
export type { QrMatrix, QrErrorCorrection } from './video/qr.js';
export { parseVideoUrl, videoWatchUrl, resourceVideoLink, videoEmbedUrl, videoEmbedAllow, videoElementAttributes, mediaFragment, videoMimeType, videoFormatOfUrl, resourceVideoFormat, isHlsMimeType, HLS_MIME_TYPE, youtubePosterUrls } from './video/url.js';
export type { ParsedVideoUrl } from './video/url.js';
export type { HeadingDesignCut } from './pipeline/sections/headingDesignCuts.js';
export { extractFrontmatter, metadataText } from './parse/frontmatter.js';
export type { FrontmatterError, ParsedFrontmatter } from './parse/frontmatter.js';
export { DEFAULT_PAGE_CONFIG, DEFAULT_CUT_LINES, DEFAULT_PAGE_NUMBERING, PAGE_SIZE_PRESETS, resolvePageConfig, DEFAULT_LAYOUT_CONFIG, DEFAULT_FLOAT_MIN_SCALE, DEFAULT_MAX_TOP_FRACTION, DEFAULT_TEXT_WRAP, DEFAULT_COLUMN_RULE, DEFAULT_COLUMN_BALANCING, resolveLayoutConfig, stripLayoutDefaults, DEFAULT_BODY_TEXT_CONFIG, DEFAULT_HYPHENATION_CONFIG, DEFAULT_BLOCKQUOTE_CONFIG, DEFAULT_VERSE_CONFIG, resolveVerseConfig, stripVerseDefaults, resolveBodyTextConfig, stripBodyTextDefaults, hyphenationEqual, DEFAULT_HEADINGS_CONFIG, resolveHeadingsConfig, stripHeadingsDefaults, resolveTableStyleConfig, stripTableStyleDefaults, resolveTableStylesConfig, stripTableStylesDefaults, pickTableStyle, defaultTableContinuationStrings, resolveCaptionStyleConfig, stripCaptionStyleDefaults, mergeCaptionStyle, defaultCaptionLabels, DEFAULT_DIAGRAM_STYLE_CONFIG, resolveDiagramStyleConfig, stripDiagramStyleDefaults, DEFAULT_SCORE_STYLE_CONFIG, resolveScoreStyleConfig, resolveScoreStylesConfig, pickScoreStyle, stripScoreStyleDefaults, stripScoreStylesDefaults, DEFAULT_VIDEO_STYLE_CONFIG, DEFAULT_VIDEO_PLAYER_OPTIONS, resolveVideoStyleConfig, resolveVideoPlayerOptions, stripVideoStyleDefaults, DEFAULT_PARAGRAPH_STYLES, resolveParagraphStylesConfig, stripParagraphStylesDefaults, DEFAULT_CALLOUT_STYLES, DEFAULT_CALLOUT_STYLE_STATIC, resolveCalloutStylesConfig, stripCalloutStylesDefaults, inheritCalloutStyles, calloutStyleChain, DEFAULT_CHIP_STYLES, DEFAULT_CHIP_STYLE_STATIC, resolveChipStylesConfig, stripChipStylesDefaults, pickChipStyle, DEFAULT_MARK_STYLES, DEFAULT_MARK_STYLE_STATIC, resolveMarkStylesConfig, stripMarkStylesDefaults, pickMarkStyle, DEFAULT_UNORDERED_LISTS_STATIC, resolveUnorderedListsConfig, stripUnorderedListsDefaults, DEFAULT_ORDERED_LISTS_STATIC, resolveOrderedListsConfig, stripOrderedListsDefaults, DEFAULT_MATH_CONFIG, resolveMathConfig, stripMathDefaults, dimensionsEqual, colorsEqual, resolveColorValue, applyPaletteToConfig, applyPaletteToResolvedConfig, DEFAULT_COLOR_PALETTE, DEFAULT_MAIN_COLOR, DEFAULT_MAIN_COLOR_ID, DEFAULT_MAIN_COLOR_NAME, DEFAULT_MAIN_COLOR_HEX, cloneDefaultColorPalette, isDefaultColorPalette, stripPageDefaults, stripConfigDefaults, DEFAULT_DEBUG_CONFIG, FIT_MARKS_MODES, resolveDebugConfig, stripDebugDefaults, DEFAULT_CANVAS_VIEWER_CONFIG, CANVAS_VIEWER_MAX_GAP, resolveCanvasViewerConfig, stripCanvasViewerDefaults, DEFAULT_HTML_VIEWER_CONFIG, resolveHtmlViewerConfig, stripHtmlViewerDefaults, mergeConfigOverrides, applyHtmlViewerOverrides, mergeConfigLayers, diffConfigLayers, leastConfigOverride, commonConfig, overridePaths, sameConfig, REMOVE_ENTRY, DEFAULT_PDF_GENERATION_CONFIG, resolvePdfGenerationConfig, stripPdfGenerationDefaults, FOLIO_PAPER_STOCKS, FOLIO_MAX_TILT, DEFAULT_FOLIO_CONFIG, isNewspaperSizePreset, folioDefaultsFor, folioForTrim, resolveFolioConfig, stripFolioDefaults, wrapFolioYaw, DEFAULT_HEADER_FOOTER_SLOT, DEFAULT_HEADER_SLOT, DEFAULT_FOOTER_SLOT, DEFAULT_TEXT_ELEMENT, DEFAULT_RULE_ELEMENT, resolveHeaderFooterConfig, stripHeaderFooterDefaults, defaultResourceTypes, defaultVideoResourceType, defaultExampleResourceType, effectiveResourceTypes, DEFAULT_PARTS_CONFIG, resolvePartsConfig, stripPartsDefaults, DEFAULT_HEADING_STYLES, resolveHeadingStylesConfig, stripHeadingStylesDefaults, DEFAULT_TOC_CONFIG, resolveTocConfig, stripTocDefaults, DEFAULT_FOOTNOTES_CONFIG, resolveFootnotesConfig, stripFootnotesDefaults, parseFootnoteNumberFormat, DEFAULT_LINE_NUMBERS_CONFIG, resolveLineNumbersConfig, stripLineNumbersDefaults, defaultLineNumbersRestart, DEFAULT_CODE_STYLE, DEFAULT_CODE_TOKENS, CODE_TOKEN_KINDS, CODE_OVERFLOWS, resolveCodeStyleConfig, resolvedCodeStyle, stripCodeStyleDefaults, resolveCrossRefsConfig, stripCrossRefsDefaults, DEFAULT_CITATIONS_CONFIG, resolveCitationsConfig, stripCitationsDefaults, DEFAULT_INDEX_CONFIG, resolveIndexConfig, stripIndexDefaults, DEFAULT_CJK_CONFIG, resolveCjkConfig, stripCjkDefaults, defaultCjkLineBreak, defaultCjkPunctuationWidth, defaultCjkCompression, defaultCjkEmphasis, defaultCjkBookTitleMark, defaultCjkBookTitleBrackets, defaultCjkEmphasisMark, defaultCjkWarichuBrackets, defaultCjkHangingPunctuation, defaultCjkSpaceAfterQuestion, defaultCjkParagraphStartBracket, defaultCjkRubyOverhang, defaultCjkRubyAlign } from './defaults/index.js';
export { defaultCjkLatinSpacingEdge } from './defaults/index.js';
// Exercises (#1226): the styles and book settings as the engine resolves them.
export { DEFAULT_EXERCISE_STYLES, exerciseWords, resolveExerciseStylesConfig, resolveExercisesConfig, stripExerciseStylesDefaults, stripExercisesDefaults } from './defaults/index.js';
export type { ExerciseWords, ResolvedExerciseStyle, ResolvedExerciseNumber, ResolvedExercisesConfig } from './defaults/index.js';
export type {
  ExerciseNumberShape,
  ExerciseNumberStyle,
  ExerciseInstructionStyle,
  ExerciseOptionLabels,
  ExerciseOptionsStyle,
  ExerciseBlankStyle,
  ExerciseTrueFalseStyle,
  ExerciseMatchStyle,
  ExerciseBankStyle,
  ExerciseAreaStyle,
  ExerciseGridStyle,
  ExerciseArithmeticStyle,
  ExerciseLevelStyle,
  ExerciseIcon,
  ExerciseAnswersStyle,
  ExerciseSolutionPlacement,
  ExerciseSolutionsConfig,
  ExerciseAssessmentConfig,
  ExerciseDigitalStyle,
  ExerciseShowSolution,
  ExerciseStyleConfig,
  ExercisesConfig,
  ChipUnderline,
  FigureStyle,
} from './types.js';
export { DEFAULT_PRINT_CONFIG, DEFAULT_PRINT_BLACK_CONFIG, DEFAULT_PRINT_PREFLIGHT_CONFIG, DEFAULT_RICH_BLACK, resolvePrintConfig, resolvePrintBlackConfig, resolvePrintPreflightConfig, stripPrintDefaults, profileInkLimit } from './defaults/index.js';
export { DEFAULT_CHECKS_CONFIG, DEFAULT_CONTENT_IN_CONFIG_CHECK, resolveChecksConfig, resolveContentInConfigCheck, stripChecksDefaults } from './defaults/index.js';
export { DEFAULT_CONTRAST_CONFIG, DEFAULT_CONTRAST_REVERSED_TEXT_CONFIG, CONTRAST_LEVELS, CONTRAST_MODES, resolveContrastConfig, resolveContrastReversedTextConfig, stripContrastDefaults } from './defaults/index.js';
export type { FolioPaperStock } from './defaults/index.js';
export { resolvePlaceholders, computeChapterTitles, computeChapterTitlesAtTop, computeChapterNumbers, computeChapterNumbersAtTop, collectPlaceholderNames, isKnownPlaceholder, isMetadataPlaceholder, computeChapterAttrs, computePartValues, blockLinesText, plainTitleText } from './pipeline/pages/placeholders.js';
export type { PlaceholderContext, PlaceholderResult, PlaceholderResolveOptions, ChapterTitlePageInfo, PartPageInfo, PageMarks, BlockLinesTextOptions } from './pipeline/pages/placeholders.js';
export { resolveDesignPlaceholders, allowedPlaceholdersFor, isAllowedPlaceholder, configUsesPlaceholder } from './design/placeholders.js';
export type { DesignPlaceholderContext, DesignContextKind, HeadingPlaceholderInfo } from './design/placeholders.js';
export { layoutDesignSlot } from './design/layout.js';
export { pathMarkerOutline, pathSvgData, markerSvgData, markerSvgElement, colorWithOpacity, quadToCubic, pathInkBox, pathHit, offsetPathBlock, translatedPathBlock, pathBlockColors, recolorPathBlock } from './design/pathBlock.js';
export type { PathMarkerOutline } from './design/pathBlock.js';
export { parseSvgPath, arcToCubics } from './design/svgPath.js';
export type { SvgPathParse } from './design/svgPath.js';
export { facingSide, CONNECTOR_ROUTINGS, CONNECTOR_CAPS, CONNECTOR_SIDES, DEFAULT_CONNECTOR_WIDTH, connectorPaintsOver } from './design/connector.js';
export type { ConnectorRect } from './design/connector.js';
export { boxOutline, outlineSubpath, borderPieces, shapePathBlocks, boxNeedsShape, boxStyleBorder, boxStyleRadii, boxStylePathBlocks, normalizeBoxStyle, SHAPE_SIDES, isCornerRadii, uniformRadius, cornerRadiiPx, borderSidesPx } from './design/boxShape.js';
export type { ShapeSide, ShapeVertex, ShapeOutline, ShapeTab, ShapeBorder } from './design/boxShape.js';
export type { DesignSlotLayout, LayoutContext, LayoutIssue, ResolvedPrimitive, ResolvedTextPrimitive, ResolvedRulePrimitive, ResolvedBoxPrimitive, ResolvedImagePrimitive, WrappedLine, DesignFrames } from './design/layout.js';
export { classifyPages } from './pipeline/pages/pageRoles.js';
export { migrateLegacyHeaderFooterConfig, isLegacyHeaderFooterSlot, resolveDesignSlot, stripDesignSlotDefaults, defaultTextOverflow, DEFAULT_BOX_ELEMENT } from './defaults/structure/headerFooter.js';
export type { DesignSlotKind } from './defaults/structure/headerFooter.js';
export type {
  PostextContent,
  LayoutContinuation,
  OutlineEntry,
  HeadingStyleConfig,
  HeadingStyleSectionEnd,
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
  TocLeaderFaceConfig,
  TocEntryStyleConfig,
  ResolvedTocConfig,
  ResolvedTocLevelConfig,
  ResolvedTocEntryStyleConfig,
  TocGroupsConfig,
  TocGroupHead,
  ResolvedTocGroupsConfig,
  DesignImageElement,
  ResolvedDesignImageElement,
  DesignPathElement,
  ResolvedDesignPathElement,
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
  ResourceContour,
  ContourTrace,
  ResourceWrap,
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
  StretchAfterWideFloats,
  TrailingStep,
  ColumnHeadSpace,
  GridLinesLever,
  KeepWithNextSplit,
  ColonListRoom,
  CompositionRule,
  ParagraphContainerSpacing,
  ParagraphStylesInBoxes,
  ParagraphBodyField,
  EmphasisStyle,
  TashkilMode,
  LayoutConfig,
  ResolvedLayoutConfig,
  InlineResourceGap,
  BitmapResolution,
  FloatShrinkMode,
  FloatShrinkConfig,
  WrapSide,
  TextWrapConfig,
  ResolvedTextWrapConfig,
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
  VerseConfig,
  ResolvedVerseConfig,
  VerseTurnover,
  HeadingLevelConfig,
  ResolvedHeadingLevelConfig,
  HeadingsConfig,
  ResolvedHeadingsConfig,
  TableStyleConfig,
  ResolvedTableStyleConfig,
  NamedTableStyleConfig,
  ResolvedNamedTableStyleConfig,
  TableRules,
  TableSpanRules,
  TableContinuedFootRule,
  TableOverflow,
  TableTextTransform,
  CaptionStyleConfig,
  ResolvedCaptionStyleConfig,
  CaptionPosition,
  CaptionNoteStyleConfig,
  ResolvedCaptionNoteStyleConfig,
  DiagramStyleConfig,
  ResolvedDiagramStyleConfig,
  ScoreStyleConfig,
  ResolvedScoreStyleConfig,
  NamedScoreStyleConfig,
  ResolvedNamedScoreStyleConfig,
  ScoreMusicFont,
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
  TabStop,
  ParagraphDropCap,
  DropCapLeadIn,
  DropCapPunctuation,
  DropCapShortParagraph,
  TabStopAlign,
  TabStopPosition,
  CalloutStyleConfig,
  CalloutDesignConfig,
  ResolvedCalloutDesignConfig,
  CalloutFixedConfig,
  ResolvedCalloutStyleConfig,
  ChipStyleConfig,
  ResolvedChipStyleConfig,
  MarkStyleConfig,
  MarkDecorationBreak,
  ResolvedMarkStyleConfig,
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
  CalloutLabelIconConfig,
  CalloutLabelIconKind,
  CalloutIconShape,
  IconTint,
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
  OrderedListNumberAlign,
  OrderedListNumberFormat,
  SyncIndicatorConfig,
  DebugConfig,
  ResolvedDebugConfig,
  FitMarksMode,
  WarningsToggleConfig,
  ResolvedWarningsToggleConfig,
  CanvasViewerConfig,
  ResolvedCanvasViewerConfig,
  HtmlViewerConfig,
  HtmlViewerOverrides,
  ResolvedHtmlViewerConfig,
  MathConfig,
  ResolvedMathConfig,
  FootnotesConfig,
  ResolvedFootnotesConfig,
  LineNumbersConfig,
  ResolvedLineNumbersConfig,
  CodeStyleConfig,
  ResolvedCodeStyleConfig,
  InlineCodeStyleConfig,
  ResolvedInlineCodeStyleConfig,
  CodeTokenKind,
  CodeTokenStyle,
  CodeOverflow,
  LineNumbersCount,
  LineNumbersRestart,
  LineNumbersPosition,
  LineNumbersMultiColumn,
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
  CjkLatinSpacingEdge,
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
  PdfXStandard,
  PrintRenderingIntent,
  CmykPercent,
  PrintBlackConfig,
  ResolvedPrintBlackConfig,
  PrintPreflightConfig,
  ResolvedPrintPreflightConfig,
  CustomOutputProfile,
  PrintConfig,
  ResolvedPrintConfig,
  ContrastLevel,
  ContrastMode,
  ContrastReversedTextConfig,
  ResolvedContrastReversedTextConfig,
  ContrastConfig,
  ContrastAllowEntry,
  ResolvedContrastConfig,
  ChecksConfig,
  ResolvedChecksConfig,
  ContentInConfigCheckConfig,
  ResolvedContentInConfigCheckConfig,
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
  ElementSizeTo,
  SidePosition,
  ElementBoxStyle,
  CornerRadius,
  BorderSide,
  BorderSides,
  BoxSideName,
  TextOverflow,
  DesignTextStroke,
  TextDotsStyle,
  DesignTextRepeat,
  DesignTextElement,
  DesignRuleElement,
  DesignBoxElement,
  DesignConnectorElement,
  ConnectorEnd,
  LineCap,
  LeaderStyle,
  PlacedDesignElement,
  ResolvedPlacedDesignElement,
  ResolvedDesignConnectorElement,
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
} from './types.js';
export type {
  BoundingBox,
  ResolvedConfig,
  VDTBlockType,
  VDTLineSegment,
  VDTInlineIcon,
  VDTSegmentMarks,
  VDTAnnotationRun,
  VDTRuby,
  VDTKunten,
  VDTWarichu,
  VDTLineMark,
  VDTLineHighlight,
  VDTSegmentMark,
  VDTChip,
  VDTSwatch,
  VDTChipRun,
  VDTLine,
  VDTAnchor,
  VDTCarriedOutlineEntry,
  VDTBlock,
  VDTColumn,
  VDTExclusion,
  VDTExclusionContour,
  VDTContourSpan,
  VDTColumnRule,
  VDTFootnoteArea,
  VDTPage,
  VDTDocument,
  VDTHeaderFooterSlot,
  VDTHeaderFooterBlock,
  VDTHeaderFooterTextBlock,
  VDTRuleBlock,
  VDTDesignSlot,
  VDTDesignSlotKind,
  VDTDesignBlock,
  VDTDesignTextBlock,
  VDTDesignTextLine,
  VDTDesignTextRun,
  VDTDesignTextStroke,
  VDTTextDots,
  VDTDesignRuleBlock,
  VDTDesignBoxBlock,
  VDTDesignImageBlock,
  VDTDesignPathBlock,
  VDTPathCommand,
  VDTPathStroke,
  VDTPathMarker,
  VDTDesignBoxStyle,
  ResolvedResourceBlock,
  VDTResourceVideo,
  VDTVideoPlayMark,
  VDTVideoQr,
  ResolvedCalloutBlock,
  VDTCaptionBar,
  VDTBalancing,
  VDTGridBalancing,
  BalanceLever,
  LayoutWarning,
  ConfigWarning,
  PageTemplateWarningKind,
  CalloutOverflowWarning,
  ContentWarning,
  MissingImageWarning,
  SvgFontUnavailableWarning,
  SvgFontsTooLargeWarning,
  SvgPictureFontWarning,
  RenderWarning,
  VDTResourceTableCell,
  VDTResourceTableCellImage,
  VDTResourceTableLayout,
  VDTTableStroke,
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
  VDTComposedPage,
  VDTFrame,
  VDTFigureLabel,
  VDTFigureLabelLayout,
  VDTFigureLabelLeader,
  ReflowEvent,
  ReflowEventKind,
  FrameOverflowProposal,
  FrameCoverProposal,
  FrameOutsideProposal,
  FrameFitStep,
  VDTStripCaption,
  VDTDropCap,
} from './vdt.js';
export { resourceBlockToPage, resourceBlockToLocal, resourceBlockRectToPage, tableFrameOutline, tableCellFill, tableCellFillRects } from './vdt.js';
export { flowToPage, pageToFlow, flowRectToPage, pageRectToFlow, pageIsVertical, pageIsMirrored, verticalFlowOf, lineTextAlign, leaderRuleGeometry, DEFAULT_CENTRAL_BASELINE } from './vdt.js';
export { verticalOrientation, verticalRuns, uaxVerticalOrientation, isVerticalCell, verticalCellEms, CORNER_OFFSET_EM, uprightDigitRuns, forcedVerticalRuns, segmentOrientation } from './writing/writingMode.js';
export { graphemesOf } from './measure/graphemes.js';
// The box of a task-list item, drawn by the renderers (#765,
// `VDTBlock.bulletBox`).
export { TASK_BOX_SIDE_EM, TASK_BOX_TICK, taskBoxSize, taskBoxTick, taskBoxText, taskBoxSvgBody } from './paint/taskBox.js';
// A word with no letter shaped in the script of its context (#725): the
// mark a renderer sets it beside (`VDTLineSegment.scriptContext`).
export { scriptContextUntracked, scriptMark, withScriptMark } from './measure/script.js';
export { setMeasureLanguage, getMeasureLanguage, withMeasureLanguage } from './measure/canvas.js';
export type { ScriptContext } from './measure/script.js';
export type { VerticalGlyph, VerticalOrientationKind, VerticalRun, UaxVerticalOrientation, UprightDigits, ForcedOrientation } from './writing/writingMode.js';
export {
  bidiClassOf, isRtlScriptChar, needsBidi, mirroredChar, mirroredCodePoint, joiningTypeOf, hasJoiningScript, joinsWithNext,
  joinsLetters, resolveParagraph, resolveSpans, spanIsolates, lineLevels, visualOrder, lineVisualOrder, lineRuns, markerRuns, markerSetText, arabicMarkNeeded, BIDI_CLASS_NAMES,
} from './writing/bidi.js';
export type { BidiClass, BaseDirection, BidiParagraph, BidiIsolate, BidiOptions, BidiRun, JoiningType, MarkerRun } from './writing/bidi.js';
export { computeColumnEdges } from './pipeline/resources/resourceLayout.js';
export { findAnnotations } from './parse/annotations.js';
export type { FoundAnnotation, AnnotationName } from './parse/annotations.js';
export type { ContentBlock, ContentBlockType, DirectiveAttrs, VerseInfo, VerseStanza, VerseLineInfo, DirectiveName, ContainerName, RefCase, InlineSpan, InlineIcon, InlineLink, TextSpan, MathSpan, MathMeta, ListKind, ParseIssue, ParseIssueKind, UnclosedMathIssue, UnclosedContainerIssue, UnclosedCodeBlockIssue, CodeBlockInfo, ParseOptions, TocBlockInfo, IndexBlockInfo, IndexMark, ChipBox, SwatchShape, SwatchBox, EmphasisMark, InlineRuby, InlineWarichu, InlineDirection, InlineSideline, InlineKunten } from './parse/index.js';
export { parseMarkdownWithIssues, MATH_PLACEHOLDER, SWATCH_PLACEHOLDER, CHIP_PLACEHOLDER, KNOWN_DIRECTIVES, KNOWN_CONTAINERS, spaceDirectiveLines, MAX_SPACE_LINES } from './parse/index.js';
// Composed pages in the document (#854): each `::::page` fence's content by
// slot, and the slot checks the content warnings run.
export { composedPages } from './composed/document.js';
export type { ParsedComposedPage, HeadingTake } from './composed/document.js';
export { checkComposedSlots, checkFrameLookNames } from './composed/slotChecks.js';
export type { ComposedSlotWarning } from './composed/slotChecks.js';
export type { ComposedPageFence, BlockSlot, FigureInfo, FigureLabel, FigureWord, FigureWordKind } from './parse/index.js';
export { computeSourceMap, parseInlineSnippetSpans, mapInlineSnippet, orientationMarkAt, contentHasMath, resourceHasMath } from './parse/index.js';
export type { OrientationMark } from './parse/index.js';
export type { InlineSnippetMapping } from './parse/index.js';
export { buildPageLabels, collectPageLabelRuns, formatNumeral, documentNumeralStyle, parseNumberFormat, chineseInformalStyle, hanInformalStyle, EAST_ASIAN_NUMERAL_STYLES, ARABIC_NUMERAL_STYLES } from './numerals/numbering.js';
export type { NumeralStyle, NumberFormatStyle, EastAsianNumeralStyle, ArabicNumeralStyle, PageNumberSegment, PageLabelInfo, PageLabelRun } from './numerals/numbering.js';
export { withDigits, asciiDigits } from './numerals/arabicNumerals.js';
export { parseChineseNumeral } from './numerals/chineseNumerals.js';
// Composed pages (#846): page templates and label styles (#853).
export {
  DEFAULT_FRAME, DEFAULT_FRAME_FIT, DEFAULT_FRAME_GROUP, DEFAULT_PAGE_TEMPLATE, DEFAULT_LABEL_STYLE,
  resolvePageTemplate, normalizeFrame, normalizeFrameSize, templateChain, resolveLabelStyles,
  stripPageTemplatesDefaults, stripLabelStylesDefaults, isModuleTemplate,
} from './composed/templates.js';
// Modules (#1062): templates a page stacks in its modules group.
export { expandModules, moduleScoped, modulesGroupRoot } from './composed/modules.js';
export type { PageTemplateSource } from './composed/templates.js';
export { validatePageTemplates } from './composed/validate.js';
export type { ValidatePageTemplatesOptions } from './composed/validate.js';
// Composed pages laid out (#855): the frames of a page and how backends paint them.
export { altWithLabels, labelPlainText, withIconAlts } from './composed/labelText.js';
// Inline symbols in labels and captions (#1058): their boxes and what the painters need.
export { ICON_CAP_EM, iconLineDash, inlineIconBox, measureInlineIcon, resourceBlockIcons } from './measure/inlineIcon.js';
export { hasSwatchShape, swatchGeometry, type SwatchGeometry } from './paint/swatchShape.js';
export {
  figureLabelBounds,
  figureLabelLeaderPath,
  figureLabelLeaderPaths,
  figureAnchorPointOnPage,
  figureLabelMatrix,
  figureLabelReading,
  figureLabelLineReading,
  hangLegendSymbols,
  labelPlateBox,
  labelGlyphAt,
  labelPlace,
  layOutFigureLabels,
  pictureToBody,
  resolveLabelLook,
  undrawnLabels,
  unmirrorLabelLayout,
  labelLayoutOnSheet,
  type LabelLook,
  type LabelMatrix,
} from './composed/labels.js';
export { comicFramePaintOrder, comicHoldsText, comicPaintsUnderText, composedFrameBlockIds, composedPaintOrder, composedReadingOrder, composedSheetClip, composedSheetClipOnSheet, decorationOver, decorationUnder, paintsOverFrames, frameMatrix, framePageRect, frameClips, frameBounds, frameContentRect, frameOfBlock } from './composed/paint.js';
// The boxes of a template's frames before content is poured (#863: Sandbox thumbnails and editor).
export { templateFrameRects } from './composed/geometry.js';
export type { ComposedPaintItem, ComposedPaintPart } from './composed/paint.js';
// Groups and the reflow log (#856): how frames negotiate space, and what the
// layout changed from the template's drawing, in data and in words.
export { layoutGroup, composedOrder } from './composed/groups.js';
export type { GroupItem, GroupLayoutInput, ComposedStep } from './composed/groups.js';
export { composedReflowLog, describeReflowEvent, describeFitStep, describeFrameOverflowProposal, describeFrameCoverProposal, describeFrameOutsideProposal, reflowEvents } from './composed/reflowLog.js';
export type { ComposedPageReflow, FrameMotion } from './composed/reflowLog.js';
// Where a template's frames stand (#855), for hosts that draw a template
// without laying a page out (the Sandbox's template thumbnails, #864).
export { frameOrder, framePlaceable, groupPlaceable, placeBox as placeFrameBox, unionRect as frameUnionRect } from './composed/geometry.js';
export type { FrameAreas, FrameGeometryContext, Rect as FrameRect } from './composed/geometry.js';
export { growMembers } from './composed/grow.js';
export type { GrowMembers } from './composed/grow.js';
// The source map of a laid-out document and the stable ids of a composed
// page's elements (#857).
export { sourceAt, elementsForSource, findElement } from './composed/sourceMap.js';
export type { SourceRef, SourceLevel, SourceElement, SourceMapOptions, SourceMatch } from './composed/sourceMap.js';
export { composedPageElementId, frameElementId, groupElementId, labelElementId, designElementId } from './composed/ids.js';
export { composedPagePaintKey } from './composed/pageMemo.js';
// A story that jumps into a page of a later chapter (#943).
export type { StoryJump, CarriedNumber, CarriedNote } from './composed/carryTypes.js';
export type {
  FrameSize, FrameGridCell, FrameFitConfig, FrameOverflowConfig, FrameRulesConfig, FrameLook, FrameLookEntry, FrameConfig, FrameGroupConfig, FrameRepeatConfig, ComposedModuleUse, ResolvedModule, ModuleWidth,
  PageTemplateGrid, DecorationRemoval, TemplateDecoration, PageTemplatePatch, PageTemplate, LabelStyle, ComposedPagesConfigKeys,
  PageSide, ResolvePageTemplateOptions, ResolvedFrameFit, ResolvedFrame, ResolvedFrameGroup,
  ResolvedPageTemplate, ResolvedLabelStyle,
} from './composed/types.js';
export { collectConfigWarnings, contentInConfigRule, designTextLiteral } from './checks/configWarnings.js';
export type { DesignTextVerdict } from './checks/configWarnings.js';
export type { ConfigWarningOptions } from './checks/configWarnings.js';
export { configDesignSlots } from './design/slots.js';
// Decoration drawn when the page fence says so (#1087).
export { fenceSetsAttribute, fenceConditionMet, fenceConditionUses, fenceConditionsNeverMet, fenceAttributesSet, FENCE_CONDITION_SLOTS, attrPlaceholderUses, attrPlaceholdersNeverSet, markdownAttributesSet } from './design/fenceCondition.js';
export type { AttrPlaceholderUse } from './design/fenceCondition.js';
export type { FenceConditionUse } from './design/fenceCondition.js';
export { parseDirectiveAttrs } from './parse/attrs.js';
// «Move the text to the Markdown» (#874): page designs held in heading
// styles become page templates, their text `::::page` fences.
export { moveTextToMarkdown } from './migrate/textToMarkdown.js';
export type { TextMigrationChapter, TextMigrationInput, TextMigrationOptions, TextMigrationResult, TextMigrationReport, MigratedPage, ContentInConfigCount } from './migrate/textToMarkdown.js';
export type { ConfigDesignSlot, ConfigDesignSlotKind } from './design/slots.js';
export type { MathRender, MathPath, MathViewBox } from './math/types.js';
export { initMathEngine, isMathReady, onMathReady, renderMath, placeholderRender, clearMathCache } from './math/index.js';
export type { ScoreFormat, ScoreItem, ScoreRender, ScoreRenderOptions, ScoreSystem } from './music/types.js';
export { initMusicEngine, isMusicReady, onMusicReady, renderScore, clearMusicCache, markdownHasScore, contentHasScore, scoreFormatOfFile, SCORE_LANGUAGES, SCORE_FILE_FORMATS } from './music/index.js';
// The Rust line breaker compiled to WebAssembly (#779): the same breaks as
// the TypeScript one, faster; started on its own, `initLineBreaker` starts
// it early.
export { initLineBreaker, useWasmLineBreaker } from './knuthPlass/index.js';
export { applySingleInkToSvg } from './svg/singleInk.js';
// The document's fonts inside SVG pictures (#630).
export { svgFontRequests, svgDeclaredFontFamilies, inlineSvgFonts, inlineSvgFontsSync, inlineSvgFontsDetailed, inlineSvgFontsDetailedSync, chainSvgFontProviders, injectSvgStyle, fontFaceRule, sniffFontFormat, parseFontFamilyList, isFontFaceOnlyStyleSheet, DEFAULT_SVG_FONT_MAX_BYTES } from './svg/fonts.js';
export type { SvgFontRequest, SvgFontProvider, SvgFontSyncProvider, SvgFontProviderRequest, SvgFontStyle, SvgFontFormat, SvgFontStatus, SvgFontFaceReport, SvgFontWarning, InlineSvgFontsOptions, SvgFontInlining } from './svg/fonts.js';
export { registerFontBytes, registerFontUrl, unregisterFontFamily, clearRegisteredFonts, registeredFontGeneration, registeredFontProvider, registeredFontSyncProvider, parseUnicodeRange, registeredFontFiles } from './svg/fontRegistry.js';
export type { RegisterFontOptions, RegisteredFontProviderOptions, RegisteredFontFile } from './svg/fontRegistry.js';
// Faces loaded before layout, measurements dropped when they change, and
// configs checked for changes made in place (#629).
export { prepareFonts, withLoadedFonts, fontSampleText, configFontFaces } from './fonts/prepare.js';
export type { PrepareFontsOptions, LoadedFontsOptions, FontReport, FontResolver, FontResolverAnswer, FontResolveRequest, FontFile, FontFileSource, BuiltDocuments } from './fonts/prepare.js';
export { buildDocumentWithFonts } from './fonts/buildWithFonts.js';
export type { BuildDocumentWithFontsOptions } from './fonts/buildWithFonts.js';
export { watchFonts, onFontsChanged, syncFontSet } from './fonts/fontSet.js';
export type { FontsChangedListener } from './fonts/fontSet.js';
export { documentFontFaces, documentFontFamilies, fontFallbacks, defaultFontSet, cssWeightOrder, cssWeightOrderOf } from './fonts/faces.js';
export type { FontFaceLike, FontFaceSetLike, FontFallback, FontFallbackReason, FontFallbackOptions, FontFaceRequest } from './fonts/faces.js';
export { exportStandInOf, fontFallbackOf, fontFallbackFamilies, hasOwnStyle } from './fonts/fallback.js';
// Characters a face lacks, drawn from another face (#1105).
export { glyphFallbacks, documentFontTexts, registerFontCoverage, forgetFontCoverage, installGlyphProbe, GLYPH_PROBE_FAMILY, GLYPH_FALLBACK_LISTED } from './fonts/glyphFallback.js';
export type { GlyphFallback, GlyphFallbackOptions } from './fonts/glyphFallback.js';
export { sfntCodePointRanges } from './fonts/cmap.js';
export { FIGURE_STYLES, isFigureStyle, figureFeatures, withFigureStyle, featureFamily, featureFamilyParts, isFeatureFamily, baseFontFamily, fontFeatureSettings, fontVariantNumeric, setFigureStyleFamilies } from './fonts/figureStyle.js';
export type { FigureFeature, FeatureFamilyParts } from './fonts/figureStyle.js';
export { freezeFontFeatures } from './fonts/freezeFeatures.js';
export { addFeatureFaces, declareFeatureFaces, rememberFaceSource } from './fonts/featureFaces.js';
export type { FaceSource } from './fonts/featureFaces.js';
export type { CodePointRanges } from './fonts/cmap.js';
export { evictFontFamilies } from './measure/font.js';
export { measurementGeneration } from './measure/canvas.js';
export { parseFontString } from './measure/fontString.js';
export { invalidateConfig } from './pipeline/config.js';
export { stableStringify, stableHash, hashString, hashStringWide } from './util/stableHash.js';
export { registerSvgImage, prepareSvgMarkup, decodeSvgImage } from './svg/image.js';
export type { RegisterSvgImageOptions, PrepareSvgOptions } from './svg/image.js';

// `.postext` bundles. The `postext/bundle` subpath carries the same API plus
// the low-level manifest helpers.
export { openBundle, createBundle, buildBundle, createBundleLayoutCache, loadBundleFonts, registerBundleImages, bundleImageUrl, bundleVideoUrl, bundleResourceBytes, bundleFontProvider, bundleSvgFontProvider, svgInlinesFonts, readBundle, traceBundleContours, planBundle, resolveBundleFiles, openBundleZip, zipBundle, isBundleManifest, pickBundleMeta, POSTEXT_EXTENSION } from './bundle/index.js';
export type { PostextBundle, OpenBundleOptions, CreateBundleInput, CreateBundleLocale, CreatedBundle, BundleFileData, BuildBundleOptions, BundleLayoutCache, BundleLayoutStats, BundleSource, BundleFontProviderOptions, BundleFontRequest, LoadBundleFontsOptions, BundleImageOptions, BundleManifest, BundleManifestV1, BundleManifestV2, BundleStart, BundleChapter, BundleFontFile, ReadBundleOptions, ReadBundleResult, ZipBundleOptions } from './bundle/index.js';

// Citations (#267–#272): the engine registry and the data model a citation
// processor (`postext-citeproc`) implements.
export { registerCitationEngine, citationEngine, setCitationEngineLoader, ensureCitationEngine, mayNeedCitations } from './citations/registry.js';
export { bookCitationContexts, citationSourceOf, citationContextKey, needsCitationContext, type CitationContext, type CitationSource } from './citations/context.js';
export { parseLocator } from './parse/citations.js';
export { parseBibtex, latexToText, type BibtexIssue } from './citations/bibtex.js';
export { processCitations, citationLocale, defaultBibliographyTitle, type ProcessedCitations } from './pipeline/references/citations.js';
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
} from './citations/types.js';
export { configFontFamilies, configFeatureFamilies, collectFontUsage, hasLatinEmphasis, STANDARD_FONT_VARIANTS } from './fonts/usage.js';
export type { FontContentText, FontUsageDocument, FontVariantUse } from './fonts/usage.js';
