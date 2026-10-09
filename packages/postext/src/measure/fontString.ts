// What a canvas font shorthand asks for (#629): the family, weight and
// slant the engine measured a run with, read back from the strings
// `buildFontString` writes (`italic 700 12.5px "Optima 105"`).

/** A face as the engine asks for it: a family, a numeric weight and a
 *  slant (`oblique` reads as italic). */
export interface FontFaceRequest {
  family: string;
  weight: number;
  style: 'normal' | 'italic';
}

const SIZE_RE = /(?:^|\s)\d*\.?\d+px(?:\/\S+)?\s+(.+)$/;

/** The family of a CSS family list's first entry, unquoted. */
function firstFamily(list: string): string {
  let quote: string | undefined;
  for (let i = 0; i < list.length; i++) {
    const c = list[i]!;
    if (quote) {
      if (c === quote) quote = undefined;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === ',') {
      list = list.slice(0, i);
      break;
    }
  }
  const f = list.trim();
  return /^(["']).*\1$/.test(f) ? f.slice(1, -1).replace(/\\(["'])/g, '$1') : f;
}

/** The face a canvas font shorthand names (`'700 37.5px Open Sans'`,
 *  `'italic 400 13px "Source Serif 4"'`), or null when the string has no
 *  `px` size. A string with no weight is 400; `bold` is 700. */
export function parseFontString(font: string): FontFaceRequest | null {
  const m = SIZE_RE.exec(font.trim());
  if (!m) return null;
  const family = firstFamily(m[1]!);
  if (!family) return null;
  const prefix = font.slice(0, font.length - m[0].length).trim().split(/\s+/);
  let weight = 400;
  let style: 'normal' | 'italic' = 'normal';
  for (const token of prefix) {
    if (token === 'italic' || token === 'oblique') style = 'italic';
    else if (token === 'bold' || token === 'bolder') weight = 700;
    else if (token === 'lighter') weight = 300;
    else if (/^\d+(?:\.\d+)?$/.test(token)) weight = Number(token);
  }
  return { family, weight, style };
}

/** The family of a canvas font shorthand, or null. */
export function fontStringFamily(font: string): string | null {
  const m = SIZE_RE.exec(font.trim());
  return m ? firstFamily(m[1]!) || null : null;
}
