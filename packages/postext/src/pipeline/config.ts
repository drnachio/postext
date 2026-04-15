import type { PostextConfig } from '../types';
import {
  resolvePageConfig,
  resolveLayoutConfig,
  resolveBodyTextConfig,
  resolveHeadingsConfig,
  resolveUnorderedListsConfig,
  resolveOrderedListsConfig,
  applyPaletteToConfig,
} from '../defaults';
import { dimensionToPx } from '../units';
import { createBoundingBox, type BoundingBox, type ResolvedConfig } from '../vdt';

export function resolveAllConfig(rawConfig?: PostextConfig): ResolvedConfig {
  const config = applyPaletteToConfig(rawConfig);
  const bodyText = resolveBodyTextConfig(config?.bodyText);
  return {
    page: resolvePageConfig(config?.page),
    layout: resolveLayoutConfig(config?.layout),
    bodyText,
    headings: resolveHeadingsConfig(config?.headings),
    unorderedLists: resolveUnorderedListsConfig(config?.unorderedLists, bodyText),
    orderedLists: resolveOrderedListsConfig(config?.orderedLists, bodyText),
  };
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
