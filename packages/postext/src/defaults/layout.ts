import type { LayoutConfig, ResolvedLayoutConfig } from '../types';
import { dimensionsEqual, colorsEqual } from './shared';

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
