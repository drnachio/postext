import type { DebugConfig, FitMarksMode, ResolvedDebugConfig, WarningsToggleConfig } from '../../types.js';
import { colorsEqual } from '../shared.js';

export const DEFAULT_DEBUG_CONFIG: ResolvedDebugConfig = {
  cursorSync: { enabled: true, color: { hex: '#2563eb', model: 'hex' } },
  selectionSync: { enabled: true, color: { hex: '#fde04780', model: 'hex' } },
  looseLineHighlight: {
    enabled: false,
    color: { hex: '#ff000040', model: 'hex' },
    threshold: 3,
  },
  pageNegative: { enabled: false },
  warnings: {
    missingFont: true,
    looseLines: true,
    headingHierarchy: true,
    consecutiveHeadings: false,
    listAfterHeading: false,
    designIssues: true,
  },
  // Scaled text and pictures are no news on a book that passes its
  // checks (#1200): only what does not fit and unknown looks by default.
  fitMarks: 'problems',
  fitMarksMinScale: 1,
};

export const FIT_MARKS_MODES: readonly FitMarksMode[] = ['all', 'problems', 'none'];

function fitMarksOf(value: unknown): FitMarksMode {
  return FIT_MARKS_MODES.includes(value as FitMarksMode) ? (value as FitMarksMode) : DEFAULT_DEBUG_CONFIG.fitMarks;
}

function fitMarksMinScaleOf(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : DEFAULT_DEBUG_CONFIG.fitMarksMinScale;
}

export function resolveDebugConfig(partial?: DebugConfig): ResolvedDebugConfig {
  if (!partial) {
    return {
      cursorSync: { ...DEFAULT_DEBUG_CONFIG.cursorSync },
      selectionSync: { ...DEFAULT_DEBUG_CONFIG.selectionSync },
      looseLineHighlight: { ...DEFAULT_DEBUG_CONFIG.looseLineHighlight },
      pageNegative: { ...DEFAULT_DEBUG_CONFIG.pageNegative },
      warnings: { ...DEFAULT_DEBUG_CONFIG.warnings },
      fitMarks: DEFAULT_DEBUG_CONFIG.fitMarks,
      fitMarksMinScale: DEFAULT_DEBUG_CONFIG.fitMarksMinScale,
    };
  }
  return {
    cursorSync: {
      enabled: partial.cursorSync?.enabled ?? DEFAULT_DEBUG_CONFIG.cursorSync.enabled,
      color: partial.cursorSync?.color ?? DEFAULT_DEBUG_CONFIG.cursorSync.color,
    },
    selectionSync: {
      enabled: partial.selectionSync?.enabled ?? DEFAULT_DEBUG_CONFIG.selectionSync.enabled,
      color: partial.selectionSync?.color ?? DEFAULT_DEBUG_CONFIG.selectionSync.color,
    },
    looseLineHighlight: {
      enabled: partial.looseLineHighlight?.enabled ?? DEFAULT_DEBUG_CONFIG.looseLineHighlight.enabled,
      color: partial.looseLineHighlight?.color ?? DEFAULT_DEBUG_CONFIG.looseLineHighlight.color,
      threshold: partial.looseLineHighlight?.threshold ?? DEFAULT_DEBUG_CONFIG.looseLineHighlight.threshold,
    },
    pageNegative: {
      enabled: partial.pageNegative?.enabled ?? DEFAULT_DEBUG_CONFIG.pageNegative.enabled,
    },
    warnings: {
      missingFont: partial.warnings?.missingFont ?? DEFAULT_DEBUG_CONFIG.warnings.missingFont,
      looseLines: partial.warnings?.looseLines ?? DEFAULT_DEBUG_CONFIG.warnings.looseLines,
      headingHierarchy: partial.warnings?.headingHierarchy ?? DEFAULT_DEBUG_CONFIG.warnings.headingHierarchy,
      consecutiveHeadings: partial.warnings?.consecutiveHeadings ?? DEFAULT_DEBUG_CONFIG.warnings.consecutiveHeadings,
      listAfterHeading: partial.warnings?.listAfterHeading ?? DEFAULT_DEBUG_CONFIG.warnings.listAfterHeading,
      designIssues: partial.warnings?.designIssues ?? DEFAULT_DEBUG_CONFIG.warnings.designIssues,
    },
    fitMarks: fitMarksOf(partial.fitMarks),
    fitMarksMinScale: fitMarksMinScaleOf(partial.fitMarksMinScale),
  };
}

