import type { PostextConfig } from '../types.js';
import { stripPageDefaults } from './page.js';
import { stripLayoutDefaults } from './layout.js';
import { avoidOrphansByDefault, avoidWidowsByDefault, stripBodyTextDefaults } from './text/bodyText.js';
import { balancingOnByDefault, stripHeadingsDefaults } from './structure/headings.js';
import { stripTableStyleDefaults, stripTableStylesDefaults } from './resources/tableStyle.js';
import { stripCaptionStyleDefaults } from './resources/captionStyle.js';
import { stripDiagramStyleDefaults } from './resources/diagramStyle.js';
import { stripScoreStyleDefaults, stripScoreStylesDefaults } from './resources/scoreStyle.js';
import { stripVideoStyleDefaults } from './resources/videoStyle.js';
import { stripParagraphStylesDefaults } from './text/paragraphStyles.js';
import { stripCalloutStylesDefaults } from './boxes/calloutStyles.js';
import { stripChipStylesDefaults } from './text/chipStyles.js';
import { stripExerciseStylesDefaults, stripExercisesDefaults } from './boxes/exercises.js';
import { stripMarkStylesDefaults } from './text/markStyles.js';
import { stripUnorderedListsDefaults } from './text/unorderedLists.js';
import { stripOrderedListsDefaults } from './text/orderedLists.js';
import { stripMathDefaults } from './text/math.js';
import { stripDebugDefaults } from './output/debug.js';
import { stripHtmlViewerDefaults } from './output/htmlViewer.js';
import { stripCanvasViewerDefaults } from './output/canvasViewer.js';
import { stripPdfGenerationDefaults } from './output/pdfGeneration.js';
import { stripPrintDefaults } from './output/print.js';
import { stripContrastDefaults } from './output/contrast.js';
import { stripChecksDefaults } from './output/checks.js';
import { stripFolioDefaults } from './output/folio.js';
import { stripHeaderFooterDefaults } from './structure/headerFooter.js';
import { stripPartsDefaults } from './structure/parts.js';
import { stripHeadingStylesDefaults } from './structure/headingStyles.js';
import { stripTocDefaults } from './structure/toc.js';
import { stripFootnotesDefaults } from './structure/footnotes.js';
import { stripCrossRefsDefaults } from './structure/crossRefs.js';
import { stripCitationsDefaults } from './structure/citations.js';
import { stripLinksDefaults } from './structure/links.js';
import { stripIndexDefaults } from './structure/indexConfig.js';
import { stripCjkDefaults } from './text/cjk.js';
import { comicReadingDirection, stripComicsDefaults } from './comics.js';
import { stripLabelStylesDefaults, stripPageTemplatesDefaults } from '../composed/templates.js';
import { stripLineNumbersDefaults } from './text/lineNumbers.js';
import { stripCodeStyleDefaults } from './text/codeStyle.js';
import { presentTag } from '../hyphenation/locale.js';

