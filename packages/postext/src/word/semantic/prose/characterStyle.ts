// The run properties of a character style (`[…]|id|`) in the semantic
// .docx: the Word character style it becomes (`styles.ts`).

import type { ResolvedCharacterStyleConfig } from '../../../types.js';
import { halfPoints, hex, px, twips, type RunProps, type Units } from '../wml.js';

/** Word's nearest underline to each line of a character style. */
const LINES: Record<string, string> = { solid: 'single', double: 'double', dotted: 'dotted', dashed: 'dash', wavy: 'wave' };

/** Its face, colour and tracking; an underline as Word's nearest line;
 *  a strike-through; the highlighter band as a shading of its colour
 *  over white at its opacity (Word shades the whole run's height).
 *  `font` gives the run properties of a family in a weight and slant. */
export function characterStyleRun(
  cs: ResolvedCharacterStyleConfig,
  u: Units,
  bodyPx: number,
  font: (family: string, weight: number, italic: boolean) => RunProps,
): RunProps {
  const size = cs.fontSize ? px(u, cs.fontSize, bodyPx) : bodyPx;
  let shd: string | undefined;
  if (cs.highlight.enabled) {
    const fill = hex(cs.highlight.color) ?? 'FFE14D';
    const a = Math.max(0, Math.min(100, cs.highlight.opacity)) / 100;
    shd = [0, 2, 4].map((i) => Math.round(parseInt(fill.slice(i, i + 2), 16) * a + 255 * (1 - a)).toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  return {
    ...(cs.fontFamily ? font(cs.fontFamily, cs.fontWeight ?? 400, cs.italic) : {}),
    ...(cs.fontWeight !== undefined && !cs.fontFamily ? { b: cs.fontWeight >= 600 } : {}),
    i: cs.italic || undefined,
    caps: cs.textTransform === 'uppercase' || undefined,
    smallCaps: cs.smallCaps || undefined,
    strike: cs.strike.enabled || undefined,
    color: hex(cs.color),
    spacing: cs.letterSpacing ? twips(u, cs.letterSpacing, size) : undefined,
    sz: cs.fontSize ? halfPoints(u, cs.fontSize, bodyPx) : undefined,
    u: cs.underline.enabled ? (cs.underline.skipSpaces ? 'words' : LINES[cs.underline.style] ?? 'single') : undefined,
    uColor: cs.underline.enabled ? hex(cs.underline.color) : undefined,
    shd,
  };
}
