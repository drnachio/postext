// Reading colours through the palette: a palette-linked colour takes its
// entry's value, at its tint over the page (#1471: split out of shared.ts).
import type { ColorValue, ColorPaletteEntry } from '../types.js';
import { isTinted, tintedEntryValue, tintPaperOf } from './paletteTint.js';

/** The page a tint (`ColorValue.tint`) mixes over: its screen colour and,
 *  authored in CMYK, its inks. */
export type TintPaper = ReturnType<typeof tintPaperOf>;

/** The page tints mix over while a whole configuration is read through its
 *  palette (`applyPaletteToConfig`, `applyPaletteToResolvedConfig`): set
 *  for the length of that synchronous call, so the many colours it reads
 *  need not each be handed the page. */
let pageUnderTints: TintPaper | undefined;

export function withPaper<T>(paper: TintPaper, run: () => T): T {
  const before = pageUnderTints;
  pageUnderTints = paper;
  try {
    return run();
  } finally {
    pageUnderTints = before;
  }
}

/** The value a palette-linked colour takes from its entry: the entry's, or,
 *  tinted (`link.tint`), the entry at that strength over the page, in the
 *  entry's own model (`tintedEntryValue`). */
function linkedValue(entry: ColorValue, link: ColorValue, paper: TintPaper | undefined = pageUnderTints): ColorValue {
  if (!isTinted(link)) return { hex: entry.hex, model: entry.model };
  return tintedEntryValue(entry, link.tint!, paper?.paper, paper?.paperCmyk);
}


/** `value` read through `palette`: a linked colour takes its entry's value
 *  (at its tint over `paper`, the page, when tinted) and keeps the link. */
export function resolveColorValue(
  value: ColorValue | undefined,
  palette: ColorPaletteEntry[] | undefined,
  fallback: ColorValue,
  paper?: TintPaper,
): ColorValue {
  if (!value) return fallback;
  if (value.paletteId) {
    const entry = palette?.find((e) => e.id === value.paletteId);
    if (entry) return { ...linkedValue(entry.value, value, paper ?? pageUnderTints), paletteId: value.paletteId, ...(isTinted(value) ? { tint: value.tint } : {}) };
    return { hex: value.hex, model: value.model };
  }
  return value;
}

/** `value` read through `palette`, dropping the link (see
 *  {@link resolveColorValue}). */
export function resolveColor(value: ColorValue | undefined, palette: ColorPaletteEntry[] | undefined, paper?: TintPaper): ColorValue | undefined {
  if (!value || !value.paletteId) return value;
  const entry = palette?.find((e) => e.id === value.paletteId);
  if (!entry) return { hex: value.hex, model: value.model };
  return linkedValue(entry.value, value, paper ?? pageUnderTints);
}

export function resolveRequired(value: ColorValue, palette: ColorPaletteEntry[] | undefined): ColorValue {
  if (!value.paletteId) return value;
  const entry = palette?.find((e) => e.id === value.paletteId);
  if (!entry) return { hex: value.hex, model: value.model };
  return linkedValue(entry.value, value);
}

/** Keys whose subtree the palette pass leaves alone: the palette itself, and
 *  the HTML viewer's overrides — a partial config that is merged (and then
 *  resolved against its own palette) only when the HTML viewer applies it. */
const PALETTE_WALK_SKIP = new Set(['colorPalette', 'htmlViewer']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * `node` with every palette-linked colour in it — any `ColorValue` whose
 * `paletteId` names an entry of the palette (`byId`) — taking that entry's
 * value, wherever it sits: design slots (running heads, heading and part
 * openers, heading styles, contents rows), callout labels, reference
 * colours… The link is kept, so a part's or a styled section's palette
 * overrides still find the colour. A link to an entry that does not exist
 * keeps its stored value. Subtrees with nothing to change are returned as
 * they are (the same objects), so identity-keyed caches downstream hold.
 */
export function relinkPaletteColors<T>(node: T, byId: ReadonlyMap<string, ColorValue>, ancestors = new Set<object>()): T {
  if (Array.isArray(node)) {
    if (ancestors.has(node)) return node;
    ancestors.add(node);
    let out: unknown[] | undefined;
    node.forEach((item, i) => {
      const next = relinkPaletteColors(item, byId, ancestors);
      if (next !== item) {
        out ??= node.slice();
        out[i] = next;
      }
    });
    ancestors.delete(node);
    return (out ?? node) as T;
  }
  if (!isPlainObject(node) || ancestors.has(node)) return node;
  if (typeof node.hex === 'string' && typeof node.paletteId === 'string') {
    const entry = byId.get(node.paletteId);
    if (!entry) return node;
    const link = node as unknown as ColorValue;
    const value = linkedValue(entry, link);
    if (!isTinted(link)) {
      if (value.hex === node.hex && value.model === node.model) return node;
      return { ...node, ...value } as T;
    }
    // A tint carries the entry's print values at its strength.
    const same = value.hex === node.hex && value.model === node.model && JSON.stringify(value.cmyk) === JSON.stringify(link.cmyk)
      && JSON.stringify(value.spot) === JSON.stringify(link.spot) && (value.overprint === true) === (link.overprint === true);
    if (same) return node;
    const { cmyk: _c, spot: _s, overprint: _o, ...rest } = node as Record<string, unknown>;
    void _c; void _s; void _o;
    return { ...rest, ...value } as T;
  }
  ancestors.add(node);
  let out: Record<string, unknown> | undefined;
  for (const [key, value] of Object.entries(node)) {
    if (PALETTE_WALK_SKIP.has(key) || value === null || typeof value !== 'object') continue;
    const next = relinkPaletteColors(value, byId, ancestors);
    if (next !== value) {
      out ??= { ...node };
      out[key] = next;
    }
  }
  ancestors.delete(node);
  return (out ?? node) as T;
}

export function paletteById(palette: ColorPaletteEntry[]): Map<string, ColorValue> {
  return new Map(palette.map((e) => [e.id, e.value]));
}
