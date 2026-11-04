// Text items as text boxes (#1392): each chunk of an item's lines (see
// paragraphs.ts) becomes one page-anchored text box placed so Word's
// first baseline lands on the engine's; a turned item turns every box
// about the item's centre. Inline maths, music and swatches are drawn
// over the holders their runs leave in the text.

import type { DisplayItem, DisplayRect } from '../../paint/displayList/types.js';
import { textBoxRun, turnedBox } from './drawing.js';
import { isImportable, recordFragment, reserveFragment } from './fragments.js';
import { chunkBox, emitGroups, planChunks, planLines, type TextOut } from './paragraphs.js';
import { inlineSvgRun } from './pictures.js';
import { rectRuns } from './shapes.js';
import type { WriterContext } from './types.js';

type TextItem = Extract<DisplayItem, { kind: 'text' }>;

/** Item text offset of each line (lines concatenated, no separators). */
export function lineOffsets(item: TextItem): number[] {
  const out: number[] = [];
  let at = 0;
  for (const l of item.lines) {
    out.push(at);
    at += l.text.length;
  }
  return out;
}

/** The drawings over a run of paragraphs (inline pictures, swatches). */
export async function inlineDrawingRuns(ctx: WriterContext, out: TextOut, centre: { x: number; y: number }, rotate: number | undefined): Promise<string[]> {
  const runs: string[] = [];
  for (const d of out.drawings) {
    const rect: DisplayRect = turnedBox(d.rect, centre, rotate);
    if (d.svg) {
      const r = await inlineSvgRun(ctx, d.svg, rect, rotate, d.kind);
      if (r) runs.push(r);
    } else if (d.kind === 'swatch') {
      runs.push(...rectRuns(ctx, { kind: 'rect', rect, ...(d.color ? { fill: d.color } : {}), ...(rotate ? { rotate } : {}) }));
    }
  }
  return runs;
}

/** A text item's text boxes and the drawings over them. */
export async function textItemRuns(ctx: WriterContext, item: TextItem): Promise<string[]> {
  if (item.lines.length === 0) return [];
  const vertical = item.lines.some((l) => l.vertical);
  if (vertical) ctx.warn('vertical-text', 'vertical text is set in an East Asian text box at its item box; its line positions are approximate');
  const plans = planLines(ctx, item.lines);
  const chunks = planChunks(item.lines, plans, !vertical);
  const offsets = lineOffsets(item);
  const importable = isImportable(item);
  const centre = { x: item.bbox.x + item.bbox.width / 2, y: item.bbox.y + item.bbox.height / 2 };
  const runs: string[] = [];
  for (const chunk of chunks) {
    const box = vertical ? item.bbox : chunkBox(ctx, item.lines, chunk, plans);
    const slot = importable ? reserveFragment(ctx) : undefined;
    const out = emitGroups(ctx, item, chunk.groups, box.x, box.x + box.width, { offsets, ...(slot ? { bookmarkStart: slot.start, bookmarkEnd: slot.end } : {}) });
    if (slot && importable) recordFragment(ctx, slot, item, out);
    const rect = turnedBox(box, centre, item.rotate);
    runs.push(textBoxRun(ctx, { rect, name: `ptx ${item.role}`, ...(item.rotate ? { rotate: item.rotate } : {}) }, out.xml, vertical ? 'eaVert' : undefined));
    runs.push(...(await inlineDrawingRuns(ctx, out, centre, item.rotate)));
  }
  return runs;
}
