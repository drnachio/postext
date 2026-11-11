// Named character styles (`:span[…]{style="id"}`, #1488) and the
// highlight styles they may name (`markStyles`) as Word run properties:
// the Word character style a run of the style becomes (`styles.ts`).
// Every value comes from a resolved style (colours checked as hex, lines
// and cases from their lists), and what reaches the XML goes through
// `hex`, `twips` and the fixed tables below.

import type { MarkLineStyle, ResolvedCharacterStyleConfig, ResolvedMarkStyleConfig } from '../../../types.js';
import { halfPoints, hex, px, twips, type RunProps, type Units } from '../wml.js';

/** Word's underline for each line of a highlight style. */
const UNDERLINES: ReadonlyMap<MarkLineStyle, string> = new Map<MarkLineStyle, string>([
  ['solid', 'single'],
  ['double', 'double'],
  ['dotted', 'dotted'],
  ['dashed', 'dash'],
  ['wavy', 'wave'],
]);

/** `RRGGBB` at `opacity` (0–100) over white paper: Word shades a run with
 *  no transparency. */
export function shadeOverPaper(fill: string, opacity: number): string {
  const a = Math.max(0, Math.min(100, opacity)) / 100;
  if (a >= 1) return fill;
  const channel = (i: number): string => Math.round(parseInt(fill.slice(i, i + 2), 16) * a + 255 * (1 - a)).toString(16).padStart(2, '0');
  return `${channel(0)}${channel(2)}${channel(4)}`.toUpperCase();
}

/** A highlight style as a run's shading, ink and line: the band as
 *  shading of its colour at its opacity (Word shades the whole height of
 *  the run, and has no rough edge), a line under the words as Word's
 *  nearest underline, a line through them as a strikethrough. */
export function markRunLook(ms: ResolvedMarkStyleConfig): Pick<RunProps, 'shd' | 'color' | 'u' | 'uColor' | 'strike'> {
  const fill = ms.backgroundEnabled === false ? undefined : hex(ms.background);
  const line = ms.line;
  return {
    ...(fill ? { shd: shadeOverPaper(fill, ms.opacity ?? 100) } : {}),
    ...(hex(ms.color) ? { color: hex(ms.color) } : {}),
    ...(line?.position === 'under' ? { u: UNDERLINES.get(line.style) ?? 'single', ...(hex(line.color) ? { uColor: hex(line.color) } : {}) } : {}),
    ...(line?.position === 'through' ? { strike: true } : {}),
  };
}

/** A character style's run properties: its face, size, weight, slant,
 *  colour, tracking and case, and the look of the highlight style it
 *  names (`mark`), if any, whose text colour wins over the style's. `font` gives the run properties of a family in
 *  a weight and slant. */
export function characterStyleRun(
  cs: ResolvedCharacterStyleConfig,
  mark: ResolvedMarkStyleConfig | undefined,
  u: Units,
  bodyPx: number,
  font: (family: string, weight: number, italic: boolean) => RunProps,
): RunProps {
  const size = cs.fontSize ? px(u, cs.fontSize, bodyPx) : bodyPx;
  const look = mark ? markRunLook(mark) : {};
  return {
    ...look,
    ...(cs.fontFamily ? font(cs.fontFamily, cs.fontWeight ?? 400, cs.italic) : {}),
    ...(cs.fontWeight !== undefined && !cs.fontFamily ? { b: cs.fontWeight >= 600 } : {}),
    i: cs.italic || undefined,
    caps: cs.textTransform === 'uppercase' || undefined,
    smallCaps: cs.smallCaps || undefined,
    // The highlight's text colour has the last word, as in the layout.
    color: look.color ?? hex(cs.color),
    spacing: cs.letterSpacing ? twips(u, cs.letterSpacing, size) : undefined,
    sz: cs.fontSize ? halfPoints(u, cs.fontSize, bodyPx) : undefined,
  };
}
