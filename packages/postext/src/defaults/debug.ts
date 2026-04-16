import type { DebugConfig, ResolvedDebugConfig } from '../types';
import { colorsEqual } from './shared';

export const DEFAULT_DEBUG_CONFIG: ResolvedDebugConfig = {
  cursorSync: { enabled: true, color: { hex: '#2563eb', model: 'hex' } },
  selectionSync: { enabled: true, color: { hex: '#fde04780', model: 'hex' } },
  looseLineHighlight: {
    enabled: false,
    color: { hex: '#ff000040', model: 'hex' },
    threshold: 3,
  },
  pageNegative: { enabled: false },
};

export function resolveDebugConfig(partial?: DebugConfig): ResolvedDebugConfig {
  if (!partial) {
    return {
      cursorSync: { ...DEFAULT_DEBUG_CONFIG.cursorSync },
      selectionSync: { ...DEFAULT_DEBUG_CONFIG.selectionSync },
      looseLineHighlight: { ...DEFAULT_DEBUG_CONFIG.looseLineHighlight },
      pageNegative: { ...DEFAULT_DEBUG_CONFIG.pageNegative },
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

  return hasOverride ? result : undefined;
}
