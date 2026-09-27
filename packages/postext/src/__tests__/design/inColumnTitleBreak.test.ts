import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import type { PostextConfig } from '../../types';
import type { VDTDesignSlot, VDTDesignTextBlock } from '../../vdt';

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
const mm = (value: number) => ({ value, unit: 'mm' as const });

function configFor(span: 'page' | 'column'): PostextConfig {
  return {
    page: { width: mm(150), height: mm(200), margins: { top: mm(15), bottom: mm(15), left: mm(15), right: mm(15) } },
    layout: { layoutType: 'single' },
    headings: {
      levels: [{
        level: 1,
        span,
        breakBefore: { enabled: false, parity: 'any' },
        advancedDesign: {
          enabled: true,
          slot: {
            elements: [{
              kind: 'text', id: 't', content: '{titleText}', fontSize: pt(42), lineHeight: 1, overflow: 'wrap', align: 'left',
              placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: mm(96), height: 'auto' } },
            }],
          },
        },
      }],
    },
  };
}

const titleLines = (slot: VDTDesignSlot | undefined): string[] =>
  (slot?.blocks.find((b): b is VDTDesignTextBlock => b.kind === 'text')?.lines ?? []).map((l) => l.text);

describe('a forced break in a heading design’s {titleText} (EF-152)', () => {
  const markdown = '# Tortilla \\\\ de patatas\n\nBody text.';

  it('keeps the break in a page-span opener', () => {
    const doc = buildDocument({ markdown }, configFor('page'));
    expect(titleLines(doc.pages[0]!.openerBand)).toEqual(['Tortilla', 'de patatas']);
  });

  it('keeps the break in an in-column design too', () => {
    const doc = buildDocument({ markdown }, configFor('column'));
    const heading = doc.pages[0]!.columns[0]!.blocks.find((b) => b.type === 'heading');
    expect(titleLines(heading?.designOverlay)).toEqual(['Tortilla', 'de patatas']);
  });

  it('reserves the height the in-column design paints', () => {
    const doc = buildDocument({ markdown }, configFor('column'));
    const heading = doc.pages[0]!.columns[0]!.blocks.find((b) => b.type === 'heading')!;
    const text = heading.designOverlay!.blocks.find((b): b is VDTDesignTextBlock => b.kind === 'text')!;
    // Two lines of 42 pt at leading 1, all inside the block the heading holds.
    expect(text.lines).toHaveLength(2);
    expect(text.bbox.y + text.bbox.height).toBeLessThanOrEqual(heading.bbox.y + heading.bbox.height + 0.01);
  });
});
