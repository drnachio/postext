import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../index.js';

// A composed page none of whose frames has a story (a template just
// placed, every frame still empty) lays out as a page of its own.

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
const at = (x: number, y: number) => ({ anchor: { to: 'container' as const, edge: 'top-left' as const }, offset: { x: mm(x), y: mm(y) } });

describe('a composed page with every frame empty', () => {
  it('lays out its page instead of failing on the frames’ box style', () => {
    const doc = buildDocument(
      { markdown: '::::page{template="poster"}\n\n::::' },
      {
        header: { elements: [] },
        footer: { elements: [] },
        pageTemplates: [{
          id: 'poster',
          frames: [
            { name: 'title', width: mm(100), height: mm(30), placement: at(10, 10), optional: true },
            { name: 'text', width: mm(100), height: mm(100), placement: at(10, 50), optional: true },
          ],
        }],
      },
    );
    expect(doc.pages.length).toBe(1);
  });
});
