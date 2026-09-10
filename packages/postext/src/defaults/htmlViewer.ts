import type { HtmlViewerConfig, HtmlViewerOverrides, PostextConfig, ResolvedHtmlViewerConfig } from '../types';

export const DEFAULT_HTML_VIEWER_CONFIG: ResolvedHtmlViewerConfig = {
  maxCharsPerLine: 70,
  columnGap: 50,
  optimalLineBreaking: false,
};

export function resolveHtmlViewerConfig(
  partial?: HtmlViewerConfig,
): ResolvedHtmlViewerConfig {
  if (!partial) {
    return {
      maxCharsPerLine: DEFAULT_HTML_VIEWER_CONFIG.maxCharsPerLine,
      columnGap: DEFAULT_HTML_VIEWER_CONFIG.columnGap,
      optimalLineBreaking: DEFAULT_HTML_VIEWER_CONFIG.optimalLineBreaking,
    };
  }
  return {
    maxCharsPerLine:
      partial.maxCharsPerLine ?? DEFAULT_HTML_VIEWER_CONFIG.maxCharsPerLine,
    columnGap: partial.columnGap ?? DEFAULT_HTML_VIEWER_CONFIG.columnGap,
    optimalLineBreaking:
      partial.optimalLineBreaking ??
      DEFAULT_HTML_VIEWER_CONFIG.optimalLineBreaking,
    ...(hasOverrides(partial.overrides) ? { overrides: partial.overrides } : {}),
  };
}

function hasOverrides(overrides: HtmlViewerOverrides | undefined): overrides is HtmlViewerOverrides {
  return overrides !== undefined && Object.keys(overrides).length > 0;
}

export function stripHtmlViewerDefaults(
  htmlViewer?: HtmlViewerConfig,
): HtmlViewerConfig | undefined {
  if (!htmlViewer) return undefined;
  const result: HtmlViewerConfig = {};
  let hasOverride = false;

  if (
    htmlViewer.maxCharsPerLine !== undefined &&
    htmlViewer.maxCharsPerLine !== DEFAULT_HTML_VIEWER_CONFIG.maxCharsPerLine
  ) {
    result.maxCharsPerLine = htmlViewer.maxCharsPerLine;
    hasOverride = true;
  }
  if (
    htmlViewer.columnGap !== undefined &&
    htmlViewer.columnGap !== DEFAULT_HTML_VIEWER_CONFIG.columnGap
  ) {
    result.columnGap = htmlViewer.columnGap;
    hasOverride = true;
  }
  if (
    htmlViewer.optimalLineBreaking !== undefined &&
    htmlViewer.optimalLineBreaking !==
      DEFAULT_HTML_VIEWER_CONFIG.optimalLineBreaking
  ) {
    result.optimalLineBreaking = htmlViewer.optimalLineBreaking;
    hasOverride = true;
  }
  // Screen-only config has no default to strip against: keep it verbatim.
  if (hasOverrides(htmlViewer.overrides)) {
    result.overrides = htmlViewer.overrides;
    hasOverride = true;
  }

  return hasOverride ? result : undefined;
}

// ---------------------------------------------------------------------------
// `htmlViewer.overrides` — screen-only config merged over the document config.
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasLevelKey(value: unknown): value is { level: number } {
  return isPlainObject(value) && typeof value.level === 'number';
}

/** `levels` arrays (headings, lists) merge entry by entry on `level`, so an
 *  override can retouch one heading level without restating the others.
 *  Override levels the base lacks are appended in override order. */
function mergeLevels(base: unknown[], override: unknown[]): unknown[] {
  const out = [...base];
  for (const entry of override) {
    const idx = out.findIndex((b) => hasLevelKey(b) && hasLevelKey(entry) && b.level === entry.level);
    if (idx === -1) out.push(entry);
    else out[idx] = mergeValue(out[idx], entry, 'levels');
  }
  return out;
}

function mergeValue(base: unknown, override: unknown, key: string): unknown {
  if (override === undefined) return base;
  if (Array.isArray(override)) {
    if (
      key === 'levels' &&
      Array.isArray(base) &&
      base.every(hasLevelKey) &&
      override.every(hasLevelKey)
    ) {
      return mergeLevels(base, override);
    }
    return override;
  }
  if (isPlainObject(override) && isPlainObject(base)) {
    const out: Record<string, unknown> = { ...base };
    for (const [k, v] of Object.entries(override)) out[k] = mergeValue(base[k], v, k);
    return out;
  }
  return override;
}

/** Merge `overrides` over `base` with the `HtmlViewerConfig.overrides`
 *  rules: recursive for objects, by `level` for `levels` arrays, wholesale
 *  replacement for every other array. Neither input is mutated. */
export function mergeConfigOverrides(
  base: PostextConfig,
  overrides: HtmlViewerOverrides,
): PostextConfig {
  return mergeValue(base, overrides, '') as PostextConfig;
}

/** The document config as the HTML viewer should lay it out: the config
 *  with `htmlViewer.overrides` merged in. Returns `config` itself when it
 *  carries no overrides, so callers can key caches on identity. */
export function applyHtmlViewerOverrides(config: PostextConfig): PostextConfig {
  const overrides = config.htmlViewer?.overrides;
  if (!hasOverrides(overrides)) return config;
  const merged = mergeConfigOverrides(config, overrides);
  // The overrides have been consumed: a merged config that still carried
  // them would re-apply on a second pass.
  const { overrides: _consumed, ...htmlViewer } = config.htmlViewer!;
  void _consumed;
  return { ...merged, htmlViewer };
}
