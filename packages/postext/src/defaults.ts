import type { PageConfig, ResolvedPageConfig, PageMargins, PageSizePreset, Dimension, PostextConfig, LayoutConfig, ResolvedLayoutConfig, BodyTextConfig, ResolvedBodyTextConfig, HeadingsConfig, HeadingLevelConfig, ResolvedHeadingsConfig, ResolvedHeadingLevelConfig, ColorValue, HyphenationConfig, CutLinesConfig } from './types';

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
  left: { value: 1.5, unit: 'cm' },
  right: { value: 1.5, unit: 'cm' },
};

export const DEFAULT_CUT_LINES = {
  enabled: false,
  bleed: { value: 3, unit: 'mm' } as const,
  markLength: { value: 5, unit: 'mm' } as const,
  markOffset: { value: 3, unit: 'mm' } as const,
  markWidth: { value: 0.25, unit: 'pt' } as const,
  color: { hex: '#000000', model: 'hex' } as const,
};

export const DEFAULT_PAGE_CONFIG: ResolvedPageConfig = {
  backgroundColor: { hex: 'transparent', model: 'hex' },
  sizePreset: '17x24',
  width: { value: 17, unit: 'cm' },
  height: { value: 24, unit: 'cm' },
  margins: DEFAULT_PAGE_MARGINS,
  dpi: 300,
  cutLines: { ...DEFAULT_CUT_LINES },
  baselineGrid: { enabled: false, color: { hex: '#cccccc', model: 'hex' }, lineWidth: { value: 0.5, unit: 'pt' } },
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
  if (page.cutLines) {
    const enabledOverride = page.cutLines.enabled !== undefined && page.cutLines.enabled !== DEFAULT_CUT_LINES.enabled;
    const bleedOverride = page.cutLines.bleed !== undefined && !dimensionsEqual(page.cutLines.bleed, DEFAULT_CUT_LINES.bleed);
    const markLengthOverride = page.cutLines.markLength !== undefined && !dimensionsEqual(page.cutLines.markLength, DEFAULT_CUT_LINES.markLength);
    const markOffsetOverride = page.cutLines.markOffset !== undefined && !dimensionsEqual(page.cutLines.markOffset, DEFAULT_CUT_LINES.markOffset);
    const markWidthOverride = page.cutLines.markWidth !== undefined && !dimensionsEqual(page.cutLines.markWidth, DEFAULT_CUT_LINES.markWidth);
    const colorOverride = page.cutLines.color !== undefined && !colorsEqual(page.cutLines.color, DEFAULT_CUT_LINES.color);
    if (enabledOverride || bleedOverride || markLengthOverride || markOffsetOverride || markWidthOverride || colorOverride) {
      result.cutLines = {
        enabled: page.cutLines.enabled ?? DEFAULT_CUT_LINES.enabled,
        ...(bleedOverride ? { bleed: page.cutLines.bleed } : {}),
        ...(markLengthOverride ? { markLength: page.cutLines.markLength } : {}),
        ...(markOffsetOverride ? { markOffset: page.cutLines.markOffset } : {}),
        ...(markWidthOverride ? { markWidth: page.cutLines.markWidth } : {}),
        ...(colorOverride ? { color: page.cutLines.color } : {}),
      };
      hasOverride = true;
    }
  }
  if (page.baselineGrid) {
    const enabledOverride = page.baselineGrid.enabled !== undefined && page.baselineGrid.enabled !== DEFAULT_PAGE_CONFIG.baselineGrid.enabled;
    const colorOverride = page.baselineGrid.color !== undefined && !colorsEqual(page.baselineGrid.color, DEFAULT_PAGE_CONFIG.baselineGrid.color);
    const lineWidthOverride = page.baselineGrid.lineWidth !== undefined && !dimensionsEqual(page.baselineGrid.lineWidth, DEFAULT_PAGE_CONFIG.baselineGrid.lineWidth);
    if (enabledOverride || colorOverride || lineWidthOverride) {
      result.baselineGrid = {
        enabled: page.baselineGrid.enabled ?? DEFAULT_PAGE_CONFIG.baselineGrid.enabled,
        ...(colorOverride ? { color: page.baselineGrid.color } : {}),
        ...(lineWidthOverride ? { lineWidth: page.baselineGrid.lineWidth } : {}),
      };
      hasOverride = true;
    }
  }

  return hasOverride ? result : undefined;
}

export const DEFAULT_COLUMN_RULE = {
  enabled: false,
  color: { hex: '#cccccc', model: 'hex' } as const,
  lineWidth: { value: 0.5, unit: 'pt' } as const,
};

