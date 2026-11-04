// Design slots as display items (#1388): running heads and folios, line
// numbers, opener bands, heading designs and callout frames — their text
// blocks (runs in the line's paint order, vertical blocks in their own
// turned frame), rules, boxes, pictures and vector paths, as postext-pdf's
// `renderHeaderFooterSlot` paints them.
import type { VDTDesignSlot, VDTDesignTextBlock, VDTDesignTextLine } from '../../vdt/design.js';
import { compose, mapRect, placeImage, placeShape, placeText, type Frame } from './frame.js';
import { alignToSource } from './source.js';
import type { DisplayItem, DisplayLine, DisplayRun, DisplaySource } from './types.js';

type TextRole = Extract<DisplayItem, { kind: 'text' }>['role'];

/** How a slot's items are made: the frame it is painted in, the role of
 *  its text, and where that text comes from. */
export interface SlotContext {
  frame: Frame;
  /** The frame is a vertical page's flow: pictures stand upright on the
   *  sheet in it. */
  uprightPictures: boolean;
  role: TextRole;
  /** Running heads, contents rows: shown, never imported. */
  generated: boolean;
  /** Key of the block the slot belongs to (a heading's design), else the
   *  slot's own. */
  blockKey: string;
  chapter?: string;
  level?: number;
  blockType?: string;
}

/** A design line's runs from its `xOffset`, advancing in its `order`. */
function designRuns(block: VDTDesignTextBlock, line: VDTDesignTextLine, originX: number): { runs: DisplayRun[]; text: string } {
  const tracking = block.letterSpacingPx ? block.letterSpacingPx : undefined;
  const x0 = originX + line.xOffset;
  if (!line.runs) {
    const run: DisplayRun = { text: line.text, x: x0, width: line.width, fontString: block.fontString, color: block.color, textStart: 0 };
    if (tracking) run.tracking = tracking;
    if (block.direction === 'rtl') run.rtl = true;
    return { runs: [run], text: line.text };
  }
  const order = line.order && line.order.length === line.runs.length ? line.order : undefined;
  const xs = new Array<number>(line.runs.length);
  let x = x0;
  for (let k = 0; k < line.runs.length; k++) {
    const i = order ? order[k]! : k;
    xs[i] = x;
    x += line.runs[i]!.width;
  }
  const runs: DisplayRun[] = [];
  let text = '';
  line.runs.forEach((r, i) => {
    const shown = r.chip ? r.chip.runs.map((c) => c.text).join('') || r.text : r.text;
    const run: DisplayRun = { text: shown, x: xs[i]!, width: r.width, fontString: r.fontString, color: r.color ?? (r.chip?.color ?? block.color), textStart: text.length };
    text += shown;
    if (/\b(bold|[6-9]00)\b/.test(r.fontString)) run.bold = true;
    if (/\bitalic\b/.test(r.fontString)) run.italic = true;
    if (/\bsmall-caps\b/.test(r.fontString)) run.smallCaps = true;
    if (tracking && !r.rtl) run.tracking = tracking;
    if (r.baselineShift) run.baselineShift = -r.baselineShift;
    if (r.rtl) run.rtl = true;
    if (r.chip) run.inline = { kind: 'chip', widthPx: r.width, heightPx: r.chip.ascent + r.chip.descent, ascentPx: r.chip.ascent };
    runs.push(run);
  });
  return { runs, text };
}

/** The characters of a design text block mapped to the Markdown, when it
 *  mirrors document text (`sourceText` / `sourceMap`); a number the
 *  design prints before the title maps to nothing. */
function designMap(block: VDTDesignTextBlock, text: string, leaders: Set<number>): number[] {
  const src = block.sourceText;
  const map = block.sourceMap;
  if (!src || !map) return new Array<number>(text.length).fill(-1);
  const masked = [...text].map((c, i) => (leaders.has(i) ? '\u0000' : c)).join('');
  const prefix = block.sourcePrefixLen ?? 0;
  return alignToSource(masked, src).map((off) => (off >= prefix && off < map.length ? map[off]! : -1));
}

