import { clearCache } from '@chenglou/pretext';
import type { LocaleTag } from '../types';
import { setHyphenationLocale } from '../hyphenate';
import { clearTextWidthCache, evictTextWidths, measurementGeneration } from './canvas';
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

/** The families of a CSS font stack, split at the commas outside quotes,
 *  trimmed and unquoted, empty entries dropped — or `undefined` when the
 *  value has no comma outside quotes (it names one family). */
function stackFamilies(fontFamily: string): string[] | undefined {
  const out: string[] = [];
  let quote: string | undefined;
  let start = 0;
  let split = false;
  const push = (end: number) => {
    let f = fontFamily.slice(start, end).trim();
    if (f.length >= 2 && /^["']/.test(f) && f.endsWith(f[0]!)) f = f.slice(1, -1).trim();
    if (f.length > 0) out.push(f);
  };
  for (let i = 0; i < fontFamily.length; i++) {
    const c = fontFamily[i]!;
    if (quote) {
      if (c === quote) quote = undefined;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === ',') {
      push(i);
      start = i + 1;
      split = true;
    }
  }
  if (!split) return undefined;
  push(fontFamily.length);
  return out;
}

/** Whether a `fontFamily` value is a CSS font stack (`'EB Garamond',
 *  Georgia, serif`) rather than one family: it has a comma outside quotes. */
export function isFontStack(fontFamily: string): boolean {
  return fontFamily.includes(',') && (stackFamilies(fontFamily)?.length ?? 0) > 0;
}

/**
 * The one family a `fontFamily` value sets text in. A `fontFamily` names a
 * single family: canvas, HTML and PDF must measure and paint the same face,
 * and the PDF embeds a font per family, with no fallback chain. A CSS font
 * stack is therefore cut to its first family (`'EB Garamond', serif` →
 * `EB Garamond`) instead of being read as one family whose name has a
 * comma in it — which matched no face and measured with a fallback font.
 * Any other value comes back unchanged (a comma inside quotes is part of
 * the name).
 */
export function primaryFontFamily(fontFamily: string): string {
  if (!fontFamily.includes(',')) return fontFamily;
  return stackFamilies(fontFamily)?.[0] ?? fontFamily;
}

/**
 * A family name the CSS font shorthand would not take bare — a word that
 * starts with a digit ("Optima 105", "DIN Pro 120"), a character outside
 * letters, digits, spaces, hyphens and underscores — goes in double quotes;
 * canvas silently ignores the whole shorthand otherwise. Plain names stay
 * bare (the existing font-string cache keys), and a name already quoted is
 * left alone. A font stack sets in its first family (see
 * {@link primaryFontFamily}).
 */
export function quoteFamily(fontFamily: string): string {
  const f = primaryFontFamily(fontFamily).trim();
  if (/^["'].*["']$/.test(f)) return f;
  if (/(^|\s)\d/.test(f) || /[^\w\s-]/.test(f)) return `"${f.replace(/"/g, '\\"')}"`;
  return f;
}

/**
 * Initializes the hyphenator for a given locale (any BCP 47 tag; see
 * `matchHyphenationLocale`). Must be called before measureBlock is used with
 * hyphenation.
 */
export function initHyphenator(locale: LocaleTag): void {
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

/**
 * Drop what was measured in `families` (#629): the engine's widths of
 * those families and, at the next lookup, the blocks of every
 * `MeasurementCache` that set text in them. Pretext's own cache holds no
 * family index and is cleared whole. Called when faces of these families
 * arrive or leave; {@link clearMeasurementCache} drops every family.
 */
export function evictFontFamilies(families: Iterable<string>): void {
  clearCache();
  evictTextWidths(families);
}

export function createMeasurementCache(): MeasurementCache {
  return { _blocks: new Map(), _generation: measurementGeneration() };
}
