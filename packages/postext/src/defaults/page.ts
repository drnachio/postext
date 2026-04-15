import type { PageConfig, ResolvedPageConfig, PageMargins, PageSizePreset, Dimension, CutLinesConfig } from '../types';
import { dimensionsEqual, colorsEqual } from './shared';

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