function textBlockItems(block: VDTDesignTextBlock, ctx: SlotContext): DisplayItem[] {
  const items: DisplayItem[] = [];
  if (block.box) {
    const b = block.box;
    items.push(placeShape(ctx.frame, {
      kind: 'rect', rect: { ...block.bbox },
      ...(b.backgroundColor ? { fill: b.backgroundColor } : {}),
      ...(b.borderColor && b.borderWidthPx > 0 ? { stroke: b.borderColor, strokeWidthPx: b.borderWidthPx } : {}),
      ...(b.borderRadiusPx ? { radius: b.borderRadiusPx } : {}),
      box: b,
    }));
  }
  const vertical = block.vertical;
  // A vertical block's lines run in its own frame, turned a quarter turn
  // clockwise about its box's top right corner.
  const frame = vertical ? compose(ctx.frame, [0, 1, -1, 0, block.bbox.x + block.bbox.width, block.bbox.y]) : ctx.frame;
  const localBox = vertical ? { x: 0, y: 0, width: block.bbox.height, height: block.bbox.width } : { ...block.bbox };
  const lines: DisplayLine[] = [];
  let all = '';
  const leaders = new Set<number>();
  for (const line of block.lines) {
    const { runs, text } = designRuns(block, line, vertical ? 0 : block.bbox.x);
    line.runs?.forEach((r, i) => {
      if (r.leader) for (let k = 0; k < runs[i]!.text.length; k++) leaders.add(all.length + runs[i]!.textStart + k);
    });
    const sizeMatch = /(\d+(?:\.\d+)?)px/.exec(block.fontString);
    const out: DisplayLine = {
      text,
      x: vertical ? line.xOffset : block.bbox.x + line.xOffset,
      width: line.width,
      baseline: line.baselineY,
      lineHeight: sizeMatch ? Number(sizeMatch[1]) * 1.2 : 0,
      align: line.wordSpacingPx !== undefined ? 'justify' : 'left',
      runs,
      map: [],
    };
    if (block.direction === 'rtl') out.rtl = true;
    if (vertical) out.vertical = true;
    lines.push(out);
    all += text;
  }
  // Each line carries its share of the block's map.
  const map = designMap(block, all, leaders);
  let at = 0;
  for (const line of lines) {
    line.map = map.slice(at, at + line.text.length);
    at += line.text.length;
  }
  if (lines.length === 0) return items;
  const source: DisplaySource = { blockKey: ctx.blockKey, map };
  if (ctx.chapter !== undefined) source.chapter = ctx.chapter;
  if (ctx.generated || block.artifact || !block.sourceMap) source.generated = true;
  const item: Extract<DisplayItem, { kind: 'text' }> = { kind: 'text', role: ctx.role, bbox: localBox, lines, source };
  if (ctx.level !== undefined) item.level = ctx.level;
  if (ctx.blockType) item.blockType = ctx.blockType;
  if (block.clip) item.clip = { ...localBox };
  items.push(placeText(frame, item));
  return items;
}

/** The items a design slot paints, in its order, placed on the sheet. */
export function slotItems(slot: VDTDesignSlot, ctx: SlotContext): DisplayItem[] {
  const items: DisplayItem[] = [];
  for (const block of slot.blocks) {
    switch (block.kind) {
      case 'text':
        items.push(...textBlockItems(block, ctx));
        break;
      case 'rule': {
        const { x, y, width, height } = block.bbox;
        const t = block.thicknessPx;
        const rule = block.direction === 'vertical'
          ? { x1: x + t / 2, y1: y, x2: x + t / 2, y2: y + height }
          : { x1: x, y1: y + t / 2, x2: x + width, y2: y + t / 2 };
        items.push(placeShape(ctx.frame, { kind: 'rule', ...rule, color: block.color, widthPx: t }));
        break;
      }
      case 'box': {
        const b = block.box;
        items.push(placeShape(ctx.frame, {
          kind: 'rect', rect: { ...block.bbox },
          ...(b.backgroundColor ? { fill: b.backgroundColor } : {}),
          ...(b.borderColor && b.borderWidthPx > 0 ? { stroke: b.borderColor, strokeWidthPx: b.borderWidthPx } : {}),
          ...(b.borderRadiusPx ? { radius: b.borderRadiusPx } : {}),
          box: b,
        }));
        break;
      }
      case 'image': {
        const image: Extract<DisplayItem, { kind: 'image' }> = { kind: 'image', rect: { ...block.bbox }, fileId: block.fileId };
        if (block.imageKind) image.imageKind = block.imageKind;
        if (block.pdfFileId) image.pdfFileId = block.pdfFileId;
        if (block.crop) image.crop = { ...block.crop };
        if (block.tint) image.tint = block.tint;
        if (block.altText) image.alt = block.altText;
        // Down a vertical page a picture stands upright on the sheet.
        items.push(ctx.uprightPictures ? { ...image, rect: mapRect(ctx.frame, image.rect) } : placeImage(ctx.frame, image));
        break;
      }
      case 'path': {
        const path: Extract<DisplayItem, { kind: 'path' }> = { kind: 'path', bbox: { ...block.bbox }, subpaths: block.subpaths };
        if (block.fill) path.fill = block.fill;
        if (block.stroke) path.stroke = block.stroke;
        items.push(placeShape(ctx.frame, path));
        break;
      }
    }
  }
  return items;
}
