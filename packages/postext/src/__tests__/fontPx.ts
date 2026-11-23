// The size a stub canvas reads out of its `font` (#1683).

const isDigit = (s: string, i: number): boolean => s.charCodeAt(i) >= 48 && s.charCodeAt(i) <= 57;

/** The first size a font shorthand names, as `/(\d*\.?\d+)px/.exec(font)`
 *  gives it (`'italic 700 10.5px Serif'` → `['10.5px', '10.5']`), or null
 *  when it names none. A scan back from each `px` over its digits: one
 *  pass, where the expression takes quadratic time on a long run of
 *  digits. */
export function fontPx(font: string): string[] | null {
  for (let px = font.indexOf('px'); px >= 0; px = font.indexOf('px', px + 2)) {
    let from = px;
    while (from > 0 && isDigit(font, from - 1)) from--;
    if (from === px) continue;
    if (from > 0 && font[from - 1] === '.') {
      from--;
      while (from > 0 && isDigit(font, from - 1)) from--;
    }
    return [font.slice(from, px + 2), font.slice(from, px)];
  }
  return null;
}

const isSpace = (ch: string): boolean => ch.trim() === '';

/** Whether `s` is digits only, or digits and dots with `dots`. */
function isNumber(s: string, dots: boolean): boolean {
  if (s === '') return false;
  for (let i = 0; i < s.length; i++) if (!isDigit(s, i) && !(dots && s[i] === '.')) return false;
  return true;
}

/** A font shorthand `[style] [weight] <size>px <family>` in its parts, as
 *  `/^(?:(italic|oblique)\s+)?(?:(\d{3}|bold|normal)\s+)?([\d.]+)px\s+(.+)$/`
 *  gives them for its trimmed text: `[whole, style, weight, size, family]`,
 *  or null when it is not one. Read word by word, where the expression
 *  takes quadratic time on a long run of spaces. */
export function fontParts(font: string): (string | undefined)[] | null {
  const s = font.trim();
  let at = 0;
  const word = (): string => {
    let end = at;
    while (end < s.length && !isSpace(s[end]!)) end++;
    return s.slice(at, end);
  };
  /** The word after `w` and its spaces. */
  const after = (w: string): string => {
    at += w.length;
    while (at < s.length && isSpace(s[at]!)) at++;
    return word();
  };
  let w = word();
  let style: string | undefined;
  let weight: string | undefined;
  if (w === 'italic' || w === 'oblique') {
    style = w;
    w = after(w);
  }
  if (w === 'bold' || w === 'normal' || (w.length === 3 && isNumber(w, false))) {
    weight = w;
    w = after(w);
  }
  const size = w.endsWith('px') ? w.slice(0, -2) : '';
  if (!isNumber(size, true)) return null;
  after(w);
  const family = s.slice(at);
  // `.` stops at a line terminator.
  if (family === '' || [...family].some((ch) => ch === '\n' || ch === '\r' || ch === ' ' || ch === ' ')) return null;
  return [s, style, weight, size, family];
}
