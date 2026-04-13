import type { PageConfig, ResolvedPageConfig, PageMargins, PageSizePreset, Dimension, PostextConfig, LayoutConfig, ResolvedLayoutConfig, BodyTextConfig, ResolvedBodyTextConfig, ColorValue } from './types';

export const PAGE_SIZE_PRESETS: Record<
  Exclude<PageSizePreset, 'custom'>,
  { width: Dimension; height: Dimension }
> = {
  '11x17': { width: { value: 11, unit: 'cm' }, height: { value: 17, unit: 'cm' } },
  '12x19': { width: { value: 12, unit: 'cm' }, height: { value: 19, unit: 'cm' } },
  '17x24': { width: { value: 17, unit: 'cm' }, height: { value: 24, unit: 'cm' } },
  '21x28': { width: { value: 21, unit: 'cm' }, height: { value: 28, unit: 'cm' } },
};

const DEFAULT_PAGE_MARGINS: Required<PageMargins> = {
  top: { value: 2, unit: 'cm' },
  bottom: { value: 2, unit: 'cm' },
  left: { value: 2, unit: 'cm' },
  right: { value: 2, unit: 'cm' },
};

export const DEFAULT_PAGE_CONFIG: ResolvedPageConfig = {
  backgroundColor: { hex: 'transparent', model: 'hex' },
  sizePreset: '17x24',
  width: { value: 17, unit: 'cm' },
  height: { value: 24, unit: 'cm' },
  margins: DEFAULT_PAGE_MARGINS,
  dpi: 300,
  cutLines: false,
  baselineGrid: { enabled: false, color: { hex: '#cccccc', model: 'hex' } },
};

export function dimensionsEqual(a: Dimension, b: Dimension): boolean {
  return a.value === b.value && a.unit === b.unit;
}

export function colorsEqual(a: ColorValue, b: ColorValue): boolean {
  return a.hex === b.hex && a.model === b.model;
}

export function stripPageDefaults(page?: PageConfig): PageConfig | undefined {
  if (!page) return undefined;

  const result: PageConfig = {};
  let hasOverride = false;

  if (page.backgroundColor !== undefined && !colorsEqual(page.backgroundColor, DEFAULT_PAGE_CONFIG.backgroundColor)) {
    result.backgroundColor = page.backgroundColor;
    hasOverride = true;
  }
  if (page.sizePreset !== undefined && page.sizePreset !== DEFAULT_PAGE_CONFIG.sizePreset) {
    result.sizePreset = page.sizePreset;
    hasOverride = true;
  }
  if (page.width !== undefined && !dimensionsEqual(page.width, DEFAULT_PAGE_CONFIG.width)) {
    result.width = page.width;
    hasOverride = true;
  }
  if (page.height !== undefined && !dimensionsEqual(page.height, DEFAULT_PAGE_CONFIG.height)) {
    result.height = page.height;
    hasOverride = true;
  }
  if (page.margins) {
    const m: PageMargins = {};
    let hasMarginOverride = false;
    for (const side of ['top', 'bottom', 'left', 'right'] as const) {
      if (page.margins[side] && !dimensionsEqual(page.margins[side], DEFAULT_PAGE_MARGINS[side]!)) {
        m[side] = page.margins[side];
        hasMarginOverride = true;
      }
    }
    if (hasMarginOverride) {
      result.margins = m;
      hasOverride = true;
    }
  }
  if (page.dpi !== undefined && page.dpi !== DEFAULT_PAGE_CONFIG.dpi) {
    result.dpi = page.dpi;
    hasOverride = true;
  }
  if (page.cutLines !== undefined && page.cutLines !== DEFAULT_PAGE_CONFIG.cutLines) {
    result.cutLines = page.cutLines;
    hasOverride = true;
  }
  if (page.baselineGrid) {
    const enabledOverride = page.baselineGrid.enabled !== undefined && page.baselineGrid.enabled !== DEFAULT_PAGE_CONFIG.baselineGrid.enabled;
    const colorOverride = page.baselineGrid.color !== undefined && !colorsEqual(page.baselineGrid.color, DEFAULT_PAGE_CONFIG.baselineGrid.color);
    if (enabledOverride || colorOverride) {
      result.baselineGrid = {
        enabled: page.baselineGrid.enabled ?? DEFAULT_PAGE_CONFIG.baselineGrid.enabled,
        ...(colorOverride ? { color: page.baselineGrid.color } : {}),
      };
      hasOverride = true;
    }
  }

  return hasOverride ? result : undefined;
}

export const DEFAULT_LAYOUT_CONFIG: ResolvedLayoutConfig = {
  layoutType: 'single',
  gutterWidth: { value: 0.5, unit: 'cm' },
  sideColumnPercent: 33,
};

