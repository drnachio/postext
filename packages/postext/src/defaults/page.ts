import type { PageConfig, ResolvedPageConfig, ResolvedPageNumberingConfig, PageMargins, PageNumberingConfig, PageSizePreset, Dimension, CutLinesConfig, WritingMode } from '../types';
import { dimensionsEqual, colorsEqual } from './shared';
import { parseNumberFormat } from '../numbering';

export const PAGE_SIZE_PRESETS: Record<
  Exclude<PageSizePreset, 'custom'>,
  { width: Dimension; height: Dimension }
> = {
  '11x17': { width: { value: 11, unit: 'cm' }, height: { value: 17, unit: 'cm' } },
  '12x19': { width: { value: 12, unit: 'cm' }, height: { value: 19, unit: 'cm' } },
  '17x24': { width: { value: 17, unit: 'cm' }, height: { value: 24, unit: 'cm' } },
  '21x28': { width: { value: 21, unit: 'cm' }, height: { value: 28, unit: 'cm' } },
  // Newspaper formats (#506): the trims of the presses' web widths.
  broadsheet: { width: { value: 375, unit: 'mm' }, height: { value: 597, unit: 'mm' } },
  berliner: { width: { value: 315, unit: 'mm' }, height: { value: 470, unit: 'mm' } },
  tabloid: { width: { value: 280, unit: 'mm' }, height: { value: 430, unit: 'mm' } },
  // A broadsheet folded in half: the compact some dailies moved to.
  compact: { width: { value: 297, unit: 'mm' }, height: { value: 420, unit: 'mm' } },
};

const DEFAULT_PAGE_MARGINS: Required<PageMargins> = {
  top: { value: 2, unit: 'cm' },
  bottom: { value: 2, unit: 'cm' },
  left: { value: 1.5, unit: 'cm' },
  right: { value: 1.5, unit: 'cm' },
  mirror: false,
};

export const DEFAULT_CUT_LINES = {
  enabled: false,
  bleed: { value: 3, unit: 'mm' } as const,
  markLength: { value: 5, unit: 'mm' } as const,
  markOffset: { value: 3, unit: 'mm' } as const,
  markWidth: { value: 0.25, unit: 'pt' } as const,
  color: { hex: '#000000', model: 'hex' } as const,
};

export const DEFAULT_PAGE_NUMBERING: ResolvedPageNumberingConfig = {
  format: 'decimal',
  startAt: 1,
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
  pageNumbering: { ...DEFAULT_PAGE_NUMBERING },
  binding: 'left',
};

/** The edge a book is bound on: `'auto'` (or anything unknown) is the
 *  right edge in a vertical document (clreq §7.1.1.1), in a document
 *  whose text runs right to left (`direction`, the resolved
 *  `PostextConfig.direction`) and in a comic book read right to left
 *  (`comicDirection`, see `comicReadingDirection`: a manga, a
 *  Japanese or Traditional Chinese edition), else the left.
 *  `comicDirection` is undefined in a document without a `comics`
 *  section. */
export function resolvePageBinding(binding: PageConfig['binding'], writingMode?: WritingMode, direction?: 'ltr' | 'rtl', comicDirection?: 'ltr' | 'rtl'): 'left' | 'right' {
  if (binding === 'left' || binding === 'right') return binding;
  return writingMode === 'vertical-rl' || direction === 'rtl' || comicDirection === 'rtl' ? 'right' : 'left';
}

function resolvePageNumbering(raw?: PageNumberingConfig, locale?: string): ResolvedPageNumberingConfig {
  if (!raw) return { ...DEFAULT_PAGE_NUMBERING };
  return {
    // Any spelling of a format is read (`roman-lower`, `arabic`, `i`…, `一`
    // in the document's script); an unknown one numbers in decimal
    // (`collectConfigWarnings` reports it).
    format: parseNumberFormat(raw.format, locale) ?? DEFAULT_PAGE_NUMBERING.format,
    startAt: raw.startAt ?? DEFAULT_PAGE_NUMBERING.startAt,
  };
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

/** A page config in full. `locale` (the document language) decides the
 *  script of a page-number format written `一` or `壹`, and `writingMode`
 *  (the document's `layout.writingMode`), `direction` (its resolved
 *  `direction`) and `comicDirection` (the reading direction of its comics,
 *  `comicReadingDirection`, when the config has a `comics` section)
 *  what `binding: 'auto'` is. */
export function resolvePageConfig(partial?: PageConfig, locale?: string, writingMode?: WritingMode, direction?: 'ltr' | 'rtl', comicDirection?: 'ltr' | 'rtl'): ResolvedPageConfig {
  if (!partial) return { ...DEFAULT_PAGE_CONFIG, binding: resolvePageBinding(undefined, writingMode, direction, comicDirection) };
  const sizePreset = partial.sizePreset ?? DEFAULT_PAGE_CONFIG.sizePreset;
  const presetSize = sizePreset === 'custom' ? undefined : PAGE_SIZE_PRESETS[sizePreset];

  return {
    backgroundColor: partial.backgroundColor ?? DEFAULT_PAGE_CONFIG.backgroundColor,
    sizePreset,
    // A named preset supplies the physical size when the config does not
    // spell out width/height, so `sizePreset: '21x28'` alone lays out at
    // 21 × 28 cm. Explicit dimensions always win.
    width: partial.width ?? presetSize?.width ?? DEFAULT_PAGE_CONFIG.width,
    height: partial.height ?? presetSize?.height ?? DEFAULT_PAGE_CONFIG.height,
    margins: partial.margins
      ? {
          top: partial.margins.top ?? DEFAULT_PAGE_MARGINS.top,
          bottom: partial.margins.bottom ?? DEFAULT_PAGE_MARGINS.bottom,
          left: partial.margins.left ?? DEFAULT_PAGE_MARGINS.left,
          right: partial.margins.right ?? DEFAULT_PAGE_MARGINS.right,
          mirror: partial.margins.mirror ?? DEFAULT_PAGE_MARGINS.mirror,
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
    pageNumbering: resolvePageNumbering(partial.pageNumbering, locale),
    binding: resolvePageBinding(partial.binding, writingMode, direction, comicDirection),
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
    if (page.margins.mirror !== undefined && page.margins.mirror !== DEFAULT_PAGE_MARGINS.mirror) {
      m.mirror = page.margins.mirror;
      hasMarginOverride = true;
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
  if (page.pageNumbering) {
    // Another spelling of the default (`arabic`) is the default.
    const formatOverride = page.pageNumbering.format !== undefined
      && (parseNumberFormat(page.pageNumbering.format) ?? page.pageNumbering.format) !== DEFAULT_PAGE_NUMBERING.format;
    const startAtOverride = page.pageNumbering.startAt !== undefined && page.pageNumbering.startAt !== DEFAULT_PAGE_NUMBERING.startAt;
    if (formatOverride || startAtOverride) {
      result.pageNumbering = {
        ...(formatOverride ? { format: page.pageNumbering.format } : {}),
        ...(startAtOverride ? { startAt: page.pageNumbering.startAt } : {}),
      };
      hasOverride = true;
    }
  }
  if (page.binding !== undefined && page.binding !== 'auto') {
    result.binding = page.binding;
    hasOverride = true;
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