export { dimensionsEqual, colorsEqual, resolveColorValue, applyPaletteToConfig, applyPaletteToResolvedConfig, DEFAULT_COLOR_PALETTE, DEFAULT_MAIN_COLOR, DEFAULT_MAIN_COLOR_ID, DEFAULT_MAIN_COLOR_NAME, DEFAULT_MAIN_COLOR_HEX, cloneDefaultColorPalette, isDefaultColorPalette } from './shared.js';
export { PAGE_SIZE_PRESETS, DEFAULT_CUT_LINES, DEFAULT_PAGE_CONFIG, DEFAULT_PAGE_NUMBERING, resolvePageConfig, stripPageDefaults } from './page.js';
export { DEFAULT_COLUMN_RULE, DEFAULT_LAYOUT_CONFIG, DEFAULT_FLOAT_MIN_SCALE, DEFAULT_MAX_TOP_FRACTION, DEFAULT_TEXT_WRAP, resolveLayoutConfig, stripLayoutDefaults } from './layout.js';
export { DEFAULT_HYPHENATION_CONFIG, DEFAULT_BODY_TEXT_CONFIG, DEFAULT_BLOCKQUOTE_CONFIG, hyphenationEqual, avoidWidowsByDefault, avoidOrphansByDefault, resolveBodyTextConfig, stripBodyTextDefaults } from './text/bodyText.js';
export { DEFAULT_VERSE_CONFIG, resolveVerseConfig, stripVerseDefaults } from './text/verse.js';
export { DEFAULT_COLUMN_BALANCING, DEFAULT_HEADINGS_CONFIG, balancingOnByDefault, resolveHeadingsConfig, stripHeadingsDefaults } from './structure/headings.js';
export { resolveTableStyleConfig, stripTableStyleDefaults, resolveTableStylesConfig, stripTableStylesDefaults, pickTableStyle, defaultTableContinuationStrings } from './resources/tableStyle.js';
export { resolveCaptionStyleConfig, stripCaptionStyleDefaults, mergeCaptionStyle, defaultCaptionLabels } from './resources/captionStyle.js';
export { DEFAULT_DIAGRAM_STYLE_CONFIG, resolveDiagramStyleConfig, stripDiagramStyleDefaults } from './resources/diagramStyle.js';
export {
  DEFAULT_SCORE_STYLE_CONFIG,
  resolveScoreStyleConfig,
  resolveScoreStylesConfig,
  pickScoreStyle,
  stripScoreStyleDefaults,
  stripScoreStylesDefaults,
} from './resources/scoreStyle.js';
export { DEFAULT_VIDEO_STYLE_CONFIG, DEFAULT_VIDEO_PLAYER_OPTIONS, resolveVideoStyleConfig, resolveVideoPlayerOptions, stripVideoStyleDefaults } from './resources/videoStyle.js';
export { DEFAULT_PARAGRAPH_STYLES, resolveParagraphStylesConfig, stripParagraphStylesDefaults } from './text/paragraphStyles.js';
export { DEFAULT_CALLOUT_STYLES, DEFAULT_CALLOUT_STYLE_STATIC, resolveCalloutStylesConfig, stripCalloutStylesDefaults, inheritCalloutStyles, calloutStyleChain } from './boxes/calloutStyles.js';
export { DEFAULT_CHIP_STYLES, DEFAULT_CHIP_STYLE_STATIC, resolveChipStylesConfig, stripChipStylesDefaults, pickChipStyle } from './text/chipStyles.js';
export { DEFAULT_EXERCISE_STYLES, exerciseWords, resolveExerciseStylesConfig, resolveExercisesConfig, stripExerciseStylesDefaults, stripExercisesDefaults } from './boxes/exercises.js';
export type { ExerciseWords, ResolvedExerciseStyle, ResolvedExerciseNumber, ResolvedExercisesConfig } from './boxes/exercises.js';
export { DEFAULT_MARK_STYLES, DEFAULT_MARK_STYLE_STATIC, resolveMarkStylesConfig, stripMarkStylesDefaults, pickMarkStyle } from './text/markStyles.js';
export { DEFAULT_UNORDERED_LISTS_STATIC, resolveUnorderedListsConfig, stripUnorderedListsDefaults } from './text/unorderedLists.js';
export { DEFAULT_ORDERED_LISTS_STATIC, resolveOrderedListsConfig, stripOrderedListsDefaults } from './text/orderedLists.js';
export { DEFAULT_MATH_CONFIG, resolveMathConfig, stripMathDefaults } from './text/math.js';
export { DEFAULT_DEBUG_CONFIG, FIT_MARKS_MODES, resolveDebugConfig, stripDebugDefaults } from './output/debug.js';
export { DEFAULT_CANVAS_VIEWER_CONFIG, CANVAS_VIEWER_MAX_GAP, resolveCanvasViewerConfig, stripCanvasViewerDefaults } from './output/canvasViewer.js';
export { DEFAULT_HTML_VIEWER_CONFIG, resolveHtmlViewerConfig, stripHtmlViewerDefaults, mergeConfigOverrides, applyHtmlViewerOverrides } from './output/htmlViewer.js';
export { mergeConfigLayers, diffConfigLayers, leastConfigOverride, commonConfig, overridePaths, sameConfig, REMOVE_ENTRY, type ConfigOverride } from './configLayers.js';
export { DEFAULT_PDF_GENERATION_CONFIG, resolvePdfGenerationConfig, stripPdfGenerationDefaults } from './output/pdfGeneration.js';
export { DEFAULT_PRINT_CONFIG, DEFAULT_PRINT_BLACK_CONFIG, DEFAULT_PRINT_PREFLIGHT_CONFIG, DEFAULT_RICH_BLACK, resolvePrintConfig, resolvePrintBlackConfig, resolvePrintPreflightConfig, stripPrintDefaults, profileInkLimit } from './output/print.js';
export { DEFAULT_CHECKS_CONFIG, DEFAULT_CONTENT_IN_CONFIG_CHECK, resolveChecksConfig, resolveContentInConfigCheck, stripChecksDefaults } from './output/checks.js';
export { DEFAULT_CONTRAST_CONFIG, DEFAULT_CONTRAST_REVERSED_TEXT_CONFIG, CONTRAST_LEVELS, CONTRAST_MODES, resolveContrastConfig, resolveContrastReversedTextConfig, stripContrastDefaults } from './output/contrast.js';
export { FOLIO_PAPER_STOCKS, FOLIO_MAX_TILT, DEFAULT_FOLIO_CONFIG, isNewspaperSizePreset, folioDefaultsFor, folioForTrim, resolveFolioConfig, stripFolioDefaults, wrapFolioYaw } from './output/folio.js';
export type { FolioPaperStock } from './output/folio.js';
export { DEFAULT_HEADER_FOOTER_SLOT, DEFAULT_HEADER_SLOT, DEFAULT_FOOTER_SLOT, DEFAULT_TEXT_ELEMENT, DEFAULT_RULE_ELEMENT, resolveHeaderFooterConfig, stripHeaderFooterDefaults } from './structure/headerFooter.js';
export type { HeaderFooterSlotKind } from './structure/headerFooter.js';
export { defaultResourceTypes, defaultVideoResourceType, defaultExampleResourceType, effectiveResourceTypes } from './resources/resourceTypes.js';
export { DEFAULT_PARTS_CONFIG, resolvePartsConfig, stripPartsDefaults } from './structure/parts.js';
export { DEFAULT_HEADING_STYLES, resolveHeadingStylesConfig, stripHeadingStylesDefaults } from './structure/headingStyles.js';
export { DEFAULT_TOC_CONFIG, resolveTocConfig, stripTocDefaults } from './structure/toc.js';
export { DEFAULT_FOOTNOTES_CONFIG, resolveFootnotesConfig, stripFootnotesDefaults, parseFootnoteNumberFormat } from './structure/footnotes.js';
export { DEFAULT_LINE_NUMBERS_CONFIG, resolveLineNumbersConfig, stripLineNumbersDefaults, defaultLineNumbersRestart } from './text/lineNumbers.js';
export { DEFAULT_CODE_STYLE, DEFAULT_CODE_TOKENS, CODE_TOKEN_KINDS, CODE_OVERFLOWS, resolveCodeStyleConfig, resolvedCodeStyle, stripCodeStyleDefaults } from './text/codeStyle.js';
export { resolveCrossRefsConfig, stripCrossRefsDefaults } from './structure/crossRefs.js';
export { DEFAULT_CITATIONS_CONFIG, resolveCitationsConfig, stripCitationsDefaults } from './structure/citations.js';
export { DEFAULT_LINKS_CONFIG, resolveLinksConfig, stripLinksDefaults } from './structure/links.js';
export { DEFAULT_INDEX_CONFIG, resolveIndexConfig, stripIndexDefaults } from './structure/indexConfig.js';
export { DEFAULT_PANEL_STYLE, DEFAULT_COMIC_GUTTER, DEFAULT_LETTERING_STATIC, DEFAULT_BALLOON_STYLES, DEFAULT_BALLOON_STYLE_IDS, defaultComicFont, defaultComicSfxFont, resolveComicsConfig, resolvedComics, comicReadingDirection, pickPanelStyle, pickBalloonStyle, stripComicsDefaults } from './comics.js';
export { DEFAULT_CJK_CONFIG, resolveCjkConfig, stripCjkDefaults, defaultCjkLineBreak, defaultCjkPunctuationWidth, defaultCjkCompression, defaultCjkEmphasis, defaultCjkBookTitleMark, defaultCjkBookTitleBrackets, defaultCjkEmphasisMark, defaultCjkWarichuBrackets, defaultCjkHangingPunctuation, defaultCjkSpaceAfterQuestion, defaultCjkLatinSpacingEdge, cjkRegionOfConfig, defaultCjkParagraphStartBracket, defaultCjkRubyOverhang, defaultCjkRubyAlign } from './text/cjk.js';

