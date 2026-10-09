import type { BitmapResolution, Dimension, FloatShrinkConfig, FloatShrinkMode, LayoutConfig, LayoutType, ResolvedLayoutConfig, ResolvedTextWrapConfig, TextWrapConfig } from '../types';
import { dimensionsEqual, colorsEqual } from './shared';

export const DEFAULT_COLUMN_RULE = {
  enabled: false,
  color: { hex: '#cccccc', model: 'hex' } as const,
  lineWidth: { value: 0.5, unit: 'pt' } as const,
};

/** The smallest scale `placement.shrink` sets a picture at, when nothing
 *  says otherwise (#626). */
export const DEFAULT_FLOAT_MIN_SCALE = 0.7;

/** A `floatShrink.mode` / `placement.shrink` as written: one of the three
 *  words, else `undefined`. */
export function floatShrinkModeOf(value: unknown): FloatShrinkMode | undefined {
  return value === 'never' || value === 'page' || value === 'slot' ? value : undefined;
}

/** A `minScale` as written: a number in (0, 1], else `undefined`. */
export function floatMinScaleOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1 ? value : undefined;
}

/** `layout.floatShrink` resolved: a mode and a smallest scale. */
export function resolveFloatShrink(partial?: FloatShrinkConfig): { mode: FloatShrinkMode; minScale: number } {
  return {
    mode: floatShrinkModeOf(partial?.mode) ?? 'never',
    minScale: floatMinScaleOf(partial?.minScale) ?? DEFAULT_FLOAT_MIN_SCALE,
  };
}

/** `layout.wrap` defaults (#627): no gap of its own (one body line), text
 *  no narrower than 12 em, two lines beside, 45 % of the column. */
export const DEFAULT_TEXT_WRAP: ResolvedTextWrapConfig = {
  minTextWidth: { value: 12, unit: 'em' },
  minLinesBeside: 2,
  defaultWidth: 0.45,
};

function isDimension(value: unknown): value is Dimension {
  return typeof value === 'object' && value !== null && typeof (value as Dimension).value === 'number' && Number.isFinite((value as Dimension).value)
    && typeof (value as Dimension).unit === 'string';
}

/** A `minTextWidth` as written: a length, or a share of the column in
 *  (0, 1]; else `undefined`. */
export function wrapMinTextWidthOf(value: unknown): Dimension | number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 && value <= 1 ? value : undefined;
  return isDimension(value) && value.value >= 0 ? value : undefined;
}

/** A `minLinesBeside` as written: a whole number, at least 1. */
export function wrapMinLinesOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : undefined;
}

/** A `defaultWidth` (or `placement.width`) as a wrap reads it: a share in
 *  (0, 1). */
export function wrapWidthOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 1 ? value : undefined;
}

/** `layout.wrap` resolved; misspelt values fall back to the defaults. */
export function resolveTextWrap(partial?: TextWrapConfig): ResolvedTextWrapConfig {
  const gap = isDimension(partial?.gap) && partial!.gap.value >= 0 ? partial!.gap : undefined;
  return {
    ...(gap ? { gap } : {}),
    minTextWidth: wrapMinTextWidthOf(partial?.minTextWidth) ?? DEFAULT_TEXT_WRAP.minTextWidth,
    minLinesBeside: wrapMinLinesOf(partial?.minLinesBeside) ?? DEFAULT_TEXT_WRAP.minLinesBeside,
    defaultWidth: wrapWidthOf(partial?.defaultWidth) ?? DEFAULT_TEXT_WRAP.defaultWidth,
  };
}

/** A `bitmapResolution` as written (#631): `'document'`, `'file'` or a
 *  positive ppi; else `undefined`. */
