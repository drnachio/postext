import { fontStringFamilies } from 'postext';

export interface ParsedFontString {
  family: string;
  /** The families listed after it (`symbolFont`), unquoted;
   *  absent when the string names one family. */
  fallbacks?: string[];
  weight: number;
  style: 'normal' | 'italic';
  sizePx: number;
}

/**
 * Parse a CSS-canvas font shorthand of the form produced by `buildFontString()`
 * in the `postext` package (e.g. `italic 700 16px "EB Garamond"`). The regex
 * mirrors `html-backend.ts` so exactly the same shapes are accepted.
 */
export function parseFontString(fs: string): ParsedFontString | null {
  const cached = parsedFontStrings.get(fs);
  if (cached !== undefined) return cached;
  const parsed = parseFontStringUncached(fs);
  parsedFontStrings.set(fs, parsed);
  return parsed;
}

// Memoized: parsing runs per rendered text segment but a document only uses
// a handful of distinct font strings. Results are treated as read-only.
const parsedFontStrings = new Map<string, ParsedFontString | null>();

function parseFontStringUncached(fs: string): ParsedFontString | null {
  const m = fs.match(/^(.*?)(\d+(?:\.\d+)?)px\s+(.+)$/);
  if (!m) return null;
  const prefix = (m[1] ?? '').trim();
  const sizePx = parseFloat(m[2]!);
  // A list (`Minion Pro, "STIX Two Math"`, `symbolFont`): the face is the
  // first family's, the others draw what it lacks. Read by the engine's
  // own parser of the strings it writes (#1460).
  const [family = '', ...fallbacks] = fontStringFamilies(fs);
  let style: 'normal' | 'italic' = 'normal';
  let weight = 400;
  for (const token of prefix.split(/\s+/).filter(Boolean)) {
    if (token === 'italic' || token === 'oblique') style = 'italic';
    else if (token === 'bold') weight = 700;
    else if (token === 'normal') continue;
    else if (/^\d+$/.test(token)) weight = parseInt(token, 10);
  }
  if (!Number.isFinite(sizePx) || !family) return null;
  return { family, weight, style, sizePx, ...(fallbacks.length > 0 ? { fallbacks } : {}) };
}

export function fontKey(family: string, weight: number, style: 'normal' | 'italic'): string {
  return `${family}|${weight}|${style}`;
}
