import { describe, it, expect } from 'vitest';
import { layoutDesignSlot } from '../../design/layout';
import { resolveDesignSlot } from '../../defaults/headerFooter';
import { layoutSlotToVdt } from '../../pipeline/headerFooter';
import type { DesignPlaceholderContext } from '../../design/placeholders';
import type { DesignElement, ElementAnchor } from '../../types';
import type { VDTPage } from '../../vdt';

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

const DPI = 72; // 1pt = 1px keeps the arithmetic readable.
const pt = (value: number) => ({ value, unit: 'pt' as const });
const container = { x: 0, y: 0, width: 300, height: 200 };
const stubPage = { index: 0, pageLabel: '1' } as unknown as VDTPage;
const placeholders: DesignPlaceholderContext = {
  kind: 'header',
  page: stubPage,
  allPages: [stubPage],
  metadata: {},
  chapterTitleByPageIndex: [],
};

const box = (id: string, anchor: ElementAnchor): DesignElement => ({
  kind: 'box',
  id,
  placement: { anchor, size: { width: pt(40), height: pt(20) } },
  style: { backgroundColor: { hex: '#ff0000', model: 'hex' } },
});
const text = (id: string, content: string, anchor: ElementAnchor, dropCap = false): DesignElement => ({
  kind: 'text',
  id,
  content,
  fontSize: pt(10),
  overflow: 'wrap',
  placement: { anchor, size: { width: pt(60) } },
  ...(dropCap ? { dropCap: { lines: 2 } } : {}),
} as DesignElement);

const layout = (elements: DesignElement[]) =>
  layoutDesignSlot(resolveDesignSlot({ elements }), { container, dpi: DPI, placeholders }, 0);

describe('design slot paint order', () => {
  it('paints in array order even when an earlier element anchors to a later one', () => {
    const { primitives, issues } = layout([
      box('bg', { to: '#ttl', edge: 'top-left' }),
      text('ttl', 'Title', { to: 'container', edge: 'top-left' }),
    ]);
    expect(issues).toEqual([]);
    expect(primitives.map((p) => p.id)).toEqual(['bg', 'ttl']);
    // Geometry still resolves against the (later) anchor target.
    const ttl = primitives[1]!;
    expect(primitives[0]!.x).toBe(ttl.x);
    expect(primitives[0]!.y).toBe(ttl.y);
  });

  it('keeps chains in array order and a multi-primitive text grouped at its index', () => {
    const { primitives } = layout([
      box('back', { to: '#mid', edge: 'bottom-left' }),
      text('ttl', 'Drop cap body text that wraps over lines', { to: 'container', edge: 'top-left' }, true),
      box('mid', { to: '#ttl', edge: 'top-right' }),
      box('front', { to: 'container', edge: 'top-right' }),
    ]);
    const ids = primitives.map((p) => p.id);
    expect(ids.filter((id) => id.startsWith('ttl')).length).toBeGreaterThan(1);
    expect(ids[0]).toBe('back');
    expect(ids.slice(-2)).toEqual(['mid', 'front']);
    expect(ids.slice(1, -2).every((id) => id.startsWith('ttl'))).toBe(true);
  });

  it('hands the renderers (canvas, PDF, HTML walk slot.blocks) the array order', () => {
    const slot = layoutSlotToVdt(
      resolveDesignSlot({ elements: [box('bg', { to: '#ttl', edge: 'top-left' }), text('ttl', 'Title', { to: 'container', edge: 'top-left' })] }),
      container, 0, placeholders, DPI,
    );
    expect(slot!.blocks.map((b) => b.kind)).toEqual(['box', 'text']);
  });
});
