// Chips Word can show as a character rather than a bordered run (#1444).
// Word has no rounded or circled run: a run's border is a rectangle. A
// round chip holding one letter or number (an answer bubble) is the
// circled character instead, Ⓐ, or a filled number its negative form ❶;
// a chip with no words (an end mark) is a black square in the
// chip's fill. Either is set in the chip's ink, with no border or shading,
// so all three renderers show it the same way.

import type { InlineSpan } from '../../../parse/types.js';
import type { ResolvedChipStyleConfig } from '../../../types.js';
import { chipText } from '../atoms.js';
import type { WriterContext } from '../context.js';
import { halfPoints, hex, px, type RunProps } from '../wml.js';

/** The circled form of one letter or number (1–20), plain or negative;
 *  undefined when Unicode has none. */
export function circled(ch: string, negative: boolean): string | undefined {
  const at = (base: number, k: number): string => String.fromCodePoint(base + k);
  // The negative letters (U+1F150) are missing from most text faces, so a
  // filled letter chip stays a shaded run.
  if (negative && /^[A-Za-z]$/.test(ch)) return undefined;
  if (/^[A-Z]$/.test(ch)) return at(0x24b6, ch.charCodeAt(0) - 65);
  if (/^[a-z]$/.test(ch)) return at(0x24d0, ch.charCodeAt(0) - 97);
  const n = /^\d{1,2}$/.test(ch) ? Number(ch) : NaN;
  if (n === 0) return negative ? '⓿' : '⓪';
  if (n >= 1 && n <= 10) return at(negative ? 0x2776 : 0x2460, n - 1);
  if (n >= 11 && n <= 20) return at(negative ? 0x24eb : 0x2460, negative ? n - 11 : n - 1);
  return undefined;
}

/** A chip as a glyph: its text and run properties, or undefined when the
 *  chip stays a bordered or shaded run. */
export function chipGlyph(ctx: WriterContext, chip: NonNullable<InlineSpan['chip']>): { text: string; props: RunProps } | undefined {
  const styles = ctx.resolved.chipStyles ?? [];
  const cs: ResolvedChipStyleConfig | undefined = (chip.style ? styles.find((s) => s.id === chip.style) : undefined) ?? styles[0];
  if (!cs) return undefined;
  const u = ctx.units;
  const words = chipText(chip).trim();
  const fill = cs.backgroundEnabled ? hex(cs.background) : undefined;
  const filled = !!fill && fill !== 'FFFFFF';
  if (!words) {
    // An end mark: the square the engine draws, in its fill.
    if (!filled) return undefined;
    return { text: '■', props: { color: fill, sz: cs.fontSize ? halfPoints(u, cs.fontSize, ctx.styles.bodyPx) : undefined } };
  }
  const sizePx = px(u, cs.fontSize, ctx.styles.bodyPx) || ctx.styles.bodyPx;
  // Round: corners at least nearly half the chip's height.
  if (px(u, cs.borderRadius, sizePx) < 0.45 * sizePx) return undefined;
  const glyph = circled(words, filled);
  if (!glyph) return undefined;
  const face = cs.fontFamily ? ctx.styles.font(cs.fontFamily, cs.bold ? 700 : 400, cs.italic) : {};
  // A plain bubble's ring is its outline's colour; a filled one's disc
  // its fill.
  return { text: glyph, props: { ...face, b: cs.bold || undefined, color: filled ? fill : (hex(cs.borderColor) ?? hex(cs.color)) } };
}
