import type { CanvasViewerConfig, ResolvedCanvasViewerConfig } from '../../types.js';

export const DEFAULT_CANVAS_VIEWER_CONFIG: ResolvedCanvasViewerConfig = {
  pageGap: 24,
  rowGap: 24,
};

/** The largest space either setting takes, in screen pixels. */
export const CANVAS_VIEWER_MAX_GAP = 200;

/** A whole number of pixels from 0 to {@link CANVAS_VIEWER_MAX_GAP}: the
 *  value rounded and held inside the range, else the default. A value
 *  outside the range is reported by `collectConfigWarnings`. */
function gapOf(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(CANVAS_VIEWER_MAX_GAP, Math.max(0, Math.round(value)));
}

export function resolveCanvasViewerConfig(partial?: CanvasViewerConfig): ResolvedCanvasViewerConfig {
  const d = DEFAULT_CANVAS_VIEWER_CONFIG;
  return {
    pageGap: gapOf(partial?.pageGap, d.pageGap),
    rowGap: gapOf(partial?.rowGap, d.rowGap),
  };
}

export function stripCanvasViewerDefaults(cfg?: CanvasViewerConfig): CanvasViewerConfig | undefined {
  if (!cfg) return undefined;
  const d = DEFAULT_CANVAS_VIEWER_CONFIG;
  const result: CanvasViewerConfig = {};
  if (cfg.pageGap !== undefined && cfg.pageGap !== d.pageGap) result.pageGap = cfg.pageGap;
  if (cfg.rowGap !== undefined && cfg.rowGap !== d.rowGap) result.rowGap = cfg.rowGap;
  return Object.keys(result).length > 0 ? result : undefined;
}
