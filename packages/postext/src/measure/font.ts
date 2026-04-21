import { clearCache } from '@chenglou/pretext';
import type { HyphenationLocale } from '../types';
import { setHyphenationLocale } from '../hyphenate';
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
  parts.push(fontFamily);
  return parts.join(' ');
}

/**
 * Initializes the hyphenator for a given locale.
 * Must be called before measureBlock is used with hyphenation.
 */
export function initHyphenator(locale: HyphenationLocale): void {
  setHyphenationLocale(locale);
}

/**
 * Clear pretext's internal measurement caches.
 * Call this after fonts finish loading to ensure accurate measurements.
 */
export function clearMeasurementCache(): void {
  clearCache();
}

export function createMeasurementCache(): MeasurementCache {
  return { _blocks: new Map() };
}
