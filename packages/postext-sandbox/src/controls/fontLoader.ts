import type { PostextConfig } from 'postext';
import { resolveBodyTextConfig, resolveHeadingsConfig } from 'postext';

const loadedFonts = new Set<string>();

export function loadFont(font: string): void {
  if (loadedFonts.has(font)) return;
  loadedFonts.add(font);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}&display=swap`;
  document.head.appendChild(link);
}

export function getConfigFontFamilies(config: PostextConfig): string[] {
  const body = resolveBodyTextConfig(config.bodyText);
  const headings = resolveHeadingsConfig(config.headings);
  const families = new Set<string>();
  families.add(body.fontFamily);
  families.add(headings.fontFamily);
  for (const level of headings.levels) families.add(level.fontFamily);
  return Array.from(families);
}

export function preloadConfigFonts(config: PostextConfig): void {
  for (const family of getConfigFontFamilies(config)) loadFont(family);
}
