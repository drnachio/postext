// The frames items are laid out in and how they land on the sheet: a
// right-to-left page's mirror, a vertical page's quarter turn, a turned
// resource block, a box printed upside down. Each is an axis-aligned
// affine map (quarter turns and reflections); text, pictures and tables
// are placed through it unmirrored, as the PDF turns every glyph run and
// picture back about its own box (#1388).
import type { VDTPage } from '../../vdt/pages.js';
import type { VDTResourceRotation } from '../../vdt/resources.js';
import type { VDTPathCommand } from '../../vdt/design.js';
import type { DisplayItem, DisplayRect } from './types.js';

/** `x' = a·x + c·y + e`, `y' = b·x + d·y + f`. */
export type Frame = readonly [a: number, b: number, c: number, d: number, e: number, f: number];

export const IDENTITY: Frame = [1, 0, 0, 1, 0, 0];

export function isIdentity(m: Frame): boolean {
  return m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0;
}

/** `m` after `n`: a point goes through `n` first. */
export function compose(m: Frame, n: Frame): Frame {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function apply(m: Frame, x: number, y: number): { x: number; y: number } {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

export function mapRect(m: Frame, r: DisplayRect): DisplayRect {
  if (isIdentity(m)) return { x: r.x, y: r.y, width: r.width, height: r.height };
  const a = apply(m, r.x, r.y);
  const b = apply(m, r.x + r.width, r.y + r.height);
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

/** A quarter turn as a resource rotation describes it (`resourceBlockToPage`). */
export function rotationFrame(r: VDTResourceRotation): Frame {
  return r.direction === 'ccw' ? [0, -1, 1, 0, r.originX, r.originY] : [0, 1, -1, 0, r.originX, r.originY];
}

/** The frame a page's flow is laid out in (`flowToPage`). */
export function flowFrame(page: Pick<VDTPage, 'flow'>): Frame {
  const flow = page.flow;
  if (!flow) return IDENTITY;
  if (flow.writingMode === 'horizontal-tb') return [-1, 0, 0, 1, flow.mirror.originX, 0];
  return rotationFrame(flow.rotation);
}

/** A box printed upside down about `(cx, cy)` (`VDTBlock.turn`). */
export function turnFrame(cx: number, cy: number): Frame {
  return [-1, 0, 0, -1, 2 * cx, 2 * cy];
}

/** How an item set in frame `m` stands on the sheet: its reading
 *  direction turned by `rotate` degrees clockwise, and the map from a
 *  point of the sheet into the item's own unturned frame about the
 *  centre of its box on the sheet. `flip`: the frame mirrors, so a run's
 *  reading start is at its local right end. */
interface Placement {
  flip: boolean;
  rotate: number;
  /** Sheet point → unturned item frame. */
  unturn: (x: number, y: number) => { x: number; y: number };
  /** The item's box in its unturned frame. */
  box: DisplayRect;
}

function placement(m: Frame, localBox: DisplayRect): Placement {
  const flip = m[0] * m[3] - m[1] * m[2] < 0;
  // The orientation glyphs keep: the frame, turned back about each run
  // when it mirrors (x negated in the local frame first).
  const a = flip ? -m[0] : m[0];
  const b = flip ? -m[1] : m[1];
  const c = m[2];
  const d = m[3];
  const rotate = Math.round((Math.atan2(b, a) * 180) / Math.PI);
  // Where the box's centre lands, and the box about it in the item's
  // unturned frame (scaled as the frame scales, a composed frame's text).
  const centre = apply(m, localBox.x + localBox.width / 2, localBox.y + localBox.height / 2);
  const cx = centre.x;
  const cy = centre.y;
  const k2 = Math.abs(m[0] * m[3] - m[1] * m[2]) || 1;
  // Inverse of the orientation (a rotation: its transpose).
  const unturn = (x: number, y: number) => {
    const dx = x - cx;
    const dy = y - cy;
    return { x: cx + (a * dx + b * dy) / k2, y: cy + (c * dx + d * dy) / k2 };
  };
  const w = localBox.width;
  const h = localBox.height;
  return { flip, rotate, unturn, box: { x: cx - w / 2, y: cy - h / 2, width: w, height: h } };
}

/** The sum of two clockwise angles, in (-180, 180]. */
function addAngles(a: number | undefined, b: number): number | undefined {
  let r = ((a ?? 0) + b) % 360;
  if (r > 180) r -= 360;
  if (r <= -180) r += 360;
  return r === 0 ? undefined : r;
}

type TextItem = Extract<DisplayItem, { kind: 'text' }>;

/** A text item laid out in frame `m`, placed on the sheet: runs and lines
 *  read as written, turned with the frame (`rotate`) about the centre of
 *  the item's box. */
export function placeText(m: Frame, item: TextItem): TextItem {
  if (isIdentity(m)) return item;
  return placeTextWith(m, placement(m, item.bbox), item, true);
}

/** {@link placeText} into the unturned frame `p` (its own, or that of the
 *  table it is a cell of, whose turn it shares: `own` false). */
function placeTextWith(m: Frame, p: Placement, item: TextItem, own: boolean): TextItem {
  const lines = item.lines.map((line) => {
    const start = apply(m, p.flip ? line.x + line.width : line.x, line.baseline);
    const at = p.unturn(start.x, start.y);
    const runs = line.runs.map((run) => {
      const s = apply(m, p.flip ? run.x + run.width : run.x, line.baseline);
      const x = p.unturn(s.x, s.y).x;
      const box = run.inline?.box;
      if (!box) return { ...run, x };
      // A chip's box is a rect of the flow frame, off its first run's
      // start (the segment's left edge): mapped as a rect, so a mirror
      // lays it over the whole segment, not beside the first run.
      const a = apply(m, run.x + box.dx, line.baseline);
      const b = apply(m, run.x + box.dx + box.width, line.baseline);
      const dx = Math.min(p.unturn(a.x, a.y).x, p.unturn(b.x, b.y).x) - x;
      return { ...run, x, inline: { ...run.inline!, box: { ...box, dx } } };
    });
    // A mirrored line is ragged on the other side of the sheet: its
    // alignment is told as it stands there, as its runs are.
    const align = p.flip && line.align === 'left' ? 'right' as const : p.flip && line.align === 'right' ? 'left' as const : line.align;
    return { ...line, x: at.x, baseline: at.y, runs, align };
  });
  const out: TextItem = { ...item, bbox: own ? p.box : unturnedRect(m, p, item.bbox), lines };
  const rotate = own ? addAngles(item.rotate, p.rotate) : undefined;
  if (rotate === undefined) delete out.rotate;
  else out.rotate = rotate;
  if (item.clip) out.clip = unturnedRect(m, p, item.clip);
  return out;
}

function unturnedRect(m: Frame, p: Placement, r: DisplayRect): DisplayRect {
  const s = apply(m, r.x, r.y);
  const t = apply(m, r.x + r.width, r.y + r.height);
  const a = p.unturn(s.x, s.y);
  const b = p.unturn(t.x, t.y);
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

type ImageItem = Extract<DisplayItem, { kind: 'image' }>;
type TableItem = Extract<DisplayItem, { kind: 'table' }>;

/** A picture laid out in frame `m`: its unturned box and the turn it
 *  takes, never mirrored. */
export function placeImage(m: Frame, item: ImageItem): ImageItem {
  if (isIdentity(m)) return item;
  const p = placement(m, item.rect);
  const out: ImageItem = { ...item, rect: p.box };
  const rotate = addAngles(item.rotate, p.rotate);
  if (rotate === undefined) delete out.rotate;
  else out.rotate = rotate;
  return out;
}

/** A table laid out in frame `m`: its cells in its unturned frame (a
 *  mirrored table keeps its mirrored column order, as the PDF paints its
 *  grid), its text placed as any text item. */
export function placeTable(m: Frame, item: TableItem): TableItem {
  if (isIdentity(m)) return item;
  const p = placement(m, item.rect);
  const rel = (r: DisplayRect) => unturnedRect(m, p, r);
  const cells = item.cells.map((cell) => {
    const rect = rel(cell.rect);
    // A cell's text turns with the table, in the table's frame.
    const text = cell.item ? placeTextWith(m, p, cell.item, false) : null;
    const placed: TableItem['cells'][number] = { ...cell, rect, item: text };
    if (cell.image) {
      const img = { ...cell.image, rect: rel(cell.image.rect) };
      delete img.rotate;
      placed.image = img;
    }
    return placed;
  });
  const xs = new Set<number>();
  const ys = new Set<number>();
  for (const cell of cells) {
    xs.add(cell.rect.x - p.box.x);
    xs.add(cell.rect.x + cell.rect.width - p.box.x);
    ys.add(cell.rect.y - p.box.y);
    ys.add(cell.rect.y + cell.rect.height - p.box.y);
  }
  const out: TableItem = {
    ...item,
    rect: p.box,
    cells,
    columnEdges: [...xs].sort((u, v) => u - v),
    rowEdges: [...ys].sort((u, v) => u - v),
  };
  const rotate = addAngles(item.rotate, p.rotate);
  if (rotate === undefined) delete out.rotate;
  else out.rotate = rotate;
  return out;
}

/** A rule, a rect or a path laid out in frame `m`: mapped as geometry
 *  (decoration mirrors with the page, as the PDF paints it). */
export function placeShape<T extends Extract<DisplayItem, { kind: 'rule' | 'rect' | 'path' }>>(m: Frame, item: T): T {
  if (isIdentity(m)) return item;
  if (item.kind === 'rule') {
    const a = apply(m, item.x1, item.y1);
    const b = apply(m, item.x2, item.y2);
    return { ...item, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  }
  if (item.kind === 'rect') {
    const p = placement(m, item.rect);
    // A box turned off the quarter turns keeps its shape, turned.
    if (p.rotate % 90 === 0) return { ...item, rect: mapRect(m, item.rect) };
    const rotate = addAngles(item.rotate, p.rotate);
    return { ...item, rect: p.box, ...(rotate !== undefined ? { rotate } : {}) };
  }
  const subpaths = item.subpaths.map((sp) => sp.map((cmd): VDTPathCommand => {
    if (cmd.op === 'Z') return cmd;
    const to = apply(m, cmd.x, cmd.y);
    switch (cmd.op) {
      case 'Q': {
        const c1 = apply(m, cmd.x1, cmd.y1);
        return { op: 'Q', x1: c1.x, y1: c1.y, x: to.x, y: to.y };
      }
      case 'C': {
        const c1 = apply(m, cmd.x1, cmd.y1);
        const c2 = apply(m, cmd.x2, cmd.y2);
        return { op: 'C', x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y, x: to.x, y: to.y };
      }
      default:
        return { op: cmd.op, x: to.x, y: to.y };
    }
  }));
  return { ...item, bbox: mapRect(m, item.bbox), subpaths };
}

/** Any item laid out in frame `m`, placed on the sheet. */
export function placeItem(m: Frame, item: DisplayItem): DisplayItem {
  switch (item.kind) {
    case 'text': return placeText(m, item);
    case 'image': return placeImage(m, item);
    case 'table': return placeTable(m, item);
    default: return placeShape(m, item);
  }
}
