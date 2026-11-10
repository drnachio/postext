import { describe, expect, it } from 'vitest';
import { buildDocument, type PostextConfig, type Resource, type VDTDocument } from 'postext';
import { citationOf, floatAt, pinFor, slotAt } from './floatDrag.js';

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
});