export const DEFAULT_LAYOUT_CONFIG: ResolvedLayoutConfig = {
  layoutType: 'double',
  gutterWidth: { value: 0.75, unit: 'cm' },
  sideColumnPercent: 33,
  columnRule: { ...DEFAULT_COLUMN_RULE },
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
  if (layout.columnRule) {
    const cr: LayoutConfig['columnRule'] = {};
    let hasCrOverride = false;
    if (layout.columnRule.enabled !== undefined && layout.columnRule.enabled !== DEFAULT_COLUMN_RULE.enabled) {
      cr.enabled = layout.columnRule.enabled;
      hasCrOverride = true;
    }
    if (layout.columnRule.color && !colorsEqual(layout.columnRule.color, DEFAULT_COLUMN_RULE.color)) {
      cr.color = layout.columnRule.color;
      hasCrOverride = true;
    }
    if (layout.columnRule.lineWidth && !dimensionsEqual(layout.columnRule.lineWidth, DEFAULT_COLUMN_RULE.lineWidth)) {
      cr.lineWidth = layout.columnRule.lineWidth;
      hasCrOverride = true;
    }
    if (hasCrOverride) {
      result.columnRule = cr;
      hasOverride = true;
    }
  }

  return hasOverride ? result : undefined;
}

export const DEFAULT_HYPHENATION_CONFIG: ResolvedBodyTextConfig['hyphenation'] = {
  enabled: true,
  locale: 'en-us',
};

export const DEFAULT_BODY_TEXT_CONFIG: ResolvedBodyTextConfig = {
  fontFamily: 'EB Garamond',
  fontSize: { value: 9, unit: 'pt' },
  lineHeight: { value: 1.5, unit: 'em' },
  color: { hex: '#000000', model: 'cmyk' },
  textAlign: 'justify',
  fontWeight: 400,
  boldFontWeight: 700,
  hyphenation: { ...DEFAULT_HYPHENATION_CONFIG },
  firstLineIndent: { value: 1.5, unit: 'em' },
  hangingIndent: false,
};

export function hyphenationEqual(a: HyphenationConfig | undefined, b: HyphenationConfig | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (a.enabled ?? DEFAULT_HYPHENATION_CONFIG.enabled) === (b.enabled ?? DEFAULT_HYPHENATION_CONFIG.enabled)
    && (a.locale ?? DEFAULT_HYPHENATION_CONFIG.locale) === (b.locale ?? DEFAULT_HYPHENATION_CONFIG.locale);
}

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
  if (bodyText.textAlign !== undefined && bodyText.textAlign !== DEFAULT_BODY_TEXT_CONFIG.textAlign) {
    result.textAlign = bodyText.textAlign;
    hasOverride = true;
  }
  if (bodyText.fontWeight !== undefined && bodyText.fontWeight !== DEFAULT_BODY_TEXT_CONFIG.fontWeight) {
    result.fontWeight = bodyText.fontWeight;
    hasOverride = true;
  }
  if (bodyText.boldFontWeight !== undefined && bodyText.boldFontWeight !== DEFAULT_BODY_TEXT_CONFIG.boldFontWeight) {
    result.boldFontWeight = bodyText.boldFontWeight;
    hasOverride = true;
  }
  if (bodyText.hyphenation && !hyphenationEqual(bodyText.hyphenation, DEFAULT_BODY_TEXT_CONFIG.hyphenation)) {
    result.hyphenation = bodyText.hyphenation;
    hasOverride = true;
  }
  if (bodyText.firstLineIndent !== undefined && !dimensionsEqual(bodyText.firstLineIndent, DEFAULT_BODY_TEXT_CONFIG.firstLineIndent)) {
    result.firstLineIndent = bodyText.firstLineIndent;
    hasOverride = true;
  }
  if (bodyText.hangingIndent !== undefined && bodyText.hangingIndent !== DEFAULT_BODY_TEXT_CONFIG.hangingIndent) {
    result.hangingIndent = bodyText.hangingIndent;
    hasOverride = true;
  }

  return hasOverride ? result : undefined;
}

const DEFAULT_HEADING_FONT = 'Open Sans';
const DEFAULT_HEADING_LINE_HEIGHT: Dimension = { value: 1.2, unit: 'em' };
const DEFAULT_HEADING_COLOR: ColorValue = { hex: '#000000', model: 'cmyk' };
const DEFAULT_HEADING_FONT_WEIGHT = 700;
const DEFAULT_HEADING_MARGIN_TOP: Dimension = { value: 1.5, unit: 'em' };
const DEFAULT_HEADING_MARGIN_BOTTOM: Dimension = { value: 0.5, unit: 'em' };

