import type { PostextConfig, ResolvedHeadingLevelConfig } from '../types';
import {
  resolvePageConfig,
  resolveLayoutConfig,
  resolveBodyTextConfig,
  resolveHeadingsConfig,
  resolveTableStyleConfig,
  resolveCaptionStyleConfig,
  resolveDiagramStyleConfig,
  resolveParagraphStylesConfig,
  resolveCalloutStylesConfig,
  resolveUnorderedListsConfig,
  resolveOrderedListsConfig,
  resolveMathConfig,
  resolveHeaderFooterConfig,
  resolvePartsConfig,
  applyPaletteToConfig,
  applyPaletteToResolvedConfig,
} from '../defaults';
import { dimensionToPx } from '../units';
import { createBoundingBox, type BoundingBox, type ResolvedConfig } from '../vdt';

export function resolveAllConfig(rawConfig?: PostextConfig): ResolvedConfig {
  const config = applyPaletteToConfig(rawConfig);
  const bodyText = resolveBodyTextConfig(config?.bodyText);
  const headings = resolveHeadingsConfig(config?.headings);
  const unorderedLists = resolveUnorderedListsConfig(config?.unorderedLists, bodyText);
  const orderedLists = resolveOrderedListsConfig(config?.orderedLists, bodyText);
  const page = resolvePageConfig(config?.page);
  const resolved: ResolvedConfig = {
    page,
    layout: resolveLayoutConfig(config?.layout),
    bodyText,
    headings,
    tableStyle: resolveTableStyleConfig(config?.tableStyle, bodyText),
    captionStyle: resolveCaptionStyleConfig(config?.captionStyle, bodyText),
    diagramStyle: resolveDiagramStyleConfig(config?.diagramStyle),
    paragraphStyles: resolveParagraphStylesConfig(config?.paragraphStyles, bodyText),
    calloutStyles: resolveCalloutStylesConfig(config?.calloutStyles, bodyText, headings, unorderedLists),
    unorderedLists,
    orderedLists,
    math: resolveMathConfig(config?.math),
    header: resolveHeaderFooterConfig(config?.header, 'header'),
    footer: resolveHeaderFooterConfig(config?.footer, 'footer'),
    parts: resolvePartsConfig(config?.parts, page, bodyText, unorderedLists, orderedLists),
    // Kept for per-resource-type caption overrides, which resolve their
    // palette colours at layout time (see `mergeCaptionStyle`).
    ...(rawConfig?.colorPalette && rawConfig.colorPalette.length > 0
      ? { colorPalette: rawConfig.colorPalette }
      : {}),
  };
  return applyPaletteToResolvedConfig(resolved, rawConfig?.colorPalette);
}

/** Index heading-level configs by level so per-block lookups in the
 *  placement loop are O(1) instead of a linear `.find()`. */
export function buildHeadingLevelMap(
  resolved: ResolvedConfig,
): Map<number, ResolvedHeadingLevelConfig> {
  const map = new Map<number, ResolvedHeadingLevelConfig>();
  for (const lvl of resolved.headings.levels) map.set(lvl.level, lvl);
  return map;
}

export function computeBaselineGrid(resolved: ResolvedConfig): number {
  const dpi = resolved.page.dpi;
  const bodyFontSizePx = dimensionToPx(resolved.bodyText.fontSize, dpi);
  const lineHeightDim = resolved.bodyText.lineHeight;

  // em/rem: multiplier of font size; pt/px/cm/etc: absolute
  if (lineHeightDim.unit === 'em' || lineHeightDim.unit === 'rem') {
    return bodyFontSizePx * lineHeightDim.value;
  }
  return dimensionToPx(lineHeightDim, dpi, bodyFontSizePx);
}

export function computeColumnBboxes(
  contentArea: BoundingBox,
  resolved: ResolvedConfig,
): BoundingBox[] {
  const { layoutType, gutterWidth, sideColumnPercent } = resolved.layout;
  const dpi = resolved.page.dpi;

  if (layoutType === 'single') {
    return [createBoundingBox(contentArea.x, contentArea.y, contentArea.width, contentArea.height)];
  }

  const gutterPx = dimensionToPx(gutterWidth, dpi);

  if (layoutType === 'double') {
    const colWidth = (contentArea.width - gutterPx) / 2;
    return [
      createBoundingBox(contentArea.x, contentArea.y, colWidth, contentArea.height),
      createBoundingBox(contentArea.x + colWidth + gutterPx, contentArea.y, colWidth, contentArea.height),
    ];
  }

  // oneAndHalf
  const sideWidth = contentArea.width * (sideColumnPercent / 100);
  const mainWidth = contentArea.width - sideWidth - gutterPx;
  return [
    createBoundingBox(contentArea.x, contentArea.y, mainWidth, contentArea.height),
    createBoundingBox(contentArea.x + mainWidth + gutterPx, contentArea.y, sideWidth, contentArea.height),
  ];
}
