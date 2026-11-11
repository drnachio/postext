// A part's `palette` recolours the flow as well as its designs. The VDT
// keeps resolved hex values, not palette links, so the flow is recoloured by
// value: on the pages a part (or a styled section) rules, every colour of the
// text flow equal to the base value of a palette entry the part overrides
// takes the part's value — headings, bold and italic runs, references,
// bullets and numbers, captions and caption bars, table text, rules and
// fills, callout boxes (title, background, stripe), inline chips (fill,
// outline, text). Explicit colours that merely coincide with an entry (an
// inline swatch) keep theirs.
//
// Two entries can share a base value and still take different values on a
// page (one overridden and not the other, or both to different colours).
// The value alone then cannot say which one a flow colour came from. Each
// colour of the VDT is therefore matched with the settings it can come
// from (its kind: a block's text, bold, italic, reference, marker or
// separator colour; a heading level or heading style; one part of one
// callout style's frame; one colour of a table, chip or caption style) and
// takes the value those settings resolve to under the page's palette
// (`flowColorValues`). A cell's own fill follows its own link.

import type { ColorPaletteEntry, ColorValue } from '../../types.js';
import type { VDTDocument } from '../../vdt.js';
import { type FlowColorValues, withHash, type Remap } from './partPalette/colorKinds.js';
import { type PageRemaps, recolorBlock, type KindGroups } from './partPalette/recolor.js';
import { isTinted, paletteTintHex } from '../../defaults/shared.js';

export type { TextColorRole, TocColorRole, FrameColorRole, FlowColorKind, FlowColorValues } from './partPalette/colorKinds.js';
export { flowColorValues, forgetFlowColorValues } from './partPalette/flowColors.js';

/** Recolour each page's flow (columns and floats) with the palette overrides
 *  in force on it (`palettes[pageIndex]`: palette id → hex). `valuesFor`
 *  gives, for an override map, what each kind of flow colour takes where
 *  two entries share a base value (see {@link flowColorValues}); without it
 *  such a value takes the last override that changes it. */
export function applyPartPalettesToFlow(
  doc: VDTDocument,
  palettes: readonly Record<string, string>[],
  basePalette: readonly ColorPaletteEntry[] | undefined,
  valuesFor?: (overrides: Readonly<Record<string, string>>) => FlowColorValues,
  tints: readonly number[] = [],
  pageColor?: ColorValue,
): void {
  if (!basePalette || basePalette.length === 0) return;
  const baseHex = new Map(basePalette.map((e) => [e.id, e.value.hex.toLowerCase()]));
  const basePaper = paperHex(pageColor?.hex);
  const cache = new Map<Record<string, string>, PageRemaps | null>();
  const remapsOf = (overrides: Record<string, string>): PageRemaps | null => {
    const hit = cache.get(overrides);
    if (hit !== undefined) return hit;
    const map = new Map<string, string>();
    // The page under the tints: a page whose palette changes the entry
    // the page colour links to has that colour under them.
    const paper = paperUnder(pageColor, overrides) ?? basePaper;
    for (const [id, hex] of Object.entries(overrides)) {
      const base = baseHex.get(id);
      const next = withHash(hex);
      if (base && base !== next.toLowerCase()) {
        map.set(base, next);
        // A colour linked at a tint (`ColorValue.tint`) painted the entry at
        // that strength over the page: it takes the override at the same
        // strength.
        for (const t of tints) map.set(paletteTintHex(base, t, basePaper).toLowerCase(), paletteTintHex(next, t, paper));
      }
    }
    const remaps = map.size === 0 ? null : pageRemaps(map, overrides, basePalette, valuesFor, paper);
    cache.set(overrides, remaps);
    return remaps;
  };
  for (const page of doc.pages) {
    const overrides = palettes[page.index];
    if (!overrides || Object.keys(overrides).length === 0) continue;
    const r = remapsOf(overrides);
    if (!r) continue;
    for (const col of page.columns) for (const block of col.blocks) recolorBlock(block, r);
    for (const block of page.floats ?? []) recolorBlock(block, r);
  }
}

