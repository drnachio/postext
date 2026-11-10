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

/**
 * The ink of `color` under the palette of the part being written
 * (`ctx.chapter.palette`), when the part changes it (#1458): a
 * cross-reference, a link or a caption label in the part's colour, as the
 * engine prints them. Undefined where the style's own colour serves.
 */
export function partInk(ctx: WriterContext, color: ColorValue | undefined): string | undefined {
  const palette = ctx.chapter.palette;
  if (!color || !palette || ctx.plain || !Object.keys(palette).length) return undefined;
  const own = hex(partColor(ctx, color, palette));
  return own && own !== hex(color) && !paleOnWhite(own) ? own : undefined;
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

/** Base palette entries, by id and value. */
type Entries = readonly { id: string; value: { hex: string } }[];

/** `value` with every colour in it (an object with a `hex`, however deep)
 *  taking the overrides of `palette`: by its palette link, or else by its
 *  value when exactly one entry of `entries` (the book's base palette) has
 *  that value, as resolved styles keep no link and the engine recolours
 *  them by value. `value` itself when nothing changes. */
export function recolored<T>(value: T, palette: Readonly<Record<string, string>>, entries: Entries = []): T {
  if (Array.isArray(value)) {
    const next = value.map((v: unknown) => recolored(v, palette, entries));
    return next.some((v, i) => v !== value[i]) ? (next as T) : value;
  }
  if (!value || typeof value !== 'object') return value;
  const rec = value as Record<string, unknown>;
  if (typeof rec.hex === 'string') {
    const hex = rec.hex.toLowerCase();
    let id = typeof rec.paletteId === 'string' ? rec.paletteId : undefined;
    if (!id) {
      const same = entries.filter((e) => e.value.hex.toLowerCase() === hex);
      id = same.length === 1 ? same[0]!.id : undefined;
    }
    const own = id ? palette[id] : undefined;
    return own && own.toLowerCase() !== hex ? ({ ...rec, hex: own } as T) : value;
  }
  let changed = false;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rec)) {
    const n = recolored(v, palette, entries);
    if (n !== v) changed = true;
    out[k] = n;
  }
  return changed ? (out as T) : value;
}

/**
 * A box or exercise style in the colours of the part fence `b` stands in
 * (#1444): the part's palette replaces the palette-linked colours of its
 * fill, rules, label tab, title and badges, as the engine draws them. The
 * copy gets an id and a name of its own (styles are made per id, and
 * LibreOffice merges styles that share a name), so each part has its own
 * variant of the style, as headings do.
 */
export function inPartStyle<T extends { id: string; name: string }>(ctx: WriterContext, b: ContentBlock, style: T): T;
export function inPartStyle<T extends { id: string; name: string }>(ctx: WriterContext, b: ContentBlock, style: T | undefined): T | undefined;
export function inPartStyle<T extends { id: string; name: string }>(ctx: WriterContext, b: ContentBlock, style: T | undefined): T | undefined {
  if (!style) return style;
  const palette = partPaletteAt(ctx, b);
  if (!Object.keys(palette).length) return style;
  const out = recolored(style, palette, ctx.resolved.colorPalette ?? []);
  if (out === style) return style;
  const tag = Object.values(palette)
    .map((v) => v.replace(/^#/, '').toLowerCase())
    .join('-');
  return { ...out, id: `${style.id}-${tag}`, name: `${style.name || style.id} ${tag}` };
}
