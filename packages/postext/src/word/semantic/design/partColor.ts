// A part's palette in the semantic document (#1444): `:::part
// palette="band=#hex"` recolours every palette-linked colour of the pages
// the part rules, as the engine does. A heading design's elements take the
// part's colours before they are written (their styles are keyed by
// colour, so each part gets its own), and a plain heading whose colour is
// an overridden palette entry's gets a variant of its Word style in the
// part's colour. Resolved heading colours keep no palette link, so they
// are matched by value, as the engine recolours its flow.

import type { ContentBlock } from '../../../parse/types.js';
import { applyPaletteOverrides } from '../../../design/layout.js';
import type { ColorValue, ResolvedDesignElement } from '../../../types.js';
import type { WriterContext } from '../context.js';
import { hex } from '../wml.js';
import { paleOnWhite } from './ink.js';
import { headingLevelOf, partPaletteAt } from './values.js';

/** `color` under the overrides of `palette`: by its palette link, or else
 *  by its value when exactly one overridden entry has that base value. */
export function partColor(ctx: WriterContext, color: ColorValue | undefined, palette: Readonly<Record<string, string>>): ColorValue | undefined {
  if (!color) return color;
  if (color.paletteId) {
    const own = palette[color.paletteId];
    return own ? { ...color, hex: own } : color;
  }
  const value = color.hex.toLowerCase();
  const entries = (ctx.resolved.colorPalette ?? []).filter((e) => e.value.hex.toLowerCase() === value);
  const own = entries.length === 1 ? palette[entries[0]!.id] : undefined;
  return own ? { ...color, hex: own } : color;
}

/** A design's elements in the colours of the part heading `b` stands in. */
export function inPartColors(ctx: WriterContext, b: ContentBlock, elements: ResolvedDesignElement[]): ResolvedDesignElement[] {
  const palette = partPaletteAt(ctx, b);
  if (!Object.keys(palette).length) return elements;
  return elements.map((el) => applyPaletteOverrides(el, palette));
}

/** The Word style of heading `b` in its part's colour: `style` itself
 *  when the part leaves the heading's colour as it is. */
export function partHeadingStyle(ctx: WriterContext, b: ContentBlock, style: string): string {
  const level = headingLevelOf(ctx.resolved, b);
  if (!level) return style;
  const color = partColor(ctx, level.color, partPaletteAt(ctx, b));
  const ink = hex(color);
  if (!ink || color === level.color || ink === hex(level.color) || paleOnWhite(ink)) return style;
  return ctx.styles.custom(`part:${style}:${ink}`, `${style} ${ink}`, () => ({ basedOn: style, rPr: { color: ink } }));
}
