import { clearCache } from '@chenglou/pretext';
import type { HyphenationLocale } from '../types';
import { setHyphenationLocale } from '../hyphenate';
import { clearTextWidthCache } from './canvas';
import type { MeasurementCache } from './types';

/**
 * Build a CSS font shorthand string for canvas / pretext.
 * Example: "75px EB Garamond"
 */
export function buildFontString(
  fontFamily: string,
  fontSizePx: number,
  weight: string = 'normal',
  style: string = 'normal',
): string {
  const parts: string[] = [];
  if (style !== 'normal') parts.push(style);
  if (weight !== 'normal') parts.push(weight);
  parts.push(`${fontSizePx}px`);
  parts.push(quoteFamily(fontFamily));
  return parts.join(' ');
}

/**
 * A family name the CSS font shorthand would not take bare — a word that
 * starts with a digit ("Optima 105", "DIN Pro 120"), a character outside
 * letters, digits, spaces, hyphens and underscores — goes in double quotes;
 * canvas silently ignores the whole shorthand otherwise. Plain names stay
 * bare (the existing font-string cache keys), and a name already quoted is
 * left alone.
 */
export function quoteFamily(fontFamily: string): string {
  const f = fontFamily.trim();
  if (/^["'].*["']$/.test(f)) return f;
  if (/(^|\s)\d/.test(f) || /[^\w\s-]/.test(f)) return `"${f.replace(/"/g, '\\"')}"`;
  return f;
}

/**
 * Initializes the hyphenator for a given locale.
 * Must be called before measureBlock is used with hyphenation.
 */
export function initHyphenator(locale: HyphenationLocale): void {
  setHyphenationLocale(locale);
}

/**
 * Clear pretext's internal measurement caches and the engine's own
 * text-width cache. Call this after fonts finish loading (or are removed)
 * to ensure accurate measurements.
 */
export function clearMeasurementCache(): void {
  clearCache();
  clearTextWidthCache();
}

export function createMeasurementCache(): MeasurementCache {
  return { _blocks: new Map() };
}
