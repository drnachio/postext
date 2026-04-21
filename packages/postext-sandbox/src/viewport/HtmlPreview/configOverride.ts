import {
  buildFontString,
  measureGlyphWidth,
  resolveHeadingsConfig,
} from 'postext';
import type { PostextConfig } from 'postext';
import { HTML_DPI, LOCALE_TO_HYPHENATION, PADDING_PX, type ColumnMode } from './constants';

export function buildHtmlConfigOverride(
  base: PostextConfig,
  opts: {
    fontScale: number;
    columnMode: ColumnMode;
    columnWidthPx: number;
    viewportHeightPx: number;
    locale: string;
    optimalLineBreaking: boolean;
  },
): PostextConfig {
  const {
    fontScale,
    columnMode,
    columnWidthPx,
    viewportHeightPx,
    locale,
    optimalLineBreaking,
  } = opts;

  // Body font-size override — screen rendering uses pt at HTML_DPI so the
  // default 8pt ≈ 16px at fontScale=1.
  const baseFontSize = base.bodyText?.fontSize ?? { value: 8, unit: 'pt' as const };
  const scaledFontSize = { value: baseFontSize.value * fontScale, unit: baseFontSize.unit };

  const hypLocale =
    base.bodyText?.hyphenation?.locale ?? LOCALE_TO_HYPHENATION[locale] ?? 'en-us';

  // Single-column mode: disable widow/orphan/runt avoidance (no column breaks
  // to protect — the whole document lives on one tall, scrollable page).
  const disableParagraphRules = columnMode === 'single';

  // Page height: single-column mode needs one very tall page so content never
  // flows to a second. Multi-column mode uses the viewport inner height, so
  // each VDT "page" = one column and horizontal stacking produces the scroll.
  const pageHeightPx =
    columnMode === 'single'
      ? Math.max(viewportHeightPx * 20, 200_000)
      : Math.max(viewportHeightPx - PADDING_PX * 2, 400);

  // Headings use absolute pt sizes, so they don't scale through em cascades.
  // Resolve the user's partial headings config and emit explicit per-level
  // overrides with scaled fontSize so fontScale acts as a uniform multiplier.
  const resolvedHeadings = resolveHeadingsConfig(base.headings);
  const scaledHeadingLevels = resolvedHeadings.levels.map((lvl) => ({
    ...lvl,
    fontSize: { value: lvl.fontSize.value * fontScale, unit: lvl.fontSize.unit },
  }));

  return {
    ...base,
    page: {
      ...base.page,
      dpi: HTML_DPI,
      width: { value: columnWidthPx, unit: 'px' },
      height: { value: pageHeightPx, unit: 'px' },
      margins: {
        top: { value: 0, unit: 'px' },
        bottom: { value: 0, unit: 'px' },
        left: { value: 0, unit: 'px' },
        right: { value: 0, unit: 'px' },
      },
      cutLines: { ...(base.page?.cutLines ?? {}), enabled: false },
      // baselineGrid.enabled is a pure display flag (layout uses the grid
      // value regardless of enabled), so let the user's setting flow through
      // to drive the SVG overlay in HtmlPreview.
      backgroundColor: { hex: 'transparent', model: 'hex' },
    },
    layout: {
      ...base.layout,
      layoutType: 'single',
    },
    bodyText: {
      ...base.bodyText,
      fontSize: scaledFontSize,
      optimalLineBreaking,
      hyphenation: {
        ...(base.bodyText?.hyphenation ?? {}),
        locale: hypLocale,
      },
      ...(disableParagraphRules
        ? {
            avoidOrphans: false,
            avoidWidows: false,
            avoidRunts: false,
            avoidOrphansInLists: false,
            avoidWidowsInLists: false,
            avoidRuntsInLists: false,
          }
        : {}),
    },
    headings: {
      ...base.headings,
      levels: scaledHeadingLevels,
    },
  };
}

export function measureColumnWidthPx(
  sample: string,
  fontFamily: string,
  fontSizePx: number,
  fontWeight: number,
): number {
  const font = buildFontString(fontFamily, fontSizePx, String(fontWeight), 'normal');
  return measureGlyphWidth(sample, font);
}
