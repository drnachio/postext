import type { PostextConfig } from '../types';
import { stripPageDefaults } from './page';
import { stripLayoutDefaults } from './layout';
import { stripBodyTextDefaults } from './bodyText';
import { stripHeadingsDefaults } from './headings';
import { stripUnorderedListsDefaults } from './unorderedLists';
import { stripOrderedListsDefaults } from './orderedLists';
import { stripDebugDefaults } from './debug';
import { stripHtmlViewerDefaults } from './htmlViewer';

export { dimensionsEqual, colorsEqual, resolveColorValue, applyPaletteToConfig, DEFAULT_COLOR_PALETTE, DEFAULT_MAIN_COLOR, DEFAULT_MAIN_COLOR_ID, DEFAULT_MAIN_COLOR_NAME, DEFAULT_MAIN_COLOR_HEX } from './shared';
export { PAGE_SIZE_PRESETS, DEFAULT_CUT_LINES, DEFAULT_PAGE_CONFIG, resolvePageConfig, stripPageDefaults } from './page';
export { DEFAULT_COLUMN_RULE, DEFAULT_LAYOUT_CONFIG, resolveLayoutConfig, stripLayoutDefaults } from './layout';
export { DEFAULT_HYPHENATION_CONFIG, DEFAULT_BODY_TEXT_CONFIG, hyphenationEqual, resolveBodyTextConfig, stripBodyTextDefaults } from './bodyText';
export { DEFAULT_HEADINGS_CONFIG, resolveHeadingsConfig, stripHeadingsDefaults } from './headings';
export { DEFAULT_UNORDERED_LISTS_STATIC, resolveUnorderedListsConfig, stripUnorderedListsDefaults } from './unorderedLists';
export { DEFAULT_ORDERED_LISTS_STATIC, resolveOrderedListsConfig, stripOrderedListsDefaults } from './orderedLists';
export { DEFAULT_DEBUG_CONFIG, resolveDebugConfig, stripDebugDefaults } from './debug';
export { DEFAULT_HTML_VIEWER_CONFIG, resolveHtmlViewerConfig, stripHtmlViewerDefaults } from './htmlViewer';

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
  return result;
}
