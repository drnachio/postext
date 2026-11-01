import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build.js';
import type { PostextConfig } from '../../types.js';

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

const MATCH = ':::exercise\nMatch them.\n\n- PDF/X -> The printer\n- EPUB -> An e-reader\n:::\n';
const faces = (config: PostextConfig): string[] => {
  const found = new Set<string>();
  JSON.stringify(buildDocument({ markdown: MATCH }, config), (key, value: unknown) => {
    if (key === 'fontString' && typeof value === 'string') found.add(value);
    return value;
  });
  return [...found];
};

describe('the face of a dotted match', () => {
  it('takes grid.fontFamily, else the text\'s', () => {
    expect(faces({ exerciseStyles: [{ id: 'exercise', grid: { fontFamily: 'Card Sans' } }] }).some((f) => f.includes('Card Sans'))).toBe(true);
    expect(faces({}).some((f) => f.includes('Card Sans'))).toBe(false);
  });
});
