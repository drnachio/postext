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
  // A list (`Minion Pro, "STIX Two Math"`, `symbolFont`):
  // the face is the first family's, the others draw what it lacks.
  const [family = '', ...fallbacks] = familyList(m[3] ?? '');
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

/** The families of a CSS family list, split at the commas outside quotes,
 *  trimmed and unquoted. */
function familyList(list: string): string[] {
  const out: string[] = [];
  let quote: string | undefined;
  let from = 0;
  const push = (end: number): void => {
    let f = list.slice(from, end).trim();
    if (f.length >= 2 && /^["']/.test(f) && f.endsWith(f[0]!)) f = f.slice(1, -1).replace(/\\(["'\\])/g, '$1');
    else f = f.replace(/^['"]|['"]$/g, '');
    if (f) out.push(f);
  };
  for (let i = 0; i < list.length; i++) {
    const c = list[i]!;
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = undefined;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === ',') {
      push(i);
      from = i + 1;
    }
  }
  push(list.length);
  return out;
}

export function fontKey(family: string, weight: number, style: 'normal' | 'italic'): string {
  return `${family}|${weight}|${style}`;
}
