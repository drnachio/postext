import type { PostextConfig } from 'postext';
import { resolveBodyTextConfig, resolveHeadingsConfig, resolveUnorderedListsConfig } from 'postext';

const loadedFonts = new Set<string>();

/**
 * Load a font family with all four typographic variants (regular, bold,
 * italic, bold italic). The canvas renderer relies on real bold/italic
 * glyphs — without these, the browser falls back to faux-bold/italic, which
 * produces inconsistent metrics across re-measurements and leads to bolds
 * visually disappearing after a layout rebuild.
 */
export function loadFont(font: string): void {
  if (loadedFonts.has(font)) return;
  loadedFonts.add(font);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:ital,wght@0,400;0,700;1,400;1,700&display=swap`;
  document.head.appendChild(link);
}

export function getConfigFontFamilies(config: PostextConfig): string[] {
  const body = resolveBodyTextConfig(config.bodyText);
  const headings = resolveHeadingsConfig(config.headings);
  const lists = resolveUnorderedListsConfig(config.unorderedLists, body);
  const families = new Set<string>();
  families.add(body.fontFamily);
  families.add(headings.fontFamily);
  for (const level of headings.levels) families.add(level.fontFamily);
  families.add(lists.fontFamily);
  for (const level of lists.levels) families.add(level.fontFamily);
  return Array.from(families);
}

export function preloadConfigFonts(config: PostextConfig): void {
  for (const family of getConfigFontFamilies(config)) loadFont(family);
}
