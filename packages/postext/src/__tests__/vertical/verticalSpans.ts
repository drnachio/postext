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
      const m = /\d*\.?\d+px\s*\/\s*([^\s]+)/.exec(value);
      lh = m ? m[1]! : 'normal';
    }
  }
  return lh;
}

/** Every absolutely placed run (`top` + `right`) of `html`. */
export function verticalSpans(html: string): VerticalSpan[] {
  const out: VerticalSpan[] = [];
  for (const m of html.matchAll(/<span(?: aria-hidden="true")? style="(position:absolute;top:[^"]*right:[^"]*)">(.*?)<\/span>(?=<span|<\/span>|<\/div>|$)/g)) {
    const style = m[1]!;
    const top = parseFloat(/top:(-?[\d.]+)px/.exec(style)![1]!);
    const right = parseFloat(/right:(-?[\d.]+)(?:px)?/.exec(style)![1]!);
    const lh = effectiveLineHeight(style);
    const lineHeight = lh !== undefined && /px$/.test(lh) ? parseFloat(lh) : Number.NaN;
    const size = /(?:^|;)font:[^;]*?(\d*\.?\d+)px/.exec(style);
    out.push({
      top,
      axis: right + lineHeight / 2,
      lineHeight,
      ...(size ? { size: parseFloat(size[1]!) } : {}),
      text: m[2]!.replace(/<[^>]*>/g, ''),
    });
  }
  return out;
}