const DEFAULT_HEADING_LEVELS: ResolvedHeadingLevelConfig[] = [
  { level: 1, fontSize: { value: 18, unit: 'pt' }, lineHeight: DEFAULT_HEADING_LINE_HEIGHT, fontFamily: DEFAULT_HEADING_FONT, color: DEFAULT_HEADING_COLOR, fontWeight: DEFAULT_HEADING_FONT_WEIGHT, marginTop: DEFAULT_HEADING_MARGIN_TOP, marginBottom: DEFAULT_HEADING_MARGIN_BOTTOM, numberingTemplate: '' },
  { level: 2, fontSize: { value: 15, unit: 'pt' }, lineHeight: DEFAULT_HEADING_LINE_HEIGHT, fontFamily: DEFAULT_HEADING_FONT, color: DEFAULT_HEADING_COLOR, fontWeight: DEFAULT_HEADING_FONT_WEIGHT, marginTop: DEFAULT_HEADING_MARGIN_TOP, marginBottom: DEFAULT_HEADING_MARGIN_BOTTOM, numberingTemplate: '' },
  { level: 3, fontSize: { value: 12, unit: 'pt' }, lineHeight: DEFAULT_HEADING_LINE_HEIGHT, fontFamily: DEFAULT_HEADING_FONT, color: DEFAULT_HEADING_COLOR, fontWeight: DEFAULT_HEADING_FONT_WEIGHT, marginTop: DEFAULT_HEADING_MARGIN_TOP, marginBottom: DEFAULT_HEADING_MARGIN_BOTTOM, numberingTemplate: '' },
  { level: 4, fontSize: { value: 10, unit: 'pt' }, lineHeight: DEFAULT_HEADING_LINE_HEIGHT, fontFamily: DEFAULT_HEADING_FONT, color: DEFAULT_HEADING_COLOR, fontWeight: DEFAULT_HEADING_FONT_WEIGHT, marginTop: DEFAULT_HEADING_MARGIN_TOP, marginBottom: DEFAULT_HEADING_MARGIN_BOTTOM, numberingTemplate: '' },
  { level: 5, fontSize: { value: 9, unit: 'pt' }, lineHeight: DEFAULT_HEADING_LINE_HEIGHT, fontFamily: DEFAULT_HEADING_FONT, color: DEFAULT_HEADING_COLOR, fontWeight: DEFAULT_HEADING_FONT_WEIGHT, marginTop: DEFAULT_HEADING_MARGIN_TOP, marginBottom: DEFAULT_HEADING_MARGIN_BOTTOM, numberingTemplate: '' },
  { level: 6, fontSize: { value: 8, unit: 'pt' }, lineHeight: DEFAULT_HEADING_LINE_HEIGHT, fontFamily: DEFAULT_HEADING_FONT, color: DEFAULT_HEADING_COLOR, fontWeight: DEFAULT_HEADING_FONT_WEIGHT, marginTop: DEFAULT_HEADING_MARGIN_TOP, marginBottom: DEFAULT_HEADING_MARGIN_BOTTOM, numberingTemplate: '' },
];

export const DEFAULT_HEADINGS_CONFIG: ResolvedHeadingsConfig = {
  fontFamily: DEFAULT_HEADING_FONT,
  lineHeight: DEFAULT_HEADING_LINE_HEIGHT,
  color: DEFAULT_HEADING_COLOR,
  textAlign: 'left',
  fontWeight: DEFAULT_HEADING_FONT_WEIGHT,
  marginTop: DEFAULT_HEADING_MARGIN_TOP,
  marginBottom: DEFAULT_HEADING_MARGIN_BOTTOM,
  levels: DEFAULT_HEADING_LEVELS,
};

