// Text items as text boxes (#1392): each chunk of an item's lines (see
// paragraphs.ts) becomes one page-anchored text box placed so Word's
// first baseline lands on the engine's; a turned item turns every box
// about the item's centre, a vertical one (#1394) stands as an `eaVert`
// box. Inline maths, music and swatches are drawn over the holders their
// runs leave in the text, chip boxes under their words, kanbun marks
// beside their characters.

import type { DisplayItem, DisplayLine, DisplayRect, DisplayRun } from '../../paint/displayList/types.js';
import { textBoxRun, turnedBox, turnPoint } from './drawing.js';
import { annotationRect, smallTextBox, textRun } from './eastAsian.js';
import { haloRun } from './halo.js';
import { fontSizePx } from './metrics.js';
import { naturalTwips, runProps, wordText, writtenFace } from './runs.js';
import { rectRuns, ruleRun } from './shapes.js';
import { hasFragment, recordFragment, reserveFragment } from './fragments.js';
import { chunkBox, emitGroups, MAX_PITCH, MIN_PITCH, planChunks, planLines, type Chunk, type Group, type LinePlan, type TextOut } from './paragraphs.js';
import { inlineSvgRun } from './pictures.js';
import { chipBoxRuns, swatchShapeRuns } from './inlineShapes.js';
import { twips, twipsToPx } from './units.js';
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

/** The drawings over a run of paragraphs (inline pictures, swatches;
 *  `swatches` false: the caller draws them from its lines). */
export async function inlineDrawingRuns(ctx: WriterContext, out: TextOut, centre: { x: number; y: number }, rotate: number | undefined, swatches = true): Promise<string[]> {
  const runs: string[] = [];
  for (const d of out.drawings) {
    const rect: DisplayRect = turnedBox(d.rect, centre, rotate);
    if (d.svg) {
      const r = await inlineSvgRun(ctx, d.svg, rect, rotate, d.kind, d.color);
      if (r) runs.push(r);
    } else if (d.kind === 'swatch' && swatches) {
      runs.push(...rectRuns(ctx, { kind: 'rect', rect, ...(d.color ? { fill: d.color } : {}), ...(rotate ? { rotate } : {}) }));
    }
  }
  return runs;
}

/** The sum of two clockwise angles in (-180, 180], undefined for 0. */
function addAngles(a: number, b: number): number | undefined {
  let r = (a + b) % 360;
  if (r > 180) r -= 360;
  if (r <= -180) r += 360;
  return Math.abs(r) < 1e-9 ? undefined : r;
}

/** Where a box laid out in an item's unturned frame stands on the sheet.
 *  A vertical item's lines run along the frame's x, which the item's
 *  quarter turn brings down the sheet: Word's `eaVert` box sets lines top
 *  to bottom and stacks them right to left by itself, so the box is the
 *  frame's box turned (sides swapped) and only the turn past that
 *  quarter is left to `rot`. */
export function sheetBox(rect: DisplayRect, centre: { x: number; y: number }, rotate: number | undefined, vertical: boolean): { rect: DisplayRect; rotate?: number; vert: 'horz' | 'eaVert' } {
  const r = turnedBox(rect, centre, rotate);
  if (!vertical) return { rect: r, ...(rotate ? { rotate } : {}), vert: 'horz' };
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  const rest = addAngles(rotate ?? 0, -90);
  return { rect: { x: cx - rect.height / 2, y: cy - rect.width / 2, width: rect.height, height: rect.width }, ...(rest !== undefined ? { rotate: rest } : {}), vert: 'eaVert' };
}

/** The kanbun marks and rules a run of paragraphs draws beside its runs. */
function markRuns(ctx: WriterContext, out: TextOut, centre: { x: number; y: number }, rotate: number | undefined): string[] {
  const runs: string[] = [];
  for (const a of out.annotations) {
    const placed = sheetBox(annotationRect(a), centre, rotate, a.vertical);
    const run: DisplayRun = { text: a.text, x: a.x, width: 0, fontString: a.fontString, color: a.color, textStart: 0 };
    runs.push(smallTextBox(ctx, placed.rect, textRun(runProps(ctx, run, {}), wordText(a.text)), fontSizePx(a.fontString), placed.rotate, placed.vert));
  }
  for (const r of out.rules) {
    const p = turnPoint({ x: r.x1, y: r.y }, centre, rotate ?? 0);
    const q = turnPoint({ x: r.x2, y: r.y }, centre, rotate ?? 0);
    runs.push(ruleRun(ctx, { kind: 'rule', x1: p.x, y1: p.y, x2: q.x, y2: q.y, color: r.color, widthPx: r.thickness }));
  }
  return runs;
}

