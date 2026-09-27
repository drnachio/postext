import type { PostextConfig, ResolvedHeadingLevelConfig } from '../types';
import {
  resolvePageConfig,
  resolveLayoutConfig,
  resolveBodyTextConfig,
  resolveHeadingsConfig,
  resolveTableStyleConfig,
  resolveTableStylesConfig,
  resolveCaptionStyleConfig,
  resolveDiagramStyleConfig,
  resolveParagraphStylesConfig,
  resolveCalloutStylesConfig,
  resolveChipStylesConfig,
  resolveUnorderedListsConfig,
  resolveOrderedListsConfig,
  resolveMathConfig,
  resolveHeaderFooterConfig,
  resolvePartsConfig,
  resolveHeadingStylesConfig,
  resolveTocConfig,
  resolvePdfGenerationConfig,
  applyPaletteToConfig,
  applyPaletteToResolvedConfig,
  DEFAULT_LAYOUT_CONFIG,
} from '../defaults';
import { dimensionToPx } from '../units';
import { presentTag } from '../locale';
import { createBoundingBox, type BoundingBox, type ResolvedConfig } from '../vdt';

// Resolved configs are never mutated (derived variants spread them), so
// one resolution per config object serves every pass of a build and every
// chapter counted against the same config on the main thread.
const resolvedByConfig = new WeakMap<PostextConfig, ResolvedConfig>();
let resolvedDefault: ResolvedConfig | null = null;

export function resolveAllConfig(rawConfig?: PostextConfig): ResolvedConfig {
  if (!rawConfig) {
    if (!resolvedDefault) resolvedDefault = resolveAllConfigUncached(undefined);
    return resolvedDefault;
  }
  const hit = resolvedByConfig.get(rawConfig);
  if (hit) return hit;
  const resolved = resolveAllConfigUncached(rawConfig);
  resolvedByConfig.set(rawConfig, resolved);
  return resolved;
}

function resolveAllConfigUncached(rawConfig?: PostextConfig): ResolvedConfig {
  const config = applyPaletteToConfig(rawConfig);
  const bodyText = resolveBodyTextConfig(config?.bodyText, config?.locale);
  const headings = resolveHeadingsConfig(config?.headings);
  const unorderedLists = resolveUnorderedListsConfig(config?.unorderedLists, bodyText);
  const orderedLists = resolveOrderedListsConfig(config?.orderedLists, bodyText);
  const page = resolvePageConfig(config?.page);
  const layout = resolveLayoutConfig(config?.layout);
  const resolved: ResolvedConfig = {
    page,
    layout,
    bodyText,
    headings,
    tableStyle: resolveTableStyleConfig(config?.tableStyle, bodyText, config?.locale),
    tableStyles: resolveTableStylesConfig(config?.tableStyles, config?.tableStyle, bodyText, config?.locale),
    captionStyle: resolveCaptionStyleConfig(config?.captionStyle, bodyText),
    diagramStyle: resolveDiagramStyleConfig(config?.diagramStyle),
    paragraphStyles: resolveParagraphStylesConfig(config?.paragraphStyles, bodyText),
    calloutStyles: resolveCalloutStylesConfig(config?.calloutStyles, bodyText, headings, unorderedLists, config?.locale),
    chipStyles: resolveChipStylesConfig(config?.chipStyles),
    unorderedLists,
    orderedLists,
    math: resolveMathConfig(config?.math),
    header: resolveHeaderFooterConfig(config?.header, 'header'),
    footer: resolveHeaderFooterConfig(config?.footer, 'footer'),
    parts: resolvePartsConfig(config?.parts, page, bodyText, unorderedLists, orderedLists),
    headingStyles: resolveHeadingStylesConfig(config?.headingStyles, page, bodyText, unorderedLists, orderedLists, layout),
    toc: resolveTocConfig(config?.toc, bodyText),
    ...(config?.locale ? { locale: config.locale } : {}),
    // Kept for per-resource-type caption overrides, which resolve their
    // palette colours at layout time (see `mergeCaptionStyle`). A copy: the
    // result is cached against the config object, so a palette the caller
    // changes in place must not reach the colours resolved at layout time
    // (swatches, cell fills) while the ones resolved here keep the old
    // values (EF-175).
    ...(rawConfig?.colorPalette && rawConfig.colorPalette.length > 0
      ? { colorPalette: rawConfig.colorPalette.map((e) => ({ ...e, value: { ...e.value } })) }
      : {}),
    // Not used by layout: carried in the VDT for the PDF backend.
    ...(config?.pdfGeneration ? { pdfGeneration: resolvePdfGenerationConfig(config.pdfGeneration) } : {}),
  };
  return applyPaletteToResolvedConfig(resolved, rawConfig?.colorPalette);
}

