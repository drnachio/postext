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
  const size = sizeToken(fs);
  if (!size) return null;
  const prefix = fs.slice(0, size.start).trim();
  const sizePx = size.px;
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

const isDigit = (c: string | undefined): boolean => c !== undefined && c >= '0' && c <= '9';
const isSpace = (c: string | undefined): boolean => c !== undefined && /\s/.test(c);

/** The first `<n>px` (n a decimal number) followed by spaces and a family,
 *  as `^(.*?)(\d+(?:\.\d+)?)px\s+(.+)$` reads it, in one pass: a
 *  backtracking match of that pattern is quadratic on long digit runs
 *  (CodeQL js/polynomial-redos). */
function sizeToken(fs: string): { start: number; px: number } | null {
  // The pattern's `.` stops at a line break, so a string with one never matched.
  if (fs.includes('\n')) return null;
  for (let at = fs.indexOf('px'); at !== -1; at = fs.indexOf('px', at + 1)) {
    // Spaces after `px`, then at least one character.
    if (!isSpace(fs[at + 2]) || at + 3 >= fs.length) continue;
    // The number just before `px`: digits, optionally a point and digits.
    let start = at;
    while (isDigit(fs[start - 1])) start--;
    if (start === at) continue;
    if (fs[start - 1] === '.' && isDigit(fs[start - 2])) {
      start--;
      while (isDigit(fs[start - 1])) start--;
    }
    return { start, px: parseFloat(fs.slice(start, at)) };
  }
  return null;
}

export function fontKey(family: string, weight: number, style: 'normal' | 'italic'): string {
  return `${family}|${weight}|${style}`;
}
