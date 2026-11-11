// Figures lined up across the columns of their band
// (`layout.alignFloatsAcrossColumns`): the white each one takes so that, at
// the head of the columns, the bottoms of their pictures stand level, and at
// their foot, the first lines of their captions. A pass places the figures
// with the white of the pads it is given (`PassHints.floatPads`); the pads
// are read off a laid-out pass, from the slot each figure took in it
// (`PassResult.floatSlots`), and read again after the last pass the driver
// keeps (balanced.ts): a pad no longer borne out by the layout is dropped.
import type { VDTDocument } from '../../vdt.js';
import type { FloatSlotPosition } from '../floats/floatSlots.js';

/** White added to a floated figure on one page: above its picture (a head
 *  band), under its caption (a foot band). A pass gives the figure the
 *  white only when it sets it on that page. */
export interface FloatPad {
  page: number;
  above: number;
  below: number;
}

/** The slot a pass set a one-column figure in: its page, its column, and
 *  the head or the foot of it. */
export interface PlacedSlot {
  page: number;
  column: number;
  position: FloatSlotPosition;
}

/** Most rounds the driver places again to line figures up, at the start
 *  and again after the last pass. */
export const MAX_FLOAT_PAD_ROUNDS = 2;

/**
 * The pads that line up the figures sharing a band of a page across its
 * columns, measured on `doc` as laid out with `current` and with the slots
 * of `slots`: at the head of the columns the bottoms of their pictures (the
 * shorter picture takes white above it), at their foot the first lines of
 * their captions (the shorter caption takes white under it). A picture that
 * fills its column from the head, with no text under it, lines its caption
 * up with the foot captions beside it. Only figures the pass set alone in a
 * column are lined up: across several columns, rotated, beside a side
 * caption, a table slice and a figure placed by hand (`placement.pin`) keep
 * their place and are not lined up with.
 */
export function proposeFloatPads(
  doc: VDTDocument,
  slots: ReadonlyMap<string, PlacedSlot>,
  current: ReadonlyMap<string, FloatPad>,
): Map<string, FloatPad> {
  const out = new Map<string, FloatPad>();
  const gridPx = doc.baselineGrid;
  const add = (id: string, page: number, key: 'above' | 'below', px: number) => {
    if (px < 0.5) return;
    const pad = out.get(id) ?? { page, above: 0, below: 0 };
    pad[key] = Math.max(pad[key], px);
    out.set(id, pad);
  };
  for (const page of doc.pages) {
    const bottom = page.contentArea.y + page.contentArea.height;
    interface Row { id: string; col: number; band: number; offset: number }
    /** A head figure that reaches down beside the foot band: its caption
     *  starts at `capTop` (absolute, pads taken out), its block ends at
     *  `end`. */
    interface Tall { id: string; col: number; band: number; capTop: number; end: number }
    const head: Row[] = [];
    const foot: Row[] = [];
    const lowestHead = new Map<number, Tall>();
    const footCapTop = new Map<string, number>();
    for (const b of page.floats ?? []) {
      const rb = b.resourceBlock;
      const id = rb?.resource.id;
      const slot = id !== undefined ? slots.get(id) : undefined;
      if (!rb || !slot || slot.page !== page.index || rb.rotation || rb.resource.placement?.pin || b.id.includes('-cont-')) continue;
      const col = page.columns[slot.column];
      if (!col) continue;
      const band = col.band ?? 0;
      const applied = current.get(rb.resource.id);
      const pad = applied?.page === page.index ? applied : { above: 0, below: 0 };
      // Block-relative, the pads this layout gave it taken back out: the
      // picture's foot from the block's top, the caption's extent under it.
      const bodyFoot = rb.bodyRect.y + rb.bodyRect.height;
      const pictureFoot = bodyFoot - pad.above;
      const underPicture = b.bbox.height - pad.below - bodyFoot;
      if (slot.position === 'top') {
        head.push({ id: rb.resource.id, col: slot.column, band, offset: pictureFoot });
        const end = b.bbox.y + b.bbox.height - pad.above - pad.below;
        const prev = lowestHead.get(slot.column);
        if (!prev || end > prev.end) lowestHead.set(slot.column, { id: rb.resource.id, col: slot.column, band, capTop: b.bbox.y + pictureFoot, end });
      } else {
        foot.push({ id: rb.resource.id, col: slot.column, band, offset: underPicture });
        // The block stands on the column's foot: without its white, its
        // caption would start that much lower.
        footCapTop.set(rb.resource.id, b.bbox.y + b.bbox.height - underPicture);
      }
    }
    for (const band of new Set([...head, ...foot].map((r) => r.band))) {
      const heads = head.filter((r) => r.band === band);
      const feet = foot.filter((r) => r.band === band);
      // A head figure tall enough to stand beside the foot band (a picture
      // filling its column, no more than two lines left under it) lines its
      // caption up with the foot captions: the foot ones rise to it (white
      // under their last line), never the other way, which would push it
      // past the column's foot.
      const footTops = feet.map((r) => footCapTop.get(r.id)!);
      const tall = feet.length === 0 ? [] : [...lowestHead.values()].filter((t) =>
        t.band === band && !feet.some((r) => r.col === t.col) && bottom - t.end <= gridPx * 2 && t.end > Math.min(...footTops));
      if (tall.length > 0 && new Set([...feet.map((r) => r.col), ...tall.map((t) => t.col)]).size >= 2) {
        const target = Math.max(...tall.map((t) => t.capTop));
        if (footTops.every((y) => y >= target - 0.5)) {
          for (const r of feet) add(r.id, page.index, 'below', footCapTop.get(r.id)! - target);
          for (const t of tall) {
            if (t.end + target - t.capTop <= bottom + 0.5) add(t.id, page.index, 'above', target - t.capTop);
          }
          const joined = new Set(tall.map((t) => t.id));
          for (let i = heads.length - 1; i >= 0; i--) if (joined.has(heads[i]!.id)) heads.splice(i, 1);
          feet.length = 0;
        }
      }
      for (const [rows, key] of [[heads, 'above'], [feet, 'below']] as const) {
        if (new Set(rows.map((r) => r.col)).size < 2) continue;
        const target = Math.max(...rows.map((r) => r.offset));
        for (const r of rows) add(r.id, page.index, key, target - r.offset);
      }
    }
  }
  return out;
}

/** Whether two sets of pads give every figure the same white on the same
 *  page (to half a px). */
export const samePads = (a: ReadonlyMap<string, FloatPad>, b: ReadonlyMap<string, FloatPad>): boolean =>
  a.size === b.size && [...a].every(([id, p]) => {
    const q = b.get(id);
    return q !== undefined && q.page === p.page && Math.abs(q.above - p.above) < 0.5 && Math.abs(q.below - p.below) < 0.5;
  });
