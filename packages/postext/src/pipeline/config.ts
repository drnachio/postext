import type { DigitSystem, PostextConfig, ResolvedHeadingLevelConfig } from '../types';
import { columnCountUsed, layoutColumnCount, MULTIPLE_COLUMNS_MAX, MULTIPLE_COLUMNS_MIN } from '../defaults/layout';

export { columnCountUsed, layoutColumnCount, MULTIPLE_COLUMNS_MAX, MULTIPLE_COLUMNS_MIN };
import {
  resolvePageConfig,
  resolveLayoutConfig,
  resolveBodyTextConfig,
  resolveHeadingsConfig,
  resolveTableStyleConfig,
  resolveTableStylesConfig,
  resolveCaptionStyleConfig,
  resolveDiagramStyleConfig,
  resolveVideoStyleConfig,
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
  resolveIndexConfig,
  resolveFootnotesConfig,
  resolveCrossRefsConfig,
  resolveCitationsConfig,
  resolveCjkConfig,
  resolvePdfGenerationConfig,
  resolveFolioConfig,
  resolveComicsConfig,
  comicReadingDirection,
  applyPaletteToConfig,
  applyPaletteToResolvedConfig,
  DEFAULT_LAYOUT_CONFIG,
} from '../defaults';
import { dimensionToPx } from '../units';
import { applyCjkGrid } from './cjkGrid';
import { directionOf, presentTag, resolveNumerals } from '../locale';
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
  // The character grid (`cjk.grid`) sets the margins and the gutter before
  // anything reads them (see `cjkGrid.ts`).
  const config = applyCjkGrid(applyPaletteToConfig(rawConfig));
  const bodyText = resolveBodyTextConfig(config?.bodyText, config?.locale);
  // The document language as `resolvedLocale` reads it: the script of the
  // numeral tokens 一 and 壹 in list and page formats follows it, as it does
  // in heading templates and `:::numbering`, and so does the `cjk` region.
  const documentLocale = documentLocaleOf(config?.locale, bodyText.hyphenation);
  const layout = resolveLayoutConfig(config?.layout);
  const direction = resolveDirection(config?.direction, documentLocale);
  const headings = verticalBalancing(resolveHeadingsConfig(config?.headings), layout, config?.headings?.balancing?.enabled);
  const unorderedLists = resolveUnorderedListsConfig(config?.unorderedLists, bodyText);
  const orderedLists = resolveOrderedListsConfig(config?.orderedLists, bodyText, documentLocale);
  // A comic book (a config with a `comics` section) read right to left is
  // bound on the right when the binding is Auto: a manga, and a Japanese or
  // Traditional Chinese edition of a Western comic. The section, not the
  // `:::page` blocks of one chapter, decides it, so every chapter of a book
  // is bound the same way.
  const comicDirection = config?.comics
    ? comicReadingDirection(config.comics, { locale: documentLocale, direction, writingMode: layout.writingMode })
    : undefined;
  const page = resolvePageConfig(config?.page, documentLocale, layout.writingMode, direction, comicDirection);
  // The digits of the generated numbers, from the document language unless
  // the config names them; kept only when they are not the European ones,
  // so a Latin document resolves exactly as before.
  const numerals = resolveNumerals(config?.numerals, documentLocale);
  const resolved: ResolvedConfig = {
    page,
    layout,
    bodyText,
    headings,
    tableStyle: resolveTableStyleConfig(config?.tableStyle, bodyText, config?.locale),
    tableStyles: resolveTableStylesConfig(config?.tableStyles, config?.tableStyle, bodyText, config?.locale),
    captionStyle: resolveCaptionStyleConfig(config?.captionStyle, bodyText, documentLocale),
    diagramStyle: resolveDiagramStyleConfig(config?.diagramStyle),
    videoStyle: resolveVideoStyleConfig(config?.videoStyle),
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
    index: resolveIndexConfig(config?.index, bodyText, documentLocale),
    footnotes: resolveFootnotesConfig(config?.footnotes, documentLocale, layout.writingMode),
    crossRefs: resolveCrossRefsConfig(config?.crossRefs, documentLocale),
    citations: resolveCitationsConfig(config?.citations),
    cjk: resolveCjkConfig(config?.cjk, documentLocale),
    ...(config?.locale ? { locale: config.locale } : {}),
    // Only a right-to-left document carries it: a left-to-right one
    // resolves (and hashes) as it did before directions existed.
    ...(direction === 'rtl' ? { direction } : {}),
    ...(numerals !== 'latn' ? { numerals } : {}),
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
    // Not used by layout either: the Folio 3D viewer reads it.
    ...(config?.folio ? { folio: resolveFolioConfig(config.folio, page.sizePreset) } : {}),
    // Comic pages: only a config that sets the section carries it (a
    // `:::page` without one reads the defaults, `resolvedComics`).
    ...(config?.comics ? { comics: resolveComicsConfig(config.comics, documentLocale) } : {}),
  };
  return applyPaletteToResolvedConfig(resolved, rawConfig?.colorPalette);
}