/** Share of the font size above the baseline that counts as a line's
 *  ink for paint order: the x-height band, not the leading or the
 *  ascenders a chip's padding may brush. */
const INK_RISE = 0.6;

/** The inked bands of `lines` in the item's unturned frame: from the
 *  start of each line's first visible run to the end of its last, the
 *  x-height band above the baseline. */
export function inkRects(lines: readonly DisplayLine[]): DisplayRect[] {
  const out: DisplayRect[] = [];
  for (const l of lines) {
    let x0 = Infinity;
    let x1 = -Infinity;
    let size = 0;
    for (const r of l.runs) {
      if (!r.text.trim()) continue;
      x0 = Math.min(x0, r.x);
      x1 = Math.max(x1, r.x + r.width);
      size = Math.max(size, fontSizePx(r.fontString));
    }
    if (x1 <= x0 || size <= 0) continue;
    out.push({ x: x0, y: l.baseline - INK_RISE * size, width: x1 - x0, height: INK_RISE * size });
  }
  return out;
}

/** A box of one line sets it at its faces' own height (ascent plus
 *  descent) instead of the engine's line pitch: its baseline lands where
 *  it did in Word, whose exact line puts the extra leading above the
 *  text, and in Google Docs, which turns the exact pitch into a multiple
 *  of the face's height and puts the leading below, a number set small on
 *  a tall row (a contents entry) no longer rises off its line. Lines of
 *  faces that are not embedded keep the engine's pitch. */
function fitLonePitch(ctx: WriterContext, line: DisplayLine, plan: LinePlan, group: Group): void {
  let ascent = 0;
  let descent = 0;
  for (const r of line.runs) {
    if (r.text.length === 0 || r.inline) continue;
    const face = writtenFace(r, line);
    const a = ctx.metrics.ascentPx(face);
    const d = ctx.metrics.descentPx(face);
    if (a === undefined || d === undefined) return;
    ascent = Math.max(ascent, a);
    descent = Math.max(descent, d);
  }
  if (ascent <= 0) return;
  const h = Math.min(MAX_PITCH, Math.max(MIN_PITCH, twips(ascent + descent, ctx.dpi)));
  plan.h = h;
  group.pitch = h;
}

/** The pitch of a lone vertical line, in ems of its largest size. An
 *  `eaVert` box sets the glyphs of an exact line centred across it (about
 *  a fifth of an em right of the line's middle), while the box is placed
 *  by the 4/5 rule from the engine's baseline, which lies some 0.37 em
 *  left of the glyphs' centre: the two agree at a pitch of about 1.87 em,
 *  near the column pitch of vertical body text, which lands on its
 *  columns. At the engine's 1.2 em a title, a name or a contents heading
 *  stood 2.5 to 4.3 pt off its place, toward the next column (#1444). */
const LONE_VERTICAL_EMS = 1.87;

/** A box of one vertical line set at `LONE_VERTICAL_EMS`. */
function fitLoneVertical(ctx: WriterContext, line: DisplayLine, plan: LinePlan, group: Group): void {
  const size = Math.max(0, ...line.runs.filter((r) => r.text.length > 0 && !r.inline).map((r) => fontSizePx(r.fontString)));
  if (size <= 0) return;
  const h = Math.min(MAX_PITCH, Math.max(MIN_PITCH, twips(LONE_VERTICAL_EMS * size, ctx.dpi)));
  plan.h = h;
  group.pitch = h;
}

/** Roles whose boxes are titles and labels, set in display faces that a
 *  renderer without them (Google Docs) replaces by a wider one. */
const DISPLAY_ROLES = new Set<TextItem['role']>(['heading', 'opener', 'design']);

/** Roles whose boxes get room for an italic line's overhang: the titles
 *  and labels above, and the labels drawn on a picture or in a margin. */
const ITALIC_ROOM_ROLES = new Set<TextItem['role']>([...DISPLAY_ROLES, 'label']);

/** Whether a text item's boxes get room for an italic overhang. */
export function hasItalicRoom(role: TextItem['role']): boolean {
  return ITALIC_ROOM_ROLES.has(role);
}

/** Whether a chunk's box may grow down: a title or label box, unturned
 *  and ragged, whose words a wider fallback face sets on more lines than
 *  the engine's would be cut at the box's foot. The box is unfilled, so
 *  the room under its lines shows nothing in Word. */
function growsDown(item: TextItem, chunk: Chunk): boolean {
  return DISPLAY_ROLES.has(item.role) && !item.rotate && chunk.groups.every((g) => g.jc !== 'both');
}

/** How far a growing box goes down, px: up to its own height, never past
 *  `limit` (the next box of its item, or the free room under the item),
 *  so it does not lie over a box or table below it and take its clicks. */
export function growth(box: { y: number; height: number }, limit: number): number {
  return Math.max(0, Math.min(box.height, limit - (box.y + box.height)));
}

