/**
 * A varnish puts no colour on a screen page (#1563): in the HTML (and the
 * EPUB built from it) every paint in a varnish's hex becomes `transparent`.
 *
 * The page markup writes its colours in many places (inline styles, SVG
 * `fill` and `stroke`, a page's `<style>`), so the rule runs over the markup
 * of each page once it is written, the way `featureFontCss` does: only
 * inside tags and `<style>` sheets, never in the text a reader sees, where
 * `#fefefe` may be a word of the book.
 */

const isHexDigit = (c: string | undefined): boolean => !!c && /[0-9a-f]/i.test(c);

/** `#rrggbb` or `#rrggbbaa` at `i` of `text` (lower case, the six digits),
 *  with its length, when one stands there whole. */
function hexAt(text: string, i: number): { hex: string; length: number } | undefined {
  let n = 0;
  while (n < 9 && isHexDigit(text[i + 1 + n])) n++;
  if (n !== 6 && n !== 8) return undefined;
  return { hex: `#${text.slice(i + 1, i + 7).toLowerCase()}`, length: n + 1 };
}

/** Rewrite the varnish hexes of `part` (markup inside a tag or a sheet). */
function clearIn(part: string, hexes: ReadonlySet<string>): string {
  let out = '';
  let from = 0;
  for (let i = part.indexOf('#'); i >= 0; i = part.indexOf('#', i + 1)) {
    const h = hexAt(part, i);
    if (!h || !hexes.has(h.hex)) continue;
    out += `${part.slice(from, i)}transparent`;
    from = i + h.length;
    i = from - 1;
  }
  return from === 0 ? part : out + part.slice(from);
}

/**
 * `html` with every paint in one of `hexes` (`#rrggbb`, lower case) made
 * transparent: attribute values and `<style>` sheets only. Returns `html`
 * itself when there is nothing to clear.
 */
export function clearVarnishPaints(html: string, hexes: ReadonlySet<string>): string {
  if (hexes.size === 0 || !html.includes('#')) return html;
  let out = '';
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt < 0) {
      out += html.slice(i);
      break;
    }
    out += html.slice(i, lt);
    const gt = html.indexOf('>', lt);
    const end = gt < 0 ? html.length : gt + 1;
    const tag = html.slice(lt, end);
    out += clearIn(tag, hexes);
    i = end;
    // A style sheet's declarations are paints too.
    if (/^<style[\s>]/i.test(tag)) {
      const close = html.toLowerCase().indexOf('</style', i);
      const sheetEnd = close < 0 ? html.length : close;
      out += clearIn(html.slice(i, sheetEnd), hexes);
      i = sheetEnd;
    }
  }
  return out;
}
