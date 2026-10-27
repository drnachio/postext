// Recolouring a page's blocks: lines, callout frames, table cells, headings
// and contents entries, by the page's remaps (#1278: split out of
// partPalette.ts).
import type { ColorValue } from '../../../types.js';
import type { VDTLine, VDTDesignBlock, ResolvedResourceBlock, VDTResourceTableCell, VDTBlock } from '../../../vdt.js';
import { recolorPathBlock } from '../../../design/pathBlock.js';
import { type FlowColorKind, type Remap, type FrameColorRole, TEXT_FIELDS, CAPTION_KEYS, TABLE_KEYS } from './colorKinds.js';

/** Groups of kinds, tried in order: the first group with a setting that
 *  starts from a colour's value decides it. */
export type KindGroups = readonly (readonly FlowColorKind[])[];

/** The remaps of one page, and the value a palette link takes there. */
export interface PageRemaps {
  /** The remap of a flow colour that comes from the settings of `groups`
   *  (see {@link KindGroups}). The same function for every group when no
   *  base value is ambiguous on the page. */
  by: (groups: KindGroups) => Remap;
  /** A cell's own fill: its palette link decides where the value cannot;
   *  a fill written out is told apart from the table's by `groups`. */
  cellFill: (hex: string, source: ColorValue | undefined, groups: KindGroups) => string;
}

/** The kind groups of a style's colour `setting` (`headerBackground`):
 *  the named style's own first, when the block names one. */
function scoped(family: 'table' | 'chip' | 'caption', settings: readonly string[], id: string | undefined): KindGroups {
  const all = settings.map((s): FlowColorKind => `${family}:${s}`);
  return id ? [settings.map((s): FlowColorKind => `${family}:${s}@${id}`), all] : [all];
}

/** Segment colours of `lines` (inline swatches keep their own colour: it
 *  lives on `segment.swatch`, which is not touched), chips included. A
 *  chip's colours are replaced on a copy of its record: the measurement
 *  cache shares that record between every copy of the measured lines, and
 *  the same paragraph may also sit on a page the palette does not rule. */
function recolorLines(lines: readonly VDTLine[] | undefined, remap: Remap, r: PageRemaps): void {
  for (const line of lines ?? []) {
    for (const seg of line.segments ?? []) {
      if (seg.color) seg.color = remap(seg.color);
      const chip = seg.chip;
      if (chip && (chip.background || chip.borderColor || chip.color)) {
        const style = chip.styleId || undefined;
        const background = r.by(scoped('chip', ['background'], style))(chip.background);
        const borderColor = r.by(scoped('chip', ['borderColor'], style))(chip.borderColor);
        const color = r.by(scoped('chip', ['color'], style))(chip.color);
        if (background !== chip.background || borderColor !== chip.borderColor || color !== chip.color) {
          seg.chip = {
            ...chip,
            ...(background ? { background } : {}),
            ...(borderColor ? { borderColor } : {}),
            ...(color ? { color } : {}),
          };
        }
      }
    }
  }
}

/** A callout frame's decoration, each part by the settings that colour it
 *  in the frame's style. */
function recolorFrame(blocks: readonly VDTDesignBlock[], styleId: string | undefined, r: PageRemaps): void {
  const part = (role: FrameColorRole): Remap =>
    r.by(styleId !== undefined ? [[`box:${role}@${styleId}`], [`box:${role}`]] : [[`box:${role}`]]);
  for (const b of blocks) {
    if (b.kind === 'text') {
      const remap = part('text');
      b.color = remap(b.color) ?? b.color;
      if (b.stroke) b.stroke.color = remap(b.stroke.color) ?? b.stroke.color;
    } else if (b.kind === 'rule') {
      b.color = part('rule')(b.color) ?? b.color;
    } else if (b.kind === 'box') {
      if (b.box.backgroundColor) b.box.backgroundColor = part('fill')(b.box.backgroundColor);
      if (b.box.borderColor) b.box.borderColor = part('border')(b.box.borderColor);
      // Each side's colour as the border's (#1059).
      const sides = b.box.borderSides;
      if (sides) {
        const remap = part('border');
        b.box.borderSides = {
          top: sides.top && { ...sides.top, color: remap(sides.top.color) ?? sides.top.color },
          right: sides.right && { ...sides.right, color: remap(sides.right.color) ?? sides.right.color },
          bottom: sides.bottom && { ...sides.bottom, color: remap(sides.bottom.color) ?? sides.bottom.color },
          left: sides.left && { ...sides.left, color: remap(sides.left.color) ?? sides.left.color },
        };
      }
    } else if (b.kind === 'path' && b.drawnIcon) {
      // A drawn icon (#1120): in the icon's colour, a text role.
      if (b.fill) b.fill = part('text')(b.fill) ?? b.fill;
    } else if (b.kind === 'image' && b.tint) {
      // A picture painted in one colour (#995, #1120), as its icon's.
      b.tint = part('text')(b.tint) ?? b.tint;
    } else if (b.kind === 'path' && b.boxPart) {
      // A card joined to its tab (#1059): its fill as the box's fill, its
      // border pieces as the box's border.
      if (b.fill) b.fill = part(b.boxPart === 'fill' ? 'fill' : 'border')(b.fill) ?? b.fill;
    } else if (b.kind === 'path') {
      // A vector shape (#1055): its fill as a box's fill; its outline and
      // markers as the frame's border when it is a filled shape, else as
      // its rules (a line, a connector).
      const fill = b.fill ? part('fill')(b.fill) ?? b.fill : undefined;
      const line = part(b.fill ? 'border' : 'rule');
      recolorPathBlock(b, (hex) => line(hex) ?? hex);
      if (fill) b.fill = fill;
    }
  }
}