export function stripHeadingsDefaults(headings?: HeadingsConfig): HeadingsConfig | undefined {
  if (!headings) return undefined;

  const result: HeadingsConfig = {};
  let hasOverride = false;

  if (headings.fontFamily !== undefined && headings.fontFamily !== DEFAULT_HEADINGS_CONFIG.fontFamily) {
    result.fontFamily = headings.fontFamily;
    hasOverride = true;
  }
  if (headings.lineHeight !== undefined && !dimensionsEqual(headings.lineHeight, DEFAULT_HEADINGS_CONFIG.lineHeight)) {
    result.lineHeight = headings.lineHeight;
    hasOverride = true;
  }
  if (headings.color !== undefined && !colorsEqual(headings.color, DEFAULT_HEADINGS_CONFIG.color)) {
    result.color = headings.color;
    hasOverride = true;
  }
  if (headings.textAlign !== undefined && headings.textAlign !== DEFAULT_HEADINGS_CONFIG.textAlign) {
    result.textAlign = headings.textAlign;
    hasOverride = true;
  }
  if (headings.fontWeight !== undefined && headings.fontWeight !== DEFAULT_HEADINGS_CONFIG.fontWeight) {
    result.fontWeight = headings.fontWeight;
    hasOverride = true;
  }
  if (headings.marginTop !== undefined && !dimensionsEqual(headings.marginTop, DEFAULT_HEADINGS_CONFIG.marginTop)) {
    result.marginTop = headings.marginTop;
    hasOverride = true;
  }
  if (headings.marginBottom !== undefined && !dimensionsEqual(headings.marginBottom, DEFAULT_HEADINGS_CONFIG.marginBottom)) {
    result.marginBottom = headings.marginBottom;
    hasOverride = true;
  }
  if (headings.levels && headings.levels.length > 0) {
    const strippedLevels: HeadingLevelConfig[] = [];
    for (const level of headings.levels) {
      const def = DEFAULT_HEADING_LEVELS.find((d) => d.level === level.level);
      if (!def) { strippedLevels.push(level); continue; }
      const entry: HeadingLevelConfig = { level: level.level };
      let levelHasOverride = false;
      if (level.fontSize !== undefined && !dimensionsEqual(level.fontSize, def.fontSize)) {
        entry.fontSize = level.fontSize;
        levelHasOverride = true;
      }
      if (level.lineHeight !== undefined && !dimensionsEqual(level.lineHeight, def.lineHeight)) {
        entry.lineHeight = level.lineHeight;
        levelHasOverride = true;
      }
      if (level.fontFamily !== undefined && level.fontFamily !== def.fontFamily) {
        entry.fontFamily = level.fontFamily;
        levelHasOverride = true;
      }
      if (level.color !== undefined && !colorsEqual(level.color, def.color)) {
        entry.color = level.color;
        levelHasOverride = true;
      }
      if (level.fontWeight !== undefined && level.fontWeight !== def.fontWeight) {
        entry.fontWeight = level.fontWeight;
        levelHasOverride = true;
      }
      if (level.marginTop !== undefined && !dimensionsEqual(level.marginTop, def.marginTop)) {
        entry.marginTop = level.marginTop;
        levelHasOverride = true;
      }
      if (level.marginBottom !== undefined && !dimensionsEqual(level.marginBottom, def.marginBottom)) {
        entry.marginBottom = level.marginBottom;
        levelHasOverride = true;
      }
      if (level.numberingTemplate !== undefined && level.numberingTemplate !== def.numberingTemplate) {
        entry.numberingTemplate = level.numberingTemplate;
        levelHasOverride = true;
      }
      if (levelHasOverride) strippedLevels.push(entry);
    }
    if (strippedLevels.length > 0) {
      result.levels = strippedLevels;
      hasOverride = true;
    }
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
  const strippedHeadings = stripHeadingsDefaults(config.headings);
  if (strippedHeadings) {
    result.headings = strippedHeadings;
  } else {
    delete result.headings;
  }
  return result;
}

function resolveCutLines(raw?: CutLinesConfig | boolean): ResolvedPageConfig['cutLines'] {
  if (!raw) return { ...DEFAULT_CUT_LINES };
  // Backward compat: old saved configs may have cutLines as a plain boolean
  if (typeof raw === 'boolean') return { ...DEFAULT_CUT_LINES, enabled: raw };
  return {
    enabled: raw.enabled ?? DEFAULT_CUT_LINES.enabled,
    bleed: raw.bleed ?? DEFAULT_CUT_LINES.bleed,
    markLength: raw.markLength ?? DEFAULT_CUT_LINES.markLength,
    markOffset: raw.markOffset ?? DEFAULT_CUT_LINES.markOffset,
    markWidth: raw.markWidth ?? DEFAULT_CUT_LINES.markWidth,
    color: raw.color ?? DEFAULT_CUT_LINES.color,
  };
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
    cutLines: resolveCutLines(partial.cutLines as CutLinesConfig | boolean | undefined),
    baselineGrid: partial.baselineGrid
      ? {
          enabled: partial.baselineGrid.enabled ?? DEFAULT_PAGE_CONFIG.baselineGrid.enabled,
          color: partial.baselineGrid.color ?? DEFAULT_PAGE_CONFIG.baselineGrid.color,
          lineWidth: partial.baselineGrid.lineWidth ?? DEFAULT_PAGE_CONFIG.baselineGrid.lineWidth,
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
    columnRule: partial.columnRule
      ? {
          enabled: partial.columnRule.enabled ?? DEFAULT_COLUMN_RULE.enabled,
          color: partial.columnRule.color ?? DEFAULT_COLUMN_RULE.color,
          lineWidth: partial.columnRule.lineWidth ?? DEFAULT_COLUMN_RULE.lineWidth,
        }
      : { ...DEFAULT_COLUMN_RULE },
  };
}

export function resolveBodyTextConfig(partial?: BodyTextConfig): ResolvedBodyTextConfig {
  if (!partial) return { ...DEFAULT_BODY_TEXT_CONFIG, hyphenation: { ...DEFAULT_HYPHENATION_CONFIG } };

  return {
    fontFamily: partial.fontFamily ?? DEFAULT_BODY_TEXT_CONFIG.fontFamily,
    fontSize: partial.fontSize ?? DEFAULT_BODY_TEXT_CONFIG.fontSize,
    lineHeight: partial.lineHeight ?? DEFAULT_BODY_TEXT_CONFIG.lineHeight,
    color: partial.color ?? DEFAULT_BODY_TEXT_CONFIG.color,
    textAlign: partial.textAlign ?? DEFAULT_BODY_TEXT_CONFIG.textAlign,
    fontWeight: partial.fontWeight ?? DEFAULT_BODY_TEXT_CONFIG.fontWeight,
    boldFontWeight: partial.boldFontWeight ?? DEFAULT_BODY_TEXT_CONFIG.boldFontWeight,
    hyphenation: {
      enabled: partial.hyphenation?.enabled ?? DEFAULT_HYPHENATION_CONFIG.enabled,
      locale: partial.hyphenation?.locale ?? DEFAULT_HYPHENATION_CONFIG.locale,
    },
    firstLineIndent: partial.firstLineIndent ?? DEFAULT_BODY_TEXT_CONFIG.firstLineIndent,
    hangingIndent: partial.hangingIndent ?? DEFAULT_BODY_TEXT_CONFIG.hangingIndent,
  };
}

export function resolveHeadingsConfig(partial?: HeadingsConfig): ResolvedHeadingsConfig {
  if (!partial) return { ...DEFAULT_HEADINGS_CONFIG, levels: DEFAULT_HEADING_LEVELS.map((l) => ({ ...l })) };

  const generalFont = partial.fontFamily ?? DEFAULT_HEADINGS_CONFIG.fontFamily;
  const generalLineHeight = partial.lineHeight ?? DEFAULT_HEADINGS_CONFIG.lineHeight;
  const generalColor = partial.color ?? DEFAULT_HEADINGS_CONFIG.color;
  const generalTextAlign = partial.textAlign ?? DEFAULT_HEADINGS_CONFIG.textAlign;
  const generalFontWeight = partial.fontWeight ?? DEFAULT_HEADINGS_CONFIG.fontWeight;
  const generalMarginTop = partial.marginTop ?? DEFAULT_HEADINGS_CONFIG.marginTop;
  const generalMarginBottom = partial.marginBottom ?? DEFAULT_HEADINGS_CONFIG.marginBottom;

  const levels: ResolvedHeadingLevelConfig[] = DEFAULT_HEADING_LEVELS.map((def) => {
    const override = partial.levels?.find((l) => l.level === def.level);
    return {
      level: def.level,
      fontSize: override?.fontSize ?? def.fontSize,
      lineHeight: override?.lineHeight ?? generalLineHeight,
      fontFamily: override?.fontFamily ?? generalFont,
      color: override?.color ?? generalColor,
      fontWeight: override?.fontWeight ?? generalFontWeight,
      marginTop: override?.marginTop ?? generalMarginTop,
      marginBottom: override?.marginBottom ?? generalMarginBottom,
      numberingTemplate: override?.numberingTemplate ?? def.numberingTemplate,
    };
  });

  return { fontFamily: generalFont, lineHeight: generalLineHeight, color: generalColor, textAlign: generalTextAlign, fontWeight: generalFontWeight, marginTop: generalMarginTop, marginBottom: generalMarginBottom, levels };
}
