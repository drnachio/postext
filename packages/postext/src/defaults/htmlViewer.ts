import type { HtmlViewerConfig, ResolvedHtmlViewerConfig } from '../types';

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
  };
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

  return hasOverride ? result : undefined;
}
