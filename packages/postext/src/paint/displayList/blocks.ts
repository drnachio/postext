// A flow block as display items (#1388), as postext-pdf's `renderBlock`
// paints it: a design overlay (heading design, callout frame, contents
// part row) alone, a resource block through `resource.ts`, else its list
// marker, drop cap, highlight bands, lines and strikethrough.
import type { VDTBlock } from '../../vdt/blocks.js';
import type { VDTDocument } from '../../vdt/document.js';
import { leaderRuleGeometry } from '../../vdt/flowFrames.js';
import { TASK_BOX_TICK } from '../taskBox.js';
import { compose, placeShape, placeText, turnFrame, type Frame } from './frame.js';
import { slotItems } from './design.js';
import { highlightRects, placeBodyLine, sizeOf } from './lines.js';
import { resourceItems } from './resource.js';
import { lineQrItems } from './overlays.js';
import { sourceOfPlain, type Atom } from './source.js';
import type { DisplayItem, DisplayLine, DisplayListOptions, DisplayRect, DisplaySource } from './types.js';

type TextItem = Extract<DisplayItem, { kind: 'text' }>;

/** What a block's items are made with. */
export interface BlockContext {
  doc: VDTDocument;
  frame: Frame;
  /** The page's flow is vertical (CJK): lines are vertical, pictures
   *  upright. */
  vertical: boolean;
  options: DisplayListOptions | undefined;
  /** The page's flow is mirrored (right to left). */
  rtl?: boolean;
  /** The column's clip, in the block's frame. */
  clip?: DisplayRect;
}

/** The stable key of a block's text across the fragments a break made. */
export function blockKeyOf(block: VDTBlock): string {
  if (block.footnoteNote !== undefined) return `fn${block.footnoteNote}`;
  if (block.contentIndex !== undefined) return `b${block.contentIndex}`;
  return block.id;
}

function roleOf(block: VDTBlock): TextItem['role'] {
  if (block.footnoteNote !== undefined) return 'footnote';
  switch (block.type) {
    case 'heading': return 'heading';
    case 'listItem': return 'list';
    case 'blockquote': return 'quote';
    case 'code': return 'code';
    case 'callout': return 'callout';
    default: return 'body';
  }
}

/** Text the engine wrote rather than the author: contents rows, index
 *  entries, a bibliography. */
function isGenerated(block: VDTBlock): boolean {
  return block.tocEntry !== undefined || block.tocPart !== undefined || block.indexLevel !== undefined || block.bibEntry !== undefined;
}

function chapterOf(block: VDTBlock): string | undefined {
  return block.sourceChapter !== undefined ? String(block.sourceChapter) : undefined;
}

/** A list item's marker: number or bullet (with its prefix and
 *  separator runs), or the drawn box of a task item. */
