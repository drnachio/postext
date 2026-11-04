// Pins for configurations stored under rules 22 and later: the line breaker
// of the HTML viewer.
import type { PostextConfig, HtmlViewerConfig } from '../../types.js';
import { isRecord } from './contentChecks.js';

/**
 * A configuration written for postext 1.67 or earlier, pinned to the line
 * breaker its screen edition used (#1400): `htmlViewer.optimalLineBreaking:
 * false`, the HTML viewer setting its lines one by one, each filled before
 * the next, whatever `bodyText.optimalLineBreaking` said, where today it
 * breaks them with Knuth–Plass as the canvas and the PDF do. Every such
 * configuration gets it: the viewer sets every paragraph, and the canvas
 * and the PDF are not touched. A configuration that names the setting
 * already is returned as it is (the same object).
 */
export function pinLegacyHtmlViewerBreaking<T extends Partial<PostextConfig>>(config: T): T {
  const viewer: HtmlViewerConfig = isRecord(config.htmlViewer) ? config.htmlViewer : {};
  if (viewer.optimalLineBreaking !== undefined) return config;
  return { ...config, htmlViewer: { ...viewer, optimalLineBreaking: false } };
}
