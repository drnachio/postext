import { pxOf, textOfHtml } from '../htmlText.js';

/**
 * The runs of a vertical line's upright box in the HTML, with the line
 * height the browser uses for each: declarations of one `style` apply in
 * order, and a `font` shorthand resets `line-height` to `normal` unless it
 * carries one (`16px/2 Serif`). A run's em boxes are centred across the
 * column at `right + lineHeight / 2` from the box's flow top, so a run whose
 * line height is `normal` has no axis (NaN).
 */
export interface VerticalSpan {
  /** Along the line, px. */
  top: number;
  /** The run's axis from the box's flow top (the physical right edge), px. */
  axis: number;
  /** The line height in effect, px (NaN when `normal`). */
  lineHeight: number;
  /** The font size its own `font` sets, px (undefined: inherited). */
  size?: number;
  /** Its text, tags stripped. */
  text: string;
}

/** The line height a `style` attribute leaves in effect. */
export function effectiveLineHeight(style: string): string | undefined {
  let lh: string | undefined;
  for (const decl of style.split(';')) {
    const at = decl.indexOf(':');
    if (at < 0) continue;
    const prop = decl.slice(0, at).trim();
    const value = decl.slice(at + 1).trim();
    if (prop === 'line-height') lh = value;
    else if (prop === 'font') {
      lh = fontLineHeight(value) ?? 'normal';
    }
  }
  return lh;
}

const space = (c: string | undefined): boolean => c !== undefined && /\s/.test(c);
const digit = (c: string | undefined): boolean => c !== undefined && c >= '0' && c <= '9';

/** The line height a `font` shorthand carries after its size
 *  (`16px / 2 Serif` → `2`): what `\d*\.?\d+px\s*\/\s*(\S+)` captures. */
function fontLineHeight(font: string): string | undefined {
  for (let at = font.indexOf('px'); at >= 0; at = font.indexOf('px', at + 2)) {
    if (!digit(font[at - 1])) continue;
    let i = at + 2;
    while (space(font[i])) i++;
    if (font[i] !== '/') continue;
    i++;
    while (space(font[i])) i++;
    let end = i;
    while (end < font.length && !space(font[end])) end++;
    if (end > i) return font.slice(i, end);
  }
  return undefined;
}

/** The size the first `font` declaration of a style that sets one in px
 *  gives: what `(?:^|;)font:[^;]*?(\d*\.?\d+)px` captures. */
function fontSize(style: string): string | undefined {
  for (const decl of style.split(';')) {
    if (!decl.startsWith('font:')) continue;
    const size = pxOf(decl.slice('font:'.length));
    if (size !== undefined) return size;
  }
  return undefined;
}

/** Every absolutely placed run (`top` + `right`) of `html` (a ruby base
 *  and its reading's runs too, inside their `<ruby>` and `<rt>`). */
export function verticalSpans(html: string): VerticalSpan[] {
  const out: VerticalSpan[] = [];
  for (const m of html.matchAll(/<span(?: aria-hidden="true")? style="(position:absolute;top:[^"]*right:[^"]*)">(.*?)<\/span>(?=<span|<\/span>|<\/div>|<\/?ruby\b|<\/?rt\b|$)/g)) {
    const style = m[1]!;
    const top = parseFloat(/top:(-?[\d.]+)px/.exec(style)![1]!);
    const right = parseFloat(/right:(-?[\d.]+)(?:px)?/.exec(style)![1]!);
    const lh = effectiveLineHeight(style);
    const lineHeight = lh !== undefined && /px$/.test(lh) ? parseFloat(lh) : Number.NaN;
    const size = fontSize(style);
    out.push({
      top,
      axis: right + lineHeight / 2,
      lineHeight,
      ...(size ? { size: parseFloat(size) } : {}),
      text: textOfHtml(m[2]!),
    });
  }
  return out;
}