export function bitmapResolutionOf(value: unknown): BitmapResolution | undefined {
  if (value === 'document' || value === 'file') return value;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** The share of a column a float heading the page that cites it may take
 *  (`layout.maxTopFraction`, #633). */
export const DEFAULT_MAX_TOP_FRACTION = 0.7;

/** A `maxTopFraction` as written: a number in (0, 1], else `undefined`. */
export function maxTopFractionOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1 ? value : undefined;
}

export const DEFAULT_LAYOUT_CONFIG: ResolvedLayoutConfig = {
  layoutType: 'double',
  columnCount: 3,
  gutterWidth: { value: 0.75, unit: 'cm' },
  sideColumnPercent: 33,
  sideColumnRole: 'text',
  sideColumnSide: 'right',
  columnRule: { ...DEFAULT_COLUMN_RULE },
  fitFiguresToPage: false,
  bitmapResolution: 'document',
  floatShrink: { mode: 'never', minScale: DEFAULT_FLOAT_MIN_SCALE },
  wrap: { ...DEFAULT_TEXT_WRAP },
  floatsAtCitingPage: false,
  maxTopFraction: DEFAULT_MAX_TOP_FRACTION,
  hugClosingFloats: true,
  inlineResourceGap: 'around',
  inlineResourceGapInBoxes: true,
  boxChildSplitMinLines: 2,
  writingMode: 'horizontal-tb',
};

export function resolveLayoutConfig(partial?: LayoutConfig): ResolvedLayoutConfig {
  if (!partial) return { ...DEFAULT_LAYOUT_CONFIG, floatShrink: { ...DEFAULT_LAYOUT_CONFIG.floatShrink }, wrap: resolveTextWrap() };

  return {
    layoutType: partial.layoutType ?? DEFAULT_LAYOUT_CONFIG.layoutType,
    columnCount: partial.columnCount ?? DEFAULT_LAYOUT_CONFIG.columnCount,
    gutterWidth: partial.gutterWidth ?? DEFAULT_LAYOUT_CONFIG.gutterWidth,
    sideColumnPercent: partial.sideColumnPercent ?? DEFAULT_LAYOUT_CONFIG.sideColumnPercent,
    sideColumnRole: partial.sideColumnRole ?? DEFAULT_LAYOUT_CONFIG.sideColumnRole,
    sideColumnSide: partial.sideColumnSide ?? DEFAULT_LAYOUT_CONFIG.sideColumnSide,
    columnRule: partial.columnRule
      ? {
          enabled: partial.columnRule.enabled ?? DEFAULT_COLUMN_RULE.enabled,
          color: partial.columnRule.color ?? DEFAULT_COLUMN_RULE.color,
          lineWidth: partial.columnRule.lineWidth ?? DEFAULT_COLUMN_RULE.lineWidth,
        }
      : { ...DEFAULT_COLUMN_RULE },
    fitFiguresToPage: partial.fitFiguresToPage ?? DEFAULT_LAYOUT_CONFIG.fitFiguresToPage,
    bitmapResolution: bitmapResolutionOf(partial.bitmapResolution) ?? DEFAULT_LAYOUT_CONFIG.bitmapResolution,
    floatShrink: resolveFloatShrink(partial.floatShrink),
    wrap: resolveTextWrap(partial.wrap),
    floatsAtCitingPage: partial.floatsAtCitingPage === true,
    maxTopFraction: maxTopFractionOf(partial.maxTopFraction) ?? DEFAULT_MAX_TOP_FRACTION,
    hugClosingFloats: partial.hugClosingFloats ?? DEFAULT_LAYOUT_CONFIG.hugClosingFloats,
    inlineResourceGap: partial.inlineResourceGap === 'above' ? 'above' : DEFAULT_LAYOUT_CONFIG.inlineResourceGap,
    inlineResourceGapInBoxes: partial.inlineResourceGapInBoxes ?? DEFAULT_LAYOUT_CONFIG.inlineResourceGapInBoxes,
    // A whole number of lines, at least one; anything else is the default.
    boxChildSplitMinLines: Number.isInteger(partial.boxChildSplitMinLines) && partial.boxChildSplitMinLines! >= 1
      ? partial.boxChildSplitMinLines!
      : DEFAULT_LAYOUT_CONFIG.boxChildSplitMinLines,
    // Anything but the one vertical mode is the default.
    writingMode: partial.writingMode === 'vertical-rl' ? 'vertical-rl' : DEFAULT_LAYOUT_CONFIG.writingMode,
  };
}

export function stripLayoutDefaults(layout?: LayoutConfig): LayoutConfig | undefined {
  if (!layout) return undefined;

  const result: LayoutConfig = {};
  let hasOverride = false;

  if (layout.layoutType !== undefined && layout.layoutType !== DEFAULT_LAYOUT_CONFIG.layoutType) {
    result.layoutType = layout.layoutType;
    hasOverride = true;
  }
  if (layout.columnCount !== undefined && layout.columnCount !== DEFAULT_LAYOUT_CONFIG.columnCount) {
    result.columnCount = layout.columnCount;
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
  if (layout.sideColumnRole !== undefined && layout.sideColumnRole !== DEFAULT_LAYOUT_CONFIG.sideColumnRole) {
    result.sideColumnRole = layout.sideColumnRole;
    hasOverride = true;
  }
  if (layout.sideColumnSide !== undefined && layout.sideColumnSide !== DEFAULT_LAYOUT_CONFIG.sideColumnSide) {
    result.sideColumnSide = layout.sideColumnSide;
    hasOverride = true;
  }
  if (layout.fitFiguresToPage !== undefined && layout.fitFiguresToPage !== DEFAULT_LAYOUT_CONFIG.fitFiguresToPage) {
    result.fitFiguresToPage = layout.fitFiguresToPage;
    hasOverride = true;
  }
  const bitmapResolution = bitmapResolutionOf(layout.bitmapResolution);
  if (bitmapResolution !== undefined && bitmapResolution !== DEFAULT_LAYOUT_CONFIG.bitmapResolution) {
    result.bitmapResolution = bitmapResolution;
    hasOverride = true;
  }
  if (layout.floatShrink) {
    const fs: FloatShrinkConfig = {};
    const mode = floatShrinkModeOf(layout.floatShrink.mode);
    const minScale = floatMinScaleOf(layout.floatShrink.minScale);
    if (mode !== undefined && mode !== DEFAULT_LAYOUT_CONFIG.floatShrink.mode) fs.mode = mode;
    if (minScale !== undefined && minScale !== DEFAULT_LAYOUT_CONFIG.floatShrink.minScale) fs.minScale = minScale;
    if (fs.mode !== undefined || fs.minScale !== undefined) {
      result.floatShrink = fs;
      hasOverride = true;
    }
  }
  if (layout.wrap) {
    const w: TextWrapConfig = {};
    const r = resolveTextWrap(layout.wrap);
    if (r.gap) w.gap = r.gap;
    const minText = wrapMinTextWidthOf(layout.wrap.minTextWidth);
    if (minText !== undefined && (typeof minText === 'number' || typeof DEFAULT_TEXT_WRAP.minTextWidth === 'number' || !dimensionsEqual(minText, DEFAULT_TEXT_WRAP.minTextWidth))) w.minTextWidth = minText;
    if (r.minLinesBeside !== DEFAULT_TEXT_WRAP.minLinesBeside) w.minLinesBeside = r.minLinesBeside;
    if (r.defaultWidth !== DEFAULT_TEXT_WRAP.defaultWidth) w.defaultWidth = r.defaultWidth;
    if (Object.keys(w).length > 0) {
      result.wrap = w;
      hasOverride = true;
    }
  }
  if (layout.floatsAtCitingPage !== undefined && layout.floatsAtCitingPage !== DEFAULT_LAYOUT_CONFIG.floatsAtCitingPage) {
    result.floatsAtCitingPage = layout.floatsAtCitingPage;
    hasOverride = true;
  }
  const maxTopFraction = maxTopFractionOf(layout.maxTopFraction);
  if (maxTopFraction !== undefined && maxTopFraction !== DEFAULT_LAYOUT_CONFIG.maxTopFraction) {
    result.maxTopFraction = maxTopFraction;
    hasOverride = true;
  }
  if (layout.hugClosingFloats !== undefined && layout.hugClosingFloats !== DEFAULT_LAYOUT_CONFIG.hugClosingFloats) {
    result.hugClosingFloats = layout.hugClosingFloats;
    hasOverride = true;
  }
  if (layout.inlineResourceGap !== undefined && layout.inlineResourceGap !== DEFAULT_LAYOUT_CONFIG.inlineResourceGap) {
    result.inlineResourceGap = layout.inlineResourceGap;
    hasOverride = true;
  }
  if (layout.inlineResourceGapInBoxes !== undefined && layout.inlineResourceGapInBoxes !== DEFAULT_LAYOUT_CONFIG.inlineResourceGapInBoxes) {
    result.inlineResourceGapInBoxes = layout.inlineResourceGapInBoxes;
    hasOverride = true;
  }
  if (layout.boxChildSplitMinLines !== undefined && layout.boxChildSplitMinLines !== DEFAULT_LAYOUT_CONFIG.boxChildSplitMinLines) {
    result.boxChildSplitMinLines = layout.boxChildSplitMinLines;
    hasOverride = true;
  }
  if (layout.writingMode !== undefined && layout.writingMode !== DEFAULT_LAYOUT_CONFIG.writingMode) {
    result.writingMode = layout.writingMode;
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

/** The fewest and most columns of a `multiple` layout. */
export const MULTIPLE_COLUMNS_MIN = 3;
export const MULTIPLE_COLUMNS_MAX = 8;

/** The column count a `multiple` layout cuts its columns with: `value`
 *  rounded to a whole number and clamped to 3 … 8; a value that is not a
 *  number takes the default (3). `collectConfigWarnings` reports each value
 *  this changes. */
export function columnCountUsed(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_LAYOUT_CONFIG.columnCount;
  return Math.max(MULTIPLE_COLUMNS_MIN, Math.min(MULTIPLE_COLUMNS_MAX, Math.round(n)));
}

/** How many body columns a layout cuts a page into (the side column of a
 *  `oneAndHalf` layout counts). */
export function layoutColumnCount(layout: { layoutType: LayoutType; columnCount: number }): number {
  if (layout.layoutType === 'single') return 1;
  if (layout.layoutType === 'multiple') return columnCountUsed(layout.columnCount);
  return 2;
}
