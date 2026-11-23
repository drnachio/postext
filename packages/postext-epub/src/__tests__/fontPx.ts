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