/** The document language: `locale`, else the hyphenation locale (which the
 *  Sandbox fills from the app language) — the same rule the table
 *  continuation strings and `documentLocale` follow; a blank tag counts as
 *  unset. */
export function resolvedLocale(resolved: ResolvedConfig): string {
  return presentTag(resolved.locale) ?? presentTag(resolved.bodyText.hyphenation.locale) ?? 'en-us';
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

/** Whether the side column of a `oneAndHalf` layout sits at the left edge
 *  of the content area on this page. `'outer'` / `'inner'` follow the page
 *  parity only when the margins are mirrored (a recto's outer edge is its
 *  right edge, a verso's its left); otherwise they are `'right'` /
 *  `'left'`. */
export function sideColumnOnLeft(resolved: ResolvedConfig, isEvenPage: boolean): boolean {
  const side = resolved.layout.sideColumnSide;
  const mirrored = resolved.page.margins.mirror === true && isEvenPage;
  if (side === 'left') return true;
  if (side === 'right') return false;
  if (side === 'outer') return mirrored;
  return !mirrored; // inner
}

/** Least share of the content width, in percent, that each column of a
 *  `oneAndHalf` layout keeps (see {@link sideColumnPercentUsed}). */
export const SIDE_COLUMN_MIN_SHARE = 1;

/** The side-column width a `oneAndHalf` page is cut with, in percent of
 *  the content width (`contentWidthPx`, with a `gutterPx` gutter). The
 *  value is used as written — a numeric string reads as its number —
 *  while both columns keep at least {@link SIDE_COLUMN_MIN_SHARE} % of the
 *  content width. One that would leave either column narrower (a side
 *  column at or below 0, or one so wide that the main column vanishes
 *  behind the gutter) is clamped to the nearest value that keeps it, and a
 *  value that is not a number takes the default. `collectConfigWarnings`
 *  reports each value this changes. */
export function sideColumnPercentUsed(value: number, contentWidthPx: number, gutterPx: number): number {
  const percent = Number(value);
  if (!Number.isFinite(percent)) return DEFAULT_LAYOUT_CONFIG.sideColumnPercent;
  const gutterShare = contentWidthPx > 0 ? (gutterPx / contentWidthPx) * 100 : 0;
  const max = 100 - gutterShare - SIDE_COLUMN_MIN_SHARE;
  return Math.max(SIDE_COLUMN_MIN_SHARE, Math.min(max, percent));
}

/** Column boxes of a page in reading order. For a `oneAndHalf` layout the
 *  main column comes first and the side column second whatever their
 *  geometric order: a float-only side column (`sideColumnRole: 'floats'`)
 *  is not part of the flow, and a text side column at the left still reads
 *  after the main column (a marginal column). `isEvenPage` decides the side
 *  of an `'outer'` / `'inner'` side column. */
export function computeColumnBboxes(
  contentArea: BoundingBox,
  resolved: ResolvedConfig,
  isEvenPage = false,
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
  const sidePercent = sideColumnPercentUsed(sideColumnPercent, contentArea.width, gutterPx);
  const sideWidth = contentArea.width * (sidePercent / 100);
  const mainWidth = contentArea.width - sideWidth - gutterPx;
  if (sideColumnOnLeft(resolved, isEvenPage)) {
    return [
      createBoundingBox(contentArea.x + sideWidth + gutterPx, contentArea.y, mainWidth, contentArea.height),
      createBoundingBox(contentArea.x, contentArea.y, sideWidth, contentArea.height),
    ];
  }
  return [
    createBoundingBox(contentArea.x, contentArea.y, mainWidth, contentArea.height),
    createBoundingBox(contentArea.x + mainWidth + gutterPx, contentArea.y, sideWidth, contentArea.height),
  ];
}

/** Whether the layout carries a float-only side column (a `oneAndHalf`
 *  layout with `sideColumnRole: 'floats'`). */
export function hasFloatSideColumn(resolved: ResolvedConfig): boolean {
  return resolved.layout.layoutType === 'oneAndHalf' && resolved.layout.sideColumnRole === 'floats';
}