function markerItems(block: VDTBlock, ctx: BlockContext): DisplayItem[] {
  const first = block.lines[0];
  if (block.bulletBox && block.bulletOffsetX !== undefined) {
    const { side, stroke, checked } = block.bulletBox;
    const cy = block.bulletY ?? first?.baseline ?? block.bbox.y;
    const x = block.bulletOffsetX;
    const y = cy - side / 2;
    const color = block.bulletColor ?? block.color;
    const items: DisplayItem[] = [placeShape(ctx.frame, { kind: 'rect', rect: { x: x + stroke / 2, y: y + stroke / 2, width: side - stroke, height: side - stroke }, stroke: color, strokeWidthPx: stroke })];
    if (checked) {
      const pts = TASK_BOX_TICK.map(([u, v]) => ({ x: x + u * side, y: y + v * side }));
      items.push(placeShape(ctx.frame, {
        kind: 'path',
        bbox: { x, y, width: side, height: side },
        subpaths: [pts.map((p, i) => ({ op: i === 0 ? 'M' as const : 'L' as const, x: p.x, y: p.y }))],
        stroke: { color, widthPx: stroke, cap: 'round', join: 'round' },
      }));
    }
    return items;
  }
  if (!block.bulletText || !block.bulletFontString || block.bulletOffsetX === undefined || !first) return [];
  const size = sizeOf(block.bulletFontString);
  const onBaseline = block.bulletBaselineY !== undefined;
  const midY = block.bulletY ?? first.baseline;
  const baseline = onBaseline ? block.bulletBaselineY! : midY + size * 0.3;
  const measure = ctx.options?.measure;
  const widthOf = (text: string, font: string) => (measure ? measure(text, font, 0) : sizeOf(font) * 0.55 * text.length);
  const color = block.bulletColor ?? block.color;
  const sepFont = block.separatorFontString ?? block.bulletFontString;
  // A separator in a face of its own centres on the marker's mid line at
  // its own size (the PDF's `renderBullet`): a shift off the number's
  // baseline, positive up.
  const sepShift = onBaseline ? 0 : baseline - (midY + sizeOf(sepFont) * 0.3);
  const parts: { text: string; x: number; font: string; color: string; shift: number }[] = [];
  if (block.separatorText && block.separatorX !== undefined && block.prefixText && block.prefixX !== undefined) {
    parts.push({ text: block.prefixText, x: block.prefixX, font: sepFont, color: block.separatorColor ?? color, shift: sepShift });
  }
  parts.push({ text: block.bulletText, x: block.bulletOffsetX, font: block.bulletFontString, color, shift: 0 });
  if (block.separatorText && block.separatorX !== undefined) {
    parts.push({ text: block.separatorText, x: block.separatorX, font: sepFont, color: block.separatorColor ?? color, shift: sepShift });
  }
  let text = '';
  const runs = parts.map((p) => {
    const run = {
      text: p.text, x: p.x, width: widthOf(p.text, p.font), fontString: p.font, color: p.color, textStart: text.length,
      ...(Math.abs(p.shift) > 1e-9 ? { baselineShift: p.shift } : {}),
      ...(block.bulletDirection ? { rtl: true } : {}),
    };
    text += p.text;
    return run;
  });
  const left = Math.min(...runs.map((r) => r.x));
  const right = Math.max(...runs.map((r) => r.x + r.width));
  const line: DisplayLine = { text, x: left, width: right - left, baseline, lineHeight: first.bbox.height, align: 'left', runs, map: new Array<number>(text.length).fill(-1) };
  const item: TextItem = {
    kind: 'text', role: 'marker', blockType: block.type,
    bbox: { x: left, y: baseline - size, width: right - left, height: size * 1.2 },
    lines: [line],
    source: { blockKey: blockKeyOf(block), map: line.map, generated: true, ...(chapterOf(block) ? { chapter: chapterOf(block) } : {}) },
  };
  if (ctx.clip) item.clip = ctx.clip;
  return [placeText(ctx.frame, item)];
}

/** A paragraph's drop cap (and an opening mark hung before it). */
function dropCapItem(block: VDTBlock, ctx: BlockContext): DisplayItem[] {
  const cap = block.dropCap;
  if (!cap) return [];
  const runs = [];
  let text = '';
  if (cap.hang) {
    runs.push({ text: cap.hang.text, x: cap.hang.x, width: cap.hang.width, fontString: cap.hang.fontString, color: cap.color, textStart: 0 });
    text += cap.hang.text;
  }
  runs.push({ text: cap.text, x: cap.x, width: cap.width, fontString: cap.fontString, color: cap.color, textStart: text.length });
  text += cap.text;
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) map.push(cap.plainStart + i < cap.plainEnd ? sourceOfPlain(block, cap.plainStart + i) : -1);
  const left = Math.min(...runs.map((r) => r.x));
  const right = Math.max(...runs.map((r) => r.x + r.width));
  const line: DisplayLine = { text, x: left, width: right - left, baseline: cap.baselineY, lineHeight: cap.fontSizePx, align: 'left', runs, map };
  const source: DisplaySource = { blockKey: blockKeyOf(block), map };
  const chapter = chapterOf(block);
  if (chapter !== undefined) source.chapter = chapter;
  const item: TextItem = {
    kind: 'text', role: 'dropCap', blockType: block.type,
    bbox: { x: left, y: cap.baselineY - cap.fontSizePx, width: right - left, height: cap.fontSizePx * 1.2 },
    lines: [line], source,
  };
  if (ctx.clip) item.clip = ctx.clip;
  return [placeText(ctx.frame, item)];
}

/** The lines of a flow block as one text item, with highlight bands under
 *  them and rule leaders. */
