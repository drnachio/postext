// Figures lined up across the columns of their band
// (`captionStyle.alignAcrossColumns`): the white each one takes so that, at
// the head of the columns, the bottoms of their pictures stand level, and at
// their foot, the first lines of their captions.
import type { VDTDocument } from '../../vdt.js';

/** White added to a floated figure: above it, or under it. */
export interface FloatPad {
  above: number;
  below: number;
}

/**
 * The pads that line up the figures sharing a band of a page across its
 * columns (`captionStyle.alignAcrossColumns`), measured on `doc` as laid out
 * with `current`: at the head of the columns the bottoms of their pictures
 * (the shorter picture takes white above it), at their foot the first lines
 * of their captions (the shorter caption takes white under it). Figures set
 * across several columns, rotated ones, table slices and figures placed by
 * hand (`placement.pin`, which stay where they were dropped) keep their
 * place and are not lined up with.
 */
export function proposeFloatPads(
  doc: VDTDocument,
  current: ReadonlyMap<string, FloatPad>,
  gridPx: number,
): Map<string, FloatPad> {
  const out = new Map<string, FloatPad>();
  const add = (id: string, key: keyof FloatPad, px: number) => {
    if (px < 0.5) return;
    const pad = out.get(id) ?? { above: 0, below: 0 };
    pad[key] = Math.max(pad[key], px);
    out.set(id, pad);
  };
  for (const page of doc.pages) {
    const top = page.contentArea.y;
    const bottom = page.contentArea.y + page.contentArea.height;
    interface Row { id: string; col: number; offset: number }
    /** A head float that reaches down beside the foot band: its caption
     *  starts at `capTop` (absolute, pads taken out), its block ends at
     *  `end`. */
    interface Tall { id: string; col: number; capTop: number; end: number }
    const head: Row[] = [];
    const foot: Row[] = [];
    const lowestHead = new Map<number, Tall>();
    const footCapTop = new Map<string, number>();
    for (const b of page.floats ?? []) {
      const rb = b.resourceBlock;
      if (!rb || rb.rotation || rb.resource.placement?.pin || b.id.includes('-cont-')) continue;
      const col = page.columns[b.columnIndex];
      if (!col || b.bbox.width > col.bbox.width + 1) continue;
      const id = rb.resource.id;
      const pad = current.get(id) ?? { above: 0, below: 0 };
      // Block-relative, the pads this layout gave it taken back out: the
      // picture's foot from the block's top, the caption's extent under it.
      const bodyFoot = rb.bodyRect.y + rb.bodyRect.height;
      const pictureFoot = bodyFoot - pad.above;
      const underPicture = b.bbox.height - pad.below - bodyFoot;
      // A foot band ends within a line and a half of the column's foot (its
      // last caption line sits on the grid).
      if (Math.abs(b.bbox.y - top) <= 2) {
        head.push({ id, col: b.columnIndex, offset: pictureFoot });
        const end = b.bbox.y + b.bbox.height - pad.above - pad.below;
        const prev = lowestHead.get(b.columnIndex);
        if (!prev || end > prev.end) lowestHead.set(b.columnIndex, { id, col: b.columnIndex, capTop: b.bbox.y + pictureFoot, end });
      } else if (bottom - (b.bbox.y + b.bbox.height) <= gridPx * 1.5) {
        foot.push({ id, col: b.columnIndex, offset: underPicture });
        footCapTop.set(id, b.bbox.y + b.bbox.height - pad.below - underPicture);
      }
    }
    // A head float tall enough to stand beside the foot band (a picture
    // filling its column, no text line left under it) lines its caption up
    // with the foot captions: the foot ones rise to it (white under their
    // last line), never the other way, which would push it past the
    // column's foot.
    const footTops = foot.map((r) => footCapTop.get(r.id)!);
    const tall = foot.length === 0 ? [] : [...lowestHead.values()].filter((t) =>
      !foot.some((r) => r.col === t.col) && bottom - t.end <= gridPx * 2 && t.end > Math.min(...footTops));
    if (tall.length > 0 && new Set([...foot.map((r) => r.col), ...tall.map((t) => t.col)]).size >= 2) {
      const target = Math.max(...tall.map((t) => t.capTop));
      if (footTops.every((y) => y >= target - 0.5)) {
        for (const r of foot) add(r.id, 'below', footCapTop.get(r.id)! - target);
        for (const t of tall) {
          if (t.end + target - t.capTop <= bottom + 0.5) add(t.id, 'above', target - t.capTop);
        }
        const joined = new Set(tall.map((t) => t.id));
        for (let i = head.length - 1; i >= 0; i--) if (joined.has(head[i]!.id)) head.splice(i, 1);
        foot.length = 0;
      }
    }
    for (const [rows, key] of [[head, 'above'], [foot, 'below']] as const) {
      if (new Set(rows.map((r) => r.col)).size < 2) continue;
      const target = Math.max(...rows.map((r) => r.offset));
      for (const r of rows) add(r.id, key, target - r.offset);
    }
  }
  return out;
}

export const samePads = (a: ReadonlyMap<string, FloatPad>, b: ReadonlyMap<string, FloatPad>): boolean =>
  a.size === b.size && [...a].every(([id, p]) => {
    const q = b.get(id);
    return q !== undefined && Math.abs(q.above - p.above) < 0.5 && Math.abs(q.below - p.below) < 0.5;
  });

