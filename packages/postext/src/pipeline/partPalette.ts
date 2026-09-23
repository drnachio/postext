// A part's `palette` recolours the flow as well as its designs. The VDT
// keeps resolved hex values, not palette links, so the flow is recoloured by
// value: on the pages a part (or a styled section) rules, every colour of the
// text flow equal to the base value of a palette entry the part overrides
// takes the part's value — headings, bold and italic runs, references,
// bullets and numbers, captions, table text and rules, callout boxes (title,
// background, stripe). Explicit colours that
// merely coincide with an entry (an inline swatch) keep theirs.

import type { ColorPaletteEntry } from '../types';
import type { VDTBlock, VDTDesignBlock, VDTDocument, VDTLine } from '../vdt';

type Remap = (hex: string | undefined) => string | undefined;

const BLOCK_KEYS = ['color', 'boldColor', 'italicColor', 'refColor', 'bulletColor', 'separatorColor'] as const;
const RESOURCE_KEYS = ['captionColor', 'captionLabelColor', 'linkColor', 'noteColor'] as const;
const TABLE_KEYS = ['color', 'headerColor', 'borderColor'] as const;

/** Segment colours of `lines` (inline swatches keep their own colour: it
 *  lives on `segment.swatch`, which is not touched). */
function recolorLines(lines: readonly VDTLine[] | undefined, remap: Remap): void {
  for (const line of lines ?? []) {
    for (const seg of line.segments ?? []) {
      if (seg.color) seg.color = remap(seg.color);
    }
  }
}

function recolorDesign(blocks: readonly VDTDesignBlock[], remap: Remap): void {
  for (const b of blocks) {
    if (b.kind === 'text' || b.kind === 'rule') b.color = remap(b.color) ?? b.color;
    else if (b.kind === 'box') {
      if (b.box.backgroundColor) b.box.backgroundColor = remap(b.box.backgroundColor);
      if (b.box.borderColor) b.box.borderColor = remap(b.box.borderColor);
    }
  }
}

function recolorBlock(block: VDTBlock, remap: Remap): void {
  const rec = block as unknown as Record<string, string | undefined>;
  for (const key of BLOCK_KEYS) if (rec[key]) rec[key] = remap(rec[key]);
  recolorLines(block.lines, remap);
  // A callout frame's decoration (background, border, stripe, title) is a
  // design overlay resolved from the style's palette-linked colours.
  if (block.type === 'callout' && block.designOverlay) recolorDesign(block.designOverlay.blocks, remap);
  const rb = block.resourceBlock;
  if (!rb) return;
  const rrec = rb as unknown as Record<string, string | undefined>;
  for (const key of RESOURCE_KEYS) if (rrec[key]) rrec[key] = remap(rrec[key]);
  recolorLines(rb.captionLines, remap);
  recolorLines(rb.noteLines, remap);
  recolorLines(rb.continuesLines, remap);
  if (rb.table) {
    const trec = rb.table as unknown as Record<string, string | undefined>;
    for (const key of TABLE_KEYS) if (trec[key]) trec[key] = remap(trec[key]);
    for (const cell of rb.table.cells) recolorLines(cell.lines, remap);
  }
}

/** Recolour each page's flow (columns and floats) with the palette overrides
 *  in force on it (`palettes[pageIndex]`: palette id → hex). */
export function applyPartPalettesToFlow(
  doc: VDTDocument,
  palettes: readonly Record<string, string>[],
  basePalette: readonly ColorPaletteEntry[] | undefined,
): void {
  if (!basePalette || basePalette.length === 0) return;
  const baseHex = new Map(basePalette.map((e) => [e.id, e.value.hex.toLowerCase()]));
  const cache = new Map<Record<string, string>, Map<string, string>>();
  for (const page of doc.pages) {
    const overrides = palettes[page.index];
    if (!overrides || Object.keys(overrides).length === 0) continue;
    let map = cache.get(overrides);
    if (!map) {
      map = new Map();
      for (const [id, hex] of Object.entries(overrides)) {
        const base = baseHex.get(id);
        const next = hex.startsWith('#') ? hex : `#${hex}`;
        if (base && base !== next.toLowerCase()) map.set(base, next);
      }
      cache.set(overrides, map);
    }
    if (map.size === 0) continue;
    const m = map;
    const remap: Remap = (hex) => (hex ? m.get(hex.toLowerCase()) ?? hex : hex);
    for (const col of page.columns) for (const block of col.blocks) recolorBlock(block, remap);
    for (const block of page.floats ?? []) recolorBlock(block, remap);
  }
}
