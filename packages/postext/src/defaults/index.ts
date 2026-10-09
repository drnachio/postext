import type { PostextConfig } from '../types';
import { stripPageDefaults } from './page';
import { stripLayoutDefaults } from './layout';
import { stripBodyTextDefaults } from './bodyText';
import { stripHeadingsDefaults } from './headings';
import { stripTableStyleDefaults, stripTableStylesDefaults } from './tableStyle';
import { stripCaptionStyleDefaults } from './captionStyle';
import { stripDiagramStyleDefaults } from './diagramStyle';
import { stripVideoStyleDefaults } from './videoStyle';
import { stripParagraphStylesDefaults } from './paragraphStyles';
import { stripCalloutStylesDefaults } from './calloutStyles';
import { stripChipStylesDefaults } from './chipStyles';
import { stripUnorderedListsDefaults } from './unorderedLists';
import { stripOrderedListsDefaults } from './orderedLists';
import { stripMathDefaults } from './math';
import { stripDebugDefaults } from './debug';
import { stripHtmlViewerDefaults } from './htmlViewer';
import { stripPdfGenerationDefaults } from './pdfGeneration';
import { stripPrintDefaults } from './print';
import { stripFolioDefaults } from './folio';
import { stripHeaderFooterDefaults } from './headerFooter';
import { stripPartsDefaults } from './parts';
import { stripHeadingStylesDefaults } from './headingStyles';
import { stripTocDefaults } from './toc';
import { stripFootnotesDefaults } from './footnotes';
import { stripCrossRefsDefaults } from './crossRefs';
import { stripCitationsDefaults } from './citations';
import { stripIndexDefaults } from './indexConfig';
import { stripCjkDefaults } from './cjk';
import { stripComicsDefaults } from './comics';
import { stripLineNumbersDefaults } from './lineNumbers';
import { stripCodeStyleDefaults } from './codeStyle';

