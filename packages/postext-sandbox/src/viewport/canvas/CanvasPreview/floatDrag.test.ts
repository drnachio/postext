import { describe, expect, it } from 'vitest';
import { buildDocument, MAX_PIN_PAGE_OFFSET, type PostextConfig, type Resource, type VDTDocument } from 'postext';
import { citationOf, dropVerdict, floatAt, pinFor, slotAt, type DropSlot } from './floatDrag.js';
import { createFloatDragger, zoneStyle } from './floatDragUi.js';
import { armFloatMove } from '../../../editing/floatMove.js';

// Deterministic text measurement stub (no DOM in the node test env).
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config: PostextConfig = {
  page: { dpi: 96, sizePreset: '17x24' },
  layout: { layoutType: 'double' },
  bodyText: { fontSize: pt(10), lineHeight: pt(14) },
  header: { elements: [] },
  footer: { elements: [] },
};
const fig: Resource = {
  id: 'f', typeId: 'figure', kind: 'svg', caption: 'f', createdAt: 0, updatedAt: 0,
  svg: { fileId: 'f.svg', width: 600, height: 260 },
};
const para = (i: number) => `Paragraph ${i} ` + 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(5);
const MD = Array.from({ length: 30 }, (_, i) => (i === 1 ? 'See :ref{id="f"}. ' : '') + para(i)).join('\n\n');
const doc: VDTDocument = buildDocument({ markdown: MD, resources: [fig] }, config);

/** The float `f` on its page. */
const placed = () => {
  for (const page of doc.pages) for (const b of page.floats ?? []) if (b.resourceBlock?.resource.id === 'f') return { page, b };
  throw new Error('not placed');
};

