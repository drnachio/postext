import type { ResourcePin, VDTDocument } from 'postext';

// ---------------------------------------------------------------------------
// Dragging a float to another slot in the canvas (pure). A figure or table
// the engine floated is picked up by its body; where it is let go names a
// slot — the head or the foot of a text column of a page — which becomes
// its `placement.pin`, counted from the page that first cites it, so the
// choice survives edits above it. A slot before the citation (an earlier
// page, an earlier column of the citing page, or the head of the citing
// column) is refused: a float never lands before its citation.
// ---------------------------------------------------------------------------

type VDTPage = VDTDocument['pages'][number];
type VDTBlock = VDTDocument['blocks'][number];
type BoundingBox = VDTBlock['bbox'];

/** The float under a point of a page: a figure or table the engine
 *  floated, picked up by its body (a picture's image, a table's cells). */
export function floatAt(doc: VDTDocument, pageIndex: number, x: number, y: number): VDTBlock | null {
  const page = doc.pages[pageIndex];
  if (!page || page.flow || page.comic) return null;
  for (const b of page.floats ?? []) {
    const rb = b.resourceBlock;
    if (!rb || rb.rotation) continue;
    const body = rb.bodyRect;
    // `bodyRect` is relative to the block.
    const bx = b.bbox.x + body.x;
    const by = b.bbox.y + body.y;
    if (x >= bx && x <= bx + body.width && y >= by && y <= by + body.height) return b;
  }
  return null;
}

/** Where a float is first cited: the page and column of the first line
 *  that refers to it, and that line's top. */
export function citationOf(doc: VDTDocument, resourceId: string): { pageIndex: number; columnIndex: number; y: number } | null {
  let best: { pageIndex: number; columnIndex: number; y: number } | null = null;
  for (const b of doc.blocks) {
    if (b.pageIndex === undefined) continue;
    for (const l of b.lines) {
      if (!l.segments?.some((s) => s.refResourceId === resourceId)) continue;
      const at = { pageIndex: b.pageIndex, columnIndex: b.columnIndex ?? 0, y: l.bbox.y };
      if (!best || at.pageIndex < best.pageIndex || (at.pageIndex === best.pageIndex && (at.columnIndex < best.columnIndex || (at.columnIndex === best.columnIndex && at.y < best.y)))) best = at;
    }
  }
  return best;
}

/** The text columns of a page in reading order (no spanning band, no side
 *  column). */
function textColumns(page: VDTPage) {
  return page.columns.filter((c) => c.kind !== 'span' && c.kind !== 'side');
}

/** A slot a float may be dropped in. */
export interface DropSlot {
  pageIndex: number;
  /** The text column, counted from 0 in reading order. */
  column: number;
  /** The column's index on the page (`VDTColumn.index`). */
  columnIndex: number;
  slot: 'top' | 'bottom';
  /** The band to highlight, in page px: the slot's end of the column, as
   *  tall as the float. */
  zone: BoundingBox;
}

/** The slot under a point of a page: the text column across it (the
 *  nearest one between columns), its head above the column's middle, its
 *  foot below. `floatHeight` sizes the highlighted band. */
export function slotAt(doc: VDTDocument, pageIndex: number, x: number, y: number, floatHeight: number): DropSlot | null {
  const page = doc.pages[pageIndex];
  if (!page || page.flow || page.comic || page.partInfo) return null;
  const cols = textColumns(page);
  if (cols.length === 0) return null;
  const area = page.contentArea;
  let column = 0;
  let bestDist = Infinity;
  cols.forEach((c, i) => {
    const d = x < c.bbox.x ? c.bbox.x - x : x > c.bbox.x + c.bbox.width ? x - (c.bbox.x + c.bbox.width) : 0;
    if (d < bestDist) { bestDist = d; column = i; }
  });
  const col = cols[column]!;
  const slot = y < area.y + area.height / 2 ? 'top' : 'bottom';
  const h = Math.min(floatHeight, area.height / 2);
  const zone = { x: col.bbox.x, y: slot === 'top' ? area.y : area.y + area.height - h, width: col.bbox.width, height: h };
  return { pageIndex, column, columnIndex: col.index, slot, zone };
}

/** The pin a drop at `slot` makes for the float `resourceId`, or `null`
 *  when the slot comes before its citation (or the float is cited
 *  nowhere the layout shows). */
export function pinFor(doc: VDTDocument, resourceId: string, slot: DropSlot): ResourcePin | null {
  const cite = citationOf(doc, resourceId);
  if (!cite) return null;
  const page = slot.pageIndex - cite.pageIndex;
  if (page < 0) return null;
  if (page === 0) {
    const citeCol = textColumns(doc.pages[cite.pageIndex]!).findIndex((c) => c.index === cite.columnIndex);
    if (slot.column < citeCol) return null;
    if (slot.column === citeCol && slot.slot === 'top') return null;
  }
  return { page, column: slot.column, slot: slot.slot };
}
