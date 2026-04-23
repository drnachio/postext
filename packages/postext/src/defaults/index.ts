import type { PostextConfig } from '../types';
import { stripPageDefaults } from './page';
import { stripLayoutDefaults } from './layout';
import { stripBodyTextDefaults } from './bodyText';
import { stripHeadingsDefaults } from './headings';
import { stripUnorderedListsDefaults } from './unorderedLists';
import { stripOrderedListsDefaults } from './orderedLists';
import { stripMathDefaults } from './math';
import { stripDebugDefaults } from './debug';
import { stripHtmlViewerDefaults } from './htmlViewer';
import { stripPdfGenerationDefaults } from './pdfGeneration';
import { stripHeaderFooterDefaults } from './headerFooter';

export { dimensionsEqual, colorsEqual, resolveColorValue, applyPaletteToConfig, applyPaletteToResolvedConfig, DEFAULT_COLOR_PALETTE, DEFAULT_MAIN_COLOR, DEFAULT_MAIN_COLOR_ID, DEFAULT_MAIN_COLOR_NAME, DEFAULT_MAIN_COLOR_HEX, cloneDefaultColorPalette, isDefaultColorPalette } from './shared';
export { PAGE_SIZE_PRESETS, DEFAULT_CUT_LINES, DEFAULT_PAGE_CONFIG, DEFAULT_PAGE_NUMBERING, resolvePageConfig, stripPageDefaults } from './page';
export { DEFAULT_COLUMN_RULE, DEFAULT_LAYOUT_CONFIG, resolveLayoutConfig, stripLayoutDefaults } from './layout';
export { DEFAULT_HYPHENATION_CONFIG, DEFAULT_BODY_TEXT_CONFIG, hyphenationEqual, resolveBodyTextConfig, stripBodyTextDefaults } from './bodyText';
export { DEFAULT_HEADINGS_CONFIG, resolveHeadingsConfig, stripHeadingsDefaults } from './headings';
export { DEFAULT_UNORDERED_LISTS_STATIC, resolveUnorderedListsConfig, stripUnorderedListsDefaults } from './unorderedLists';
export { DEFAULT_ORDERED_LISTS_STATIC, resolveOrderedListsConfig, stripOrderedListsDefaults } from './orderedLists';
export { DEFAULT_MATH_CONFIG, resolveMathConfig, stripMathDefaults } from './math';
export { DEFAULT_DEBUG_CONFIG, resolveDebugConfig, stripDebugDefaults } from './debug';
export { DEFAULT_HTML_VIEWER_CONFIG, resolveHtmlViewerConfig, stripHtmlViewerDefaults } from './htmlViewer';
export { DEFAULT_PDF_GENERATION_CONFIG, resolvePdfGenerationConfig, stripPdfGenerationDefaults } from './pdfGeneration';
export { DEFAULT_HEADER_FOOTER_SLOT, DEFAULT_HEADER_SLOT, DEFAULT_FOOTER_SLOT, DEFAULT_TEXT_ELEMENT, DEFAULT_RULE_ELEMENT, resolveHeaderFooterConfig, stripHeaderFooterDefaults } from './headerFooter';
export type { HeaderFooterSlotKind } from './headerFooter';

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
  const strippedBodyText = stripBodyTextDefaults(config.bodyText);
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
  return result;
}