describe('dragging a float in the canvas', () => {
  it('picks a float up by its body, not by its caption or the text', () => {
    const { page, b } = placed();
    const body = b.resourceBlock!.bodyRect;
    const cx = b.bbox.x + body.x + body.width / 2;
    const cy = b.bbox.y + body.y + body.height / 2;
    expect(floatAt(doc, page.index, cx, cy)).toBe(b);
    // The caption under the body.
    expect(floatAt(doc, page.index, cx, b.bbox.y + body.y + body.height + 4)).toBeNull();
  });

  it('finds where the float is cited', () => {
    expect(citationOf(doc, 'f')).toMatchObject({ pageIndex: 0, columnIndex: 0 });
    expect(citationOf(doc, 'nope')).toBeNull();
  });

  it('names the slot under the pointer: the column across it, its head or foot', () => {
    const page = doc.pages[1]!;
    const [c0, c1] = page.columns;
    const a = page.contentArea;
    expect(slotAt(doc, 1, c1!.bbox.x + 10, a.y + a.height - 10, 100)).toMatchObject({ pageIndex: 1, column: 1, slot: 'bottom' });
    expect(slotAt(doc, 1, c0!.bbox.x + 10, a.y + 10, 100)).toMatchObject({ column: 0, slot: 'top' });
    // Between the columns: the nearer one.
    expect(slotAt(doc, 1, c0!.bbox.x + c0!.bbox.width + 1, a.y + 10, 100)?.column).toBe(0);
  });

  it('makes a pin counted from the citing page, and refuses a slot before the citation', () => {
    const a = doc.pages[0]!.contentArea;
    const at = (pageIndex: number, column: number, top: boolean) => {
      const c = doc.pages[pageIndex]!.columns[column]!;
      return slotAt(doc, pageIndex, c.bbox.x + 10, top ? a.y + 10 : a.y + a.height - 10, 100)!;
    };
    expect(pinFor(doc, 'f', at(1, 1, false))).toEqual({ page: 1, column: 1, slot: 'bottom' });
    expect(pinFor(doc, 'f', at(0, 1, true))).toEqual({ page: 0, column: 1, slot: 'top' });
    expect(pinFor(doc, 'f', at(0, 0, false))).toEqual({ page: 0, column: 0, slot: 'bottom' });
    // The head of the citing column is above the citation.
    expect(pinFor(doc, 'f', at(0, 0, true))).toBeNull();
  });

  it('a pin made by a drop puts the float there', () => {
    const c = doc.pages[1]!.columns[1]!;
    const a = doc.pages[1]!.contentArea;
    const pin = pinFor(doc, 'f', slotAt(doc, 1, c.bbox.x + 10, a.y + a.height - 10, 100)!)!;
    const moved = buildDocument({ markdown: MD, resources: [{ ...fig, placement: { pin } }] }, config);
    const b = moved.pages[1]!.floats!.find((x) => x.resourceBlock?.resource.id === 'f')!;
    expect(b.columnIndex).toBe(1);
    expect(a.y + a.height - (b.bbox.y + b.bbox.height)).toBeLessThan(20);
  });

  it('on a page cut into bands, names the band under the pointer, not the page\'s halves', () => {
    // Two columns above a box across the page, two below it.
    const col = (index: number, x: number, y: number, band: number) => ({ index, kind: 'text', band, bbox: { x, y, width: 100, height: 200 }, blocks: [] });
    const page = {
      index: 0, width: 260, height: 520, contentArea: { x: 20, y: 20, width: 220, height: 480 },
      columns: [col(0, 20, 20, 0), col(1, 140, 20, 0), { index: 2, kind: 'span', bbox: { x: 20, y: 225, width: 220, height: 70 }, blocks: [] }, col(3, 20, 300, 1), col(4, 140, 300, 1)],
    };
    const bands = { pages: [page], blocks: [] } as unknown as VDTDocument;
    // Low in the first band: its foot, though the page's middle is below.
    expect(slotAt(bands, 0, 150, 200, 50)).toMatchObject({ column: 1, columnIndex: 1, slot: 'bottom' });
    // High in the second band: its head, in reading order the fourth column.
    expect(slotAt(bands, 0, 150, 310, 50)).toMatchObject({ column: 3, columnIndex: 4, slot: 'top' });
    expect(slotAt(bands, 0, 30, 490, 50)).toMatchObject({ column: 2, columnIndex: 3, slot: 'bottom' });
    // The zone lies at that band's end of the column.
    expect(slotAt(bands, 0, 150, 310, 50)!.zone).toMatchObject({ x: 140, y: 300, height: 50 });
    // Over the box across the page: the nearer band.
    expect(slotAt(bands, 0, 30, 230, 50)).toMatchObject({ column: 0, slot: 'bottom' });
  });

  it('refuses a drop before the citation or further than the engine waits', () => {
    const cite = citationOf(doc, 'f');
    const slot = (pageIndex: number, column: number, top: boolean): DropSlot => ({ pageIndex, column, columnIndex: column, slot: top ? 'top' : 'bottom', zone: { x: 0, y: 0, width: 1, height: 1 } });
    expect(dropVerdict(doc, cite, slot(MAX_PIN_PAGE_OFFSET, 0, true))).toEqual({ pin: { page: MAX_PIN_PAGE_OFFSET, column: 0, slot: 'top' } });
    expect(dropVerdict(doc, cite, slot(MAX_PIN_PAGE_OFFSET + 1, 0, true))).toEqual({ refused: 'tooFar' });
    expect(dropVerdict(doc, cite, slot(0, 0, true))).toEqual({ refused: 'beforeCitation' });
    expect(dropVerdict(doc, { ...cite!, pageIndex: 1 }, slot(0, 1, false))).toEqual({ refused: 'beforeCitation' });
    expect(dropVerdict(doc, null, slot(1, 0, true))).toEqual({ refused: 'uncited' });
    // The citation read once, as a drag does, gives the same pin.
    expect(pinFor(doc, 'f', slot(1, 1, false), cite)).toEqual(pinFor(doc, 'f', slot(1, 1, false)));
  });

  it('takes a press on a float only with Alt held or once armed: any other press stays the page\'s', () => {
    const { page, b } = placed();
    const body = b.resourceBlock!.bodyRect;
    const at = { pageIndex: page.index, x: b.bbox.x + body.x + body.width / 2, y: b.bbox.y + body.y + body.height / 2 };
    const opened: string[] = [];
    const dragger = createFloatDragger({
      docRef: { current: doc },
      resourcesRef: { current: [fig] },
      dispatchRef: { current: () => undefined },
      onClick: (id) => opened.push(id),
    });
    const press = (altKey: boolean) => ({ altKey, clientX: 10, clientY: 10, pointerId: 1 }) as PointerEvent;
    expect(dragger.pointerDown(press(false), at)).toBe(false);
    expect(dragger.over(at, false)).toBe(false);
    expect(dragger.over(at, true)).toBe(true);
    expect(dragger.pointerDown(press(true), at)).toBe(true);
    // Let go where it was pressed: the resource opens, no pin is made.
    expect(dragger.up(press(true), false)).toBe(false);
    expect(opened).toEqual(['f']);
    // Armed from the Resources panel (a finger has no Alt key).
    armFloatMove('other');
    expect(dragger.pointerDown(press(false), at)).toBe(false);
    armFloatMove('f');
    expect(dragger.pointerDown(press(false), at)).toBe(true);
    dragger.up(press(false), true);
    armFloatMove(null);
  });

  it('colours its drop zone from the theme', () => {
    expect(zoneStyle({ pin: { page: 0, slot: 'top' } })).toMatchObject({ border: '2px solid var(--brand)', background: 'var(--brand-soft)' });
    expect(zoneStyle({ refused: 'tooFar' })).toMatchObject({ border: '2px dashed var(--slate)', color: 'var(--slate)' });
  });
});