export { dimensionsEqual, colorsEqual, resolveColorValue, applyPaletteToConfig, applyPaletteToResolvedConfig, DEFAULT_COLOR_PALETTE, DEFAULT_MAIN_COLOR, DEFAULT_MAIN_COLOR_ID, DEFAULT_MAIN_COLOR_NAME, DEFAULT_MAIN_COLOR_HEX, cloneDefaultColorPalette, isDefaultColorPalette } from './shared';
export { PAGE_SIZE_PRESETS, DEFAULT_CUT_LINES, DEFAULT_PAGE_CONFIG, DEFAULT_PAGE_NUMBERING, resolvePageConfig, stripPageDefaults } from './page';
export { DEFAULT_COLUMN_RULE, DEFAULT_LAYOUT_CONFIG, DEFAULT_FLOAT_MIN_SCALE, DEFAULT_TEXT_WRAP, resolveLayoutConfig, stripLayoutDefaults } from './layout';
export { DEFAULT_HYPHENATION_CONFIG, DEFAULT_BODY_TEXT_CONFIG, DEFAULT_BLOCKQUOTE_CONFIG, hyphenationEqual, resolveBodyTextConfig, stripBodyTextDefaults } from './bodyText';
export { DEFAULT_VERSE_CONFIG, resolveVerseConfig, stripVerseDefaults } from './verse';
export { DEFAULT_COLUMN_BALANCING, DEFAULT_HEADINGS_CONFIG, resolveHeadingsConfig, stripHeadingsDefaults } from './headings';
export { resolveTableStyleConfig, stripTableStyleDefaults, resolveTableStylesConfig, stripTableStylesDefaults, pickTableStyle, defaultTableContinuationStrings } from './tableStyle';
export { resolveCaptionStyleConfig, stripCaptionStyleDefaults, mergeCaptionStyle, defaultCaptionLabels } from './captionStyle';
export { DEFAULT_DIAGRAM_STYLE_CONFIG, resolveDiagramStyleConfig, stripDiagramStyleDefaults } from './diagramStyle';
export { DEFAULT_VIDEO_STYLE_CONFIG, DEFAULT_VIDEO_PLAYER_OPTIONS, resolveVideoStyleConfig, resolveVideoPlayerOptions, stripVideoStyleDefaults } from './videoStyle';
export { DEFAULT_PARAGRAPH_STYLES, resolveParagraphStylesConfig, stripParagraphStylesDefaults } from './paragraphStyles';
export { DEFAULT_CALLOUT_STYLES, DEFAULT_CALLOUT_STYLE_STATIC, resolveCalloutStylesConfig, stripCalloutStylesDefaults } from './calloutStyles';
export { DEFAULT_CHIP_STYLES, DEFAULT_CHIP_STYLE_STATIC, resolveChipStylesConfig, stripChipStylesDefaults, pickChipStyle } from './chipStyles';
export { DEFAULT_UNORDERED_LISTS_STATIC, resolveUnorderedListsConfig, stripUnorderedListsDefaults } from './unorderedLists';
export { DEFAULT_ORDERED_LISTS_STATIC, resolveOrderedListsConfig, stripOrderedListsDefaults } from './orderedLists';
export { DEFAULT_MATH_CONFIG, resolveMathConfig, stripMathDefaults } from './math';
export { DEFAULT_DEBUG_CONFIG, resolveDebugConfig, stripDebugDefaults } from './debug';
export { DEFAULT_HTML_VIEWER_CONFIG, resolveHtmlViewerConfig, stripHtmlViewerDefaults, mergeConfigOverrides, applyHtmlViewerOverrides } from './htmlViewer';
export { DEFAULT_PDF_GENERATION_CONFIG, resolvePdfGenerationConfig, stripPdfGenerationDefaults } from './pdfGeneration';
export { DEFAULT_PRINT_CONFIG, DEFAULT_PRINT_BLACK_CONFIG, DEFAULT_PRINT_PREFLIGHT_CONFIG, DEFAULT_RICH_BLACK, resolvePrintConfig, resolvePrintBlackConfig, resolvePrintPreflightConfig, stripPrintDefaults, profileInkLimit } from './print';
export { FOLIO_PAPER_STOCKS, FOLIO_MAX_TILT, DEFAULT_FOLIO_CONFIG, isNewspaperSizePreset, folioDefaultsFor, folioForTrim, resolveFolioConfig, stripFolioDefaults, wrapFolioYaw } from './folio';
export type { FolioPaperStock } from './folio';
export { DEFAULT_HEADER_FOOTER_SLOT, DEFAULT_HEADER_SLOT, DEFAULT_FOOTER_SLOT, DEFAULT_TEXT_ELEMENT, DEFAULT_RULE_ELEMENT, resolveHeaderFooterConfig, stripHeaderFooterDefaults } from './headerFooter';
export type { HeaderFooterSlotKind } from './headerFooter';
export { defaultResourceTypes, defaultVideoResourceType, effectiveResourceTypes } from './resourceTypes';
export { DEFAULT_PARTS_CONFIG, resolvePartsConfig, stripPartsDefaults } from './parts';
export { DEFAULT_HEADING_STYLES, resolveHeadingStylesConfig, stripHeadingStylesDefaults } from './headingStyles';
export { DEFAULT_TOC_CONFIG, resolveTocConfig, stripTocDefaults } from './toc';
export { DEFAULT_FOOTNOTES_CONFIG, resolveFootnotesConfig, stripFootnotesDefaults, parseFootnoteNumberFormat } from './footnotes';
export { DEFAULT_LINE_NUMBERS_CONFIG, resolveLineNumbersConfig, stripLineNumbersDefaults, defaultLineNumbersRestart } from './lineNumbers';
export { DEFAULT_CODE_STYLE, DEFAULT_CODE_TOKENS, CODE_TOKEN_KINDS, CODE_OVERFLOWS, resolveCodeStyleConfig, resolvedCodeStyle, stripCodeStyleDefaults } from './codeStyle';
export { resolveCrossRefsConfig, stripCrossRefsDefaults } from './crossRefs';
export { DEFAULT_CITATIONS_CONFIG, resolveCitationsConfig, stripCitationsDefaults } from './citations';
export { DEFAULT_INDEX_CONFIG, resolveIndexConfig, stripIndexDefaults } from './indexConfig';
export { DEFAULT_PANEL_STYLE, DEFAULT_COMIC_GUTTER, DEFAULT_LETTERING_STATIC, DEFAULT_BALLOON_STYLES, DEFAULT_BALLOON_STYLE_IDS, defaultComicFont, defaultComicSfxFont, resolveComicsConfig, resolvedComics, comicReadingDirection, pickPanelStyle, pickBalloonStyle, stripComicsDefaults } from './comics';
export { DEFAULT_CJK_CONFIG, resolveCjkConfig, stripCjkDefaults, defaultCjkLineBreak, defaultCjkPunctuationWidth, defaultCjkCompression, defaultCjkEmphasis, defaultCjkBookTitleMark, defaultCjkBookTitleBrackets, defaultCjkEmphasisMark, defaultCjkWarichuBrackets, defaultCjkHangingPunctuation, defaultCjkSpaceAfterQuestion, defaultCjkParagraphStartBracket, defaultCjkRubyOverhang, defaultCjkRubyAlign } from './cjk';

export function stripConfigDefaults(config: PostextConfig): PostextConfig {
  const result: PostextConfig = { ...config };
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
  const strippedBodyText = stripBodyTextDefaults(config.bodyText, config.locale);
  if (strippedBodyText) {
    result.bodyText = strippedBodyText;
  } else {
    delete result.bodyText;
  }
  const strippedHeadings = stripHeadingsDefaults(config.headings);
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
  const strippedCaptionStyle = stripCaptionStyleDefaults(config.captionStyle, config.locale);
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
  const strippedFootnotes = stripFootnotesDefaults(config.footnotes, config.locale, config.layout?.writingMode);
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
  const strippedIndex = stripIndexDefaults(config.index);
  if (strippedIndex) {
    result.index = strippedIndex;
  } else {
    delete result.index;
  }
  const strippedComics = stripComicsDefaults(config.comics, config.locale ?? config.bodyText?.hyphenation?.locale);
  if (strippedComics) {
    result.comics = strippedComics;
  } else {
    delete result.comics;
  }
  // `'auto'` is the default direction.
  if (result.direction === 'auto') delete result.direction;
  // `'auto'` is the default: the digits follow the document language.
  if (result.numerals === 'auto') delete result.numerals;
  return result;
}