/** Tiers of vertical text are not balanced: the flow fills the upper tier,
 *  then the next, and a chapter's last tiers end where their text ends
 *  (clreq §7.1.3.4). Column balancing is therefore off in a vertical
 *  document unless the config turns it on itself. */
function verticalBalancing(
  headings: ResolvedConfig['headings'],
  layout: ResolvedConfig['layout'],
  asked: boolean | undefined,
): ResolvedConfig['headings'] {
  if (layout.writingMode !== 'vertical-rl' || asked !== undefined || !headings.balancing.enabled) return headings;
  return { ...headings, balancing: { ...headings.balancing, enabled: false } };
}

/** The base direction of a document: `direction` as written when it is
 *  `'ltr'` or `'rtl'`; otherwise (`'auto'`, unset, or a value the engine
 *  does not know, which `collectConfigWarnings` reports) the direction of
 *  the document language's script (`directionOf`). */
export function resolveDirection(direction: unknown, documentLocale: string): 'ltr' | 'rtl' {
  if (direction === 'ltr' || direction === 'rtl') return direction;
  return directionOf(documentLocale);
}

/** The resolved base direction of a document (see
 *  `ResolvedConfig.direction`). */
export function resolvedDirection(resolved: ResolvedConfig): 'ltr' | 'rtl' {
  return resolved.direction === 'rtl' ? 'rtl' : 'ltr';
}

/** The document language: `locale`, else the hyphenation locale as written
 *  (which the Sandbox fills from the app language) — the same rule the table
 *  continuation strings and `documentLocale` follow; a blank tag counts as
 *  unset. */
export function resolvedLocale(resolved: ResolvedConfig): string {
  return documentLocaleOf(resolved.locale, resolved.bodyText.hyphenation);
}

/** The digit system of the document's generated numbers (see
 *  `PostextConfig.numerals`): `'latn'` unless the config or its language
 *  says otherwise. */
export function documentNumerals(resolved: ResolvedConfig): DigitSystem {
  return resolved.numerals ?? 'latn';
}

function documentLocaleOf(locale: string | undefined, h: ResolvedConfig['bodyText']['hyphenation']): string {
  return presentTag(locale) ?? presentTag(h.tag) ?? presentTag(h.locale) ?? 'en-us';
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
 *  only when the margins are mirrored: `mirrored` is whether this page
 *  swaps them (`pageMirrored`: a verso of a left-bound book, a recto of a
 *  right-bound one), whose outer edge is its left; otherwise they are
 *  `'right'` / `'left'`. In a vertical flow the side column is a tier: the
 *  flow's left is the sheet's top, and `'outer'` / `'inner'` are
 *  `'right'` / `'left'` there (a tier has no outer edge). */
export function sideColumnOnLeft(resolved: ResolvedConfig, mirrored: boolean): boolean {
  const side = resolved.layout.sideColumnSide;
  if (resolved.layout.writingMode === 'vertical-rl') mirrored = false;
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
 *  after the main column (a marginal column). `mirrored` (the page swaps
 *  its mirrored margins, see `pageMirrored`) decides the side of an
 *  `'outer'` / `'inner'` side column. */
export function computeColumnBboxes(
  contentArea: BoundingBox,
  resolved: ResolvedConfig,
  mirrored = false,
): BoundingBox[] {
  const { layoutType, gutterWidth, sideColumnPercent } = resolved.layout;
  const dpi = resolved.page.dpi;

  if (layoutType === 'single') {
    return [createBoundingBox(contentArea.x, contentArea.y, contentArea.width, contentArea.height)];
  }

  const gutterPx = dimensionToPx(gutterWidth, dpi);

  if (layoutType === 'double' || layoutType === 'multiple') {
    const n = layoutType === 'double' ? 2 : columnCountUsed(resolved.layout.columnCount);
    const colWidth = (contentArea.width - (n - 1) * gutterPx) / n;
    return Array.from({ length: n }, (_, i) =>
      createBoundingBox(contentArea.x + i * (colWidth + gutterPx), contentArea.y, colWidth, contentArea.height),
    );
  }

  // oneAndHalf
  const sidePercent = sideColumnPercentUsed(sideColumnPercent, contentArea.width, gutterPx);
  const sideWidth = contentArea.width * (sidePercent / 100);
  const mainWidth = contentArea.width - sideWidth - gutterPx;
  if (sideColumnOnLeft(resolved, mirrored)) {
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
