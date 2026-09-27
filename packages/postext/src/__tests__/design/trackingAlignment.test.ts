import { describe, it, expect } from 'vitest';
import { layoutSlotToVdt } from '../../pipeline/headerFooter';
import { resolveDesignSlot } from '../../defaults/headerFooter';
import type { DesignPlaceholderContext } from '../../design/placeholders';
import type { AnchorEdge, DesignElement, DesignTextAlign, ElementSize } from '../../types';
import type { VDTDesignSlot, VDTDesignTextBlock, VDTPage } from '../../vdt';

// Deterministic text measurement stub (no DOM in the node test env): every
// character advances 7 px.
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
const stubPage = { index: 0, pageLabel: '1' } as unknown as VDTPage;
const placeholders: DesignPlaceholderContext = {
  kind: 'header', page: stubPage, allPages: [stubPage], metadata: {}, chapterTitleByPageIndex: [],
};
const container = { x: 0, y: 0, width: 300, height: 100 };

function lay(elements: DesignElement[]): VDTDesignSlot {
  return layoutSlotToVdt(resolveDesignSlot({ elements }), container, 0, placeholders, DPI)!;
}

function title(align: DesignTextAlign, tracking: number, edge: AnchorEdge = 'top', width: ElementSize = 'fill', content = 'DORÉ'): DesignElement {
  return {
    kind: 'text', id: 't', content, fontSize: pt(10), letterSpacing: pt(tracking), align, overflow: 'wrap',
    placement: { anchor: { to: 'container', edge }, size: { width, height: 'auto' } },
  } as DesignElement;
}

/** Where the ink of the line starts and ends: its advance less the tracking
 *  after the last glyph. */
function ink(block: VDTDesignTextBlock, tracking: number): [number, number] {
  const line = block.lines[0]!;
  const start = block.bbox.x + line.xOffset;
  return [start, start + line.width - tracking];
}

describe('design text alignment and the tracking after the last glyph (EF-153)', () => {
  it('centres the ink of a tracked line, not its advance', () => {
    const block = lay([title('center', 8)]).blocks[0] as VDTDesignTextBlock;
    // 4 glyphs of 7 px, 8 px after each: 60 px of advance, 52 px of ink.
    expect(block.lines[0]!.width).toBe(60);
    const [a, b] = ink(block, 8);
    expect((a + b) / 2).toBeCloseTo(150, 6);
  });

  it('sets a right-aligned tracked line flush with the edge', () => {
    const block = lay([title('right', 8)]).blocks[0] as VDTDesignTextBlock;
    expect(ink(block, 8)[1]).toBeCloseTo(300, 6);
  });

  it('leaves a left-aligned line where it was', () => {
    const block = lay([title('left', 8)]).blocks[0] as VDTDesignTextBlock;
    expect(ink(block, 8)[0]).toBe(0);
  });

  it('centres negative tracking the same way', () => {
    const block = lay([title('center', -2)]).blocks[0] as VDTDesignTextBlock;
    const [a, b] = ink(block, -2);
    expect((a + b) / 2).toBeCloseTo(150, 6);
  });

  it('shrink-wraps an auto-width element to the ink', () => {
    // Anchored at the top centre, the box is centred on the container.
    const centred = lay([title('center', 8, 'top', 'auto')]).blocks[0] as VDTDesignTextBlock;
    expect(centred.bbox.width).toBe(52);
    const [a, b] = ink(centred, 8);
    expect(a).toBeCloseTo(centred.bbox.x, 6);
    expect((a + b) / 2).toBeCloseTo(150, 6);
    // Anchored at the top right, the ink ends at the container's edge.
    const right = lay([title('right', 8, 'top-right', 'auto')]).blocks[0] as VDTDesignTextBlock;
    expect(ink(right, 8)[1]).toBeCloseTo(300, 6);
  });

  it('chains an element right of a tracked one from the end of its ink', () => {
    const slot = lay([
      title('left', 8, 'top-left', 'auto'),
      { kind: 'text', id: 'next', content: 'X', fontSize: pt(10), align: 'left', overflow: 'clip', placement: { anchor: { to: '#t', edge: 'right-of' }, offset: { x: pt(4) } } } as DesignElement,
    ]);
    const next = slot.blocks[1] as VDTDesignTextBlock;
    expect(next.bbox.x).toBeCloseTo(52 + 4, 6);
  });

  it('does not change untracked text', () => {
    const block = lay([title('center', 0)]).blocks[0] as VDTDesignTextBlock;
    expect(block.lines[0]!.xOffset).toBe((300 - 28) / 2);
  });

  it('stretches a justified tracked line until its ink, not its advance, reaches the edge', () => {
    const content = 'Long before there were title pages there were readers who marked the scrolls by hand.';
    for (const tracking of [2, -1]) {
      const block = lay([{
        kind: 'text', id: 'j', content, fontSize: pt(10), letterSpacing: pt(tracking), align: 'justify', overflow: 'wrap',
        placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(200) } },
      } as DesignElement]).blocks[0] as VDTDesignTextBlock;
      expect(block.lines.length).toBeGreaterThan(2);
      for (const line of block.lines.slice(0, -1)) {
        expect(line.xOffset + line.width - tracking).toBeCloseTo(200, 6);
      }
      // The last line is set flush left, at its natural width.
      const last = block.lines[block.lines.length - 1]!;
      expect(last.width).toBeLessThan(200);
    }
  });
});