function linesItems(block: VDTBlock, ctx: BlockContext): DisplayItem[] {
  const before: DisplayItem[] = [];
  const after: DisplayItem[] = [];
  const lines: DisplayLine[] = [];
  const map: number[] = [];
  const atoms: Atom[] = [];
  let at = 0;
  for (const line of block.lines) {
    for (const h of highlightRects(line)) before.push(placeShape(ctx.frame, h));
    const placed = placeBodyLine(line, block, ctx.vertical, ctx.options, ctx.rtl);
    lines.push(placed.line);
    map.push(...placed.line.map);
    for (const a of placed.atoms) atoms.push({ ...a, at: a.at + at });
    at += placed.line.text.length;
    // A rule leader keys off the block's size, in the block's colour, as
    // the PDF draws it (`renderSegments`).
    for (const l of placed.leaders) {
      const { dy, thickness } = leaderRuleGeometry(sizeOf(block.fontString));
      after.push(placeShape(ctx.frame, { kind: 'rule', x1: l.x, y1: line.baseline + dy, x2: l.x + l.width, y2: line.baseline + dy, color: block.color, widthPx: thickness }));
    }
    // A link note's QR code (#1302), after the text.
    after.push(...lineQrItems(line, ctx.frame, block.color));
  }
  if (block.strikethroughText) {
    const thickness = Math.max(1, block.lines[0]?.bbox.height ? block.lines[0].bbox.height * 0.05 : 1);
    for (const line of block.lines) {
      const y = line.baseline - line.bbox.height * 0.28;
      after.push(placeShape(ctx.frame, { kind: 'rule', x1: line.bbox.x, y1: y, x2: line.bbox.x + line.bbox.width, y2: y, color: block.color, widthPx: thickness }));
    }
  }
  if (lines.length === 0) return [...before, ...after];
  const source: DisplaySource = { blockKey: blockKeyOf(block), map };
  if (atoms.length > 0) source.atoms = atoms;
  if (isGenerated(block)) source.generated = true;
  const chapter = chapterOf(block);
  if (chapter !== undefined) source.chapter = chapter;
  const item: TextItem = { kind: 'text', role: roleOf(block), bbox: { ...block.bbox }, lines, source, blockType: block.type };
  if (block.headingLevel !== undefined) item.level = block.headingLevel;
  if (ctx.clip) item.clip = ctx.clip;
  return [...before, placeText(ctx.frame, item), ...after];
}

/** The items a block paints, placed on the sheet. */
export function blockItems(block: VDTBlock, ctx: BlockContext): DisplayItem[] {
  if (block.hidden) return [];
  // A box printed upside down (#1229): drawn turned about its centre.
  let c = ctx;
  if (block.turn) {
    const { clip: _clip, ...rest } = ctx;
    void _clip;
    c = { ...rest, frame: compose(ctx.frame, turnFrame(block.turn.cx, block.turn.cy)) };
  }
  if (block.designOverlay) {
    // A heading's design, a callout frame, a contents part row: the
    // overlay alone (its text is the heading, the callout's title).
    return slotItems(block.designOverlay, {
      frame: c.frame,
      uprightPictures: c.vertical,
      role: block.type === 'callout' ? 'callout' : block.type === 'heading' ? 'heading' : 'design',
      generated: isGenerated(block),
      blockKey: blockKeyOf(block),
      ...(chapterOf(block) !== undefined ? { chapter: chapterOf(block) } : {}),
      ...(block.headingLevel !== undefined ? { level: block.headingLevel } : {}),
      blockType: block.type,
    });
  }
  if (block.type === 'resource') return resourceItems(block, c);
  return [...markerItems(block, c), ...dropCapItem(block, c), ...linesItems(block, c)];
}

/** A strip's caption (`VDTBlock.stripCaption`, #590), in the flow where
 *  the PDF's `renderStripCaption` paints it: the bar, highlight bands,
 *  then its lines set as a paragraph's in the block's measure. Its text
 *  is a fence attribute (`caption=…`) with a generated label: shown, not
 *  imported, as a repeated resource caption is. */
export function stripCaptionItems(block: VDTBlock, ctx: BlockContext): DisplayItem[] {
  const caption = block.stripCaption;
  if (!caption || block.hidden) return [];
  const items: DisplayItem[] = [];
  if (caption.bar) {
    const { rect, background } = caption.bar;
    items.push(placeShape(ctx.frame, { kind: 'rect', rect: { x: block.bbox.x + rect.x, y: block.bbox.y + rect.y, width: rect.width, height: rect.height }, fill: background }));
  }
  const vdtLines = block.lines.slice(caption.firstLine, caption.firstLine + caption.lineCount);
  const lines: DisplayLine[] = [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const line of vdtLines) {
    for (const h of highlightRects(line)) items.push(placeShape(ctx.frame, h));
    const placed = placeBodyLine(line, block, ctx.vertical, ctx.options, ctx.rtl).line;
    placed.map = new Array<number>(placed.text.length).fill(-1);
    lines.push(placed);
    x0 = Math.min(x0, line.bbox.x);
    y0 = Math.min(y0, line.bbox.y);
    x1 = Math.max(x1, line.bbox.x + line.bbox.width);
    y1 = Math.max(y1, line.bbox.y + line.bbox.height);
  }
  if (lines.length === 0) return items;
  const source: DisplaySource = { blockKey: `${blockKeyOf(block)}:caption`, map: lines.flatMap((l) => l.map), generated: true };
  const chapter = chapterOf(block);
  if (chapter !== undefined) source.chapter = chapter;
  const item: TextItem = { kind: 'text', role: 'caption', bbox: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, lines, source, blockType: block.type };
  if (ctx.clip) item.clip = ctx.clip;
  items.push(placeText(ctx.frame, item));
  return items;
}