export function stripDebugDefaults(debug?: DebugConfig): DebugConfig | undefined {
  if (!debug) return undefined;
  const result: DebugConfig = {};
  let hasOverride = false;

  if (debug.cursorSync) {
    const enabledOverride = debug.cursorSync.enabled !== undefined && debug.cursorSync.enabled !== DEFAULT_DEBUG_CONFIG.cursorSync.enabled;
    const colorOverride = debug.cursorSync.color !== undefined && !colorsEqual(debug.cursorSync.color, DEFAULT_DEBUG_CONFIG.cursorSync.color);
    if (enabledOverride || colorOverride) {
      result.cursorSync = {
        enabled: debug.cursorSync.enabled ?? DEFAULT_DEBUG_CONFIG.cursorSync.enabled,
        ...(colorOverride ? { color: debug.cursorSync.color } : {}),
      };
      hasOverride = true;
    }
  }
  if (debug.selectionSync) {
    const enabledOverride = debug.selectionSync.enabled !== undefined && debug.selectionSync.enabled !== DEFAULT_DEBUG_CONFIG.selectionSync.enabled;
    const colorOverride = debug.selectionSync.color !== undefined && !colorsEqual(debug.selectionSync.color, DEFAULT_DEBUG_CONFIG.selectionSync.color);
    if (enabledOverride || colorOverride) {
      result.selectionSync = {
        enabled: debug.selectionSync.enabled ?? DEFAULT_DEBUG_CONFIG.selectionSync.enabled,
        ...(colorOverride ? { color: debug.selectionSync.color } : {}),
      };
      hasOverride = true;
    }
  }
  if (debug.looseLineHighlight) {
    const def = DEFAULT_DEBUG_CONFIG.looseLineHighlight;
    const enabledOverride = debug.looseLineHighlight.enabled !== undefined && debug.looseLineHighlight.enabled !== def.enabled;
    const colorOverride = debug.looseLineHighlight.color !== undefined && !colorsEqual(debug.looseLineHighlight.color, def.color);
    const thresholdOverride = debug.looseLineHighlight.threshold !== undefined && debug.looseLineHighlight.threshold !== def.threshold;
    if (enabledOverride || colorOverride || thresholdOverride) {
      result.looseLineHighlight = {
        enabled: debug.looseLineHighlight.enabled ?? def.enabled,
        ...(colorOverride ? { color: debug.looseLineHighlight.color } : {}),
        ...(thresholdOverride ? { threshold: debug.looseLineHighlight.threshold } : {}),
      };
      hasOverride = true;
    }
  }

  if (debug.pageNegative) {
    const enabledOverride = debug.pageNegative.enabled !== undefined && debug.pageNegative.enabled !== DEFAULT_DEBUG_CONFIG.pageNegative.enabled;
    if (enabledOverride) {
      result.pageNegative = { enabled: debug.pageNegative.enabled };
      hasOverride = true;
    }
  }

  if (debug.warnings) {
    const def = DEFAULT_DEBUG_CONFIG.warnings;
    const w = debug.warnings;
    const out: WarningsToggleConfig = {};
    let warnHas = false;
    if (w.missingFont !== undefined && w.missingFont !== def.missingFont) {
      out.missingFont = w.missingFont;
      warnHas = true;
    }
    if (w.looseLines !== undefined && w.looseLines !== def.looseLines) {
      out.looseLines = w.looseLines;
      warnHas = true;
    }
    if (w.headingHierarchy !== undefined && w.headingHierarchy !== def.headingHierarchy) {
      out.headingHierarchy = w.headingHierarchy;
      warnHas = true;
    }
    if (w.consecutiveHeadings !== undefined && w.consecutiveHeadings !== def.consecutiveHeadings) {
      out.consecutiveHeadings = w.consecutiveHeadings;
      warnHas = true;
    }
    if (w.listAfterHeading !== undefined && w.listAfterHeading !== def.listAfterHeading) {
      out.listAfterHeading = w.listAfterHeading;
      warnHas = true;
    }
    if (w.designIssues !== undefined && w.designIssues !== def.designIssues) {
      out.designIssues = w.designIssues;
      warnHas = true;
    }
    if (warnHas) {
      result.warnings = out;
      hasOverride = true;
    }
  }

  if (debug.fitMarks !== undefined && debug.fitMarks !== DEFAULT_DEBUG_CONFIG.fitMarks) {
    result.fitMarks = debug.fitMarks;
    hasOverride = true;
  }
  if (debug.fitMarksMinScale !== undefined && debug.fitMarksMinScale !== DEFAULT_DEBUG_CONFIG.fitMarksMinScale) {
    result.fitMarksMinScale = debug.fitMarksMinScale;
    hasOverride = true;
  }

  return hasOverride ? result : undefined;
}
