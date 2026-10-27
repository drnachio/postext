import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/index.js';
import { createMeasurementCache } from '../../../measure/index.js';

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

const mm = (value: number) => ({ value, unit: 'mm' as const });

describe('a page whose content area is shorter than a line (#1222)', () => {
  // 40 mm high with the default 2 cm margins: no room at all; 45 mm: 5 mm.
  it.each([40, 45])('sets every block at %i mm, in order, instead of looking for room forever', (height) => {
    const md = 'Lorem ipsum dolor sit amet.\n\n# Title\n\n## Sub\n\nLorem ipsum\n';
    const doc = buildDocument({ markdown: md }, { page: { height: mm(height) } }, createMeasurementCache());
    const placed = doc.blocks.filter((b) => b.type === 'paragraph' || b.type === 'heading');
    expect(placed.map((b) => b.lines.map((l) => l.text).join(' '))).toEqual(['Lorem ipsum dolor sit amet.', 'Title', 'Sub', 'Lorem ipsum']);
    const pages = placed.map((b) => b.pageIndex);
    expect(pages).toEqual([...pages].sort((a, b) => a - b));
    expect(doc.pages.length).toBeGreaterThan(1);
  });
});