/** The model cell a laid-out cell was set from. */
function modelCell(rb: ResolvedResourceBlock, cell: VDTResourceTableCell) {
  return rb.resource?.table?.model.rows[cell.row]?.[cell.col];
}

/** Where a heading's colour comes from: its heading style when the style
 *  sets one from the colour's value, otherwise its level. */
function headingGroups(block: VDTBlock): KindGroups {
  const level: FlowColorKind = block.headingLevel !== undefined ? `heading:${block.headingLevel}` : 'heading';
  return block.headingStyleId !== undefined ? [[`heading@${block.headingStyleId}`], [level]] : [[level]];
}

/** The settings each text colour of a contents row comes from. A row
 *  paints its bold and italic runs in its own colour. */
const TOC_FIELDS: Readonly<Record<string, FlowColorKind>> = {
  color: 'toc:color', boldColor: 'toc:color', italicColor: 'toc:color', bulletColor: 'toc:number', separatorColor: 'toc:number',
};

export function recolorBlock(block: VDTBlock, r: PageRemaps): void {
  const rec = block as unknown as Record<string, string | undefined>;
  const heading = block.type === 'heading' ? headingGroups(block) : undefined;
  const toc = block.tocEntry !== undefined;
  for (const [key, kind] of TEXT_FIELDS) {
    if (!rec[key]) continue;
    const groups: KindGroups = heading && key === 'color' ? heading : [[(toc ? TOC_FIELDS[key] : undefined) ?? kind]];
    rec[key] = r.by(groups)(rec[key]);
  }
  // A run with a colour of its own: a contents entry's page number or
  // subtitle; a token of a code listing (#624).
  recolorLines(block.lines, r.by(toc ? [['toc:segment']] : block.type === 'code' ? [['text:code'], ['text:color']] : heading ?? []), r);
  // A drop cap (#623): its own setting's colour, or the paragraph's.
  if (block.dropCap) block.dropCap.color = r.by([['text:dropCap'], ['text:color']])(block.dropCap.color) ?? block.dropCap.color;
  // A callout frame's decoration (background, border, stripe, title) is a
  // design overlay resolved from the style's palette-linked colours.
  if (block.type === 'callout' && block.designOverlay) recolorFrame(block.designOverlay.blocks, block.callout?.styleId, r);
  const rb = block.resourceBlock;
  if (!rb) return;
  const rrec = rb as unknown as Record<string, string | undefined>;
  const typeId = rb.resource?.typeId;
  for (const [key, setting] of CAPTION_KEYS) if (rrec[key]) rrec[key] = r.by(scoped('caption', [setting], typeId))(rrec[key]);
  // The references in captions and cells: `bodyText.referenceColor`.
  if (rb.linkColor) rb.linkColor = r.by([['text:ref']])(rb.linkColor) ?? rb.linkColor;
  if (rb.captionBar) rb.captionBar.background = r.by(scoped('caption', ['background'], typeId))(rb.captionBar.background) ?? rb.captionBar.background;
  const captionRuns = r.by(scoped('caption', CAPTION_KEYS.map(([, s]) => s), typeId));
  recolorLines(rb.captionLines, captionRuns, r);
  recolorLines(rb.noteLines, captionRuns, r);
  recolorLines(rb.continuesLines, captionRuns, r);
  // The words on a picture (#902): the colour of each label, its halo and
  // its plate, from the label style that sets them (a label that sets none
  // takes the paragraph style's or the body's).
  for (const label of rb.labels ?? []) {
    const layout = label.layout;
    if (!layout) continue;
    const styleId = layout.styleId;
    const groups = (setting: string, ...rest: FlowColorKind[]): KindGroups =>
      styleId !== undefined ? [[`label:${setting}@${styleId}`], [`label:${setting}`], rest] : [[`label:${setting}`], rest];
    layout.color = r.by(groups('color', 'text:color'))(layout.color) ?? layout.color;
    if (layout.halo) layout.halo = { ...layout.halo, color: r.by(groups('halo.color'))(layout.halo.color) ?? layout.halo.color };
    if (layout.background?.color) layout.background = { ...layout.background, color: r.by(groups('background'))(layout.background.color) ?? layout.background.color };
    // The plate's outline (#1058).
    const border = layout.background?.border;
    if (border) layout.background = { ...layout.background!, border: { ...border, color: r.by(groups('border.color'))(border.color) ?? border.color } };
    // The leader (#1057): its own colour, else the label's.
    const leader = layout.leader;
    if (leader) {
      const color = r.by(groups('leader.color', `label:color${styleId !== undefined ? `@${styleId}` : ''}` as FlowColorKind, 'label:color', 'text:color'))(leader.stroke.color) ?? leader.stroke.color;
      layout.leader = { ...leader, stroke: { ...leader.stroke, color } };
    }
  }
  if (rb.table) {
    const t = rb.table;
    const trec = t as unknown as Record<string, string | undefined>;
    const styleId = rb.resource?.table?.styleId;
    for (const [key, setting] of TABLE_KEYS) if (trec[key]) trec[key] = r.by(scoped('table', [setting], styleId))(trec[key]);
    const fills = scoped('table', ['bodyBackground', 'bodyAlternateBackground', 'headerBackground'], styleId);
    const cellRuns = r.by(scoped('table', ['bodyColor', 'headerColor'], styleId));
    for (const cell of t.cells) {
      if (cell.background) cell.background = r.cellFill(cell.background, modelCell(rb, cell)?.background, fills);
      recolorLines(cell.lines, cellRuns, r);
    }
  }
}