/** The document language as `resolveAllConfig` reads it for the defaults
 *  that follow it (captions, notes, the index, comics): `locale`, else the
 *  hyphenation locale as written; `undefined` when neither names one. */
function documentLocaleOf(config: PostextConfig): string | undefined {
  return presentTag(config.locale) ?? presentTag(config.bodyText?.hyphenation?.locale);
}

/**
 * `config` without the values that restate a default. A default that
 * depends on the rest of the configuration (the document language, the
 * writing mode, a character grid, a page size preset) is the default of
 * this configuration: a value that differs from it is kept even where it
 * equals the default of a plain document (#651), so that
 * `resolveAllConfig(stripConfigDefaults(config))` lays out like
 * `resolveAllConfig(config)`.
 */
export function stripConfigDefaults(config: PostextConfig): PostextConfig {
  const result: PostextConfig = { ...config };
  const documentLocale = documentLocaleOf(config);
  const strippedPage = stripPageDefaults(config.page);
  if (strippedPage) {
    result.page = strippedPage;
  } else {
    delete result.page;
  }
  const strippedLayout = stripLayoutDefaults(config.layout);
  if (strippedLayout) {
    result.layout = strippedLayout;
  } else {
    delete result.layout;
  }
  // The break rules are off by default on a character grid (#717): each
  // is compared with the default of this document.
  const strippedBodyText = stripBodyTextDefaults(config.bodyText, config.locale, avoidWidowsByDefault(config), avoidOrphansByDefault(config));
  if (strippedBodyText) {
    result.bodyText = strippedBodyText;
  } else {
    delete result.bodyText;
  }
  // Balancing is off by default on a character grid and in vertical text
  // (#632): `enabled` is compared with the default of this document.
  const strippedHeadings = stripHeadingsDefaults(config.headings, balancingOnByDefault(config));
  if (strippedHeadings) {
    result.headings = strippedHeadings;
  } else {
    delete result.headings;
  }
  const strippedTableStyle = stripTableStyleDefaults(config.tableStyle);
  if (strippedTableStyle) {
    result.tableStyle = strippedTableStyle;
  } else {
    delete result.tableStyle;
  }
  const strippedTableStyles = stripTableStylesDefaults(config.tableStyles);
  if (strippedTableStyles) {
    result.tableStyles = strippedTableStyles;
  } else {
    delete result.tableStyles;
  }
  const strippedCaptionStyle = stripCaptionStyleDefaults(config.captionStyle, documentLocale);
  if (strippedCaptionStyle) {
    result.captionStyle = strippedCaptionStyle;
  } else {
    delete result.captionStyle;
  }
  const strippedDiagramStyle = stripDiagramStyleDefaults(config.diagramStyle);
  if (strippedDiagramStyle) {
    result.diagramStyle = strippedDiagramStyle;
  } else {
    delete result.diagramStyle;
  }
  const strippedScoreStyle = stripScoreStyleDefaults(config.scoreStyle);
  if (strippedScoreStyle) {
    result.scoreStyle = strippedScoreStyle;
  } else {
    delete result.scoreStyle;
  }
  const strippedScoreStyles = stripScoreStylesDefaults(config.scoreStyles);
  if (strippedScoreStyles) {
    result.scoreStyles = strippedScoreStyles;
  } else {
    delete result.scoreStyles;
  }
  const strippedVideoStyle = stripVideoStyleDefaults(config.videoStyle);
  if (strippedVideoStyle) {
    result.videoStyle = strippedVideoStyle;
  } else {
    delete result.videoStyle;
  }
  const strippedParagraphStyles = stripParagraphStylesDefaults(config.paragraphStyles);
  if (strippedParagraphStyles) {
    result.paragraphStyles = strippedParagraphStyles;
  } else {
    delete result.paragraphStyles;
  }
  const strippedCalloutStyles = stripCalloutStylesDefaults(config.calloutStyles);
  if (strippedCalloutStyles) {
    result.calloutStyles = strippedCalloutStyles;
  } else {
    delete result.calloutStyles;
  }
  const strippedChipStyles = stripChipStylesDefaults(config.chipStyles);
  if (strippedChipStyles) {
    result.chipStyles = strippedChipStyles;
  } else {
    delete result.chipStyles;
  }
  const strippedExerciseStyles = stripExerciseStylesDefaults(config.exerciseStyles);
  if (strippedExerciseStyles) {
    result.exerciseStyles = strippedExerciseStyles;
  } else {
    delete result.exerciseStyles;
  }
  const strippedExercises = stripExercisesDefaults(config.exercises, documentLocale);
  if (strippedExercises) {
    result.exercises = strippedExercises;
  } else {
    delete result.exercises;
  }
  const strippedMarkStyles = stripMarkStylesDefaults(config.markStyles);
  if (strippedMarkStyles) {
    result.markStyles = strippedMarkStyles;
  } else {
    delete result.markStyles;
  }
  const strippedLists = stripUnorderedListsDefaults(config.unorderedLists);
  if (strippedLists) {
    result.unorderedLists = strippedLists;
  } else {
    delete result.unorderedLists;
  }
  const strippedOrdered = stripOrderedListsDefaults(config.orderedLists);
  if (strippedOrdered) {
    result.orderedLists = strippedOrdered;
  } else {
    delete result.orderedLists;
  }
  const strippedMath = stripMathDefaults(config.math);
  if (strippedMath) {
    result.math = strippedMath;
  } else {
    delete result.math;
  }
  const strippedDebug = stripDebugDefaults(config.debug);
  if (strippedDebug) {
    result.debug = strippedDebug;
  } else {
    delete result.debug;
  }
  const strippedHtmlViewer = stripHtmlViewerDefaults(config.htmlViewer);
  if (strippedHtmlViewer) {
    result.htmlViewer = strippedHtmlViewer;
  } else {
    delete result.htmlViewer;
  }
  const strippedCanvasViewer = stripCanvasViewerDefaults(config.canvasViewer);
  if (strippedCanvasViewer) {
    result.canvasViewer = strippedCanvasViewer;
  } else {
    delete result.canvasViewer;
  }
  const strippedPdfGeneration = stripPdfGenerationDefaults(config.pdfGeneration);
  if (strippedPdfGeneration) {
    result.pdfGeneration = strippedPdfGeneration;
  } else {
    delete result.pdfGeneration;
  }
  const strippedPrint = stripPrintDefaults(config.print);
  if (strippedPrint) {
    result.print = strippedPrint;
  } else {
    delete result.print;
  }
  const strippedContrast = stripContrastDefaults(config.contrast);
  if (strippedContrast) {
    result.contrast = strippedContrast;
  } else {
    delete result.contrast;
  }
  const strippedChecks = stripChecksDefaults(config.checks);
  if (strippedChecks) {
    result.checks = strippedChecks;
  } else {
    delete result.checks;
  }
  const strippedFolio = stripFolioDefaults(config.folio, config.page?.sizePreset);
  if (strippedFolio) {
    result.folio = strippedFolio;
  } else {
    delete result.folio;
  }
  const strippedHeader = stripHeaderFooterDefaults(config.header, 'header');
  if (strippedHeader) {
    result.header = strippedHeader;
  } else {
    delete result.header;
  }
  const strippedFooter = stripHeaderFooterDefaults(config.footer, 'footer');
  if (strippedFooter) {
    result.footer = strippedFooter;
  } else {
    delete result.footer;
  }
  const strippedParts = stripPartsDefaults(config.parts);
  if (strippedParts) {
    result.parts = strippedParts;
  } else {
    delete result.parts;
  }
  const strippedHeadingStyles = stripHeadingStylesDefaults(config.headingStyles);
  if (strippedHeadingStyles) {
    result.headingStyles = strippedHeadingStyles;
  } else {
    delete result.headingStyles;
  }
  const strippedFootnotes = stripFootnotesDefaults(config.footnotes, documentLocale, config.layout?.writingMode);
  if (strippedFootnotes) {
    result.footnotes = strippedFootnotes;
  } else {
    delete result.footnotes;
  }
  const strippedLineNumbers = stripLineNumbersDefaults(config.lineNumbers);
  if (strippedLineNumbers) {
    result.lineNumbers = strippedLineNumbers;
  } else {
    delete result.lineNumbers;
  }
  const strippedCodeStyle = stripCodeStyleDefaults(config.codeStyle);
  if (strippedCodeStyle) {
    result.codeStyle = strippedCodeStyle;
  } else {
    delete result.codeStyle;
  }
  const strippedCrossRefs = stripCrossRefsDefaults(config.crossRefs);
  if (strippedCrossRefs) {
    result.crossRefs = strippedCrossRefs;
  } else {
    delete result.crossRefs;
  }
  const strippedCitations = stripCitationsDefaults(config.citations);
  if (strippedCitations) {
    result.citations = strippedCitations;
  } else {
    delete result.citations;
  }
  const strippedLinks = stripLinksDefaults(config.links);
  if (strippedLinks) {
    result.links = strippedLinks;
  } else {
    delete result.links;
  }
  const strippedCjk = stripCjkDefaults(config.cjk);
  if (strippedCjk) {
    result.cjk = strippedCjk;
  } else {
    delete result.cjk;
  }
  const strippedToc = stripTocDefaults(config.toc);
  if (strippedToc) {
    result.toc = strippedToc;
  } else {
    delete result.toc;
  }
  const strippedIndex = stripIndexDefaults(config.index, documentLocale);
  if (strippedIndex) {
    result.index = strippedIndex;
  } else {
    delete result.index;
  }
  const strippedComics = stripComicsDefaults(config.comics, documentLocale);
  if (strippedComics) {
    result.comics = strippedComics;
  } else if (config.comics && comicReadingDirection(undefined, { locale: documentLocale }) === 'rtl') {
    // The section itself says the document is a comic book: in a language
    // whose comics read right to left (Japanese, Traditional Chinese) it
    // binds the book on the right, so one left at its defaults stays.
    result.comics = {};
  } else {
    delete result.comics;
  }
  // Page templates are kept as written (a child's restated default
  // overrides its parent's); label styles drop their defaults.
  const strippedTemplates = stripPageTemplatesDefaults(config.pageTemplates);
  if (strippedTemplates) {
    result.pageTemplates = strippedTemplates;
  } else {
    delete result.pageTemplates;
  }
  const strippedLabelStyles = stripLabelStylesDefaults(config.labelStyles);
  if (strippedLabelStyles) {
    result.labelStyles = strippedLabelStyles;
  } else {
    delete result.labelStyles;
  }
  // `'auto'` is the default direction.
  if (result.direction === 'auto') delete result.direction;
  // `'auto'` is the default: the digits follow the document language.
  if (result.numerals === 'auto') delete result.numerals;
  return result;
}
