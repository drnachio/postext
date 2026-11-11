import { MAX_PIN_PAGE_OFFSET, type ResourcePin, type VDTDocument } from 'postext';

// ---------------------------------------------------------------------------
// Dragging a float to another slot in the canvas (pure). A figure or table
// the engine floated is picked up by its body (with Alt / Option held, or
// once «Move in the canvas» armed it); where it is let go names a slot — the
// head or the foot of a text column of a page — which becomes its
// `placement.pin`, counted from the page that first cites it. A slot before
// the citation (an earlier page, an earlier column of the citing page, or
// the head of the citing column) is refused, and so is one more than
// `MAX_PIN_PAGE_OFFSET` pages after it: the engine waits no longer.
// ---------------------------------------------------------------------------

type VDTPage = VDTDocument['pages'][number];
type VDTBlock = VDTDocument['blocks'][number];
type VDTColumn = VDTPage['columns'][number];
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

/** Where a float is first cited: its page, the column (`VDTColumn.index`)
 *  of the first line that refers to it, and that line's top. Read once
 *  when a drag starts. */
export interface Citation {
  pageIndex: number;
  columnIndex: number;
  y: number;
}

export function citationOf(doc: VDTDocument, resourceId: string): Citation | null {
  let best: Citation | null = null;
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
 *  column), every band of the page included: the order a pin's `column`
 *  counts in. */
function textColumns(page: VDTPage): VDTColumn[] {
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

/** Distance from `v` to the range `[from, to]` (0 inside it). */
const distance = (v: number, from: number, to: number): number => (v < from ? from - v : v > to ? v - to : 0);

/** The slot under a point of a page. The band of columns under the
 *  pointer comes first — a page cut by a box or a heading across it has
 *  several, one above the other (`VDTColumn.band`) — then, in it, the
 *  column across the pointer (the nearer one between columns); the head
 *  when the pointer is above the band's middle, the foot below. A band's
 *  extent is that of all its columns together, since a float already set
 *  shortens its column's box. `floatHeight` sizes the highlighted band. */
export function slotAt(doc: VDTDocument, pageIndex: number, x: number, y: number, floatHeight: number): DropSlot | null {
  const page = doc.pages[pageIndex];
  if (!page || page.flow || page.comic || page.partInfo) return null;
  const cols = textColumns(page);
  if (cols.length === 0) return null;
  const bands = new Map<number, { cols: VDTColumn[]; top: number; bottom: number }>();
  for (const c of cols) {
    const key = c.band ?? 0;
    const b = bands.get(key);
    if (b) {
      b.cols.push(c);
      b.top = Math.min(b.top, c.bbox.y);
      b.bottom = Math.max(b.bottom, c.bbox.y + c.bbox.height);
    } else bands.set(key, { cols: [c], top: c.bbox.y, bottom: c.bbox.y + c.bbox.height });
  }
  let band = [...bands.values()][0]!;
  for (const b of bands.values()) if (distance(y, b.top, b.bottom) < distance(y, band.top, band.bottom)) band = b;
  let col = band.cols[0]!;
  for (const c of band.cols) if (distance(x, c.bbox.x, c.bbox.x + c.bbox.width) < distance(x, col.bbox.x, col.bbox.x + col.bbox.width)) col = c;
  const column = cols.indexOf(col);
  const slot = y < (band.top + band.bottom) / 2 ? 'top' : 'bottom';
  const h = Math.max(4, Math.min(floatHeight, (band.bottom - band.top) / 2));
  const zone = { x: col.bbox.x, y: slot === 'top' ? band.top : band.bottom - h, width: col.bbox.width, height: h };
  return { pageIndex, column, columnIndex: col.index, slot, zone };
}

/** What a drop at a slot does: the pin it makes, or why it is refused —
 *  `'beforeCitation'` (the slot comes before the float's citation in
 *  reading order), `'tooFar'` (more than `MAX_PIN_PAGE_OFFSET` pages after
 *  the citing one) or `'uncited'` (no line the layout shows cites it). */
export type DropVerdict = { pin: ResourcePin } | { refused: 'beforeCitation' | 'tooFar' | 'uncited' };

export function dropVerdict(doc: VDTDocument, cite: Citation | null, slot: DropSlot): DropVerdict {
  if (!cite) return { refused: 'uncited' };
  const page = slot.pageIndex - cite.pageIndex;
  if (page < 0) return { refused: 'beforeCitation' };
  if (page > MAX_PIN_PAGE_OFFSET) return { refused: 'tooFar' };
  if (page === 0) {
    const citeCol = textColumns(doc.pages[cite.pageIndex]!).findIndex((c) => c.index === cite.columnIndex);
    if (slot.column < citeCol) return { refused: 'beforeCitation' };
    if (slot.column === citeCol && slot.slot === 'top') return { refused: 'beforeCitation' };
  }
  return { pin: { page, column: slot.column, slot: slot.slot } };
}

/** The pin a drop at `slot` makes for the float `resourceId`, or `null`
 *  when the drop is refused (see {@link dropVerdict}). */
export function pinFor(doc: VDTDocument, resourceId: string, slot: DropSlot, cite: Citation | null = citationOf(doc, resourceId)): ResourcePin | null {
  const v = dropVerdict(doc, cite, slot);
  return 'pin' in v ? v.pin : null;
}
