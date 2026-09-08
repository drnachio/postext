import { describe, it, expect } from 'vitest';
import { measureRichBlock } from '../measure/rich';
import type { InlineSpan } from '../parse';

// Deterministic widths: 7px per character, whatever the font.
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

const FONT = '16px Test';
const spans: InlineSpan[] = [{ text: 'alfa beta gamma', bold: false, italic: false }];

function widths(letterSpacingPx?: number) {
  const block = measureRichBlock(spans, FONT, FONT, FONT, FONT, 10_000, 20, {
    textAlign: 'left',
    ...(letterSpacingPx !== undefined ? { letterSpacingPx } : {}),
  });
  return block.lines[0]!.segments!.map((s) => [s.text, s.width] as const);
}

describe('tracking (letterSpacingPx) in the rich measurer', () => {
  it('adds the tracking after every character, spaces included', () => {
    expect(widths()).toEqual([['alfa', 28], [' ', 7], ['beta', 28], [' ', 7], ['gamma', 35]]);
    expect(widths(0.5)).toEqual([['alfa', 30], [' ', 7.5], ['beta', 30], [' ', 7.5], ['gamma', 37.5]]);
  });

  it('makes a paragraph wrap earlier, so a nearly full last line gains a line', () => {
    // 15 chars × 7px = 105px: fits a 106px measure untracked, not with tracking.
    const untracked = measureRichBlock(spans, FONT, FONT, FONT, FONT, 106, 20, { textAlign: 'left' });
    const tracked = measureRichBlock(spans, FONT, FONT, FONT, FONT, 106, 20, { textAlign: 'left', letterSpacingPx: 0.16 });
    expect(untracked.lines.length).toBe(1);
    expect(tracked.lines.length).toBe(2);
  });
});