function pageRemaps(
  map: ReadonlyMap<string, string>,
  overrides: Readonly<Record<string, string>>,
  basePalette: readonly ColorPaletteEntry[],
  valuesFor: ((overrides: Readonly<Record<string, string>>) => FlowColorValues) | undefined,
  paper: string,
): PageRemaps {
  const byValue: Remap = (hex) => (hex ? map.get(hex.toLowerCase()) ?? hex : hex);
  // Base values two entries share and the page gives two values.
  const results = new Map<string, Set<string>>();
  for (const e of basePalette) {
    const base = e.value.hex.toLowerCase();
    const o = overrides[e.id];
    let set = results.get(base);
    if (!set) results.set(base, (set = new Set()));
    set.add(o ? withHash(o).toLowerCase() : base);
  }
  const ambiguous = new Set([...results].filter(([, s]) => s.size > 1).map(([hex]) => hex));
  const values = ambiguous.size > 0 && valuesFor ? valuesFor(overrides) : undefined;
  const linked = (source: ColorValue | undefined): string | undefined => {
    if (!source?.paletteId) return undefined;
    const entry = basePalette.find((e) => e.id === source.paletteId);
    if (!entry) return undefined;
    const o = overrides[entry.id];
    const hex = o ? withHash(o) : entry.value.hex;
    // A cell ground at a tint of the entry keeps its strength.
    return isTinted(source) ? paletteTintHex(hex, source.tint, paper) : hex;
  };
  /** Whether a cell's fill starts from a base value two entries share
   *  (a tint of one included): only its own link says which. */
  const clashes = (hex: string, source: ColorValue | undefined): boolean => {
    if (!isTinted(source)) return ambiguous.has(hex.toLowerCase());
    const entry = basePalette.find((e) => e.id === source!.paletteId);
    return !!entry && ambiguous.has(entry.value.hex.toLowerCase());
  };
  if (!values) {
    return {
      by: () => byValue,
      cellFill: (hex, source) => (clashes(hex, source) ? linked(source) : undefined) ?? byValue(hex) ?? hex,
    };
  }
  const by = (groups: KindGroups): Remap => (hex) => {
    if (!hex) return hex;
    const key = hex.toLowerCase();
    if (ambiguous.has(key)) {
      const found = values.get(key);
      for (const group of groups) {
        const taken = new Set<string>();
        for (const kind of group) for (const v of found?.get(kind) ?? []) taken.add(v);
        if (taken.size === 0) continue;
        // The settings that start from the value all agree: theirs.
        // Otherwise the value decides, as without a palette clash.
        if (taken.size === 1) {
          const v = taken.values().next().value!;
          return v === key ? hex : v;
        }
        break;
      }
    }
    return map.get(key) ?? hex;
  };
  return {
    by,
    // A cell fill with no link of its own (a colour written out) is told
    // apart from the table's fills by value only.
    cellFill: (hex, source, groups) => (clashes(hex, source) ? linked(source) : undefined) ?? by(groups)(hex) ?? hex,
  };
}

/** `#rrggbb` of a page colour, white for none or `transparent`. */
function paperHex(hex: string | undefined): string {
  return hex && /^#[0-9a-f]{6}/i.test(hex) ? hex.slice(0, 7) : '#ffffff';
}

/** The page colour on a page whose palette overrides the entry
 *  `pageColor` links to, if it does. */
export function paperUnder(pageColor: ColorValue | undefined, overrides: Readonly<Record<string, string>> | undefined): string | undefined {
  const id = pageColor?.paletteId;
  const hex = id ? overrides?.[id] : undefined;
  if (!hex) return undefined;
  const base = paperHex(withHash(hex));
  return isTinted(pageColor) ? paletteTintHex(base, pageColor!.tint) : base;
}