export function stripLayoutDefaults(layout?: LayoutConfig): LayoutConfig | undefined {
  if (!layout) return undefined;

  const result: LayoutConfig = {};
  let hasOverride = false;

  if (layout.layoutType !== undefined && layout.layoutType !== DEFAULT_LAYOUT_CONFIG.layoutType) {
    result.layoutType = layout.layoutType;
    hasOverride = true;
  }
  if (layout.gutterWidth !== undefined && !dimensionsEqual(layout.gutterWidth, DEFAULT_LAYOUT_CONFIG.gutterWidth)) {
    result.gutterWidth = layout.gutterWidth;
    hasOverride = true;
  }
  if (layout.sideColumnPercent !== undefined && layout.sideColumnPercent !== DEFAULT_LAYOUT_CONFIG.sideColumnPercent) {
    result.sideColumnPercent = layout.sideColumnPercent;
    hasOverride = true;
  }

  return hasOverride ? result : undefined;
}

export const DEFAULT_BODY_TEXT_CONFIG: ResolvedBodyTextConfig = {
  fontFamily: 'EB Garamond',
  fontSize: { value: 18, unit: 'pt' },
  lineHeight: { value: 1.5, unit: 'em' },
  color: { hex: '#000000', model: 'cmyk' },
};

export function stripBodyTextDefaults(bodyText?: BodyTextConfig): BodyTextConfig | undefined {
  if (!bodyText) return undefined;

  const result: BodyTextConfig = {};
  let hasOverride = false;

  if (bodyText.fontFamily !== undefined && bodyText.fontFamily !== DEFAULT_BODY_TEXT_CONFIG.fontFamily) {
    result.fontFamily = bodyText.fontFamily;
    hasOverride = true;
  }
  if (bodyText.fontSize !== undefined && !dimensionsEqual(bodyText.fontSize, DEFAULT_BODY_TEXT_CONFIG.fontSize)) {
    result.fontSize = bodyText.fontSize;
    hasOverride = true;
  }
  if (bodyText.lineHeight !== undefined && !dimensionsEqual(bodyText.lineHeight, DEFAULT_BODY_TEXT_CONFIG.lineHeight)) {
    result.lineHeight = bodyText.lineHeight;
    hasOverride = true;
  }
  if (bodyText.color !== undefined && !colorsEqual(bodyText.color, DEFAULT_BODY_TEXT_CONFIG.color)) {
    result.color = bodyText.color;
    hasOverride = true;
  }

  return hasOverride ? result : undefined;
}

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
  return result;
}

export function resolvePageConfig(partial?: PageConfig): ResolvedPageConfig {
  if (!partial) return { ...DEFAULT_PAGE_CONFIG };

  return {
    backgroundColor: partial.backgroundColor ?? DEFAULT_PAGE_CONFIG.backgroundColor,
    sizePreset: partial.sizePreset ?? DEFAULT_PAGE_CONFIG.sizePreset,
    width: partial.width ?? DEFAULT_PAGE_CONFIG.width,
    height: partial.height ?? DEFAULT_PAGE_CONFIG.height,
    margins: partial.margins
      ? {
          top: partial.margins.top ?? DEFAULT_PAGE_MARGINS.top,
          bottom: partial.margins.bottom ?? DEFAULT_PAGE_MARGINS.bottom,
          left: partial.margins.left ?? DEFAULT_PAGE_MARGINS.left,
          right: partial.margins.right ?? DEFAULT_PAGE_MARGINS.right,
        }
      : { ...DEFAULT_PAGE_MARGINS },
    dpi: partial.dpi ?? DEFAULT_PAGE_CONFIG.dpi,
    cutLines: partial.cutLines ?? DEFAULT_PAGE_CONFIG.cutLines,
    baselineGrid: partial.baselineGrid
      ? {
          enabled: partial.baselineGrid.enabled ?? DEFAULT_PAGE_CONFIG.baselineGrid.enabled,
          color: partial.baselineGrid.color ?? DEFAULT_PAGE_CONFIG.baselineGrid.color,
        }
      : { ...DEFAULT_PAGE_CONFIG.baselineGrid },
  };
}

export function resolveLayoutConfig(partial?: LayoutConfig): ResolvedLayoutConfig {
  if (!partial) return { ...DEFAULT_LAYOUT_CONFIG };

  return {
    layoutType: partial.layoutType ?? DEFAULT_LAYOUT_CONFIG.layoutType,
    gutterWidth: partial.gutterWidth ?? DEFAULT_LAYOUT_CONFIG.gutterWidth,
    sideColumnPercent: partial.sideColumnPercent ?? DEFAULT_LAYOUT_CONFIG.sideColumnPercent,
  };
}

export function resolveBodyTextConfig(partial?: BodyTextConfig): ResolvedBodyTextConfig {
  if (!partial) return { ...DEFAULT_BODY_TEXT_CONFIG };

  return {
    fontFamily: partial.fontFamily ?? DEFAULT_BODY_TEXT_CONFIG.fontFamily,
    fontSize: partial.fontSize ?? DEFAULT_BODY_TEXT_CONFIG.fontSize,
    lineHeight: partial.lineHeight ?? DEFAULT_BODY_TEXT_CONFIG.lineHeight,
    color: partial.color ?? DEFAULT_BODY_TEXT_CONFIG.color,
  };
}