export interface TextItemOptions {
  /** Free room under the item on its page, px (none given: unbounded). */
  growRoom?: number;
}

/** A list marker with its runs as wide as the face sets them. The display
 *  list places a marker's parts (prefix, number, separator) where the PDF
 *  draws them but, unmeasured, gives each a width of 0.55 em a character:
 *  spread over the characters as spacing, that letter-spaced a numeral
 *  ("i i", "1 .") and pushed a separator past the end of its box. */
export function measuredMarker(ctx: WriterContext, item: TextItem): TextItem {
  if (item.role !== 'marker' || item.rotate) return item;
  const lines = item.lines.map((l) => {
    if (l.vertical) return l;
    const runs = l.runs.map((r) => {
      const nat = r.text ? naturalTwips(ctx, r.fontString, wordText(r.text)) : undefined;
      if (nat === undefined) return r;
      const tracking = (r.tracking ?? 0) * Array.from(r.text).length;
      return { ...r, width: twipsToPx(nat, ctx.dpi) + tracking };
    });
    if (runs.length === 0) return l;
    const left = Math.min(...runs.map((r) => r.x));
    const right = Math.max(...runs.map((r) => r.x + r.width));
    return { ...l, runs, x: left, width: right - left };
  });
  const left = Math.min(...lines.map((l) => l.x));
  const right = Math.max(...lines.map((l) => l.x + l.width));
  return { ...item, lines, bbox: { ...item.bbox, x: left, width: right - left } };
}

/** A text item's text boxes and the drawings over them. */
export async function textItemRuns(ctx: WriterContext, input: TextItem, opts: TextItemOptions = {}): Promise<string[]> {
  if (input.lines.length === 0) return [];
  const item = measuredMarker(ctx, input);
  const vertical = item.lines.some((l) => l.vertical);
  if (vertical) ctx.warn('vertical-text', 'vertical text is set in East Asian (eaVert) text boxes; Word centres the glyphs on its own line axis, so positions across a column are approximate');
  const plans = planLines(ctx, item.lines);
  const chunks = planChunks(item.lines, plans);
  for (const c of chunks) {
    if (c.from !== c.to) continue;
    if (vertical) fitLoneVertical(ctx, item.lines[c.from]!, plans[c.from]!, c.groups[0]!);
    else fitLonePitch(ctx, item.lines[c.from]!, plans[c.from]!, c.groups[0]!);
  }
  const offsets = lineOffsets(item);
  const fragmented = hasFragment(item);
  const centre = { x: item.bbox.x + item.bbox.width / 2, y: item.bbox.y + item.bbox.height / 2 };
  const runs: string[] = [];
  const boxes = chunks.map((c) => chunkBox(ctx, item.lines, c, plans, hasItalicRoom(item.role)));
  const floor = item.bbox.y + item.bbox.height + (opts.growRoom ?? Infinity);
  for (const [ci, chunk] of chunks.entries()) {
    const box = boxes[ci]!;
    if (!vertical && growsDown(item, chunk)) box.height += growth(box, boxes[ci + 1]?.y ?? floor);
    const slot = fragmented ? reserveFragment(ctx) : undefined;
    const out = emitGroups(ctx, item, chunk.groups, box.x, box.x + box.width, { offsets, ...(slot ? { bookmarkStart: slot.start, bookmarkEnd: slot.end } : {}) });
    if (slot && fragmented) recordFragment(ctx, slot, item, out);
    const placed = sheetBox(box, centre, item.rotate, vertical);
    const lines = item.lines.slice(chunk.from, chunk.to + 1);
    // A turned item's halo under each box, turned with it (halo.ts).
    if (item.rotate && !vertical) {
      const halo = haloRun(ctx, item, { box, rect: placed.rect, rotate: item.rotate }, lines);
      if (halo) runs.push(halo);
    }
    // Chip boxes under their words; swatches in their real shape over the
    // holders (a vertical item keeps the holder's square).
    runs.push(...chipBoxRuns(ctx, lines, centre, item.rotate));
    // A turned or vertical box's ink is its box.
    const ink = vertical || item.rotate ? undefined : inkRects(lines);
    runs.push(textBoxRun(ctx, { rect: placed.rect, name: `ptx ${item.role}`, ...(placed.rotate ? { rotate: placed.rotate } : {}), ...(ink ? { ink } : {}) }, out.xml, vertical ? 'eaVert' : undefined));
    runs.push(...(await inlineDrawingRuns(ctx, out, centre, item.rotate, vertical)));
    if (!vertical) runs.push(...swatchShapeRuns(ctx, lines, centre, item.rotate));
    runs.push(...markRuns(ctx, out, centre, item.rotate));
  }
  return runs;
}
