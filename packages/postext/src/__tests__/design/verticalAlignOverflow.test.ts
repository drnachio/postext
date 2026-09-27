import { describe, it, expect } from 'vitest';
import { layoutSlotToVdt } from '../../pipeline/headerFooter';
import { resolveDesignSlot } from '../../defaults/headerFooter';
import type { DesignPlaceholderContext } from '../../design/placeholders';
import type { DesignElement, VAlign } from '../../types';
import type { VDTDesignTextBlock, VDTPage } from '../../vdt';

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
const stubPage = { index: 0, pageLabel: '1' } as unknown as VDTPage;
const placeholders: DesignPlaceholderContext = {
  kind: 'header', page: stubPage, allPages: [stubPage], metadata: {}, chapterTitleByPageIndex: [],
};

/** A 100 pt '6' in a box `height` tall, with `lineHeight` and `verticalAlign`. */
function numeral(verticalAlign: VAlign, lineHeight: number, height = 60): VDTDesignTextBlock {
  const el = {
    kind: 'text', id: 'n', content: '6', fontSize: pt(100), lineHeight, verticalAlign, align: 'right', overflow: 'clip',
    placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { y: pt(20) }, size: { width: pt(80), height: pt(height) } },
  } as DesignElement;
  const slot = layoutSlotToVdt(resolveDesignSlot({ elements: [el] }), { x: 0, y: 0, width: 300, height: 200 }, 0, placeholders, DPI);
  return slot!.blocks[0] as VDTDesignTextBlock;
}

describe('design text vertical alignment when the line is taller than its box (EF-138)', () => {
  it('bottom: the foot of the line box sits on the foot of the box, whatever the leading', () => {
    // Box from y 20 to 80. The baseline sits 0.8 of the line box down, so it
    // lies 0.2 of the line above the box's foot.
    for (const lh of [0.5, 0.8, 0.9, 1, 1.2]) {
      const line = numeral('bottom', lh).lines[0]!;
      expect(line.baselineY).toBeCloseTo(80 - 0.2 * 100 * lh, 6);
    }
  });

  it('middle: the line box is centred on the box, overflowing both ways', () => {
    for (const lh of [0.5, 1.2]) {
      const line = numeral('middle', lh).lines[0]!;
      const top = 20 + (60 - 100 * lh) / 2;
      expect(line.baselineY).toBeCloseTo(top + 0.8 * 100 * lh, 6);
    }
  });

  it('top: the line hangs from the top of the box', () => {
    const line = numeral('top', 1.2).lines[0]!;
    expect(line.baselineY).toBeCloseTo(20 + 0.8 * 120, 6);
  });

  it('keeps a drop cap on the baseline of the lines it spans, wherever the alignment moves them', () => {
    for (const [verticalAlign, height] of [['bottom', 20], ['middle', 20], ['middle', 120], ['bottom', 120]] as const) {
      const el = {
        kind: 'text', id: 'p', content: 'Once upon a time there was a long paragraph of words.', fontSize: pt(10), lineHeight: 1.2,
        verticalAlign, align: 'left', overflow: 'wrap', dropCap: { lines: 2 },
        placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(120), height: pt(height) } },
      } as DesignElement;
      const slot = layoutSlotToVdt(resolveDesignSlot({ elements: [el] }), { x: 0, y: 0, width: 300, height: 200 }, 0, placeholders, DPI)!;
      const [text, cap] = slot.blocks as VDTDesignTextBlock[];
      expect(cap!.lines[0]!.baselineY).toBeCloseTo(text!.lines[1]!.baselineY, 6);
    }
  });

  it('a line shorter than its box is placed as before', () => {
    expect(numeral('bottom', 0.5, 90).lines[0]!.baselineY).toBeCloseTo(20 + 90 - 50 + 40, 6);
    expect(numeral('middle', 0.5, 90).lines[0]!.baselineY).toBeCloseTo(20 + 20 + 40, 6);
  });
});
